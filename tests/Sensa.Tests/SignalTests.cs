using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Input.Script;
using Sensa.Motion;
using Sensa.Runtime;
using Sensa.Signals;
using Xunit;

namespace Sensa.Tests;

public class SignalTests
{
    [Theory]
    [InlineData("v2/JawOpen", true)]
    [InlineData("Avatar/Face/v2/EyeLeftXNegative", true)]
    [InlineData("FT/v2/MouthSmileRight4", true)]
    [InlineData("LeftEyeLidExpanded8", true)]
    [InlineData("OGB/Orf/Mouth/PenOthers", false)]
    [InlineData("v2/Depth", false)]
    public void FaceTrackingIsConservative(string path, bool expected) => Assert.Equal(expected, OscParameterClassifier.Classify(path).IsFaceTracking);

    [Fact]
    public void RelatedNamesAreHintsNotMappings()
    {
        Assert.True(OscParameterClassifier.Classify("Custom/PenOthres").Relevance > 10);
        Assert.False(OscParameterStore.MatchesPathPattern("OGB/**/PenOthers", "Custom/PenOthres"));
    }

    [Theory]
    [InlineData("OGB/Orf/**/PenOthers", "OGB/Orf/Pussy/PenOthers", true)]
    [InlineData("OGB/Orf/**/PenOthers", "OGB/Orf/Pussy/Main/PenOthers", true)]
    [InlineData("A/*;B/**", "B/x/y", true)]
    [InlineData("A/**", "A", true)]
    [InlineData("A/*", "A/x/y", false)]
    public void PatternsHandleAliasesAndLegacyPaths(string pattern, string path, bool expected) => Assert.Equal(expected, OscParameterStore.MatchesPathPattern(pattern, path));

    [Fact]
    public void InvalidNumbersAreRejectedAndCatalogIsBounded()
    {
        var store = new OscParameterStore();
        store.Set("bad", OscValue.FromFloat(float.NaN));
        store.Set("infinity", OscValue.FromFloat(float.PositiveInfinity));
        Assert.Empty(store.SnapshotEntries());
        for (var i = 0; i < 5000; i++) store.Set($"FT/{i}", OscValue.FromInt(i));
        Assert.Equal(OscParameterStore.MaxPaths, store.SnapshotEntries().Length);
    }

    [Fact]
    public void ExplicitSourceNeverFallsBackToAnotherSender()
    {
        var store = new OscParameterStore();
        store.Set("A", OscValue.FromFloat(1), new("other", "other", null, "127.0.0.1", 5));
        Assert.False(store.TryGetLatest("A", "selected", out _));
    }

    [Fact]
    public void InvalidSourceAllowlistCannotSilentlyBecomeAllowAll()
    {
        var candidate = new AppConfig(); candidate.Osc.AllowedSourceAddresses = ["not-an-ip"];
        Assert.Throws<ArgumentException>(() => new AppConfig().CopyFrom(candidate));
    }

    [Fact]
    public void RootTipDepthRequiresCalibrationAndResetsOnExit()
    {
        var depth = new SpsDepthEstimator();
        Assert.Equal(0, depth.Process(.9f, 1));
        Assert.Equal(0, depth.Process(.7f, .9f)); // measured 20 cm before entry
        Assert.InRange(depth.Process(.9f, 1), .49f, .51f);
        Assert.Equal(0, depth.Process(0, 0));
        Assert.Equal(0, depth.Process(.9f, 1));
    }

    [Fact]
    public async Task ScriptEmitsFinalFrame()
    {
        using var player = new FunscriptPlayer();
        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes("{\"actions\":[{\"at\":0,\"pos\":100},{\"at\":50,\"pos\":0}]}"));
        player.Load("end.funscript", stream);
        var last = new TaskCompletionSource<float>(TaskCreationOptions.RunContinuationsAsynchronously);
        player.OnFrame += value => { if (value == 0) last.TrySetResult(value); };
        player.Play(restart: true);
        Assert.Equal(0, await last.Task.WaitAsync(TimeSpan.FromSeconds(3)));
    }

    [Fact]
    public async Task EmergencyDropsQueuedManualMotionAndClearDoesNotResume()
    {
        var config = new AppConfig(); config.NormalizeForRuntime();
        var store = new OscParameterStore();
        using var receiver = new OscInputReceiver(store);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var stopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var sent = 0;
        using var runtime = new MotionRuntime(config, store, receiver,
            sendOutputsAsync: async _ => { Interlocked.Increment(ref sent); entered.TrySetResult(); await release.Task; },
            emergencyStopAsync: () => { stopped.TrySetResult(); return Task.CompletedTask; });
        runtime.SetInputActive(true);
        runtime.SetManualOverride(new MotionFrame { L0 = .1f });
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(3));
        for (var i = 0; i < 100; i++) runtime.SetManualOverride(new MotionFrame { L0 = .8f });
        runtime.EmergencyStop();
        release.TrySetResult();
        await stopped.Task.WaitAsync(TimeSpan.FromSeconds(3));
        runtime.ClearEmergency();
        await Task.Delay(100);
        Assert.Equal(1, sent);
        Assert.False(runtime.InputActive);
    }

    [Fact]
    public async Task MultipleMatchesFuseStrongestInsteadOfMostRecent()
    {
        var config = new AppConfig { Signals = [new() { OscPath = "OGB/**/PenOthers", Role = SignalRole.Depth }] };
        config.NormalizeForRuntime();
        var store = new OscParameterStore();
        store.Set("OGB/Orf/A/PenOthers", OscValue.FromFloat(.8f));
        store.Set("OGB/Orf/B/PenOthers", OscValue.FromFloat(0));
        using var receiver = new OscInputReceiver(store);
        var sent = new TaskCompletionSource<MotionFrame>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var runtime = new MotionRuntime(config, store, receiver, sendOutputsAsync: frame => { sent.TrySetResult(frame); return Task.CompletedTask; });
        runtime.SetInputMode(RuntimeInputMode.Osc);
        runtime.SetInputActive(true);
        Assert.InRange((await sent.Task.WaitAsync(TimeSpan.FromSeconds(3))).L0, .79f, .81f);
    }

    [Fact]
    public async Task ClosingAnyConfiguredGateStopsOutputs()
    {
        var config = new AppConfig { Signals = [
            new() { OscPath = "depth", Role = SignalRole.Depth },
            new() { OscPath = "gateA", Role = SignalRole.GateEnable },
            new() { OscPath = "gateB", Role = SignalRole.GateEnable }] };
        config.NormalizeForRuntime();
        var store = new OscParameterStore();
        store.Set("depth", OscValue.FromFloat(.7f));
        store.Set("gateA", OscValue.FromBool(true));
        store.Set("gateB", OscValue.FromBool(false));
        using var receiver = new OscInputReceiver(store);
        var stopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var sent = 0;
        using var runtime = new MotionRuntime(config, store, receiver,
            sendOutputsAsync: _ => { sent++; return Task.CompletedTask; },
            emergencyStopAsync: () => { stopped.TrySetResult(); return Task.CompletedTask; });
        runtime.SetInputMode(RuntimeInputMode.Osc); runtime.SetInputActive(true);
        await stopped.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(0, sent); Assert.False(runtime.CanSend);
    }

    [Fact]
    public async Task InputOffSendsStopAndEmergencyCannotBeArmed()
    {
        var config = new AppConfig(); config.NormalizeForRuntime();
        var store = new OscParameterStore(); using var receiver = new OscInputReceiver(store);
        var stopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var runtime = new MotionRuntime(config, store, receiver, emergencyStopAsync: () => { stopped.TrySetResult(); return Task.CompletedTask; });
        runtime.SetInputActive(true); runtime.SetInputActive(false);
        await stopped.Task.WaitAsync(TimeSpan.FromSeconds(3));
        runtime.EmergencyStop(); runtime.SetInputActive(true); runtime.ClearEmergency();
        Assert.False(runtime.InputActive);
    }
    [Fact]
    public async Task ReactivatingSameManualPoseResendsAfterStop()
    {
        var config = new AppConfig(); config.NormalizeForRuntime();
        var store = new OscParameterStore(); using var receiver = new OscInputReceiver(store);
        var count = 0;
        using var runtime = new MotionRuntime(config, store, receiver,
            sendOutputsAsync: _ => { Interlocked.Increment(ref count); return Task.CompletedTask; });
        runtime.SetManualOverride(new MotionFrame { L0 = .7f });
        runtime.SetInputActive(true);
        for (var i = 0; i < 100 && count < 1; i++) await Task.Delay(10);
        runtime.SetInputActive(false); await Task.Delay(50); runtime.SetInputActive(true);
        for (var i = 0; i < 100 && count < 2; i++) await Task.Delay(10);
        Assert.Equal(2, count);
    }

}
