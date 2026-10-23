using System.Text;
using System.Text.Json;
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

namespace Sensa.Tests.Contracts;

[Collection("Signal session files")]
public sealed class RecordingScriptApiContracts
{
    private const string Endpoint = "/api/input/script/load-recording";
    private const string Script = "{\"version\":\"1.0\",\"inverted\":false,\"range\":100,\"actions\":[{\"at\":0,\"pos\":25},{\"at\":1000,\"pos\":75}]}";

    [Fact]
    public async Task A_tiny_websocket_command_loads_a_large_finalized_recording_without_uploading_its_contents()
    {
        await using var fixture = new CommandFixture();
        var fileName = "large.funscript";
        using (var writer = new StreamWriter(fixture.PathFor(fileName), false, new UTF8Encoding(false)))
        {
            writer.Write(Script[..^1]); writer.Write(",\"metadata\":{\"note\":\"");
            writer.Write(new string('x', 4 * 1024 * 1024 + 256)); writer.Write("\"}}");
        }
        Assert.True(new FileInfo(fixture.PathFor(fileName)).Length > 4 * 1024 * 1024);
        fixture.Runtime.SetInputMode(RuntimeInputMode.Combined); fixture.Runtime.SetInputActive(true);
        var command = JsonSerializer.Serialize(new { id = "load-large", method = "POST", path = Endpoint, body = new { fileName } });
        Assert.True(Encoding.UTF8.GetByteCount(command) < 1024);

        var response = await fixture.WebSocket.HandleAsync(command);

        Assert.True(response.Ok); Assert.Equal("load-large", response.Id);
        Assert.False(fixture.Runtime.InputActive);
        Assert.Equal(RuntimeInputMode.Combined, fixture.Runtime.CurrentInputMode);
        var player = fixture.Player.GetSnapshot();
        Assert.True(player.Loaded); Assert.False(player.Playing);
        Assert.Equal(fileName, player.FileName); Assert.Equal(2, player.ActionCount); Assert.Equal(1000, player.DurationMs);
    }

    [Fact]
    public async Task Loading_a_recording_from_manual_mode_selects_script_and_preserves_playback_preferences_without_starting()
    {
        await using var fixture = new CommandFixture();
        using (var previous = new MemoryStream(Encoding.UTF8.GetBytes(Script))) fixture.Player.Load("previous.funscript", previous);
        fixture.Player.Configure(loop: true, speed: 1.5);
        fixture.Runtime.SetInputMode(RuntimeInputMode.Manual); fixture.Runtime.SetInputActive(true);
        File.WriteAllText(fixture.PathFor("capture.funscript"), Script);

        var response = await fixture.Load("capture.funscript");

        Assert.Equal(200, response.StatusCode); Assert.False(fixture.Runtime.InputActive);
        Assert.Equal(RuntimeInputMode.Script, fixture.Runtime.CurrentInputMode);
        var player = fixture.Player.GetSnapshot();
        Assert.True(player.Loaded); Assert.False(player.Playing); Assert.Equal("capture.funscript", player.FileName);
        Assert.True(player.Loop); Assert.Equal(1.5, player.Speed);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("capture.csv")]
    [InlineData("capture.jsonl")]
    [InlineData("capture.funscript.pending")]
    [InlineData("unfinished.funscript")]
    [InlineData("../outside.funscript")]
    [InlineData("..\\outside.funscript")]
    [InlineData("missing.funscript")]
    public async Task Only_existing_final_funscripts_in_the_recording_directory_can_be_loaded(string? fileName)
    {
        await using var fixture = new CommandFixture();
        foreach (var invalidExtension in new[] { "capture.csv", "capture.jsonl", "capture.funscript.pending", "unfinished.funscript.pending" })
            File.WriteAllText(fixture.PathFor(invalidExtension), Script);
        File.WriteAllText(System.IO.Path.Combine(fixture.Root, "outside.funscript"), Script);

        var response = await fixture.Load(fileName);

        Assert.Equal(400, response.StatusCode); Assert.False(response.Success);
        Assert.False(fixture.Player.GetSnapshot().Loaded);
    }

    [Fact]
    public async Task Absolute_paths_oversized_names_and_files_larger_than_64MiB_are_rejected_before_loading()
    {
        await using var fixture = new CommandFixture();
        var outside = System.IO.Path.Combine(fixture.Root, "outside.funscript"); File.WriteAllText(outside, Script);
        var oversized = "oversized.funscript";
        using (var file = File.Create(fixture.PathFor(oversized))) file.SetLength(SignalSessionRecorder.MaximumBytes + 1);
        foreach (var name in new[] { outside, new string('x', 256) + ".funscript", oversized })
        {
            var response = await fixture.Load(name);
            Assert.Equal(400, response.StatusCode); Assert.False(fixture.Player.GetSnapshot().Loaded);
        }
    }

    [Fact]
    public async Task Invalid_recording_contents_disarm_input_and_preserve_the_previous_script()
    {
        await using var fixture = new CommandFixture();
        var previous = await fixture.Application.ExecuteAsync("POST", "/api/input/script/load",
            JsonSerializer.SerializeToElement(new { fileName = "previous.funscript", content = Script }));
        Assert.True(previous.Success);
        fixture.Runtime.SetInputMode(RuntimeInputMode.Combined); fixture.Runtime.SetInputActive(true);
        var playing = await fixture.Application.ExecuteAsync("POST", "/api/input/script/play", JsonSerializer.SerializeToElement(new { restart = true }));
        Assert.True(playing.Success); Assert.True(fixture.Player.GetSnapshot().Playing);
        File.WriteAllText(fixture.PathFor("invalid.funscript"), "{}");

        var response = await fixture.Load("invalid.funscript");

        Assert.Equal(400, response.StatusCode); Assert.False(fixture.Runtime.InputActive);
        Assert.Equal(RuntimeInputMode.Combined, fixture.Runtime.CurrentInputMode);
        var player = fixture.Player.GetSnapshot();
        Assert.True(player.Loaded); Assert.False(player.Playing);
        Assert.Equal("previous.funscript", player.FileName); Assert.Equal(2, player.ActionCount);
    }

    private sealed class CommandFixture : IAsyncDisposable
    {
        private readonly string? _previousDirectory = Environment.GetEnvironmentVariable("SENSA_RECORDINGS_PATH");
        public string Root { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "sensa-recording-script-" + Guid.NewGuid().ToString("N"));
        private string Recordings => System.IO.Path.Combine(Root, "recordings");
        private AppConfig Config { get; } = new();
        private ManualTimeProvider Clock { get; } = new();
        public FunscriptPlayer Player { get; }
        private MotionRecorder Recorder { get; }
        private OutputCoordinator Outputs { get; }
        public MotionRuntime Runtime { get; }
        public SensaApplication Application { get; }
        public WebSocketCommandAdapter WebSocket { get; }
        public string PathFor(string fileName) => System.IO.Path.Combine(Recordings, fileName);
        public Task<CommandResult> Load(string? fileName) => Application.ExecuteAsync("POST", Endpoint, JsonSerializer.SerializeToElement(new { fileName }));

        public CommandFixture()
        {
            Directory.CreateDirectory(Recordings); Environment.SetEnvironmentVariable("SENSA_RECORDINGS_PATH", Recordings);
            Player = new FunscriptPlayer(Clock); Recorder = new MotionRecorder(Clock);
            Runtime = new MotionRuntime(Config, new OscParameterStore(Clock), new NullMotionOutput(), recorder: Recorder, scriptPlayer: Player, timeProvider: Clock);
            Outputs = new OutputCoordinator(Config, _ => { }, _ => { }, _ => { });
            Application = new SensaApplication(Config, Runtime, Player, Recorder, Outputs, new ApplicationHost(
                () => new { inputActive = Runtime.InputActive }, () => Array.Empty<string>(), () => Array.Empty<object>(),
                incoming => { Config.CopyFrom(incoming); return Task.FromResult(Config); }, source => new { sourceKey = source },
                () => Task.FromResult<object>(new { ok = true }), () => { }, () => false, () => { }, _ => { }, _ => { }, _ => { }));
            WebSocket = new WebSocketCommandAdapter(Application);
        }

        public async ValueTask DisposeAsync()
        {
            try { Runtime.Dispose(); Player.Dispose(); await Outputs.DisposeAsync(); }
            finally
            {
                Environment.SetEnvironmentVariable("SENSA_RECORDINGS_PATH", _previousDirectory);
                if (Directory.Exists(Root)) Directory.Delete(Root, recursive: true);
            }
        }
    }

    private sealed class NullMotionOutput : IMotionOutput
    {
        public Task SendAsync(MotionFrame frame) => Task.CompletedTask;
        public Task EmergencyStopAsync() => Task.CompletedTask;
    }
}
