using System.Text.Json;
using System.Text.Json.Serialization;
using Sensa.Configuration;
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
    public void AllTwentyNineShippedPresetsAreDistinctUsableAndNeverPromoteDiagnosticRootsToMotion()
    {
        var presets = Presets();
        Assert.Equal(29, presets.Count);
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
                Assert.True(mapping.SourceMode is "Direct" or "SpsSocketDepth" or "SensaPose" or "SensaPoint");
                Assert.False(mapping.OscPath.StartsWith("Sensa/SpsRoot/") || mapping.OscPath.StartsWith("Sensa/SharedRoot/"));
            });
        }
    }

    [Theory]
    [InlineData("point", "z", 1)]
    [InlineData("point", "xyz", 3)]
    [InlineData("point", "distance", 1)]
    [InlineData("handle", "z", 1)]
    [InlineData("handle", "xyz", 3)]
    [InlineData("handle", "distance", 1)]
    public void LocalProbeTemplatesUseOneRigAndTheDeclaredMetrics(string kind, string variant, int count)
    {
        var preset = Assert.Single(Presets(), value => value.Id == $"sensa-{kind}-{variant}");
        Assert.Equal(count, preset.Mappings.Count);
        Assert.Single(preset.Mappings.Select(mapping => mapping.OscPath).Distinct());
        Assert.All(preset.Mappings, mapping => Assert.Equal("SensaPoint", mapping.SourceMode));
        if (variant == "xyz")
            Assert.Equal(new[] { PointMetric.X, PointMetric.Y, PointMetric.Z }, preset.Mappings.Select(mapping => mapping.PointMetric).Order().ToArray());
        else
            Assert.Equal(variant == "z" ? PointMetric.Z : PointMetric.Distance, preset.Mappings[0].PointMetric);
    }

    [Fact]
    public void PoseFullTemplateKeepsSixMetricsInOneSpatialRig()
    {
        var preset = Assert.Single(Presets(), value => value.Id == "sensa-pose-full");
        Assert.Equal(6, preset.Mappings.Count);
        Assert.Single(preset.Mappings.Select(mapping => mapping.OscPath).Distinct());
        Assert.All(preset.Mappings, mapping => Assert.Equal("SensaPose", mapping.SourceMode));
        Assert.Equal(Enum.GetValues<PoseMetric>().Order(), preset.Mappings.Select(mapping => mapping.PoseMetric).Order());
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
