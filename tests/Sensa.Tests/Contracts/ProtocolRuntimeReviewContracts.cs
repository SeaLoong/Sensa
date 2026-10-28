using System.Threading.Channels;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Input.Protocols;
using Sensa.Motion;
using Sensa.Runtime;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class ProtocolRuntimeReviewContracts
{
    [Fact]
    public async Task A_stop_is_a_barrier_before_a_later_command_even_when_removed_dictionary_slots_are_reused()
    {
        using var rig = new ProtocolRig(blockFirst: true);
        Assert.True(rig.Store.Publish("source", "client", [new("V0", .5)], out _));
        try
        {
            await rig.Output.FirstEntered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            Assert.True(rig.Store.Publish("source", "client", [new("L0", .1, 1000), new("R0", .2, 2000)], out _));
            rig.Store.Stop("source", "client");
            Assert.True(rig.Store.Publish("source", "client", [new("L0", .8, 450)], out _));
        }
        finally { rig.Output.Release.TrySetResult(); }
        var admitted = await rig.Output.NextAsync(); Assert.False(admitted.Stop);
        var barrier = await rig.Output.NextAsync(); Assert.True(barrier.Stop);
        var latest = await rig.Output.NextAsync(); Assert.False(latest.Stop);
        Assert.Equal(.8f, latest.Frame!.L0); Assert.Equal(450, latest.Frame.RequestedMotionValue);
        Assert.Equal(new[] { MotionAxis.L0 }, latest.Frame.ActiveAxes);
        Assert.Equal(3, rig.Output.Count);
    }

    [Fact]
    public async Task Multi_axis_batches_keep_each_axis_duration_and_do_not_reissue_other_axes()
    {
        using var rig = new ProtocolRig();
        Assert.True(rig.Store.Publish("source", "client", [new("L0", .75, 200), new("R0", .25, 900)], out _));
        var first = (await rig.Output.NextAsync()).Frame!;
        var second = (await rig.Output.NextAsync()).Frame!;
        Assert.Equal(new[] { MotionAxis.L0 }, first.ActiveAxes); Assert.Equal(200, first.RequestedMotionValue); Assert.Equal(200d, first.DeltaMs);
        Assert.Equal(new[] { MotionAxis.R0 }, second.ActiveAxes); Assert.Equal(900, second.RequestedMotionValue); Assert.Equal(900d, second.DeltaMs);
        Assert.Equal(.75f, second.L0); Assert.Equal(.25f, second.R0);
    }

    [Fact]
    public async Task Expiry_cancels_queued_targets_and_stops_after_an_already_admitted_send()
    {
        using var rig = new ProtocolRig(blockFirst: true);
        Assert.True(rig.Store.Publish("source", "client", [new("L0", .25, 1000)], out _));
        try
        {
            await rig.Output.FirstEntered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            Assert.True(rig.Store.Publish("source", "client", [new("L0", .9, 500), new("R0", .75, 800)], out _));
            rig.Clock.Advance(TimeSpan.FromMilliseconds(2100));
            Assert.False(rig.Store.Read("source/L0/target", rig.Now).Valid);
        }
        finally { rig.Output.Release.TrySetResult(); }
        Assert.False((await rig.Output.NextAsync()).Stop);
        Assert.True((await rig.Output.NextAsync()).Stop);
        Assert.Equal(2, rig.Output.Count);
        Assert.False(rig.Store.Publish("source", "client", [new("L0", .5)], out _));
    }

    [Fact]
    public async Task Activation_and_clearing_emergency_never_replay_commands_received_while_disarmed()
    {
        using var rig = new ProtocolRig(active: false);
        Assert.True(rig.Store.Publish("source", "client", [new("L0", .75, 1000)], out _));
        rig.Runtime.SetInputActive(true);
        Assert.False(rig.Store.Read("source/L0/target", rig.Now).Valid);
        Assert.Equal(0, rig.Output.Count);
        Assert.True(rig.Store.Publish("source", "client", [new("L0", .25, 200)], out _));
        Assert.False((await rig.Output.NextAsync()).Stop);
        rig.Runtime.EmergencyStop();
        Assert.True((await rig.Output.NextAsync()).Stop);
        Assert.True(rig.Store.Publish("source", "client", [new("L0", .9)], out _));
        rig.Runtime.ClearEmergency();
        Assert.False(rig.Runtime.InputActive);
        rig.Runtime.SetInputActive(true);
        Assert.False(rig.Store.Read("source/L0/target", rig.Now).Valid);
        Assert.Equal(2, rig.Output.Count);
        Assert.True(rig.Store.Publish("source", "client", [new("L0", .4, 300)], out _));
        Assert.Equal(.4f, (await rig.Output.NextAsync()).Frame!.L0);
    }

    [Fact]
    public void Clearing_commands_invalidates_a_TCode_speed_baseline_without_releasing_its_session()
    {
        var clock = new ManualTimeProvider();
        var config = Input();
        using var store = new ExternalControlStore([config], clock);
        using var session = new TCodeInputSession(config, store, "client", clock);
        store.CommandsCleared += session.ResetCommands;
        Assert.True(session.TryProcessLine("L05", out _, out _));
        var epoch = session.Epoch;
        store.ClearCommands();
        Assert.False(session.TryProcessLine("L09S1000", out _, out _));
        Assert.False(session.TryProcessLine("L02", out _, out _, epoch));
        Assert.True(session.TryProcessLine("L02", out _, out _));
        Assert.True(store.Read("source/L0/target", clock.GetUtcNow().ToUnixTimeMilliseconds()).Valid);
    }

    private static ProtocolInputConfig Input() => new()
    {
        Id = "source", Type = "TCodeTcp", Enabled = true, Port = 12401, TimeoutMs = 1000,
        Features = [new() { Channel = "L0", TargetAxis = "L0" }, new() { Channel = "R0", TargetAxis = "R0" },
            new() { Channel = "V0", TargetAxis = "V0", Actuator = "Scalar" }],
    };
    private sealed class ProtocolRig : IDisposable
    {
        public ManualTimeProvider Clock { get; } = new();
        public long Now => Clock.GetUtcNow().ToUnixTimeMilliseconds();
        public ExternalControlStore Store { get; }
        public MotionRuntime Runtime { get; }
        public ReviewOutput Output { get; }
        public ProtocolRig(bool blockFirst = false, bool active = true)
        {
            var input = Input();
            var config = new AppConfig { ProtocolInputs = [input], Signals = [] };
            Store = new([input], Clock); Output = new(blockFirst);
            Runtime = new(config, new OscParameterStore(Clock), Output, timeProvider: Clock);
            Runtime.AttachExternalControls(Store);
            Runtime.SetInputMode(RuntimeInputMode.Protocol);
            Runtime.SetInputActive(active);
            Assert.True(Store.TryAcquire("source", "client", out _));
        }
        public void Dispose() { Output.Release.TrySetResult(); Runtime.Dispose(); Store.Dispose(); }
    }
    private sealed record OutputEvent(bool Stop, MotionFrame? Frame = null);
    private sealed class ReviewOutput(bool blockFirst) : IMotionOutput
    {
        private readonly Channel<OutputEvent> _events = Channel.CreateUnbounded<OutputEvent>();
        private int _sends, _count;
        public int Count => Volatile.Read(ref _count);
        public TaskCompletionSource FirstEntered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public async Task SendAsync(MotionFrame frame)
        {
            if (Interlocked.Increment(ref _sends) == 1 && blockFirst)
            { FirstEntered.TrySetResult(); await Release.Task.WaitAsync(TimeSpan.FromSeconds(3)); }
            Interlocked.Increment(ref _count); _events.Writer.TryWrite(new(false, frame));
        }
        public Task EmergencyStopAsync()
        { Interlocked.Increment(ref _count); _events.Writer.TryWrite(new(true)); return Task.CompletedTask; }
        public Task<OutputEvent> NextAsync() => _events.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
    }
}
