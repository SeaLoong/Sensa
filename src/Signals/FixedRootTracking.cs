using Sensa.Input.Osc;
using UnityBox.Sensa;

namespace Sensa.Signals;

/// <summary>One unversioned SPS contract: four proximities and a combined validity/liveness counter.
/// 单一无版本 SPS 契约：四路近接值与合并有效性／活性计数。</summary>
public static class FixedRootTracking
{
    public static IEnumerable<SpsPositionTracking.Observation> Observe(
        IEnumerable<OscParameterStore.SnapshotEntry> snapshot, string? sourceKey,
        int maxAgeMs, TimeProvider? timeProvider)
    {
        var now = (timeProvider ?? TimeProvider.System).GetUtcNow().ToUnixTimeMilliseconds();
        return snapshot.Where(entry => entry.Path.StartsWith(SensaFixedAnchorProtocol.Prefix + "/", StringComparison.Ordinal)
                && (string.IsNullOrEmpty(sourceKey) || sourceKey == entry.Entry.Source.Key))
            .Select(entry => (Sample: entry, Parts: entry.Path.Split('/')))
            .Where(entry => entry.Parts.Length == 4 && entry.Parts[2].Length > 0
                && (entry.Parts[3] == "Sample" || entry.Parts[3].Length == 2
                    && entry.Parts[3][0] == 'P' && char.IsAsciiDigit(entry.Parts[3][1])))
            .GroupBy(entry => (Source: entry.Sample.Entry.Source.Key, Instance: entry.Parts[2]))
            .OrderBy(group => group.Key.Source, StringComparer.Ordinal)
            .ThenBy(group => group.Key.Instance, StringComparer.Ordinal).Take(64)
            .Select(group =>
            {
                var fields = group.ToDictionary(entry => entry.Parts[3], entry => entry.Sample.Entry);
                var samples = fields.Where(entry => entry.Key.StartsWith('P')).OrderBy(entry => entry.Key, StringComparer.Ordinal).ToArray();
                var numbered = samples.Length == 4 && samples.Select((sample, index) => sample.Key == "P" + index).All(value => value);
                var fit = numbered ? FixedAnchorReconstruction.Fit(samples.Select(sample => sample.Value.Value.AsFloat()).ToArray())
                    : new MarkerFit(false, default, 0, 0, "需要完整 P0–P3 采样 / Complete P0–P3 samples are required");
                var hasSample = fields.TryGetValue("Sample", out var sampleCounter);
                var timestamp = hasSample ? sampleCounter!.ChangedAtMs : 0;
                var ageLimit = maxAgeMs > 0 ? Math.Min(maxAgeMs, SensaFixedAnchorProtocol.MaximumSampleAgeMs)
                    : SensaFixedAnchorProtocol.MaximumSampleAgeMs;
                // Stationary ranges may be cached. This counter proves producer activity, not atomic Contact sampling.
                // 静止距离可以缓存；此计数只证明生产端活动，不证明 Contact 原子采样。
                var active = hasSample && SensaFixedAnchorProtocol.IsSampleActive(sampleCounter!.Value.AsFloat())
                    && now >= timestamp && now - timestamp <= ageLimit;
                var valid = fit.Valid && active;
                var reason = !active ? "SPS 采样停用或活动计数无效／冻结 / SPS sampling is inactive or its counter is invalid/frozen"
                    : fit.Valid ? "固定锚点根坐标；非同帧采样 / Fixed-anchor root coordinates; samples are not atomic" : fit.Reason;
                var prefix = SensaFixedAnchorProtocol.Prefix + "/" + group.Key.Instance;
                return new SpsPositionTracking.Observation(group.Key.Source + "|" + prefix, group.Key.Instance, "Self",
                    group.First().Sample.Entry.Source.Label, samples.Length, valid, valid ? fit.Position : default,
                    fit.Radius, fit.Residual, reason, prefix, group.Key.Source, "SpsRoot", timestamp);
            });
    }
}
