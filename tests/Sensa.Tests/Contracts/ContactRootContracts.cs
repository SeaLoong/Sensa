using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Signals;
using Sensa.Tests.Support;
using UnityBox.Sensa;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Native Contact reports retain metre units and require their own complete, active Self target.</summary>
public sealed class ContactRootContracts
{
    private const string Prefix = "Sensa/Contact/Root";

    private static Dictionary<string, float> Fields() => new(StringComparer.Ordinal)
    {
        [SensaContactProtocol.ProximityLeaf] = .5f,
        [SensaContactProtocol.SenderTypeLeaf] = 1,
        [SensaContactProtocol.PositionLeaves[0]] = -.6f,
        [SensaContactProtocol.PositionLeaves[1]] = .8f,
        [SensaContactProtocol.PositionLeaves[2]] = -.2f,
        [SensaContactProtocol.VelocityLeaves[0]] = -.3f,
        [SensaContactProtocol.VelocityLeaves[1]] = .4f,
        [SensaContactProtocol.VelocityLeaves[2]] = 0,
        [SensaContactProtocol.SpeedLeaf] = .5f,
        [SensaContactProtocol.ProximitySpeedLeaf] = -2,
        [SensaContactProtocol.SampleLeaf] = 1 / 32f,
        [SensaContactProtocol.RadiusLeaf] = 2,
    };

    private static void Packet(MotionRig rig, Dictionary<string, float>? fields = null, string prefix = Prefix, string source = "test")
    {
        foreach (var (leaf, value) in fields ?? Fields()) rig.Put(prefix + "/" + leaf, value, source);
    }

    private static SpsPositionTracking.Observation Observe(MotionRig rig, int maxAgeMs = 0) =>
        Assert.Single(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), maxAgeMs: maxAgeMs, timeProvider: rig.Clock));

    [Fact]
    public void Complete_native_reports_keep_signed_metres_velocity_and_one_exact_target()
    {
        using var rig = new MotionRig();
        Packet(rig);
        var point = Observe(rig);
        Assert.True(point.Valid, point.Reason);
        Assert.Equal(12, rig.Store.SnapshotEntries().Length);
        Assert.Equal("ContactRoot", point.Kind);
        Assert.Equal("test|" + Prefix, point.Key);
        Assert.Equal("Root", point.Instance);
        Assert.Equal("Self", point.Party);
        Assert.Equal("AvatarRootMeters", point.CoordinateFrame);
        Assert.Equal("m", point.CoordinateUnit);
        Assert.Equal(new PosePoint(), point.DisplayCenter);
        Assert.Equal(2, point.DisplayHalfRange);
        Assert.Equal(3, point.SampleCount);
        Assert.Equal(3, point.ExpectedSampleCount);
        Assert.Equal(0, point.Residual);
        Assert.True(point.Experimental);
        Assert.True(point.IsMappablePoint);
        Assert.True(point.SupportsVelocity);
        Assert.InRange(point.Position.X, -.60001, -.59999);
        Assert.InRange(point.Position.Y, .79999, .80001);
        Assert.InRange(point.Metric(PointMetric.Distance), 1.0197f, 1.02f);
        Assert.InRange(point.Metric(PointMetric.VelocityX), -.30001f, -.29999f);
        Assert.InRange(point.Metric(PointMetric.VelocityY), .39999f, .40001f);
        Assert.Equal(0, point.Metric(PointMetric.VelocityZ));
        Assert.Equal(.5f, point.Metric(PointMetric.Speed));
        Assert.Equal(-2, point.Metric(PointMetric.ProximitySpeed));
        Assert.Equal(new[] { PointMetric.X, PointMetric.Y, PointMetric.Z, PointMetric.Distance,
            PointMetric.VelocityX, PointMetric.VelocityY, PointMetric.VelocityZ, PointMetric.Speed, PointMetric.ProximitySpeed }, point.SupportedMetrics);
        foreach (var metric in new[] { PointMetric.RightX, PointMetric.RightY, PointMetric.RightZ,
            PointMetric.ForwardX, PointMetric.ForwardY, PointMetric.ForwardZ, PointMetric.AvatarScale })
        {
            Assert.False(point.SupportsMetric(metric));
            Assert.Throws<ArgumentOutOfRangeException>(() => point.Metric(metric));
        }
        Assert.All(point.SupportedMetrics, metric => Assert.True(point.SupportsMetric(metric)));
        Assert.False(point.SupportsMetric((PointMetric)999));
        Assert.Throws<ArgumentOutOfRangeException>(() => point.Metric((PointMetric)999));
        Assert.Equal(8, point.MeasurementPaths.Length);
        Assert.All(point.MeasurementPaths, path => Assert.True(point.Matches(path)));
        Assert.True(point.Matches(Prefix + "/**"));
        Assert.False(point.Matches("Sensa/Contact/Other/**"));
        foreach (var leaf in new[] { SensaContactProtocol.SampleLeaf, SensaContactProtocol.RadiusLeaf,
                     SensaContactProtocol.SenderTypeLeaf, SensaContactProtocol.ProximityLeaf })
            Assert.False(point.Matches(Prefix + "/" + leaf));
    }

    [Theory]
    [InlineData(.5f, -.4f)]
    [InlineData(2, -1.6f)]
    [InlineData(3, -2.4f)]
    public void Actual_receiver_radius_changes_coverage_without_normalizing_metre_coordinates(float radius, float x)
    {
        using var rig = new MotionRig();
        var fields = Fields();
        fields[SensaContactProtocol.RadiusLeaf] = radius;
        fields[SensaContactProtocol.PositionLeaves[0]] = x;
        fields[SensaContactProtocol.PositionLeaves[1]] = 0;
        fields[SensaContactProtocol.PositionLeaves[2]] = 0;
        Packet(rig, fields);
        var point = Observe(rig);
        Assert.True(point.Valid, point.Reason);
        Assert.Equal(radius, point.DisplayHalfRange);
        Assert.Equal(x, point.Metric(PointMetric.X));
        Assert.Equal(-x, point.Metric(PointMetric.Distance));
    }

    [Fact]
    public void Sender_at_origin_and_zero_velocity_are_valid_contact_values()
    {
        using var rig = new MotionRig();
        var fields = Fields();
        foreach (var leaf in SensaContactProtocol.PositionLeaves.Concat(SensaContactProtocol.VelocityLeaves)
                     .Concat([SensaContactProtocol.SpeedLeaf, SensaContactProtocol.ProximitySpeedLeaf])) fields[leaf] = 0;
        Packet(rig, fields);
        var point = Observe(rig);
        Assert.True(point.Valid, point.Reason);
        Assert.Equal(new PosePoint(), point.Position);
        Assert.Equal(new PosePoint(), point.Velocity!.Value);
        Assert.Equal(0, point.Speed!.Value);
        Assert.Equal(0, point.ProximitySpeed!.Value);
        Assert.Equal(0, point.Metric(PointMetric.Distance));
    }

    [Fact]
    public void Native_integer_self_type_and_maximum_active_sample_are_accepted()
    {
        using var rig = new MotionRig();
        var fields = Fields();
        fields[SensaContactProtocol.SampleLeaf] = 1;
        fields[SensaContactProtocol.ProximityLeaf] = 1;
        Packet(rig, fields);
        rig.Store.Set(Prefix + "/" + SensaContactProtocol.SenderTypeLeaf, OscValue.FromInt(1),
            new("test", "test", null, "127.0.0.1", 19000));
        Assert.True(Observe(rig).Valid);
    }

    [Fact]
    public void Every_native_field_activity_and_radius_are_required_from_the_same_target()
    {
        using var rig = new MotionRig();
        Packet(rig);
        var snapshot = rig.Store.SnapshotEntries();
        foreach (var missing in SensaContactProtocol.PublicLeaves)
        {
            var incomplete = snapshot.Where(entry => entry.Path != Prefix + "/" + missing).ToArray();
            var point = Assert.Single(SpsPositionTracking.Observe(incomplete, timeProvider: rig.Clock));
            Assert.False(point.Valid, "Missing " + missing);
            Assert.False(point.SupportsVelocity);
            Assert.Null(point.Velocity);
            Assert.Null(point.Speed);
            Assert.Null(point.ProximitySpeed);
        }
    }

    [Fact]
    public void Different_sources_and_instances_cannot_complete_each_others_contact_reports()
    {
        using var rig = new MotionRig();
        var fields = Fields();
        foreach (var (leaf, value) in fields)
            rig.Put(Prefix + "/" + leaf, value, leaf == SensaContactProtocol.PositionLeaves[0] ? "other" : "test");
        var points = SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock);
        Assert.Equal(2, points.Length);
        Assert.All(points, point => Assert.False(point.Valid));
        Assert.False(Assert.Single(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), "test", timeProvider: rig.Clock)).Valid);
        Assert.Empty(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), "missing", timeProvider: rig.Clock));

        rig.Store.Clear();
        foreach (var (leaf, value) in fields)
            rig.Put((leaf == SensaContactProtocol.PositionLeaves[0] ? "Sensa/Contact/Other" : Prefix) + "/" + leaf, value);
        points = SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock);
        Assert.Equal(2, points.Length);
        Assert.All(points, point => Assert.False(point.Valid));
    }

    [Fact]
    public void Unrelated_expression_traffic_does_not_invalidate_or_complete_native_reports()
    {
        using var rig = new MotionRig();
        foreach (var (leaf, value) in Fields())
        {
            rig.Put(Prefix + "/" + leaf, value);
            rig.Put("FT/Expression", 1, "face");
            rig.Put("Other/Noise", 1);
        }
        Assert.True(Observe(rig).Valid);
    }

    [Theory]
    [InlineData("Sensa/Contact/v1/Root")]
    [InlineData("Sensa/Contact/")]
    [InlineData("Sensa/Contact/ ")]
    [InlineData("Sensa/ContactLike/Root")]
    [InlineData("Sensa/Diagnostics/Contact/Root")]
    public void Malformed_and_diagnostic_namespaces_do_not_create_motion_observations(string prefix)
    {
        using var rig = new MotionRig();
        Packet(rig, prefix: prefix);
        Assert.Empty(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock));
    }

    [Theory]
    [InlineData("Proximity_SenderType", 0)]
    [InlineData("Proximity_SenderType", 1.5f)]
    [InlineData("Proximity_SenderType", 2)]
    [InlineData("Proximity_SenderType", 3)]
    [InlineData("Proximity_SenderType", 4)]
    [InlineData("Proximity", 0)]
    [InlineData("Proximity", -.1f)]
    [InlineData("Proximity", 1.001f)]
    [InlineData("Radius", 0)]
    [InlineData("Radius", -1)]
    [InlineData("Radius", 3.001f)]
    [InlineData("Sample", 0)]
    [InlineData("Sample", -.03125f)]
    [InlineData("Sample", .04f)]
    [InlineData("Sample", 1.03125f)]
    [InlineData("Proximity_SenderVelocityMagnitude", -.01f)]
    public void Invalid_presence_radius_activity_or_speed_cannot_map(string leaf, float value)
    {
        using var rig = new MotionRig();
        var fields = Fields();
        fields[leaf] = value;
        Packet(rig, fields);
        var point = Observe(rig);
        Assert.False(point.Valid);
        Assert.Null(point.Velocity);
        Assert.Equal(new PosePoint(), point.Position);
    }

    [Theory]
    [InlineData(-2.002f, 0, 0, true)]
    [InlineData(2.002f, 0, 0, true)]
    [InlineData(2.004f, 0, 0, false)]
    [InlineData(-2.004f, 0, 0, false)]
    [InlineData(1.5f, 1.5f, 0, false)]
    [InlineData(0, 0, 2.004f, false)]
    public void Native_coordinates_use_spherical_radius_with_small_boundary_tolerance(float x, float y, float z, bool valid)
    {
        using var rig = new MotionRig();
        var fields = Fields();
        fields[SensaContactProtocol.PositionLeaves[0]] = x;
        fields[SensaContactProtocol.PositionLeaves[1]] = y;
        fields[SensaContactProtocol.PositionLeaves[2]] = z;
        Packet(rig, fields);
        Assert.Equal(valid, Observe(rig).Valid);
    }

    [Fact]
    public void Nonfinite_snapshots_are_rejected_for_every_required_field()
    {
        using var rig = new MotionRig();
        Packet(rig);
        var snapshot = rig.Store.SnapshotEntries();
        foreach (var leaf in SensaContactProtocol.PublicLeaves)
            foreach (var value in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity })
            {
                var corrupted = snapshot.Select(entry => entry.Path == Prefix + "/" + leaf
                    ? entry with { Entry = entry.Entry with { Value = OscValue.FromFloat(value) } } : entry);
                Assert.False(Assert.Single(SpsPositionTracking.Observe(corrupted, timeProvider: rig.Clock)).Valid);
            }
    }

    [Fact]
    public void Stationary_native_values_remain_valid_while_sample_content_changes()
    {
        using var rig = new MotionRig();
        Packet(rig);
        var initialPosition = Observe(rig).Position;
        rig.Advance(SensaContactProtocol.MaximumSampleAgeMs + 1);
        Assert.False(Observe(rig).Valid);
        rig.Put(Prefix + "/Sample", 2 / 32f);
        var point = Observe(rig);
        Assert.True(point.Valid, point.Reason);
        Assert.Equal(initialPosition, point.Position);
        Assert.Equal(rig.Clock.GetUtcNow().ToUnixTimeMilliseconds(), point.TimestampMs);
    }

    [Fact]
    public void Frozen_sample_receipts_and_fresh_velocity_never_renew_sampling_activity()
    {
        using var rig = new MotionRig();
        Packet(rig);
        var firstTimestamp = Observe(rig).TimestampMs;
        rig.Advance(SensaContactProtocol.MaximumSampleAgeMs + 1);
        rig.Put(Prefix + "/Sample", 1 / 32f);
        foreach (var leaf in SensaContactProtocol.VelocityLeaves) rig.Put(Prefix + "/" + leaf, .7f);
        rig.Put(Prefix + "/Proximity_SenderVelocityMagnitude", 1.2f);
        var point = Observe(rig);
        Assert.False(point.Valid);
        Assert.Equal(firstTimestamp, point.TimestampMs);
        rig.Put(Prefix + "/Sample", 2 / 32f);
        Assert.True(Observe(rig).Valid);
        rig.Put(Prefix + "/Proximity_SenderType", 0);
        Assert.False(Observe(rig).Valid);
    }

    [Fact]
    public void Contact_sampling_honors_shorter_configured_timeout_and_its_own_maximum()
    {
        using var rig = new MotionRig();
        Packet(rig);
        rig.Advance(101);
        Assert.False(Observe(rig, 100).Valid);
        Assert.True(Observe(rig).Valid);
        rig.Advance(SensaContactProtocol.MaximumSampleAgeMs);
        Assert.False(Observe(rig, 10000).Valid);
    }

    [Fact]
    public void Future_activity_timestamp_cannot_be_used_as_a_fresh_sample()
    {
        using var rig = new MotionRig();
        Packet(rig);
        var future = rig.Store.SnapshotEntries().Select(entry => entry.Path == Prefix + "/Sample"
            ? entry with { Entry = entry.Entry with { ChangedAtMs = rig.Clock.GetUtcNow().ToUnixTimeMilliseconds() + 1 } } : entry);
        Assert.False(Assert.Single(SpsPositionTracking.Observe(future, timeProvider: rig.Clock)).Valid);
    }

    [Fact]
    public void Existing_four_anchor_points_cannot_supply_velocity_metrics()
    {
        using var rig = new MotionRig();
        SpatialSamples.Point(rig.Store, "Sensa/Point/v1/Bone/Self", new(.1, .1, .1));
        var point = Observe(rig);
        Assert.True(point.Valid, point.Reason);
        Assert.False(point.SupportsVelocity);
        Assert.Null(point.Velocity);
        Assert.Equal(new[] { PointMetric.X, PointMetric.Y, PointMetric.Z, PointMetric.Distance }, point.SupportedMetrics);
        foreach (var metric in new[] { PointMetric.VelocityX, PointMetric.VelocityY, PointMetric.VelocityZ,
                     PointMetric.Speed, PointMetric.ProximitySpeed, (PointMetric)999 })
        {
            Assert.False(point.SupportsMetric(metric));
            Assert.Throws<ArgumentOutOfRangeException>(() => point.Metric(metric));
        }
    }

    [Fact]
    public void Contact_velocity_metrics_roundtrip_config_without_adding_a_parallel_source_mode()
    {
        foreach (var metric in Enum.GetValues<PointMetric>())
        {
            var config = new AppConfig { Signals = [new() { SourceMode = "SensaPoint", PointMetric = metric,
                OscPath = Prefix + "/**", Role = SignalRole.Depth }] };
            config.NormalizeForRuntime();
            var copy = new AppConfig();
            copy.CopyFrom(config);
            Assert.Equal("SensaPoint", Assert.Single(copy.Signals).SourceMode);
            Assert.Equal(metric, copy.Signals[0].PointMetric);
            Assert.Equal(Prefix + "/**", copy.Signals[0].OscPath);
        }
        var invalid = new AppConfig { Signals = [new() { SourceMode = "SensaPoint", PointMetric = (PointMetric)999,
            OscPath = Prefix + "/**" }] };
        invalid.NormalizeForRuntime();
        Assert.Equal(PointMetric.Z, Assert.Single(invalid.Signals).PointMetric);
    }

    [Fact]
    public void Catalog_distinguishes_dedicated_contact_telemetry_from_external_ogb_depth()
    {
        foreach (var leaf in SensaContactProtocol.PublicLeaves)
        {
            var hint = OscParameterClassifier.Classify("/avatar/parameters/" + Prefix + "/" + leaf);
            Assert.False(hint.IsFaceTracking);
            Assert.Equal(100, hint.Relevance);
            Assert.Contains("SDK Contact", hint.Hint);
        }
        foreach (var suffix in new[] { "_SenderType", "_SenderLocalPositionX", "_SenderVelocityZ",
                     "_SenderVelocityMagnitude", "_ProximitySpeed", "_CollisionTag_Sensa" })
        {
            var path = "OGB/Orf/Socket/PenOthersNewRoot" + suffix;
            var hint = OscParameterClassifier.Classify(path);
            Assert.False(hint.IsFaceTracking);
            Assert.Contains("advanced report", hint.Hint);
            Assert.False(OgbDepthAddress.TryParse(path, out _));
        }
        Assert.True(OgbDepthAddress.TryParse("OGB/Orf/Socket/PenOthersNewRoot", out _));
    }
}
