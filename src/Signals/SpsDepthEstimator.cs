namespace Sensa.Signals;

/// <summary>
/// VRCFury NewRoot/NewTip contacts have a one metre radius. Learn the difference
/// while the length sphere is outside; once its proximity saturates, root distance
/// approximates exposed length after restoring the 1 cm root sender radius.
/// NewTip is a root-centred length sphere, not a tip
/// landmark; this radial estimate does not correct lateral or angular offsets.
/// Pairs must be from the same socket and sender.
/// </summary>
public sealed class SpsDepthEstimator
{
    private float _length;
    public float Process(float root, float tip)
    {
        if (!float.IsFinite(root) || !float.IsFinite(tip)) return 0;
        if (root <= .01f || tip <= .01f) { _length = 0; return 0; }
        // Native VRCFury Root is a 1 cm sphere; proximity measures distance to
        // its surface. Omitting it biases both learned length and exposed length.
        const float rootRadius = .01f;
        if (tip < .99f && tip - root + rootRadius >= .02f)
            _length = Math.Max(_length, tip - root + rootRadius);
        if (tip < .99f || _length < .02f) return 0;
        return Math.Clamp(1 - (1 - root + rootRadius) / _length, 0, 1);
    }
}
