using Sensa.Core;

namespace Sensa.Core;

/// <summary>
/// Processes a single OSC parameter through the signal pipeline:
///   calibrate [± invert] → EMA smooth → dead zone → curve → mapped positions
/// InvertDirection reverses the calibration range so that "no signal"
/// is always near 0 before the dead zone is applied.
/// Thread-safe: state (EMA value) is owned by each instance.
/// </summary>
public sealed class SignalProcessor
{
    private readonly SignalConfig _cfg;
    private float _emaValue = 0f;
    private float _observedMin = float.MaxValue;
    private float _observedMax = float.MinValue;

    public SignalProcessor(SignalConfig cfg) => _cfg = cfg;

    public SignalConfig Config => _cfg;

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

        // 1. Calibrate to [0,1]; InvertDirection swaps the range endpoints so
        //    that the dead zone (applied later) always masks "no signal" → 0.
        float vrcMin = _cfg.InvertDirection ? _cfg.VrchatMax : _cfg.VrchatMin;
        float vrcMax = _cfg.InvertDirection ? _cfg.VrchatMin : _cfg.VrchatMax;
        float range = vrcMax - vrcMin;
        float normalised = Math.Abs(range) < 0.0001f
            ? 0f
            : Math.Clamp((rawValue - vrcMin) / range, 0f, 1f);

        // 2. EMA smoothing: v = α*new + (1-α)*old
        _emaValue = _cfg.SmoothingAlpha * normalised + (1f - _cfg.SmoothingAlpha) * _emaValue;
        float v = _emaValue;

        // 3. Dead zone
        if (v < _cfg.DeadZone) v = 0f;

        // 4. Non-linear curve
        v = ApplyCurve(v, _cfg.Curve);

        // 5. Remap to configured output positions
        var (outMin, outMax) = ResolveMappedRange(_cfg);
        v = outMin + v * (outMax - outMin);

        return Math.Clamp(v, 0f, 1f);
    }

    /// <summary>Reset EMA state and observed calibration range (call when the avatar changes).</summary>
    public void Reset()
    {
        _emaValue    = 0f;
        _observedMin = float.MaxValue;
        _observedMax = float.MinValue;
    }

    public void ResetCalibration()
    {
        _observedMin = float.MaxValue;
        _observedMax = float.MinValue;
    }

    private static float ApplyCurve(float v, CurveType curve) => curve switch
    {
        CurveType.EaseIn  => v * v,
        CurveType.EaseOut => 1f - (1f - v) * (1f - v),
        CurveType.SCurve  => v < 0.5f ? 2f * v * v : 1f - 2f * (1f - v) * (1f - v),
        _                 => v,  // Linear
    };

    private static (float Min, float Max) ResolveMappedRange(SignalConfig config)
    {
        if (config.MappedMin.HasValue || config.MappedMax.HasValue)
        {
            var mappedMin = Math.Clamp(config.MappedMin ?? 0, 0, 999);
            var mappedMax = Math.Clamp(config.MappedMax ?? 999, 0, 999);
            if (mappedMin > mappedMax)
                (mappedMin, mappedMax) = (mappedMax, mappedMin);

            return (mappedMin / 1000f, mappedMax / 1000f);
        }

        var legacyMin = Math.Clamp(config.OutputMin, 0f, 1f);
        var legacyMax = Math.Clamp(config.OutputMax, legacyMin, 1f);
        return (legacyMin, legacyMax);
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  SignalFusion — merges N processed signals into one DeviceCommand
// ═══════════════════════════════════════════════════════════════════════

public sealed class SignalFusion
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
    public DeviceAxisPatch FusePatch(IReadOnlyList<(SignalRole role, float value)> signals)
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

        var patch = new DeviceAxisPatch();
        if (hasDepth) patch.Set(DeviceAxis.L0, depth);
        if (hasSurge) patch.Set(DeviceAxis.L1, surge);
        if (hasSway) patch.Set(DeviceAxis.L2, sway);
        if (hasAngleX) patch.Set(DeviceAxis.R1, angleX);
        if (hasAngleY) patch.Set(DeviceAxis.R2, angleY);
        if (hasTwist) patch.Set(DeviceAxis.R0, twist);
        if (hasV0) patch.Set(DeviceAxis.V0, v0);
        if (hasV1) patch.Set(DeviceAxis.V1, v1);
        if (hasV2) patch.Set(DeviceAxis.V2, v2);
        if (hasAux) patch.Set(DeviceAxis.A0, aux);
        return patch;
    }

    /// <summary>Legacy full-command fusion, now implemented via patch application on a neutral pose.</summary>
    public DeviceCommand Fuse(IReadOnlyList<(SignalRole role, float value)> signals, double deltaMs)
    {
        var patch = FusePatch(signals);
        return DeviceAxisHelpers.ApplyPatch(DeviceAxisHelpers.CreateNeutralCommand(deltaMs), patch, deltaMs);
    }

    private static float Max(float a, float b) => a > b ? a : b;
}

// ═══════════════════════════════════════════════════════════════════════
//  VelocityEstimator — maintains per-axis velocity for TCode speed mode
// ═══════════════════════════════════════════════════════════════════════

public sealed class VelocityEstimator
{
    private float _lastPos    = 0.5f;
    private bool  _hasLastPos;

    /// <summary>
    /// Call on each emitted command with the new normalised position [0,1] and the elapsed time since
    /// the last emitted command.
    ///
    /// Uses the same scale as OSR-VRChat / common TCode tooling: normalised delta converted to a
    /// 0-1000 axis magnitude and divided by elapsed seconds.
    /// </summary>
    public int Estimate(float newPos, double deltaMs, int maxVelocity = 2000)
    {
        if (!_hasLastPos)
        {
            _lastPos    = newPos;
            _hasLastPos = true;
            return 0;
        }

        var dtMs = Math.Max(deltaMs, 1d);
        var deltaPos = Math.Abs(newPos - _lastPos);
        var velocity = (deltaPos * 1000d) / (dtMs / 1000d);

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
