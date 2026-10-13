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
        Assert.Equal(0, depth.Process(.71f, .9f)); // native 1 cm Root sender, 20 cm length sphere
        Assert.InRange(depth.Process(.91f, 1), .49f, .51f);
        Assert.Equal(0, depth.Process(0, 0));
        Assert.Equal(0, depth.Process(.9f, 1));
    }

    [Fact]
    public void NativeSpsFixtureRestoresRootRadiusAndRetainsRadialOffsetLimitation()
    {
        var depth = new SpsDepthEstimator();
        Assert.Equal(0, depth.Process(.77f, .96f)); // socket 24 cm from root, length 20 cm
        Assert.InRange(depth.Process(.89f, 1), .3999f, .4001f); // on axis, 12 cm exposed
        var radialDistance = MathF.Sqrt(.12f * .12f + .06f * .06f);
        Assert.InRange(depth.Process(1 - radialDistance + .01f, 1), .3291f, .3293f);
        // Root saturation cannot resolve distances within its 1 cm sender sphere.
        Assert.InRange(depth.Process(1, 1), .9499f, .9501f);
    }

    [Fact]
    public void SpsCanLearnAShorterReplacementPlugWithoutKeepingThePreviousMaximum()
    {
        var depth = new SpsDepthEstimator();
        Assert.Equal(0, depth.Process(.77f, .96f)); // 20 cm
        Assert.InRange(depth.Process(.89f, 1), .3999f, .4001f);
        Assert.Equal(0, depth.Process(.77f, .86f)); // replacement is 10 cm
        Assert.InRange(depth.Process(.95f, 1), .3999f, .4001f);
    }

    [Fact]
    public void SpsDoesNotRelearnLengthFromANewRootAndCachedTip()
    {
        var depth = new SpsDepthEstimator();
        depth.Process(.77f, .96f, 10);
        Assert.Equal(0, depth.Process(.99f, .96f, 10)); // root arrives first
        Assert.InRange(depth.Process(.99f, 1, 11), .8999f, .9001f);
    }

    [Fact]
    public async Task SpsTipOnlyDeltaRefreshesTheMappedRoot()
    {
        const string root = "OGB/Orf/Test/PenSelfNewRoot";
        const string tip = "OGB/Orf/Test/PenSelfNewTip";
        var config = new AppConfig { Signals = [new() { OscPath = root, SourceMode = "SpsSocketDepth", Role = SignalRole.Depth }] };
        config.NormalizeForRuntime();
        var store = new OscParameterStore(); store.Set(root, OscValue.FromFloat(.77f)); store.Set(tip, OscValue.FromFloat(.96f));
        using var receiver = new OscInputReceiver(store);
        var learned = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var moved = new TaskCompletionSource<float>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var runtime = new MotionRuntime(config, store, receiver, sendOutputsAsync: frame =>
        {
            learned.TrySetResult(); if(frame.L0 > .3f) moved.TrySetResult(frame.L0); return Task.CompletedTask;
        });
        runtime.SetInputMode(RuntimeInputMode.Osc); runtime.SetInputActive(true);
        await learned.Task.WaitAsync(TimeSpan.FromSeconds(3));
        store.Set(root, OscValue.FromFloat(.89f));
        await Task.Delay(70); // root delta has been processed using the cached tip
        store.Set(tip, OscValue.FromFloat(1)); // must cause a refresh despite matching only NewRoot
        Assert.InRange(await moved.Task.WaitAsync(TimeSpan.FromSeconds(3)), .399f, .401f); // normalized TCode mapping resolution
    }

    [Theory]
    [InlineData(float.NaN, 1)]
    [InlineData(.8f, float.PositiveInfinity)]
    [InlineData(1.1f, 1)]
    [InlineData(.8f, 1.1f)]
    [InlineData(.9f, .8f)]
    public void InvalidSpsPairClearsPreviousLength(float root, float tip)
    {
        var depth = new SpsDepthEstimator();
        depth.Process(.77f, .96f);
        Assert.Equal(0, depth.Process(root, tip));
        Assert.Equal(0, depth.Process(.89f, 1));
    }

    [Fact]
    public async Task GateHeartbeatCannotKeepAnExpiredScalarInputArmed()
    {
        var config = new AppConfig { Signals = [
            new() { OscPath = "Sensa/Lab/Shader/Z", Role = SignalRole.Depth },
            new() { OscPath = "Sensa/Lab/Shader/Valid", Role = SignalRole.GateEnable }] };
        config.Osc.InputTimeoutMs = 150; config.NormalizeForRuntime();
        var store = new OscParameterStore();
        store.Set("Sensa/Lab/Shader/Z", OscValue.FromFloat(.6f));
        store.Set("Sensa/Lab/Shader/Valid", OscValue.FromBool(true));
        using var receiver = new OscInputReceiver(store);
        var sent = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var stopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var runtime = new MotionRuntime(config, store, receiver,
            sendOutputsAsync: _ => { sent.TrySetResult(); return Task.CompletedTask; },
            emergencyStopAsync: () => { stopped.TrySetResult(); return Task.CompletedTask; });
        runtime.SetInputMode(RuntimeInputMode.Osc); runtime.SetInputActive(true);
        await sent.Task.WaitAsync(TimeSpan.FromSeconds(3));
        var deadline = DateTime.UtcNow.AddSeconds(3);
        while (runtime.InputActive && DateTime.UtcNow < deadline)
        {
            store.Set("Sensa/Lab/Shader/Valid", OscValue.FromBool(true));
            await Task.Delay(25);
        }
        await stopped.Task.WaitAsync(TimeSpan.FromSeconds(1));
        Assert.True(runtime.IsEmergency); Assert.False(runtime.InputActive); Assert.False(runtime.CanSend);
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
