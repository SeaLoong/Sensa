using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Sensa.Outputs.Adapters;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class SignalOutputAdapterContracts
{
    [Theory]
    [InlineData(SignalOutputValueType.Float, .5, ",f", "3F000000")]
    [InlineData(SignalOutputValueType.Int, 1.6, ",i", "00000002")]
    [InlineData(SignalOutputValueType.Int, -1.5, ",i", "FFFFFFFE")]
    [InlineData(SignalOutputValueType.Bool, .6, ",T", "")]
    [InlineData(SignalOutputValueType.Bool, .4, ",F", "")]
    public void Osc_codec_uses_real_wire_types_and_network_byte_order(SignalOutputValueType type, double value, string tag, string data)
    {
        var packet = OscSignalOutputCodec.Encode(new("/result", value, type)).Data.ToArray();
        Assert.Equal(Encoding.ASCII.GetBytes("/result\0"), packet[..8]);
        Assert.Equal(Encoding.ASCII.GetBytes(tag + "\0\0"), packet[8..12]);
        Assert.Equal(data, Convert.ToHexString(packet[12..]));
        Assert.Equal(0, packet.Length % 4);
    }

    [Fact]
    public void Codec_validation_preserves_zero_false_and_rejects_nonfinite_or_ambiguous_addresses()
    {
        foreach (var type in Enum.GetValues<SignalOutputValueType>())
        {
            using var document = JsonDocument.Parse(JsonSignalOutputCodec.Encode(new("feedback/amount", 0, type, "signal", "m/s", 42, "AvatarRootLocal")).Data);
            var value = document.RootElement.GetProperty("value");
            if (type == SignalOutputValueType.Bool) Assert.False(value.GetBoolean());
            else Assert.Equal(0, value.GetDouble());
            Assert.Equal("m/s", document.RootElement.GetProperty("unit").GetString());
            Assert.Equal("AvatarRootLocal", document.RootElement.GetProperty("coordinateFrame").GetString());
            Assert.Equal(42, document.RootElement.GetProperty("timestampMs").GetInt64());
        }
        foreach (var value in new[] { double.NaN, double.PositiveInfinity, double.NegativeInfinity, double.MaxValue })
            Assert.Throws<ArgumentException>(() => OscSignalOutputCodec.Encode(new("/target", value)));
        Assert.Throws<ArgumentException>(() => OscSignalOutputCodec.Encode(new("/target", (double)int.MaxValue + 1, SignalOutputValueType.Int)));
        foreach (var path in new[] { "target", "/", "/a*", "/a?", "/a b", "/a\0b", "/a[bc]" })
            Assert.Throws<ArgumentException>(() => OscSignalOutputCodec.Encode(new(path, 1)));
        Assert.Throws<ArgumentException>(() => JsonSignalOutputCodec.Encode(new("", 1)));
        Assert.Throws<ArgumentException>(() => JsonSignalOutputCodec.Encode(new("target", 1, (SignalOutputValueType)99)));
    }

    [Fact]
    public async Task Osc_output_sends_only_to_the_configured_udp_target_and_stop_keeps_connection()
    {
        using var listener = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        var port = ((IPEndPoint)listener.Client.LocalEndPoint!).Port;
        await using var adapter = SignalOutputAdapters.OscUdp("127.0.0.1", port);
        await Assert.ThrowsAsync<InvalidOperationException>(() => adapter.SendAsync(new("/avatar/parameters/Result", .25)).AsTask());
        Assert.False(adapter.IsConnected);
        await adapter.ConnectAsync();
        await adapter.SendAsync(new("/avatar/parameters/Result", .25));
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var packet = (await listener.ReceiveAsync(timeout.Token)).Buffer;
        Assert.Equal("/avatar/parameters/Result", ReadOscString(packet, 0));
        Assert.Equal(.25f, BitConverter.Int32BitsToSingle(BinaryPrimitives.ReadInt32BigEndian(packet.AsSpan(packet.Length - 4))));
        await adapter.StopAsync();
        Assert.True(adapter.IsConnected);
        Assert.Equal(0, listener.Available);
    }

    [Fact]
    public async Task Http_output_reuses_its_client_and_sends_typed_json_without_extra_connect_or_stop_requests()
    {
        var calls = new List<(HttpMethod Method, string MediaType, string Json)>();
        using var client = new HttpClient(new DelegateHandler(async (request, ct) =>
        {
            calls.Add((request.Method, request.Content!.Headers.ContentType!.MediaType!, await request.Content.ReadAsStringAsync(ct)));
            return new(HttpStatusCode.NoContent);
        }));
        await using var adapter = SignalOutputAdapters.HttpJson(new("http://output.invalid/value"), client);
        await adapter.ConnectAsync(); Assert.Empty(calls);
        await adapter.SendAsync(new("channel", .9, SignalOutputValueType.Bool));
        await adapter.SendAsync(new("channel", 2.6, SignalOutputValueType.Int));
        await adapter.StopAsync();
        Assert.True(adapter.IsConnected); Assert.Equal(2, calls.Count);
        Assert.All(calls, call => { Assert.Equal(HttpMethod.Post, call.Method); Assert.Equal("application/json", call.MediaType); });
        using var first = JsonDocument.Parse(calls[0].Json); using var second = JsonDocument.Parse(calls[1].Json);
        Assert.True(first.RootElement.GetProperty("value").GetBoolean());
        Assert.Equal(3, second.RootElement.GetProperty("value").GetInt32());
    }

    [Fact]
    public async Task Cancelling_an_inflight_http_send_does_not_retry_or_replay_the_value()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var calls = 0;
        using var client = new HttpClient(new DelegateHandler(async (_, ct) =>
        {
            calls++; entered.TrySetResult();
            await Task.Delay(Timeout.InfiniteTimeSpan, ct);
            return new(HttpStatusCode.NoContent);
        }));
        await using var adapter = SignalOutputAdapters.HttpJson(new("http://output.invalid/value"), client);
        await adapter.ConnectAsync();
        using var cancelled = new CancellationTokenSource();
        var sending = adapter.SendAsync(new("value", .5), cancelled.Token).AsTask();
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(2)); cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => sending);
        Assert.False(adapter.IsConnected);
        await adapter.StopAsync();
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task Failed_http_status_is_reported_without_followup_retries()
    {
        var calls = 0;
        using var client = new HttpClient(new DelegateHandler((_, _) =>
        {
            calls++; return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
        }));
        await using var adapter = SignalOutputAdapters.HttpJson(new("http://output.invalid/value"), client);
        await adapter.ConnectAsync();
        await Assert.ThrowsAsync<HttpRequestException>(() => adapter.SendAsync(new("value", .5)).AsTask());
        Assert.Equal(1, calls); Assert.False(adapter.IsConnected);
    }

    [Fact]
    public async Task Websocket_transport_sends_json_and_observes_peer_close()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        await using var adapter = SignalOutputAdapters.WebSocketJson(new($"ws://127.0.0.1:{port}/output"));
        var connecting = adapter.ConnectAsync();
        using var connection = await listener.AcceptTcpClientAsync().WaitAsync(TimeSpan.FromSeconds(2));
        using var stream = connection.GetStream();
        await AcceptWebSocket(stream);
        using var peer = WebSocket.CreateFromStream(stream, true, null, TimeSpan.FromSeconds(15));
        await connecting;
        await adapter.SendAsync(new("volume", .75));
        var buffer = new byte[2048];
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var received = await peer.ReceiveAsync(buffer.AsMemory(), timeout.Token);
        Assert.Equal(WebSocketMessageType.Text, received.MessageType);
        using var body = JsonDocument.Parse(buffer.AsMemory(0, received.Count));
        Assert.Equal(.75, body.RootElement.GetProperty("value").GetDouble());
        await adapter.StopAsync(); Assert.True(adapter.IsConnected);
        await peer.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "done", timeout.Token);
        await Until(() => !adapter.IsConnected);
    }

    [Fact]
    public void Mqtt_codec_uses_clean_session_qos_zero_and_no_retained_motion()
    {
        var connect = MqttOutputCodec.Connect(new() { ClientId = "test" });
        Assert.Equal("101000044D5154540402001E000474657374", Convert.ToHexString(connect));
        var publish = MqttOutputCodec.Publish("sensa/value", Encoding.UTF8.GetBytes("0.5"));
        Assert.Equal(0x30, publish[0]);
        Assert.Equal("sensa/value", ReadMqttString(publish.AsSpan(2)));
        Assert.EndsWith("302E35", Convert.ToHexString(publish));
        foreach (var topic in new[] { "", "sensa/#", "sensa/+", "sensa\0value" })
            Assert.Throws<ArgumentException>(() => MqttOutputCodec.Publish(topic, []));
        Assert.Throws<ArgumentException>(() => MqttOutputCodec.Connect(new() { Username = null, Password = "test-only" }));
        var large = MqttOutputCodec.Publish("topic", new byte[256]);
        Assert.True((large[1] & 0x80) != 0); Assert.True((large[2] & 0x80) == 0);
    }

    [Fact]
    public async Task Mqtt_output_requires_connack_publishes_json_and_closes_on_missing_keepalive()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        var clock = new ManualTimeProvider();
        await using var transport = new MqttOutputTransport(new()
        {
            Host = "127.0.0.1", Port = ((IPEndPoint)listener.LocalEndpoint).Port,
            ClientId = "Sensa-test", KeepAliveSeconds = 10,
        }, clock);
        var connecting = transport.ConnectAsync();
        using var connection = await listener.AcceptTcpClientAsync().WaitAsync(TimeSpan.FromSeconds(2));
        using var stream = connection.GetStream();
        var connect = await ReadMqttPacket(stream); Assert.Equal(0x10, connect.Header);
        Assert.False(transport.IsConnected);
        await stream.WriteAsync(new byte[] { 0x20, 2, 0, 0 }); await connecting;
        var payload = JsonSignalOutputCodec.Encode(new("sensa/feedback", .4, SignalOutputValueType.Float, "speed", "m/s", 25));
        await transport.SendAsync(payload);
        var published = await ReadMqttPacket(stream); Assert.Equal(0x30, published.Header);
        Assert.Equal("sensa/feedback", ReadMqttString(published.Data));
        var offset = 2 + Encoding.UTF8.GetByteCount("sensa/feedback");
        using var json = JsonDocument.Parse(published.Data.AsMemory(offset));
        Assert.Equal("speed", json.RootElement.GetProperty("signalId").GetString());
        clock.Advance(TimeSpan.FromSeconds(5));
        Assert.Equal(0xC0, (await ReadMqttPacket(stream)).Header);
        // No PINGRESP: expiry closes the connection instead of keeping a stale ready status.
        clock.Advance(TimeSpan.FromSeconds(5));
        await Until(() => !transport.IsConnected);
        await Assert.ThrowsAsync<InvalidOperationException>(() => transport.SendAsync(payload).AsTask());
    }

    [Fact]
    public async Task Mqtt_broker_rejection_never_marks_the_output_connected()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        await using var transport = new MqttOutputTransport(new() { Host = "127.0.0.1", Port = ((IPEndPoint)listener.LocalEndpoint).Port });
        var connecting = transport.ConnectAsync();
        using var connection = await listener.AcceptTcpClientAsync().WaitAsync(TimeSpan.FromSeconds(2));
        using var stream = connection.GetStream(); await ReadMqttPacket(stream);
        await stream.WriteAsync(new byte[] { 0x20, 2, 0, 5 });
        await Assert.ThrowsAsync<IOException>(() => connecting);
        Assert.False(transport.IsConnected);
    }

    [Fact]
    public void Output_urls_and_timeout_limits_are_validated_without_echoing_credentials()
    {
        var error = Assert.Throws<ArgumentException>(() => new HttpJsonOutputTransport(new("http://user:test-only@example.invalid/")));
        Assert.DoesNotContain("test-only", error.Message);
        Assert.Throws<ArgumentException>(() => new WebSocketOutputTransport(new("https://example.invalid/")));
        Assert.Throws<ArgumentOutOfRangeException>(() => new UdpOutputTransport("localhost", 9000, TimeSpan.FromSeconds(4)));
        Assert.Throws<ArgumentException>(() => new UdpOutputTransport("localhost", 0));
    }

    private sealed class DelegateHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request, cancellationToken);
    }

    private static string ReadOscString(byte[] data, int offset) => Encoding.UTF8.GetString(data.AsSpan(offset, Array.IndexOf(data, (byte)0, offset) - offset));
    private static string ReadMqttString(ReadOnlySpan<byte> data) => Encoding.UTF8.GetString(data.Slice(2, BinaryPrimitives.ReadUInt16BigEndian(data)));

    private static async Task<(byte Header, byte[] Data)> ReadMqttPacket(Stream stream)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var one = new byte[1]; await stream.ReadExactlyAsync(one, timeout.Token); var header = one[0];
        var length = 0; var multiplier = 1;
        do
        {
            await stream.ReadExactlyAsync(one, timeout.Token); length += (one[0] & 127) * multiplier; multiplier *= 128;
        } while ((one[0] & 128) != 0 && multiplier < 128 * 128 * 128);
        var data = new byte[length]; await stream.ReadExactlyAsync(data, timeout.Token); return (header, data);
    }

    private static async Task AcceptWebSocket(NetworkStream stream)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var request = new List<byte>(); var one = new byte[1];
        while (request.Count < 8192)
        {
            await stream.ReadExactlyAsync(one, timeout.Token); request.Add(one[0]);
            if (request.Count >= 4 && request.TakeLast(4).SequenceEqual(new byte[] { 13, 10, 13, 10 })) break;
        }
        var headers = Encoding.ASCII.GetString(request.ToArray()).Split("\r\n");
        var key = headers.Single(line => line.StartsWith("Sec-WebSocket-Key:", StringComparison.OrdinalIgnoreCase)).Split(':', 2)[1].Trim();
        var accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
        await stream.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n"), timeout.Token);
    }

    private static async Task Until(Func<bool> condition)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        while (!condition()) await Task.Delay(1, timeout.Token);
    }
}
