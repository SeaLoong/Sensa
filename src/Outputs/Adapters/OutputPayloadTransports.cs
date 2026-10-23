using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Net.WebSockets;

namespace Sensa.Outputs.Adapters;

/// <summary>One connection serializes writes; queueing and reconnect policy remain in the coordinator.</summary>
public abstract class SerializedOutputPayloadTransport : IOutputPayloadTransport
{
    public const int MaximumPayloadBytes = 65536;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly CancellationTokenSource _lifetime = new();
    private readonly TimeSpan _timeout;
    private int _disposed;
    protected volatile bool Connected;
    public bool IsConnected => Connected && Volatile.Read(ref _disposed) == 0;

    protected SerializedOutputPayloadTransport(TimeSpan? timeout = null)
    {
        _timeout = timeout ?? TimeSpan.FromSeconds(3);
        if (_timeout <= TimeSpan.Zero || _timeout > TimeSpan.FromSeconds(3))
            throw new ArgumentOutOfRangeException(nameof(timeout), "Use an output timeout between zero and three seconds.");
    }

    protected CancellationTokenSource Deadline(CancellationToken cancellationToken)
    {
        var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _lifetime.Token);
        linked.CancelAfter(_timeout);
        return linked;
    }

    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        using var timeout = Deadline(cancellationToken);
        await _gate.WaitAsync(timeout.Token).ConfigureAwait(false);
        try
        {
            ObjectDisposedException.ThrowIf(Volatile.Read(ref _disposed) != 0, this);
            if (Connected) return;
            AbortCore();
            await ConnectCoreAsync(timeout.Token).ConfigureAwait(false);
            Connected = true;
            OnConnected();
        }
        catch { Connected = false; AbortCore(); throw; }
        finally { _gate.Release(); }
    }

    public async ValueTask SendAsync(OutputPayload payload, CancellationToken cancellationToken = default)
    {
        if (payload.Data.Length > MaximumPayloadBytes) throw new ArgumentException("Output payload exceeds 64 KiB.");
        using var timeout = Deadline(cancellationToken);
        await _gate.WaitAsync(timeout.Token).ConfigureAwait(false);
        try
        {
            ObjectDisposedException.ThrowIf(Volatile.Read(ref _disposed) != 0, this);
            if (!Connected) throw new InvalidOperationException("Connect the output before sending.");
            await SendCoreAsync(payload, timeout.Token).ConfigureAwait(false);
        }
        catch { Connected = false; AbortCore(); throw; }
        finally { _gate.Release(); }
    }

    public async ValueTask FlushAsync(CancellationToken cancellationToken = default)
    {
        using var timeout = Deadline(cancellationToken);
        await _gate.WaitAsync(timeout.Token).ConfigureAwait(false);
        _gate.Release();
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        Connected = false;
        _lifetime.Cancel();
        AbortCore();
        await DisposeBackgroundAsync().ConfigureAwait(false);
        _lifetime.Dispose();
    }

    protected abstract Task ConnectCoreAsync(CancellationToken cancellationToken);
    protected abstract ValueTask SendCoreAsync(OutputPayload payload, CancellationToken cancellationToken);
    protected abstract void AbortCore();
    protected virtual void OnConnected() { }
    protected virtual ValueTask DisposeBackgroundAsync() => ValueTask.CompletedTask;

    protected internal static Uri ValidateAddress(Uri address, params string[] schemes)
    {
        ArgumentNullException.ThrowIfNull(address);
        if (!address.IsAbsoluteUri || !schemes.Contains(address.Scheme, StringComparer.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(address.Host) || !string.IsNullOrEmpty(address.UserInfo)
            || !string.IsNullOrEmpty(address.Fragment))
            throw new ArgumentException("Choose a supported absolute output URL without embedded credentials or a fragment.");
        return address;
    }

    internal static void ValidateHost(string host, int port)
    {
        if (string.IsNullOrWhiteSpace(host) || host.Length > 253 || host.Any(char.IsControl)
            || host.Any(char.IsWhiteSpace) || host.Contains('/') || port is < 1 or > 65535)
            throw new ArgumentException("Choose a valid output host and port.");
    }
}

public sealed class UdpOutputTransport : SerializedOutputPayloadTransport
{
    private readonly string _host;
    private readonly int _port;
    private UdpClient? _client;
    private IPEndPoint? _target;

    public UdpOutputTransport(string host, int port, TimeSpan? timeout = null) : base(timeout)
    {
        ValidateHost(host, port); _host = host; _port = port;
    }

    protected override async Task ConnectCoreAsync(CancellationToken cancellationToken)
    {
        var addresses = await Dns.GetHostAddressesAsync(_host, cancellationToken).ConfigureAwait(false);
        var address = addresses.FirstOrDefault(a => a.AddressFamily is AddressFamily.InterNetwork or AddressFamily.InterNetworkV6)
            ?? throw new InvalidOperationException("The output host has no IP address.");
        if (address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any))
            throw new ArgumentException("Choose a destination address rather than an unspecified listener address.");
        _client = new UdpClient(address.AddressFamily);
        _target = new(address, _port);
    }

    protected override async ValueTask SendCoreAsync(OutputPayload payload, CancellationToken cancellationToken)
    {
        var client = _client ?? throw new InvalidOperationException("The UDP output is disconnected.");
        await client.SendAsync(payload.Data, _target, cancellationToken).ConfigureAwait(false);
    }

    protected override void AbortCore()
    {
        _client?.Dispose(); _client = null; _target = null;
    }
}

public sealed class HttpJsonOutputTransport : SerializedOutputPayloadTransport
{
    // Shared backend pool: outputs reuse TCP/TLS connections without occupying browser connections.
    private static readonly HttpClient SharedClient = new(new SocketsHttpHandler
    {
        AllowAutoRedirect = false, PooledConnectionLifetime = TimeSpan.FromMinutes(5),
        MaxConnectionsPerServer = 8,
    }) { Timeout = Timeout.InfiniteTimeSpan };
    private readonly Uri _address;
    private readonly HttpClient _client;

    public HttpJsonOutputTransport(Uri address, HttpClient? client = null, TimeSpan? timeout = null) : base(timeout)
    {
        _address = ValidateAddress(address, "http", "https"); _client = client ?? SharedClient;
    }

    protected override Task ConnectCoreAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    protected override async ValueTask SendCoreAsync(OutputPayload payload, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, _address)
        {
            Content = new ReadOnlyMemoryContent(payload.Data),
        };
        request.Content.Headers.ContentType = new MediaTypeHeaderValue(payload.ContentType);
        using var response = await _client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
    }

    protected override void AbortCore() { }
}

public sealed class WebSocketOutputTransport : SerializedOutputPayloadTransport
{
    private readonly Uri _address;
    private ClientWebSocket? _socket;
    private CancellationTokenSource? _receiveCancellation;
    private Task? _receiver;

    public WebSocketOutputTransport(Uri address, TimeSpan? timeout = null) : base(timeout) =>
        _address = ValidateAddress(address, "ws", "wss");

    protected override async Task ConnectCoreAsync(CancellationToken cancellationToken)
    {
        var peer = new ClientWebSocket();
        _socket = peer;
        peer.Options.KeepAliveInterval = TimeSpan.FromSeconds(15);
        peer.Options.KeepAliveTimeout = TimeSpan.FromSeconds(15);
        await peer.ConnectAsync(_address, cancellationToken).ConfigureAwait(false);
    }

    protected override void OnConnected()
    {
        var peer = _socket!;
        _receiveCancellation = new();
        _receiver = ReceiveAsync(peer, _receiveCancellation.Token);
    }

    private async Task ReceiveAsync(ClientWebSocket peer, CancellationToken cancellationToken)
    {
        var buffer = new byte[4096];
        try
        {
            while (!cancellationToken.IsCancellationRequested && peer.State == WebSocketState.Open)
            {
                var bytes = 0;
                ValueWebSocketReceiveResult received;
                do
                {
                    received = await peer.ReceiveAsync(buffer.AsMemory(), cancellationToken).ConfigureAwait(false);
                    if (received.MessageType == WebSocketMessageType.Close) return;
                    bytes += received.Count;
                    if (bytes > MaximumPayloadBytes) throw new InvalidDataException("The output peer's message exceeds 64 KiB.");
                } while (!received.EndOfMessage);
            }
        }
        catch (Exception ex) when (ex is OperationCanceledException or WebSocketException or IOException or ObjectDisposedException) { }
        finally
        {
            if (ReferenceEquals(_socket, peer)) { Connected = false; peer.Abort(); }
        }
    }

    protected override async ValueTask SendCoreAsync(OutputPayload payload, CancellationToken cancellationToken)
    {
        var peer = _socket ?? throw new InvalidOperationException("The WebSocket output is disconnected.");
        await peer.SendAsync(payload.Data, WebSocketMessageType.Text, true, cancellationToken).ConfigureAwait(false);
    }

    protected override void AbortCore()
    {
        _receiveCancellation?.Cancel();
        _socket?.Abort(); _socket?.Dispose(); _socket = null;
        _receiveCancellation?.Dispose(); _receiveCancellation = null;
    }

    protected override async ValueTask DisposeBackgroundAsync()
    {
        if (_receiver is not null) try { await _receiver.WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false); } catch (Exception) { }
    }
}
