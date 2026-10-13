using System.Net;
using System.Net.Sockets;
using System.Threading.Channels;
using Sensa.Input.Osc;
using Xunit;

namespace Sensa.Tests;

public class OscReceiverTests
{
    [Fact]
    public async Task IdleListenerCanRebindStopAndRestartWithoutLosingItsNewSocket()
    {
        using var first = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        using var second = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        int firstPort = ((IPEndPoint)first.Client.LocalEndPoint!).Port;
        int secondPort = ((IPEndPoint)second.Client.LocalEndPoint!).Port;
        first.Close();
        second.Close();
        using var receiver = new OscInputReceiver(new OscParameterStore(), "127.0.0.1", firstPort);
        using var sender = new UdpClient();
        var packets = Channel.CreateUnbounded<byte>();
        receiver.OnUnhandledPacket += (data, _) => packets.Writer.TryWrite(data[0]);

        async Task CheckReceive(byte value)
        {
            await sender.SendAsync(new byte[] { value }, new IPEndPoint(IPAddress.Loopback, receiver.Port));
            Assert.Equal(value, await packets.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3)));
            // Allow the next read to be pending when the lifecycle changes.
            await Task.Delay(30);
        }

        receiver.Start();
        for (byte i = 1; i <= 4; i++)
        {
            await CheckReceive(i);
            int previous = receiver.Port;
            await Task.Run(() => receiver.Reconfigure("127.0.0.1", previous == firstPort ? secondPort : firstPort))
                .WaitAsync(TimeSpan.FromSeconds(3));
            Assert.True(receiver.IsRunning);
            using var released = new UdpClient(new IPEndPoint(IPAddress.Loopback, previous));
        }
        await CheckReceive(5);
        await Task.Run(receiver.Stop).WaitAsync(TimeSpan.FromSeconds(3));
        Assert.False(receiver.IsRunning);
        receiver.Start();
        await CheckReceive(6);
    }

    [Fact]
    public async Task FailedRebindRestoresThePreviousListener()
    {
        using var reserved = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        using var free = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        int oldPort = ((IPEndPoint)free.Client.LocalEndPoint!).Port;
        int busyPort = ((IPEndPoint)reserved.Client.LocalEndPoint!).Port;
        free.Close();
        using var receiver = new OscInputReceiver(new OscParameterStore(), "127.0.0.1", oldPort);
        receiver.Start();
        await Task.Delay(30);
        await Task.Run(() => Assert.Throws<SocketException>(() => receiver.Reconfigure("127.0.0.1", busyPort)))
            .WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(receiver.IsRunning);
        Assert.Equal(oldPort, receiver.Port);
        var packet = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        receiver.OnUnhandledPacket += (_, _) => packet.TrySetResult();
        using var sender = new UdpClient();
        await sender.SendAsync(new byte[] { 1 }, new IPEndPoint(IPAddress.Loopback, oldPort));
        await packet.Task.WaitAsync(TimeSpan.FromSeconds(3));
    }
}
