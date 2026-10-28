using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Sensa.Application;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Input.Protocols;
using Sensa.Motion;
using Sensa.Outputs;
using Sensa.Runtime;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Isolated loopback listeners and fake motion outputs. Never starts the Sensa host or physical transports.</summary>
public sealed class ProtocolListenerContracts
{
    [Theory]
    [InlineData("https://first-player.example")]
    [InlineData("https://another-player.example")]
    [InlineData("null")]
    public async Task Browser_preflight_and_commands_need_no_website_registration_but_still_validate_the_listener_host(string origin)
    {
        var config = Input();
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([config]);
        using var client = Client(config);
        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/command");
        preflight.Headers.Add("Origin", origin);
        preflight.Headers.Add("Access-Control-Request-Method", "PUT");
        preflight.Headers.Add("Access-Control-Request-Headers", "content-type,x-device-token");
        using var reply = await client.SendAsync(preflight);
        Assert.Equal(HttpStatusCode.NoContent, reply.StatusCode);
        Assert.Equal("*", Assert.Single(reply.Headers.GetValues("Access-Control-Allow-Origin")));
        Assert.False(reply.Headers.Contains("Access-Control-Allow-Credentials"));
        Assert.Contains("X-Device-Token", string.Join(',', reply.Headers.GetValues("Access-Control-Allow-Headers")), StringComparison.OrdinalIgnoreCase);
        Assert.Null(store.GetStatus(config.Id)?.Session);

        using var hostileHost = new HttpRequestMessage(HttpMethod.Post, "/command")
        { Content = JsonContent.Create(new { channel = "L0", value = .8 }) };
        hostileHost.Headers.Host = "rebinding.invalid:" + config.Port;
        hostileHost.Headers.Add("Origin", origin);
        using var deniedHost = await client.SendAsync(hostileHost);
        Assert.Equal(HttpStatusCode.Forbidden, deniedHost.StatusCode);
        Assert.Null(store.GetStatus(config.Id)?.Session);

        using var command = new HttpRequestMessage(HttpMethod.Post, "/command")
        { Content = JsonContent.Create(new { channel = "L0", value = .8 }) };
        command.Headers.Add("Origin", origin);
        using var accepted = await client.SendAsync(command);
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        Assert.Equal("*", Assert.Single(accepted.Headers.GetValues("Access-Control-Allow-Origin")));
        Assert.Equal(.8f, store.Read(config.Id + "/L0", Now).Value);
    }

    [Fact]
    public async Task A_one_MiB_cloud_multipart_file_reaches_the_handler_and_is_not_rejected_by_the_JSON_limit()
    {
        var config = Input("AutoblowHttp");
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([config]);
        using var client = Client(config);
        const string points = "0,0\n1000,100\n";
        var bytes = Encoding.UTF8.GetBytes(points + new string(' ', ProtocolScriptLoader.MaximumBytes - points.Length - 1) + "\n");
        Assert.Equal(ProtocolScriptLoader.MaximumBytes, bytes.Length);
        using var upload = Multipart(bytes);
        Assert.True(upload.Headers.ContentLength > 65536);
        using var response = await client.PutAsync("/autoblow/sync-script/upload-csv", upload);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var state = await Body(response);
        Assert.False(string.IsNullOrWhiteSpace(state.GetProperty("syncScriptToken").GetString()));
        Assert.Equal("SYNC_SCRIPT_PAUSED", state.GetProperty("operationalMode").GetString());
        Assert.Empty(store.GetStatus(config.Id)!.Channels);
    }

    [Theory]
    [InlineData("JsonHttp", "/status")]
    [InlineData("AutoblowHttp", "/autoblow/state")]
    [InlineData("VacuGlideHttp", "/vacuglide/connected")]
    public async Task Status_discovery_over_real_HTTP_does_not_claim_the_control_lease(string type, string path)
    {
        var config = Input(type);
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([config]);
        using var client = Client(config);
        using var response = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(store.GetStatus(config.Id)?.Session);
        Assert.Empty(store.GetStatus(config.Id)!.Channels);
    }

    [Fact]
    public async Task Reload_closes_the_old_WebSocket_endpoint_and_never_carries_its_lease_or_targets_to_the_new_one()
    {
        var first = Input("Buttplug");
        var second = Input("Buttplug"); second.Id = first.Id;
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([first]);
        using var oldSocket = await Connect(first);
        await Exchange(oldSocket, """[{"RequestServerInfo":{"Id":1,"ClientName":"first isolated client","MessageVersion":3}}]""");
        await Exchange(oldSocket, """[{"LinearCmd":{"Id":2,"DeviceIndex":0,"Vectors":[{"Index":0,"Position":0.8,"Duration":400}]}}]""");
        var oldSession = store.GetStatus(first.Id)!.Session;
        Assert.NotNull(oldSession);
        Assert.True(store.Read(first.Id + "/L0/target", Now).Valid);

        await listeners.ReloadAsync([second]).WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Null(store.GetStatus(second.Id)?.Session);
        Assert.False(store.Read(second.Id + "/L0/target", Now).Valid);
        using var oldClient = Client(first);
        await Assert.ThrowsAsync<HttpRequestException>(() => oldClient.GetAsync("/"));
        await AssertSocketEnded(oldSocket);

        using var newSocket = await Connect(second);
        var premature = await Exchange(newSocket, """[{"LinearCmd":{"Id":3,"DeviceIndex":0,"Vectors":[{"Index":0,"Position":0.2,"Duration":100}]}}]""");
        Assert.True(premature[0].TryGetProperty("Error", out _));
        Assert.Null(store.GetStatus(second.Id)?.Session);
        await Exchange(newSocket, """[{"RequestServerInfo":{"Id":4,"ClientName":"second isolated client","MessageVersion":3}}]""");
        Assert.NotEqual(oldSession, store.GetStatus(second.Id)!.Session);
        Assert.False(store.Read(second.Id + "/L0/target", Now).Valid);
    }

    [Fact]
    public async Task A_disabled_input_does_not_open_its_socket_or_accept_control()
    {
        var config = Input(); config.Enabled = false;
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([config]);
        using var client = Client(config);
        await Assert.ThrowsAsync<HttpRequestException>(() => client.GetAsync("/status"));
        Assert.Null(store.GetStatus(config.Id));
        Assert.False(store.TryAcquire(config.Id, "unavailable", out _));
    }

    [Fact]
    public async Task Actual_HTTP_commands_cannot_move_a_disarmed_runtime_or_replay_when_it_is_activated()
    {
        var input = Input(); input.RouteToMotion = true;
        var config = new AppConfig { ProtocolInputs = [input], Outputs = [], Signals = [] };
        using var store = new ExternalControlStore();
        var output = new FixtureOutput();
        using var runtime = new MotionRuntime(config, new OscParameterStore(), output);
        runtime.AttachExternalControls(store);
        runtime.SetInputMode(RuntimeInputMode.Protocol);
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([input]);
        using var client = Client(input);
        using var receivedWhileOff = await client.PostAsJsonAsync("/commands", new { commands = new[] { new { channel = "L0", value = .8, durationMs = 200 } } });
        Assert.Equal(HttpStatusCode.OK, receivedWhileOff.StatusCode);
        Assert.Equal(0, output.SendCount);
        runtime.SetInputActive(true);
        Assert.False(store.Read(input.Id + "/L0/target", Now).Valid);
        Assert.Equal(0, output.SendCount);
        using var receivedWhileOn = await client.PostAsJsonAsync("/commands", new { commands = new[] { new { channel = "L0", value = .3, durationMs = 245 } } });
        Assert.Equal(HttpStatusCode.OK, receivedWhileOn.StatusCode);
        var frame = await output.Next();
        Assert.Equal(.3f, frame.L0);
        Assert.Equal(245, frame.RequestedMotionValue);
        Assert.Equal(new[] { MotionAxis.L0 }, frame.ActiveAxes);
        runtime.SetInputActive(false);
        using var receivedAfterDisarm = await client.PostAsJsonAsync("/commands", new { channel = "L0", value = .9 });
        Assert.Equal(HttpStatusCode.OK, receivedAfterDisarm.StatusCode);
        Assert.Equal(1, output.SendCount);
        Assert.False(runtime.InputActive);
    }

    [Fact]
    public async Task A_failed_multi_listener_reload_removes_every_partially_started_candidate()
    {
        var first = Input();
        using var occupied = new TcpListener(IPAddress.Loopback, 0); occupied.Start();
        var second = Input(); second.Id = "conflicting-input"; second.Port = ((IPEndPoint)occupied.LocalEndpoint).Port;
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await Assert.ThrowsAsync<InvalidOperationException>(() => listeners.ReloadAsync([first, second]));
        using var client = Client(first);
        await Assert.ThrowsAsync<HttpRequestException>(() => client.GetAsync("/status"));
        Assert.False(store.Read(first.Id + "/L0", Now).Valid);
        Assert.Null(store.GetStatus(first.Id)?.Session);
    }

    [Fact]
    public async Task Configuration_rollback_restores_the_old_real_listener_and_keeps_input_disarmed()
    {
        var previous = Input(); previous.RouteToMotion = true;
        var config = new AppConfig { ProtocolInputs = [previous], Outputs = [], Signals = [] };
        using var store = new ExternalControlStore();
        var output = new FixtureOutput();
        using var runtime = new MotionRuntime(config, new OscParameterStore(), output);
        runtime.AttachExternalControls(store);
        runtime.SetInputMode(RuntimeInputMode.Protocol);
        await using var outputs = new OutputCoordinator(config, _ => { }, _ => { }, _ => { });
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync(config.ProtocolInputs);
        runtime.SetInputActive(true);
        using var occupied = new TcpListener(IPAddress.Loopback, 0); occupied.Start();
        var candidate = new AppConfig(); candidate.CopyFrom(config);
        candidate.ProtocolInputs[0].Port = ((IPEndPoint)occupied.LocalEndpoint).Port;
        var persisted = false;
        var update = new ConfigurationUpdate(config, runtime, outputs, (_, _) => { }, () => { }, _ => persisted = true, _ => { },
            reloadProtocolInputs: () => listeners.ReloadAsync(config.ProtocolInputs));
        await Assert.ThrowsAsync<InvalidOperationException>(() => update.ApplyAsync(candidate));
        Assert.False(persisted);
        Assert.Equal(previous.Port, config.ProtocolInputs[0].Port);
        Assert.False(runtime.InputActive);
        Assert.False(runtime.CanSend);
        using var restored = Client(previous);
        using var status = await restored.GetAsync("/status");
        Assert.Equal(HttpStatusCode.OK, status.StatusCode);
        Assert.Null(store.GetStatus(previous.Id)?.Session);
        using var command = await restored.PostAsJsonAsync("/command", new { channel = "L0", value = .7 });
        Assert.Equal(HttpStatusCode.OK, command.StatusCode);
        Assert.Equal(0, output.SendCount);
    }

    [Fact]
    public async Task Shutdown_stops_an_accepted_server_script_and_releases_its_lease_before_returning()
    {
        var config = Input("AutoblowHttp");
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        var batches = Channel.CreateUnbounded<ExternalControlBatch>();
        store.CommandsReceived += batch => batches.Writer.TryWrite(batch);
        await listeners.ReloadAsync([config]);
        using var client = Client(config);
        using (var upload = Multipart(Encoding.UTF8.GetBytes("0,0\n600000,100\n")))
        using (var prepared = await client.PutAsync("/autoblow/sync-script/upload-csv", upload))
            Assert.Equal(HttpStatusCode.OK, prepared.StatusCode);
        using (var started = await client.PutAsJsonAsync("/autoblow/sync-script/start", new { startTimeMs = 0 }))
            Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        _ = await batches.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
        Assert.NotNull(store.GetStatus(config.Id)!.Session);
        await listeners.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Null(store.GetStatus(config.Id)!.Session);
        Assert.Empty(store.GetStatus(config.Id)!.Channels);
        while (batches.Reader.TryRead(out _)) { }
        await Assert.ThrowsAsync<TimeoutException>(() => batches.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromMilliseconds(120)));
        await Assert.ThrowsAsync<HttpRequestException>(() => client.GetAsync("/autoblow/state"));
    }

    [Fact]
    public async Task Listener_shutdown_cancels_an_incomplete_HTTP_body_instead_of_waiting_for_graceful_drain()
    {
        var config = Input("AutoblowHttp");
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([config]);
        using var client = Client(config);
        using var requestCancellation = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        using var content = new PendingUpload();
        var sending = client.PutAsync("/autoblow/sync-script/upload-csv", content, requestCancellation.Token);
        try
        {
            await content.Started.Task.WaitAsync(TimeSpan.FromSeconds(3));
            await Until(() => store.GetStatus(config.Id)?.Session is not null);
            await listeners.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(2));
            Assert.Null(store.GetStatus(config.Id)?.Session);
        }
        finally
        {
            content.Release.TrySetResult(); requestCancellation.Cancel();
            try { using var ignored = await sending.WaitAsync(TimeSpan.FromSeconds(3)); }
            catch (Exception error) when (error is OperationCanceledException or HttpRequestException) { }
        }
    }

    private static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    private static ProtocolInputConfig Input(string type = "JsonHttp") => new()
    {
        Id = "listener-input", Type = type, Enabled = true, Host = "127.0.0.1", Port = FreePort(), RouteToMotion = false,
        Features = [new() { Channel = "L0", TargetAxis = "L0" }],
    };
    private static int FreePort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }
    private static HttpClient Client(ProtocolInputConfig config) => new(new SocketsHttpHandler
    { UseProxy = false, UseCookies = false }) { BaseAddress = new Uri($"http://127.0.0.1:{config.Port}"), Timeout = TimeSpan.FromSeconds(4) };
    private static MultipartFormDataContent Multipart(byte[] bytes)
    {
        var content = new MultipartFormDataContent("sensa-isolated-contract-boundary");
        content.Add(new ByteArrayContent(bytes), "file", "script.csv");
        return content;
    }
    private static async Task<JsonElement> Body(HttpResponseMessage response)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.Clone();
    }
    private static async Task<ClientWebSocket> Connect(ProtocolInputConfig config)
    {
        var socket = new ClientWebSocket(); socket.Options.SetRequestHeader("Origin", "https://allowed.example");
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        try { await socket.ConnectAsync(new Uri($"ws://127.0.0.1:{config.Port}"), timeout.Token); return socket; }
        catch { socket.Dispose(); throw; }
    }
    private static async Task<JsonElement> Exchange(WebSocket socket, string message)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        await socket.SendAsync(Encoding.UTF8.GetBytes(message), WebSocketMessageType.Text, true, timeout.Token);
        using var body = new MemoryStream(); var buffer = new byte[4096]; WebSocketReceiveResult frame;
        do
        {
            frame = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), timeout.Token);
            if (frame.MessageType != WebSocketMessageType.Text) throw new InvalidDataException("Expected a protocol reply.");
            body.Write(buffer, 0, frame.Count);
        } while (!frame.EndOfMessage);
        using var document = JsonDocument.Parse(body.ToArray());
        return document.RootElement.Clone();
    }
    private static async Task AssertSocketEnded(WebSocket socket)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        try
        {
            var result = await socket.ReceiveAsync(new ArraySegment<byte>(new byte[32]), timeout.Token);
            Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        }
        catch (WebSocketException) { Assert.NotEqual(WebSocketState.Open, socket.State); }
    }
    private static async Task Until(Func<bool> predicate)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        while (!predicate()) await Task.Delay(10, timeout.Token);
    }
    private sealed class FixtureOutput : IMotionOutput
    {
        private readonly Channel<MotionFrame> _frames = Channel.CreateUnbounded<MotionFrame>();
        private int _sendCount;
        public int SendCount => Volatile.Read(ref _sendCount);
        public Task SendAsync(MotionFrame frame) { Interlocked.Increment(ref _sendCount); _frames.Writer.TryWrite(frame); return Task.CompletedTask; }
        public Task EmergencyStopAsync() => Task.CompletedTask;
        public Task<MotionFrame> Next() => _frames.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
    }
    private sealed class PendingUpload : HttpContent
    {
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public PendingUpload() => Headers.ContentType = new("multipart/form-data") { Parameters = { new("boundary", "pending-boundary") } };
        protected override bool TryComputeLength(out long length) { length = 0; return false; }
        protected override async Task SerializeToStreamAsync(Stream stream, TransportContext? context)
        {
            await stream.WriteAsync("--pending-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"script.csv\"\r\n\r\n0,0\n"u8.ToArray());
            await stream.FlushAsync(); Started.TrySetResult();
            await Release.Task.WaitAsync(TimeSpan.FromSeconds(8));
        }
    }
}
