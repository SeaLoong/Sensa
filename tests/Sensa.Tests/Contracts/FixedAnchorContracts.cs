using Sensa.Input.Osc;
using Sensa.Signals;
using Sensa.Tests.Support;
using UnityBox.Sensa;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Fixed Avatar-root coordinates, producer boundaries and runtime disarming.
/// 固定 Avatar 根坐标、生产端边界和运行时停止。</summary>
public sealed class FixedAnchorContracts
{
    private const string Prefix = "Sensa/SpsRoot/v1/Socket/Self";

    [Theory]
    [InlineData(0, 1, 0)]
    [InlineData(.5, 1.8, -.3)]
    [InlineData(-.9, .4, .6)]
    public void Four_fixed_anchors_recover_avatar_local_roots_beyond_the_old_25cm_volume(double x, double y, double z)
    {
        var clock = new ManualTimeProvider();
        var store = new OscParameterStore(clock);
        var expected = new PosePoint(x, y, z);
        SpatialSamples.FixedRoot(store, Prefix, expected);
        var point = Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries(), timeProvider: clock));
        Assert.True(point.Valid, point.Reason);
        Assert.InRange((point.Position - expected).Length, 0, .00001);
        Assert.Equal(4, point.ExpectedSampleCount);
        Assert.True(point.IsMappablePoint);
        Assert.Equal(SensaFixedAnchorProtocol.CoordinateFrame, point.CoordinateFrame);
        Assert.Equal(SensaFixedAnchorProtocol.ProfileId, point.ProfileId);
    }

    [Theory]
    [InlineData("/Profile", 2)]
    [InlineData("/Valid", 0)]
    [InlineData("/Scale", 0)]
    [InlineData("/Heartbeat", 2)]
    public void Invalid_metadata_never_reuses_a_previous_valid_root(string suffix, float value)
    {
        using var rig = new MotionRig();
        SpatialSamples.FixedRoot(rig.Store, Prefix, new(0, 1, .1));
        rig.Put(Prefix + suffix, value);
        Assert.False(Assert.Single(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock)).Valid);
    }

    [Fact]
    public void Static_delta_only_ranges_require_a_live_dedicated_producer()
    {
        using var rig = new MotionRig();
        SpatialSamples.FixedRoot(rig.Store, Prefix, new(.2, 1, .1));
        rig.Advance(5000);
        Assert.False(Assert.Single(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock)).Valid);
        rig.Put(Prefix + "/Heartbeat", 1);
        var point = Assert.Single(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock));
        Assert.True(point.Valid, point.Reason);
        Assert.InRange(point.Position.X, .19999, .20001);
        rig.Advance(SensaFixedAnchorProtocol.MaximumHeartbeatAgeMs + 1);
        rig.Put(Prefix + "/Heartbeat", 1);
        Assert.False(Assert.Single(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock)).Valid);
    }

    [Fact]
    public void Profile_ranges_and_liveness_cannot_be_combined_across_sources_or_with_the_old_eight_range_layout()
    {
        using var rig = new MotionRig();
        SpatialSamples.FixedRoot(rig.Store, Prefix, new(.2, 1, .1));
        var split = rig.Store.SnapshotEntries().Select(entry => entry.Path.EndsWith("/Heartbeat", StringComparison.Ordinal)
            ? entry with { Entry = entry.Entry with { Source = new("other", "other", null, "127.0.0.1", 19001) } } : entry);
        Assert.False(Assert.Single(SpsPositionTracking.Observe(split, timeProvider: rig.Clock)).Valid);
        rig.Put(Prefix + "/Root/A4", .5f);
        Assert.False(Assert.Single(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock)).Valid);
        Assert.False(FixedAnchorReconstruction.Fit([.5f, .5f, .5f]).Valid);
        Assert.False(FixedAnchorReconstruction.Fit([1, .5f, .5f, .5f]).Valid);
        Assert.False(FixedAnchorReconstruction.Fit([float.NaN, .5f, .5f, .5f]).Valid);
    }

    [Fact]
    public async Task Root_coordinates_need_explicit_experimental_permission_and_producer_invalidity_stops_motion()
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = Prefix + "/**", SourceMode = "SensaPoint",
            PointMetric = PointMetric.Z, Role = SignalRole.Depth, VrchatMin = 0, VrchatMax = .2f });
        SpatialSamples.FixedRoot(rig.Store, Prefix, new(.2, 1, .1));
        rig.Activate();
        Assert.False(rig.Runtime.CanSend);
        Assert.Empty(rig.Output.Frames);
        rig.Runtime.SetInputActive(false);
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        rig.Runtime.SetInputActive(true);
        Assert.InRange((await rig.Output.NextFrame()).L0, .499f, .501f);
        var earlierStops = rig.Output.StopCount;
        for (var index = 0; index < earlierStops; index++) await rig.Output.NextStop();
        var invalidityStop = rig.Output.NextStop();
        rig.Put(Prefix + "/Valid", 0);
        rig.Advance(31);
        await invalidityStop;
        Assert.False(rig.Runtime.CanSend);
    }

    [Fact]
    public void Remote_roots_are_diagnostic_and_two_self_targets_require_an_exact_selection()
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = "Sensa/SpsRoot/v1/*/Self/**", SourceMode = "SensaPoint" });
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        SpatialSamples.FixedRoot(rig.Store, Prefix.Replace("/Self", "/Others"), new(.2, 1, .1));
        var remote = Assert.Single(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock));
        Assert.False(remote.IsMappablePoint);
        SpatialSamples.FixedRoot(rig.Store, Prefix, new(.2, 1, .1));
        SpatialSamples.FixedRoot(rig.Store, Prefix.Replace("/Socket/", "/Plug/"), new(-.2, 1, .1));
        rig.Activate();
        Assert.False(rig.Runtime.CanSend);
        Assert.Empty(rig.Output.Frames);
    }
}
