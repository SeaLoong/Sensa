using Sensa.Motion;

namespace Sensa.Signals;

public readonly record struct SignalProcessSample(float Normalized, float Curved, float Output);

public readonly record struct SignalMixInput(SignalRole Role, float Value, float Priority);

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
    public float Process(float rawValue) => ProcessSample(rawValue).Output;

    public SignalProcessSample ProcessSample(float rawValue)
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
        float curved = ApplyCurve(normalised, _mapping.Curve);

        // 3. Remap to configured output positions
        var (outMin, outMax) = ResolveMappedRange(_mapping);
        float output = outMin + curved * (outMax - outMin);

        return new SignalProcessSample(normalised, curved, Math.Clamp(output, 0f, 1f));
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
    private const float PriorityEpsilon = 0.0001f;

    private readonly record struct SignalChoice(float Value, float Priority);

    private static bool IsCenteredRole(SignalRole role) => role is
        SignalRole.AngleX or
        SignalRole.AngleY or
        SignalRole.Twist or
        SignalRole.Surge or
        SignalRole.Sway or
        SignalRole.Auxiliary or
        SignalRole.Auxiliary1 or
        SignalRole.Auxiliary2;

    private static bool PreferCandidateByOutput(SignalRole role, SignalChoice current, SignalChoice candidate)
    {
        if (!IsCenteredRole(role))
            return candidate.Value > current.Value;

        float curDev = Math.Abs(current.Value - 0.5f);
        float canDev = Math.Abs(candidate.Value - 0.5f);
        return canDev > curDev;
    }

    private static bool PreferCandidateByPriority(SignalRole role, SignalChoice current, SignalChoice candidate)
    {
        if (candidate.Priority > current.Priority + PriorityEpsilon)
            return true;

        if (candidate.Priority < current.Priority - PriorityEpsilon)
            return false;

        return PreferCandidateByOutput(role, current, candidate);
    }

    private static MotionAxis? ResolveAxis(SignalRole role) => role switch
    {
        SignalRole.Depth => MotionAxis.L0,
        SignalRole.Surge => MotionAxis.L1,
        SignalRole.Sway => MotionAxis.L2,
        SignalRole.AngleX => MotionAxis.R1,
        SignalRole.AngleY => MotionAxis.R2,
        SignalRole.Twist => MotionAxis.R0,
        SignalRole.V0 => MotionAxis.V0,
        SignalRole.V1 => MotionAxis.V1,
        SignalRole.V2 => MotionAxis.V2,
        SignalRole.Auxiliary => MotionAxis.A0,
        SignalRole.Auxiliary1 => MotionAxis.A1,
        SignalRole.Auxiliary2 => MotionAxis.A2,
        _ => null,
    };

    private MotionPatch FusePatchCore<T>(
        IReadOnlyList<T> signals,
        Func<T, SignalRole> roleSelector,
        Func<T, float> valueSelector,
        Func<T, float> prioritySelector,
        bool usePriority)
    {
        var fused = new Dictionary<SignalRole, SignalChoice>();

        foreach (var signal in signals)
        {
            var role = roleSelector(signal);
            var candidate = new SignalChoice(valueSelector(signal), prioritySelector(signal));

            if (!fused.TryGetValue(role, out var current))
            {
                fused[role] = candidate;
                continue;
            }

            var shouldReplace = usePriority
                ? PreferCandidateByPriority(role, current, candidate)
                : PreferCandidateByOutput(role, current, candidate);

            if (shouldReplace)
                fused[role] = candidate;
        }

        var patch = new MotionPatch();
        foreach (var (role, choice) in fused)
        {
            var axis = ResolveAxis(role);
            if (axis.HasValue)
                patch.Set(axis.Value, choice.Value);
        }

        return patch;
    }

    /// <summary>
    /// Builds an axis patch containing only roles that are actually present in the input set.
    /// This allows OSC to control a subset of axes without pulling the rest back to defaults.
    /// </summary>
    public MotionPatch FusePatch(IReadOnlyList<(SignalRole role, float value)> signals) =>
        FusePatchCore(signals, signal => signal.role, signal => signal.value, signal => signal.value, usePriority: false);

    public MotionPatch FusePatch(IReadOnlyList<SignalMixInput> signals) =>
        FusePatchCore(signals, signal => signal.Role, signal => signal.Value, signal => signal.Priority, usePriority: true);

    /// <summary>Legacy full-command fusion, now implemented via patch application on a neutral pose.</summary>
    public MotionFrame Fuse(IReadOnlyList<(SignalRole role, float value)> signals, double deltaMs)
    {
        var patch = FusePatch(signals);
        return MotionAxisHelper.ApplyPatch(MotionAxisHelper.CreateNeutralFrame(deltaMs), patch, deltaMs);
    }

    public MotionFrame Fuse(IReadOnlyList<SignalMixInput> signals, double deltaMs)
    {
        var patch = FusePatch(signals);
        return MotionAxisHelper.ApplyPatch(MotionAxisHelper.CreateNeutralFrame(deltaMs), patch, deltaMs);
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  VelocityEstimator — maintains per-axis velocity for TCode speed mode
// ═══════════════════════════════════════════════════════════════════════

public sealed class AxisVelocityTracker
{
    private const double OutputUnitsPerStroke = 999d;
    private const double SpeedWindowMs = 100d;

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
        var deltaUnits = deltaPos * OutputUnitsPerStroke;
        var velocity = (deltaUnits * SpeedWindowMs) / dtMs;

        _lastPos = newPos;

        if (velocity <= 0d)
            return 0;

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
