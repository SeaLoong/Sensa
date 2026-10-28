using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Sensa.Input.Protocols;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Tests use an isolated WSDM peer; Intiface Central and physical devices are never started.</summary>
public sealed class IntifaceDeviceInputContracts
{
    [Fact]
    public async Task Registration_is_text_and_hardware_commands_and_query_replies_are_binary()
    {
        await using var peer = new DeviceManagerPeer();
        var config = TCodeInputContracts.Config("IntifaceDevice"); config.Address = peer.Address; config.Identifier = "Sensa TCode";
        var sink = new TCodeTestSink();
        await using var input = new IntifaceDeviceInput(config, sink);
        await input.StartAsync();
        var registration = await peer.Registration.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(WebSocketMessageType.Text, registration.Type);
        using var document = JsonDocument.Parse(registration.Text);
        Assert.Equal("Sensa TCode", document.RootElement.GetProperty("identifier").GetString());
        Assert.Equal(config.Id, document.RootElement.GetProperty("address").GetString());
        Assert.Equal(0, document.RootElement.GetProperty("version").GetInt32());
        Assert.Equal(0, sink.BatchCount);

        await peer.SendAsync("D0\nD1\nD2\n");
        var identity = await peer.NextReplyAsync(); Assert.Equal(WebSocketMessageType.Binary, identity.Type); Assert.Contains("Sensa", identity.Text);
        Assert.Equal("TCode v0.3\n", (await peer.NextReplyAsync()).Text);
        Assert.Contains("L0 0 9999", (await peer.NextReplyAsync()).Text);
        await peer.SendAsync("L077I", end: false);
        await peer.SendAsync("200 R025I400\n", end: true);
        var commands = await sink.NextAsync();
        Assert.Collection(commands,
            command => { Assert.Equal(.77, command.Value, 10); Assert.Equal(200, command.DurationMs); },
            command => { Assert.Equal(.25, command.Value, 10); Assert.Equal(400, command.DurationMs); });
        await peer.SendAsync("DSTOP\nD1\n");
        Assert.Equal("TCode v0.3\n", (await peer.NextReplyAsync()).Text);
        Assert.True(sink.StopCount > 0);
        await input.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(sink.Released.Task.IsCompleted); Assert.False(input.IsConnected);
    }

    [Fact]
    public async Task A_text_hardware_frame_is_rejected_and_releases_all_motion()
    {
        await using var peer = new DeviceManagerPeer();
        var config = TCodeInputContracts.Config("IntifaceDevice"); config.Address = peer.Address;
        var sink = new TCodeTestSink();
        await using var input = new IntifaceDeviceInput(config, sink);
        await input.StartAsync(); await peer.Registration.Task.WaitAsync(TimeSpan.FromSeconds(3));
        await peer.SendAsync("L05\n"); await sink.NextAsync();
        await peer.SendAsync("L0999\n", WebSocketMessageType.Text);
        await sink.Released.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(1, sink.BatchCount); Assert.True(sink.StopCount > 0); Assert.False(input.IsConnected);
        Assert.Equal("InvalidDataException", input.LastError);
    }

    [Fact]
    public async Task An_incomplete_hardware_line_has_a_deadline_even_while_websocket_pongs_continue()
    {
        await using var peer = new DeviceManagerPeer();
        var config = TCodeInputContracts.Config("IntifaceDevice"); config.Address = peer.Address; config.TimeoutMs = 150;
        var sink = new TCodeTestSink();
        await using var input = new IntifaceDeviceInput(config, sink);
        await input.StartAsync(); await peer.Registration.Task.WaitAsync(TimeSpan.FromSeconds(3));
        await peer.SendAsync("L05I");
        await sink.Released.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(0, sink.BatchCount); Assert.True(sink.StopCount > 0);
    }

    [Fact]
    public async Task A_busy_input_never_registers_a_second_virtual_device()
    {
        await using var peer = new DeviceManagerPeer();
        var config = TCodeInputContracts.Config("IntifaceDevice"); config.Address = peer.Address;
        var sink = new TCodeTestSink(); Assert.True(sink.TryAcquire(config.Id, "existing", out _));
        await using var input = new IntifaceDeviceInput(config, sink);
        await Assert.ThrowsAsync<InvalidOperationException>(() => input.StartAsync());
        Assert.False(peer.Registration.Task.IsCompleted); Assert.False(input.IsConnected);
        Assert.False(sink.Released.Task.IsCompleted);
    }

    private sealed record Frame(WebSocketMessageType Type, string Text);
    private sealed class DeviceManagerPeer : IAsyncDisposable
    {
        private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
        private readonly CancellationTokenSource _shutdown = new();
        private readonly TaskCompletionSource<WebSocket> _connected = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly Channel<Frame> _replies = Channel.CreateUnbounded<Frame>();
        private readonly Task _worker;
        public string Address { get; }
        public TaskCompletionSource<Frame> Registration { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public DeviceManagerPeer()
        {
            _listener.Start(); Address = "ws://127.0.0.1:" + ((IPEndPoint)_listener.LocalEndpoint).Port;
            _worker = ServeAsync();
        }
        public async Task SendAsync(string content, WebSocketMessageType type = WebSocketMessageType.Binary, bool end = true)
        {
            var socket = await _connected.Task.WaitAsync(TimeSpan.FromSeconds(3));
            await socket.SendAsync(Encoding.ASCII.GetBytes(content), type, end, _shutdown.Token);
        }
        public Task<Frame> NextReplyAsync() => _replies.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
        private async Task ServeAsync()
        {
            try
            {
                using var client = await _listener.AcceptTcpClientAsync(_shutdown.Token);
                var stream = client.GetStream();
                using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
                string? key = null;
                while (await reader.ReadLineAsync(_shutdown.Token) is { Length: > 0 } line)
                    if (line.StartsWith("Sec-WebSocket-Key:", StringComparison.OrdinalIgnoreCase)) key = line.Split(':', 2)[1].Trim();
                if (key is null) throw new InvalidDataException("Missing isolated WebSocket handshake.");
                var accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
                await stream.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n"), _shutdown.Token);
                using var socket = WebSocket.CreateFromStream(stream, isServer: true, subProtocol: null, keepAliveInterval: Timeout.InfiniteTimeSpan);
                _connected.TrySetResult(socket);
                var first = true; var buffer = new byte[8192];
                while (!_shutdown.IsCancellationRequested)
                {
                    using var message = new MemoryStream();
                    ValueWebSocketReceiveResult result;
                    do
                    {
                        result = await socket.ReceiveAsync(buffer.AsMemory(), _shutdown.Token);
                        if (result.MessageType == WebSocketMessageType.Close) return;
                        message.Write(buffer, 0, result.Count);
                    } while (!result.EndOfMessage);
                    var frame = new Frame(result.MessageType, Encoding.UTF8.GetString(message.ToArray()));
                    if (first) { Registration.TrySetResult(frame); first = false; }
                    else _replies.Writer.TryWrite(frame);
                }
            }
            catch (Exception exception) when (exception is OperationCanceledException or WebSocketException or IOException or ObjectDisposedException or SocketException) { }
            finally { _replies.Writer.TryComplete(); }
        }
        public async ValueTask DisposeAsync()
        {
            _shutdown.Cancel(); _listener.Stop();
            if (_connected.Task.IsCompletedSuccessfully) _connected.Task.Result.Abort();
            await _worker.WaitAsync(TimeSpan.FromSeconds(3)); _shutdown.Dispose();
        }
    }
}
