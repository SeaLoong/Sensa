using System.Text;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Signals;

namespace Sensa.Outputs.TCode;

public static class TCodeEncoder
{
    public static (string Line, MotionFrame EffectiveFrame) BuildLine(
        TCodeMotionProfile profile, OutputDeviceConfig? output, MotionFrame? lastEffectiveFrame, MotionFrame? lastSourceFrame, Dictionary<MotionAxis, AxisVelocityTracker> velocity, Action<string>? log,
        MotionFrame frame,
        bool forceAll,
        bool forceInterval = false,
        int? durationMsOverride = null,
        bool padMagnitude = false)
    {
        var previousEffectiveFrame = lastEffectiveFrame ?? MotionAxisHelper.CreateNeutralFrame();
        var previousSourceFrame = lastSourceFrame ?? previousEffectiveFrame;
        var effectiveFrame = previousEffectiveFrame;
        var sb = new System.Text.StringBuilder();
        var deltaMs = Math.Max(durationMsOverride ?? (int)Math.Round(Math.Max(frame.DeltaMs, 1d)), 1);

        foreach (var axis in MotionAxisHelper.All)
        {
            var config = GetAxisConfig(profile, axis);
            var source = MotionAxisHelper.Get(frame, axis);
            var previousSource = MotionAxisHelper.Get(previousSourceFrame, axis);
            var previousMapped = MotionAxisHelper.Get(previousEffectiveFrame, axis);

            if (config.Mode == TCodeAxisMode.Ignored)
            {
                if (forceAll || Math.Abs(previousSource - source) >= 0.0001f)
                    log?.Invoke(TCodeAxisDebugFormatter.FormatAxisTrace(axis, source, previousSource, previousMapped, previousMapped, previousMapped, config, action: "ignored", note: "axis-ignored"));
                continue;
            }

            var resolved = ResolveAxisValue(source, config);
            var remapped = resolved.Remapped;
            var mapped = resolved.Output;
            effectiveFrame = MotionAxisHelper.Set(effectiveFrame, axis, mapped);
            var sourceChanged = forceAll || Math.Abs(previousSource - source) >= 0.0001f;
            var commandMode = ResolveCommandMode(output, frame, config);
            var previousCommandMode = ResolveCommandMode(output, previousSourceFrame, config);
            var motionInstructionChanged = forceAll
                || commandMode != previousCommandMode
                || frame.RequestedCommandMode != previousSourceFrame.RequestedCommandMode
                || frame.RequestedMotionValue != previousSourceFrame.RequestedMotionValue;
            var mappedChanged = forceAll || Math.Abs(previousMapped - mapped) >= 0.0001f || motionInstructionChanged;

            if (!mappedChanged)
            {
                if (sourceChanged)
                    log?.Invoke(TCodeAxisDebugFormatter.FormatAxisTrace(axis, source, previousSource, previousMapped, remapped, mapped, config, action: "hold", note: "post-profile-unchanged"));
                continue;
            }

            var pos = Math.Clamp((int)Math.Round(mapped * 1000f), 0, 999);
            var posText = pos.ToString("D3");
            int? speedLimitForLog = null;
            int? requestedSpeedForLog = null;
            int? logicalSpeedForLog = null;
            int? emittedSpeedForLog = null;
            int? durationMsForLog = null;
            string term;
            if (forceInterval)
            {
                durationMsForLog = deltaMs;
                term = $"I{deltaMs}";
            }
            else if (commandMode == TCodeCommandMode.None)
            {
                term = string.Empty;
            }
            else if (commandMode == TCodeCommandMode.Interval)
            {
                var requestedLogicalSpeed = TCodeAxisDebugFormatter.HasRequestedSpeed(frame)
                    ? TCodeAxisDebugFormatter.ResolveRequestedSpeed(frame, config.MaxSpeed)
                    : (int?)null;
                var logicalSpeedLimit = requestedLogicalSpeed ?? Math.Clamp(config.MaxSpeed, 1, 999);
                var durationMs = frame.RequestedCommandMode == TCodeCommandMode.Interval
                    ? TCodeAxisDebugFormatter.ResolveRequestedDurationMs(frame, deltaMs)
                    : TCodeAxisDebugFormatter.ComputeDurationMs(previousMapped, mapped, logicalSpeedLimit, deltaMs);
                speedLimitForLog = logicalSpeedLimit;
                requestedSpeedForLog = requestedLogicalSpeed;
                durationMsForLog = durationMs;
                term = $"I{durationMs}";
            }
            else
            {
                var requestedLogicalSpeed = TCodeAxisDebugFormatter.HasRequestedSpeed(frame)
                    ? TCodeAxisDebugFormatter.ResolveRequestedSpeed(frame, config.MaxSpeed)
                    : (int?)null;
                var logicalSpeedLimit = requestedLogicalSpeed ?? Math.Clamp(config.MaxSpeed, 1, 999);
                var logicalSpeed = requestedLogicalSpeed ?? velocity[axis].Estimate(mapped, frame.DeltaMs, logicalSpeedLimit);
                var emittedSpeed = ConvertSpeedToOutputUnits(output, logicalSpeed);
                speedLimitForLog = logicalSpeedLimit;
                requestedSpeedForLog = requestedLogicalSpeed;
                logicalSpeedForLog = logicalSpeed;
                emittedSpeedForLog = emittedSpeed;
                term = $"S{emittedSpeed}";
            }

            term = ApplyRampSuffix(term, config.RampType);

            sb.Append($"{MotionAxisHelper.Token(axis)}{posText}{term} ");
            log?.Invoke(TCodeAxisDebugFormatter.FormatAxisTrace(
                axis,
                source,
                previousSource,
                previousMapped,
                remapped,
                mapped,
                config,
                action: "emit",
                term: term,
                speedLimit: speedLimitForLog,
                requestedSpeed: requestedSpeedForLog,
                logicalSpeed: logicalSpeedForLog,
                emittedSpeed: emittedSpeedForLog,
                durationMs: durationMsForLog));
        }

        return (sb.ToString().TrimEnd(), effectiveFrame);
    }

    private static (float Remapped, float Output) ResolveAxisValue(float value, TCodeAxisConfig axisConfig)
    {
        if (axisConfig.Mode == TCodeAxisMode.Locked)
            value = axisConfig.LockValue;
        if (axisConfig.Invert)
            value = 1f - value;

        var normalized = Math.Clamp(value, 0f, 1f);
        var remapped = RemapToRange(normalized, axisConfig);
        var output = ClampToBounds(remapped, axisConfig);
        return (remapped, output);
    }

    private static float RemapToRange(float value, TCodeAxisConfig axisConfig)
    {
        var min = Math.Clamp(axisConfig.RemapMin, 0, 999);
        var max = Math.Clamp(axisConfig.RemapMax, min, 999);
        return (min + ((max - min) * Math.Clamp(value, 0f, 1f))) / 1000f;
    }

    private static float ClampToBounds(float value, TCodeAxisConfig axisConfig)
    {
        var min = Math.Clamp(axisConfig.Min, 0, 999);
        var max = Math.Clamp(axisConfig.Max, min, 999);
        var normalized = Math.Clamp(value, 0f, 1f);
        return Math.Clamp(normalized, min / 1000f, max / 1000f);
    }

    private static TCodeAxisConfig GetAxisConfig(TCodeMotionProfile profile, MotionAxis axis) => axis switch
    {
        MotionAxis.L0 => profile.L0,
        MotionAxis.L1 => profile.L1,
        MotionAxis.L2 => profile.L2,
        MotionAxis.R0 => profile.R0,
        MotionAxis.R1 => profile.R1,
        MotionAxis.R2 => profile.R2,
        MotionAxis.V0 => profile.V0,
        MotionAxis.V1 => profile.V1,
        MotionAxis.V2 => profile.V2,
        MotionAxis.A0 => profile.A0,
        MotionAxis.A1 => profile.A1,
        MotionAxis.A2 => profile.A2,
        _ => profile.L0,
    };

    private static TCodeCommandMode ResolveCommandMode(OutputDeviceConfig? output, MotionFrame frame, TCodeAxisConfig axis)
    {
        if (frame.RequestedCommandMode.HasValue)
            return frame.RequestedCommandMode.Value;

        return output?.SlopeMode switch
        {
            TCodeSlopeMode.Speed => TCodeCommandMode.Speed,
            TCodeSlopeMode.Interval => TCodeCommandMode.Interval,
            TCodeSlopeMode.NoSlope => TCodeCommandMode.None,
            _ => axis.CommandMode,
        };
    }

    private static int ConvertSpeedToOutputUnits(OutputDeviceConfig? output, int logicalSpeed)
    {
        var clamped = Math.Max(logicalSpeed, 0);
        return output?.SpeedUnitBase == TCodeSpeedUnitBase.PerSecond ? clamped * 10 : clamped;
    }

    private static string ApplyRampSuffix(string term, TCodeRampType rampType)
    {
        if (string.IsNullOrWhiteSpace(term))
            return string.Empty;

        var suffix = rampType switch
        {
            TCodeRampType.Linear => "=",
            TCodeRampType.EaseIn => "<",
            TCodeRampType.EaseOut => ">",
            TCodeRampType.EaseInOut => "<>",
            _ => string.Empty,
        };

        return string.IsNullOrEmpty(suffix) ? term : $"{term}{suffix}";
    }

}
