using System.Net;
using System.Text.Json;
using Sensa.Application;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Hosting;
using Sensa.Input.Script;
using Sensa.Motion;
using Sensa.Outputs;
using Sensa.Outputs.Devices;
using Sensa.Recording;
using Sensa.Runtime;
using Sensa.Tests.Support;
using Xunit;
using ApiTransport = Sensa.Tests.Contracts.VendorDeviceOutputContracts.ApiTransport;

namespace Sensa.Tests.Contracts;

/// <summary>Actual application/runtime/output composition, isolated with an in-memory HTTP transport.</summary>
public sealed class VendorOutputIntegrationContracts
{
    [Fact]
    public async Task ConnectedVendorOutputStillRequiresEnabledOutputAndInputActivation()
    {
        await using var fixture = new Fixture(OutputDeviceType.Handy);
        Assert.True(await fixture.Outputs.ConnectAsync("device"));
        var requests = fixture.Transport.Requests.Count;
        await fixture.Outputs.SendAsync(Frame);
        Assert.Equal(requests, fixture.Transport.Requests.Count);
        fixture.Runtime.SetInputActive(true);
        fixture.Config.Outputs[0].Enabled = false;
        await fixture.Outputs.SendAsync(Frame);
        Assert.Equal(requests, fixture.Transport.Requests.Count);
        fixture.Config.Outputs[0].Enabled = true;
        await fixture.Outputs.SendAsync(Frame);
        Assert.Contains(fixture.Transport.Requests, request => request.Path == "/hdsp/xpt");
    }

    [Fact]
    public async Task ScriptPreparationDisarmsAndBlocksActivationWhileNetworkSetupIsPending()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var transport = new ApiTransport(async (request, cancellation) =>
        {
            if (request.Path.EndsWith("upload-csv-url")) { entered.TrySetResult(); await release.Task.WaitAsync(cancellation); }
            return null;
        });
        await using var fixture = new Fixture(OutputDeviceType.VacuGlide, transport);
        Assert.True(await fixture.Outputs.ConnectAsync("device"));
        fixture.Runtime.SetInputActive(true);
        var preparation = fixture.Command("prepare", new { url = "https://scripts.example/test.csv" });
        try
        {
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.False(fixture.Runtime.InputActive);
            var activate = await fixture.Application.ExecuteAsync("PUT", "/api/input/active", JsonSerializer.SerializeToElement(new { active = true }));
            Assert.False(activate.Success);
        }
        finally { release.TrySetResult(); }
        Assert.True((await preparation).Success);
        Assert.False(fixture.Runtime.InputActive);
        Assert.True(fixture.Clients.Single().ScriptPrepared);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ASeparateApplicationStopCanCancelPendingScriptPreparation(bool emergency)
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var transport = new ApiTransport(async (request, cancellation) =>
        {
            if (request.Path.EndsWith("upload-csv-url"))
            {
                entered.TrySetResult();
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellation);
            }
            return null;
        });
        await using var fixture = new Fixture(OutputDeviceType.VacuGlide, transport);
        await fixture.Outputs.ConnectAsync("device");
        fixture.Runtime.SetInputActive(true);
        var prepare = fixture.Command("prepare", new { url = "https://scripts.example/test.csv" });
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.False(fixture.Runtime.InputActive);
        var stop = emergency
            ? await fixture.Application.ExecuteAsync("POST", "/api/control/runtime/emergency-stop").WaitAsync(TimeSpan.FromSeconds(5))
            : await fixture.Command("stop").WaitAsync(TimeSpan.FromSeconds(5));
        Assert.True(stop.Success);
        Assert.False((await prepare.WaitAsync(TimeSpan.FromSeconds(5))).Success);
        Assert.False(fixture.Clients.Single().ScriptPrepared);
        Assert.False(fixture.Clients.Single().ScriptPlaying);
        Assert.DoesNotContain(fixture.Transport.Requests, request => request.Path.EndsWith("/start"));
        fixture.Runtime.ClearEmergency();
        Assert.False(fixture.Runtime.InputActive);
        Assert.False((await fixture.Command("play", new { positionMs = 0 })).Success);
    }

    [Fact]
    public async Task APreparationResponseArrivingAfterEmergencyStopCannotArmOrRestartPlayback()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var delayedResponse = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var transport = new ApiTransport(async (request, _) =>
        {
            if (request.Path.EndsWith("upload-csv-url"))
            {
                entered.TrySetResult();
                // Simulates a transport that returns a successful response after cancellation.
                await delayedResponse.Task;
            }
            return null;
        });
        await using var fixture = new Fixture(OutputDeviceType.VacuGlide, transport);
        await fixture.Outputs.ConnectAsync("device");
        var prepare = fixture.Command("prepare", new { url = "https://scripts.example/test.csv" });
        try
        {
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.True((await fixture.Application.ExecuteAsync("POST", "/api/control/runtime/emergency-stop")).Success);
            fixture.Runtime.ClearEmergency();
        }
        finally { delayedResponse.TrySetResult(); }
        Assert.False((await prepare.WaitAsync(TimeSpan.FromSeconds(5))).Success);
        await fixture.Outputs.EmergencyStopAsync();
        Assert.False(fixture.Clients.Single().ScriptPrepared);
        Assert.False(fixture.Clients.Single().ScriptPlaying);
        Assert.False(fixture.Runtime.InputActive);
        Assert.DoesNotContain(fixture.Transport.Requests, request => request.Path.EndsWith("/start"));
    }

    [Fact]
    public async Task VendorScriptPlayAndSeekRequireAnEnabledOutputAndActiveInputButStopIsAlwaysAvailable()
    {
        await using var fixture = new Fixture(OutputDeviceType.VacuGlide);
        await fixture.Outputs.ConnectAsync("device");
        Assert.True((await fixture.Command("prepare", new { url = "https://scripts.example/test.csv" })).Success);
        Assert.False((await fixture.Command("play", new { positionMs = 100 })).Success);
        Assert.False((await fixture.Command("seek", new { positionMs = 100 })).Success);
        fixture.Runtime.SetInputActive(true);
        fixture.Config.Outputs[0].Enabled = false;
        Assert.False((await fixture.Command("play", new { positionMs = 100 })).Success);
        fixture.Config.Outputs[0].Enabled = true;
        Assert.True((await fixture.Command("play", new { positionMs = 100 })).Success);
        Assert.True(fixture.Clients.Single().ScriptPlaying);
        fixture.Config.Outputs[0].Enabled = false;
        Assert.True((await fixture.Command("stop")).Success);
        Assert.False(fixture.Clients.Single().ScriptPlaying);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task DisablingInputOrEmergencyStopCancelsExternalDeviceScriptAndClearDoesNotResume(bool emergency)
    {
        var stopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var watching = false;
        using var transport = new ApiTransport(request =>
        {
            if (watching && request.Path == "/vacuglide/target-speed/stop") stopped.TrySetResult();
            return null;
        });
        await using var fixture = new Fixture(OutputDeviceType.VacuGlide, transport);
        await fixture.Outputs.ConnectAsync("device");
        await fixture.Command("prepare", new { url = "https://scripts.example/test.csv" });
        fixture.Runtime.SetInputActive(true);
        Assert.True((await fixture.Command("play", new { positionMs = 0 })).Success);
        watching = true;
        if (emergency) fixture.Runtime.EmergencyStop();
        else fixture.Runtime.SetInputActive(false);
        await stopped.Task.WaitAsync(TimeSpan.FromSeconds(5));
        // The notification is emitted when the request is observed; wait for its bookkeeping too.
        await fixture.Outputs.EmergencyStopAsync();
        Assert.False(fixture.Clients.Single().ScriptPlaying);
        Assert.False(fixture.Runtime.InputActive);
        fixture.Runtime.ClearEmergency();
        Assert.False(fixture.Runtime.InputActive);
        var starts = fixture.Transport.Requests.Count(request => request.Path.EndsWith("/start"));
        Assert.False((await fixture.Command("play", new { positionMs = 0 })).Success);
        Assert.Equal(starts, fixture.Transport.Requests.Count(request => request.Path.EndsWith("/start")));
    }

    [Fact]
    public async Task ChangingVendorOptionsReplacesTheClientAndNeverAutomaticallyRestartsItsScript()
    {
        await using var fixture = new Fixture(OutputDeviceType.VacuGlide);
        await fixture.Outputs.ConnectAsync("device");
        await fixture.Command("prepare", new { url = "https://scripts.example/test.csv" });
        fixture.Runtime.SetInputActive(true);
        await fixture.Command("play", new { positionMs = 0 });
        var original = fixture.Clients.Single();
        var next = new AppConfig(); next.CopyFrom(fixture.Config);
        next.Outputs[0].Device.OffsetMs = 100;
        var result = await fixture.Application.ExecuteAsync("PUT", "/api/config", JsonSerializer.SerializeToElement(next));
        Assert.True(result.Success);
        Assert.False(fixture.Runtime.InputActive);
        Assert.False(original.IsConnected);
        Assert.Equal(2, fixture.Clients.Count);
        Assert.True(fixture.Clients.Last().IsConnected);
        Assert.False(fixture.Clients.Last().ScriptPrepared);
        Assert.False(fixture.Clients.Last().ScriptPlaying);
        Assert.Single(fixture.Transport.Requests, request => request.Path.EndsWith("/start"));
    }

    [Fact]
    public async Task OrdinaryMotionDoesNotTakeOverAnActiveVendorScript()
    {
        await using (var vacu = new Fixture(OutputDeviceType.VacuGlide))
        {
            await vacu.Outputs.ConnectAsync("device");
            await vacu.Command("prepare", new { url = "https://scripts.example/test.csv" });
            vacu.Runtime.SetInputActive(true);
            await vacu.Command("play", new { positionMs = 0 });
            var count = vacu.Transport.Requests.Count;
            await vacu.Outputs.SendAsync(Frame);
            Assert.Equal(count, vacu.Transport.Requests.Count);
            Assert.Empty(vacu.Errors);
        }
        await using var autoblow = new Fixture(OutputDeviceType.Autoblow);
        await autoblow.Outputs.ConnectAsync("device");
        await autoblow.Command("prepare", new { url = "https://scripts.example/test.csv" });
        autoblow.Runtime.SetInputActive(true);
        await autoblow.Command("play", new { positionMs = 0 });
        var playingCount = autoblow.Transport.Requests.Count;
        await autoblow.Outputs.SendAsync(Frame);
        Assert.Equal(playingCount, autoblow.Transport.Requests.Count);
        await autoblow.Command("stop");
        await autoblow.Outputs.SendAsync(Frame);
        Assert.Equal("/autoblow/goto", autoblow.Transport.Requests.Last().Path);
    }

    [Fact]
    public async Task OverviewDescribesScalarAndScriptCapabilityWithoutExposingCredentials()
    {
        await using var fixture = new Fixture(OutputDeviceType.VacuGlide);
        await fixture.Outputs.ConnectAsync("device");
        var overview = JsonSerializer.Serialize(fixture.Outputs.BuildOverview());
        Assert.Contains("\"supportsStreaming\":true", overview);
        Assert.Contains("\"commandKind\":\"Scalar\"", overview);
        Assert.Contains("\"supportsScripts\":true", overview);
        Assert.DoesNotContain(fixture.Config.Outputs[0].Device.ConnectionKey, overview);
    }

    [Theory]
    [InlineData(OutputDeviceType.Handy)]
    [InlineData(OutputDeviceType.Autoblow)]
    [InlineData(OutputDeviceType.VacuGlide)]
    public async Task ScriptLoopCommandChangesOnlyPreparedPausedPolicyWithoutArmingOrPlaying(OutputDeviceType type)
    {
        await using var fixture = new Fixture(type);
        Assert.True(await fixture.Outputs.ConnectAsync("device"));
        Assert.True((await fixture.Command("prepare", new { url = "https://scripts.example/loop.csv" })).Success);
        Assert.False(fixture.Runtime.InputActive);
        var adapter = new WebSocketCommandAdapter(fixture.Application);
        var response = await adapter.HandleAsync("""{"id":"loop-choice","method":"POST","path":"/api/control/output/device/script-loop","body":{"loop":true}}""");
        Assert.True(response.Ok);
        Assert.Equal("loop-choice", response.Id);
        var state = JsonSerializer.SerializeToElement(response.Data);
        Assert.True(state.GetProperty("supportsScriptLoop").GetBoolean());
        Assert.True(state.GetProperty("scriptLoop").GetBoolean());
        Assert.False(state.GetProperty("scriptPlaying").GetBoolean());
        Assert.False(fixture.Runtime.InputActive);
        Assert.DoesNotContain(fixture.Transport.Requests, request => request.Path.EndsWith("/hssp/play") || request.Path.EndsWith("/sync-script/start"));

        fixture.Runtime.SetInputActive(true);
        Assert.True((await fixture.Command("play", new { positionMs = 0 })).Success);
        var previous = fixture.Transport.Requests.Count;
        var rejected = await fixture.Command("loop", new { loop = false });
        Assert.Equal(400, rejected.StatusCode);
        Assert.True(fixture.Clients.Single().ScriptLoop);
        Assert.True(fixture.Clients.Single().ScriptPlaying);
        Assert.DoesNotContain(fixture.Transport.Requests.Skip(previous), request => request.Path.EndsWith("/loop"));
        Assert.True((await fixture.Command("stop")).Success);
        Assert.True((await fixture.Command("loop", new { loop = false })).Success);
        Assert.False(fixture.Clients.Single().ScriptLoop);
        Assert.False(fixture.Clients.Single().ScriptPlaying);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"loop\":null}")]
    [InlineData("{\"loop\":\"true\"}")]
    public async Task ScriptLoopRequiresAnExplicitBooleanBeforeAnyDeviceRequest(string body)
    {
        await using var fixture = new Fixture(OutputDeviceType.VacuGlide);
        var response = await fixture.Application.ExecuteAsync("POST", "/api/control/output/device/script-loop", JsonSerializer.Deserialize<JsonElement>(body));
        Assert.Equal(400, response.StatusCode);
        Assert.Empty(fixture.Transport.Requests);
        Assert.False(fixture.Runtime.InputActive);
    }

    private static MotionFrame Frame => new() { L0 = .7f, DeltaMs = 200, RequestedCommandMode = TCodeCommandMode.Interval, RequestedMotionValue = 200 };

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly ManualTimeProvider _clock = new();
        private readonly HttpClient _http;
        private readonly FunscriptPlayer _player;
        private readonly bool _ownsTransport;
        public ApiTransport Transport { get; }
        public AppConfig Config { get; }
        public OutputCoordinator Outputs { get; }
        public MotionRuntime Runtime { get; }
        public SensaApplication Application { get; }
        public List<VendorDeviceOutput> Clients { get; } = [];
        public List<string> Errors { get; } = [];

        public Fixture(OutputDeviceType type, ApiTransport? transport = null)
        {
            _ownsTransport = transport is null;
            Transport = transport ?? new ApiTransport();
            _http = new HttpClient(Transport, disposeHandler: false);
            Config = new AppConfig { Outputs = [new()
            {
                Id = "device", Name = "Test device", Type = type, Enabled = true,
                Device = new() { Endpoint = "http://127.0.0.1:19000", ConnectionKey = "test-only-connection-key", MinIntervalMs = 25 },
            }] };
            Outputs = new OutputCoordinator(Config, _ => { }, _ => { }, Errors.Add, vendorFactory: output =>
            {
                var client = new VendorDeviceOutput(output.Type.ToString(), output.Device, _http, _clock);
                Clients.Add(client); return client;
            });
            _player = new FunscriptPlayer(_clock);
            var recorder = new MotionRecorder(_clock);
            Runtime = new MotionRuntime(Config, new OscParameterStore(_clock), Outputs, recorder: recorder, scriptPlayer: _player, timeProvider: _clock);
            Outputs.CanSend = () => Runtime.CanSend;
            Outputs.CanRouteSignals = () => Runtime.CanRouteSignals;
            var update = new ConfigurationUpdate(Config, Runtime, Outputs, (_, _) => { }, () => { }, _ => { }, _ => { });
            Application = new SensaApplication(Config, Runtime, _player, recorder, Outputs, new ApplicationHost(
                () => new { }, () => new { }, () => new { }, update.ApplyAsync, _ => new { }, () => Task.FromResult<object>(new { }),
                () => { }, () => false, () => { }, _ => { }, _ => { }, Errors.Add));
        }

        public Task<CommandResult> Command(string action, object? body = null) =>
            Application.ExecuteAsync("POST", $"/api/control/output/device/script-{action}", body is null ? null : JsonSerializer.SerializeToElement(body));

        public async ValueTask DisposeAsync()
        {
            Runtime.Dispose();
            _player.Dispose();
            await Outputs.DisposeAsync();
            _http.Dispose();
            if (_ownsTransport) Transport.Dispose();
        }
    }
}
