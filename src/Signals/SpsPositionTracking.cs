using Sensa.Input.Osc;
using UnityBox.Sensa;

namespace Sensa.Signals;

/// <summary>Diagnostic-only position of a standard SPS root sphere. Never a motion input:
/// concentric root/length spheres carry no orientation, tip position or roll.</summary>
public static class SpsPositionTracking
{
    public sealed record Observation(string Key, string Instance, string Party, string SourceLabel,
        int SampleCount, bool Valid, PosePoint Position, double Radius, double Residual, string Reason);

    public static Observation[] Observe(IEnumerable<OscParameterStore.SnapshotEntry> entries, string? sourceKey = null)
        => entries.Where(e => (string.IsNullOrEmpty(sourceKey) || sourceKey == e.Entry.Source.Key)
                && e.Path.StartsWith(SensaPoseProtocol.SpsRootPrefix + "/", StringComparison.Ordinal))
            .Select(e => (Sample: e, Parts: e.Path.Split('/')))
            .Where(e => e.Parts.Length == 7 && e.Parts[4] is "Self" or "Others" && e.Parts[5] == "Root"
                && e.Parts[6].Length == 2 && e.Parts[6][0] == 'A' && e.Parts[6][1] is >= '0' and <= '7')
            .GroupBy(e => (Source: e.Sample.Entry.Source.Key, Prefix: string.Join('/', e.Parts.Take(5))))
            .OrderBy(g => g.Key.Source, StringComparer.Ordinal).ThenBy(g => g.Key.Prefix, StringComparer.Ordinal).Take(64)
            .Select(group =>
            {
                var first = group.First();
                var samples = group.OrderBy(e => e.Parts[6], StringComparer.Ordinal).ToArray();
                var fit = PoseReconstruction.FitMarker(samples.Select(e => e.Sample.Entry.Value.AsFloat()).ToArray());
                // A radius at the search boundary cannot confirm compatibility with this probe's scale.
                var valid = fit.Valid && fit.Radius < .0199;
                return new Observation(group.Key.Source + "|" + group.Key.Prefix, first.Parts[3], first.Parts[4],
                    first.Sample.Entry.Source.Label, samples.Length, valid, valid ? fit.Position : default,
                    fit.Radius, fit.Residual, valid ? "根部位置有效 · 朝向不可观测"
                        : fit.Valid ? "球半径达到拟合上限；检查相对缩放" : fit.Reason);
            }).ToArray();
}
