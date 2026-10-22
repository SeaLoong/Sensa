using Sensa.Input.Osc;

namespace Sensa.Signals;

/// <summary>
/// Resolves scalar and reconstructed spatial leaves from one immutable OSC snapshot.
/// Exact paths use an index; each spatial reconstruction runs at most once per snapshot.
/// </summary>
public sealed class ComputedSignalResolver
{
    private readonly OscParameterStore.SnapshotEntry[] _entries;
    private readonly Dictionary<string, OscParameterStore.SnapshotEntry[]> _paths;
    private readonly Lazy<SpsPositionTracking.Observation[]> _points;
    private readonly Lazy<PoseObservation[]> _poses;
    private readonly long _nowMs;
    private readonly int _spatialMaxAgeMs;
    private readonly bool _allowSpatial;
    private readonly int _scalarMaxAgeMs;
    private readonly Dictionary<string, ComputedSignalSample> _scalars = new(StringComparer.Ordinal);

    public ComputedSignalResolver(OscParameterStore.SnapshotEntry[] snapshot, string? sourceKey,
        long nowMs, int spatialMaxAgeMs, bool allowSpatial, int scalarMaxAgeMs = 0)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        _entries = snapshot.Where(entry => string.IsNullOrEmpty(sourceKey)
            || entry.Entry.Source.Key == sourceKey).ToArray();
        _paths = _entries.GroupBy(entry => entry.Path, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);
        _nowMs = nowMs;
        _spatialMaxAgeMs = spatialMaxAgeMs;
        _allowSpatial = allowSpatial;
        _scalarMaxAgeMs = scalarMaxAgeMs;
        var clock = new SnapshotClock(nowMs);
        _points = new(() => SpsPositionTracking.Observe(_entries, sourceKey, spatialMaxAgeMs, clock));
        _poses = new(() => PoseReconstruction.Observe(_entries, sourceKey));
    }

    public ComputedSignalSample Resolve(ComputedSignalInputConfig input) => input.SourceMode switch
    {
        "Direct" => ResolveScalar(input.OscPath),
        "SensaPoint" => _allowSpatial ? ResolvePoint(input)
            : ComputedSignalSample.Invalid("请先启用空间输入 / Enable spatial input to use tracking measurements"),
        "SensaPose" => _allowSpatial ? ResolvePose(input)
            : ComputedSignalSample.Invalid("请先启用空间输入 / Enable spatial input to use tracking measurements"),
        _ => ComputedSignalSample.Invalid("请选择参数或定位指标 / Choose a parameter or tracking metric"),
    };

    private ComputedSignalSample ResolveScalar(string pattern)
    {
        if (_scalars.TryGetValue(pattern, out var cached)) return cached;
        var result = ResolveScalarCore(pattern);
        _scalars.Add(pattern, result);
        return result;
    }

    private ComputedSignalSample ResolveScalarCore(string pattern)
    {
        OscParameterStore.SnapshotEntry[] matches;
        if (pattern.IndexOfAny(['*', ';', '\n']) < 0)
            matches = _paths.GetValueOrDefault(pattern) ?? [];
        else
        {
            var prefixes = pattern.Split([';', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Take(32).Select(part => part.Contains('*') ? part[..part.IndexOf('*')].TrimEnd('/') : part).ToArray();
            matches = _entries.Where(entry => prefixes.Any(prefix => entry.Path.StartsWith(prefix, StringComparison.Ordinal))
                && OscParameterStore.MatchesPathPattern(pattern, entry.Path)).Take(2).ToArray();
        }
        if (matches.Length == 0)
            return ComputedSignalSample.Invalid("等待参数：" + pattern + " / Waiting for parameter: " + pattern);
        if (matches.Length != 1)
            return ComputedSignalSample.Invalid("请选择唯一参数和 OSC 来源 / Select one parameter and OSC source");
        var entry = matches[0].Entry;
        var value = entry.Value.AsFloat();
        if (_scalarMaxAgeMs > 0 && _nowMs - entry.TimestampMs > _scalarMaxAgeMs)
            return ComputedSignalSample.Invalid("部分计算输入已超时 / A calculation input has expired");
        return float.IsFinite(value) && entry.TimestampMs <= _nowMs
            ? ComputedSignalSample.Success(value, entry.Source.Key, entry.TimestampMs)
            : ComputedSignalSample.Invalid("等待有效参数值 / Waiting for a valid parameter value");
    }

    private ComputedSignalSample ResolvePoint(ComputedSignalInputConfig input)
    {
        var matches = _points.Value.Where(point => point.IsMappablePoint && point.Matches(input.OscPath)).Take(2).ToArray();
        if (matches.Length == 0)
            return ComputedSignalSample.Invalid("等待完整定位采样 / Waiting for complete tracking samples");
        if (matches.Length != 1)
            return ComputedSignalSample.Invalid("请选择唯一定位点和 OSC 来源 / Select one tracking point and OSC source");
        var point = matches[0];
        if (!point.Valid)
            return ComputedSignalSample.Invalid(point.Reason);
        if (!IsFresh(point.TimestampMs))
            return ComputedSignalSample.Invalid("定位采样已超时 / Tracking samples have expired");
        if (!point.SupportsMetric(input.PointMetric))
            return ComputedSignalSample.Invalid("请选择该定位方式提供的指标 / Choose a metric supplied by this tracking method");
        var value = point.Metric(input.PointMetric);
        var frame = point.CoordinateFrame == "ReferenceLocal"
            ? point.CoordinateFrame + ":" + point.Prefix : point.CoordinateFrame;
        frame += input.PointMetric switch
        {
            PointMetric.VelocityX or PointMetric.VelocityY or PointMetric.VelocityZ or PointMetric.Speed => ":Velocity",
            PointMetric.ProximitySpeed => ":ProximityRate",
            _ => "",
        };
        return float.IsFinite(value)
            ? ComputedSignalSample.Success(value, point.SourceKey, point.TimestampMs, frame)
            : ComputedSignalSample.Invalid("等待有效定位值 / Waiting for a valid tracking value");
    }

    private ComputedSignalSample ResolvePose(ComputedSignalInputConfig input)
    {
        var matches = _poses.Value.Where(pose => pose.Matches(input.OscPath)).Take(2).ToArray();
        if (matches.Length == 0)
            return ComputedSignalSample.Invalid("等待完整姿态采样 / Waiting for complete pose samples");
        if (matches.Length != 1)
            return ComputedSignalSample.Invalid("请选择唯一姿态测量组和 OSC 来源 / Select one pose rig and OSC source");
        var pose = matches[0];
        if (!pose.Valid || !pose.Engaged)
            return ComputedSignalSample.Invalid(pose.Reason);
        if (!IsFresh(pose.TimestampMs))
            return ComputedSignalSample.Invalid("姿态采样已超时 / Pose samples have expired");
        if (!Enum.IsDefined(input.PoseMetric))
            return ComputedSignalSample.Invalid("请选择有效的姿态指标 / Choose a supported pose metric");
        var value = pose.GetMetric(input.PoseMetric);
        var quantity = input.PoseMetric switch
        {
            PoseMetric.Depth => ":NormalizedDepth",
            PoseMetric.Yaw or PoseMetric.Pitch or PoseMetric.Roll => ":Angle",
            _ => "",
        };
        return float.IsFinite(value)
            ? ComputedSignalSample.Success(value, pose.SourceKey, pose.TimestampMs,
                pose.CoordinateFrame + ":" + pose.Prefix + quantity)
            : ComputedSignalSample.Invalid("等待有效姿态值 / Waiting for a valid pose value");
    }

    private bool IsFresh(long timestampMs) => timestampMs <= _nowMs
        && _spatialMaxAgeMs > 0 && _nowMs - timestampMs <= _spatialMaxAgeMs;

    private sealed class SnapshotClock(long nowMs) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => DateTimeOffset.FromUnixTimeMilliseconds(nowMs);
    }
}
