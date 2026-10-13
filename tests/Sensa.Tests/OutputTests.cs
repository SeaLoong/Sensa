using System.Net;
using System.Net.Sockets;
using System.Text;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Outputs;
using Sensa.Outputs.TCode;
using Xunit;

namespace Sensa.Tests;

public class OutputTests
{
    [Fact] public async Task PerOutputPreviewUsesTheTransmittedMappedTargetsAndClearsOnStop()
    {
        using var receiver=new UdpClient(new IPEndPoint(IPAddress.Loopback,0));
        var output=new OutputDeviceConfig{Type=OutputDeviceType.TCodeUdp,Host="127.0.0.1",Port=((IPEndPoint)receiver.Client.LocalEndPoint!).Port};
        var profile=new TCodeMotionProfile();profile.L0.Invert=true;profile.L0.RemapMin=200;profile.L0.RemapMax=800;profile.L0.Max=600;profile.R0.Mode=TCodeAxisMode.Ignored;
        using var adapter=new TCodeUdpOutput(output,()=>profile);adapter.Connect();Assert.Empty(adapter.Telemetry.Snapshot.Targets);
        adapter.Send(MotionAxisHelper.CreateNeutralFrame() with {L0=.25f});
        var wire=Encoding.ASCII.GetString((await receiver.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(2))).Buffer);Assert.Contains("L0600",wire);
        var snapshot=adapter.Telemetry.Snapshot;Assert.Equal("sent",snapshot.State);Assert.NotNull(snapshot.LastSentAtUtc);
        Assert.Equal(600,snapshot.Targets.Single(t=>t.Key=="L0").Value);Assert.DoesNotContain(snapshot.Targets,t=>t.Key=="R0");
        adapter.EmergencyStop();Assert.Equal("DSTOP\n",Encoding.ASCII.GetString((await receiver.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(2))).Buffer));
        Assert.Equal("stopped",adapter.Telemetry.Snapshot.State);Assert.Empty(adapter.Telemetry.Snapshot.Targets);
        adapter.Disconnect();Assert.Empty(adapter.Telemetry.Snapshot.Targets);
    }
    [Fact] public void TelemetryKeepsIndependentTargetsAndIgnoresInvalidCommands()
    {
        var first=new OutputTelemetry();var second=new OutputTelemetry();first.RecordTCode("L0123I50 R00456");second.RecordTCode("L0999");
        first.RecordTCode("L0456S100 V0000");Assert.Equal(456,first.Snapshot.Targets.Single(t=>t.Key=="R0").Value);Assert.Equal(999,second.Snapshot.Targets.Single().Value);
        first.RecordTCode("L0NaN DSTOP L099999");Assert.Equal(456,first.Snapshot.Targets.Single(t=>t.Key=="L0").Value);
        second.RecordTarget("#1/Position","Mock · 位置",25);second.RecordTarget("#1/Vibrate","Mock · 震动",double.NaN);Assert.DoesNotContain(second.Snapshot.Targets,t=>t.Key.EndsWith("Vibrate"));
        second.RemovePrefix("#1/");Assert.Single(second.Snapshot.Targets);
    }
    [Fact]
    public async Task ConnectingDoesNotMoveAndReplacingTypeDisposesOldTransport()
    {
        using var receiver = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        var port = ((IPEndPoint)receiver.Client.LocalEndPoint!).Port;
        var config = new AppConfig { Outputs = [new() { Id = "test", Type = OutputDeviceType.TCodeUdp, Host = "127.0.0.1", Port = port, Enabled = true }] };
        config.NormalizeForRuntime();
        await using var coordinator = new OutputCoordinator(config, _ => { }, _ => { }, _ => { });
        Assert.True(await coordinator.ConnectAsync("test"));
        await Task.Delay(50); Assert.Equal(0, receiver.Available);
        var candidate = new AppConfig(); candidate.CopyFrom(config);
        candidate.Outputs[0].Type = OutputDeviceType.TCodeTcp;
        config.CopyFrom(candidate);
        await coordinator.ReloadAsync();
        var stop = await receiver.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(2));
        Assert.Equal("DSTOP\n", Encoding.ASCII.GetString(stop.Buffer));
    }

    [Fact]
    public async Task UdpRefreshReplaysFullStateAfterLossWindow()
    {
        using var receiver = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        var output = new OutputDeviceConfig { Type = OutputDeviceType.TCodeUdp, Host = "127.0.0.1", Port = ((IPEndPoint)receiver.Client.LocalEndPoint!).Port };
        using var adapter = new TCodeUdpOutput(output, () => new TCodeMotionProfile());
        adapter.Connect();
        var frame = MotionAxisHelper.CreateNeutralFrame();
        adapter.Send(frame);
        var initial = await receiver.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(2));
        adapter.Send(frame); Assert.Equal(0, receiver.Available);
        await Task.Delay(1050); adapter.Send(frame);
        var replay = await receiver.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(2));
        Assert.Equal(initial.Buffer, replay.Buffer);
    }
}
