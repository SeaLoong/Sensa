using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;

namespace Sensa.Tests.Support;

/// <summary>Loopback-only Buttplug v4 peer / 仅回环的 Buttplug v4 模拟端，不启动引擎或 Sensa 进程。</summary>
internal sealed class IntifaceMockServer : IAsyncDisposable
{
    private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource _shutdown = new();
    private readonly Channel<JsonElement> _commands = Channel.CreateUnbounded<JsonElement>();
    private readonly ConcurrentQueue<JsonElement> _received = new();
    private readonly bool _withPosition;
    private readonly Task _serve;
    private TcpClient? _peer;
    private WebSocket? _socket;
    private int _connectionCount;
    private int _transportDisconnectCount;

    public string Address { get; }
    public int ConnectionCount => Volatile.Read(ref _connectionCount);
    public int TransportDisconnectCount => Volatile.Read(ref _transportDisconnectCount);
    public IReadOnlyList<JsonElement> Commands => _received.ToArray();

    public IntifaceMockServer(bool withPosition)
    {
        _withPosition = withPosition;
        _listener.Start();
        Address = $"ws://127.0.0.1:{((IPEndPoint)_listener.LocalEndpoint).Port}";
        _serve = ServeAsync();
    }

    public async Task<JsonElement> NextCommandAsync(Func<JsonElement, bool> matches)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        while (true)
        {
            var command = await _commands.Reader.ReadAsync(deadline.Token);
            if (matches(command)) return command;
        }
    }

    private async Task ServeAsync()
    {
        try
        {
            while (!_shutdown.IsCancellationRequested)
            {
                using var peer = await _listener.AcceptTcpClientAsync(_shutdown.Token);
                _peer = peer;
                try { await ServeConnectionAsync(peer); }
                catch (Exception error) when (!_shutdown.IsCancellationRequested
                    && (error is WebSocketException or SocketException || error is IOException && error is not InvalidDataException))
                {
                    // A closed transport ends one session, not the listening peer.
                    // 传输中止只结束该会话；监听继续，协议／JSON错误仍向外失败。
                    Interlocked.Increment(ref _transportDisconnectCount);
                }
                finally { _socket = null; }
            }
        }
        catch (OperationCanceledException) when (_shutdown.IsCancellationRequested) { }
        catch (Exception error)
        {
            _commands.Writer.TryComplete(error);
            throw;
        }
    }

    private async Task ServeConnectionAsync(TcpClient peer)
    {
        var stream = peer.GetStream();
        using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
        string? key = null;
        while (await reader.ReadLineAsync(_shutdown.Token) is { Length: > 0 } line)
            if (line.StartsWith("Sec-WebSocket-Key:", StringComparison.OrdinalIgnoreCase))
                key = line.Split(':', 2)[1].Trim();
        if (key is null) throw new InvalidDataException("Missing mock WebSocket upgrade key / 模拟握手缺少 key");
        var accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
        await stream.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n"), _shutdown.Token);
        using var socket = WebSocket.CreateFromStream(stream, isServer: true, subProtocol: null, keepAliveInterval: Timeout.InfiniteTimeSpan);
        _socket = socket;
        Interlocked.Increment(ref _connectionCount);
        var buffer = new byte[8192];
        while (!_shutdown.IsCancellationRequested && socket.State == WebSocketState.Open)
        {
            using var message = new MemoryStream();
            ValueWebSocketReceiveResult part;
            do
            {
                part = await socket.ReceiveAsync(buffer.AsMemory(), _shutdown.Token);
                if (part.MessageType == WebSocketMessageType.Close)
                {
                    await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", _shutdown.Token);
                    return;
                }
                message.Write(buffer, 0, part.Count);
            } while (!part.EndOfMessage);
            using var document = JsonDocument.Parse(message.ToArray());
            foreach (var command in document.RootElement.EnumerateArray())
            {
                var entry = command.EnumerateObject().Single();
                var body = entry.Value;
                var id = body.GetProperty("Id").GetUInt32();
                object response;
                if (entry.Name == "RequestServerInfo")
                    response = new { ServerInfo = new { Id = id, ServerName = "Isolated Intiface mock", ProtocolVersionMajor = body.GetProperty("ProtocolVersionMajor").GetInt32(), ProtocolVersionMinor = body.GetProperty("ProtocolVersionMinor").GetInt32(), MaxPingTime = 0 } };
                else if (entry.Name == "RequestDeviceList")
                {
                    var features = new Dictionary<string, object>();
                    if (_withPosition)
                        features["0"] = new { FeatureIndex = 0, FeatureDescription = "Position", Output = new { HwPositionWithDuration = new { Value = new[] { 0, 1000 }, Duration = new[] { 0, 60000 } } } };
                    var vibrationIndex = _withPosition ? 1 : 0;
                    features[vibrationIndex.ToString()] = new { FeatureIndex = vibrationIndex, FeatureDescription = "Vibration", Output = new { Vibrate = new { Value = new[] { 0, 1000 } } } };
                    response = new { DeviceList = new { Id = id, Devices = new Dictionary<string, object> { ["0"] = new { DeviceName = "Isolated mock device", DeviceIndex = 0, DeviceMessageTimingGap = 0, DeviceFeatures = features } } } };
                }
                else if (entry.Name is "OutputCmd" or "StopCmd")
                {
                    var captured = command.Clone();
                    _received.Enqueue(captured);
                    _commands.Writer.TryWrite(captured);
                    response = new { Ok = new { Id = id } };
                }
                else if (entry.Name is "StartScanning" or "StopScanning" or "Ping")
                    response = new { Ok = new { Id = id } };
                else
                    throw new InvalidDataException("Unexpected mock protocol message / 未预期的模拟协议消息: " + entry.Name);
                await socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(new[] { response }).AsMemory(), WebSocketMessageType.Text, true, _shutdown.Token);
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        _shutdown.Cancel();
        _listener.Stop();
        _socket?.Abort();
        _peer?.Dispose();
        try { await _serve; }
        catch (Exception error) when (error is OperationCanceledException or SocketException or WebSocketException or ObjectDisposedException or IOException) { }
        _socket?.Dispose();
        _shutdown.Dispose();
    }
}
