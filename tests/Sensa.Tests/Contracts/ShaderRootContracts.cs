using Sensa.Input.Osc;
using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Native capture packet identity, complete-coordinate intake and disarming.
/// 原生捕获包身份、完整坐标接入及停止边界。</summary>
public sealed class ShaderRootContracts
{
    private const string Prefix = "Sensa/Shader/v1/42";
    private static void Packet(MotionRig rig, float valid = 1, float frame = 1,
        float x = .2f, float y = 1.1f, float z = .1f, float producer = 42, float profile = 1, string source = "test", bool interleave = false)
    {
        foreach (var entry in new[] { ("Valid", valid), ("Frame", frame), ("X", x), ("Y", y),
                     ("Z", z), ("Producer", producer), ("Profile", profile) })
        {
            rig.Put(Prefix + "/" + entry.Item1, entry.Item2, source);
            if (interleave) rig.Put("Other/Noise", .1f, "other");
        }
    }
    private static SpsPositionTracking.Observation Observe(MotionRig rig) =>
        Assert.Single(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock));

    [Fact]
    public void Native_packet_retains_avatar_root_coordinates_and_exact_target_matching()
    {
        using var rig = new MotionRig();
        Packet(rig);
        var point = Observe(rig);
        Assert.True(point.Valid, point.Reason);
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
    public void Unrelated_sources_do_not_interrupt_a_complete_native_packet()
    {
        using var rig = new MotionRig();
        Packet(rig, interleave: true);
        Assert.True(Observe(rig).Valid);
    }

    [Theory]
    [InlineData("Valid", 0)]
    [InlineData("Profile", 0)]
    [InlineData("Producer", 41)]
    [InlineData("Frame", 1.5f)]
    [InlineData("X", 2)]
    [InlineData("Y", 3)]
    public void Invalid_native_metadata_or_coordinates_never_enable_mapping(string field, float value)
    {
        using var rig = new MotionRig();
        Packet(rig, valid: field == "Valid" ? value : 1, frame: field == "Frame" ? value : 1,
            x: field == "X" ? value : .2f, y: field == "Y" ? value : 1.1f,
            producer: field == "Producer" ? value : 42, profile: field == "Profile" ? value : 1);
        Assert.False(Observe(rig).Valid);
    }

    [Fact]
    public void New_frame_or_coordinates_alone_cannot_refresh_an_old_packet()
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
    public void Packet_fields_cannot_be_hydrated_from_different_sources_or_out_of_order()
    {
        using var rig = new MotionRig();
        Packet(rig);
        var entries = rig.Store.SnapshotEntries().Select(entry => entry.Path.EndsWith("/Profile")
            ? entry with { Entry = entry.Entry with { Source = new("other", "other", null, "127.0.0.1", 19001) } } : entry);
        Assert.All(SpsPositionTracking.Observe(entries, timeProvider: rig.Clock), point => Assert.False(point.Valid));
        rig.Put(Prefix + "/Frame", 2);
        rig.Put(Prefix + "/Valid", 1);
        Assert.False(Observe(rig).Valid);
    }

    [Fact]
    public async Task Native_protocol_input_is_explicit_and_invalid_capture_stops_the_mock_output()
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = Prefix + "/**", SourceMode = "SensaPoint",
            PointMetric = PointMetric.Z, Role = SignalRole.Depth, VrchatMin = 0, VrchatMax = .2f });
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        Packet(rig);
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).L0, .499f, .501f);
        var previousStops = rig.Output.StopCount;
        for (var index = 0; index < previousStops; index++) await rig.Output.NextStop();
        var invalidCapture = rig.Output.NextStop();
        rig.Put(Prefix + "/Valid", 0);
        rig.Advance(31);
        await invalidCapture;
        Assert.False(rig.Runtime.CanSend);
    }
}
