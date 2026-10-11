using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Runtime;
using Sensa.Signals;
using UnityBox.Sensa;
using Xunit;

namespace Sensa.Tests;

public class PoseTests
{
    internal static float[] Samples(PosePoint point, double radius = .001) => PoseReconstruction.Anchors
        .Select(anchor => (float)Math.Clamp(1 - Math.Max(0, (point - anchor).Length - radius) / SensaPoseProtocol.ReceiverRadius, 0, 1)).ToArray();

    internal static void PutPose(OscParameterStore store, PosePoint root, PosePoint tip, PosePoint side, string instance = "Main", OscSource? source = null)
    {
        var points = new[] { root, tip, side };
        for (var m = 0; m < 3; m++)
        {
            var values = Samples(points[m]);
            for (var i = 0; i < 8; i++) store.Set($"Sensa/Pose/v1/{instance}/Others/{SensaPoseProtocol.Markers[m]}/A{i}", OscValue.FromFloat(values[i]), source ?? OscSource.Unknown);
        }
    }

    [Fact]
    public void SymmetricLegacySphereCannotDistinguishFrontAndBackButArrayCan()
    {
        var front = new PosePoint(.02, .01, -.08); var back = new PosePoint(.02, .01, .08);
        Assert.Equal(front.Length, back.Length);
        Assert.InRange(PoseReconstruction.FitMarker(Samples(front)).Position.Z, -.08001, -.07999);
        Assert.InRange(PoseReconstruction.FitMarker(Samples(back)).Position.Z, .07999, .08001);
    }

    [Theory]
    [InlineData(0, 0, 0, .001)]
    [InlineData(.03, -.025, .12, .001)]
    [InlineData(-.04, .02, -.16, .007)]
    [InlineData(.012, .009, .03, .015)]
    public void FitsOffAxisPositionAndUnknownSenderRadius(double x, double y, double z, double radius)
    {
        var actual = new PosePoint(x, y, z);
        var fit = PoseReconstruction.FitMarker(Samples(actual, radius));
        Assert.True(fit.Valid, fit.Reason);
        Assert.InRange((fit.Position - actual).Length, 0, .00003);
        Assert.InRange(Math.Abs(fit.Radius - radius), 0, .00003);
    }

    [Fact]
    public void LateralOffsetDoesNotShortenTheReconstructedStroke()
    {
        foreach (var offset in new[] { 0, .01, .03 })
        {
            var store = new OscParameterStore();
            PutPose(store, new(offset, 0, -.1), new(offset, 0, .1), new(offset + .03, 0, -.1));
            var pose = Assert.Single(PoseReconstruction.Observe(store.SnapshotEntries()));
            Assert.True(pose.Valid); Assert.True(pose.Engaged);
            Assert.InRange(pose.Depth, .4999, .5001);
            Assert.InRange(Math.Abs(pose.Intersection.X - offset), 0, .00003);
        }
    }

    [Fact]
    public void TiltAndRollAreReconstructedFromTheSameRig()
    {
        var store = new OscParameterStore();
        var axis = new PosePoint(.5, 0, Math.Sqrt(.75));
        var right = new PosePoint(Math.Sqrt(.75), 0, -.5);
        var rotatedRight = right * Math.Cos(Math.PI / 6) + PosePoint.Cross(axis, right) * Math.Sin(Math.PI / 6);
        var root = axis * -.1; var tip = axis * .1;
        PutPose(store, root, tip, root + rotatedRight * .03);
        var pose = Assert.Single(PoseReconstruction.Observe(store.SnapshotEntries()));
        Assert.True(pose.Engaged); Assert.InRange(pose.Depth, .4999, .5001);
        Assert.InRange(pose.Yaw, 29.99, 30.01); Assert.InRange(pose.Roll, 29.99, 30.01);
    }

    [Fact]
    public void OffApertureAndBackwardsPosesDoNotEngage()
    {
        var store = new OscParameterStore();
        PutPose(store, new(.07, 0, -.1), new(.07, 0, .1), new(.10, 0, -.1));
        var pose = Assert.Single(PoseReconstruction.Observe(store.SnapshotEntries()));
        Assert.True(pose.Valid); Assert.False(pose.Engaged); Assert.Equal(0, pose.Depth);
        PutPose(store, new(0, 0, .1), new(0, 0, -.1), new(.03, 0, .1));
        Assert.False(Assert.Single(PoseReconstruction.Observe(store.SnapshotEntries())).Engaged);
        PutPose(store, new(-.1, 0, .02), new(.1, 0, .02), new(-.1, .03, .02));
        Assert.False(Assert.Single(PoseReconstruction.Observe(store.SnapshotEntries())).Valid);
    }

    [Fact]
    public void MissingClippedAndInconsistentSamplesAreRejected()
    {
        Assert.False(PoseReconstruction.FitMarker(new float[7]).Valid);
        Assert.False(PoseReconstruction.FitMarker(new float[8]).Valid);
        var values = Samples(new(.01, .02, .1)); values[3] += .15f;
        Assert.False(PoseReconstruction.FitMarker(values).Valid);
    }

    [Fact]
    public void RollDoesNotJumpBetweenActuatorEndpointsAtAngleWrap()
    {
        var angle = new ContinuousAngle();
        Assert.Equal(179, angle.Update(179));
        Assert.Equal(181, angle.Update(-179));
        Assert.Equal(178, angle.Update(178));
    }

    [Fact]
    public void SmallInputNoiseHasBoundedErrorInTheTestVolume()
    {
        var random = new Random(712);
        var errors = new List<double>();
        for (var i = 0; i < 150; i++)
        {
            var point = new PosePoint((random.NextDouble() - .5) * .06, (random.NextDouble() - .5) * .06, (random.NextDouble() - .5) * .3);
            var values = Samples(point).Select(v => v + (float)((random.NextDouble() - .5) * .0004)).ToArray();
            var fit = PoseReconstruction.FitMarker(values);
            Assert.True(fit.Valid);
            errors.Add((fit.Position - point).Length);
        }
        // Synthetic bounded noise, not a promise about real VRChat/OSC accuracy.
        Assert.True(errors.Max() < .003, $"Maximum synthetic error {errors.Max():F6} m");
    }

    [Fact]
    public async Task MissingPoseStopsInsteadOfFallingBackToLegacyDepth()
    {
        var config = new AppConfig { Signals = [new() { OscPath = "Sensa/Pose/v1/*/*/**", SourceMode = "SensaPose" }, new() { OscPath = "legacy", Role = SignalRole.Depth }] };
        config.NormalizeForRuntime();
        var store = new OscParameterStore(); store.Set("legacy", OscValue.FromFloat(1));
        using var receiver = new OscInputReceiver(store);
        var stop = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var sent = 0;
        using var runtime = new MotionRuntime(config, store, receiver,
            sendOutputsAsync: _ => { sent++; return Task.CompletedTask; }, emergencyStopAsync: () => { stop.TrySetResult(); return Task.CompletedTask; });
        runtime.SetInputMode(RuntimeInputMode.Osc); runtime.SetInputActive(true);
        await stop.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(0, sent); Assert.True(runtime.PoseBlocked);
    }

    [Fact]
    public void SourcesAndRigPrefixesCannotBeCombinedIntoOnePose()
    {
        var store = new OscParameterStore();
        PutPose(store, new(0, 0, -.1), new(0, 0, .1), new(.03, 0, -.1));
        var entries = store.SnapshotEntries().Select((entry, i) => i < 12 ? entry : entry with { Entry = entry.Entry with { Source = new OscSource("second", "second", null, "127.0.0.1", 5) } });
        Assert.All(PoseReconstruction.Observe(entries), pose => Assert.False(pose.Valid));
    }

    [Fact]
    public async Task ValidPoseDrivesGeometryThenLossStopsAllMotion()
    {
        var config = new AppConfig { Signals = [new() { OscPath = "Sensa/Pose/v1/*/*/**", SourceMode = "SensaPose" }] };
        config.NormalizeForRuntime(); var store = new OscParameterStore();
        PutPose(store, new(.02, 0, -.1), new(.02, 0, .1), new(.05, 0, -.1));
        using var receiver = new OscInputReceiver(store);
        var frame = new TaskCompletionSource<Sensa.Motion.MotionFrame>(TaskCreationOptions.RunContinuationsAsynchronously);
        var stopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var runtime = new MotionRuntime(config, store, receiver,
            sendOutputsAsync: value => { frame.TrySetResult(value); return Task.CompletedTask; },
            emergencyStopAsync: () => { stopped.TrySetResult(); return Task.CompletedTask; });
        runtime.SetInputMode(RuntimeInputMode.Osc); runtime.SetInputActive(true);
        Assert.InRange((await frame.Task.WaitAsync(TimeSpan.FromSeconds(3))).L0, .499f, .501f);
        store.Set("Sensa/Pose/v1/Main/Others/Tip/A0", OscValue.FromFloat(0));
        await stopped.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(runtime.PoseBlocked); Assert.False(runtime.CanSend);
    }

    [Fact]
    public async Task MultiplePoseSourcesRequireExplicitSelection()
    {
        var config = new AppConfig { Signals = [new() { OscPath = "Sensa/Pose/v1/*/*/**", SourceMode = "SensaPose" }] };
        config.NormalizeForRuntime(); var store = new OscParameterStore();
        foreach (var source in new[] { "a", "b" })
            PutPose(store, new(0, 0, -.1), new(0, 0, .1), new(.03, 0, -.1), source: new(source, source, null, "127.0.0.1", 5));
        using var receiver = new OscInputReceiver(store);
        var stopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var runtime = new MotionRuntime(config, store, receiver,
            emergencyStopAsync: () => { stopped.TrySetResult(); return Task.CompletedTask; });
        runtime.SetInputMode(RuntimeInputMode.Osc); runtime.SetInputActive(true);
        await stopped.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(runtime.PoseBlocked);
        Assert.Single(PoseReconstruction.Observe(store.SnapshotEntries(), "a"));
    }
}
