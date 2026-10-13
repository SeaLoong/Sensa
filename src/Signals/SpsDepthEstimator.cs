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
    private long? _lastLearnedTipSequence;
    public float Process(float root, float tip, long? tipSequence = null)
    {
        if (!float.IsFinite(root) || !float.IsFinite(tip)
            || root <= .01f || tip <= .01f || root > 1 || tip > 1)
        { _length = 0; _lastLearnedTipSequence = null; return 0; }
        bool canLearn = !tipSequence.HasValue || tipSequence != _lastLearnedTipSequence;
        if (tip < root)
        {
            // A new root may arrive before its corresponding tip OSC delta.
            if (canLearn) { _length = 0; _lastLearnedTipSequence = tipSequence; }
            return 0;
        }
        // Native VRCFury Root is a 1 cm sphere; proximity measures distance to
        // its surface. Omitting it biases both learned length and exposed length.
        const float rootRadius = .01f;
        if (tip < .99f && canLearn)
        {
            // A different plug can enter the same socket without an empty OSC
            // sample between them. Do not keep the largest length ever observed.
            var observedLength = tip - root + rootRadius;
            _length = observedLength >= .02f ? observedLength : 0;
            _lastLearnedTipSequence = tipSequence;
        }
        if (tip < .99f || _length < .02f) return 0;
        return Math.Clamp(1 - (1 - root + rootRadius) / _length, 0, 1);
    }
}
