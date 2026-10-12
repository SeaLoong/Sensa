using Sensa.Input.Osc;
using UnityBox.Sensa;

namespace Sensa.Signals;

public enum PoseMetric { Depth, OffsetX, OffsetY, Yaw, Pitch, Roll }

public readonly record struct PosePoint(double X, double Y, double Z)
{
    public double Length => Math.Sqrt(Dot(this, this));
    public static PosePoint operator +(PosePoint a, PosePoint b) => new(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
    public static PosePoint operator -(PosePoint a, PosePoint b) => new(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
    public static PosePoint operator *(PosePoint a, double b) => new(a.X * b, a.Y * b, a.Z * b);
    public static double Dot(PosePoint a, PosePoint b) => a.X * b.X + a.Y * b.Y + a.Z * b.Z;
    public static PosePoint Cross(PosePoint a, PosePoint b) => new(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X);
}

public sealed record MarkerFit(bool Valid, PosePoint Position, double Radius, double Residual, string Reason);

public sealed record PoseObservation
{
    public required string Key { get; init; }
    public required string Prefix { get; init; }
    public required string SourceKey { get; init; }
    public required string SourceLabel { get; init; }
    public required string Instance { get; init; }
    public required string Party { get; init; }
    public bool Valid { get; init; }
    public bool Engaged { get; init; }
    public string Reason { get; init; } = "等待完整的 24 路采样";
    public int SampleCount { get; init; }
    public long TimestampMs { get; init; }
    public PosePoint Root { get; init; }
    public PosePoint Tip { get; init; }
    public PosePoint Side { get; init; }
    public PosePoint Intersection { get; init; }
    public double Depth { get; init; }
    public double AxialDepth { get; init; }
    public double PenLength { get; init; }
    public double Yaw { get; init; }
    public double Pitch { get; init; }
    public double Roll { get; init; }
    public double Residual { get; init; }
    public double EstimatedMarkerRadius { get; init; }
    public float GetMetric(PoseMetric metric) => (float)(metric switch
    {
        PoseMetric.OffsetX => Intersection.X,
        PoseMetric.OffsetY => Intersection.Y,
        PoseMetric.Yaw => Yaw,
        PoseMetric.Pitch => Pitch,
        PoseMetric.Roll => Roll,
        _ => Depth,
    });
    public bool Matches(string pattern) => SensaPoseProtocol.Markers.Any(marker => Enumerable.Range(0, 8)
        .Any(index => OscParameterStore.MatchesPathPattern(pattern, $"{Prefix}/{marker}/A{index}")));
}

/// <summary>Eight sphere ranges locate each marker; three markers determine a straight-axis pose.
/// This estimates relative geometry, not sender identity or a deforming mesh surface.</summary>
public static class PoseReconstruction
{
    public static readonly PosePoint[] Anchors = Enumerable.Range(0, 8)
        .Select(i => new PosePoint(SensaPoseProtocol.AnchorX(i), SensaPoseProtocol.AnchorY(i), SensaPoseProtocol.AnchorZ(i))).ToArray();

    public static MarkerFit FitLocalTetrahedron(IReadOnlyList<float> proximity)
    {
        if (proximity.Count != 4) return new(false, default, 0, 0, "四面体采样不完整");
        if (proximity.Any(p => !float.IsFinite(p) || p <= .00001f || p >= .99999f))
            return new(false, default, 0, 0, "本地点离开采样体积或接收器饱和");
        var position = new PosePoint();
        Span<double> distances = stackalloc double[4];
        for (int i = 0; i < 4; i++)
        {
            distances[i] = SensaPoseProtocol.ReceiverRadius * (1d - proximity[i]) + SensaPoseProtocol.MarkerRadius;
            position += Anchors[SensaPoseProtocol.CompactAnchorIndex(i)] * (-distances[i] * distances[i]);
        }
        position *= 1d / (8d * SensaPoseProtocol.AnchorHalfSpan * SensaPoseProtocol.AnchorHalfSpan);
        double error = 0;
        for (int i = 0; i < 4; i++) error += Math.Pow((position - Anchors[SensaPoseProtocol.CompactAnchorIndex(i)]).Length - distances[i], 2);
        error = Math.Sqrt(error / 4);
        bool valid = error <= SensaPoseProtocol.MaximumFitResidual && position.Length <= .245;
        return new(valid, position, SensaPoseProtocol.MarkerRadius, error, valid ? "" : "四面体拟合不一致或超出范围；检查尺寸、缩放和同标签干扰");
    }

    public static MarkerFit FitMarker(IReadOnlyList<float> proximity)
    {
        if (proximity.Count != 8) return new(false, default, 0, 0, "采样不完整");
        if (proximity.Any(p => !float.IsFinite(p) || p <= 0.00001f || p >= .99999f))
            return new(false, default, 0, 0, "标记离开采样体积或接收器饱和");
        // For a spherical sender: surface distance = R*(1-proximity).
        // Sender radius is fitted as a nuisance parameter, accounting for differing avatar scales.
        var surface = proximity.Select(p => SensaPoseProtocol.ReceiverRadius * (1d - p)).ToArray();
        (PosePoint Position, double Error) At(double radius)
        {
            var position = new PosePoint();
            for (var i = 0; i < 8; i++)
                position += Anchors[i] * -Math.Pow(surface[i] + radius, 2);
            position *= 1d / (16d * SensaPoseProtocol.AnchorHalfSpan * SensaPoseProtocol.AnchorHalfSpan);
            var sum = 0d;
            for (var i = 0; i < 8; i++) sum += Math.Pow((position - Anchors[i]).Length - surface[i] - radius, 2);
            return (position, Math.Sqrt(sum / 8));
        }
        const double step = .00025;
        var bestRadius = 0d;
        var best = At(0);
        for (var i = 1; i <= 80; i++)
        {
            var fit = At(i * step);
            if (fit.Error < best.Error) { best = fit; bestRadius = i * step; }
        }
        var low = Math.Max(0, bestRadius - step); var high = Math.Min(.02, bestRadius + step);
        for (var i = 0; i < 24; i++)
        {
            var left = low + (high - low) / 3; var right = high - (high - low) / 3;
            if (At(left).Error < At(right).Error) high = right; else low = left;
        }
        bestRadius = (low + high) / 2; best = At(bestRadius);
        var valid = best.Error <= SensaPoseProtocol.MaximumFitResidual && best.Position.Length <= .245;
        return new(valid, best.Position, bestRadius, best.Error, valid ? "" : "几何拟合不一致或超出有效体积；检查混入的发送器与缩放");
    }

    public static PoseObservation[] Observe(IEnumerable<OscParameterStore.SnapshotEntry> entries, string? sourceKey = null)
    {
        var groups = entries.Where(e => (string.IsNullOrEmpty(sourceKey) || sourceKey == e.Entry.Source.Key)
                && e.Path.StartsWith(SensaPoseProtocol.Prefix + "/", StringComparison.Ordinal))
            .Select(e => (Sample: e, Parts: e.Path.Split('/')))
            .Where(e => e.Parts.Length == 7 && e.Parts[4] is "Others" or "Self"
                && SensaPoseProtocol.Markers.Contains(e.Parts[5]) && e.Parts[6].Length == 2
                && e.Parts[6][0] == 'A' && e.Parts[6][1] is >= '0' and <= '7')
            .GroupBy(e => (Source: e.Sample.Entry.Source.Key, Prefix: string.Join('/', e.Parts.Take(5))))
            .OrderBy(group => group.Key.Source, StringComparer.Ordinal).ThenBy(group => group.Key.Prefix, StringComparer.Ordinal).Take(64);
        return groups.Select(group =>
        {
            var first = group.First();
            var basis = new PoseObservation
            {
                Key = group.Key.Source + "|" + group.Key.Prefix, Prefix = group.Key.Prefix,
                SourceKey = group.Key.Source, SourceLabel = first.Sample.Entry.Source.Label,
                Instance = first.Parts[3], Party = first.Parts[4], SampleCount = group.Count(),
                TimestampMs = group.Max(s => s.Sample.Entry.TimestampMs),
            };
            var fits = new Dictionary<string, MarkerFit>();
            foreach (var marker in SensaPoseProtocol.Markers)
            {
                var samples = group.Where(e => e.Parts[5] == marker).OrderBy(e => e.Parts[6], StringComparer.Ordinal).ToArray();
                if (samples.Length != 8) return basis;
                var fit = FitMarker(samples.Select(e => e.Sample.Entry.Value.AsFloat()).ToArray());
                if (!fit.Valid) return basis with { Reason = marker + ": " + fit.Reason, Residual = fit.Residual };
                fits[marker] = fit;
            }
            var root = fits["Root"].Position; var tip = fits["Tip"].Position; var side = fits["Side"].Position;
            var axis = tip - root; var length = axis.Length;
            if (length < .02 || length > .5) return basis with { Reason = "根部与尖端间距异常" };
            axis *= 1 / length;
            if (Math.Abs(axis.Z) <= .001)
                return basis with { Root = root, Tip = tip, Side = side, Reason = "轴线与孔口平面平行，没有唯一交点" };
            var right = side - root;
            right -= axis * PosePoint.Dot(right, axis);
            if (right.Length < .005) return basis with { Reason = "侧向标记与轴线重合，无法确定扭转" };
            right *= 1 / right.Length;
            var referenceRight = PosePoint.Cross(new(0, 1, 0), axis);
            if (referenceRight.Length < .01) return basis with { Reason = "方向接近奇异位置" };
            referenceRight *= 1 / referenceRight.Length;
            var yaw = Math.Atan2(axis.X, axis.Z) * 180 / Math.PI;
            var pitch = Math.Asin(Math.Clamp(axis.Y, -1, 1)) * 180 / Math.PI;
            var roll = Math.Atan2(PosePoint.Dot(PosePoint.Cross(referenceRight, right), axis), PosePoint.Dot(referenceRight, right)) * 180 / Math.PI;
            var tilt = Math.Acos(Math.Clamp(axis.Z, -1, 1)) * 180 / Math.PI;
            var intersection = tip - axis * (tip.Z / axis.Z);
            var radialOffset = Math.Sqrt(intersection.X * intersection.X + intersection.Y * intersection.Y);
            var engaged = tilt <= SensaPoseProtocol.MaximumTiltDegrees && radialOffset <= SensaPoseProtocol.ApertureRadius && tip.Z > 0;
            return basis with
            {
                Valid = true, Engaged = engaged,
                Reason = engaged ? "空间定位有效" : tilt > SensaPoseProtocol.MaximumTiltDegrees ? "入射角过大或方向反转" : radialOffset > SensaPoseProtocol.ApertureRadius ? "轴线没有穿过孔口" : "尚未进入孔口",
                Root = root, Tip = tip, Side = side, Intersection = intersection, PenLength = length,
                Depth = engaged ? Math.Clamp(tip.Z / (length * axis.Z), 0, 1) : 0,
                AxialDepth = Math.Max(0, tip.Z), Yaw = yaw, Pitch = pitch, Roll = roll,
                Residual = fits.Values.Max(f => f.Residual), EstimatedMarkerRadius = fits.Values.Average(f => f.Radius),
            };
        }).ToArray();
    }
}
