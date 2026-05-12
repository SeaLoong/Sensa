namespace Sensa.Core;

public enum DeviceAxis
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
}

public sealed class DeviceAxisPatch
{
    private readonly Dictionary<DeviceAxis, float> _values = new();

    public int Count => _values.Count;
    public bool IsEmpty => _values.Count == 0;
    public IEnumerable<DeviceAxis> Axes => _values.Keys;
    public IEnumerable<KeyValuePair<DeviceAxis, float>> Entries => _values;

    public void Set(DeviceAxis axis, float value) => _values[axis] = Math.Clamp(value, 0f, 1f);

    public bool TryGetValue(DeviceAxis axis, out float value) => _values.TryGetValue(axis, out value);

    public float? GetValueOrNull(DeviceAxis axis) => _values.TryGetValue(axis, out var value) ? value : null;

    public DeviceAxisPatch Clone()
    {
        var clone = new DeviceAxisPatch();
        foreach (var (axis, value) in _values)
            clone.Set(axis, value);
        return clone;
    }
}

public static class DeviceAxisHelpers
{
    public static readonly IReadOnlyList<DeviceAxis> All = new[]
    {
        DeviceAxis.L0,
        DeviceAxis.L1,
        DeviceAxis.L2,
        DeviceAxis.R0,
        DeviceAxis.R1,
        DeviceAxis.R2,
        DeviceAxis.V0,
        DeviceAxis.V1,
        DeviceAxis.V2,
        DeviceAxis.A0,
    };

    public static DeviceCommand CreateNeutralCommand(double deltaMs = 0d) => new()
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
        DeltaMs = deltaMs,
    };

    public static DeviceCommand CreateCenterCommand(double deltaMs = 1000d) => new()
    {
        L0 = 0.499f,
        L1 = 0.5f,
        L2 = 0.5f,
        R0 = 0.5f,
        R1 = 0.5f,
        R2 = 0.5f,
        V0 = 0f,
        V1 = 0f,
        V2 = 0f,
        A0 = 0.499f,
        DeltaMs = deltaMs,
    };

    public static float Get(DeviceCommand command, DeviceAxis axis) => axis switch
    {
        DeviceAxis.L0 => command.L0,
        DeviceAxis.L1 => command.L1,
        DeviceAxis.L2 => command.L2,
        DeviceAxis.R0 => command.R0,
        DeviceAxis.R1 => command.R1,
        DeviceAxis.R2 => command.R2,
        DeviceAxis.V0 => command.V0,
        DeviceAxis.V1 => command.V1,
        DeviceAxis.V2 => command.V2,
        DeviceAxis.A0 => command.A0,
        _ => 0f,
    };

    public static DeviceCommand Set(DeviceCommand command, DeviceAxis axis, float value)
    {
        value = Math.Clamp(value, 0f, 1f);
        return axis switch
        {
            DeviceAxis.L0 => command with { L0 = value },
            DeviceAxis.L1 => command with { L1 = value },
            DeviceAxis.L2 => command with { L2 = value },
            DeviceAxis.R0 => command with { R0 = value },
            DeviceAxis.R1 => command with { R1 = value },
            DeviceAxis.R2 => command with { R2 = value },
            DeviceAxis.V0 => command with { V0 = value },
            DeviceAxis.V1 => command with { V1 = value },
            DeviceAxis.V2 => command with { V2 = value },
            DeviceAxis.A0 => command with { A0 = value },
            _ => command,
        };
    }

    public static DeviceCommand ApplyPatch(DeviceCommand command, DeviceAxisPatch patch, double? deltaMs = null)
    {
        var next = command;
        foreach (var (axis, value) in patch.Entries)
            next = Set(next, axis, value);

        return deltaMs.HasValue ? next with { DeltaMs = deltaMs.Value } : next;
    }

    public static DeviceAxisPatch CreatePatchFromCommand(DeviceCommand command)
    {
        var patch = new DeviceAxisPatch();
        foreach (var axis in All)
            patch.Set(axis, Get(command, axis));
        return patch;
    }

    public static float NeutralValue(DeviceAxis axis) => axis switch
    {
        DeviceAxis.V0 or DeviceAxis.V1 or DeviceAxis.V2 => 0f,
        _ => 0.5f,
    };

    public static bool IsCentered(DeviceAxis axis) => axis switch
    {
        DeviceAxis.V0 or DeviceAxis.V1 or DeviceAxis.V2 => false,
        _ => true,
    };

    public static string Token(DeviceAxis axis) => axis.ToString();

    public static DeviceAxis? AxisForRole(SignalRole role) => role switch
    {
        SignalRole.Depth => DeviceAxis.L0,
        SignalRole.Surge => DeviceAxis.L1,
        SignalRole.Sway => DeviceAxis.L2,
        SignalRole.AngleX => DeviceAxis.R1,
        SignalRole.AngleY => DeviceAxis.R2,
        SignalRole.Twist => DeviceAxis.R0,
        SignalRole.V0 => DeviceAxis.V0,
        SignalRole.V1 => DeviceAxis.V1,
        SignalRole.V2 => DeviceAxis.V2,
        SignalRole.Auxiliary => DeviceAxis.A0,
        _ => null,
    };

    public static bool Equals(DeviceCommand left, DeviceCommand right, float epsilon = 0.0001f)
    {
        foreach (var axis in All)
        {
            if (Math.Abs(Get(left, axis) - Get(right, axis)) >= epsilon)
                return false;
        }

        return true;
    }
}
