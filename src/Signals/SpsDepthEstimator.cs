namespace Sensa.Signals;

/// <summary>
/// VRCFury NewRoot/NewTip contacts have a one metre radius. Learn the difference
/// while the tip is outside; once tip proximity saturates, root distance gives
/// the remaining exposed length. Pairs must be from the same socket and sender.
/// </summary>
public sealed class SpsDepthEstimator
{
    private float _length;
    public float Process(float root, float tip)
    {
        if (!float.IsFinite(root) || !float.IsFinite(tip)) return 0;
        if (root <= .01f || tip <= .01f) { _length = 0; return 0; }
        if (tip < .99f && tip - root >= .02f)
            _length = Math.Max(_length, tip - root);
        if (tip < .99f || _length < .02f) return 0;
        return Math.Clamp(1 - (1 - root) / _length, 0, 1);
    }
}
