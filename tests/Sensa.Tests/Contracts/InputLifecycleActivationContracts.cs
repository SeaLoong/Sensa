using System.Text;
using System.Text.Json;
using Sensa.Application;
using Sensa.Configuration;
using Sensa.Hosting;
using Sensa.Input.Osc;
using Sensa.Input.Script;
using Sensa.Motion;
using Sensa.Outputs;
using Sensa.Outputs.Adapters;
using Sensa.Recording;
using Sensa.Runtime;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

[Collection("Signal session files")]
public sealed class InputLifecycleActivationContracts
{
    private const string Script = """{"actions":[{"at":0,"pos":25},{"at":1000,"pos":75}]}""";

    [Theory]
    [InlineData(RuntimeInputMode.Script, true)]
    [InlineData(RuntimeInputMode.Combined, true)]
    [InlineData(RuntimeInputMode.Script, false)]
    [InlineData(RuntimeInputMode.Combined, false)]
    public async Task Script_stream_loading_blocks_activation_until_the_new_script_is_committed_or_rejected(RuntimeInputMode mode, bool valid)
    {
        await using var rig = new Rig();
        using (var previous = new MemoryStream(Encoding.UTF8.GetBytes(Script))) rig.Player.Load("previous.funscript", previous);
        rig.Runtime.SetInputMode(mode);
        rig.Runtime.SetInputActive(true);
        using var content = new BlockingReadStream(valid ? Script : "{}");
        var loading = Task.Run(() => rig.Application.LoadScriptAsync("replacement.funscript", content, false, 1));
        try
        {
            await content.Latch.Entered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            await AssertActivationBlocked(rig);
            Assert.Equal("previous.funscript", rig.Player.GetSnapshot().FileName);
        }
        finally { content.Latch.Release.TrySetResult(); }
        Assert.Equal(valid, (await loading.WaitAsync(TimeSpan.FromSeconds(3))).Success);
        Assert.Equal(mode, rig.Runtime.CurrentInputMode);
        Assert.Equal(valid ? "replacement.funscript" : "previous.funscript", rig.Player.GetSnapshot().FileName);
        Assert.False(rig.Player.GetSnapshot().Playing);
        await AssertFreshActivationRequired(rig);
    }

    [Fact]
    public async Task Replay_loading_blocks_activation_while_the_previous_output_stop_is_in_flight()
    {
        var previousPath = Environment.GetEnvironmentVariable("SENSA_RECORDINGS_PATH");
        var directory = Path.Combine(Path.GetTempPath(), "sensa-replay-activation-" + Guid.NewGuid().ToString("N"));
        Environment.SetEnvironmentVariable("SENSA_RECORDINGS_PATH", directory);
        var adapter = new BlockingStopAdapter();
        try
        {
            await using var rig = new Rig(adapter);
            string fileName;
            using (var recorder = new SignalSessionRecorder("replay", "JsonLines"))
            {
                recorder.Append("depth", Sensa.Signals.ComputedSignalSample.Success(.25f, null, 0), .25, 0);
                recorder.Append("depth", Sensa.Signals.ComputedSignalSample.Success(.75f, null, 1000), .75, 1000);
                fileName = recorder.FileName;
            }
            Assert.True(await rig.Outputs.ConnectAsync("output"));
            rig.Runtime.SetInputActive(true);
            var loading = rig.Application.ExecuteAsync("POST", "/api/output/replay/load",
                JsonSerializer.SerializeToElement(new { outputId = "output", fileName }));
            try
            {
                await adapter.Latch.Entered.Task.WaitAsync(TimeSpan.FromSeconds(3));
                Assert.Equal(.125, adapter.StopValue);
                await AssertActivationBlocked(rig);
            }
            finally { adapter.Latch.Release.TrySetResult(); }
            var response = await loading.WaitAsync(TimeSpan.FromSeconds(3));
            Assert.True(response.Success);
            var replay = JsonSerializer.SerializeToElement(response.Data, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            Assert.True(replay.GetProperty("loaded").GetBoolean());
            Assert.False(replay.GetProperty("playing").GetBoolean());
            await AssertFreshActivationRequired(rig);
        }
        finally
        {
            adapter.Latch.Release.TrySetResult();
            Environment.SetEnvironmentVariable("SENSA_RECORDINGS_PATH", previousPath);
            if (Directory.Exists(directory)) Directory.Delete(directory, true);
        }
    }

    [Fact]
    public async Task Mode_change_blocks_activation_through_its_last_state_notification()
    {
        await using var rig = new Rig();
        var latch = new Latch();
        rig.Runtime.OnLog += message => { if (message.StartsWith("[Input] Mode switched", StringComparison.Ordinal)) latch.Wait(); };
        var changing = Task.Run(() => rig.Runtime.SetInputMode(RuntimeInputMode.Combined));
        try
        {
            await latch.Entered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            Assert.Equal(RuntimeInputMode.Combined, rig.Runtime.CurrentInputMode);
            await AssertActivationBlocked(rig);
        }
        finally { latch.Release.TrySetResult(); }
        await changing.WaitAsync(TimeSpan.FromSeconds(3));
        await AssertFreshActivationRequired(rig);
    }

    [Fact]
    public async Task Source_selection_holds_the_scope_through_persisting_and_committing_the_selected_source()
    {
        await using var rig = new Rig();
        var latch = new Latch();
        string? selected = "old";
        rig.SelectSource = next =>
        {
            using var sourceChange = SensaHost.PrepareOscSourceSelection(rig.Runtime, selected, next);
            latch.Wait();
            selected = next;
            return new { sourceKey = selected };
        };
        rig.Runtime.SetInputActive(true);
        var changing = Task.Run(() => rig.Application.ExecuteAsync("PUT", "/api/input/osc/source", JsonSerializer.SerializeToElement(new { sourceKey = "new" })));
        try
        {
            await latch.Entered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            Assert.Equal("old", selected);
            await AssertActivationBlocked(rig);
        }
        finally { latch.Release.TrySetResult(); }
        Assert.True((await changing.WaitAsync(TimeSpan.FromSeconds(3))).Success);
        Assert.Equal("new", selected);
        await AssertFreshActivationRequired(rig);
    }

    private static async Task AssertActivationBlocked(Rig rig)
    {
        var activation = await rig.Activate().WaitAsync(TimeSpan.FromSeconds(3));
        Assert.False(activation.Success);
        Assert.Contains("Updating input setup", JsonSerializer.Serialize(activation.Data));
        Assert.False(rig.Runtime.InputActive);
        Assert.False(rig.Runtime.CanSend);
        Assert.False(rig.Runtime.CanRouteSignals);
    }

    private static async Task AssertFreshActivationRequired(Rig rig)
    {
        Assert.False(rig.Runtime.InputActive);
        Assert.False(rig.Runtime.CanRouteSignals);
        Assert.True((await rig.Activate()).Success);
        Assert.True(rig.Runtime.InputActive);
    }

    private sealed class Latch
    {
        public TaskCompletionSource Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public void Wait()
        {
            Entered.TrySetResult();
            Release.Task.WaitAsync(TimeSpan.FromSeconds(5)).GetAwaiter().GetResult();
        }
    }

    private sealed class BlockingReadStream(string content) : Stream
    {
        private readonly MemoryStream _inner = new(Encoding.UTF8.GetBytes(content));
        private int _first = 1;
        public Latch Latch { get; } = new();
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => _inner.Position; set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count)
        {
            if (Interlocked.Exchange(ref _first, 0) != 0) Latch.Wait();
            return _inner.Read(buffer, offset, count);
        }
        public override int Read(Span<byte> buffer)
        {
            if (Interlocked.Exchange(ref _first, 0) != 0) Latch.Wait();
            return _inner.Read(buffer);
        }
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        protected override void Dispose(bool disposing) { if (disposing) { Latch.Release.TrySetResult(); _inner.Dispose(); } base.Dispose(disposing); }
    }

    private sealed class BlockingStopAdapter : ISignalOutputAdapter
    {
        private int _first = 1;
        public Latch Latch { get; } = new();
        public bool IsConnected { get; private set; }
        public double? StopValue { get; private set; }
        public Task ConnectAsync(CancellationToken cancellationToken = default) { IsConnected = true; return Task.CompletedTask; }
        public async ValueTask SendAsync(SignalOutputValue value, CancellationToken cancellationToken = default)
        {
            if (Interlocked.Exchange(ref _first, 0) == 0) return;
            StopValue = value.Value;
            Latch.Entered.TrySetResult();
            await Latch.Release.Task.WaitAsync(cancellationToken);
        }
        public ValueTask StopAsync(CancellationToken cancellationToken = default) => ValueTask.CompletedTask;
        public ValueTask DisposeAsync() { IsConnected = false; return ValueTask.CompletedTask; }
    }

    private sealed class Rig : IAsyncDisposable
    {
        public FunscriptPlayer Player { get; }
        public MotionRuntime Runtime { get; }
        public OutputCoordinator Outputs { get; }
        public SensaApplication Application { get; }
        public Func<string?, object> SelectSource { get; set; } = source => new { sourceKey = source };
        public Task<CommandResult> Activate() => Application.ExecuteAsync("PUT", "/api/input/active", JsonSerializer.SerializeToElement(new { active = true }));
        public Rig(ISignalOutputAdapter? adapter = null)
        {
            var config = new AppConfig { Outputs = adapter is null ? [] : [new()
            {
                Id = "output", Type = OutputDeviceType.HttpJson, Enabled = true, WebsocketAddress = "http://mock.invalid/",
                Signal = new() { Bindings = [new() { Id = "binding", Address = "depth", StopValue = .125 }] },
            }] };
            var clock = new ManualTimeProvider();
            Player = new(clock);
            Runtime = new(config, new OscParameterStore(clock), new NullMotionOutput(), scriptPlayer: Player, timeProvider: clock);
            Outputs = new(config, _ => { }, _ => { }, _ => { }, adapter is null ? null : _ => adapter);
            Application = new(config, Runtime, Player, new MotionRecorder(clock), Outputs,
                new ApplicationHost(() => new { }, () => new { }, () => new { }, incoming => Task.FromResult(incoming), source => SelectSource(source),
                    () => Task.FromResult<object>(new { }), () => { }, () => false, () => { }, _ => { }, _ => { }, _ => { }));
        }
        public async ValueTask DisposeAsync() { Runtime.Dispose(); Player.Dispose(); await Outputs.DisposeAsync(); }
    }

    private sealed class NullMotionOutput : IMotionOutput
    {
        public Task SendAsync(MotionFrame frame) => Task.CompletedTask;
        public Task EmergencyStopAsync() => Task.CompletedTask;
    }
}
