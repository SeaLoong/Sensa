using Buttplug.Core.Messages;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Tests.Support;
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

    [Theory]
    [InlineData(0)]
    [InlineData(1001)]
    public void DefaultTimedPositionRejectsDurationsOutsideAdvertisedBounds(int duration)
    {
        var feature = new DeviceFeature { Output = new() { ["HwPositionWithDuration"] = new() { Value = [100, 1100], Duration = [10, 1000] } } };
        Assert.Throws<ArgumentException>(() => IntifacePositionFeatures.Command(feature, .5, (uint)duration));
    }

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(-.1)]
    [InlineData(1.1)]
    public void DefaultPositionRejectsInvalidNormalizedValues(double value)
    {
        var feature = new DeviceFeature { Output = new() { ["Position"] = new() { Value = [100, 1100] } } };
        Assert.Throws<ArgumentException>(() => IntifacePositionFeatures.Command(feature, value, 0));
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

    [Theory]
    [InlineData(false, "V0", 500)]
    [InlineData(false, "V1", 250)]
    [InlineData(false, "V2", 1000)]
    [InlineData(false, "L0", 750)]
    [InlineData(false, "invalid", 500)]
    [InlineData(true, "V0", 500)]
    [InlineData(true, "V1", 250)]
    [InlineData(true, "V2", 1000)]
    [InlineData(true, "L0", 750)]
    [InlineData(true, "invalid", 500)]
    public async Task VibrationUsesTheConfiguredAxisForVibrationOnlyAndMixedDevices(bool withPosition, string axis, double expected)
    {
        await using var peer = new IntifaceMockServer(withPosition);
        await using var client = new IntifaceOutputClient(new() { WebsocketAddress = peer.Address, VibrationAxis = axis });
        var discovered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        client.DevicesChanged += () => { if (client.Devices.Count == 1) discovered.TrySetResult(); };
        await client.ConnectAsync();
        await discovered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Empty(peer.Commands);
        await client.SendAsync(new() { L0 = .75f, V0 = .5f, V1 = .25f, V2 = 1, DeltaMs = 100 });
        var vibration = await peer.NextCommandAsync(IsVibration);
        Assert.Equal(expected, vibration.GetProperty("OutputCmd").GetProperty("Command").GetProperty("Vibrate").GetProperty("Value").GetDouble());
        var positionCommands = peer.Commands.Where(IsPosition).ToArray();
        if (withPosition)
            Assert.Equal(250, Assert.Single(positionCommands).GetProperty("OutputCmd").GetProperty("Command").GetProperty("HwPositionWithDuration").GetProperty("Value").GetDouble());
        else
            Assert.Empty(positionCommands);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task DefaultV0ZeroNeverFallsBackToDepthAndStopClearsTheWireAndTelemetry(bool withPosition)
    {
        await using var peer = new IntifaceMockServer(withPosition);
        await using var client = new IntifaceOutputClient(new() { WebsocketAddress = peer.Address });
        var discovered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        client.DevicesChanged += () => { if (client.Devices.Count == 1) discovered.TrySetResult(); };
        await client.ConnectAsync();
        await discovered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var frame = new MotionFrame { L0 = .75f, V0 = 0, DeltaMs = 100 };
        foreach (var value in new[] { 0f, .5f, 0f })
        {
            await client.SendAsync(frame with { V0 = value });
            var vibration = await peer.NextCommandAsync(IsVibration);
            Assert.Equal(value * 1000, vibration.GetProperty("OutputCmd").GetProperty("Command").GetProperty("Vibrate").GetProperty("Value").GetDouble());
        }
        await client.StopAllAsync();
        var stop = (await peer.NextCommandAsync(command => command.TryGetProperty("StopCmd", out _))).GetProperty("StopCmd");
        Assert.False(stop.TryGetProperty("DeviceIndex", out _));
        Assert.False(stop.TryGetProperty("FeatureIndex", out _));
        Assert.Equal("stopped", client.Telemetry.Snapshot.State);
        Assert.Empty(client.Telemetry.Snapshot.Targets);
        await client.SendAsync(frame);
        var afterStop = await peer.NextCommandAsync(IsVibration);
        Assert.Equal(0, afterStop.GetProperty("OutputCmd").GetProperty("Command").GetProperty("Vibrate").GetProperty("Value").GetDouble());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ExplicitZeroStopsEvenWhenThePreviousVibrationIsBelowTheDeltaThreshold(bool withPosition)
    {
        await using var peer = new IntifaceMockServer(withPosition);
        await using var client = new IntifaceOutputClient(new() { WebsocketAddress = peer.Address });
        var discovered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        client.DevicesChanged += () => { if (client.Devices.Count == 1) discovered.TrySetResult(); };
        await client.ConnectAsync();
        await discovered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        foreach (var value in new[] { .5f, .0005f })
        {
            await client.SendAsync(new() { L0 = .75f, V0 = value });
            await peer.NextCommandAsync(IsVibration);
        }
        await client.SendAsync(new() { L0 = .75f, V0 = 0 });
        var zero = await peer.NextCommandAsync(IsVibration);
        Assert.Equal(0, zero.GetProperty("OutputCmd").GetProperty("Command").GetProperty("Vibrate").GetProperty("Value").GetDouble());
    }

    private static bool IsVibration(System.Text.Json.JsonElement message) =>
        message.TryGetProperty("OutputCmd", out var output) && output.GetProperty("Command").TryGetProperty("Vibrate", out _);

    private static bool IsPosition(System.Text.Json.JsonElement message) =>
        message.TryGetProperty("OutputCmd", out var output) && output.GetProperty("Command").TryGetProperty("HwPositionWithDuration", out _);

}
