using Sensa.Configuration;
using Sensa.Motion;

namespace Sensa.Outputs.TCode;

internal static class TCodeAxisDebugFormatter
{
    public static int ComputeDurationMs(float previousMapped, float mapped, int maxSpeed, int fallbackMs)
    {
        if (maxSpeed <= 0)
            return Math.Max(fallbackMs, 1);

        var deltaUnits = Math.Abs(mapped - previousMapped) * 1000d;
        if (deltaUnits <= 0.0001d)
            return 1;

        return Math.Max((int)Math.Ceiling((deltaUnits / maxSpeed) * 100d), 1);
    }

    public static int ResolveRequestedSpeed(MotionFrame frame, int fallbackSpeed)
    {
        var requested = frame.RequestedCommandMode == TCodeCommandMode.Speed && frame.RequestedMotionValue is > 0
            ? frame.RequestedMotionValue.Value
            : fallbackSpeed;
        return Math.Clamp(requested, 1, 999);
    }

    public static int ResolveRequestedDurationMs(MotionFrame frame, int fallbackDurationMs)
    {
        var requested = frame.RequestedCommandMode == TCodeCommandMode.Interval && frame.RequestedMotionValue is > 0
            ? frame.RequestedMotionValue.Value
            : fallbackDurationMs;
        return Math.Max(requested, 1);
    }

    public static string FormatAxisTrace(MotionAxis axis, float source, float previousSource, float previousMapped, float remapped, float mapped, TCodeAxisConfig config, string action, string? term = null, string? note = null)
    {
        var termText = string.IsNullOrWhiteSpace(term) ? string.Empty : $" term={term}";
        var noteText = string.IsNullOrWhiteSpace(note) ? string.Empty : $" note={note}";
        return $"AXIS {MotionAxisHelper.Token(axis)} src={ToManualValue(source)} prevSrc={ToManualValue(previousSource)} prevOut={ToOutputValue(previousMapped)} out={ToOutputValue(mapped)} norm={source:F3} remap={remapped:F3} mapped={mapped:F3} mode={config.Mode} invert={config.Invert} min={config.Min} max={config.Max} remapMin={config.RemapMin} remapMax={config.RemapMax} lock={config.LockValue:F3} action={action}{termText}{noteText}";
    }

    private static int ToManualValue(float value) => Math.Clamp((int)Math.Round(Math.Clamp(value, 0f, 1f) * 1000f), 0, 999);

    private static int ToOutputValue(float value) => Math.Clamp((int)Math.Round(Math.Clamp(value, 0f, 1f) * 1000f), 0, 999);
}