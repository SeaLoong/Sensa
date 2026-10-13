using System.Text.Json;
using System.Text.Json.Serialization;
using Sensa.Configuration;
using Xunit;

namespace Sensa.Tests;

public class PresetTests
{
    [Fact] public void EveryShippedPresetNormalizesAndLocalProbesHaveCompleteTemplates()
    {
        using var stream=typeof(AppConfig).Assembly.GetManifestResourceStream("Sensa.OscPresets.json")!;
        var options=new JsonSerializerOptions(JsonSerializerDefaults.Web);options.Converters.Add(new JsonStringEnumConverter());
        var presets=JsonSerializer.Deserialize<List<OscMappingPresetConfig>>(stream,options)!;
        Assert.Equal(presets.Count,presets.Select(p=>p.Id).Distinct().Count());
        foreach(var preset in presets){
            Assert.False(string.IsNullOrWhiteSpace(preset.Description));Assert.NotEmpty(preset.Mappings);
            var config=new AppConfig{Signals=preset.Mappings};config.NormalizeForRuntime();Assert.Equal(preset.Mappings.Count,config.Signals.Count);
            Assert.DoesNotContain(preset.Mappings,m=>m.OscPath.StartsWith("Sensa/SpsRoot/")||m.OscPath.StartsWith("Sensa/SharedRoot/"));
        }
        foreach(var kind in new[]{"point","handle"})foreach(var variant in new[]{"z","xyz","distance"}){
            var preset=Assert.Single(presets,p=>p.Id=="sensa-"+kind+"-"+variant);
            Assert.All(preset.Mappings,m=>Assert.Equal("SensaPoint",m.SourceMode));
            Assert.Single(preset.Mappings.Select(m=>m.OscPath).Distinct());
            Assert.Equal(variant=="xyz"?3:1,preset.Mappings.Count);
        }
    }
}
