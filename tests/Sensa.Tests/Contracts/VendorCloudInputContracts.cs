using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Sensa.Input.Protocols;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class VendorCloudInputContracts
{
    [Fact]
    public async Task Discovery_identifies_a_virtual_device_and_unknown_operations_never_move()
    {
        var sink = new Sink(); using var input = new VendorCloudInputSession(Config(), sink);
        var connected = await Call(input, "/autoblow/connected", method: "GET");
        Assert.True(connected.Body.GetProperty("emulated").GetBoolean());
        Assert.Equal("autoblow-ultra", connected.Body.GetProperty("deviceType").GetString());
        var info = await Call(input, "/autoblow/info", method: "GET");
        Assert.Equal("EMULATED", info.Body.GetProperty("firmwareStatus").GetString());
        Assert.Equal(404, (await Call(input, "/autoblow/local-script", "{}" )).Status);
        Assert.Equal(405, (await Call(input, "/autoblow/goto", method: "GET")).Status);
        Assert.Empty(sink.Batches);
    }

    [Fact]
    public async Task Owner_and_local_token_are_enforced_without_echoing_credentials()
    {
        var config = Config(); config.Identifier = "local-example-token";
        var sink = new Sink(); var clock = new ManualTimeProvider(); using var input = new VendorCloudInputSession(config, sink, clock);
        var denied = await Call(input, "/autoblow/connected", method: "GET", token: "incorrect-example-token");
        Assert.Equal(401, denied.Status); Assert.DoesNotContain("incorrect-example-token", denied.Body.ToString());
        Assert.Equal(200, (await Call(input, "/autoblow/connected", method: "GET", token: config.Identifier)).Status);
        Assert.Null(sink.Owner);
        Assert.Equal(200, (await Call(input, "/autoblow/sync-script/offset", "{\"offsetTimeMs\":0}", token: config.Identifier)).Status);
        Assert.Equal(409, (await Call(input, "/autoblow/sync-script/offset", "{\"offsetTimeMs\":0}", session: "another", token: config.Identifier)).Status);
        Assert.Equal(200, (await Call(input, "/autoblow/state", method: "GET", session: "another", token: config.Identifier)).Status);
        clock.Advance(TimeSpan.FromMilliseconds(config.TimeoutMs));
        Assert.Equal(200, (await Call(input, "/autoblow/sync-script/offset", "{\"offsetTimeMs\":0}", session: "another", token: config.Identifier)).Status);
        Assert.True(sink.Releases > 0);
    }

    [Theory]
    [InlineData("AutoblowHttp", "/autoblow")]
    [InlineData("VacuGlideHttp", "/vacuglide")]
    public async Task Website_origin_is_not_a_vendor_http_controller_identity(string type, string prefix)
    {
        var sink = new Sink();
        using var input = new VendorCloudInputSession(Config(type), sink);
        Assert.Equal(200, (await Call(input, prefix + "/sync-script/offset", "{\"offsetTimeMs\":0}", origin: "https://first.example")).Status);
        var owner = sink.Owner;
        Assert.Equal(200, (await Call(input, prefix + "/sync-script/offset", "{\"offsetTimeMs\":50}", origin: "https://second.example")).Status);
        Assert.Equal(owner, sink.Owner);
        Assert.Equal(409, (await Call(input, prefix + "/sync-script/offset", "{\"offsetTimeMs\":0}", session: "different-client", origin: "https://second.example")).Status);
        Assert.Equal(owner, sink.Owner);
        Assert.Empty(sink.Batches);
    }

    [Theory]
    [InlineData("AutoblowHttp", "/autoblow")]
    [InlineData("VacuGlideHttp", "/vacuglide")]
    public async Task Discovery_and_status_do_not_acquire_or_extend_a_control_lease(string type, string prefix)
    {
        var clock = new ManualTimeProvider(); var sink = new Sink(); var config = Config(type);
        using var input = new VendorCloudInputSession(config, sink, clock);
        foreach (var endpoint in new[] { "/connected", "/info", "/state" })
            Assert.Equal(200, (await Call(input, prefix + endpoint, method: "GET", session: "observer")).Status);
        Assert.Null(sink.Owner);
        Assert.Equal(200, (await Call(input, prefix + "/sync-script/offset", "{\"offsetTimeMs\":0}", session: "controller")).Status);
        var owner = sink.Owner; Assert.NotNull(owner);
        clock.Advance(TimeSpan.FromMilliseconds(config.TimeoutMs / 2));
        foreach (var endpoint in new[] { "/connected", "/info", "/state" })
            Assert.Equal(200, (await Call(input, prefix + endpoint, method: "GET", session: "observer")).Status);
        Assert.Equal(owner, sink.Owner);
        clock.Advance(TimeSpan.FromMilliseconds(config.TimeoutMs / 2));
        Assert.Null(sink.Owner);
        Assert.Equal(200, (await Call(input, prefix + "/sync-script/offset", "{\"offsetTimeMs\":0}", session: "next-controller")).Status);
        Assert.NotNull(sink.Owner); Assert.NotEqual(owner, sink.Owner); Assert.Empty(sink.Batches);
    }

    [Fact]
    public async Task Url_csv_is_loaded_played_with_virtual_time_and_stopped_without_stale_frames()
    {
        var sink = new Sink(); var clock = new ManualTimeProvider();
        using var client = Client("0,0\n1000,100\n2000,0\n");
        using var input = new VendorCloudInputSession(Config(), sink, clock, client);
        var upload = await Call(input, "/autoblow/sync-script/upload-csv-url", "{\"url\":\"https://8.8.8.8/script.csv\"}");
        Assert.Equal(200, upload.Status); Assert.NotEmpty(upload.Body.GetProperty("syncScriptToken").GetString()!);
        Assert.Empty(sink.Batches);
        Assert.Equal(200, (await Call(input, "/autoblow/sync-script/start", "{\"startTimeMs\":0}")).Status);
        Assert.Equal(0, sink.Batches[^1][0].Value);
        clock.Advance(TimeSpan.FromMilliseconds(500)); Assert.Equal(.5, sink.Batches[^1][0].Value, 8);
        var state = await Call(input, "/autoblow/state", method: "GET"); Assert.Equal(500, state.Body.GetProperty("syncScriptCurrentTime").GetInt64());
        await Call(input, "/autoblow/sync-script/stop"); var count = sink.Batches.Count;
        clock.Advance(TimeSpan.FromSeconds(2)); Assert.Equal(count, sink.Batches.Count); Assert.True(sink.Stops > 0);
    }

    [Fact]
    public async Task Offset_seek_and_completion_use_the_documented_milliseconds_and_do_not_restart()
    {
        var sink = new Sink(); var clock = new ManualTimeProvider(); using var client = Client("0,0\n1000,100\n");
        var config = Config(); config.TimeoutMs = 5000;
        using var input = new VendorCloudInputSession(config, sink, clock, client);
        await Call(input, "/autoblow/sync-script/upload-csv-url", "{\"url\":\"https://8.8.8.8/script.csv\"}");
        await Call(input, "/autoblow/sync-script/offset", "{\"offsetTimeMs\":100}");
        await Call(input, "/autoblow/sync-script/start", "{\"startTimeMs\":400}"); Assert.Equal(.5, sink.Batches[^1][0].Value, 8);
        clock.Advance(TimeSpan.FromMilliseconds(600));
        Assert.Equal(1, sink.Batches[^1][0].Value); var count = sink.Batches.Count;
        clock.Advance(TimeSpan.FromSeconds(1)); Assert.Equal(count, sink.Batches.Count);
        var state = await Call(input, "/autoblow/state", method: "GET");
        Assert.Equal("SYNC_SCRIPT_PAUSED", state.Body.GetProperty("operationalMode").GetString());
        Assert.Equal(1000, state.Body.GetProperty("syncScriptCurrentTime").GetInt64());
    }

    [Fact]
    public async Task Multipart_funscript_is_a_real_local_upload_and_tokens_reload_without_playing()
    {
        var sink = new Sink(); var clock = new ManualTimeProvider(); using var input = new VendorCloudInputSession(Config(), sink, clock);
        using var form = new MultipartFormDataContent();
        form.Add(new ByteArrayContent("{\"actions\":[{\"at\":0,\"pos\":20},{\"at\":1000,\"pos\":80}]}"u8.ToArray()), "file", "test.funscript");
        var upload = await Call(input, "/autoblow/sync-script/upload-funscript", bytes: await form.ReadAsByteArrayAsync(), contentType: form.Headers.ContentType!.ToString());
        Assert.Equal(200, upload.Status); var token = upload.Body.GetProperty("syncScriptToken").GetString();
        Assert.Empty(sink.Batches);
        await Call(input, "/autoblow/sync-script/start", "{\"startTimeMs\":0}"); Assert.Equal(.2, sink.Batches[^1][0].Value, 8);
        await Call(input, "/autoblow/sync-script/load-token", JsonSerializer.Serialize(new { scriptToken = token }));
        var count = sink.Batches.Count; clock.Advance(TimeSpan.FromSeconds(1)); Assert.Equal(count, sink.Batches.Count);
        Assert.Equal(404, (await Call(input, "/autoblow/sync-script/load-token", "{\"scriptToken\":\"unknown\"}")).Status);
    }

    [Theory]
    [InlineData("http://example.com/script.csv")]
    [InlineData("https://192.168.1.1/script.csv")]
    [InlineData("https://169.254.169.254/script.csv")]
    [InlineData("https://[::ffff:10.0.0.1]/script.csv")]
    [InlineData("https://example.internal/script.csv")]
    [InlineData("https://name:password@example.com/script.csv")]
    [InlineData("file:///etc/passwd")]
    public async Task Script_fetch_rejects_nonpublic_destinations_before_sending(string url)
    {
        var sent = 0; using var client = new HttpClient(new Handler((request, token) => { sent++; throw new InvalidOperationException(); }));
        var sink = new Sink(); using var input = new VendorCloudInputSession(Config(), sink, new ManualTimeProvider(), client);
        Assert.Equal(400, (await Call(input, "/autoblow/sync-script/upload-csv-url", JsonSerializer.Serialize(new { url }))).Status);
        Assert.Equal(0, sent); Assert.Empty(sink.Batches);
    }

    [Fact]
    public async Task Script_redirects_and_declared_or_streamed_oversize_are_rejected()
    {
        foreach (var response in new[]
        {
            new HttpResponseMessage(HttpStatusCode.Redirect) { Headers = { Location = new Uri("http://169.254.169.254/") } },
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(new string('0', ProtocolScriptLoader.MaximumBytes + 1)) },
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamContent(new MemoryStream(new byte[ProtocolScriptLoader.MaximumBytes + 1])) },
        })
        {
            var sent = 0; using var client = new HttpClient(new Handler((request, token) => { sent++; return Task.FromResult(response); }));
            var sink = new Sink(); using var input = new VendorCloudInputSession(Config(), sink, new ManualTimeProvider(), client);
            Assert.Equal(400, (await Call(input, "/autoblow/sync-script/upload-csv-url", "{\"url\":\"http://127.0.0.1/script.csv\"}")).Status);
            Assert.Equal(1, sent); Assert.Empty(sink.Batches);
        }
    }

    [Fact]
    public async Task Script_fetch_does_not_forward_the_local_device_token_or_origin()
    {
        using var client = new HttpClient(new Handler((request, token) =>
        {
            Assert.Null(request.Headers.Authorization); Assert.False(request.Headers.Contains("Cookie"));
            Assert.False(request.Headers.Contains("x-device-token")); Assert.False(request.Headers.Contains("Origin"));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("0,0\n1000,100\n") });
        }));
        var config = Config(); config.Identifier = "local-example-token";
        using var input = new VendorCloudInputSession(config, new Sink(), new ManualTimeProvider(), client);
        Assert.Equal(200, (await Call(input, "/autoblow/sync-script/upload-csv-url", "{\"url\":\"http://127.0.0.1/script.csv\"}", token: config.Identifier)).Status);
    }

    [Fact]
    public async Task Goto_and_oscillator_require_a_known_position_and_use_the_configured_speed_calibration()
    {
        var sink = new Sink(); var clock = new ManualTimeProvider(); var config = Config(); config.MaxSpeedPerSecond = 2;
        using var client = Client("0,20\n10000,20\n"); using var input = new VendorCloudInputSession(config, sink, clock, client);
        Assert.Equal(422, (await Call(input, "/autoblow/goto", "{\"position\":80,\"speed\":50}")).Status);
        await Call(input, "/autoblow/sync-script/upload-csv-url", "{\"url\":\"https://8.8.8.8/script.csv\"}");
        await Call(input, "/autoblow/sync-script/start", "{\"startTimeMs\":0}");
        Assert.Equal(200, (await Call(input, "/autoblow/goto", "{\"position\":80,\"speed\":50}")).Status);
        Assert.InRange(sink.Batches[^1][0].DurationMs, 600, 601);
        clock.Advance(TimeSpan.FromMilliseconds(300));
        Assert.Equal(200, (await Call(input, "/autoblow/oscillate", "{\"speed\":50,\"minY\":10,\"maxY\":90}")).Status);
        Assert.InRange(sink.Batches[^1][0].DurationMs, 400, 402);
        clock.Advance(TimeSpan.FromMilliseconds(420)); Assert.Equal(.1, sink.Batches[^1][0].Value, 8);
        await Call(input, "/autoblow/oscillate/stop"); var count = sink.Batches.Count;
        clock.Advance(TimeSpan.FromSeconds(2)); Assert.Equal(count, sink.Batches.Count);
    }

    [Fact]
    public async Task Zero_speed_goto_stops_instead_of_inventing_a_jump()
    {
        var sink = new Sink(); using var input = new VendorCloudInputSession(Config(), sink, new ManualTimeProvider());
        Assert.Equal(200, (await Call(input, "/autoblow/goto", "{\"position\":80,\"speed\":0}")).Status);
        Assert.Equal(200, (await Call(input, "/autoblow/oscillate", "{\"speed\":0,\"minY\":20,\"maxY\":30}")).Status);
        Assert.Empty(sink.Batches); Assert.True(sink.Stops > 0);
    }

    [Fact]
    public async Task Vacuglide_scalar_speed_and_position_script_bridge_preserve_distinct_semantics()
    {
        var clock = new ManualTimeProvider(); var scalarConfig = Config("VacuGlideHttp", "Scalar"); var scalarSink = new Sink();
        using var scalarClient = Client("0,0\n1000,50\n"); using var scalar = new VendorCloudInputSession(scalarConfig, scalarSink, clock, scalarClient);
        Assert.Equal(200, (await Call(scalar, "/vacuglide/target-speed", "{\"targetSpeed\":25}")).Status);
        Assert.Equal(.25, scalarSink.Batches[^1][0].Value);
        await Call(scalar, "/vacuglide/sync-script/upload-csv-url", "{\"url\":\"https://8.8.8.8/script.csv\"}");
        await Call(scalar, "/vacuglide/sync-script/start", "{\"startTimeMs\":0}"); Assert.Equal(.5, scalarSink.Batches[^1][0].Value);
        var positionSink = new Sink(); using var positionClient = Client("0,0\n1000,50\n");
        using var position = new VendorCloudInputSession(Config("VacuGlideHttp"), positionSink, clock, positionClient);
        Assert.Equal(422, (await Call(position, "/vacuglide/target-speed", "{\"targetSpeed\":25}")).Status);
        await Call(position, "/vacuglide/sync-script/upload-csv-url", "{\"url\":\"https://8.8.8.8/script.csv\"}");
        await Call(position, "/vacuglide/sync-script/start", "{\"startTimeMs\":0}"); Assert.Equal(0, positionSink.Batches[^1][0].Value);
        clock.Advance(TimeSpan.FromMilliseconds(500)); Assert.Equal(.25, positionSink.Batches[^1][0].Value);
    }

    [Fact]
    public async Task Clearing_runtime_commands_cancels_script_timers_until_an_explicit_new_start()
    {
        var config = Config(); var clock = new ManualTimeProvider(); using var store = new ExternalControlStore([config], clock);
        using var client = Client("0,0\n10000,100\n"); using var input = new VendorCloudInputSession(config, store, clock, client);
        await Call(input, "/autoblow/sync-script/upload-csv-url", "{\"url\":\"https://8.8.8.8/script.csv\"}");
        await Call(input, "/autoblow/sync-script/start", "{\"startTimeMs\":0}");
        store.ClearCommands(); var count = store.GetStatus(config.Id)!.ReceivedCommands;
        clock.Advance(TimeSpan.FromMilliseconds(500)); Assert.Equal(count, store.GetStatus(config.Id)!.ReceivedCommands);
        Assert.Empty(store.GetStatus(config.Id)!.Channels);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Finite_script_tasks_survive_http_idle_but_stop_at_the_task_deadline(bool loop)
    {
        var config = Config(); config.MaxScriptDurationMs = 15000;
        var clock = new ManualTimeProvider(); var sink = new Sink();
        using var client = Client(loop ? "0,0\n1000,100\n" : "0,0\n60000,100\n");
        using var input = new VendorCloudInputSession(config, sink, clock, client);
        await Call(input, "/autoblow/sync-script/upload-csv-url", "{\"url\":\"http://127.0.0.1/script.csv\"}");
        if (loop) await Call(input, "/autoblow/sync-script/loop", "{\"loop\":true}");
        await Call(input, "/autoblow/sync-script/start", "{\"startTimeMs\":0}");
        clock.Advance(TimeSpan.FromSeconds(12)); Assert.True(sink.Batches.Count > 500); Assert.NotNull(sink.Owner);
        clock.Advance(TimeSpan.FromSeconds(3)); var count = sink.Batches.Count;
        clock.Advance(TimeSpan.FromSeconds(1)); Assert.Equal(count, sink.Batches.Count); Assert.True(sink.Stops > 0);
    }

    [Fact]
    public async Task Vacuglide_live_speed_stops_after_the_external_request_timeout()
    {
        var clock = new ManualTimeProvider(); var sink = new Sink(); var config = Config("VacuGlideHttp", "Scalar");
        using var input = new VendorCloudInputSession(config, sink, clock);
        await Call(input, "/vacuglide/target-speed", "{\"targetSpeed\":50}");
        clock.Advance(TimeSpan.FromMilliseconds(config.TimeoutMs)); Assert.Null(sink.Owner);
        var count = sink.Batches.Count; clock.Advance(TimeSpan.FromSeconds(1)); Assert.Equal(count, sink.Batches.Count);
    }

    [Fact]
    public async Task Dispose_cancels_inflight_download_and_never_reacquires_the_lease()
    {
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var client = new HttpClient(new Handler(async (request, token) => { started.SetResult(); await Task.Delay(Timeout.InfiniteTimeSpan, token); throw new InvalidOperationException(); }));
        var sink = new Sink(); var input = new VendorCloudInputSession(Config(), sink, new ManualTimeProvider(), client);
        var pending = Call(input, "/autoblow/sync-script/upload-csv-url", "{\"url\":\"http://127.0.0.1/script.csv\"}");
        await started.Task.WaitAsync(TimeSpan.FromSeconds(3)); input.Dispose();
        Assert.Equal(408, (await pending.WaitAsync(TimeSpan.FromSeconds(3))).Status); Assert.Empty(sink.Batches); Assert.Null(sink.Owner);
    }

    [Fact]
    public async Task Stop_cancels_an_inflight_prepare_before_a_late_response_can_replace_the_script()
    {
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var client = new HttpClient(new Handler(async (request, token) => { started.SetResult(); await Task.Delay(Timeout.InfiniteTimeSpan, token); throw new InvalidOperationException(); }));
        var sink = new Sink(); using var input = new VendorCloudInputSession(Config(), sink, new ManualTimeProvider(), client);
        var pending = Call(input, "/autoblow/sync-script/upload-csv-url", "{\"url\":\"http://127.0.0.1/script.csv\"}");
        await started.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(200, (await Call(input, "/autoblow/sync-script/stop")).Status);
        Assert.Equal(408, (await pending.WaitAsync(TimeSpan.FromSeconds(3))).Status);
        Assert.Equal(400, (await Call(input, "/autoblow/sync-script/start", "{\"startTimeMs\":0}")).Status); Assert.Empty(sink.Batches);
    }

    [Fact]
    public async Task Duplicate_properties_and_shared_client_credentials_cannot_be_forwarded()
    {
        using var client = Client("0,0\n1000,100\n"); client.DefaultRequestHeaders.Authorization = new("Bearer", "example-placeholder");
        using var input = new VendorCloudInputSession(Config(), new Sink(), new ManualTimeProvider(), client);
        Assert.Equal(400, (await Call(input, "/autoblow/sync-script/start", "{\"startTimeMs\":0,\"startTimeMs\":10}")).Status);
        var rejected = await Call(input, "/autoblow/sync-script/upload-csv-url", "{\"url\":\"http://127.0.0.1/script.csv\"}");
        Assert.Equal(400, rejected.Status); Assert.DoesNotContain("example-placeholder", rejected.Body.ToString());
    }

    [Theory]
    [InlineData("time,position\n0,0\n")]
    [InlineData("0,0\n1000,100")]
    [InlineData("0,0\n0,100\n")]
    [InlineData("-1,0\n1000,100\n")]
    [InlineData("0,0\n1000,101\n")]
    [InlineData("0,0\n16777215,100\n")]
    public void Invalid_csv_is_rejected_without_clamping_or_partial_playback(string csv)
        => Assert.Throws<InvalidDataException>(() => ProtocolScriptLoader.Parse(Encoding.UTF8.GetBytes(csv), true));

    [Fact]
    public async Task Shared_loader_checks_raw_bytes_sha256_before_parsing()
    {
        var bytes = "0,0\n1000,100\n"u8.ToArray(); using var client = Client(Encoding.UTF8.GetString(bytes));
        var url = new Uri("http://127.0.0.1/script.csv"); var clock = new ManualTimeProvider();
        var good = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes));
        Assert.Equal(.5, (await ProtocolScriptLoader.DownloadAsync(url, true, client, clock, default, good)).Sample(500));
        await Assert.ThrowsAsync<InvalidDataException>(() => ProtocolScriptLoader.DownloadAsync(url, true, client, clock, default, new string('0', 64)));
        Assert.Throws<InvalidDataException>(() => ProtocolScriptLoader.Parse("{\"actions\":[{\"at\":0,\"pos\":0,\"pos\":100}]}"u8.ToArray(), false));
        Assert.Throws<InvalidDataException>(() => ProtocolScriptLoader.Parse("{\"actions\":[{\"at\":\"0\",\"pos\":0}]}"u8.ToArray(), false));
    }

    [Theory]
    [InlineData("10.0.0.1")]
    [InlineData("::ffff:192.168.1.1")]
    [InlineData("fc00::1")]
    [InlineData("fe80::1")]
    [InlineData("::1")]
    public async Task Dns_rebinding_between_validation_and_connection_never_dials_a_private_address(string rebound)
    {
        var lookups = 0; var connections = 0;
        Task<IPAddress[]> Resolve(string host, CancellationToken token) => Task.FromResult(new[] { IPAddress.Parse(++lookups == 1 ? "8.8.8.8" : rebound) });
        var uri = new Uri("https://scripts.example.com/track.csv");
        await ProtocolScriptLoader.ValidateUrlAsync(uri, default, Resolve);
        await Assert.ThrowsAsync<InvalidDataException>(async () => await ProtocolScriptLoader.ConnectPinnedAsync(uri, new(uri.Host, uri.Port), Resolve,
            (endpoint, token) => { connections++; return ValueTask.FromResult<Stream>(new MemoryStream()); }, default));
        Assert.Equal(2, lookups); Assert.Equal(0, connections);
    }

    [Theory]
    [InlineData("8.8.8.8")]
    [InlineData("2606:4700:4700::1111")]
    public async Task Connection_dials_the_vetted_ip_instead_of_resolving_the_hostname_again(string address)
    {
        var lookups = 0; var connections = 0; var expected = IPAddress.Parse(address);
        await using var stream = await ProtocolScriptLoader.ConnectPinnedAsync(new("https://scripts.example.com/track.csv"), new("scripts.example.com", 443),
            (host, token) => { lookups++; return Task.FromResult(new[] { expected }); },
            (endpoint, token) => { connections++; Assert.Equal(expected, endpoint.Address); Assert.Equal(443, endpoint.Port); return ValueTask.FromResult<Stream>(new MemoryStream()); }, default);
        Assert.Equal(1, lookups); Assert.Equal(1, connections);
    }

    [Fact]
    public async Task Inherited_proxy_connections_are_rejected_before_resolving_or_dialing_the_proxy()
    {
        var dns = 0; var dials = 0;
        using var client = ProtocolScriptLoader.CreateHttpClient(
            (host, token) => { dns++; return Task.FromResult(new[] { IPAddress.Loopback }); },
            (endpoint, token) => { dials++; throw new InvalidOperationException(); }, new WebProxy("http://proxy.invalid:8080"));
        var error = await Assert.ThrowsAsync<InvalidDataException>(() => ProtocolScriptLoader.DownloadAsync(new("https://8.8.8.8/track.csv"), true, client, new ManualTimeProvider(), default));
        Assert.Contains("multipart", error.Message); Assert.Equal(0, dns); Assert.Equal(0, dials);
    }

    [Fact]
    public async Task The_default_socket_connector_reaches_only_the_vetted_loopback_endpoint()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        var endpoint = (IPEndPoint)listener.LocalEndpoint;
        var response = "0,0\n1000,100\n"u8.ToArray();
        var serving = Task.Run(async () =>
        {
            using var accepted = await listener.AcceptTcpClientAsync();
            Assert.Equal(IPAddress.Loopback, ((IPEndPoint)accepted.Client.RemoteEndPoint!).Address);
            var socket = accepted.GetStream(); using var request = new StreamReader(socket, Encoding.ASCII, leaveOpen: true);
            for (var line = await request.ReadLineAsync(); line is { Length: > 0 }; line = await request.ReadLineAsync()) { }
            await socket.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 200 OK\r\nContent-Length: {response.Length}\r\nConnection: close\r\n\r\n"));
            await socket.WriteAsync(response);
        });
        // An empty explicit proxy is used only by this isolated loopback test, never by production.
        using var client = ProtocolScriptLoader.CreateHttpClient(null, null, new WebProxy());
        var script = await ProtocolScriptLoader.DownloadAsync(new($"http://127.0.0.1:{endpoint.Port}/track.csv"), true, client, TimeProvider.System, default);
        Assert.Equal(.5, script.Sample(500)); await serving.WaitAsync(TimeSpan.FromSeconds(3));
    }

    [Fact]
    public async Task Remote_script_reads_obey_the_injected_ten_second_deadline()
    {
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); var clock = new ManualTimeProvider();
        using var client = new HttpClient(new Handler(async (request, token) => { started.SetResult(); await Task.Delay(Timeout.InfiniteTimeSpan, token); throw new InvalidOperationException(); }));
        using var input = new VendorCloudInputSession(Config(), new Sink(), clock, client);
        var pending = Call(input, "/autoblow/sync-script/upload-csv-url", "{\"url\":\"http://127.0.0.1/script.csv\"}");
        await started.Task.WaitAsync(TimeSpan.FromSeconds(3)); clock.Advance(TimeSpan.FromSeconds(10));
        Assert.Equal(408, (await pending.WaitAsync(TimeSpan.FromSeconds(3))).Status);
    }

    private static ProtocolInputConfig Config(string type = "AutoblowHttp", string actuator = "Position") => new()
    { Id = "vendor", Enabled = true, Type = type, TimeoutMs = 1000, Features = [new() { Channel = actuator == "Position" ? "L0" : "V0", Actuator = actuator, TargetAxis = actuator == "Position" ? "L0" : "V0" }] };
    private sealed record Response(int Status, JsonElement Body);
    private static async Task<Response> Call(VendorCloudInputSession input, string path, string? json = null, string method = "PUT", string session = "test", string token = "",
        byte[]? bytes = null, string contentType = "application/json", string origin = "https://source.example")
    {
        var context = new DefaultHttpContext(); context.Request.Method = method; context.Request.Path = path;
        context.Request.ContentType = contentType; context.Connection.RemoteIpAddress = IPAddress.Loopback;
        context.Request.Headers.Origin = origin; context.Request.Headers["X-Sensa-Session"] = session; context.Request.Headers["x-device-token"] = token;
        var body = bytes ?? Encoding.UTF8.GetBytes(json ?? "{}"); context.Request.Body = new MemoryStream(body); context.Request.ContentLength = body.Length;
        context.Response.Body = new MemoryStream(); await input.HandleAsync(context); context.Response.Body.Position = 0;
        using var document = await JsonDocument.ParseAsync(context.Response.Body); return new(context.Response.StatusCode, document.RootElement.Clone());
    }
    private static HttpClient Client(string text) => new(new Handler((request, token) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(text) })));
    private sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
    { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request, cancellationToken); }
    private sealed class Sink : IExternalControlSink
    {
        public string? Owner; public int Stops, Releases; public List<ExternalControlCommand[]> Batches = [];
        public bool TryAcquire(string inputId, string sessionId, out string error)
        { error = ""; if (Owner is not null && Owner != sessionId) { error = "Owned"; return false; } Owner = sessionId; return true; }
        public bool Publish(string inputId, string sessionId, IReadOnlyList<ExternalControlCommand> commands, out string error)
        { error = ""; if (Owner != sessionId) return false; Batches.Add(commands.ToArray()); return true; }
        public void Stop(string inputId, string sessionId, string? channel = null) { if (Owner == sessionId) Stops++; }
        public void Release(string inputId, string sessionId) { if (Owner == sessionId) { Owner = null; Releases++; } }
        public void Heartbeat(string inputId, string sessionId) { }
    }
}
