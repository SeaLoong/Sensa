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
        OnSet?.Invoke(path, value);
    }

    public event Action<string, OscValue>? OnSet;

    /// <summary>
    /// Try to read the latest parameter matching an exact OSC path or a simple
    /// trailing-wildcard pattern such as <c>OGB/Pen/*</c>.
    /// For wildcard patterns, the newest matching entry by timestamp wins.
    /// </summary>
    public bool TryGetLatest(string pathOrPattern, out Entry entry) =>
        TryGetLatest(pathOrPattern, out _, out entry);

    /// <summary>
    /// Try to read the latest parameter matching an exact OSC path or glob pattern.
    /// Supports:
    ///   - Exact match: OGB/Orf/Pussy/Main/PenOthers
    ///   - Single-segment wildcard: OGB/Orf/*/Main/PenOthers
    ///   - Trailing multi-segment wildcard: OGB/Pen/Main/**
    /// Returns the actual matched path when successful.
    /// </summary>
    public bool TryGetLatest(string pathOrPattern, out string matchedPath, out Entry entry)
    {
        matchedPath = string.Empty;
        entry = default;

        if (string.IsNullOrWhiteSpace(pathOrPattern))
            return false;

        // Exact match first
        if (_store.TryGetValue(pathOrPattern, out entry))
        {
            matchedPath = pathOrPattern;
            return true;
        }

        // Check for wildcards
        var hasGlob = pathOrPattern.Contains('*');
        if (!hasGlob)
            return false;

        var found = false;
        var latestTimestampMs = long.MinValue;

        foreach (var (path, current) in _store)
        {
            if (!MatchesPathPattern(pathOrPattern, path))
                continue;

            if (found && current.TimestampMs <= latestTimestampMs)
                continue;

            matchedPath = path;
            entry = current;
            latestTimestampMs = current.TimestampMs;
            found = true;
        }

        return found;
    }

    /// <summary>Checks whether an OSC path matches an exact path or glob pattern.</summary>
    public static bool MatchesPathPattern(string pathOrPattern, string actualPath)
    {
        if (string.IsNullOrWhiteSpace(pathOrPattern) || string.IsNullOrWhiteSpace(actualPath))
            return false;

        if (!pathOrPattern.Contains('*'))
            return string.Equals(pathOrPattern, actualPath, StringComparison.Ordinal);

        var patternSegs = pathOrPattern.Split('/');
        var pathSegs = actualPath.Split('/');
        return GlobMatch(patternSegs, pathSegs);
    }

    /// <summary>Glob-style path segment matching. * matches any single segment; ** matches zero or more segments.</summary>
    private static bool GlobMatch(ReadOnlySpan<string> pattern, ReadOnlySpan<string> path)
    {
        int pi = 0, si = 0;
        while (pi < pattern.Length && si < path.Length)
        {
            if (pattern[pi] == "**")
            {
                // ** matches any remaining segments — check if the rest of the pattern matches
                // Try all possible end positions for **
                for (int end = si; end <= path.Length; end++)
                {
                    if (GlobMatch(pattern[(pi + 1)..], path[end..]))
                        return true;
                }
                return false;
            }
            if (pattern[pi] == "*" || pattern[pi] == path[si])
            {
                pi++;
                si++;
                continue;
            }
            return false;
        }
        // Allow ** at the end to match zero remaining segments
        if (pi < pattern.Length && pattern[pi] == "**" && pi + 1 == pattern.Length)
            return true;
        return pi == pattern.Length && si == path.Length;
    }

    /// <summary>All currently known parameter paths.</summary>
    public IEnumerable<string> AllPaths => _store.Keys;

    /// <summary>Stable snapshot of all known parameters and their latest values.</summary>
    public KeyValuePair<string, Entry>[] Snapshot() => _store.ToArray();

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

    /// <summary>R0 axis: twist around L0 [0,1] (0.5 = centre).</summary>
    public float R0 { get; init; } = 0.5f;

    /// <summary>R1 axis: roll around L1 [0,1] (0.5 = centre).</summary>
    public float R1 { get; init; } = 0.5f;

    /// <summary>R2 axis: pitch around L2 [0,1] (0.5 = centre). SR6/OSR6 only.</summary>
    public float R2 { get; init; } = 0.5f;

    /// <summary>L1 axis: surge (front/back linear; in current TCode UI convention higher values move toward back) [0,1] (0.5 = centre). SR6/OSR6 only.</summary>
    public float L1 { get; init; } = 0.5f;

    /// <summary>L2 axis: sway (left/right linear) [0,1] (0.5 = centre). SR6/OSR6 only.</summary>
    public float L2 { get; init; } = 0.5f;

    /// <summary>V0 axis: main vibration intensity [0,1].</summary>
    public float V0 { get; init; }

    /// <summary>V1 axis: second vibration [0,1].</summary>
    public float V1 { get; init; }

    /// <summary>V2 axis: third vibration [0,1].</summary>
    public float V2 { get; init; }

    /// <summary>A0 axis: auxiliary channel [0,1] (0.5 = centre).</summary>
    public float A0 { get; init; } = 0.5f;

    /// <summary>Elapsed milliseconds since last command (used by transmitters for timing).</summary>
    public double DeltaMs { get; init; }

    /// <summary>
    /// When true, output layers should drive changed axes using the configured maximum speed
    /// (or derive an equivalent time interval when emitting I-commands).
    /// </summary>
    public bool UseMaxSpeed { get; init; }

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

    // EMA smoothing (alpha). Example: 0.4 => 40% new sample + 60% previous output.
    public float SmoothingAlpha { get; set; } = 0.7f;
    public float DeadZone       { get; set; } = 0.01f;

    // Curve & role
    public CurveType  Curve { get; set; } = CurveType.Linear;
    public SignalRole Role  { get; set; } = SignalRole.Depth;

    // Legacy output range remap [0,1] → [OutputMin, OutputMax].
    // Kept for backwards compatibility with older saved configs.
    public float OutputMin { get; set; } = 0f;
    public float OutputMax { get; set; } = 1f;

    // Preferred mapped output positions [0,999]. When set, these override OutputMin/OutputMax.
    // Allows directly placing OSC input onto final device positions.
    public int? MappedMin { get; set; }
    public int? MappedMax { get; set; }

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
    AngleX,   // → R1 (roll)
    AngleY,   // → R2 (pitch)
    Twist,    // → R0 (twist / yaw)
    Surge,    // → L1 (front/back, higher values = back)
    Sway,     // → L2 (left/right)
    V0,       // main vibration (TCode V0)
    V1,       // second vibration (TCode V1)
    V2,       // third vibration (TCode V2)
    Auxiliary,// → A0 (auxiliary channel)
}

public enum CurveType
{
    Linear,
    EaseIn,
    EaseOut,
    SCurve,
}
