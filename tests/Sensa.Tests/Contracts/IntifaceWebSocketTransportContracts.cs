using System.Collections.Concurrent;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Buttplug.Core.Messages;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using Sensa.Configuration;
using Sensa.Outputs.Intiface;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Actual loopback WebSockets and upstream JSON correlation; no engine/device/process starts.</summary>
public sealed class IntifaceWebSocketTransportContracts
{
    [Fact]
    public async Task Exactly_the_message_limit_is_accepted_and_following_replies_still_correlate()
    {
        await using var peer = await Peer.CreateAsync(async (socket, _, cancellation) =>
        {
            var payload = Encoding.UTF8.GetBytes("[]" + new string(' ', IntifaceWebSocketConnector.MaximumMessageBytes - 2));
            await socket.SendAsync(payload, WebSocketMessageType.Text, true, cancellation);
            var request = await ReadAsync(socket, cancellation);
            await ReplyAsync(socket, new { Ok = new { Id = Body(request!.Value).GetProperty("Id").GetUInt32() } }, cancellation);
            await DrainAsync(socket, cancellation);
        });
        await using var connector = new IntifaceWebSocketConnector(new Uri(peer.Address));
        await connector.ConnectAsync();
        var reply = await connector.SendAsync(new Ping()).WaitAsync(TimeSpan.FromSeconds(3));
        Assert.IsType<Ok>(reply);
        Assert.True(connector.Connected);
    }

    [Theory]
    [InlineData("oversize")]
    [InlineData("binary")]
    [InlineData("utf8")]
    [InlineData("json")]
    [InlineData("object")]
    [InlineData("depth")]
    [InlineData("partial-close")]
    public async Task Invalid_or_incomplete_logical_messages_close_without_publishing_partial_data(string kind)
    {
        await using var peer = await Peer.CreateAsync(async (socket, _, cancellation) =>
        {
            var payload = kind switch
            {
                "oversize" => Encoding.UTF8.GetBytes("[]" + new string(' ', IntifaceWebSocketConnector.MaximumMessageBytes - 1)),
                "utf8" => new byte[] { 0xc3, 0x28 },
                "json" or "partial-close" => "[{"u8.ToArray(),
                "object" => "{}"u8.ToArray(),
                "depth" => Encoding.UTF8.GetBytes(new string('[', 66) + "0" + new string(']', 66)),
                _ => "[]"u8.ToArray(),
            };
            await socket.SendAsync(payload, kind == "binary" ? WebSocketMessageType.Binary : WebSocketMessageType.Text,
                kind != "partial-close", cancellation);
            if (kind == "partial-close") await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", cancellation);
            await DrainAsync(socket, cancellation);
        });
        await using var connector = new IntifaceWebSocketConnector(new Uri(peer.Address));
        var messages = 0;
        connector.MessageReceived += (_, _) => Interlocked.Increment(ref messages);
        await connector.ConnectAsync();
        await connector.Completion.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.False(connector.Connected);
        Assert.Equal(0, messages);
    }

    [Fact]
    public async Task A_valid_late_reply_to_a_cancelled_request_does_not_disconnect_the_next_request()
    {
        var received = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var peer = await Peer.CreateAsync(async (socket, _, cancellation) =>
        {
            var first = await ReadAsync(socket, cancellation);
            received.TrySetResult(); await release.Task.WaitAsync(cancellation);
            await ReplyAsync(socket, new { Ok = new { Id = Body(first!.Value).GetProperty("Id").GetUInt32() } }, cancellation);
            var second = await ReadAsync(socket, cancellation);
            await ReplyAsync(socket, new { Ok = new { Id = Body(second!.Value).GetProperty("Id").GetUInt32() } }, cancellation);
            await DrainAsync(socket, cancellation);
        });
        await using var connector = new IntifaceWebSocketConnector(new Uri(peer.Address));
        var unmatched = 0;
        connector.InvalidMessageReceived += (_, _) => Interlocked.Increment(ref unmatched);
        await connector.ConnectAsync();
        using var cancellation = new CancellationTokenSource();
        var pending = connector.SendAsync(new Ping(), cancellation.Token);
        await received.Task.WaitAsync(TimeSpan.FromSeconds(3));
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => pending);
        var next = connector.SendAsync(new Ping()); release.TrySetResult();
        Assert.IsType<Ok>(await next.WaitAsync(TimeSpan.FromSeconds(3)));
        Assert.Equal(1, unmatched);
        Assert.True(connector.Connected);
    }

    [Fact]
    public async Task Concurrent_writes_are_serialized_and_each_reply_keeps_its_request_identity()
    {
        var ids = new ConcurrentQueue<uint>();
        await using var peer = await Peer.CreateAsync(async (socket, _, cancellation) =>
        {
            for (var index = 0; index < 24; index++)
            {
                var command = await ReadAsync(socket, cancellation);
                var id = Body(command!.Value).GetProperty("Id").GetUInt32(); ids.Enqueue(id);
                await ReplyAsync(socket, new { Ok = new { Id = id } }, cancellation);
            }
            await DrainAsync(socket, cancellation);
        });
        await using var connector = new IntifaceWebSocketConnector(new Uri(peer.Address));
        await connector.ConnectAsync();
        var replies = await Task.WhenAll(Enumerable.Range(0, 24).Select(_ => connector.SendAsync(new Ping()))).WaitAsync(TimeSpan.FromSeconds(3));
        Assert.All(replies, reply => Assert.IsType<Ok>(reply));
        Assert.Equal(24, ids.Distinct().Count());
        Assert.Equal(ids.OrderBy(id => id), ids);
        Assert.True(connector.Connected);
    }

    [Fact]
    public async Task Disconnect_cancels_pending_requests_without_waiting_for_a_peer_response()
    {
        var received = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var peer = await Peer.CreateAsync(async (socket, _, cancellation) =>
        {
            await ReadAsync(socket, cancellation); received.TrySetResult();
            await DrainAsync(socket, cancellation);
        });
        await using var connector = new IntifaceWebSocketConnector(new Uri(peer.Address));
        await connector.ConnectAsync();
        var pending = connector.SendAsync(new Ping());
        await received.Task.WaitAsync(TimeSpan.FromSeconds(3));
        await connector.DisconnectAsync().WaitAsync(TimeSpan.FromSeconds(3));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => pending.WaitAsync(TimeSpan.FromSeconds(3)));
        await connector.Completion.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.False(connector.Connected);
    }

    [Fact]
    public async Task Cancelled_handshake_closes_the_old_socket_and_reconnect_uses_a_new_session()
    {
        var waiting = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var oldClosed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var peer = await Peer.CreateAsync(async (socket, connection, cancellation) =>
        {
            if (connection == 1)
            {
                try { await ReadAsync(socket, cancellation); waiting.TrySetResult(); await DrainAsync(socket, cancellation); }
                finally { oldClosed.TrySetResult(); }
            }
            else await HandshakeAndDrainAsync(socket, cancellation);
        });
        await using var client = new IntifaceOutputClient(new() { WebsocketAddress = peer.Address });
        using var cancellation = new CancellationTokenSource();
        var first = client.ConnectAsync(cancellation.Token);
        await waiting.Task.WaitAsync(TimeSpan.FromSeconds(3)); cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first.WaitAsync(TimeSpan.FromSeconds(3)));
        await oldClosed.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.False(client.IsConnected); Assert.Empty(client.Devices);
        await client.ConnectAsync().WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(client.IsConnected);
        Assert.Equal(2, peer.ConnectionCount);
    }

    [Fact]
    public async Task Disconnect_during_a_pending_handshake_cancels_the_connect_and_closes_its_socket()
    {
        var waiting = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var closed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var peer = await Peer.CreateAsync(async (socket, _, cancellation) =>
        {
            try { await ReadAsync(socket, cancellation); waiting.TrySetResult(); await DrainAsync(socket, cancellation); }
            finally { closed.TrySetResult(); }
        });
        await using var client = new IntifaceOutputClient(new() { WebsocketAddress = peer.Address });
        var connecting = client.ConnectAsync();
        await waiting.Task.WaitAsync(TimeSpan.FromSeconds(3));
        await client.DisconnectAsync().WaitAsync(TimeSpan.FromSeconds(3));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => connecting.WaitAsync(TimeSpan.FromSeconds(3)));
        await closed.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.False(client.IsConnected); Assert.Empty(client.Devices);
    }

    [Fact]
    public async Task Connection_logs_do_not_expose_endpoint_query_credentials()
    {
        await using var peer = await Peer.CreateAsync((socket, _, cancellation) => HandshakeAndDrainAsync(socket, cancellation));
        await using var client = new IntifaceOutputClient(new() { WebsocketAddress = peer.Address + "/control?token=test-only-url-secret" });
        var logs = new ConcurrentQueue<string>(); client.OnLog += logs.Enqueue;
        await client.ConnectAsync();
        Assert.DoesNotContain(logs, line => line.Contains("test-only-url-secret", StringComparison.Ordinal)
            || line.Contains("?token=", StringComparison.Ordinal));
        Assert.Contains("Intiface connected: " + peer.Address, logs);
    }

    [Fact]
    public async Task Concurrent_connect_calls_are_idempotent_and_disposed_clients_cannot_connect()
    {
        await using var peer = await Peer.CreateAsync((socket, _, cancellation) => HandshakeAndDrainAsync(socket, cancellation));
        var client = new IntifaceOutputClient(new() { WebsocketAddress = peer.Address });
        await Task.WhenAll(client.ConnectAsync(), client.ConnectAsync()).WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(client.IsConnected); Assert.Equal(1, peer.ConnectionCount);
        await client.DisposeAsync();
        Assert.False(client.IsConnected); Assert.Empty(client.Devices);
        await Assert.ThrowsAsync<ObjectDisposedException>(() => client.ConnectAsync());
    }

    private static JsonElement Body(JsonElement request) => request[0].EnumerateObject().Single().Value;
    private static async Task<JsonElement?> ReadAsync(WebSocket socket, CancellationToken cancellation)
    {
        var buffer = new byte[8192]; using var bytes = new MemoryStream(); ValueWebSocketReceiveResult part;
        do
        {
            part = await socket.ReceiveAsync(buffer.AsMemory(), cancellation);
            if (part.MessageType == WebSocketMessageType.Close)
            {
                await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", cancellation); return null;
            }
            bytes.Write(buffer, 0, part.Count);
            if (bytes.Length > IntifaceWebSocketConnector.MaximumMessageBytes) throw new InvalidDataException("Oversized fixture command.");
        } while (!part.EndOfMessage);
        using var document = JsonDocument.Parse(bytes.ToArray()); return document.RootElement.Clone();
    }
    private static async Task ReplyAsync(WebSocket socket, object response, CancellationToken cancellation) =>
        await socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(new[] { response }), WebSocketMessageType.Text, true, cancellation);
    private static async Task DrainAsync(WebSocket socket, CancellationToken cancellation)
    { while (await ReadAsync(socket, cancellation) is not null) { } }
    private static async Task HandshakeAndDrainAsync(WebSocket socket, CancellationToken cancellation)
    {
        while (await ReadAsync(socket, cancellation) is { } request)
        {
            var entry = request[0].EnumerateObject().Single(); var id = entry.Value.GetProperty("Id").GetUInt32();
            object response = entry.Name switch
            {
                "RequestServerInfo" => new { ServerInfo = new { Id = id, ServerName = "Transport fixture", ProtocolVersionMajor = 4, ProtocolVersionMinor = 0, MaxPingTime = 0 } },
                "RequestDeviceList" => new { DeviceList = new { Id = id, Devices = new Dictionary<string, object>() } },
                _ => new { Ok = new { Id = id } },
            };
            await ReplyAsync(socket, response, cancellation);
        }
    }

    private sealed class Peer : IAsyncDisposable
    {
        private readonly WebApplication _app;
        private int _connections;
        private Exception? _failure;
        public string Address { get; private set; } = "";
        public int ConnectionCount => Volatile.Read(ref _connections);
        private Peer(WebApplication app) => _app = app;
        public static async Task<Peer> CreateAsync(Func<WebSocket, int, CancellationToken, Task> handler)
        {
            var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions { Args = [], ContentRootPath = AppContext.BaseDirectory });
            builder.Logging.ClearProviders(); builder.WebHost.ConfigureKestrel(server => server.Listen(IPAddress.Loopback, 0));
            var app = builder.Build(); var peer = new Peer(app); app.UseWebSockets();
            app.Run(async context =>
            {
                using var socket = await context.WebSockets.AcceptWebSocketAsync();
                using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, app.Lifetime.ApplicationStopping);
                try { await handler(socket, Interlocked.Increment(ref peer._connections), lifetime.Token); }
                catch (Exception error) when (error is WebSocketException or IOException || error is OperationCanceledException && lifetime.IsCancellationRequested) { }
                catch (Exception error) { peer._failure = error; }
            });
            await app.StartAsync(); peer.Address = app.Urls.Single().Replace("http://", "ws://", StringComparison.Ordinal); return peer;
        }
        public async ValueTask DisposeAsync()
        {
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            await _app.StopAsync(deadline.Token); await _app.DisposeAsync();
            if (_failure is not null) throw new InvalidOperationException("Transport fixture failed.", _failure);
        }
    }
}
