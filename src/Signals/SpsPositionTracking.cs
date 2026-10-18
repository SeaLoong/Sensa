using Sensa.Input.Osc;
using UnityBox.Sensa;

namespace Sensa.Signals;

/// <summary>Coordinates keep their producer's reference frame. A root point does not supply orientation.
/// 坐标保留生产端参考系；单个根点不提供朝向。</summary>
public static class SpsPositionTracking
{
    public sealed record Observation(string Key, string Instance, string Party, string SourceLabel,
        int SampleCount, bool Valid, PosePoint Position, double Radius, double Residual, string Reason,
        string Prefix, string SourceKey, string Kind, int Slot, long TimestampMs)
    {
        public string CoordinateFrame => Kind is "SpsRoot" or "ShaderRoot" ? SensaFixedAnchorProtocol.CoordinateFrame : "ReferenceLocal";
        public string ProfileId => Kind is "SpsRoot" or "ShaderRoot" ? SensaFixedAnchorProtocol.ProfileId : "LocalProximity";
        public double DisplayHalfRange => Kind is "SpsRoot" or "ShaderRoot" ? SensaFixedAnchorProtocol.PositionHalfRange : .25;
        public PosePoint DisplayCenter => Kind is "SpsRoot" or "ShaderRoot" ? new(SensaFixedAnchorProtocol.CenterX,
            SensaFixedAnchorProtocol.CenterY, SensaFixedAnchorProtocol.CenterZ) : default;
        public bool Experimental => true;
        public bool IsLocalPoint => Kind is "Point" or "Handle";
        public bool IsMappablePoint => IsLocalPoint || Kind is "SpsRoot" or "ShaderRoot" && Party == "Self";
        public int ExpectedSampleCount => Kind == "ShaderRoot" ? 3 : IsLocalPoint || Kind == "SpsRoot" ? 4 : 8;
        public bool Matches(string pattern) => Kind == "ShaderRoot"
            ? new[] { "X", "Y", "Z" }.Any(axis => OscParameterStore.MatchesPathPattern(pattern, Prefix + "/" + axis))
            : Enumerable.Range(0, ExpectedSampleCount).Any(index => OscParameterStore.MatchesPathPattern(pattern, $"{Prefix}/Root/A{index}"));
        public float Metric(PointMetric metric) => (float)(metric switch
        {
            PointMetric.X => Position.X, PointMetric.Y => Position.Y,
            PointMetric.Distance => Position.Length, _ => Position.Z
        });
    }

    public static Observation[] Observe(IEnumerable<OscParameterStore.SnapshotEntry> entries,
        string? sourceKey = null, int maxAgeMs = 0, TimeProvider? timeProvider = null)
    {
        var snapshot = entries.ToArray();
        var lookup = snapshot.ToDictionary(entry => (entry.Entry.Source.Key, entry.Path), entry => entry.Entry);
        var now = (timeProvider ?? TimeProvider.System).GetUtcNow().ToUnixTimeMilliseconds();
        return snapshot.Where(entry => (string.IsNullOrEmpty(sourceKey) || sourceKey == entry.Entry.Source.Key)
                && new[] { SensaPoseProtocol.SpsRootPrefix, SensaPoseProtocol.PointPrefix,
                    SensaPoseProtocol.HandlePrefix, SensaPoseProtocol.SharedRootPrefix }
                    .Any(prefix => entry.Path.StartsWith(prefix + "/", StringComparison.Ordinal)))
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
                var kind = first.Parts[1] switch
                {
                    "Point" => "Point", "Handle" => "Handle", "SharedRoot" => "SharedRoot", _ => "SpsRoot"
                };
                var local = kind is "Point" or "Handle";
                var fixedRoot = kind == "SpsRoot";
                var numbered = samples.Select((sample, index) => sample.Parts[6] == "A" + index).All(value => value);
                var values = samples.Select(sample => sample.Sample.Entry.Value.AsFloat()).ToArray();
                var fit = !numbered ? new MarkerFit(false, default, 0, 0, "采样编号不完整 / Sample indices are incomplete")
                    : fixedRoot ? FixedAnchorReconstruction.Fit(values)
                    : local ? PoseReconstruction.FitLocalTetrahedron(values)
                    : PoseReconstruction.FitMarker(values);
                var valid = fit.Valid && (fixedRoot || fit.Radius < .0199) && (!local || first.Parts[4] == "Self");
                var reason = valid ? fixedRoot
                        ? first.Parts[4] == "Self"
                            ? "固定锚点根坐标；非同帧采样 / Fixed-anchor root coordinates; samples are not atomic"
                            : "远端根坐标仅诊断；目标身份未保证 / Remote root diagnostic only; target identity is unproven"
                        : local ? "实验局部估计 / Experimental local estimate"
                            : "实验根部估计；朝向不可观测 / Experimental root estimate; orientation is unobservable"
                    : local && first.Parts[4] != "Self" ? "本地点仅接受 Self 采样 / Local points require Self samples"
                    : fit.Valid ? "球半径达到拟合上限；检查相对缩放" : fit.Reason;
                var slot = 0;
                long timestamp = samples.Min(sample => sample.Sample.Entry.TimestampMs);
                if (kind == "Handle")
                {
                    if (!lookup.TryGetValue((group.Key.Source, group.Key.Prefix + "/Handle_IsGrabbed"), out var grabbed)
                        || grabbed.Value.AsFloat() != 1f) { valid = false; reason = "等待抓取 PB 把手"; }
                    else timestamp = Math.Min(timestamp, grabbed.TimestampMs);
                }
                if (kind == "SharedRoot")
                {
                    var selected = lookup.TryGetValue((group.Key.Source, group.Key.Prefix + "/Slot"), out var selection);
                    var value = selected ? selection.Value.AsFloat() : 0;
                    slot = float.IsFinite(value) && value == MathF.Truncate(value) && value >= 1 && value <= 16 ? (int)value : 0;
                    if (slot == 0 || !lookup.TryGetValue((group.Key.Source, group.Key.Prefix + "/Ready"), out var ready)
                        || ready.Value.AsFloat() != 1f || ready.Sequence <= selection.Sequence
                        || samples.Any(sample => sample.Sample.Entry.Sequence <= selection.Sequence))
                    { valid = false; reason = "共享阵列停用、切换中或等待新槽位采样"; }
                }
                if (fixedRoot)
                {
                    var hasProfile = lookup.TryGetValue((group.Key.Source, group.Key.Prefix + SensaFixedAnchorProtocol.ProfileSuffix), out var profile);
                    var hasValid = lookup.TryGetValue((group.Key.Source, group.Key.Prefix + SensaFixedAnchorProtocol.ValidSuffix), out var producerValid);
                    var hasScale = lookup.TryGetValue((group.Key.Source, group.Key.Prefix + SensaFixedAnchorProtocol.ScaleSuffix), out var scale);
                    var hasHeartbeat = lookup.TryGetValue((group.Key.Source, group.Key.Prefix + SensaFixedAnchorProtocol.HeartbeatSuffix), out var heartbeat);
                    var scaleFactor = hasScale ? scale.Value.AsFloat() : float.NaN;
                    var pulse = hasHeartbeat ? heartbeat.Value.AsFloat() : float.NaN;
                    // This is the dedicated producer's animation liveness, not proof of an atomic range batch.
                    // 专用生产端动画心跳允许保留静止时不重发的距离；它不证明原子采样或无丢包。
                    timestamp = hasHeartbeat ? heartbeat.ChangedAtMs : 0;
                    var heartbeatLimit = maxAgeMs > 0 ? Math.Min(maxAgeMs, SensaFixedAnchorProtocol.MaximumHeartbeatAgeMs)
                        : SensaFixedAnchorProtocol.MaximumHeartbeatAgeMs;
                    if (!hasProfile || profile.Value.AsFloat() != SensaFixedAnchorProtocol.ProfileValue
                        || !hasValid || producerValid.Value.AsFloat() != 1f
                        || !float.IsFinite(scaleFactor) || scaleFactor <= 0
                        || !float.IsFinite(pulse) || pulse is < 0f or > 1f || now < timestamp || now - timestamp > heartbeatLimit)
                    {
                        valid = false;
                        reason = "固定锚点配置、缩放许可或生产端心跳无效 / Fixed-anchor profile, scale permission or producer heartbeat is invalid";
                    }
                }
                else if (maxAgeMs > 0 && now - timestamp > maxAgeMs)
                { valid = false; reason = "部分坐标或抓取状态已超时 / A coordinate or grab state has expired"; }
                return new Observation(group.Key.Source + "|" + group.Key.Prefix, first.Parts[3], first.Parts[4],
                    first.Sample.Entry.Source.Label, samples.Length, valid, valid ? fit.Position : default,
                    fit.Radius, fit.Residual, reason, group.Key.Prefix, group.Key.Source, kind, slot, timestamp);
            }).Concat(ShaderRootTracking.Observe(snapshot, sourceKey, maxAgeMs, timeProvider)).ToArray();
    }
}

public enum PointMetric { X, Y, Z, Distance }
