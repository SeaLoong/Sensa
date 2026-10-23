using System.Buffers.Binary;
using System.Net.Security;
using System.Net.Sockets;
using System.Text;

namespace Sensa.Outputs.Adapters;

public sealed class MqttOutputOptions
{
    public string Host { get; set; } = "127.0.0.1";
    public int Port { get; set; } = 1883;
    public bool UseTls { get; set; }
    public string ClientId { get; set; } = "Sensa-" + Guid.NewGuid().ToString("N")[..16];
    public string? Username { get; set; }
    public string? Password { get; set; }
    public int KeepAliveSeconds { get; set; } = 30;
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(3);
}

/// <summary>MQTT 3.1.1, clean-session QoS 0, non-retained publications; no reconnect or offline replay.</summary>
public sealed class MqttOutputTransport : SerializedOutputPayloadTransport
{
    private readonly MqttOutputOptions _options;
    private readonly TimeProvider _clock;
    private readonly SemaphoreSlim _wire = new(1, 1);
    private TcpClient? _client;
    private Stream? _stream;
    private CancellationTokenSource? _backgroundCancellation;
    private Task? _receiver, _heartbeat;
    private int _awaitingPing;

    public MqttOutputTransport(MqttOutputOptions options, TimeProvider? timeProvider = null) : base(options?.Timeout)
    {
        ArgumentNullException.ThrowIfNull(options);
        _clock = timeProvider ?? TimeProvider.System;
        ValidateHost(options.Host, options.Port);
        if (options.KeepAliveSeconds is < 10 or > 300)
            throw new ArgumentException("MQTT keepalive must be between 10 and 300 seconds.");
        // Validate before connecting, and keep a private snapshot of mutable configuration.
        MqttOutputCodec.Connect(options);
        _options = new()
        {
            Host = options.Host, Port = options.Port, UseTls = options.UseTls, ClientId = options.ClientId,
            Username = options.Username, Password = options.Password, KeepAliveSeconds = options.KeepAliveSeconds,
            Timeout = options.Timeout,
        };
    }

    protected override async Task ConnectCoreAsync(CancellationToken cancellationToken)
    {
        var client = new TcpClient { NoDelay = true };
        _client = client;
        await client.ConnectAsync(_options.Host, _options.Port, cancellationToken).ConfigureAwait(false);
        Stream stream = client.GetStream();
        if (_options.UseTls)
        {
            var secure = new SslStream(stream, leaveInnerStreamOpen: false);
            _stream = secure;
            await secure.AuthenticateAsClientAsync(new SslClientAuthenticationOptions { TargetHost = _options.Host }, cancellationToken).ConfigureAwait(false);
            stream = secure;
        }
        _stream = stream;
        await stream.WriteAsync(MqttOutputCodec.Connect(_options), cancellationToken).ConfigureAwait(false);
        var acknowledgement = await ReadPacketAsync(stream, cancellationToken).ConfigureAwait(false);
        if (acknowledgement.Header != 0x20 || acknowledgement.Data.Length != 2
            || acknowledgement.Data[0] != 0 || acknowledgement.Data[1] != 0)
            throw new IOException("The MQTT broker did not accept the clean session.");
    }

    protected override void OnConnected()
    {
        var stream = _stream!;
        _awaitingPing = 0;
        _backgroundCancellation = new();
        _receiver = ReceiveAsync(stream, _backgroundCancellation.Token);
        _heartbeat = HeartbeatAsync(stream, _backgroundCancellation.Token);
    }

    protected override ValueTask SendCoreAsync(OutputPayload payload, CancellationToken cancellationToken) =>
        WriteAsync(_stream ?? throw new InvalidOperationException("The MQTT output is disconnected."),
            MqttOutputCodec.Publish(payload.Address, payload.Data.Span), cancellationToken);

    private async ValueTask WriteAsync(Stream stream, ReadOnlyMemory<byte> packet, CancellationToken cancellationToken)
    {
        await _wire.WaitAsync(cancellationToken).ConfigureAwait(false);
        try { await stream.WriteAsync(packet, cancellationToken).ConfigureAwait(false); }
        finally { _wire.Release(); }
    }

    private async Task ReceiveAsync(Stream stream, CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                var packet = await ReadPacketAsync(stream, cancellationToken).ConfigureAwait(false);
                if (packet.Header != 0xD0 || packet.Data.Length != 0)
                    throw new IOException("The MQTT publisher received an unexpected control packet.");
                Interlocked.Exchange(ref _awaitingPing, 0);
            }
        }
        catch (Exception ex) when (ex is IOException or OperationCanceledException or ObjectDisposedException) { }
        finally { ConnectionEnded(stream); }
    }

    private async Task HeartbeatAsync(Stream stream, CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_options.KeepAliveSeconds / 2d), _clock);
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false))
            {
                if (Interlocked.Exchange(ref _awaitingPing, 1) != 0)
                    throw new IOException("The MQTT broker did not answer the keepalive.");
                using var timeout = Deadline(cancellationToken);
                await WriteAsync(stream, new byte[] { 0xC0, 0 }, timeout.Token).ConfigureAwait(false);
            }
        }
        catch (Exception ex) when (ex is IOException or OperationCanceledException or ObjectDisposedException) { }
        finally { ConnectionEnded(stream); }
    }

    private void ConnectionEnded(Stream stream)
    {
        if (!ReferenceEquals(_stream, stream)) return;
        Connected = false;
        _backgroundCancellation?.Cancel();
        _client?.Dispose();
    }

    private static async Task<(byte Header, byte[] Data)> ReadPacketAsync(Stream stream, CancellationToken cancellationToken)
    {
        var one = new byte[1];
        await stream.ReadExactlyAsync(one, cancellationToken).ConfigureAwait(false);
        var header = one[0];
        var length = 0; var multiplier = 1;
        for (var index = 0; index < 4; index++)
        {
            await stream.ReadExactlyAsync(one, cancellationToken).ConfigureAwait(false);
            length += (one[0] & 0x7f) * multiplier;
            if (length > MaximumPayloadBytes) throw new InvalidDataException("The MQTT control packet exceeds 64 KiB.");
            if ((one[0] & 0x80) == 0)
            {
                var body = new byte[length];
                await stream.ReadExactlyAsync(body, cancellationToken).ConfigureAwait(false);
                return (header, body);
            }
            multiplier *= 128;
        }
        throw new InvalidDataException("The MQTT packet has an invalid length.");
    }

    protected override void AbortCore()
    {
        _backgroundCancellation?.Cancel();
        _client?.Dispose(); _client = null;
        _stream?.Dispose(); _stream = null;
        _backgroundCancellation?.Dispose(); _backgroundCancellation = null;
    }

    protected override async ValueTask DisposeBackgroundAsync()
    {
        try { await Task.WhenAll(_receiver ?? Task.CompletedTask, _heartbeat ?? Task.CompletedTask).WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false); }
        catch (Exception) { }
    }
}

public static class MqttOutputCodec
{
    public static byte[] Connect(MqttOutputOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (string.IsNullOrEmpty(options.ClientId) || options.ClientId.Length > 128 || options.KeepAliveSeconds is < 10 or > 300
            || options.Username?.Length > 1024 || options.Password?.Length > 1024
            || options.Password is not null && options.Username is null)
            throw new ArgumentException("Check the MQTT client ID, credentials and keepalive settings.");
        using var body = new MemoryStream();
        WriteString(body, "MQTT"); body.WriteByte(4);
        var flags = 2; // Clean session, no will or retained old action.
        if (options.Username is not null) flags |= 0x80;
        if (options.Password is not null) flags |= 0x40;
        body.WriteByte((byte)flags);
        WriteShort(body, (ushort)options.KeepAliveSeconds);
        WriteString(body, options.ClientId);
        if (options.Username is not null) WriteString(body, options.Username);
        if (options.Password is not null) WriteString(body, options.Password);
        return Packet(0x10, body.ToArray());
    }

    public static byte[] Publish(string topic, ReadOnlySpan<byte> payload)
    {
        if (string.IsNullOrWhiteSpace(topic) || topic.Length > 512 || topic.IndexOfAny(['#', '+', '\0']) >= 0
            || topic.Any(char.IsControl))
            throw new ArgumentException("Choose a concrete MQTT topic without wildcard characters.");
        if (payload.Length > SerializedOutputPayloadTransport.MaximumPayloadBytes)
            throw new ArgumentException("Output payload exceeds 64 KiB.");
        using var body = new MemoryStream();
        WriteString(body, topic); body.Write(payload);
        // QoS 0 / retain=false: no packet IDs, offline queue, acknowledgements or replay.
        return Packet(0x30, body.ToArray());
    }

    private static byte[] Packet(byte header, byte[] body)
    {
        using var packet = new MemoryStream(); packet.WriteByte(header);
        var remaining = body.Length;
        do
        {
            var digit = (byte)(remaining % 128); remaining /= 128;
            if (remaining > 0) digit |= 0x80;
            packet.WriteByte(digit);
        } while (remaining > 0);
        packet.Write(body); return packet.ToArray();
    }

    private static void WriteString(Stream stream, string text)
    {
        if (text.Contains('\0')) throw new ArgumentException("MQTT text must not contain null characters.");
        var bytes = Encoding.UTF8.GetBytes(text);
        if (bytes.Length > ushort.MaxValue) throw new ArgumentException("MQTT text exceeds the encoded length limit.");
        WriteShort(stream, (ushort)bytes.Length); stream.Write(bytes);
    }

    private static void WriteShort(Stream stream, ushort value)
    {
        Span<byte> bytes = stackalloc byte[2]; BinaryPrimitives.WriteUInt16BigEndian(bytes, value); stream.Write(bytes);
    }
}
