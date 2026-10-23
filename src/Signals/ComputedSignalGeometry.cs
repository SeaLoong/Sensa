namespace Sensa.Signals;

public sealed partial class ComputedSignalEvaluator
{
    public const double MinimumPlaneAxisCrossRatio = 1e-4;
    private static readonly (string Name, string Suffix)[] GeometryQuantities =
    [
        ("Basis", ":Basis"), ("Velocity", ":Velocity"), ("Scale", ":Scale"),
        ("Angle", ":Angle"), ("ProximityRate", ":ProximityRate"), ("NormalizedDepth", ":NormalizedDepth"),
    ];
    private static bool IsGeometry(ComputedSignalOperation operation) => operation is
        ComputedSignalOperation.PointDistance or ComputedSignalOperation.PlaneDepth
        or ComputedSignalOperation.PlaneOffset or ComputedSignalOperation.VectorAngle
        or ComputedSignalOperation.PlaneAngle or ComputedSignalOperation.PlaneDepthFromAxes
        or ComputedSignalOperation.PlaneOffsetFromAxes;

    private static bool TryGeometryValue(ComputedSignalOperation operation, double[] values,
        out double value, out string reason)
    {
        value = 0;
        reason = "";
        static PosePoint Vector(double[] items, int offset) => new(items[offset], items[offset + 1], items[offset + 2]);
        static bool Normalize(PosePoint vector, out PosePoint unit)
        {
            var length = vector.Length;
            unit = length > 0 ? vector * (1 / length) : default;
            return length > 0 && double.IsFinite(length);
        }
        var first = Vector(values, 0);
        var second = Vector(values, 3);
        if (operation == ComputedSignalOperation.PointDistance)
        {
            value = (first - second).Length;
            return true;
        }
        if (operation is ComputedSignalOperation.VectorAngle or ComputedSignalOperation.PlaneAngle)
        {
            if (!Normalize(first, out var a) || !Normalize(second, out var b))
            {
                reason = "夹角需要两个非零向量 / Angle calculations require two non-zero vectors";
                return false;
            }
            var dot = PosePoint.Dot(a, b);
            var cross = PosePoint.Cross(a, b).Length;
            value = (operation == ComputedSignalOperation.VectorAngle ? Math.Atan2(cross, dot) : Math.Atan2(dot, cross))
                * 180 / Math.PI;
            return true;
        }
        var normal = Vector(values, 6);
        if (operation is ComputedSignalOperation.PlaneDepthFromAxes or ComputedSignalOperation.PlaneOffsetFromAxes)
        {
            // Normalize each tangent first. Their lengths do not change the plane,
            // and avoiding the raw cross product protects very large/small axes.
            if (!Normalize(normal, out var u) || !Normalize(Vector(values, 9), out var v))
            {
                reason = "平面需要两条非零且不近似共线的轴 / A plane requires two non-zero axes that are not nearly collinear";
                return false;
            }
            var cross = PosePoint.Cross(u, v);
            if (cross.Length <= MinimumPlaneAxisCrossRatio)
            {
                reason = "两条平面轴接近共线，无法确定可靠法向 / The plane axes are nearly collinear and cannot determine a reliable normal";
                return false;
            }
            normal = cross * (1 / cross.Length);
        }
        else if (!Normalize(normal, out normal))
        {
            reason = "请为平面选择非零法向 / Choose a non-zero plane normal";
            return false;
        }
        var delta = first - second;
        var depth = PosePoint.Dot(delta, normal);
        value = operation is ComputedSignalOperation.PlaneDepth or ComputedSignalOperation.PlaneDepthFromAxes
            ? depth : (delta - normal * depth).Length;
        return true;
    }

    private readonly record struct VectorFrame(string? Coordinate, string Quantity);

    private static bool TryGeometryFrame(ComputedSignalOperation operation, ComputedSignalSample[] samples,
        out string? frame)
    {
        frame = null;
        var hasPositions = operation is not (ComputedSignalOperation.VectorAngle or ComputedSignalOperation.PlaneAngle);
        if (hasPositions)
        {
            if (!ReadFrame(samples, 0, false, out var point) || !ReadFrame(samples, 3, false, out var origin)
                || point.Coordinate is not null && origin.Coordinate is not null && point.Coordinate != origin.Coordinate)
                return false;
            frame = point.Coordinate ?? origin.Coordinate;
            if (operation == ComputedSignalOperation.PointDistance) return true;
        }
        var start = hasPositions ? 6 : 0;
        var directions = new List<VectorFrame>();
        for (var index = start; index < samples.Length; index += 3)
        {
            if (!ReadFrame(samples, index, true, out var direction)) return false;
            directions.Add(direction);
        }
        // Positional units determine depth/offset units. Without positions, prefer
        // the measured vector's frame over an explicitly dimensionless Basis.
        frame ??= directions.FirstOrDefault(direction => direction.Coordinate is not null && direction.Quantity != "Basis").Coordinate
            ?? directions.FirstOrDefault(direction => direction.Coordinate is not null).Coordinate;
        foreach (var direction in directions)
        {
            if (direction.Coordinate is null || direction.Coordinate == frame) continue;
            // AvatarRootLocal and AvatarRootMeters have identical rotated axes.
            // Only an explicitly dimensionless basis can cross their unit boundary;
            // positions, velocities and arbitrary reference frames remain distinct.
            if (direction.Quantity == "Basis" && IsAvatarRootFrame(frame) && IsAvatarRootFrame(direction.Coordinate)) continue;
            return false;
        }
        return true;
    }

    private static bool IsAvatarRootFrame(string? frame) => frame is "AvatarRootLocal" or "AvatarRootMeters";

    private static bool ReadFrame(ComputedSignalSample[] samples, int start, bool direction, out VectorFrame result)
    {
        string? tagged = null;
        for (var index = start; index < start + 3; index++)
        {
            var current = samples[index].CoordinateFrame;
            if (string.IsNullOrEmpty(current)) continue;
            if (tagged is not null && current != tagged) { result = default; return false; }
            tagged = current;
        }
        if (tagged is null) { result = new(null, ""); return true; }
        foreach (var (quantity, suffix) in GeometryQuantities)
        {
            if (tagged != quantity && !tagged.EndsWith(suffix, StringComparison.Ordinal)) continue;
            result = new(tagged == quantity ? null : tagged[..^suffix.Length], quantity);
            return direction && quantity is ("Basis" or "Velocity");
        }
        result = new(tagged, "");
        return true;
    }
}
