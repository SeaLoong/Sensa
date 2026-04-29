using System.Collections.Concurrent;

namespace Sensa.Core;

// ═══════════════════════════════════════════════════════════════════════
//  OSC message types
// ═══════════════════════════════════════════════════════════════════════

public enum OscValueType { Float, Int, Bool }

public readonly struct OscValue
{
    public readonly OscValueType Type;
    public readonly float Float;
    public readonly int Int;
    public readonly bool Bool;

    public static OscValue FromFloat(float v) => new(OscValueType.Float, v, 0, false);
    public static OscValue FromInt(int v)     => new(OscValueType.Int, 0f, v, false);
    public static OscValue FromBool(bool v)   => new(OscValueType.Bool, v ? 1f : 0f, 0, v);

    private OscValue(OscValueType t, float f, int i, bool b)
    { Type = t; Float = f; Int = i; Bool = b; }

    /// <summary>Normalised float — converts int/bool to float as well.</summary>
    public float AsFloat() => Type switch
    {
        OscValueType.Float => Float,
        OscValueType.Int   => Int,
        OscValueType.Bool  => Bool ? 1f : 0f,
        _                  => 0f,
    };
}

// ═══════════════════════════════════════════════════════════════════════
//  ParameterStore — thread-safe; updated by OscReceiver, read by Routine
// ═══════════════════════════════════════════════════════════════════════

public sealed class ParameterStore
{
    public record struct Entry(OscValue Value, long TimestampMs);

    private readonly ConcurrentDictionary<string, Entry> _store = new();

    /// <summary>Called from the OSC receive thread.</summary>
    public void Set(string path, OscValue value)
    {
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        _store[path] = new Entry(value, ts);
    }

    /// <summary>Try to read a parameter. Returns false if never received.</summary>
    public bool TryGet(string path, out Entry entry) =>
        _store.TryGetValue(path, out entry);

    /// <summary>All currently known parameter paths.</summary>
    public IEnumerable<string> AllPaths => _store.Keys;

    /// <summary>Remove all entries (e.g. on avatar change).</summary>
    public void Clear() => _store.Clear();
}

// ═══════════════════════════════════════════════════════════════════════
//  DeviceCommand — fused, normalised output sent to transmitters
// ═══════════════════════════════════════════════════════════════════════

public record DeviceCommand
{
    /// <summary>L0 axis: main stroke position [0,1].</summary>
    public float L0 { get; init; }

    /// <summary>R0 axis: roll (left/right tilt) [0,1] (0.5 = centre).</summary>
    public float R0 { get; init; } = 0.5f;

    /// <summary>R1 axis: pitch (forward/back tilt) [0,1] (0.5 = centre).</summary>
    public float R1 { get; init; } = 0.5f;

    /// <summary>R2 axis: twist (tube rotation around insertion axis) [0,1] (0.5 = centre). SR6/OSR6 only.</summary>
    public float R2 { get; init; } = 0.5f;

    /// <summary>L1 axis: surge (forward/back linear) [0,1] (0.5 = centre). SR6/OSR6 only.</summary>
    public float L1 { get; init; } = 0.5f;

    /// <summary>L2 axis: sway (left/right linear) [0,1] (0.5 = centre). SR6/OSR6 only.</summary>
    public float L2 { get; init; } = 0.5f;

    /// <summary>Vibration intensity [0,1].</summary>
    public float Vibrate { get; init; }

    /// <summary>If false all devices should stop / park.</summary>
    public bool GateOpen { get; init; } = true;

    /// <summary>Elapsed milliseconds since last command (used by transmitters for timing).</summary>
    public double DeltaMs { get; init; }

    public static readonly DeviceCommand Zero = new();
}

// ═══════════════════════════════════════════════════════════════════════
//  SignalConfig — per-OSC-parameter configuration
//  Defined in Core so SignalProcessor can reference it without circular deps.
// ═══════════════════════════════════════════════════════════════════════

public sealed class SignalConfig
{
    public string OscPath         { get; set; } = "";
    public bool   InvertDirection { get; set; } = false;

    // Calibration
    public float VrchatMin { get; set; } = 0f;
    public float VrchatMax { get; set; } = 1f;

    // Smoothing
    public float SmoothingAlpha { get; set; } = 0.7f;
    public float DeadZone       { get; set; } = 0.01f;

    // Curve & role
    public CurveType  Curve { get; set; } = CurveType.Linear;
    public SignalRole Role  { get; set; } = SignalRole.Depth;

    // Auto-detected flags (set by OSC path scanner)
    public bool IsOgbSocket { get; set; } = false;
    public bool IsOgbPlug   { get; set; } = false;
}

// ═══════════════════════════════════════════════════════════════════════
//  Signal role enum (shared between Config and Processor)
// ═══════════════════════════════════════════════════════════════════════

public enum SignalRole
{
    Depth,
    AngleX,   // → R0 (roll)
    AngleY,   // → R1 (pitch)
    Twist,    // → R2 (tube twist). SR6/OSR6 only.
    Surge,    // → L1 (forward/back linear). SR6/OSR6 only.
    Sway,     // → L2 (left/right linear). SR6/OSR6 only.
    Vibrate,
    Gate,
    BpmDrive,
}

public enum CurveType
{
    Linear,
    EaseIn,
    EaseOut,
    SCurve,
}
