using System.Text.Json;
using Sensa.Input.Osc;
using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Twelve-field native packets, diagnostic separation and complete-frame validation.
/// 原生十二字段包、诊断隔离与完整帧校验。</summary>
public sealed class ShaderRootContracts
{
    private const string Prefix = "Sensa/Shader/42";
    private static void Packet(MotionRig rig, float valid = 1, float frame = 1,
        float x = .2f, float y = 1.1f, float z = .1f, string source = "test", bool interleave = false, string prefix = Prefix,
        PosePoint? right = null, PosePoint? forward = null, float avatarScale = 1, string? field = null, float value = 0)
    {
        var r = right ?? new(1, 0, 0); var f = forward ?? new(0, 0, 1);
        foreach (var entry in new[] { ("Frame", frame), ("X", x), ("Y", y), ("Z", z),
            ("RightX", (float)r.X), ("RightY", (float)r.Y), ("RightZ", (float)r.Z),
            ("ForwardX", (float)f.X), ("ForwardY", (float)f.Y), ("ForwardZ", (float)f.Z),
            ("AvatarScale", avatarScale), ("Valid", valid) })
        {
            rig.Put(prefix + "/" + entry.Item1, entry.Item1 == field ? value : entry.Item2, source);
            if (interleave) rig.Put("Other/Noise", .1f, "other");
        }
    }
    private static SpsPositionTracking.Observation Observe(MotionRig rig) =>
        Assert.Single(SpsPositionTracking.Observe(rig.Store.SnapshotEntries(), timeProvider: rig.Clock));

    [Fact]
    public void Twelve_fields_retain_avatar_local_coordinates_axes_scale_and_exact_point_matching()
    {
        using var rig = new MotionRig();
        Packet(rig);
        var point = Observe(rig);
        Assert.True(point.Valid, point.Reason);
        Assert.Equal(12, rig.Store.SnapshotEntries().Count());
        Assert.Equal("ShaderRoot", point.Kind);
        Assert.Equal("AvatarRootLocal", point.CoordinateFrame);
        Assert.True(point.IsMappablePoint);
        Assert.Equal(3, point.ExpectedSampleCount);
        Assert.InRange(point.Position.Y, 1.0999, 1.1001);
        Assert.Equal(1, point.DisplayCenter.Y);
        Assert.Equal(new PosePoint(1, 0, 0), point.Right);
        Assert.Equal(new PosePoint(0, 0, 1), point.Forward);
        Assert.Equal(1, point.AvatarScale);
        Assert.True(point.Matches(Prefix + "/**"));
        Assert.True(point.Matches(Prefix + "/Z"));
        Assert.False(point.Matches(Prefix + "/Valid"));
        Assert.True(point.Matches(Prefix + "/RightX"));
        Assert.True(point.Matches(Prefix + "/AvatarScale"));
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
    [InlineData("RightX", 8.001f)]
    [InlineData("RightY", -8.001f)]
    [InlineData("RightZ", float.NaN)]
    [InlineData("ForwardX", float.PositiveInfinity)]
    [InlineData("ForwardY", 8.001f)]
    [InlineData("ForwardZ", -8.001f)]
    [InlineData("AvatarScale", 0)]
    [InlineData("AvatarScale", -.001f)]
    [InlineData("AvatarScale", 8.001f)]
    [InlineData("AvatarScale", float.NaN)]
    public void Invalid_fields_never_enable_mapping(string field, float value)
    {
        using var rig = new MotionRig();
        Packet(rig, field: field, value: value);
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

    [Fact]
    public void Scaled_sheared_and_mirrored_axes_keep_the_reported_values()
    {
        using var rig = new MotionRig();
        Packet(rig, right: new(-8, 0, 0), forward: new(1, 0, 8), avatarScale: 8);
        var point = Observe(rig);
        Assert.True(point.Valid, point.Reason);
        Assert.Equal(new PosePoint(-8, 0, 0), point.Right);
        Assert.Equal(new PosePoint(1, 0, 8), point.Forward);
        Assert.Equal(8, point.AvatarScale);
    }

    [Theory]
    [InlineData(0, 0, 0, 0, 0, 1)]
    [InlineData(1, 0, 0, 0, 0, 0)]
    [InlineData(.0000001, 0, 0, 0, 0, 1)]
    [InlineData(1, 0, 0, 1, 0, 0)]
    [InlineData(1, 0, 0, -1, 0, 0)]
    [InlineData(1, 0, 0, 1, 0, .00005)]
    public void Degenerate_or_nearly_collinear_axes_invalidate_the_whole_packet(
        double rx, double ry, double rz, double fx, double fy, double fz)
    {
        using var rig = new MotionRig();
        Packet(rig, right: new(rx, ry, rz), forward: new(fx, fy, fz));
        var point = Observe(rig);
        Assert.False(point.Valid);
        Assert.Null(point.Right); Assert.Null(point.Forward); Assert.Null(point.AvatarScale);
    }

    [Fact]
    public void Missing_any_native_field_and_legacy_five_field_packets_are_invalid()
    {
        using var rig = new MotionRig();
        Packet(rig);
        var entries = rig.Store.SnapshotEntries();
        foreach (var field in entries)
        {
            var incomplete = entries.Where(entry => entry.Path != field.Path);
            Assert.False(Assert.Single(SpsPositionTracking.Observe(incomplete, timeProvider: rig.Clock)).Valid);
        }
        var legacy = entries.Where(entry => new[] { "Frame", "X", "Y", "Z", "Valid" }.Contains(entry.Path.Split('/')[^1]));
        Assert.False(Assert.Single(SpsPositionTracking.Observe(legacy, timeProvider: rig.Clock)).Valid);
        var diagnostic = legacy.Select(entry => entry with { Path = "Sensa/Diagnostics/Shader/0/" + entry.Path.Split('/')[^1] });
        Assert.Empty(SpsPositionTracking.Observe(diagnostic, timeProvider: rig.Clock));
    }

    [Fact]
    public void Shared_shader_fixture_decoded_values_form_one_complete_native_osc_packet()
    {
        using var stream = typeof(ShaderRootContracts).Assembly.GetManifestResourceStream("Sensa.ShaderNativeFormat1")!;
        using var document = JsonDocument.Parse(stream);
        var expected = document.RootElement.GetProperty("expected");
        var xyz = expected.GetProperty("xyz").EnumerateArray().Select(value => value.GetSingle()).ToArray();
        static PosePoint Axis(JsonElement expected, string name)
        {
            var values = expected.GetProperty(name).EnumerateArray().Select(value => value.GetSingle()).ToArray();
            return new(values[0], values[1], values[2]);
        }
        using var rig = new MotionRig();
        Packet(rig, frame: expected.GetProperty("frame").GetSingle(), x: xyz[0], y: xyz[1], z: xyz[2],
            prefix: "Sensa/Shader/" + expected.GetProperty("producerId").GetInt32(), right: Axis(expected, "right"),
            forward: Axis(expected, "forward"), avatarScale: expected.GetProperty("avatarScale").GetSingle());
        var point = Observe(rig);
        Assert.True(point.Valid, point.Reason);
        Assert.Equal(expected.GetProperty("coordinateFrame").GetString(), point.CoordinateFrame);
        Assert.Equal(new PosePoint(xyz[0], xyz[1], xyz[2]), point.Position);
        Assert.Equal(Axis(expected, "right"), point.Right);
        Assert.Equal(Axis(expected, "forward"), point.Forward);
        Assert.Equal(expected.GetProperty("avatarScale").GetSingle(), point.AvatarScale);
    }

    [Fact]
    public void Validated_optional_values_serialize_separately_and_clear_on_invalidity()
    {
        using var rig = new MotionRig();
        Packet(rig, right: new(2, 0, 0), forward: new(1, 0, 3), avatarScale: .5f);
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var json = JsonSerializer.SerializeToElement(Observe(rig), options);
        Assert.Equal(2, json.GetProperty("right").GetProperty("x").GetDouble());
        Assert.Equal(3, json.GetProperty("forward").GetProperty("z").GetDouble());
        Assert.Equal(.5, json.GetProperty("avatarScale").GetDouble());
        rig.Put(Prefix + "/Valid", 0);
        json = JsonSerializer.SerializeToElement(Observe(rig), options);
        foreach (var field in new[] { "right", "forward", "avatarScale" }) Assert.Equal(JsonValueKind.Null, json.GetProperty(field).ValueKind);
    }

    [Fact]
    public void Axes_and_scale_can_be_resolved_as_raw_osc_leaves_for_calculations()
    {
        using var rig = new MotionRig();
        Packet(rig, right: new(2, 0, 0), avatarScale: .5f);
        var resolver = new ComputedSignalResolver(rig.Store.SnapshotEntries().ToArray(), "test",
            rig.Clock.GetUtcNow().ToUnixTimeMilliseconds(), ShaderRootTracking.MaximumFrameAgeMs, true);
        foreach (var (leaf, expected) in new[] { ("RightX", 2f), ("ForwardZ", 1f), ("AvatarScale", .5f) })
        {
            var result = resolver.Resolve(new() { SourceMode = "Direct", OscPath = Prefix + "/" + leaf });
            Assert.True(result.Valid, result.Reason); Assert.Equal(expected, result.Value);
        }
    }

    [Theory]
    [InlineData(PointMetric.RightX, 2f, ":Basis")]
    [InlineData(PointMetric.RightY, .3f, ":Basis")]
    [InlineData(PointMetric.RightZ, 0f, ":Basis")]
    [InlineData(PointMetric.ForwardX, .5f, ":Basis")]
    [InlineData(PointMetric.ForwardY, 0f, ":Basis")]
    [InlineData(PointMetric.ForwardZ, 3f, ":Basis")]
    [InlineData(PointMetric.AvatarScale, .5f, ":Scale")]
    public void Shader_point_metrics_require_spatial_permission_complete_packet_and_changing_frame(
        PointMetric metric, float value, string quantity)
    {
        using var rig = new MotionRig();
        Packet(rig, right: new(2, .3f, 0), forward: new(.5f, 0, 3), avatarScale: .5f);
        ComputedSignalResolver Resolver(bool allow = true) => new(rig.Store.SnapshotEntries(), "test",
            rig.Clock.GetUtcNow().ToUnixTimeMilliseconds(), ShaderRootTracking.MaximumFrameAgeMs, allow);
        var input = new ComputedSignalInputConfig { SourceMode = "SensaPoint", OscPath = Prefix + "/" + metric, PointMetric = metric };
        Assert.False(Resolver(false).Resolve(input).Valid);
        var sample = Resolver().Resolve(input);
        Assert.True(sample.Valid, sample.Reason); Assert.Equal(value, sample.Value);
        Assert.Equal("AvatarRootLocal" + quantity, sample.CoordinateFrame);
        rig.Put(Prefix + "/Valid", 0);
        Assert.False(Resolver().Resolve(input).Valid);
        Packet(rig, frame: 2);
        Assert.True(Resolver().Resolve(input).Valid);
        rig.Advance(ShaderRootTracking.MaximumFrameAgeMs + 1);
        Packet(rig, frame: 2);
        Assert.False(Resolver().Resolve(input).Valid);
    }

    [Fact]
    public void Shader_scale_converts_position_units_and_invalidity_propagates()
    {
        using var rig = new MotionRig();
        Packet(rig, z: .2f, avatarScale: .5f);
        ComputedSignalInputConfig Point(PointMetric metric) => new() { SourceMode = "SensaPoint", OscPath = Prefix + "/**", PointMetric = metric };
        var evaluator = new ComputedSignalEvaluator([
            new() { Id = "Metres", Operation = ComputedSignalOperation.Product, Inputs = [Point(PointMetric.Z), Point(PointMetric.AvatarScale), new() { SourceMode = "Constant", Value = 2 }] },
            new() { Id = "Local", Operation = ComputedSignalOperation.Ratio, Inputs = [new() { SourceMode = "Computed", OscPath = "Metres" }, Point(PointMetric.AvatarScale)] },
            new() { Id = "InvalidMix", Operation = ComputedSignalOperation.Sum, Inputs = [Point(PointMetric.Z), Point(PointMetric.RightX)] },
        ]);
        IReadOnlyDictionary<string, ComputedSignalSample> Evaluate()
        {
            var now = rig.Clock.GetUtcNow().ToUnixTimeMilliseconds();
            return evaluator.Evaluate(now, new ComputedSignalResolver(rig.Store.SnapshotEntries(), "test", now, 500, true).Resolve);
        }
        var result = Evaluate();
        Assert.True(result["Metres"].Valid, result["Metres"].Reason);
        Assert.Equal(.2f, result["Metres"].Value); Assert.Equal("AvatarRootMeters", result["Metres"].CoordinateFrame);
        Assert.Equal(.4f, result["Local"].Value); Assert.Equal("AvatarRootLocal", result["Local"].CoordinateFrame);
        Assert.False(result["InvalidMix"].Valid);
        rig.Put(Prefix + "/Valid", 0);
        Assert.All(Evaluate().Values, sample => Assert.False(sample.Valid));
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
