using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Sensa.Application;
using Sensa.Configuration;
using Sensa.Hosting;
using Sensa.Input.Osc;
using Sensa.Input.Script;
using Sensa.Motion;
using Sensa.Outputs;
using Sensa.Recording;
using Sensa.Runtime;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests;

public sealed class ApplicationBehaviorTests
{
    private const string Script = """{"actions":[{"at":0,"pos":25},{"at":1000,"pos":75}]}""";

    [Theory]
    [InlineData("GET", "/api/config")]
    [InlineData("GET", "/api/state/overview")]
    [InlineData("GET", "/api/state/logs")]
    [InlineData("GET", "/api/meta/serial-ports")]
    [InlineData("POST", "/api/control/runtime/emergency-stop")]
    [InlineData("POST", "/api/control/loop/clear-emergency")]
    [InlineData("PUT", "/api/input/mode", """{"mode":"manual"}""")]
    [InlineData("PUT", "/api/input/active", """{"active":false}""")]
    [InlineData("PUT", "/api/input/osc/source", """{"sourceKey":"source-a"}""")]
    [InlineData("POST", "/api/input/oscquery/refresh")]
    public async Task HttpAndWebSocketUseTheSameCommandContract(string method, string path, string? body = null)
    {
        await using var fixture = new CommandFixture();
        var http = await fixture.Http.HandleAsync(Request(method, path, body));
        var ws = await fixture.WebSocket.HandleAsync(JsonSerializer.Serialize(new
        {
            id = "correlation-1",
            method = method.ToLowerInvariant(),
            path,
            body = body is null ? (JsonElement?)null : JsonSerializer.Deserialize<JsonElement>(body),
        }));

        Assert.Equal(200, Assert.IsAssignableFrom<IStatusCodeHttpResult>(http).StatusCode);
        Assert.True(ws.Ok);
        Assert.Equal("correlation-1", ws.Id);
        Assert.Equal(JsonSerializer.Serialize(Assert.IsAssignableFrom<IValueHttpResult>(http).Value), JsonSerializer.Serialize(ws.Data));
    }

    [Theory]
    [InlineData("PUT", "/api/input/active", null, 400)]
    [InlineData("PUT", "/api/input/mode", "{}", 400)]
    [InlineData("PUT", "/api/input/mode", """{"mode":"999"}""", 400)]
    [InlineData("PUT", "/api/input/manual", "[]", 400)]
    [InlineData("POST", "/api/control/output/missing/connect", null, 404)]
    [InlineData("POST", "/api/control/output/missing/connect/extra", null, 404)]
    [InlineData("GET", "/api/not-a-command", null, 404)]
    [InlineData("POST", "/api/recording/unknown", null, 404)]
    public async Task InvalidCommandsHaveEquivalentTransportErrors(string method, string path, string? body, int expectedStatus)
    {
        await using var fixture = new CommandFixture();
        var http = await fixture.Http.HandleAsync(Request(method, path, body));
        var ws = await fixture.WebSocket.HandleAsync(JsonSerializer.Serialize(new
        {
            id = "invalid",
            method,
            path,
            body = body is null ? (JsonElement?)null : JsonSerializer.Deserialize<JsonElement>(body),
        }));
        Assert.Equal(expectedStatus, Assert.IsAssignableFrom<IStatusCodeHttpResult>(http).StatusCode);
        Assert.False(ws.Ok);
        Assert.Equal(JsonSerializer.Serialize(Assert.IsAssignableFrom<IValueHttpResult>(http).Value), JsonSerializer.Serialize(ws.Data));
    }

    [Fact]
    public async Task MalformedTransportMessagesDoNotMutateApplicationState()
    {
        await using var fixture = new CommandFixture();
        var http = await fixture.Http.HandleAsync(Request("PUT", "/api/input/active", "{"));
        var ws = await fixture.WebSocket.HandleAsync("{");
        Assert.Equal(400, Assert.IsAssignableFrom<IStatusCodeHttpResult>(http).StatusCode);
        Assert.False(ws.Ok);
        Assert.False(fixture.Runtime.InputActive);
        Assert.Equal(0, fixture.Changes);
    }

    [Fact]
    public async Task ManualCommandsNormalizeEveryAxisAndMotionLimitAtTheApplicationInterface()
    {
        await using var fixture = new CommandFixture();
        var result = await fixture.Application.ExecuteAsync("PUT", "/api/input/manual", JsonSerializer.Deserialize<JsonElement>(
            """{"enabled":true,"l0":2000,"r0":-20,"r1":250,"r2":500,"l1":750,"l2":999,"v0":1000,"v1":100,"v2":200,"a0":300,"a1":400,"a2":500,"motionMode":"Interval","motionValue":2000}"""));
        Assert.True(result.Success);
        var manual = fixture.Runtime.ManualOverrideCommand;
        Assert.Equal(.999f, manual.L0);
        Assert.Equal(0f, manual.R0);
        Assert.Equal(.25f, manual.R1);
        Assert.Equal(.5f, manual.R2);
        Assert.Equal(.75f, manual.L1);
        Assert.Equal(.999f, manual.L2);
        Assert.Equal(.999f, manual.V0);
        Assert.Equal(.1f, manual.V1);
        Assert.Equal(.2f, manual.V2);
        Assert.Equal(.3f, manual.A0);
        Assert.Equal(.4f, manual.A1);
        Assert.Equal(.5f, manual.A2);
        Assert.Equal(1000, manual.RequestedMotionValue);
        Assert.Equal(TCodeCommandMode.Interval, manual.RequestedCommandMode);
        Assert.False(fixture.Runtime.InputActive);
        Assert.True(fixture.Runtime.ManualOverrideEnabled);
        await fixture.Application.ExecuteAsync("DELETE", "/api/input/manual");
        Assert.False(fixture.Runtime.ManualOverrideEnabled);
    }

    [Fact]
    public async Task ReplacingAScriptAlwaysDisarmsBeforeLoadingEvenInScriptMode()
    {
        await using var fixture = new CommandFixture();
        Assert.True((await fixture.Application.ExecuteAsync("POST", "/api/input/script/load", ScriptBody("first.funscript"))).Success);
        fixture.Runtime.SetInputActive(true);
        Assert.True(fixture.Runtime.InputActive);
        Assert.True((await fixture.Application.ExecuteAsync("POST", "/api/input/script/load", ScriptBody("second.funscript"))).Success);
        Assert.False(fixture.Runtime.InputActive);
        Assert.Equal("second.funscript", fixture.Player.GetSnapshot().FileName);
        fixture.Runtime.SetInputActive(true);
        var malformed = JsonSerializer.SerializeToElement(new { fileName = "broken.funscript", content = "{}" });
        Assert.False((await fixture.Application.ExecuteAsync("POST", "/api/input/script/load", malformed)).Success);
        Assert.False(fixture.Runtime.InputActive);
        Assert.Equal("second.funscript", fixture.Player.GetSnapshot().FileName);
    }

    [Fact]
    public async Task MultipartAndJsonUploadsProduceTheSamePlaybackStateWithoutStartingInput()
    {
        await using var fixture = new CommandFixture();
        var context = new DefaultHttpContext();
        var bytes = Encoding.UTF8.GetBytes(Script);
        using var content = new MemoryStream(bytes);
        var file = new FormFile(content, 0, bytes.Length, "file", "demo.funscript");
        context.Request.Method = "POST";
        context.Request.Path = "/api/input/script/load";
        context.Request.ContentType = "multipart/form-data; boundary=sensa-test";
        context.Request.Form = new FormCollection(
            new Dictionary<string, Microsoft.Extensions.Primitives.StringValues> { ["loop"] = "true", ["speed"] = "1.5" },
            new FormFileCollection { file });
        var http = await fixture.Http.HandleAsync(context.Request);
        var fromHttp = JsonSerializer.Serialize(Assert.IsAssignableFrom<IValueHttpResult>(http).Value);
        var ws = await fixture.WebSocket.HandleAsync(JsonSerializer.Serialize(new
        {
            id = "upload",
            method = "POST",
            path = "/api/input/script/load",
            body = new { fileName = "demo.funscript", content = Script, loop = true, speed = 1.5 },
        }));
        Assert.True(ws.Ok);
        Assert.Equal(fromHttp, JsonSerializer.Serialize(ws.Data));
        Assert.False(fixture.Runtime.InputActive);
        Assert.Equal(RuntimeInputMode.Script, fixture.Runtime.CurrentInputMode);
        Assert.False(fixture.Player.GetSnapshot().Playing);
    }

    [Fact]
    public async Task ScriptControlsAndRecordingFollowTheUserWorkflow()
    {
        await using var fixture = new CommandFixture();
        Assert.False((await fixture.Application.ExecuteAsync("POST", "/api/input/script/play", JsonSerializer.SerializeToElement(new { restart = true }))).Success);
        await fixture.Application.ExecuteAsync("POST", "/api/input/script/load", ScriptBody("demo.funscript"));
        Assert.True((await fixture.Application.ExecuteAsync("PUT", "/api/input/script/configure", JsonSerializer.SerializeToElement(
            new { loop = true, speed = 2, updateLoopRange = true, loopStartMs = 100, loopEndMs = 900 }))).Success);
        Assert.True(fixture.Player.GetSnapshot().LoopRangeActive);
        await fixture.Application.ExecuteAsync("PUT", "/api/input/script/seek", JsonSerializer.SerializeToElement(new { positionMs = 500 }));
        Assert.Equal(500, fixture.Player.GetSnapshot().PositionMs);
        await fixture.Application.ExecuteAsync("POST", "/api/input/script/action-prev");
        Assert.Equal(0, fixture.Player.GetSnapshot().PositionMs);
        await fixture.Application.ExecuteAsync("POST", "/api/input/script/action-next");
        Assert.Equal(1000, fixture.Player.GetSnapshot().PositionMs);
        await fixture.Application.ExecuteAsync("POST", "/api/input/script/play", JsonSerializer.SerializeToElement(new { restart = true }));
        Assert.True(fixture.Player.GetSnapshot().Playing);
        Assert.False(fixture.Runtime.InputActive);
        await fixture.Application.ExecuteAsync("POST", "/api/input/script/pause");
        Assert.False(fixture.Player.GetSnapshot().Playing);
        await fixture.Application.ExecuteAsync("POST", "/api/input/script/stop");
        Assert.Equal(0, fixture.Player.GetSnapshot().PositionMs);
        await fixture.Application.ExecuteAsync("DELETE", "/api/input/script");
        Assert.False(fixture.Player.GetSnapshot().Loaded);

        await fixture.Application.ExecuteAsync("POST", "/api/recording/start");
        fixture.Recorder.Push(MotionAxisHelper.CreateNeutralFrame() with { L0 = .75f });
        var exported = await fixture.Application.ExecuteAsync("POST", "/api/recording/export");
        var export = JsonSerializer.SerializeToElement(exported.Data);
        Assert.False(fixture.Recorder.IsActive);
        Assert.EndsWith(".funscript", export.GetProperty("fileName").GetString());
        using var recording = JsonDocument.Parse(export.GetProperty("content").GetString()!);
        Assert.Equal(75, recording.RootElement.GetProperty("actions")[0].GetProperty("pos").GetInt32());
    }

    [Fact]
    public async Task ConfigurationFailureRestoresThePreviousConfigurationAndLeavesInputOff()
    {
        await using var fixture = new CommandFixture();
        fixture.Config.WebUi.Title = "previous";
        var candidate = new AppConfig();
        candidate.CopyFrom(fixture.Config);
        candidate.WebUi.Title = "candidate";
        var syncCalls = 0;
        var module = new ConfigurationUpdate(fixture.Config, fixture.Runtime, fixture.Outputs,
            (_, _) => syncCalls++, () => { },
            _ => throw new IOException("isolated persistence failure"), _ => { });
        fixture.Runtime.SetInputActive(true);
        var failure = await Assert.ThrowsAsync<IOException>(() => module.ApplyAsync(candidate));
        Assert.Equal("isolated persistence failure", failure.Message);
        Assert.Equal("previous", fixture.Config.WebUi.Title);
        Assert.False(fixture.Runtime.InputActive);
        Assert.Equal(2, syncCalls);
    }

    [Fact]
    public async Task ConfigurationValidationHappensBeforeDisarmingOrPersisting()
    {
        await using var fixture = new CommandFixture();
        fixture.Runtime.SetInputActive(true);
        var candidate = new AppConfig();
        candidate.Osc.AllowedSourceAddresses = ["invalid ip"];
        var saved = false;
        var module = new ConfigurationUpdate(fixture.Config, fixture.Runtime, fixture.Outputs,
            (_, _) => { }, () => { }, _ => saved = true, _ => { });
        await Assert.ThrowsAsync<ArgumentException>(() => module.ApplyAsync(candidate));
        Assert.True(fixture.Runtime.InputActive);
        Assert.False(saved);
    }

    [Fact]
    public async Task PlayingLoadedScriptFromActiveManualModeDisarmsBeforeStartingPlayback()
    {
        await using var fixture = new CommandFixture();
        await fixture.Application.ExecuteAsync("POST", "/api/input/script/load", ScriptBody("test.funscript"));
        fixture.Runtime.SetInputMode(RuntimeInputMode.Manual);
        fixture.Runtime.SetInputActive(true);
        var result = await fixture.Application.ExecuteAsync("POST", "/api/input/script/play",
            JsonSerializer.SerializeToElement(new { restart = false }));
        Assert.True(result.Success);
        Assert.Equal(RuntimeInputMode.Script, fixture.Runtime.CurrentInputMode);
        Assert.False(fixture.Runtime.InputActive);
        Assert.True(fixture.Player.GetSnapshot().Playing);
        var json = JsonSerializer.SerializeToElement(result.Data, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.True(json.GetProperty("script").GetProperty("playing").GetBoolean());
    }

    private static JsonElement ScriptBody(string fileName) => JsonSerializer.SerializeToElement(new { fileName, content = Script });

    private static HttpRequest Request(string method, string path, string? body)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = method;
        context.Request.Path = path;
        if (body is not null)
        {
            var bytes = Encoding.UTF8.GetBytes(body);
            context.Request.Body = new MemoryStream(bytes);
            context.Request.ContentLength = bytes.Length;
            context.Request.ContentType = "application/json";
        }
        return context.Request;
    }

    private sealed class CommandFixture : IAsyncDisposable
    {
        public AppConfig Config { get; } = new();
        public ManualTimeProvider Clock { get; } = new();
        public FunscriptPlayer Player { get; }
        public MotionRecorder Recorder { get; }
        public OutputCoordinator Outputs { get; }
        public MotionRuntime Runtime { get; }
        public SensaApplication Application { get; }
        public HttpCommandAdapter Http { get; }
        public WebSocketCommandAdapter WebSocket { get; }
        public int Changes { get; private set; }

        public CommandFixture()
        {
            Player = new FunscriptPlayer(Clock);
            Recorder = new MotionRecorder(Clock);
            Runtime = new MotionRuntime(Config, new OscParameterStore(Clock), new NullMotionOutput(), recorder: Recorder, scriptPlayer: Player, timeProvider: Clock);
            Outputs = new OutputCoordinator(Config, _ => { }, _ => { }, _ => { });
            Application = new SensaApplication(Config, Runtime, Player, Recorder, Outputs,
                new ApplicationHost(
                    () => new { inputActive = Runtime.InputActive },
                    () => Array.Empty<string>(),
                    () => new[] { new { portName = "mock" } },
                    incoming => { Config.CopyFrom(incoming); return Task.FromResult(Config); },
                    source => new { sourceKey = source },
                    () => Task.FromResult<object>(new { ok = true }),
                    () => { },
                    () => false,
                    () => Changes++,
                    _ => { }, _ => { }, _ => { }));
            Http = new HttpCommandAdapter(Application);
            WebSocket = new WebSocketCommandAdapter(Application);
        }

        public async ValueTask DisposeAsync()
        {
            Runtime.Dispose();
            Player.Dispose();
            await Outputs.DisposeAsync();
        }
    }

    private sealed class NullMotionOutput : IMotionOutput
    {
        public Task SendAsync(MotionFrame frame) => Task.CompletedTask;
        public Task EmergencyStopAsync() => Task.CompletedTask;
    }
}
