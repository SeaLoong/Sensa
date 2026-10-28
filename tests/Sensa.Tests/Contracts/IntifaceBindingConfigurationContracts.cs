using Sensa.Configuration;
using Sensa.Outputs;
using Sensa.Outputs.Intiface;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class IntifaceBindingConfigurationContracts
{
    [Theory]
    [InlineData("L0")]
    [InlineData("V1")]
    [InlineData("R0")]
    [InlineData("A0")]
    public void BindingsCanFeedLegacyAndExplicitFeatureAndDirectionAxes(string axis)
    {
        var output = Output(axis);
        SignalOutputConfiguration.Validate(new() { Outputs = [output] });
    }

    [Theory]
    [InlineData("R1")]
    [InlineData("A1")]
    [InlineData("V0")]
    public void UnmappedAxesAreNotAdvertisedAsUsableIntifaceDestinations(string axis)
    {
        Assert.Throws<ArgumentException>(() => SignalOutputConfiguration.Validate(new() { Outputs = [Output(axis)] }));
    }

    [Theory]
    [InlineData("0")]
    [InlineData("999")]
    [InlineData("L9")]
    public void MotionBindingTargetsRequireCanonicalSupportedAxisNames(string axis)
    {
        var output = Output(axis);
        output.Type = OutputDeviceType.TCodeUdp;
        Assert.Throws<ArgumentException>(() => SignalOutputConfiguration.Validate(new() { Outputs = [output] }));
    }

    private static OutputDeviceConfig Output(string axis) => new()
    {
        Id = "mapped", Type = OutputDeviceType.Intiface, Enabled = false, VibrationAxis = "V1",
        IntifaceFeatures = IntifaceFeatureRoute.CloneAndValidate([
            new() { DeviceName = "Mapped rotation", FeatureIndex = 2, OutputType = "Rotate", SourceAxis = "R0", DirectionAxis = "A0" }
        ]),
        Signal = new() { Bindings = [new() { Id = "Value", Address = axis, Source = new() { SourceMode = "Constant", Value = .4f } }] },
    };
}
