using Sensa.Configuration;
using Sensa.Motion;
using System.Text;

namespace Sensa.Outputs.TCode;

internal static class TCodeAxisDebugFormatter
{
    private const double OutputUnitsPerStroke = 999d;
    private const double SpeedWindowMs = 100d;

    public static int ComputeDurationMs(float previousMapped, float mapped, int maxSpeed, int fallbackMs)
    {
        if (maxSpeed <= 0)
            return Math.Max(fallbackMs, 1);

        var deltaUnits = Math.Abs(mapped - previousMapped) * OutputUnitsPerStroke;
        if (deltaUnits <= 0.0001d)
            return 1;

        return Math.Max((int)Math.Ceiling((deltaUnits / maxSpeed) * SpeedWindowMs), 1);
    }

    public static bool HasRequestedSpeed(MotionFrame frame)
    {
        return frame.RequestedMotionValue is > 0
            && (!frame.RequestedCommandMode.HasValue || frame.RequestedCommandMode == TCodeCommandMode.Speed);
    }

    public static int ResolveRequestedSpeed(MotionFrame frame, int fallbackSpeed)
    {
        var requested = HasRequestedSpeed(frame)
            ? frame.RequestedMotionValue.GetValueOrDefault(fallbackSpeed)
            : fallbackSpeed;
        return Math.Clamp(requested, 1, Math.Max(fallbackSpeed, 1));
    }

    public static int ResolveRequestedDurationMs(MotionFrame frame, int fallbackDurationMs)
    {
        var requested = frame.RequestedCommandMode == TCodeCommandMode.Interval && frame.RequestedMotionValue is > 0
            ? frame.RequestedMotionValue.Value
            : fallbackDurationMs;
        return Math.Max(requested, 1);
    }

    public static string FormatAxisTrace(
        MotionAxis axis,
        float source,
        float previousSource,
        float previousMapped,
        float remapped,
        float mapped,
        TCodeAxisConfig config,
        string action,
        string? term = null,
        string? note = null,
        int? speedLimit = null,
        int? requestedSpeed = null,
        int? logicalSpeed = null,
        int? emittedSpeed = null,
        int? durationMs = null)
    {
        var stage = ResolveStage(action, note);
        var reason = ResolveReason(note, stage);

        var payload = new StringBuilder($"AXIS {MotionAxisHelper.Token(axis)} stage={stage}");
        payload.Append($" axisMode={config.Mode}");

        if (config.Mode != TCodeAxisMode.Ignored)
            payload.Append($" invert={config.Invert}");

        if (!string.IsNullOrWhiteSpace(term))
            payload.Append($" cmd={term}");

        if (!string.IsNullOrWhiteSpace(reason))
            payload.Append($" reason={reason}");

        if (speedLimit.HasValue)
            payload.Append($" speedLimit={speedLimit.Value}");

        if (requestedSpeed.HasValue)
            payload.Append($" requestedSpeed={requestedSpeed.Value}");

        if (logicalSpeed.HasValue)
            payload.Append($" logicalSpeed={logicalSpeed.Value}");

        if (emittedSpeed.HasValue)
            payload.Append($" emittedSpeed={emittedSpeed.Value}");

        if (durationMs.HasValue)
            payload.Append($" durationMs={durationMs.Value}");

        payload.Append($" input={ToManualValue(source)} prevInput={ToManualValue(previousSource)}");

        switch (stage)
        {
            case "emit":
                payload.Append($" output={ToOutputValue(mapped)} prevOutput={ToOutputValue(previousMapped)}");
                payload.Append($" normalized={source:F3} remapped={remapped:F3} clamped={mapped:F3}");
                if (config.Mode == TCodeAxisMode.Locked)
                {
                    payload.Append($" lock={config.LockValue:F3}");
                }
                else
                {
                    payload.Append($" min={config.Min} max={config.Max} remapMin={config.RemapMin} remapMax={config.RemapMax}");
                }
                break;

            case "hold":
                payload.Append($" output={ToOutputValue(mapped)} prevOutput={ToOutputValue(previousMapped)}");
                payload.Append($" normalized={source:F3} remapped={remapped:F3} clamped={mapped:F3}");
                break;

            case "ignored":
                payload.Append($" output={ToOutputValue(mapped)} prevOutput={ToOutputValue(previousMapped)}");
                payload.Append($" normalized={source:F3} remapped={remapped:F3} clamped={mapped:F3}");
                break;

            default:
                payload.Append($" output={ToOutputValue(mapped)} prevOutput={ToOutputValue(previousMapped)}");
                break;
        }

        return payload.ToString();
    }

    private static string ResolveStage(string action, string? note)
    {
        if (string.Equals(action, "emit", StringComparison.OrdinalIgnoreCase))
            return "emit";

        if (string.Equals(note, "ignored", StringComparison.OrdinalIgnoreCase))
            return "ignored";

        if (string.Equals(note, "profile-held", StringComparison.OrdinalIgnoreCase))
            return "hold";

        return string.IsNullOrWhiteSpace(action) ? "unknown" : action.Trim().ToLowerInvariant();
    }

    private static string? ResolveReason(string? note, string stage)
    {
        if (string.IsNullOrWhiteSpace(note))
        {
            return stage switch
            {
                "ignored" => "axis-ignored",
                "hold" => "post-profile-unchanged",
                _ => null,
            };
        }

        return note.Trim().ToLowerInvariant() switch
        {
            "ignored" => "axis-ignored",
            "profile-held" => "post-profile-unchanged",
            var value => value,
        };
    }

    private static int ToManualValue(float value) => Math.Clamp((int)Math.Round(Math.Clamp(value, 0f, 1f) * 1000f), 0, 999);

    private static int ToOutputValue(float value) => Math.Clamp((int)Math.Round(Math.Clamp(value, 0f, 1f) * 1000f), 0, 999);
}