using Sensa.Signals;

namespace Sensa.Motion;

public enum MotionAxis
{
    L0,
    L1,
    L2,
    R0,
    R1,
    R2,
    V0,
    V1,
    V2,
    A0,
    A1,
    A2,
}

public sealed class MotionPatch
{
    private readonly Dictionary<MotionAxis, float> _values = new();

    public int Count => _values.Count;
    public bool IsEmpty => _values.Count == 0;
    public IEnumerable<MotionAxis> Axes => _values.Keys;
    public IEnumerable<KeyValuePair<MotionAxis, float>> Entries => _values;

    public void Set(MotionAxis axis, float value) => _values[axis] = Math.Clamp(value, 0f, 1f);

    public bool TryGetValue(MotionAxis axis, out float value) => _values.TryGetValue(axis, out value);

    public float? GetValueOrNull(MotionAxis axis) => _values.TryGetValue(axis, out var value) ? value : null;

    public MotionPatch Clone()
    {
        var clone = new MotionPatch();
        foreach (var (axis, value) in _values)
            clone.Set(axis, value);
        return clone;
    }
}

public static class MotionAxisHelper
{
    public static readonly IReadOnlyList<MotionAxis> All = new[]
    {
        MotionAxis.L0,
        MotionAxis.L1,
        MotionAxis.L2,
        MotionAxis.R0,
        MotionAxis.R1,
        MotionAxis.R2,
        MotionAxis.V0,
        MotionAxis.V1,
        MotionAxis.V2,
        MotionAxis.A0,
        MotionAxis.A1,
        MotionAxis.A2,
    };

    public static MotionFrame CreateNeutralFrame(double deltaMs = 0d) => new()
    {
        L0 = 0.5f,
        L1 = 0.5f,
        L2 = 0.5f,
        R0 = 0.5f,
        R1 = 0.5f,
        R2 = 0.5f,
        V0 = 0f,
        V1 = 0f,
        V2 = 0f,
        A0 = 0.5f,
        A1 = 0.5f,
        A2 = 0.5f,
        DeltaMs = deltaMs,
    };

    public static MotionFrame CreateCenterFrame(double deltaMs = 1000d) => new()
    {
        L0 = 0.5f,
        L1 = 0.5f,
        L2 = 0.5f,
        R0 = 0.5f,
        R1 = 0.5f,
        R2 = 0.5f,
        V0 = 0f,
        V1 = 0f,
        V2 = 0f,
        A0 = 0.5f,
        A1 = 0.5f,
        A2 = 0.5f,
        DeltaMs = deltaMs,
    };

    public static float Get(MotionFrame frame, MotionAxis axis) => axis switch
    {
        MotionAxis.L0 => frame.L0,
        MotionAxis.L1 => frame.L1,
        MotionAxis.L2 => frame.L2,
        MotionAxis.R0 => frame.R0,
        MotionAxis.R1 => frame.R1,
        MotionAxis.R2 => frame.R2,
        MotionAxis.V0 => frame.V0,
        MotionAxis.V1 => frame.V1,
        MotionAxis.V2 => frame.V2,
        MotionAxis.A0 => frame.A0,
        MotionAxis.A1 => frame.A1,
        MotionAxis.A2 => frame.A2,
        _ => 0f,
    };

    public static MotionFrame Set(MotionFrame frame, MotionAxis axis, float value)
    {
        value = Math.Clamp(value, 0f, 1f);
        return axis switch
        {
            MotionAxis.L0 => frame with { L0 = value },
            MotionAxis.L1 => frame with { L1 = value },
            MotionAxis.L2 => frame with { L2 = value },
            MotionAxis.R0 => frame with { R0 = value },
            MotionAxis.R1 => frame with { R1 = value },
            MotionAxis.R2 => frame with { R2 = value },
            MotionAxis.V0 => frame with { V0 = value },
            MotionAxis.V1 => frame with { V1 = value },
            MotionAxis.V2 => frame with { V2 = value },
            MotionAxis.A0 => frame with { A0 = value },
            MotionAxis.A1 => frame with { A1 = value },
            MotionAxis.A2 => frame with { A2 = value },
            _ => frame,
        };
    }

    public static MotionFrame ApplyPatch(MotionFrame frame, MotionPatch patch, double? deltaMs = null)
    {
        var next = frame;
        foreach (var (axis, value) in patch.Entries)
            next = Set(next, axis, value);

        return deltaMs.HasValue ? next with { DeltaMs = deltaMs.Value } : next;
    }

    public static MotionPatch CreatePatchFromFrame(MotionFrame frame)
    {
        var patch = new MotionPatch();
        foreach (var axis in All)
            patch.Set(axis, Get(frame, axis));
        return patch;
    }

    public static float NeutralValue(MotionAxis axis) => axis switch
    {
        MotionAxis.V0 or MotionAxis.V1 or MotionAxis.V2 => 0f,
        _ => 0.5f,
    };

    public static bool IsCentered(MotionAxis axis) => axis switch
    {
        MotionAxis.V0 or MotionAxis.V1 or MotionAxis.V2 => false,
        _ => true,
    };

    public static string Token(MotionAxis axis) => axis.ToString();

    public static MotionAxis? AxisForRole(SignalRole role) => role switch
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

    public static bool AreEqual(MotionFrame left, MotionFrame right, float epsilon = 0.0001f)
    {
        foreach (var axis in All)
        {
            if (Math.Abs(Get(left, axis) - Get(right, axis)) >= epsilon)
                return false;
        }

        return true;
    }
}
