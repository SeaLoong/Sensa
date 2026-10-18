using System.Text.Json;
using Sensa.Input.Osc;
using Sensa.Signals;
using Sensa.Tests.Support;
using UnityBox.Sensa;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Spatial decoding contracts / 空间解码契约。Synthetic ranges and captured fixtures share the public decoder.</summary>
public sealed class SpatialContracts
{
    [Fact]
    public void CapturedUnityWorldCasesAndCapturedPointDecodeAsSpecified()
    {
        using var casesDocument = Fixture("unity-point-cases.json");
        var cases = casesDocument.RootElement.GetProperty("cases").EnumerateArray().ToArray();
        Assert.Equal(11, cases.Length);
        foreach (var item in cases)
        {
            var fit = PoseReconstruction.FitLocalTetrahedron(item.GetProperty("samples").EnumerateArray().Select(value => value.GetSingle()).ToArray());
            Assert.True(fit.Valid == item.GetProperty("expectedValid").GetBoolean(), item.GetProperty("name").GetString() + ": " + fit.Reason);
            if (fit.Valid) Assert.InRange((fit.Position - Point(item.GetProperty("position"))).Length, 0, .0001);
        }
        using var pointDocument = Fixture("unity-point.json");
        var captured = pointDocument.RootElement;
        Assert.Equal("sensa.point-lab.v1", captured.GetProperty("schema").GetString());
        var samples = captured.GetProperty("samples").EnumerateArray().Select(value => value.GetSingle()).ToArray();
        Assert.Equal(4, samples.Length);
        var result = PoseReconstruction.FitLocalTetrahedron(samples);
        Assert.True(result.Valid, result.Reason);
        Assert.InRange((result.Position - Point(captured.GetProperty("position"))).Length, 0, .0001);
    }

    [Fact]
    public void TetrahedronRecoversPointsAcrossTheLocalVolumeWithoutInventingExtraSamples()
    {
        var random = new Random(9271);
        for (var trial = 0; trial < 300; trial++)
        {
            var expected = new PosePoint((random.NextDouble() - .5) * .2, (random.NextDouble() - .5) * .2, (random.NextDouble() - .5) * .2);
            var full = SpatialSamples.Marker(expected);
            var samples = Enumerable.Range(0, 4).Select(index => full[SensaPoseProtocol.PointAnchorIndex(index)]).ToArray();
            var fit = PoseReconstruction.FitLocalTetrahedron(samples);
            Assert.True(fit.Valid, fit.Reason);
            Assert.InRange((fit.Position - expected).Length, 0, .000001);
        }
        Assert.False(PoseReconstruction.FitLocalTetrahedron([.5f, .5f, .5f]).Valid);
        Assert.False(PoseReconstruction.FitLocalTetrahedron([1, .5f, .5f, .5f]).Valid);
        Assert.False(PoseReconstruction.FitLocalTetrahedron([float.NaN, .5f, .5f, .5f]).Valid);
    }

    [Theory]
    [InlineData(0, 0, 0, .001)]
    [InlineData(.03, -.025, .12, .001)]
    [InlineData(-.04, .02, -.16, .007)]
    [InlineData(.012, .009, .03, .015)]
    public void EightRangesRecoverOffAxisPositionAndUnknownSenderRadius(double x, double y, double z, double radius)
    {
        var expected = new PosePoint(x, y, z);
        var fit = PoseReconstruction.FitMarker(SpatialSamples.Marker(expected, radius));
        Assert.True(fit.Valid, fit.Reason);
        Assert.InRange((fit.Position - expected).Length, 0, .00003);
        Assert.InRange(Math.Abs(fit.Radius - radius), 0, .00003);
    }

    [Fact]
    public void SyntheticBoundedNoiseHasBoundedErrorAcrossTheTestVolume()
    {
        var random = new Random(712);
        var worstError = 0d;
        for (var trial = 0; trial < 150; trial++)
        {
            var expected = new PosePoint((random.NextDouble() - .5) * .06, (random.NextDouble() - .5) * .06, (random.NextDouble() - .5) * .3);
            var noisy = SpatialSamples.Marker(expected).Select(value => value + (float)((random.NextDouble() - .5) * .0004)).ToArray();
            var fit = PoseReconstruction.FitMarker(noisy);
            Assert.True(fit.Valid, fit.Reason);
            worstError = Math.Max(worstError, (fit.Position - expected).Length);
        }
        Assert.True(worstError < .003, $"Synthetic maximum / 合成最大误差: {worstError:F6} m");
    }

    [Fact]
    public void IncompleteSaturatedAndInconsistentArraysNeverClaimAValidMarker()
    {
        Assert.False(PoseReconstruction.FitMarker(new float[7]).Valid);
        Assert.False(PoseReconstruction.FitMarker(new float[8]).Valid);
        var samples = SpatialSamples.Marker(new(.01, .02, .1));
        samples[3] += .15f;
        Assert.False(PoseReconstruction.FitMarker(samples).Valid);
    }

    [Fact]
    public void PoseRecoversSignedDepthWithoutLateralShortening()
    {
        foreach (var offset in new[] { 0d, .01, .03 })
        {
            var store = new OscParameterStore();
            SpatialSamples.Pose(store, new(offset, 0, -.1), new(offset, 0, .1), new(offset + .03, 0, -.1));
            var pose = Assert.Single(PoseReconstruction.Observe(store.SnapshotEntries()));
            Assert.True(pose.Valid, pose.Reason);
            Assert.True(pose.Engaged);
            Assert.InRange(pose.Depth, .4999, .5001);
            Assert.InRange(Math.Abs(pose.Intersection.X - offset), 0, .00003);
        }
        var front = new PosePoint(.02, .01, -.08);
        var back = new PosePoint(.02, .01, .08);
        Assert.Equal(front.Length, back.Length);
        Assert.InRange(PoseReconstruction.FitMarker(SpatialSamples.Marker(front)).Position.Z, -.08001, -.07999);
        Assert.InRange(PoseReconstruction.FitMarker(SpatialSamples.Marker(back)).Position.Z, .07999, .08001);
    }

    [Fact]
    public void ThreeMarkersRecoverTiltAndRollFromTheSameRig()
    {
        var store = new OscParameterStore();
        var axis = new PosePoint(.5, 0, Math.Sqrt(.75));
        var right = new PosePoint(Math.Sqrt(.75), 0, -.5);
        var rotated = right * Math.Cos(Math.PI / 6) + PosePoint.Cross(axis, right) * Math.Sin(Math.PI / 6);
        var root = axis * -.1;
        SpatialSamples.Pose(store, root, axis * .1, root + rotated * .03);
        var pose = Assert.Single(PoseReconstruction.Observe(store.SnapshotEntries()));
        Assert.True(pose.Valid, pose.Reason);
        Assert.True(pose.Engaged);
        Assert.InRange(pose.Depth, .4999, .5001);
        Assert.InRange(pose.GetMetric(PoseMetric.Yaw), 29.99f, 30.01f);
        Assert.InRange(pose.GetMetric(PoseMetric.Roll), 29.99f, 30.01f);
    }

    [Fact]
    public void OffApertureBackwardsAndParallelPosesCannotEngage()
    {
        var store = new OscParameterStore();
        SpatialSamples.Pose(store, new(.07, 0, -.1), new(.07, 0, .1), new(.10, 0, -.1));
        var offAperture = Assert.Single(PoseReconstruction.Observe(store.SnapshotEntries()));
        Assert.True(offAperture.Valid);
        Assert.False(offAperture.Engaged);
        Assert.Equal(0, offAperture.Depth);
        SpatialSamples.Pose(store, new(0, 0, .1), new(0, 0, -.1), new(.03, 0, .1));
        Assert.False(Assert.Single(PoseReconstruction.Observe(store.SnapshotEntries())).Engaged);
        SpatialSamples.Pose(store, new(-.1, 0, .02), new(.1, 0, .02), new(-.1, .03, .02));
        Assert.False(Assert.Single(PoseReconstruction.Observe(store.SnapshotEntries())).Valid);
    }

    [Fact]
    public void DifferentSourcesAndRigPrefixesNeverCombineIntoOneCoherentPose()
    {
        var store = new OscParameterStore();
        SpatialSamples.Pose(store, new(0, 0, -.1), new(0, 0, .1), new(.03, 0, -.1));
        var splitSources = store.SnapshotEntries().Select((entry, index) => index < 12 ? entry :
            entry with { Entry = entry.Entry with { Source = new("second", "second", null, "127.0.0.1", 19000) } });
        Assert.All(PoseReconstruction.Observe(splitSources), pose => Assert.False(pose.Valid));
        var splitRigs = store.SnapshotEntries().Select((entry, index) => index < 12 ? entry : entry with { Path = entry.Path.Replace("/Main/", "/Other/") });
        Assert.All(PoseReconstruction.Observe(splitRigs), pose => Assert.False(pose.Valid));
        Assert.Single(PoseReconstruction.Observe(store.SnapshotEntries(), "test"));
        Assert.Empty(PoseReconstruction.Observe(store.SnapshotEntries(), "missing-source"));
    }

    [Fact]
    public void StandardRootAndLocalPointStayDistinctAndPointMetricsUseSignedCoordinates()
    {
        var expected = new PosePoint(.02, -.03, .1);
        var store = new OscParameterStore();
        SpatialSamples.Point(store, "Sensa/Point/v1/Bone/Self", expected);
        SpatialSamples.Point(store, "Sensa/SpsRoot/v1/Remote/Others", new(0, 0, -.1));
        var observations = SpsPositionTracking.Observe(store.SnapshotEntries());
        var local = Assert.Single(observations, observation => observation.IsLocalPoint);
        var remote = Assert.Single(observations, observation => !observation.IsLocalPoint);
        Assert.True(local.Valid, local.Reason);
        Assert.True(remote.Valid, remote.Reason);
        Assert.Equal(4, local.ExpectedSampleCount);
        Assert.Equal(8, remote.ExpectedSampleCount);
        Assert.InRange(local.Metric(PointMetric.X), .0199f, .0201f);
        Assert.InRange(local.Metric(PointMetric.Y), -.0301f, -.0299f);
        Assert.InRange(local.Metric(PointMetric.Distance), (float)expected.Length - .0001f, (float)expected.Length + .0001f);
        Assert.Empty(PoseReconstruction.Observe(store.SnapshotEntries()));
        Assert.Empty(SpsPositionTracking.Observe(store.SnapshotEntries(), "missing-source"));
    }

    [Fact]
    public void LocalPointRejectsExtraReceiversAndRemoteRootRejectsMissingOrClippedSamples()
    {
        const string prefix = "Sensa/Point/v1/Bone/Self";
        var store = new OscParameterStore();
        SpatialSamples.Point(store, prefix, new(.02, -.03, .1));
        var point = Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries()));
        Assert.True(point.Valid);
        Assert.False(point.Matches(prefix + "/Root/A7"));
        store.Set(prefix + "/Root/A7", OscValue.FromFloat(.5f), new("test", "test", null, "127.0.0.1", 19000));
        Assert.False(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries())).Valid);
        var remote = new OscParameterStore();
        SpatialSamples.Point(remote, "Sensa/SpsRoot/v1/Remote/Others", new(.02, 0, -.1));
        Assert.False(Assert.Single(SpsPositionTracking.Observe(remote.SnapshotEntries().Take(7))).Valid);
        remote.Set("Sensa/SpsRoot/v1/Remote/Others/Root/A0", OscValue.FromFloat(0), new("test", "test", null, "127.0.0.1", 19000));
        Assert.False(Assert.Single(SpsPositionTracking.Observe(remote.SnapshotEntries())).Valid);
    }

    [Fact]
    public void SharedArrayRequiresFreshSamplesAndReadyAfterEachSlotSelection()
    {
        const string prefix = "Sensa/SharedRoot/v1/Pool/Others";
        var store = new OscParameterStore();
        var source = new OscSource("test", "test", null, "127.0.0.1", 19000);
        SpatialSamples.Point(store, prefix, new(.02, 0, .1));
        store.Set(prefix + "/Slot", OscValue.FromFloat(2), source);
        store.Set(prefix + "/Ready", OscValue.FromFloat(1), source);
        Assert.False(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries())).Valid);
        SpatialSamples.Point(store, prefix, new(.03, 0, .1));
        var selected = Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries()));
        Assert.True(selected.Valid, selected.Reason);
        Assert.Equal(2, selected.Slot);
        Assert.False(selected.IsLocalPoint);
        store.Set(prefix + "/Slot", OscValue.FromFloat(3), source);
        Assert.False(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries())).Valid);
        store.Set(prefix + "/Ready", OscValue.FromFloat(1), source);
        SpatialSamples.Point(store, prefix, new(.01, 0, .1));
        Assert.True(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries())).Valid);
        store.Set(prefix + "/Ready", OscValue.FromFloat(0), source);
        Assert.False(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries())).Valid);
    }

    [Fact]
    public void FreshHandleMetadataCannotReviveExpiredCoordinates()
    {
        const string prefix = "Sensa/Handle/v1/Grip/Self";
        var clock = new ManualTimeProvider();
        var store = new OscParameterStore(clock);
        var source = new OscSource("test", "test", null, "127.0.0.1", 19000);
        SpatialSamples.Point(store, prefix, new(.02, 0, .1));
        Assert.False(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries())).Valid);
        store.Set(prefix + "/Handle_IsGrabbed", OscValue.FromFloat(1), source);
        Assert.True(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries(), maxAgeMs: 100, timeProvider: clock)).Valid);
        clock.Advance(TimeSpan.FromMilliseconds(180));
        store.Set(prefix + "/Handle_IsGrabbed", OscValue.FromFloat(1), source);
        Assert.False(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries(), maxAgeMs: 100, timeProvider: clock)).Valid);
    }

    private static JsonDocument Fixture(string suffix)
    {
        var assembly = typeof(SpatialContracts).Assembly;
        using var stream = assembly.GetManifestResourceStream(assembly.GetManifestResourceNames().Single(name => name.EndsWith(suffix)))!;
        return JsonDocument.Parse(stream);
    }

    private static PosePoint Point(JsonElement position) => new(position.GetProperty("x").GetDouble(), position.GetProperty("y").GetDouble(), position.GetProperty("z").GetDouble());
}
