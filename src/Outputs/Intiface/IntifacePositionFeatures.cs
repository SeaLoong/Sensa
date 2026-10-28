using Buttplug.Client;
using Buttplug.Core.Messages;
using Sensa.Configuration;
using Sensa.Motion;

namespace Sensa.Outputs.Intiface;

public static class IntifacePositionFeatures
{
    public static List<ButtplugClientDeviceFeature> For(ButtplugClientDevice device) =>
        device.Features.Values.Where(f => f.HasOutput(OutputType.HwPositionWithDuration) || f.HasOutput(OutputType.Position)).ToList();

    public static DeviceOutputCommand Command(DeviceFeature feature, double position, uint durationMs)
    {
        // V4 advertises these capabilities separately. Prefer timed hardware motion
        // when offered; a raw Position-only feature must not receive a timed command.
        if (feature.HasOutput(OutputType.HwPositionWithDuration))
            return ScaledCommand(feature, OutputType.HwPositionWithDuration, position, durationMs);
        if (feature.HasOutput(OutputType.Position)) return ScaledCommand(feature, OutputType.Position, position);
        throw new ArgumentException("Feature does not support position output", nameof(feature));
    }

    internal static DeviceOutputCommand ScaledCommand(DeviceFeature feature, OutputType type, double value, uint? duration = null)
    {
        if (!double.IsFinite(value) || value is < 0 or > 1)
            throw new ArgumentException("Intiface output values must be finite and within 0–1.", nameof(value));
        var definition = feature.GetOutput(type);
        if (definition?.Value is not [var minimum, var maximum] || minimum > maximum)
            throw new ArgumentException("The selected Intiface feature has no valid advertised value range.");
        if (type == OutputType.HwPositionWithDuration
            && (duration is null || definition.Duration is not [var minimumDuration, var maximumDuration]
                || minimumDuration < 0 || maximumDuration < minimumDuration || duration < minimumDuration || duration > maximumDuration))
            throw new ArgumentException("Position duration is outside the Intiface feature's advertised range.");
        // Buttplug 5.0.1's Percent builder scales by maximum alone. Explicit steps
        // preserve the advertised minimum as well for default and mapped outputs.
        var steps = checked((int)Math.Round(minimum + value * ((double)maximum - minimum), MidpointRounding.AwayFromZero));
        return new(type, PercentOrSteps.FromSteps(steps), duration);
    }

    internal static uint DurationFor(MotionFrame frame)
    {
        var value = frame.RequestedCommandMode switch
        {
            TCodeCommandMode.None => 0,
            TCodeCommandMode.Interval => frame.RequestedMotionValue ?? frame.DeltaMs,
            _ => frame.DeltaMs,
        };
        if (!double.IsFinite(value) || value is < 0 or > uint.MaxValue)
            throw new ArgumentException("Position duration must be a finite unsigned millisecond value.");
        return (uint)Math.Round(value, MidpointRounding.AwayFromZero);
    }
}
