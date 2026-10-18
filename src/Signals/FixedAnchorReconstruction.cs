using UnityBox.Sensa;

namespace Sensa.Signals;

/// <summary>Shared fixed Avatar-root geometry. Fits one known-radius root marker, not pose or sender identity.
/// 固定 Avatar 根坐标几何：只解已知半径的根点，不推断姿态或发送器身份。</summary>
public static class FixedAnchorReconstruction
{
    public static MarkerFit Fit(IReadOnlyList<float> proximity)
    {
        if (proximity.Count != SensaFixedAnchorProtocol.AnchorCount)
            return Invalid("需要四个固定锚点 / Four fixed anchors are required");
        if (proximity.Any(value => !float.IsFinite(value)
                || value <= SensaFixedAnchorProtocol.MinimumProximity
                || value >= SensaFixedAnchorProtocol.MaximumProximity))
            return Invalid("根点超出共同覆盖区域或采样饱和 / Root is outside common coverage or a sample is saturated");

        var center = new PosePoint(SensaFixedAnchorProtocol.CenterX,
            SensaFixedAnchorProtocol.CenterY, SensaFixedAnchorProtocol.CenterZ);
        var offset = new PosePoint();
        Span<double> distances = stackalloc double[SensaFixedAnchorProtocol.AnchorCount];
        for (var index = 0; index < distances.Length; index++)
        {
            var anchor = Anchor(index);
            distances[index] = SensaFixedAnchorProtocol.ReceiverRadius * (1d - proximity[index])
                + SensaFixedAnchorProtocol.MarkerRadius;
            offset += (anchor - center) * (-distances[index] * distances[index]);
        }
        offset *= 1d / (8d * SensaFixedAnchorProtocol.AnchorHalfSpan * SensaFixedAnchorProtocol.AnchorHalfSpan);
        var position = center + offset;
        double squaredError = 0;
        for (var index = 0; index < distances.Length; index++)
            squaredError += Math.Pow((position - Anchor(index)).Length - distances[index], 2);
        var residual = Math.Sqrt(squaredError / distances.Length);
        var inBounds = Math.Abs(offset.X) <= SensaFixedAnchorProtocol.PositionHalfRange
            && Math.Abs(offset.Y) <= SensaFixedAnchorProtocol.PositionHalfRange
            && Math.Abs(offset.Z) <= SensaFixedAnchorProtocol.PositionHalfRange;
        return new(inBounds && residual <= SensaFixedAnchorProtocol.MaximumFitResidual,
            position, SensaFixedAnchorProtocol.MarkerRadius, residual,
            inBounds && residual <= SensaFixedAnchorProtocol.MaximumFitResidual ? ""
                : "固定锚点拟合不一致；检查目标、缩放和丢包 / Fixed-anchor fit is inconsistent; check target, scaling and packet loss");
    }

    public static PosePoint Anchor(int index) => new(SensaFixedAnchorProtocol.AnchorX(index),
        SensaFixedAnchorProtocol.AnchorY(index), SensaFixedAnchorProtocol.AnchorZ(index));

    private static MarkerFit Invalid(string reason) => new(false, default,
        SensaFixedAnchorProtocol.MarkerRadius, 0, reason);
}
