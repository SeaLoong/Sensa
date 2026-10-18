using Buttplug.Core.Messages;
using Sensa.Configuration;
using Sensa.Outputs.Intiface;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Advertised Intiface feature contracts / Intiface 已声明特征契约。No engine or physical device is started.</summary>
public sealed class IntifaceContracts
{
    [Theory]
    [InlineData(true, false, OutputType.HwPositionWithDuration)]
    [InlineData(false, true, OutputType.Position)]
    [InlineData(true, true, OutputType.HwPositionWithDuration)]
    public void PositionCommandUsesOnlyAdvertisedCapabilitiesAndPrefersHardwareTiming(bool timed, bool raw, OutputType expected)
    {
        var feature = new DeviceFeature { Output = new() };
        if (timed) feature.Output["HwPositionWithDuration"] = new() { Value = [0, 1000], Duration = [0, 60000] };
        if (raw) feature.Output["Position"] = new() { Value = [0, 1000] };
        var command = IntifacePositionFeatures.Command(feature, .75, 200);
        Assert.Equal(expected, command.OutputType);
        Assert.Equal(timed ? (uint?)200 : null, command.Duration);
    }

    [Fact]
    public void VibrationOnlyAndEmptyFeaturesRejectPositionCommands()
    {
        var vibration = new DeviceFeature { Output = new() { ["Vibrate"] = new() { Value = [0, 100] } } };
        Assert.Throws<ArgumentException>(() => IntifacePositionFeatures.Command(vibration, .5, 100));
        Assert.Throws<ArgumentException>(() => IntifacePositionFeatures.Command(new() { Output = new() }, .5, 100));
    }

    [Fact]
    public async Task ConstructingAndDisposingAnUnconnectedClientNeverStartsAnEngineOrCreatesTargets()
    {
        await using var client = new IntifaceOutputClient(new IntifaceConfig { Enabled = false, ManageEngineProcess = false,
            WebsocketAddress = "ws://127.0.0.1:1" });
        Assert.False(client.IsConnected);
        Assert.Empty(client.Devices);
        Assert.Equal("idle", client.Telemetry.Snapshot.State);
        Assert.Empty(client.Telemetry.Snapshot.Targets);
    }
}
