using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Sensa.Input.Protocols;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class ProtocolMultiplexContracts
{
    [Fact]
    public async Task Five_protocol_sources_share_one_real_socket_and_keep_commands_and_stops_separate()
    {
        var port = FreePort();
        var inputs = new[] { Input("bp", "Buttplug", "/buttplug", port), Input("json", "JsonHttp", "/json", port),
            Input("json-ws", "JsonWebSocket", "/json-ws", port), Input("lovense", "LovenseHttp", "/lovense", port),
            Input("tcode", "TCodeWebSocket", "/tcode", port) };
        inputs[3].Features = [new() { Channel = "V0", Actuator = "Scalar", TargetAxis = "V0" }];
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync(inputs);
        using var http = Client(port);
        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/json/command");
        preflight.Headers.Add("Origin", "https://another-client.example");
        using var cors = await http.SendAsync(preflight);
        Assert.Equal(HttpStatusCode.NoContent, cors.StatusCode);
        Assert.Equal("*", Assert.Single(cors.Headers.GetValues("Access-Control-Allow-Origin")));
        using var status = await http.GetAsync("/json/status");
        Assert.Equal("json", (await Read(status)).GetProperty("inputId").GetString());
        using var unknown = await http.GetAsync("/json-neighbor/status");
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        using var mustUpgrade = await http.GetAsync("/buttplug");
        Assert.Equal(HttpStatusCode.UpgradeRequired, mustUpgrade.StatusCode);

        using var bp = await Connect(port, "/buttplug");
        var hello = await JsonExchange(bp, """[{"RequestServerInfo":{"Id":1,"ClientName":"multiplex fixture","MessageVersion":3}}]""");
        Assert.True(hello[0].TryGetProperty("ServerInfo", out _));
        await JsonExchange(bp, """[{"LinearCmd":{"Id":2,"DeviceIndex":0,"Vectors":[{"Index":0,"Position":0.8,"Duration":0}]}}]""");
        using var jsonReply = await http.PostAsJsonAsync("/json/command", new { channel = "L0", value = .2 });
        Assert.Equal(HttpStatusCode.OK, jsonReply.StatusCode);
        using var jsonWs = await Connect(port, "/json-ws");
        Assert.True((await JsonExchange(jsonWs, """{"channel":"L0","value":0.4}""")).GetProperty("ok").GetBoolean());
        using var lovenseReply = await http.PostAsJsonAsync("/lovense/command", new { command = "Function", action = "Vibrate:12", timeSec = 0, apiVer = 1 });
        Assert.Equal(HttpStatusCode.OK, lovenseReply.StatusCode);
        using var tcode = await Connect(port, "/tcode");
        Assert.Contains("TCode v0.3", await TextExchange(tcode, "L0600\nD1\n"));
        Assert.Equal(.8f, store.Read("bp/L0", Now).Value);
        Assert.Equal(.2f, store.Read("json/L0", Now).Value);
        Assert.Equal(.4f, store.Read("json-ws/L0", Now).Value);
        Assert.Equal(.6f, store.Read("lovense/V0", Now).Value);
        Assert.Equal(.6f, store.Read("tcode/L0", Now).Value);
        Assert.Equal(5, inputs.Select(input => store.GetStatus(input.Id)?.Session).OfType<string>().Distinct().Count());
        Assert.Contains("TCode v0.3", await TextExchange(tcode, "DSTOP\nD1\n"));
        Assert.False(store.Read("tcode/L0", Now).Valid);
        Assert.True(store.Read("bp/L0", Now).Valid);
        Assert.True(store.Read("json/L0", Now).Valid);
        Assert.True(store.Read("lovense/V0", Now).Valid);
        using var jsonStop = await http.PostAsJsonAsync("/json/stop", new { });
        Assert.Equal(HttpStatusCode.OK, jsonStop.StatusCode);
        Assert.False(store.Read("json/L0", Now).Valid);
        Assert.True(store.Read("json-ws/L0", Now).Valid);
        Assert.True(store.Read("bp/L0", Now).Valid);
        var snapshot = JsonSerializer.SerializeToElement(listeners.Snapshot());
        Assert.Equal($"ws://127.0.0.1:{port}/tcode", snapshot.EnumerateArray().Single(x => x.GetProperty("id").GetString() == "tcode").GetProperty("address").GetString());
    }

    [Fact]
    public async Task Nested_mounts_choose_the_longest_whole_segment_and_root_still_handles_legacy_endpoints()
    {
        var port = FreePort();
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([Input("root", "JsonHttp", "/", port), Input("api", "JsonHttp", "/api/", port), Input("nested", "JsonHttp", "/api/nested", port)]);
        using var http = Client(port);
        foreach (var (path, id) in new[] { ("/status", "root"), ("/api/status", "api"), ("/api/nested/status", "nested"), ("/api/nested", "nested") })
        {
            using var response = await http.GetAsync(path);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal(id, (await Read(response)).GetProperty("inputId").GetString());
        }
        using var neighbor = await http.GetAsync("/apix/status");
        Assert.Equal(HttpStatusCode.MethodNotAllowed, neighbor.StatusCode); // Legacy root handler, not /api/status.
        using var invalidCommand = await http.PostAsJsonAsync("/apix/command", new { channel = "L0", value = .9 });
        Assert.Equal(HttpStatusCode.NotFound, invalidCommand.StatusCode);
        Assert.Null(store.GetStatus("api")?.Session);
    }

    [Fact]
    public async Task Startup_port_conflict_moves_the_entire_shared_group_and_keeps_the_callers_config_in_sync()
    {
        using var occupied = new TcpListener(IPAddress.Loopback, 0); occupied.Start();
        var requested = ((IPEndPoint)occupied.LocalEndpoint).Port;
        var first = Input("one", "JsonHttp", "/one", requested);
        var second = Input("two", "Buttplug", "/two", requested);
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([first, second], resolvePortConflicts: true);
        Assert.NotEqual(requested, first.Port);
        Assert.InRange(first.Port, 1, 65535);
        Assert.Equal(first.Port, second.Port);
        using var client = Client(first.Port);
        using var response = await client.GetAsync("/one/status");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var peer = await Connect(second.Port, "/two");
        Assert.True((await JsonExchange(peer, """[{"RequestServerInfo":{"Id":1,"ClientName":"moved client","MessageVersion":3}}]"""))[0].TryGetProperty("ServerInfo", out _));
    }

    [Fact]
    public async Task Normal_configuration_save_reports_a_conflict_instead_of_silently_moving_the_port()
    {
        using var occupied = new TcpListener(IPAddress.Loopback, 0); occupied.Start();
        var requested = ((IPEndPoint)occupied.LocalEndpoint).Port;
        var input = Input("strict", "JsonHttp", "/", requested);
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await Assert.ThrowsAnyAsync<Exception>(() => listeners.ReloadAsync([input]));
        Assert.Equal(requested, input.Port);
        Assert.Null(store.GetStatus(input.Id));
    }

    [Theory]
    [InlineData("TCodeTcp")]
    [InlineData("TCodeUdp")]
    public async Task Startup_conflict_resolution_also_binds_a_real_free_port_for_raw_transports(string type)
    {
        using var occupiedTcp = new TcpListener(IPAddress.Loopback, 0); occupiedTcp.Start();
        using var occupiedUdp = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        var requested = type == "TCodeTcp" ? ((IPEndPoint)occupiedTcp.LocalEndpoint).Port : ((IPEndPoint)occupiedUdp.Client.LocalEndPoint!).Port;
        var input = Input("raw", type, "/", requested);
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([input], resolvePortConflicts: true);
        Assert.NotEqual(requested, input.Port);
        if (type == "TCodeTcp")
        {
            using var tcp = new TcpClient(); await tcp.ConnectAsync(IPAddress.Loopback, input.Port);
            await tcp.GetStream().WriteAsync("L0750\nD1\n"u8.ToArray());
            var bytes = new byte[256];
            var count = await tcp.GetStream().ReadAsync(bytes).AsTask().WaitAsync(TimeSpan.FromSeconds(3));
            Assert.Contains("TCode v0.3", Encoding.ASCII.GetString(bytes, 0, count));
        }
        else
        {
            using var udp = new UdpClient();
            await udp.SendAsync("L0750\nD1\n"u8.ToArray(), new IPEndPoint(IPAddress.Loopback, input.Port));
            var response = await udp.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(3));
            Assert.Contains("TCode v0.3", Encoding.ASCII.GetString(response.Buffer));
        }
        Assert.Equal(.75f, store.Read("raw/L0", Now).Value);
    }

    [Fact]
    public async Task Shared_listener_reload_closes_all_old_peers_and_releases_the_real_port()
    {
        var port = FreePort();
        var inputs = new[] { Input("json", "JsonHttp", "/json", port), Input("tcode", "TCodeWebSocket", "/tcode", port) };
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync(inputs);
        using var socket = await Connect(port, "/tcode");
        await TextExchange(socket, "L0900\nD1\n");
        Assert.True(store.Read("tcode/L0", Now).Valid);
        await listeners.ReloadAsync([]).WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Null(store.GetStatus("tcode"));
        using var rebound = new TcpListener(IPAddress.Loopback, port); rebound.Start();
    }

    [Fact]
    public async Task A_second_controller_on_one_mount_does_not_block_another_mount()
    {
        var port = FreePort();
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([Input("first", "TCodeWebSocket", "/first", port), Input("second", "JsonHttp", "/second", port)]);
        using var owner = await Connect(port, "/first");
        await TextExchange(owner, "L0800\nD1\n");
        using var duplicate = await Connect(port, "/first");
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        var ended = await duplicate.ReceiveAsync(new ArraySegment<byte>(new byte[64]), deadline.Token);
        Assert.Equal(WebSocketMessageType.Close, ended.MessageType);
        using var http = Client(port);
        using var accepted = await http.PostAsJsonAsync("/second/command", new { channel = "L0", value = .4 });
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        Assert.Equal(.8f, store.Read("first/L0", Now).Value);
        Assert.Equal(.4f, store.Read("second/L0", Now).Value);
    }

    [Fact]
    public async Task TCode_fragmented_text_preserves_framing_and_reset_discards_inflight_old_message_bytes()
    {
        var port = FreePort();
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([Input("text", "TCodeWebSocket", "/text", port)]);
        using var socket = await Connect(port, "/text");
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        await socket.SendAsync("L04"u8.ToArray(), WebSocketMessageType.Text, true, deadline.Token);
        Assert.Contains("TCode v0.3", await TextExchange(socket, "00\nD1\n"));
        Assert.Equal(.4f, store.Read("text/L0", Now).Value);
        // A reply proves the first fragment has been parsed while its trailing line is incomplete.
        await socket.SendAsync("D1\nL09"u8.ToArray(), WebSocketMessageType.Text, false, deadline.Token);
        Assert.Contains("TCode v0.3", await ReadText(socket, deadline.Token));
        store.ClearCommands();
        await socket.SendAsync("00\n"u8.ToArray(), WebSocketMessageType.Text, true, deadline.Token);
        await AssertEnded(socket);
        Assert.False(store.Read("text/L0", Now).Valid);
        Assert.Equal(1, store.GetStatus("text")!.ReceivedCommands);
    }

    [Fact]
    public async Task Binary_TCode_rejection_and_a_saturated_WebSocket_mount_leave_other_routes_available()
    {
        var port = FreePort();
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([Input("text", "TCodeWebSocket", "/text", port), Input("bp", "Buttplug", "/bp", port), Input("json", "JsonHttp", "/json", port)]);
        using var text = await Connect(port, "/text");
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        await text.SendAsync("L0999\n"u8.ToArray(), WebSocketMessageType.Binary, true, deadline.Token);
        await AssertEnded(text);
        Assert.False(store.Read("text/L0", Now).Valid);
        var idlePeers = new List<ClientWebSocket>();
        try
        {
            for (var i = 0; i < 8; i++) idlePeers.Add(await Connect(port, "/bp"));
            using var ninth = new ClientWebSocket();
            await Assert.ThrowsAsync<WebSocketException>(() => ninth.ConnectAsync(new Uri($"ws://127.0.0.1:{port}/bp"), deadline.Token));
            using var http = Client(port);
            using var accepted = await http.PostAsJsonAsync("/json/command", new { channel = "L0", value = .3 });
            Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
            Assert.Equal(.3f, store.Read("json/L0", Now).Value);
        }
        finally { foreach (var peer in idlePeers) { peer.Abort(); peer.Dispose(); } }
    }

    [Theory]
    [InlineData("/bad?query")]
    [InlineData("/bad#fragment")]
    [InlineData("/../parent")]
    [InlineData("/double//slash")]
    [InlineData("/%2f")]
    [InlineData("relative")]
    public void Mount_paths_cannot_be_ambiguous_URL_syntax(string path) =>
        Assert.Throws<ArgumentException>(() => ProtocolInputConfiguration.CloneAndValidate([Input("invalid", "JsonHttp", path, 12400)]));

    [Fact]
    public void Equal_mounts_and_mixed_raw_TCP_bindings_are_rejected_but_distinct_web_mounts_share_a_socket()
    {
        var first = Input("one", "JsonHttp", "/one", 12400);
        var second = Input("two", "Buttplug", "/two/", 12400);
        var valid = ProtocolInputConfiguration.CloneAndValidate([first, second]);
        Assert.Equal("/two", valid[1].Path);
        second.Path = "/one";
        Assert.Throws<ArgumentException>(() => ProtocolInputConfiguration.CloneAndValidate([first, second]));
        second.Path = "/two"; second.Type = "TCodeTcp";
        Assert.Throws<ArgumentException>(() => ProtocolInputConfiguration.CloneAndValidate([first, second]));
        second.Type = "JsonHttp"; second.Host = "0.0.0.0";
        Assert.Throws<ArgumentException>(() => ProtocolInputConfiguration.CloneAndValidate([first, second]));
        second.Type = "TCodeUdp";
        Assert.Equal(2, ProtocolInputConfiguration.CloneAndValidate([first, second]).Count);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("999")]
    [InlineData("l0")]
    public void Direct_axes_require_canonical_names_not_numeric_enum_aliases(string target)
    {
        var input = Input("numeric", "JsonHttp", "/", 12400);
        input.Features[0].TargetAxis = target;
        Assert.Throws<ArgumentException>(() => ProtocolInputConfiguration.CloneAndValidate([input]));
    }

    private static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    private static ProtocolInputConfig Input(string id, string type, string path, int port) => new()
    { Id = id, Type = type, Path = path, Port = port, Enabled = true, RouteToMotion = false };
    private static int FreePort() { using var socket = new TcpListener(IPAddress.Loopback, 0); socket.Start(); return ((IPEndPoint)socket.LocalEndpoint).Port; }
    private static HttpClient Client(int port) => new(new SocketsHttpHandler { UseProxy = false, UseCookies = false })
    { BaseAddress = new Uri($"http://127.0.0.1:{port}"), Timeout = TimeSpan.FromSeconds(3) };
    private static async Task<ClientWebSocket> Connect(int port, string path)
    {
        var socket = new ClientWebSocket(); using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        try { await socket.ConnectAsync(new Uri($"ws://127.0.0.1:{port}{path}"), deadline.Token); return socket; }
        catch { socket.Dispose(); throw; }
    }
    private static async Task<string> TextExchange(WebSocket socket, string message)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        await socket.SendAsync(Encoding.UTF8.GetBytes(message), WebSocketMessageType.Text, true, deadline.Token);
        return await ReadText(socket, deadline.Token);
    }
    private static async Task<string> ReadText(WebSocket socket, CancellationToken cancellation)
    {
        var bytes = new byte[8192]; var count = 0; WebSocketReceiveResult result;
        do
        {
            result = await socket.ReceiveAsync(new ArraySegment<byte>(bytes, count, bytes.Length - count), cancellation);
            if (result.MessageType != WebSocketMessageType.Text) throw new InvalidDataException("Expected text reply");
            count += result.Count;
        } while (!result.EndOfMessage);
        return Encoding.UTF8.GetString(bytes, 0, count);
    }
    private static async Task AssertEnded(WebSocket socket)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        try
        {
            var result = await socket.ReceiveAsync(new ArraySegment<byte>(new byte[32]), deadline.Token);
            Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        }
        catch (WebSocketException) { Assert.NotEqual(WebSocketState.Open, socket.State); }
    }
    private static async Task<JsonElement> JsonExchange(WebSocket socket, string message)
    { using var document = JsonDocument.Parse(await TextExchange(socket, message)); return document.RootElement.Clone(); }
    private static async Task<JsonElement> Read(HttpResponseMessage response)
    { using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync()); return document.RootElement.Clone(); }
}
