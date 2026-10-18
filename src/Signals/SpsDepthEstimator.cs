namespace Sensa.Signals;

/// <summary>
/// VRCFury's one-metre receivers observe a 1 cm root sphere and a root-centred
/// length sphere. Their unsaturated difference estimates length; saturation
/// permits a radial fraction. This is not axial insertion or mesh position.
/// 一米接收球观测 1 cm 根球和根部同心长度球：未饱和差值估长，饱和后估算径向比例。
/// The caller must isolate OSC source, complete instance path and Self/Others.
/// This grouping cannot prove the same Contact Sender or frame.
/// 调用方隔离 OSC 来源、完整实例路径与 Self/Others；分组不证明同一 Sender 或同帧。
/// </summary>
public sealed class SpsDepthEstimator
{
    private float _length;
    private long? _lastLearnedTipSequence;

    public void Reset()
    {
        _length = 0;
        _lastLearnedTipSequence = null;
    }

    public float Process(float root, float tip, long? tipSequence = null)
    {
        if (!float.IsFinite(root) || !float.IsFinite(tip)
            || root <= .01f || tip <= .01f || root > 1 || tip > 1)
        { Reset(); return 0; }
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
