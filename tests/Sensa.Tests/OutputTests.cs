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
