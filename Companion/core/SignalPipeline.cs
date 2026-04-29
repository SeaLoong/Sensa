using Sensa.Core;

namespace Sensa.Core;

/// <summary>
/// Processes a single OSC parameter through the signal pipeline:
///   calibrate [± invert] → EMA smooth → dead zone → curve
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
}

// ═══════════════════════════════════════════════════════════════════════
//  SignalFusion — merges N processed signals into one DeviceCommand
// ═══════════════════════════════════════════════════════════════════════

public sealed class SignalFusion
{
    /// <summary>Called each frame with all processed signal values indexed by role.</summary>
    public DeviceCommand Fuse(IReadOnlyList<(SignalRole role, float value)> signals, double deltaMs)
    {
        float depth   = 0f;
        float angleX  = 0f;
        float angleY  = 0f;
        float twist   = 0f;
        float surge   = 0f;
        float sway    = 0f;
        float vibrate = 0f;
        bool  gate    = true;

        foreach (var (role, value) in signals)
        {
            switch (role)
            {
                case SignalRole.Depth:
                    depth = Max(depth, value);
                    break;
                case SignalRole.AngleX:
                    angleX = value;
                    break;
                case SignalRole.AngleY:
                    angleY = value;
                    break;
                case SignalRole.Twist:
                    twist = value;
                    break;
                case SignalRole.Surge:
                    surge = value;
                    break;
                case SignalRole.Sway:
                    sway = value;
                    break;
                case SignalRole.Vibrate:
                    vibrate = Max(vibrate, value);
                    break;
                case SignalRole.Gate:
                    if (value < 0.5f) gate = false;
                    break;
            }
        }

        // Rotation and linear-offset axes are centred at 0.5.
        // Input signals [0,1] are scaled to half-range so 0→0.5 and 1→1.0.
        // Negative (opposite-direction) deflection requires configuring a second
        // signal with Invert=true for that axis.
        return new DeviceCommand
        {
            L0       = depth,
            R0       = 0.5f + angleX * 0.5f,
            R1       = 0.5f + angleY * 0.5f,
            R2       = 0.5f + twist  * 0.5f,
            L1       = 0.5f + surge  * 0.5f,
            L2       = 0.5f + sway   * 0.5f,
            Vibrate  = vibrate,
            GateOpen = gate,
            DeltaMs  = deltaMs,
        };
    }

    private static float Max(float a, float b) => a > b ? a : b;
}

// ═══════════════════════════════════════════════════════════════════════
//  VelocityEstimator — maintains per-axis velocity for TCode speed mode
// ═══════════════════════════════════════════════════════════════════════

public sealed class VelocityEstimator
{
    private float _lastPos    = 0.5f;
    private long  _lastTimeMs = -1;  // -1 = not yet initialised

    /// <summary>
    /// Call each update with the new normalised position [0,1].
    /// Returns velocity clamped to maxVelocity.  Returns 0 on the first call.
    /// </summary>
    public int Estimate(float newPos, int maxVelocity = 1400)
    {
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // First call: record baseline, return 0 (no prior data)
        if (_lastTimeMs < 0)
        {
            _lastPos    = newPos;
            _lastTimeMs = now;
            return 0;
        }

        long dt = now - _lastTimeMs;
        if (dt < 1) dt = 1;

        float deltaPos = newPos - _lastPos;
        float velocity = Math.Abs(deltaPos / dt) * 1000f;

        _lastPos    = newPos;
        _lastTimeMs = now;

        return (int)Math.Min(velocity, maxVelocity);
    }

    public void Reset(float pos = 0.5f)
    {
        _lastPos    = pos;
        _lastTimeMs = -1;  // will re-initialise on next Estimate() call
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  RhythmDetector — sliding-window peak/valley BPM estimator (optional)
// ═══════════════════════════════════════════════════════════════════════

public sealed class RhythmDetector
{
    private readonly Queue<long> _window = new();  // stores only timestamps; float values are not needed
    private readonly List<long> _peakTimes = new();

    public float   CurrentBpm   { get; private set; }
    public float   RhythmPhase  { get; private set; } // 0..1 over one beat

    private float _lastValue  = 0f;
    private bool  _rising     = false;
    private long  _lastBeatMs = 0;

    public void Feed(float value, int windowMs = 3000, float minBpm = 5f, float maxBpm = 300f)
    {
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        _window.Enqueue(now);

        // Trim old entries
        while (_window.Count > 0 && now - _window.Peek() > windowMs)
            _window.Dequeue();
        while (_peakTimes.Count > 0 && now - _peakTimes[0] > windowMs)
            _peakTimes.RemoveAt(0);

        // Simple peak detection: transition from rising to falling
        bool nowRising = value > _lastValue + 0.005f;
        bool nowFalling = value < _lastValue - 0.005f;

        if (_rising && nowFalling)
        {
            _peakTimes.Add(now);
            _lastBeatMs = now;
        }

        if (nowRising)  _rising = true;
        if (nowFalling) _rising = false;
        _lastValue = value;

        // BPM from inter-peak intervals
        if (_peakTimes.Count >= 2)
        {
            double totalMs = _peakTimes[^1] - _peakTimes[0];
            double intervals = _peakTimes.Count - 1;
            float avgIntervalSec = (float)(totalMs / intervals / 1000.0);
            float bpm = avgIntervalSec > 0 ? 60f / avgIntervalSec : 0f;
            // Only accept readings within the configured valid range.
            // If out of range (too fast / too slow) treat as no valid rhythm.
            CurrentBpm = (bpm >= minBpm && bpm <= maxBpm) ? bpm : 0f;
        }
        else
        {
            // Fewer than two peaks in the window → rhythm lost
            CurrentBpm = 0f;
        }

        // Phase within current beat
        if (CurrentBpm > 0 && _lastBeatMs > 0)
        {
            float beatMs = 60000f / CurrentBpm;
            RhythmPhase = Math.Clamp((now - _lastBeatMs) / beatMs, 0f, 1f);
        }
    }

    public void Reset()
    {
        _window.Clear();
        _peakTimes.Clear();
        CurrentBpm  = 0;
        RhythmPhase = 0;
        _lastValue  = 0f;
        _rising     = false;
        _lastBeatMs = 0;
    }
}
