using System.Net;
using System.Net.Sockets;
using System.Text;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Outputs;
using Sensa.Outputs.TCode;
using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Output contracts / 输出契约。Only in-process encoders and loopback mock transports are used.</summary>
public sealed class OutputContracts
{
    [Fact]
    public void EncoderAppliesDirectionRemapLimitLockAndIgnoreBeforeExposingEffectiveTargets()
    {
        var profile = OnlyL0();
        profile.L0.Invert = true;
        profile.L0.RemapMin = 200;
        profile.L0.RemapMax = 800;
        profile.L0.Max = 600;
        profile.R0 = new() { Mode = TCodeAxisMode.Locked, LockValue = .25f };
        var frame = MotionAxisHelper.CreateNeutralFrame() with { L0 = .25f, R0 = .9f, R1 = .8f };
        var (line, effective) = Encode(profile, frame);
        Assert.Contains("L0600I", line);
        Assert.Contains("R0250I", line);
        Assert.DoesNotContain("R1", line);
        Assert.Equal(.6f, effective.L0, 5);
        Assert.Equal(.24975f, effective.R0, 5);
        Assert.Equal(.5f, effective.R1);
    }

    [Theory]
    [InlineData(TCodeRampType.None, "")]
    [InlineData(TCodeRampType.Linear, "=")]
    [InlineData(TCodeRampType.EaseIn, "<")]
    [InlineData(TCodeRampType.EaseOut, ">")]
    [InlineData(TCodeRampType.EaseInOut, "<>")]
    public void RequestedMotionAndRampSurviveEncodingAndTelemetry(TCodeRampType ramp, string suffix)
    {
        var profile = OnlyL0();
        profile.L0.RampType = ramp;
        var frame = MotionAxisHelper.CreateNeutralFrame() with { L0 = 1, RequestedCommandMode = TCodeCommandMode.Interval, RequestedMotionValue = 250 };
        var (line, _) = Encode(profile, frame);
        Assert.Equal("L0999I250" + suffix, line);
        var telemetry = new OutputTelemetry();
        telemetry.RecordTCode(line);
        Assert.Equal(999, Assert.Single(telemetry.Snapshot.Targets).Value);
    }

    [Fact]
    public void OutputSpeedUnitsAndExplicitNoSlopeAreHonored()
    {
        var profile = OnlyL0();
        profile.L0.MaxSpeed = 100;
        var output = new OutputDeviceConfig { SpeedUnitBase = TCodeSpeedUnitBase.PerSecond };
        var frame = MotionAxisHelper.CreateNeutralFrame() with { L0 = 1, RequestedCommandMode = TCodeCommandMode.Speed, RequestedMotionValue = 50 };
        Assert.Equal("L0999S500", Encode(profile, frame, output).Line);
        Assert.Equal("L0999", Encode(profile, frame with { RequestedCommandMode = TCodeCommandMode.None }, output).Line);
    }

    [Fact]
    public void UnchangedMappedTargetsAreSuppressedButChangedInstructionsAreNot()
    {
        var profile = OnlyL0();
        var frame = MotionAxisHelper.CreateNeutralFrame() with { L0 = .7f, RequestedCommandMode = TCodeCommandMode.Interval, RequestedMotionValue = 100 };
        var first = Encode(profile, frame);
        var trackers = Trackers();
        Assert.Empty(TCodeEncoder.BuildLine(profile, null, first.EffectiveFrame, frame, trackers, null, frame, false).Line);
        var changedInstruction = frame with { RequestedMotionValue = 250 };
        Assert.EndsWith("I250", TCodeEncoder.BuildLine(profile, null, first.EffectiveFrame, frame, trackers, null, changedInstruction, false).Line);
    }

    [Fact]
    public void TelemetryIsPerOutputAndPreservesUntouchedAxesWhileRejectingMalformedTokens()
    {
        var clock = new ManualTimeProvider();
        var first = new OutputTelemetry(clock);
        var second = new OutputTelemetry(clock);
        first.RecordTCode("L0123I50 R00456");
        second.RecordTCode("L0999");
        clock.Advance(TimeSpan.FromMilliseconds(40));
        first.RecordTCode("L0456S100<> V0000I10=");
        first.RecordTCode("L0NaN DSTOP L099999 R3bad");
        Assert.Equal(456, first.Snapshot.Targets.Single(target => target.Key == "L0").Value);
        Assert.Equal(456, first.Snapshot.Targets.Single(target => target.Key == "R0").Value);
        Assert.Equal(999, Assert.Single(second.Snapshot.Targets).Value);
        Assert.Equal(clock.GetUtcNow(), first.Snapshot.LastSentAtUtc);
        second.RecordTarget("#1/Position", "Mock / 模拟", 125);
        second.RecordTarget("#1/Vibrate", "Mock / 模拟", double.NaN);
        Assert.Equal(100, second.Snapshot.Targets.Single(target => target.Key == "#1/Position").Value);
        Assert.DoesNotContain(second.Snapshot.Targets, target => target.Key.EndsWith("Vibrate"));
        second.RemovePrefix("#1/");
        Assert.Single(second.Snapshot.Targets);
        first.SetState("stopped", clear: true);
        Assert.Empty(first.Snapshot.Targets);
        Assert.Null(first.Snapshot.LastSentAtUtc);
    }

    [Fact]
    public async Task UdpConnectionNeverMovesAndMappedPreviewMatchesTheWireBeforeStopClearsIt()
    {
        using var receiver = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        var destination = new OutputDeviceConfig { Type = OutputDeviceType.TCodeUdp, Host = "127.0.0.1", Port = Port(receiver) };
        var profile = OnlyL0();
        profile.L0.Invert = true;
        profile.L0.RemapMin = 200;
        profile.L0.RemapMax = 800;
        profile.L0.Max = 600;
        using var adapter = new TCodeUdpOutput(destination, () => profile, new ManualTimeProvider());
        adapter.Connect();
        Assert.Equal(0, receiver.Available);
        Assert.Empty(adapter.Telemetry.Snapshot.Targets);
        adapter.Send(MotionAxisHelper.CreateNeutralFrame() with { L0 = .25f });
        Assert.Contains("L0600", await Datagram(receiver));
        Assert.Equal(600, Assert.Single(adapter.Telemetry.Snapshot.Targets).Value);
        adapter.EmergencyStop();
        Assert.Equal("DSTOP\n", await Datagram(receiver));
        Assert.Equal("stopped", adapter.Telemetry.Snapshot.State);
        Assert.Empty(adapter.Telemetry.Snapshot.Targets);
        adapter.Disconnect();
        Assert.False(adapter.IsConnected);
        Assert.Empty(adapter.Telemetry.Snapshot.Targets);
    }

    [Fact]
    public async Task UdpReplaysFullStateAfterVirtualLossWindowAndResendsAfterEmergencyStop()
    {
        using var receiver = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        var clock = new ManualTimeProvider();
        var destination = new OutputDeviceConfig { Type = OutputDeviceType.TCodeUdp, Host = "127.0.0.1", Port = Port(receiver) };
        using var adapter = new TCodeUdpOutput(destination, OnlyL0, clock);
        adapter.Connect();
        var frame = MotionAxisHelper.CreateNeutralFrame();
        adapter.Send(frame);
        var initial = await Datagram(receiver);
        adapter.Send(frame);
        Assert.Equal(0, receiver.Available);
        clock.Advance(TimeSpan.FromMilliseconds(1050));
        adapter.Send(frame);
        Assert.Equal(initial, await Datagram(receiver));
        adapter.EmergencyStop();
        Assert.Equal("DSTOP\n", await Datagram(receiver));
        adapter.Send(frame);
        Assert.Equal(initial, await Datagram(receiver));
    }

    [Fact]
    public async Task TcpConnectHasNoMotionAndStopResetsDeltaSuppression()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var accept = listener.AcceptTcpClientAsync();
        var destination = new OutputDeviceConfig { Type = OutputDeviceType.TCodeTcp, Host = "127.0.0.1", Port = ((IPEndPoint)listener.LocalEndpoint).Port };
        using var adapter = new TCodeTcpOutput(destination, OnlyL0);
        adapter.Connect();
        using var peer = await accept.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(0, peer.Available);
        using var reader = new StreamReader(peer.GetStream(), Encoding.ASCII, leaveOpen: true);
        var frame = MotionAxisHelper.CreateNeutralFrame() with { L0 = .6f };
        adapter.Send(frame);
        var first = await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(3));
        Assert.StartsWith("L0599I", first);
        adapter.Send(frame);
        Assert.Equal(0, peer.Available);
        adapter.EmergencyStop();
        Assert.Equal("DSTOP", await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(3)));
        adapter.Send(frame);
        Assert.Equal(first, await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(3)));
        adapter.Disconnect();
        Assert.Equal("DSTOP", await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(3)));
        Assert.False(adapter.IsConnected);
    }

    [Fact]
    public async Task CoordinatorChecksActivationAndDisposesTheOldTransportWhenTypeChanges()
    {
        using var receiver = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        var config = new AppConfig { Outputs = [new() { Id = "mock", Type = OutputDeviceType.TCodeUdp, Host = "127.0.0.1", Port = Port(receiver), Enabled = true }] };
        config.NormalizeForRuntime();
        await using var coordinator = new OutputCoordinator(config, _ => { }, _ => { }, _ => { });
        Assert.True(await coordinator.ConnectAsync("mock"));
        await coordinator.SendAsync(MotionAxisHelper.CreateNeutralFrame());
        Assert.Equal(0, receiver.Available);
        coordinator.CanSend = () => true;
        await coordinator.SendAsync(MotionAxisHelper.CreateNeutralFrame());
        Assert.Contains("L0", await Datagram(receiver));
        var candidate = new AppConfig();
        candidate.CopyFrom(config);
        candidate.Outputs[0].Type = OutputDeviceType.TCodeTcp;
        config.CopyFrom(candidate);
        await coordinator.ReloadAsync();
        Assert.Equal("DSTOP\n", await Datagram(receiver));
        Assert.False(coordinator.IsConnected("mock"));
    }

    private static (string Line, MotionFrame EffectiveFrame) Encode(TCodeMotionProfile profile, MotionFrame frame, OutputDeviceConfig? output = null) =>
        TCodeEncoder.BuildLine(profile, output, null, null, Trackers(), null, frame, true);

    private static Dictionary<MotionAxis, AxisVelocityTracker> Trackers() => MotionAxisHelper.All.ToDictionary(axis => axis, _ => new AxisVelocityTracker());

    private static int Port(UdpClient receiver) => ((IPEndPoint)receiver.Client.LocalEndPoint!).Port;

    private static async Task<string> Datagram(UdpClient receiver) =>
        Encoding.ASCII.GetString((await receiver.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(3))).Buffer);

    private static TCodeMotionProfile OnlyL0() => new()
    {
        L1 = new() { Mode = TCodeAxisMode.Ignored }, L2 = new() { Mode = TCodeAxisMode.Ignored },
        R0 = new() { Mode = TCodeAxisMode.Ignored }, R1 = new() { Mode = TCodeAxisMode.Ignored }, R2 = new() { Mode = TCodeAxisMode.Ignored },
        V0 = new() { Mode = TCodeAxisMode.Ignored }, V1 = new() { Mode = TCodeAxisMode.Ignored }, V2 = new() { Mode = TCodeAxisMode.Ignored },
        A0 = new() { Mode = TCodeAxisMode.Ignored }, A1 = new() { Mode = TCodeAxisMode.Ignored }, A2 = new() { Mode = TCodeAxisMode.Ignored }
    };
}
