using Sensa.Input.Osc;
using Sensa.Signals;
using Sensa.Tests.Support;
using UnityBox.Sensa;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Unversioned five-parameter SPS decoding and runtime disarming.
/// 无版本五参数 SPS 解码与运行时停止。</summary>
public sealed class FixedAnchorContracts
{
    private const string Prefix = "Sensa/SPS/Socket";

    [Theory]
    [InlineData(0, 1, 0)]
    [InlineData(.5, 1.8, -.3)]
    [InlineData(-.9, .4, .6)]
    public void Four_known_P_points_recover_avatar_root_coordinates(double x, double y, double z)
    {
        using var rig = new MotionRig();
        var expected = new PosePoint(x, y, z);
        SpatialSamples.FixedRoot(rig.Store, Prefix, expected);
        var point = Observe(rig);
        Assert.True(point.Valid, point.Reason);
        Assert.InRange((point.Position - expected).Length, 0, .00001);
        Assert.Equal(4, point.ExpectedSampleCount);
        Assert.True(point.IsMappablePoint);
        Assert.Equal("Self", point.Party);
        Assert.Equal("AvatarRootLocal", point.CoordinateFrame);
        Assert.Equal(5, rig.Store.SnapshotEntries().Count());
        Assert.True(point.Matches(Prefix + "/P0"));
        Assert.False(point.Matches(Prefix + "/Sample"));
        Assert.False(point.Matches(Prefix + "/Root/A0"));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(1.1f)]
    [InlineData(.1f)]
    public void Off_or_invalid_sample_counter_never_reuses_a_valid_point(float value)
    {
        using var rig = new MotionRig();
        SpatialSamples.FixedRoot(rig.Store, Prefix, new(0, 1, .1));
        rig.Put(Prefix + "/Sample", value);
        Assert.False(Observe(rig).Valid);
    }

    [Theory]
    [InlineData(float.NaN)]
    [InlineData(float.PositiveInfinity)]
    public void Nonfinite_counter_packets_are_dropped_without_renewing_liveness(float value)
    {
        using var rig = new MotionRig();
        SpatialSamples.FixedRoot(rig.Store, Prefix, new(0, 1, .1));
        var before = rig.Store.SnapshotEntries().Single(entry => entry.Path.EndsWith("/Sample")).Entry.ChangedAtMs;
        Assert.False(SensaFixedAnchorProtocol.IsSampleActive(value));
        var malformed = rig.Store.SnapshotEntries().Select(entry => entry.Path.EndsWith("/Sample")
            ? entry with { Entry = entry.Entry with { Value = OscValue.FromFloat(value) } } : entry);
        Assert.False(Assert.Single(SpsPositionTracking.Observe(malformed, timeProvider: rig.Clock)).Valid);
        rig.Advance(SensaFixedAnchorProtocol.MaximumSampleAgeMs + 1);
        rig.Put(Prefix + "/Sample", value);
        Assert.Equal(before, rig.Store.SnapshotEntries().Single(entry => entry.Path.EndsWith("/Sample")).Entry.ChangedAtMs);
        Assert.False(Observe(rig).Valid);
    }

    [Fact]
    public void Every_positive_counter_step_is_active_but_zero_is_reserved_for_off()
    {
        Assert.False(SensaFixedAnchorProtocol.IsSampleActive(0));
        for (var step = 1; step <= 32; step++)
            Assert.True(SensaFixedAnchorProtocol.IsSampleActive(step / 32f));
    }

    [Fact]
    public void Delta_only_stationary_ranges_need_a_changing_sample_counter()
    {
        using var rig = new MotionRig();
        SpatialSamples.FixedRoot(rig.Store, Prefix, new(.2, 1, .1));
        rig.Advance(5000);
        Assert.False(Observe(rig).Valid);
        rig.Put(Prefix + "/Sample", 2 / 32f);
        Assert.True(Observe(rig).Valid);
        rig.Advance(SensaFixedAnchorProtocol.MaximumSampleAgeMs + 1);
        rig.Put(Prefix + "/Sample", 2 / 32f);
        Assert.False(Observe(rig).Valid);
        rig.Put(Prefix + "/Sample", 3 / 32f);
        Assert.True(Observe(rig).Valid);
    }

    [Fact]
    public void Sources_instances_extra_P_points_and_incomplete_samples_never_mix()
    {
        using var rig = new MotionRig();
        SpatialSamples.FixedRoot(rig.Store, Prefix, new(.2, 1, .1));
        var split = rig.Store.SnapshotEntries().Select(entry => entry.Path.EndsWith("/Sample", StringComparison.Ordinal)
            ? entry with { Entry = entry.Entry with { Source = new("other", "other", null, "127.0.0.1", 19001) } } : entry);
        Assert.All(SpsPositionTracking.Observe(split, timeProvider: rig.Clock), point => Assert.False(point.Valid));
        var splitInstance = rig.Store.SnapshotEntries().Select(entry => entry.Path.EndsWith("/Sample", StringComparison.Ordinal)
            ? entry with { Path = entry.Path.Replace("/Socket/", "/Plug/") } : entry);
        Assert.All(SpsPositionTracking.Observe(splitInstance, timeProvider: rig.Clock), point => Assert.False(point.Valid));
        Assert.False(Assert.Single(SpsPositionTracking.Observe(rig.Store.SnapshotEntries().Where(entry => !entry.Path.EndsWith("/P3")),
            timeProvider: rig.Clock)).Valid);
        rig.Put(Prefix + "/P4", .5f);
        Assert.False(Observe(rig).Valid);
        Assert.False(FixedAnchorReconstruction.Fit([.5f, .5f, .5f]).Valid);
        Assert.False(FixedAnchorReconstruction.Fit([1, .5f, .5f, .5f]).Valid);
        Assert.False(FixedAnchorReconstruction.Fit([float.NaN, .5f, .5f, .5f]).Valid);
    }

    [Theory]
    [InlineData("Sensa/SpsRoot/v1/Socket/Self")]
    [InlineData("Sensa/SharedRoot/v1/Socket/Others")]
    [InlineData("Sensa/SPS/v1/Socket")]
    [InlineData("Sensa/SPS/Socket/Others")]
    public void Removed_layouts_and_party_paths_have_no_compatibility_decoder(string prefix)
    {
        using var rig = new MotionRig();
        SpatialSamples.FixedRoot(rig.Store, prefix, new(.2, 1, .1));
        Assert.Empty(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock));
    }

    [Fact]
    public async Task Explicit_permission_is_required_and_sample_zero_stops_motion()
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
        for (var index = 0; index < rig.Output.StopCount; index++) await rig.Output.NextStop();
        var invalidityStop = rig.Output.NextStop();
        rig.Put(Prefix + "/Sample", 0);
        rig.Advance(31);
        await invalidityStop;
        Assert.False(rig.Runtime.CanSend);
    }

    [Fact]
    public void Two_targets_require_an_exact_selection()
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = "Sensa/SPS/*/**", SourceMode = "SensaPoint" });
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        SpatialSamples.FixedRoot(rig.Store, Prefix, new(.2, 1, .1));
        SpatialSamples.FixedRoot(rig.Store, "Sensa/SPS/Plug", new(-.2, 1, .1));
        rig.Activate();
        Assert.False(rig.Runtime.CanSend);
        Assert.Empty(rig.Output.Frames);
    }

    private static SpsPositionTracking.Observation Observe(MotionRig rig) =>
        Assert.Single(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock));
}
