using Sensa.Input.Osc;
using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Five-field native packets, diagnostic separation and fail-closed motion.
/// 原生五字段包、诊断隔离与失效停止。</summary>
public sealed class ShaderRootContracts
{
    private const string Prefix = "Sensa/Shader/42";
    private static void Packet(MotionRig rig, float valid = 1, float frame = 1,
        float x = .2f, float y = 1.1f, float z = .1f, string source = "test", bool interleave = false, string prefix = Prefix)
    {
        foreach (var entry in new[] { ("Frame", frame), ("X", x), ("Y", y), ("Z", z), ("Valid", valid) })
        {
            rig.Put(prefix + "/" + entry.Item1, entry.Item2, source);
            if (interleave) rig.Put("Other/Noise", .1f, "other");
        }
    }
    private static SpsPositionTracking.Observation Observe(MotionRig rig) =>
        Assert.Single(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock));

    [Fact]
    public void Five_fields_retain_avatar_local_coordinates_and_exact_target_matching()
    {
        using var rig = new MotionRig();
        Packet(rig);
        var point = Observe(rig);
        Assert.True(point.Valid, point.Reason);
        Assert.Equal(5, rig.Store.SnapshotEntries().Count());
        Assert.Equal("ShaderRoot", point.Kind);
        Assert.Equal("AvatarRootLocal", point.CoordinateFrame);
        Assert.True(point.IsMappablePoint);
        Assert.Equal(3, point.ExpectedSampleCount);
        Assert.InRange(point.Position.Y, 1.0999, 1.1001);
        Assert.Equal(1, point.DisplayCenter.Y);
        Assert.True(point.Matches(Prefix + "/**"));
        Assert.True(point.Matches(Prefix + "/Z"));
        Assert.False(point.Matches(Prefix + "/Valid"));
    }

    [Fact]
    public void Unrelated_sources_do_not_interrupt_one_complete_packet()
    {
        using var rig = new MotionRig();
        Packet(rig, interleave: true);
        Assert.True(Observe(rig).Valid);
    }

    [Theory]
    [InlineData("Valid", 0)]
    [InlineData("Frame", 1.5f)]
    [InlineData("Frame", 65536)]
    [InlineData("X", 2.001f)]
    [InlineData("X", -2.001f)]
    [InlineData("Y", 3.001f)]
    [InlineData("Y", -1.001f)]
    [InlineData("Z", 2.001f)]
    [InlineData("Z", float.NaN)]
    public void Invalid_fields_never_enable_mapping(string field, float value)
    {
        using var rig = new MotionRig();
        Packet(rig, valid: field == "Valid" ? value : 1, frame: field == "Frame" ? value : 1,
            x: field == "X" ? value : .2f, y: field == "Y" ? value : 1.1f, z: field == "Z" ? value : .1f);
        Assert.False(Observe(rig).Valid);
    }

    [Theory]
    [InlineData(-2, -1, -2)]
    [InlineData(2, 3, 2)]
    public void Current_two_metre_encoding_boundaries_are_valid(float x, float y, float z)
    {
        using var rig = new MotionRig();
        Packet(rig, x: x, y: y, z: z);
        var point = Observe(rig);
        Assert.True(point.Valid, point.Reason);
        Assert.Equal(new PosePoint(x, y, z), point.Position);
    }

    [Theory]
    [InlineData("Sensa/Shader/0")]
    [InlineData("Sensa/Shader/042")]
    [InlineData("Sensa/Shader/65536")]
    public void Native_paths_require_a_canonical_nonzero_16bit_identity(string prefix)
    {
        using var rig = new MotionRig();
        Packet(rig, prefix: prefix);
        Assert.False(Observe(rig).Valid);
    }

    [Theory]
    [InlineData("Sensa/Shader/v1/42")]
    [InlineData("Sensa/Diagnostics/Shader/0")]
    public void Old_paths_and_diagnostic_packets_do_not_create_motion_observations(string prefix)
    {
        using var rig = new MotionRig();
        Packet(rig, prefix: prefix);
        Assert.Empty(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock));
    }

    [Fact]
    public void Partial_updates_and_repeated_frozen_frames_cannot_refresh_an_old_packet()
    {
        using var rig = new MotionRig();
        Packet(rig);
        rig.Advance(100);
        rig.Put(Prefix + "/Frame", 2);
        Assert.False(Observe(rig).Valid);
        Packet(rig, frame: 3);
        Assert.True(Observe(rig).Valid);
        rig.Put(Prefix + "/X", .3f);
        Assert.False(Observe(rig).Valid);
        Packet(rig, frame: 4);
        rig.Advance(ShaderRootTracking.MaximumFrameAgeMs + 1);
        Packet(rig, frame: 4);
        Assert.False(Observe(rig).Valid);
        Packet(rig, frame: 5);
        Assert.True(Observe(rig).Valid);
    }

    [Fact]
    public void Fields_cannot_be_hydrated_from_different_sources_or_out_of_order()
    {
        using var rig = new MotionRig();
        Packet(rig);
        var entries = rig.Store.SnapshotEntries().Select(entry => entry.Path.EndsWith("/Valid")
            ? entry with { Entry = entry.Entry with { Source = new("other", "other", null, "127.0.0.1", 19001) } } : entry);
        Assert.All(SpsPositionTracking.Observe(entries, timeProvider: rig.Clock), point => Assert.False(point.Valid));
        rig.Put(Prefix + "/Frame", 2);
        rig.Put(Prefix + "/Valid", 1);
        Assert.False(Observe(rig).Valid);
    }

    [Fact]
    public async Task Clearing_valid_immediately_stops_the_isolated_output()
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = Prefix + "/**", SourceMode = "SensaPoint",
            PointMetric = PointMetric.Z, Role = SignalRole.Depth, VrchatMin = 0, VrchatMax = .2f });
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        Packet(rig);
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).L0, .499f, .501f);
        for (var index = 0; index < rig.Output.StopCount; index++) await rig.Output.NextStop();
        var invalidCapture = rig.Output.NextStop();
        rig.Put(Prefix + "/Valid", 0);
        rig.Advance(31);
        await invalidCapture;
        Assert.False(rig.Runtime.CanSend);
    }
}
