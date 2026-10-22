using System.Text.Json;
using System.Text.Json.Serialization;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Motion;
using Sensa.Outputs.TCode;
using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Shipped preset and first-run contracts / 内置预设与首次使用契约。</summary>
public sealed class PresetContracts
{
    [Fact]
    public void ShippedPresetsDescribeRealProducersWithoutSyntheticWorldInputs()
    {
        var presets = Presets();
        Assert.Equal(new[] { "ogb-depth", "ogb-touch", "contact-position", "contact-speed", "native-pb-stretch" }, presets.Select(preset => preset.Id));
        Assert.Equal(presets.Count, presets.Select(preset => preset.Id).Distinct(StringComparer.OrdinalIgnoreCase).Count());
        foreach (var preset in presets)
        {
            Assert.False(string.IsNullOrWhiteSpace(preset.Name));
            Assert.False(string.IsNullOrWhiteSpace(preset.Description));
            Assert.NotEmpty(preset.Mappings);
            var config = new AppConfig { Signals = preset.Mappings };
            config.NormalizeForRuntime();
            Assert.Equal(preset.Mappings.Count, config.Signals.Count);
            Assert.All(config.Signals, mapping =>
            {
                Assert.False(string.IsNullOrWhiteSpace(mapping.OscPath));
                Assert.True(float.IsFinite(mapping.VrchatMin) && float.IsFinite(mapping.VrchatMax));
                Assert.True(mapping.SourceMode is "Direct" or "OgbDepth" or "OgbTouch" or "SensaPoint");
                Assert.DoesNotContain("Angle", mapping.OscPath);
                Assert.False(mapping.InvertDirection);
            });
        }
    }

    [Theory]
    [InlineData("contact-position", PointMetric.Z, SignalRole.Depth)]
    [InlineData("contact-speed", PointMetric.Speed, SignalRole.V0)]
    public void Contact_templates_keep_one_explicit_target_and_use_guarded_spatial_metrics(string id, PointMetric metric, SignalRole role)
    {
        var mapping = Assert.Single(Presets().Single(preset => preset.Id == id).Mappings);
        Assert.Equal("SensaPoint", mapping.SourceMode);
        Assert.Equal(metric, mapping.PointMetric);
        Assert.Equal(role, mapping.Role);
        Assert.True(OscParameterStore.MatchesPathPattern(mapping.OscPath, "Sensa/Contact/Root/Proximity_SenderLocalPositionZ"));
        Assert.True(OscParameterStore.MatchesPathPattern(mapping.OscPath, "Sensa/Contact/Root/Proximity_SenderVelocityMagnitude"));
        Assert.False(OscParameterStore.MatchesPathPattern(mapping.OscPath, "Sensa/Contact/Other/Proximity_SenderLocalPositionZ"));
        Assert.False(OscParameterStore.MatchesPathPattern(mapping.OscPath, "OGB/Orf/Root/PenSelfNewRoot"));
        var config = new AppConfig { Signals = [mapping] };
        config.NormalizeForRuntime();
        Assert.False(config.Osc.AllowExperimentalSpatialInput);
        Assert.Equal(metric, Assert.Single(config.Signals).PointMetric);
    }

    // Both generations use OGB names; parent paths remain exact instance identities in the resolver.
    // 新旧生成器共用 OGB 命名；解算时完整父路径仍是实例身份。
    [Theory]
    [InlineData("ogb-depth", "OGB/Orf/Hips_Front/PenOthersNewRoot", true)]
    [InlineData("ogb-depth", "OGB/Orf/Hips_Front/PenOthersNewTip", false)]
    [InlineData("ogb-depth", "OGB/Orf/Hips_Front/PenSelfNewRoot", false)]
    [InlineData("ogb-depth", "OGB/Orf/Hips_Front/PenOthers", true)]
    [InlineData("ogb-depth", "OGB/Orf/Pussy/Main/PenOthersNewRoot", true)]
    [InlineData("ogb-depth", "OGB/Pen/Main_Plug/PenOthers", true)]
    [InlineData("ogb-depth", "OGB/Pen/Main_Plug/PenSelf", false)]
    [InlineData("ogb-depth", "OGB/Orf/Main/PenOthers", true)]
    [InlineData("ogb-touch", "OGB/Orf/Hips_Front/TouchOthers", true)]
    [InlineData("ogb-touch", "OGB/Pen/Main_Plug/FrotOthers", true)]
    [InlineData("ogb-touch", "OGB/Orf/Hips_Front/TouchSelf", false)]
    [InlineData("ogb-touch", "OGB/Pen/Main_Plug/TouchOthersClose", false)]
    [InlineData("ogb-touch", "OGB/Orf/Hips_Front/PenOthersNewRoot", false)]
    [InlineData("ogb-touch", "VFH/Zone/Touch/Chest/Others", true)]
    [InlineData("ogb-touch", "VFH/Zone/Touch/Body/Chest/Others", true)]
    [InlineData("ogb-touch", "VFH/Zone/Touch/Chest/Self", false)]
    [InlineData("ogb-touch", "VFH/Zone/Touch/Chest/OthersClose", false)]
    [InlineData("ogb-touch", "VFH/Version/10", false)]
    public void OgbTemplatesCoverBothGenerationsWithoutSelectingCompanionOrOtherPartySignals(string id, string path, bool expected)
    {
        var mapping = Assert.Single(Presets().Single(value => value.Id == id).Mappings);
        Assert.Equal(expected, OscParameterStore.MatchesPathPattern(mapping.OscPath, path));
    }

    [Fact]
    public async Task NativePhysBoneStretchUsesItsGrabGateWithoutPositionReconstruction()
    {
        var mappings = Presets().Single(value => value.Id == "native-pb-stretch").Mappings;
        Assert.All(mappings, mapping => Assert.Equal("Direct", mapping.SourceMode));
        using var rig = new MotionRig(mappings.ToArray());
        rig.Put("MyPB_Stretch", .75f);
        rig.Activate();
        Assert.False(rig.Runtime.CanSend);
        rig.Put("MyPB_IsGrabbed", 1);
        Assert.InRange((await rig.Output.NextFrame()).L0, .74f, .76f);
        rig.Put("MyPB_IsGrabbed", 0);
        await rig.Output.NextStop();
        Assert.False(rig.Runtime.CanSend);
    }

    [Theory]
    [InlineData(0f, 400)]
    [InlineData(.25f, 450)]
    [InlineData(.5f, 500)]
    [InlineData(.75f, 550)]
    [InlineData(1f, 600)]
    public async Task IsolatedScalarStepsTravelThroughRuntimeAndFirstRunProfileToOnlyL0(float depth, int target)
    {
        using var rig = ScalarFixture();
        rig.Put("CI/Depth", depth);
        rig.Put("CI/Active", 1);
        rig.Activate();
        var frame = await rig.Output.NextFrame();
        var profile = MotionProfile();
        var (line, effective) = TCodeEncoder.BuildLine(profile, null, null, null, new(), null, frame, true);
        Assert.InRange(effective.L0 * 1000, target - 1f, target + 1f);
        Assert.Matches(@"^L0\d+I\d+$", line);
        rig.Put("CI/Active", 0);
        await rig.Output.NextStop();
        Assert.False(rig.Runtime.CanSend);
    }

    [Fact]
    public void MissingScalarFixtureGateCannotArmMotion()
    {
        using var rig = ScalarFixture();
        rig.Put("CI/Depth", .8f);
        rig.Activate();
        Assert.False(rig.Runtime.CanSend);
        Assert.Empty(rig.Output.Frames);
    }

    [Fact]
    public void BuiltInIdsCannotBeShadowedByPersistedCustomPresetCopies()
    {
        var config = new AppConfig { OscMappingPresets = [
            new() { Id = "ogb-depth", Name = "replaced", Mappings = [new() { OscPath = "unsafe" }] },
            new() { Id = "custom", Name = "Custom / 自定义", Mappings = [new() { OscPath = "custom/depth" }] }] };
        config.NormalizeForRuntime();
        Assert.Equal("custom", Assert.Single(config.OscMappingPresets).Id);
    }

    private static List<OscMappingPresetConfig> Presets()
    {
        using var stream = typeof(AppConfig).Assembly.GetManifestResourceStream("Sensa.OscPresets.json")!;
        return JsonSerializer.Deserialize<List<OscMappingPresetConfig>>(stream, Options())!;
    }

    private static MotionRig ScalarFixture() => new(
        new SignalMapping { OscPath = "CI/Depth", Role = SignalRole.Depth },
        new SignalMapping { OscPath = "CI/Active", Role = SignalRole.GateEnable });

    private static TCodeMotionProfile MotionProfile()
    {
        using var stream = typeof(PresetContracts).Assembly.GetManifestResourceStream("Sensa.TestMotionProfile")!;
        return JsonSerializer.Deserialize<TCodeMotionProfile>(stream, Options())!;
    }

    private static JsonSerializerOptions Options() => new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
}
