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
    public void FiveShippedPresetsAreDistinctUsableAndDoNotRecommendExperimentalSpatialInputs()
    {
        var presets = Presets();
        Assert.Equal(new[] { "sensa-quick-start", "sps-socket-depth-others", "sps-plug-depth-others", "sps-touch", "sensa-lab-pb-stretch" }, presets.Select(preset => preset.Id));
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
                Assert.True(mapping.SourceMode is "Direct" or "SpsSocketDepth");
                Assert.DoesNotContain("Angle", mapping.OscPath);
                Assert.False(mapping.InvertDirection);
            });
        }
    }

    // VRCFury source declares one sanitized ID segment; legacy body/instance paths
    // are separate generators and must not be promoted as universal SPS paths.
    // VRCFury 使用单段清洗后的 ID；旧身体部位/实例路径不能作为通用 SPS 路径。
    [Theory]
    [InlineData("sps-socket-depth-others", "OGB/Orf/Hips_Front/PenOthersNewRoot", true)]
    [InlineData("sps-socket-depth-others", "OGB/Orf/Hips_Front/PenOthersNewTip", false)]
    [InlineData("sps-socket-depth-others", "OGB/Orf/Hips_Front/PenSelfNewRoot", false)]
    [InlineData("sps-socket-depth-others", "OGB/Orf/Hips_Front/PenOthers", false)]
    [InlineData("sps-socket-depth-others", "OGB/Orf/Pussy/Main/PenOthersNewRoot", false)]
    [InlineData("sps-plug-depth-others", "OGB/Pen/Main_Plug/PenOthers", true)]
    [InlineData("sps-plug-depth-others", "OGB/Pen/Main_Plug/PenSelf", false)]
    [InlineData("sps-plug-depth-others", "OGB/Orf/Main/PenOthers", false)]
    [InlineData("sps-touch", "OGB/Orf/Hips_Front/TouchOthers", true)]
    [InlineData("sps-touch", "OGB/Pen/Main_Plug/FrotOthers", true)]
    [InlineData("sps-touch", "OGB/Orf/Hips_Front/TouchSelf", false)]
    [InlineData("sps-touch", "OGB/Pen/Main_Plug/TouchOthersClose", false)]
    [InlineData("sps-touch", "OGB/Orf/Hips_Front/PenOthersNewRoot", false)]
    public void RecommendedOgbPatternsMatchOnlyTheSelectedModernGeneratorSignals(string id, string path, bool expected)
    {
        var mapping = Assert.Single(Presets().Single(value => value.Id == id).Mappings);
        Assert.Equal(expected, OscParameterStore.MatchesPathPattern(mapping.OscPath, path));
    }

    [Fact]
    public async Task NativePhysBoneStretchUsesItsGrabGateWithoutPositionReconstruction()
    {
        var mappings = Presets().Single(value => value.Id == "sensa-lab-pb-stretch").Mappings;
        Assert.All(mappings, mapping => Assert.Equal("Direct", mapping.SourceMode));
        using var rig = new MotionRig(mappings.ToArray());
        rig.Put("Sensa/Lab/PB_Stretch", .75f);
        rig.Activate();
        Assert.False(rig.Runtime.CanSend);
        rig.Put("Sensa/Lab/PB_IsGrabbed", 1);
        Assert.InRange((await rig.Output.NextFrame()).L0, .74f, .76f);
        rig.Put("Sensa/Lab/PB_IsGrabbed", 0);
        await rig.Output.NextStop();
        Assert.False(rig.Runtime.CanSend);
    }

    [Theory]
    [InlineData(0f, 400)]
    [InlineData(.25f, 450)]
    [InlineData(.5f, 500)]
    [InlineData(.75f, 550)]
    [InlineData(1f, 600)]
    public async Task WorldQuickStartStepsTravelThroughRuntimeAndFirstRunProfileToOnlyL0(float depth, int target)
    {
        var preset = Presets().Single(value => value.Id == "sensa-quick-start");
        using var rig = new MotionRig(preset.Mappings.ToArray());
        rig.Put("Sensa/QuickStart/Depth", depth);
        rig.Put("Sensa/QuickStart/Active", 1);
        rig.Activate();
        var frame = await rig.Output.NextFrame();
        var profile = MotionProfile();
        var (line, effective) = TCodeEncoder.BuildLine(profile, null, null, null, new(), null, frame, true);
        Assert.InRange(effective.L0 * 1000, target - 1f, target + 1f);
        Assert.Matches(@"^L0\d+I\d+$", line);
        rig.Put("Sensa/QuickStart/Active", 0);
        await rig.Output.NextStop();
        Assert.False(rig.Runtime.CanSend);
    }

    [Fact]
    public void MissingQuickStartActivationCannotArmTheShippedWorldMapping()
    {
        var preset = Presets().Single(value => value.Id == "sensa-quick-start");
        using var rig = new MotionRig(preset.Mappings.ToArray());
        rig.Put("Sensa/QuickStart/Depth", .8f);
        rig.Activate();
        Assert.False(rig.Runtime.CanSend);
        Assert.Empty(rig.Output.Frames);
    }

    [Fact]
    public void BuiltInIdsCannotBeShadowedByPersistedCustomPresetCopies()
    {
        var config = new AppConfig { OscMappingPresets = [
            new() { Id = "sensa-quick-start", Name = "replaced", Mappings = [new() { OscPath = "unsafe" }] },
            new() { Id = "custom", Name = "Custom / 自定义", Mappings = [new() { OscPath = "custom/depth" }] }] };
        config.NormalizeForRuntime();
        Assert.Equal("custom", Assert.Single(config.OscMappingPresets).Id);
    }

    private static List<OscMappingPresetConfig> Presets()
    {
        using var stream = typeof(AppConfig).Assembly.GetManifestResourceStream("Sensa.OscPresets.json")!;
        return JsonSerializer.Deserialize<List<OscMappingPresetConfig>>(stream, Options())!;
    }

    private static TCodeMotionProfile MotionProfile()
    {
        using var stream = typeof(PresetContracts).Assembly.GetManifestResourceStream("QuickStart.MotionProfile")!;
        return JsonSerializer.Deserialize<TCodeMotionProfile>(stream, Options())!;
    }

    private static JsonSerializerOptions Options() => new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
}
