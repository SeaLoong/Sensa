using Sensa.Motion;

namespace Sensa.Signals;

/// <summary>
/// Processes a single OSC parameter through the signal pipeline:
///   calibrate [± invert] → curve → mapped positions
/// InvertDirection reverses the calibration range before curve mapping.
/// </summary>
public sealed class SignalChannelProcessor
{
    private readonly SignalMapping _mapping;
    private float _observedMin = float.MaxValue;
    private float _observedMax = float.MinValue;

    public SignalChannelProcessor(SignalMapping mapping) => _mapping = mapping;

    public SignalMapping Mapping => _mapping;

    /// <summary>Observed min/max for auto-calibration suggestion.</summary>
    public float ObservedMin => _observedMin;
    public float ObservedMax => _observedMax;

    /// <summary>
    /// Process a raw VRChat parameter value and return normalised [0,1] output.
    /// Call once per frame from the main loop.
    /// </summary>
    public float Process(float rawValue)
    {
        // Track for auto-calibration
        if (rawValue < _observedMin) _observedMin = rawValue;
        if (rawValue > _observedMax) _observedMax = rawValue;

        // 1. Calibrate to [0,1]; InvertDirection swaps the range endpoints.
        float vrcMin = _mapping.InvertDirection ? _mapping.VrchatMax : _mapping.VrchatMin;
        float vrcMax = _mapping.InvertDirection ? _mapping.VrchatMin : _mapping.VrchatMax;
        float range = vrcMax - vrcMin;
        float normalised = Math.Abs(range) < 0.0001f
            ? 0f
            : Math.Clamp((rawValue - vrcMin) / range, 0f, 1f);

        // 2. Non-linear curve
        float v = normalised;
        v = ApplyCurve(v, _mapping.Curve);

        // 3. Remap to configured output positions
        var (outMin, outMax) = ResolveMappedRange(_mapping);
        v = outMin + v * (outMax - outMin);

        return Math.Clamp(v, 0f, 1f);
    }

    /// <summary>Reset observed calibration range (call when the avatar changes).</summary>
    public void Reset()
    {
        _observedMin = float.MaxValue;
        _observedMax = float.MinValue;
    }

    public void ResetCalibration()
    {
        _observedMin = float.MaxValue;
        _observedMax = float.MinValue;
    }

    private static float ApplyCurve(float v, SignalCurve curve) => curve switch
    {
        SignalCurve.EaseIn  => v * v,
        SignalCurve.EaseOut => 1f - (1f - v) * (1f - v),
        SignalCurve.SCurve  => v < 0.5f ? 2f * v * v : 1f - 2f * (1f - v) * (1f - v),
        _                 => v,  // Linear
    };

    private static (float Min, float Max) ResolveMappedRange(SignalMapping mapping)
    {
        var mappedMin = Math.Clamp(mapping.MappedMin ?? 0, 0, 999);
        var mappedMax = Math.Clamp(mapping.MappedMax ?? 999, 0, 999);
        if (mappedMin > mappedMax)
            (mappedMin, mappedMax) = (mappedMax, mappedMin);

        return (mappedMin / 1000f, mappedMax / 1000f);
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  SignalMixer — merges N processed signals into one MotionPatch
// ═══════════════════════════════════════════════════════════════════════

public sealed class SignalMixer
{
    private static float FuseCentered(float current, float candidate)
    {
        // For axes centred at 0.5: pick the one furthest from centre
        float curDev = Math.Abs(current - 0.5f);
        float canDev = Math.Abs(candidate - 0.5f);
        return canDev > curDev ? candidate : current;
    }

    private static float FuseMax(float current, float candidate) =>
        candidate > current ? candidate : current;

    /// <summary>
    /// Builds an axis patch containing only roles that are actually present in the input set.
    /// This allows OSC to control a subset of axes without pulling the rest back to defaults.
    /// </summary>
    public MotionPatch FusePatch(IReadOnlyList<(SignalRole role, float value)> signals)
    {
        float depth   = 0f;
        float angleX  = 0.5f;
        float angleY  = 0.5f;
        float twist   = 0.5f;
        float surge   = 0.5f;
        float sway    = 0.5f;
        float v0      = 0f;
        float v1      = 0f;
        float v2      = 0f;
        float aux     = 0.5f;

        var hasDepth  = false;
        var hasAngleX = false;
        var hasAngleY = false;
        var hasTwist  = false;
        var hasSurge  = false;
        var hasSway   = false;
        var hasV0     = false;
        var hasV1     = false;
        var hasV2     = false;
        var hasAux    = false;

        foreach (var (role, value) in signals)
        {
            switch (role)
            {
                case SignalRole.Depth:
                    hasDepth = true;
                    depth = FuseMax(depth, value);
                    break;
                case SignalRole.AngleX:
                    hasAngleX = true;
                    angleX = FuseCentered(angleX, value);
                    break;
                case SignalRole.AngleY:
                    hasAngleY = true;
                    angleY = FuseCentered(angleY, value);
                    break;
                case SignalRole.Twist:
                    hasTwist = true;
                    twist = FuseCentered(twist, value);
                    break;
                case SignalRole.Surge:
                    hasSurge = true;
                    surge = FuseCentered(surge, value);
                    break;
                case SignalRole.Sway:
                    hasSway = true;
                    sway = FuseCentered(sway, value);
                    break;
                case SignalRole.V0:
                    hasV0 = true;
                    v0 = FuseMax(v0, value);
                    break;
                case SignalRole.V1:
                    hasV1 = true;
                    v1 = FuseMax(v1, value);
                    break;
                case SignalRole.V2:
                    hasV2 = true;
                    v2 = FuseMax(v2, value);
                    break;
                case SignalRole.Auxiliary:
                    hasAux = true;
                    aux = FuseCentered(aux, value);
                    break;
            }
        }

        var patch = new MotionPatch();
        if (hasDepth) patch.Set(MotionAxis.L0, depth);
        if (hasSurge) patch.Set(MotionAxis.L1, surge);
        if (hasSway) patch.Set(MotionAxis.L2, sway);
        if (hasAngleX) patch.Set(MotionAxis.R1, angleX);
        if (hasAngleY) patch.Set(MotionAxis.R2, angleY);
        if (hasTwist) patch.Set(MotionAxis.R0, twist);
        if (hasV0) patch.Set(MotionAxis.V0, v0);
        if (hasV1) patch.Set(MotionAxis.V1, v1);
        if (hasV2) patch.Set(MotionAxis.V2, v2);
        if (hasAux) patch.Set(MotionAxis.A0, aux);
        return patch;
    }

    /// <summary>Legacy full-command fusion, now implemented via patch application on a neutral pose.</summary>
    public MotionFrame Fuse(IReadOnlyList<(SignalRole role, float value)> signals, double deltaMs)
    {
        var patch = FusePatch(signals);
        return MotionAxisHelper.ApplyPatch(MotionAxisHelper.CreateNeutralFrame(deltaMs), patch, deltaMs);
    }

    private static float Max(float a, float b) => a > b ? a : b;
}

// ═══════════════════════════════════════════════════════════════════════
//  VelocityEstimator — maintains per-axis velocity for TCode speed mode
// ═══════════════════════════════════════════════════════════════════════

public sealed class AxisVelocityTracker
{
    private float _lastPos    = 0.5f;
    private bool  _hasLastPos;

    /// <summary>
    /// Call on each emitted command with the new normalised position [0,1] and the elapsed time since
    /// the last emitted command.
    ///
    /// TCode S uses axis-value change per 100ms. A full-stroke move in 1 second therefore maps to 100.
    /// </summary>
    public int Estimate(float newPos, double deltaMs, int maxVelocity = 200)
    {
        if (!_hasLastPos)
        {
            _lastPos    = newPos;
            _hasLastPos = true;
            return 0;
        }

        if (maxVelocity <= 0)
        {
            _lastPos = newPos;
            return 0;
        }

        var dtMs = Math.Max(deltaMs, 1d);
        var deltaPos = Math.Abs(newPos - _lastPos);
        var velocity = (deltaPos * 1000d) / (dtMs / 100d);

        _lastPos = newPos;

        if (velocity <= 0f) return 0;

        return (int)Math.Min(Math.Ceiling(velocity), maxVelocity);
    }

    public void Reset(float pos = 0.5f)
    {
        _lastPos    = pos;
        _hasLastPos = false;
    }

    public void Sync(float pos)
    {
        _lastPos = pos;
        _hasLastPos = true;
    }
}

// ═══════════════════════════════════════════════════════════════════════
