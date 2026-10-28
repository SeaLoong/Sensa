using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Sensa.Input.Protocols;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Local protocol requests and fake time only: no cloud, Sensa process or device is contacted.</summary>
public sealed class HttpProtocolInputContracts
{
    [Fact]
    public async Task Json_status_does_not_acquire_control_and_single_or_batch_commands_preserve_values_and_duration()
    {
        var sink = new Sink();
        using var input = new HttpProtocolInput(Config(), sink);
        Assert.Equal(200, (await Request(input, "GET", "/status")).Status);
        Assert.Equal(0, sink.Acquisitions);
        var reply = await Request(input, "POST", "/commands", """{"commands":[{"channel":"L0","value":0.6,"durationMs":250},{"channel":"V0","value":0.3}]}""");
        Assert.Equal(200, reply.Status);
        Assert.Equal(new ExternalControlCommand("L0", .6, 250), sink.Commands[0]);
        Assert.Equal(new ExternalControlCommand("V0", .3), sink.Commands[1]);
        Assert.Single(sink.Batches);
        Assert.Equal(200, (await Request(input, "POST", "/command", """{"address":"/L0","value":0.4,"type":"Double","timestampMs":123}""")).Status);
        Assert.Equal(new ExternalControlCommand("L0", .4), sink.Commands[2]);
    }

    [Theory]
    [InlineData("""{"channel":"L0","value":-0.1}""")]
    [InlineData("""{"channel":"L0","value":1.1}""")]
    [InlineData("""{"channel":"L0","value":1e999}""")]
    [InlineData("""{"channel":"L0","value":0.5,"durationMs":-1}""")]
    [InlineData("""{"channel":"L0","value":0.5,"durationMs":600001}""")]
    [InlineData("""{"channel":"unknown","value":0.5}""")]
    [InlineData("""{"channel":"L0","value":0.5,"value":0.8}""")]
    [InlineData("""{"commands":[{"channel":"L0","value":0.5},{"channel":"L0","value":0.8}]}""")]
    [InlineData("""{"commands":[{"channel":"L0","value":0.5},{"channel":"V0","value":-1}]}""")]
    [InlineData("""{"commands":[]}""")]
    [InlineData("[]")]
    [InlineData("not JSON")]
    public async Task Invalid_Json_commands_never_publish_or_acquire_a_valid_prefix(string json)
    {
        var sink = new Sink();
        using var input = new HttpProtocolInput(Config(), sink);
        Assert.Equal(400, (await Request(input, "POST", "/commands", json)).Status);
        Assert.Empty(sink.Commands);
        Assert.Equal(0, sink.Acquisitions);
    }

    [Fact]
    public async Task Http_body_limits_methods_and_media_types_are_enforced_inside_the_handler()
    {
        var sink = new Sink();
        using var input = new HttpProtocolInput(Config(), sink);
        Assert.Equal(413, (await Request(input, "POST", "/", new string(' ', HttpProtocolInput.MaximumBodyBytes + 1))).Status);
        Assert.Equal(405, (await Request(input, "DELETE", "/")).Status);
        var context = Context("POST", "/", "{}");
        context.Request.ContentType = "text/plain";
        await input.HandleAsync(context);
        Assert.Equal(415, context.Response.StatusCode);
        Assert.Empty(sink.Commands);
    }

    [Fact]
    public async Task A_different_http_source_cannot_take_an_active_lease_and_expiration_allows_fresh_control()
    {
        var sink = new Sink();
        var clock = new ManualTimeProvider();
        using var input = new HttpProtocolInput(Config(), sink, clock);
        Assert.Equal(200, (await Request(input, "POST", "/", """{"channel":"L0","value":0.1}""", "https://first.example")).Status);
        Assert.Equal(409, (await Request(input, "POST", "/", """{"channel":"L0","value":0.8}""", "https://second.example")).Status);
        Assert.Single(sink.Commands);
        clock.Advance(TimeSpan.FromSeconds(10));
        Assert.Equal(1, sink.Releases);
        Assert.Equal(200, (await Request(input, "POST", "/", """{"channel":"L0","value":0.8}""", "https://second.example")).Status);
        Assert.Equal(2, sink.Commands.Count);
    }

    [Fact]
    public async Task Json_heartbeat_does_not_replay_a_target_and_explicit_stop_selects_a_channel()
    {
        var sink = new Sink();
        var clock = new ManualTimeProvider();
        using var input = new HttpProtocolInput(Config(), sink, clock);
        await Request(input, "POST", "/", """{"path":"L0","value":0.2}""");
        clock.Advance(TimeSpan.FromSeconds(6));
        Assert.Equal(200, (await Request(input, "POST", "/heartbeat", "{}")).Status);
        clock.Advance(TimeSpan.FromSeconds(6));
        Assert.Equal(0, sink.Releases);
        Assert.Single(sink.Commands);
        Assert.Equal(200, (await Request(input, "POST", "/stop", """{"channel":"L0"}""")).Status);
        Assert.Equal("L0", Assert.Single(sink.Stops));
    }

    [Fact]
    public async Task Lovense_discovery_returns_a_named_virtual_toy_without_acquiring_or_claiming_battery_feedback()
    {
        var sink = new Sink();
        using var input = new HttpProtocolInput(Config("LovenseHttp"), sink);
        var reply = await Request(input, "POST", "/command", """{"command":"GetToys"}""");
        Assert.Equal(200, reply.Status);
        Assert.Equal(200, reply.Body.GetProperty("code").GetInt32());
        using var toys = JsonDocument.Parse(reply.Body.GetProperty("data").GetProperty("toys").GetString()!);
        var toy = toys.RootElement.GetProperty("test-input");
        Assert.Equal("Sensa Virtual Device", toy.GetProperty("name").GetString());
        Assert.False(toy.TryGetProperty("battery", out _));
        Assert.Equal(0, sink.Acquisitions);
    }

    [Fact]
    public async Task Lovense_function_targets_only_configured_actuators_and_All_fills_remaining_features()
    {
        var sink = new Sink();
        using var input = new HttpProtocolInput(Config("LovenseHttp"), sink);
        Assert.Equal(200, (await Request(input, "POST", "/command", """{"command":"Function","action":"Vibrate:4,All:10","timeSec":0,"apiVer":1}""")).Status);
        Assert.Equal(new ExternalControlCommand("V0", .2), sink.Commands[0]);
        Assert.Equal(new ExternalControlCommand("rotation", .5), sink.Commands[1]);
        Assert.DoesNotContain(sink.Commands, command => command.Channel == "L0");
    }

    [Theory]
    [InlineData("Vibrate:21")]
    [InlineData("Pump:3")]
    [InlineData("Thrusting:10")]
    [InlineData("Position:50")]
    [InlineData("Vibrate:10,Vibrate:12")]
    public async Task Lovense_rejects_unconfigured_semantics_instead_of_turning_intensity_into_position(string action)
    {
        var sink = new Sink();
        using var input = new HttpProtocolInput(Config("LovenseHttp"), sink);
        var json = JsonSerializer.Serialize(new { command = "Function", action, timeSec = 0, apiVer = 1 });
        Assert.Equal(400, (await Request(input, "POST", "/command", json)).Status);
        Assert.Empty(sink.Commands);
        Assert.Equal(0, sink.Acquisitions);
    }

    [Fact]
    public async Task Lovense_finite_effect_and_loop_pause_execute_with_fake_time_and_stop_at_the_total_duration()
    {
        var sink = new Sink();
        var clock = new ManualTimeProvider();
        using var input = new HttpProtocolInput(Config("LovenseHttp"), sink, clock);
        Assert.Equal(200, (await Request(input, "POST", "/command", """{"command":"Function","action":"Vibrate:12","timeSec":6,"loopRunningSec":2,"loopPauseSec":2,"apiVer":1}""")).Status);
        Assert.Equal(.6, sink.Commands[^1].Value);
        clock.Advance(TimeSpan.FromSeconds(2));
        Assert.Equal(0, sink.Commands[^1].Value);
        clock.Advance(TimeSpan.FromSeconds(2));
        Assert.Equal(.6, sink.Commands[^1].Value);
        clock.Advance(TimeSpan.FromSeconds(2));
        Assert.Contains("V0", sink.Stops);
        var count = sink.Commands.Count;
        clock.Advance(TimeSpan.FromSeconds(2));
        Assert.Equal(count, sink.Commands.Count);
    }

    [Fact]
    public async Task Lovense_basic_lan_get_preserves_rotation_direction_and_enforces_toy_identity()
    {
        var sink = new Sink();
        using var input = new HttpProtocolInput(Config("LovenseHttp"), sink);
        var context = Context("GET", "/RotateAntiClockwise", "");
        context.Request.QueryString = new QueryString("?v=8&t=test-input");
        await input.HandleAsync(context);
        Assert.Equal(200, context.Response.StatusCode);
        Assert.Equal(new ExternalControlCommand("rotation", .4, Clockwise: false), Assert.Single(sink.Commands));
        context = Context("GET", "/Vibrate", "");
        context.Request.QueryString = new QueryString("?v=8&t=another-toy");
        await input.HandleAsync(context);
        Assert.Equal(400, context.Response.StatusCode);
        Assert.Single(sink.Commands);
    }

    [Fact]
    public async Task Handy_queries_are_virtual_metadata_and_xpt_requires_mode_with_percent_position_and_millisecond_duration()
    {
        var sink = new Sink();
        using var input = new HttpProtocolInput(Config("HandyHttp"), sink);
        var info = await Request(input, "GET", "/api/handy/v2/info");
        Assert.Equal("Sensa Virtual Device", info.Body.GetProperty("model").GetString());
        Assert.True(info.Body.GetProperty("virtualDevice").GetBoolean());
        Assert.Equal(0, sink.Acquisitions);
        Assert.Equal(409, (await Request(input, "PUT", "/hdsp/xpt", """{"position":70,"duration":230}""")).Status);
        Assert.Equal(200, (await Request(input, "PUT", "/mode", """{"mode":2}""")).Status);
        Assert.Equal(200, (await Request(input, "PUT", "/hdsp/xpt", """{"position":70,"duration":230,"immediateResponse":true}""")).Status);
        Assert.Equal(new ExternalControlCommand("L0", .7, 230), Assert.Single(sink.Commands));
    }

    [Fact]
    public async Task Handy_speed_uses_the_configured_virtual_scale_and_requires_a_known_commanded_start()
    {
        var sink = new Sink();
        var clock = new ManualTimeProvider();
        var config = Config("HandyHttp"); config.MaxSpeedPerSecond = 2;
        using var input = new HttpProtocolInput(config, sink, clock);
        await Request(input, "PUT", "/mode", """{"mode":2}""");
        Assert.Equal(409, (await Request(input, "PUT", "/hdsp/xpvp", """{"position":75,"velocity":50}""")).Status);
        Assert.Empty(sink.Commands);
        await Request(input, "PUT", "/hdsp/xpt", """{"position":25,"duration":200}""");
        clock.Advance(TimeSpan.FromMilliseconds(200));
        Assert.Equal(200, (await Request(input, "PUT", "/hdsp/xpvp", """{"position":75,"velocity":50}""")).Status);
        Assert.Equal(new ExternalControlCommand("L0", .75, 500), sink.Commands[^1]);
    }

    [Fact]
    public async Task Handy_alternating_motion_preserves_mode_handoff_timing_and_explicit_stop()
    {
        var sink = new Sink();
        var clock = new ManualTimeProvider();
        var config = Config("HandyHttp"); config.MaxSpeedPerSecond = 2;
        using var input = new HttpProtocolInput(config, sink, clock);
        await Request(input, "PUT", "/mode", """{"mode":2}""");
        await Request(input, "PUT", "/hdsp/xpt", """{"position":20,"duration":0}""");
        await Request(input, "PUT", "/mode", """{"mode":0}""");
        await Request(input, "PUT", "/hamp/velocity", """{"velocity":50}""");
        Assert.Equal(200, (await Request(input, "PUT", "/hamp/start", "{}")).Status);
        Assert.Equal(new ExternalControlCommand("L0", 1, 800), sink.Commands[^1]);
        clock.Advance(TimeSpan.FromMilliseconds(800));
        Assert.Equal(new ExternalControlCommand("L0", 0, 1000), sink.Commands[^1]);
        clock.Advance(TimeSpan.FromMilliseconds(1000));
        Assert.Equal(new ExternalControlCommand("L0", 1, 1000), sink.Commands[^1]);
        await Request(input, "PUT", "/hamp/stop", "{}");
        var count = sink.Commands.Count;
        clock.Advance(TimeSpan.FromSeconds(2));
        Assert.Equal(count, sink.Commands.Count);
    }

    [Fact]
    public async Task Handy_script_download_prepare_play_seek_loop_and_stop_use_the_shared_bounded_trajectory()
    {
        var bytes = Encoding.UTF8.GetBytes("0,0\n1000,100\n2000,0\n");
        var sink = new Sink();
        var clock = new ManualTimeProvider();
        using var http = new HttpClient(new ScriptPeer(bytes));
        using var input = new HttpProtocolInput(Config("HandyHttp"), sink, clock, http);
        await Request(input, "PUT", "/mode", """{"mode":1}""");
        Assert.Equal(200, (await Request(input, "PUT", "/hssp/setup", """{"url":"http://127.0.0.1:9123/script.csv"}""")).Status);
        Assert.Empty(sink.Commands);
        var play = JsonSerializer.Serialize(new { startTime = 0, estimatedServerTime = clock.GetUtcNow().ToUnixTimeMilliseconds() });
        Assert.Equal(200, (await Request(input, "PUT", "/hssp/play", play)).Status);
        clock.Advance(TimeSpan.FromMilliseconds(500));
        Assert.Equal(.55, sink.Commands[^1].Value, 10);
        Assert.Equal(50, sink.Commands[^1].DurationMs);
        await Request(input, "PUT", "/hssp/play", """{"startTime":1500}""");
        Assert.Equal(.45, sink.Commands[^1].Value, 10);
        await Request(input, "PUT", "/hssp/stop", "{}");
        var count = sink.Commands.Count;
        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.Equal(count, sink.Commands.Count);
    }

    [Fact]
    public async Task Accepted_finite_script_outlives_http_idle_timeout_but_looping_stops_at_the_task_deadline()
    {
        var sink = new Sink();
        var clock = new ManualTimeProvider();
        var config = Config("HandyHttp"); config.TimeoutMs = 1000; config.MaxScriptDurationMs = 12000;
        using var http = new HttpClient(new ScriptPeer(Encoding.UTF8.GetBytes("0,0\n20000,100\n")));
        using var input = new HttpProtocolInput(config, sink, clock, http);
        await Request(input, "PUT", "/mode", """{"mode":1}""");
        await Request(input, "PUT", "/hssp/setup", """{"url":"http://127.0.0.1:9123/script.csv"}""");
        await Request(input, "PUT", "/hssp/loop", """{"activated":true}""");
        await Request(input, "PUT", "/hssp/play", """{"startTime":0}""");
        clock.Advance(TimeSpan.FromSeconds(11));
        Assert.Equal(0, sink.Releases);
        Assert.InRange(sink.Commands[^1].Value, .55, .56);
        var count = sink.Commands.Count;
        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.Contains("L0", sink.Stops);
        var completed = sink.Commands.Count;
        Assert.True(completed >= count);
        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.Equal(completed, sink.Commands.Count);
    }

    [Fact]
    public async Task Handy_setup_checks_sha256_and_never_reports_failed_download_or_unprepared_play_as_success()
    {
        var bytes = Encoding.UTF8.GetBytes("0,0\n1000,100\n");
        var sink = new Sink();
        using var http = new HttpClient(new ScriptPeer(bytes));
        using var input = new HttpProtocolInput(Config("HandyHttp"), sink, scriptClient: http);
        await Request(input, "PUT", "/mode", """{"mode":1}""");
        Assert.Equal(409, (await Request(input, "PUT", "/hssp/play", """{"startTime":0}""")).Status);
        var setup = JsonSerializer.Serialize(new { url = "http://127.0.0.1:9123/script.csv", sha256 = Convert.ToHexString(SHA256.HashData(bytes)) });
        Assert.Equal(200, (await Request(input, "PUT", "/hssp/setup", setup)).Status);
        setup = JsonSerializer.Serialize(new { url = "http://127.0.0.1:9123/script.csv", sha256 = new string('0', 64) });
        Assert.Equal(400, (await Request(input, "PUT", "/hssp/setup", setup)).Status);
        Assert.Equal(409, (await Request(input, "PUT", "/hssp/play", """{"startTime":0}""")).Status);
        Assert.Empty(sink.Commands);
    }

    [Fact]
    public async Task Clearing_runtime_commands_cancels_background_playback_instead_of_repopulating_old_targets()
    {
        var config = Config("HandyHttp");
        var clock = new ManualTimeProvider();
        using var store = new ExternalControlStore([config], clock);
        using var http = new HttpClient(new ScriptPeer(Encoding.UTF8.GetBytes("0,0\n20000,100\n")));
        using var input = new HttpProtocolInput(config, store, clock, http);
        await Request(input, "PUT", "/mode", """{"mode":1}""");
        await Request(input, "PUT", "/hssp/setup", """{"url":"http://127.0.0.1:9123/script.csv"}""");
        await Request(input, "PUT", "/hssp/play", """{"startTime":0}""");
        clock.Advance(TimeSpan.FromMilliseconds(200));
        Assert.True(store.Read("test-input/L0/target", clock.GetUtcNow().ToUnixTimeMilliseconds()).Valid);
        store.ClearCommands();
        clock.Advance(TimeSpan.FromSeconds(2));
        Assert.False(store.Read("test-input/L0/target", clock.GetUtcNow().ToUnixTimeMilliseconds()).Valid);
    }

    [Fact]
    public async Task Json_websocket_status_is_a_query_and_does_not_take_control()
    {
        var sink = new Sink();
        using var input = new HttpProtocolInput(Config("JsonWebSocket"), sink);
        using var socket = new FixtureSocket("""{"command":"status"}""");
        await input.RunAsync(socket);
        Assert.Equal(0, sink.Acquisitions);
        Assert.Equal(0, sink.Releases);
        Assert.Empty(sink.Commands);
        Assert.True(JsonDocument.Parse(Assert.Single(socket.Responses)).RootElement.GetProperty("ok").GetBoolean());
    }

    [Fact]
    public async Task A_runtime_reset_cancels_pending_script_preparation_and_prevents_late_publication()
    {
        var config = Config("HandyHttp");
        using var store = new ExternalControlStore([config]);
        var peer = new PendingScriptPeer();
        using var http = new HttpClient(peer);
        using var input = new HttpProtocolInput(config, store, scriptClient: http);
        await Request(input, "PUT", "/mode", """{"mode":1}""");
        var preparing = Request(input, "PUT", "/hssp/setup", """{"url":"http://127.0.0.1:9123/script.csv"}""");
        await peer.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));
        store.ClearCommands();
        Assert.Equal(409, (await preparing.WaitAsync(TimeSpan.FromSeconds(2))).Status);
        Assert.Equal(409, (await Request(input, "PUT", "/hssp/play", """{"startTime":0}""")).Status);
        Assert.False(store.Read("test-input/L0", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()).Valid);
    }

    [Fact]
    public async Task Malformed_Handy_payload_types_and_unknown_JSON_routes_do_not_escape_validation()
    {
        var sink = new Sink();
        using var input = new HttpProtocolInput(Config("HandyHttp"), sink);
        await Request(input, "PUT", "/mode", """{"mode":1}""");
        Assert.Equal(400, (await Request(input, "PUT", "/hssp/setup", "")).Status);
        Assert.Equal(400, (await Request(input, "PUT", "/hssp/loop", "")).Status);
        Assert.Equal(404, (await Request(input, "PUT", "/unsupported", "{}")).Status);
        using var json = new HttpProtocolInput(Config(), new Sink());
        Assert.Equal(404, (await Request(json, "POST", "/unsupported", """{"command":"stop"}""")).Status);
        Assert.Empty(sink.Commands);
    }

    [Fact]
    public async Task An_accepted_HDsp_move_keeps_its_lease_until_arrival_plus_the_configured_idle_grace()
    {
        var sink = new Sink();
        var clock = new ManualTimeProvider();
        var config = Config("HandyHttp"); config.TimeoutMs = 1000;
        using var input = new HttpProtocolInput(config, sink, clock);
        await Request(input, "PUT", "/mode", """{"mode":2}""");
        await Request(input, "PUT", "/hdsp/xpt", """{"position":80,"duration":100000}""");
        clock.Advance(TimeSpan.FromSeconds(100));
        Assert.Equal(0, sink.Releases);
        Assert.Single(sink.Commands);
        clock.Advance(TimeSpan.FromMilliseconds(999));
        Assert.Equal(0, sink.Releases);
        clock.Advance(TimeSpan.FromMilliseconds(1));
        Assert.Equal(1, sink.Releases);
    }

    [Fact]
    public async Task A_short_HDsp_replacement_replaces_the_long_old_deadline_instead_of_inheriting_it()
    {
        var sink = new Sink();
        var clock = new ManualTimeProvider();
        var config = Config("HandyHttp"); config.TimeoutMs = 1000;
        using var input = new HttpProtocolInput(config, sink, clock);
        await Request(input, "PUT", "/mode", """{"mode":2}""");
        await Request(input, "PUT", "/hdsp/xpt", """{"position":80,"duration":100000}""");
        clock.Advance(TimeSpan.FromMilliseconds(500));
        await Request(input, "PUT", "/hdsp/xpt", """{"position":20,"duration":200}""");
        clock.Advance(TimeSpan.FromMilliseconds(1199));
        Assert.Equal(0, sink.Releases);
        clock.Advance(TimeSpan.FromMilliseconds(1));
        Assert.Equal(1, sink.Releases);
        Assert.Equal(2, sink.Commands.Count);
    }

    [Fact]
    public async Task Explicit_HDsp_stop_cancels_the_move_immediately_and_clears_its_old_arrival_deadline()
    {
        var sink = new Sink();
        var clock = new ManualTimeProvider();
        var config = Config("HandyHttp"); config.TimeoutMs = 1000;
        using var input = new HttpProtocolInput(config, sink, clock);
        await Request(input, "PUT", "/mode", """{"mode":2}""");
        await Request(input, "PUT", "/hdsp/xpt", """{"position":80,"duration":100000}""");
        var stops = sink.Stops.Count;
        await Request(input, "PUT", "/hdsp/xpvp", """{"position":80,"velocity":0}""");
        Assert.Equal(stops + 1, sink.Stops.Count);
        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.Equal(1, sink.Releases);
        Assert.Single(sink.Commands);
    }

    [Fact]
    public async Task Runtime_clear_removes_HDsp_arrival_deadlines_as_well_as_pending_motion()
    {
        var clock = new ManualTimeProvider();
        var config = Config("HandyHttp"); config.TimeoutMs = 1000;
        using var store = new ExternalControlStore([config], clock);
        using var input = new HttpProtocolInput(config, store, clock);
        await Request(input, "PUT", "/mode", """{"mode":2}""");
        await Request(input, "PUT", "/hdsp/xpt", """{"position":80,"duration":100000}""");
        Assert.NotNull(store.GetStatus(config.Id)!.Session);
        store.ClearCommands();
        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.Null(store.GetStatus(config.Id)!.Session);
    }

    [Fact]
    public async Task HAMP_remains_a_stream_lease_and_cannot_run_forever_after_the_source_disappears()
    {
        var sink = new Sink();
        var clock = new ManualTimeProvider();
        var config = Config("HandyHttp"); config.TimeoutMs = 1000; config.MaxSpeedPerSecond = 2;
        using var input = new HttpProtocolInput(config, sink, clock);
        await Request(input, "PUT", "/mode", """{"mode":2}""");
        await Request(input, "PUT", "/hdsp/xpt", """{"position":20,"duration":0}""");
        await Request(input, "PUT", "/mode", """{"mode":0}""");
        await Request(input, "PUT", "/hamp/velocity", """{"velocity":50}""");
        await Request(input, "PUT", "/hamp/start", "{}");
        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.Equal(1, sink.Releases);
        var count = sink.Commands.Count;
        clock.Advance(TimeSpan.FromSeconds(2));
        Assert.Equal(count, sink.Commands.Count);
    }

    [Fact]
    public async Task Json_websocket_disconnect_releases_only_its_own_session()
    {
        var sink = new Sink();
        using var input = new HttpProtocolInput(Config("JsonWebSocket"), sink);
        using var socket = new FixtureSocket("""{"channel":"L0","value":0.4,"durationMs":100}""");
        await input.RunAsync(socket);
        Assert.Equal(new ExternalControlCommand("L0", .4, 100), Assert.Single(sink.Commands));
        Assert.Equal(1, sink.Releases);
        Assert.True(JsonDocument.Parse(Assert.Single(socket.Responses)).RootElement.GetProperty("ok").GetBoolean());
    }

    private static ProtocolInputConfig Config(string type = "JsonHttp") => new()
    {
        Id = "test-input", Name = "Isolated virtual device", Type = type, Enabled = true, TimeoutMs = 10000,
        Features = [new() { Channel = "L0", Actuator = "Position", TargetAxis = "L0" },
            new() { Channel = "V0", Actuator = "Scalar", TargetAxis = "V0" },
            new() { Channel = "rotation", Actuator = "Rotation", TargetAxis = "" }],
    };
    private static DefaultHttpContext Context(string method, string path, string body, string origin = "https://source.example")
    {
        var context = new DefaultHttpContext();
        context.Request.Method = method;
        context.Request.Path = path;
        context.Request.ContentType = "application/json";
        var bytes = Encoding.UTF8.GetBytes(body);
        context.Request.Body = new MemoryStream(bytes);
        context.Request.ContentLength = bytes.Length;
        context.Request.Headers.Origin = origin;
        context.Connection.RemoteIpAddress = IPAddress.Loopback;
        context.Response.Body = new MemoryStream();
        return context;
    }
    private static async Task<(int Status, JsonElement Body)> Request(HttpProtocolInput input, string method, string path, string body = "", string origin = "https://source.example")
    {
        var context = Context(method, path, body, origin);
        await input.HandleAsync(context);
        context.Response.Body.Position = 0;
        using var document = await JsonDocument.ParseAsync(context.Response.Body);
        return (context.Response.StatusCode, document.RootElement.Clone());
    }
    private sealed class Sink : IExternalControlSink
    {
        public readonly List<ExternalControlCommand> Commands = [];
        public readonly List<IReadOnlyList<ExternalControlCommand>> Batches = [];
        public readonly List<string?> Stops = [];
        public int Acquisitions;
        public int Releases;
        private string? _owner;
        public bool TryAcquire(string inputId, string sessionId, out string error)
        {
            error = "";
            if (_owner is not null && _owner != sessionId) { error = "Busy"; return false; }
            _owner = sessionId;
            Acquisitions++;
            return true;
        }
        public bool Publish(string inputId, string sessionId, IReadOnlyList<ExternalControlCommand> commands, out string error)
        {
            error = "";
            if (_owner != sessionId) { error = "Not owner"; return false; }
            Commands.AddRange(commands); Batches.Add(commands.ToArray()); return true;
        }
        public void Stop(string inputId, string sessionId, string? channel = null) { if (_owner == sessionId) Stops.Add(channel); }
        public void Release(string inputId, string sessionId) { if (_owner == sessionId) { _owner = null; Releases++; } }
        public void Heartbeat(string inputId, string sessionId) { }
    }
    private sealed class ScriptPeer(byte[] content) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal(HttpMethod.Get, request.Method);
            Assert.Null(request.Headers.Authorization);
            Assert.False(request.Headers.Contains("Cookie"));
            Assert.False(request.Headers.Contains("X-Connection-Key"));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { RequestMessage = request, Content = new ByteArrayContent(content) });
        }
    }
    private sealed class PendingScriptPeer : HttpMessageHandler
    {
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource<HttpResponseMessage> _response = new(TaskCreationOptions.RunContinuationsAsynchronously);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Started.TrySetResult();
            return await _response.Task.WaitAsync(cancellationToken);
        }
    }
    private sealed class FixtureSocket(string message) : WebSocket
    {
        private WebSocketState _state = WebSocketState.Open;
        private bool _received;
        public List<string> Responses { get; } = [];
        public override WebSocketCloseStatus? CloseStatus => null;
        public override string? CloseStatusDescription => null;
        public override string? SubProtocol => null;
        public override WebSocketState State => _state;
        public override void Abort() => _state = WebSocketState.Aborted;
        public override void Dispose() => _state = WebSocketState.Closed;
        public override Task CloseAsync(WebSocketCloseStatus status, string? reason, CancellationToken token) => CloseOutputAsync(status, reason, token);
        public override Task CloseOutputAsync(WebSocketCloseStatus status, string? reason, CancellationToken token) { _state = WebSocketState.Closed; return Task.CompletedTask; }
        public override Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer, CancellationToken token)
        {
            if (_received) { _state = WebSocketState.CloseReceived; return Task.FromResult(new WebSocketReceiveResult(0, WebSocketMessageType.Close, true)); }
            var bytes = Encoding.UTF8.GetBytes(message); bytes.CopyTo(buffer.AsSpan()); _received = true;
            return Task.FromResult(new WebSocketReceiveResult(bytes.Length, WebSocketMessageType.Text, true));
        }
        public override Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType type, bool end, CancellationToken token)
        { Responses.Add(Encoding.UTF8.GetString(buffer)); return Task.CompletedTask; }
    }
}
