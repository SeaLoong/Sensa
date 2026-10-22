using Sensa.Signals;
using Sensa.Tests.Support;
using UnityBox.Sensa;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class ContactMotionContracts
{
    private const string Prefix = "Sensa/Contact/Root";
    private const string PositionPath = Prefix + "/Proximity_SenderLocalPositionZ";

    private static SignalMapping Mapping(PointMetric metric = PointMetric.Z, float min = 0, float max = 1,
        SignalRole role = SignalRole.Depth, string path = PositionPath) => new()
    {
        SourceMode = "SensaPoint", OscPath = path, PointMetric = metric,
        VrchatMin = min, VrchatMax = max, Role = role,
    };

    private static void Contact(MotionRig rig, string prefix = Prefix, string source = "test", float z = .5f,
        float velocityZ = -.4f, float sample = 1 / 32f)
    {
        var values = new Dictionary<string, float>
        {
            [SensaContactProtocol.ProximityLeaf] = .75f,
            [SensaContactProtocol.SenderTypeLeaf] = 1,
            [SensaContactProtocol.PositionLeaves[0]] = 0,
            [SensaContactProtocol.PositionLeaves[1]] = 0,
            [SensaContactProtocol.PositionLeaves[2]] = z,
            [SensaContactProtocol.VelocityLeaves[0]] = 0,
            [SensaContactProtocol.VelocityLeaves[1]] = 0,
            [SensaContactProtocol.VelocityLeaves[2]] = velocityZ,
            [SensaContactProtocol.SpeedLeaf] = Math.Abs(velocityZ),
            [SensaContactProtocol.ProximitySpeedLeaf] = -.2f,
            [SensaContactProtocol.RadiusLeaf] = 2,
            [SensaContactProtocol.SampleLeaf] = sample,
        };
        foreach (var field in values) rig.Put(prefix + "/" + field.Key, field.Value, source);
    }

    [Fact]
    public async Task Contact_metrics_use_existing_calibration_and_require_experimental_permission()
    {
        using var rig = new MotionRig(Mapping(PointMetric.Z),
            Mapping(PointMetric.VelocityZ, -1, 1, SignalRole.Surge),
            Mapping(PointMetric.Speed, 0, 2, SignalRole.V0),
            Mapping(PointMetric.ProximitySpeed, -1, 1, SignalRole.V1));
        Contact(rig);
        rig.Activate();
        await rig.Output.NextStop();
        Assert.Empty(rig.Output.Frames);
        Assert.True(rig.Runtime.PoseBlocked);

        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        rig.Runtime.RebuildProcessors();
        var frame = await rig.Output.NextFrame();
        Assert.InRange(frame.L0, .499f, .501f);
        Assert.InRange(frame.L1, .299f, .301f);
        Assert.InRange(frame.V0, .199f, .201f);
        Assert.InRange(frame.V1, .399f, .401f);
    }

    [Theory]
    [InlineData("Proximity_SenderType", 0)]
    [InlineData("Proximity_SenderType", 2)]
    [InlineData("Proximity", 0)]
    [InlineData("Sample", 0)]
    [InlineData("Radius", 0)]
    public async Task Control_updates_stop_coordinate_specific_mappings(string leaf, float value)
    {
        using var rig = new MotionRig(Mapping());
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        Contact(rig);
        rig.Activate();
        await rig.Output.NextFrame();
        for (var index = 0; index < rig.Output.StopCount; index++) await rig.Output.NextStop();
        var stopped = rig.Output.NextStop();
        rig.Put(Prefix + "/" + leaf, value);
        rig.Advance(31);
        await stopped;
        Assert.False(rig.Runtime.CanSend);
        Assert.True(rig.Runtime.PoseBlocked);
    }

    [Fact]
    public async Task Stationary_cached_coordinates_survive_changing_sample_but_velocity_cannot_extend_frozen_sample()
    {
        using var rig = new MotionRig(Mapping());
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        rig.Config.Osc.InputTimeoutMs = 100;
        Contact(rig);
        rig.Activate();
        await rig.Output.NextFrame();
        rig.Advance(80);
        rig.Put(Prefix + "/Sample", 2 / 32f);
        rig.Advance(31);
        Assert.True(rig.Runtime.CanSend);
        Assert.False(rig.Runtime.IsEmergency);
        rig.Put(Prefix + "/Proximity_SenderVelocityZ", .8f);
        rig.Put(Prefix + "/Sample", 2 / 32f);
        rig.Advance(31);
        rig.Advance(1000);
        await rig.Output.NextStop();
        Assert.True(rig.Runtime.IsEmergency);
        Assert.False(rig.Runtime.InputActive);
    }

    [Fact]
    public async Task Missing_contact_fields_have_no_scalar_fallback_and_cannot_rearm_expired_geometry()
    {
        using var rig = new MotionRig(Mapping(), new SignalMapping { OscPath = "legacy" });
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        rig.Config.Osc.InputTimeoutMs = 100;
        Contact(rig);
        rig.Advance(101);
        rig.Put(PositionPath, .9f);
        rig.Put("legacy", 1);
        rig.Activate();
        await rig.Output.NextStop();
        Assert.True(rig.Runtime.PoseBlocked);
        Assert.Empty(rig.Output.Frames);
    }

    [Fact]
    public async Task Contact_targets_and_sources_remain_ambiguous_until_exactly_one_target_is_selected()
    {
        using var rig = new MotionRig(Mapping(path: "Sensa/Contact/*/Proximity_SenderLocalPositionZ"));
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        Contact(rig, source: "a");
        Contact(rig, source: "b");
        rig.Activate();
        await rig.Output.NextStop();
        Assert.Empty(rig.Output.Frames);
        rig.SelectedSource = "a";
        rig.Runtime.RebuildProcessors();
        await rig.Output.NextFrame();
        for (var index = 1; index < rig.Output.StopCount; index++) await rig.Output.NextStop();
        Contact(rig, prefix: "Sensa/Contact/Other", source: "a");
        rig.Advance(31);
        await rig.Output.NextStop();
        Assert.False(rig.Runtime.CanSend);
        Assert.True(rig.Runtime.PoseBlocked);
    }

    [Fact]
    public async Task A_proximity_reconstructed_point_cannot_supply_fake_velocity()
    {
        const string prefix = "Sensa/Point/v1/Bone/Self";
        using var rig = new MotionRig(Mapping(PointMetric.VelocityZ, -1, 1, path: prefix + "/Root/**"));
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        SpatialSamples.Point(rig.Store, prefix, new(.02, 0, .1));
        rig.Activate();
        await rig.Output.NextStop();
        Assert.True(rig.Runtime.PoseBlocked);
        Assert.Empty(rig.Output.Frames);
        rig.Advance(1600);
        Assert.True(rig.Runtime.IsEmergency);
    }
}
