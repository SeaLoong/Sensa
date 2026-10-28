using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace Sensa.Input.Protocols;

/// <summary>
/// A virtual TCode device connected to Intiface's WebSocket Device Manager (not its application port).
/// The registration is text JSON; subsequent hardware traffic and replies are binary TCode bytes.
/// https://buttplug.io/docs/dev-guide/inflating-buttplug/devices/websocket-device-manager/
/// </summary>
public sealed class IntifaceDeviceInput : IAsyncDisposable
{
    private readonly ProtocolInputConfig _config;
    private readonly IExternalControlSink _sink;
    private readonly ClientWebSocket _socket = new();
    private readonly TCodeLineFramer _framer = new();
    private CancellationTokenSource? _shutdown;
    private TCodeInputSession? _session;
    private Task? _receive, _heartbeat;
    private bool _disposed;
    public bool IsConnected => !_disposed && _socket.State == WebSocketState.Open;
    public string? LastError { get; private set; }
    public void ResetCommands() { _framer.Reset(); _session?.ResetCommands(); }

    public IntifaceDeviceInput(ProtocolInputConfig config, IExternalControlSink sink) { _config = config; _sink = sink; }

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (_shutdown is not null) throw new InvalidOperationException("Intiface device input has already started.");
        if (!Uri.TryCreate(_config.Address, UriKind.Absolute, out var address) || address.Scheme is not ("ws" or "wss")
            || !string.IsNullOrEmpty(address.UserInfo) || !string.IsNullOrEmpty(address.Fragment))
            throw new ArgumentException("Configure an Intiface WebSocket device endpoint without embedded credentials.");
        _shutdown = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var timeoutMs = Math.Max(100, _config.TimeoutMs);
        _socket.Options.KeepAliveInterval = TimeSpan.FromMilliseconds(Math.Max(100, timeoutMs / 3));
        _socket.Options.KeepAliveTimeout = TimeSpan.FromMilliseconds(timeoutMs);
        _session = new(_config, _sink, "intiface-device:" + Guid.NewGuid().ToString("N"));
        try
        {
            if (!_session.TryAcquire(out var error)) throw new InvalidOperationException(error);
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(_shutdown.Token);
            deadline.CancelAfter(TimeSpan.FromSeconds(10));
            await _socket.ConnectAsync(address, deadline.Token);
            var registration = JsonSerializer.SerializeToUtf8Bytes(new
            {
                identifier = string.IsNullOrWhiteSpace(_config.Identifier) ? _config.Name : _config.Identifier,
                address = _config.Id,
                version = 0,
            });
            await _socket.SendAsync(registration, WebSocketMessageType.Text, true, deadline.Token);
            _receive = ReceiveAsync(_shutdown.Token);
            _heartbeat = KeepSessionAliveAsync(_shutdown.Token);
        }
        catch { await DisposeAsync(); throw; }
    }

    private async Task ReceiveAsync(CancellationToken cancellation)
    {
        var framer = _framer;
        var buffer = new byte[2048];
        long? pendingSince = null;
        try
        {
            while (!cancellation.IsCancellationRequested && _socket.State == WebSocketState.Open)
            {
                using var message = new MemoryStream();
                long? epoch = null;
                long? fragmentSince = null;
                ValueWebSocketReceiveResult result;
                do
                {
                    using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
                    var started = pendingSince is { } pending && fragmentSince is { } fragment ? Math.Min(pending, fragment)
                        : pendingSince ?? fragmentSince;
                    if (started is { } at)
                    {
                        var remaining = TimeSpan.FromMilliseconds(Math.Max(100, _config.TimeoutMs)) - TimeProvider.System.GetElapsedTime(at);
                        if (remaining <= TimeSpan.Zero) throw new InvalidDataException("Incomplete TCode hardware frame expired.");
                        deadline.CancelAfter(remaining);
                    }
                    result = await _socket.ReceiveAsync(buffer.AsMemory(), deadline.Token);
                    epoch ??= _session!.Epoch;
                    if (result.MessageType == WebSocketMessageType.Close) return;
                    if (result.MessageType != WebSocketMessageType.Binary)
                        throw new InvalidDataException("The Intiface device channel requires binary hardware frames.");
                    if (message.Length + result.Count > TCodeProtocol.MaximumLineBytes)
                        throw new InvalidDataException("Intiface device hardware frame exceeds the TCode input limit.");
                    message.Write(buffer, 0, result.Count);
                    if (!result.EndOfMessage) fragmentSince ??= TimeProvider.System.GetTimestamp();
                } while (!result.EndOfMessage);

                IReadOnlyList<string> lines;
                try { lines = framer.Push(message.GetBuffer().AsSpan(0, (int)message.Length)); }
                catch (FormatException)
                {
                    _session!.Stop();
                    await SendReplyAsync("ERR invalid TCode frame\n", cancellation);
                    continue;
                }
                pendingSince = framer.PendingBytes == 0 ? null
                    : lines.Count > 0 ? TimeProvider.System.GetTimestamp() : pendingSince ?? TimeProvider.System.GetTimestamp();
                foreach (var line in lines)
                {
                    var response = _session!.ProcessLine(line, epoch);
                    if (response.Length > 0) await SendReplyAsync(response, cancellation);
                }
            }
        }
        catch (Exception exception) when (exception is OperationCanceledException or WebSocketException or ObjectDisposedException or IOException or InvalidDataException)
        {
            if (!cancellation.IsCancellationRequested) LastError = exception.GetType().Name;
        }
        finally
        {
            _socket.Abort();
            _session?.Dispose();
            _shutdown?.Cancel();
        }
    }

    private async Task SendReplyAsync(string response, CancellationToken cancellation)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(TimeSpan.FromSeconds(1));
        await _socket.SendAsync(Encoding.ASCII.GetBytes(response), WebSocketMessageType.Binary, true, deadline.Token);
    }

    private async Task KeepSessionAliveAsync(CancellationToken cancellation)
    {
        // WSDM has no application heartbeat. Native WebSocket PING/PONG detects a dead Central;
        // a live connection can legitimately hold a target without repeatedly sending TCode.
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(Math.Max(50, Math.Min(1000, _config.TimeoutMs / 3))));
        try
        {
            while (await timer.WaitForNextTickAsync(cancellation))
                if (_socket.State == WebSocketState.Open) _session?.Heartbeat(); else break;
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return; _disposed = true;
        _shutdown?.Cancel();
        _session?.Dispose();
        if (_socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
        {
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(1));
            try { await _socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "Input stopped", deadline.Token); }
            catch (Exception exception) when (exception is OperationCanceledException or WebSocketException or ObjectDisposedException) { }
        }
        _socket.Abort();
        var tasks = new[] { _receive, _heartbeat }.OfType<Task>().ToArray();
        try { await Task.WhenAll(tasks).WaitAsync(TimeSpan.FromSeconds(2)); }
        catch (Exception exception) when (exception is OperationCanceledException or WebSocketException or ObjectDisposedException or TimeoutException) { }
        _socket.Dispose(); _shutdown?.Dispose();
    }
}
