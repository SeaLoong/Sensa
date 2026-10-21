using Sensa.Input.Osc;
using UnityBox.Sensa;

namespace Sensa.Signals;

/// <summary>Coordinates retain their producer's reference frame; one point supplies no orientation.
/// 坐标保留生产端参考系；单点不提供朝向。</summary>
public static class SpsPositionTracking
{
    public sealed record Observation(string Key, string Instance, string Party, string SourceLabel,
        int SampleCount, bool Valid, PosePoint Position, double Radius, double Residual, string Reason,
        string Prefix, string SourceKey, string Kind, long TimestampMs)
    {
        public string CoordinateFrame => Kind is "SpsRoot" or "ShaderRoot" ? SensaFixedAnchorProtocol.CoordinateFrame : "ReferenceLocal";
        public double DisplayHalfRange => Kind is "SpsRoot" or "ShaderRoot" ? SensaFixedAnchorProtocol.PositionHalfRange : SensaPoseProtocol.PositionRadius;
        public PosePoint DisplayCenter => Kind is "SpsRoot" or "ShaderRoot" ? new(SensaFixedAnchorProtocol.CenterX,
            SensaFixedAnchorProtocol.CenterY, SensaFixedAnchorProtocol.CenterZ) : default;
        public bool Experimental => true;
        public bool IsLocalPoint => Kind is "Point" or "Handle";
        public bool IsMappablePoint => Party == "Self" && Kind is "Point" or "Handle" or "SpsRoot" or "ShaderRoot";
        public int ExpectedSampleCount => Kind == "ShaderRoot" ? 3 : 4;
        public bool Matches(string pattern) => Kind == "ShaderRoot"
            ? new[] { "X", "Y", "Z" }.Any(axis => OscParameterStore.MatchesPathPattern(pattern, Prefix + "/" + axis))
            : Enumerable.Range(0, 4).Any(index => OscParameterStore.MatchesPathPattern(pattern,
                Kind == "SpsRoot" ? $"{Prefix}/P{index}" : $"{Prefix}/Root/A{index}"));
        public float Metric(PointMetric metric) => (float)(metric switch
        {
            PointMetric.X => Position.X, PointMetric.Y => Position.Y,
            PointMetric.Distance => Position.Length, _ => Position.Z
        });
    }

    public static Observation[] Observe(IEnumerable<OscParameterStore.SnapshotEntry> entries,
        string? sourceKey = null, int maxAgeMs = 0, TimeProvider? timeProvider = null)
    {
        var snapshot = entries as OscParameterStore.SnapshotEntry[] ?? entries.ToArray();
        // Face/expression parameters do not participate in local-point reconstruction.
        // Build only the small lookup needed for local samples and Handle_IsGrabbed.
        var localSnapshot = snapshot.Where(entry => (string.IsNullOrEmpty(sourceKey) || sourceKey == entry.Entry.Source.Key)
            && (entry.Path.StartsWith(SensaPoseProtocol.PointPrefix + "/", StringComparison.Ordinal)
                || entry.Path.StartsWith(SensaPoseProtocol.HandlePrefix + "/", StringComparison.Ordinal))).ToArray();
        var lookup = localSnapshot.ToDictionary(entry => (entry.Entry.Source.Key, entry.Path), entry => entry.Entry);
        var now = (timeProvider ?? TimeProvider.System).GetUtcNow().ToUnixTimeMilliseconds();
        var localPoints = localSnapshot
            .Select(entry => (Sample: entry, Parts: entry.Path.Split('/')))
            .Where(entry => entry.Parts.Length == 7 && entry.Parts[4] is "Self" or "Others"
                && entry.Parts[5] == "Root" && entry.Parts[6].Length == 2
                && entry.Parts[6][0] == 'A' && entry.Parts[6][1] is >= '0' and <= '7')
            .GroupBy(entry => (Source: entry.Sample.Entry.Source.Key, Prefix: string.Join('/', entry.Parts.Take(5))))
            .OrderBy(group => group.Key.Source, StringComparer.Ordinal)
            .ThenBy(group => group.Key.Prefix, StringComparer.Ordinal).Take(64)
            .Select(group =>
            {
                var first = group.First();
                var samples = group.OrderBy(entry => entry.Parts[6], StringComparer.Ordinal).ToArray();
                var kind = first.Parts[1];
                var numbered = samples.Select((sample, index) => sample.Parts[6] == "A" + index).All(value => value);
                var fit = numbered ? PoseReconstruction.FitLocalTetrahedron(samples.Select(sample => sample.Sample.Entry.Value.AsFloat()).ToArray())
                    : new MarkerFit(false, default, 0, 0, "采样编号不完整 / Sample indices are incomplete");
                var valid = fit.Valid && fit.Radius < .0199 && first.Parts[4] == "Self";
                var reason = valid ? "实验局部估计 / Experimental local estimate"
                    : first.Parts[4] != "Self" ? "本地点仅接受 Self 采样 / Local points require Self samples"
                    : fit.Valid ? "球半径达到拟合上限；检查相对缩放" : fit.Reason;
                long timestamp = samples.Min(sample => sample.Sample.Entry.TimestampMs);
                if (kind == "Handle")
                {
                    if (!lookup.TryGetValue((group.Key.Source, group.Key.Prefix + "/Handle_IsGrabbed"), out var grabbed)
                        || grabbed.Value.AsFloat() != 1f) { valid = false; reason = "等待抓取 PB 把手"; }
                    else timestamp = Math.Min(timestamp, grabbed.TimestampMs);
                }
                if (maxAgeMs > 0 && now - timestamp > maxAgeMs)
                { valid = false; reason = "部分坐标或抓取状态已超时 / A coordinate or grab state has expired"; }
                return new Observation(group.Key.Source + "|" + group.Key.Prefix, first.Parts[3], first.Parts[4],
                    first.Sample.Entry.Source.Label, samples.Length, valid, valid ? fit.Position : default,
                    fit.Radius, fit.Residual, reason, group.Key.Prefix, group.Key.Source, kind, timestamp);
            });
        return localPoints.Concat(FixedRootTracking.Observe(snapshot, sourceKey, maxAgeMs, timeProvider))
            .Concat(ShaderRootTracking.Observe(snapshot, sourceKey, maxAgeMs, timeProvider)).ToArray();
    }
}

public enum PointMetric { X, Y, Z, Distance }
