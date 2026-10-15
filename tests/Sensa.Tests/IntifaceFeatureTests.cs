using Buttplug.Core.Messages;
using Sensa.Outputs.Intiface;
using Xunit;

namespace Sensa.Tests;

public class IntifaceFeatureTests
{
    [Theory]
    [InlineData(true, false, OutputType.HwPositionWithDuration)]
    [InlineData(false, true, OutputType.Position)]
    [InlineData(true, true, OutputType.HwPositionWithDuration)]
    public void SendsOnlyAnAdvertisedPositionCommand(bool timed, bool raw, OutputType expected)
    {
        var feature = new DeviceFeature { Output = new() };
        if (timed) feature.Output["HwPositionWithDuration"] = new() { Value = [0, 1000], Duration = [0, 60000] };
        if (raw) feature.Output["Position"] = new() { Value = [0, 1000] };
        var command = IntifacePositionFeatures.Command(feature, .75, 200);
        Assert.Equal(expected, command.OutputType);
        Assert.Equal(timed ? (uint?)200 : null, command.Duration);
    }

    [Fact]
    public void VibrationOnlyFeatureCannotBeSentAPositionCommand()
    {
        var feature = new DeviceFeature { Output = new() { ["Vibrate"] = new() { Value = [0, 100] } } };
        Assert.Throws<ArgumentException>(() => IntifacePositionFeatures.Command(feature, .5, 100));
    }
}
