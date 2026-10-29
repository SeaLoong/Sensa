using System.Text;
using System.Text.Json;
using Sensa.Input.Script;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class FunscriptInteropContracts
{
    public static IEnumerable<object[]> Vectors()
    {
        using var stream = typeof(FunscriptInteropContracts).Assembly.GetManifestResourceStream("Sensa.FunscriptInterop")!;
        using var document = JsonDocument.Parse(stream);
        foreach (var vector in document.RootElement.GetProperty("cases").EnumerateArray())
            yield return [vector.GetProperty("name").GetString()!, vector.GetRawText()];
    }

    [Theory]
    [MemberData(nameof(Vectors))]
    public void Desktop_and_browser_share_script_direction_interpolation_and_duration(string name, string json)
    {
        using var document = JsonDocument.Parse(json);
        var vector = document.RootElement;
        using var player = new FunscriptPlayer();
        using var script = new MemoryStream(Encoding.UTF8.GetBytes(vector.GetProperty("script").GetRawText()));
        var loaded = player.Load(name + ".funscript", script);
        Assert.False(loaded.Playing);
        Assert.Equal(vector.GetProperty("durationMs").GetInt64(), loaded.DurationMs);
        foreach (var sample in vector.GetProperty("samples").EnumerateArray())
        {
            var snapshot = player.Seek(sample.GetProperty("at").GetInt64());
            Assert.False(snapshot.Playing);
            Assert.InRange(Math.Abs(snapshot.CurrentL0 - sample.GetProperty("value").GetDouble()), 0, 0.000001);
        }
    }
}
