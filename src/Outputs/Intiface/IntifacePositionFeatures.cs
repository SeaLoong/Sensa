using Buttplug.Client;
using Buttplug.Core.Messages;

namespace Sensa.Outputs.Intiface;

public static class IntifacePositionFeatures
{
    public static List<ButtplugClientDeviceFeature> For(ButtplugClientDevice device) =>
        device.Features.Values.Where(f => f.HasOutput(OutputType.HwPositionWithDuration) || f.HasOutput(OutputType.Position)).ToList();

    public static DeviceOutputCommand Command(DeviceFeature feature, double position, uint durationMs)
    {
        // V4 advertises these capabilities separately. Prefer timed hardware motion
        // when offered; a raw Position-only feature must not receive a timed command.
        if (feature.HasOutput(OutputType.HwPositionWithDuration)) return DeviceOutput.PositionWithDuration.Percent(position, durationMs);
        if (feature.HasOutput(OutputType.Position)) return DeviceOutput.Position.Percent(position);
        throw new ArgumentException("Feature does not support position output", nameof(feature));
    }
}
