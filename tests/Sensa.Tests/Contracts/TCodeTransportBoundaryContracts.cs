using System.Net;
using System.Net.Sockets;
using System.Text;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Outputs.TCode;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class TCodeTransportBoundaryContracts
{
    [Fact]
    public async Task Udp_explicit_axis_commands_repeat_without_waiting_for_the_full_state_refresh()
    {
        using var receiver = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        var destination = Destination(OutputDeviceType.TCodeUdp, ((IPEndPoint)receiver.Client.LocalEndPoint!).Port);
        using var output = new TCodeUdpOutput(destination, () => new(), new ManualTimeProvider());
        output.Connect();
        var frame = ExplicitVibration(.6f);
        output.Send(frame);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        var first = Encoding.ASCII.GetString((await receiver.ReceiveAsync(timeout.Token)).Buffer);
        output.Send(frame);
        var repeated = Encoding.ASCII.GetString((await receiver.ReceiveAsync(timeout.Token)).Buffer);
        Assert.Equal(first, repeated);
        Assert.StartsWith("V0599", repeated);
        Assert.DoesNotContain("L0", repeated);
        output.Send(frame with { V0 = 0 });
        Assert.StartsWith("V0000", Encoding.ASCII.GetString((await receiver.ReceiveAsync(timeout.Token)).Buffer));
        output.Send(frame with { V0 = 0 });
        Assert.StartsWith("V0000", Encoding.ASCII.GetString((await receiver.ReceiveAsync(timeout.Token)).Buffer));
    }

    [Fact]
    public async Task Tcp_explicit_axis_commands_repeat_and_keep_other_axes_off_the_wire()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var destination = Destination(OutputDeviceType.TCodeTcp, ((IPEndPoint)listener.LocalEndpoint).Port);
        using var output = new TCodeTcpOutput(destination, () => new());
        output.Connect();
        using var peer = await listener.AcceptTcpClientAsync().WaitAsync(TimeSpan.FromSeconds(3));
        using var reader = new StreamReader(peer.GetStream(), Encoding.ASCII);
        var frame = ExplicitVibration(.6f);
        output.Send(frame);
        var first = await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(3));
        output.Send(frame);
        var repeated = await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(first, repeated);
        Assert.StartsWith("V0599", repeated);
        Assert.DoesNotContain("L0", repeated);
    }

    [Theory]
    [InlineData('x')]
    [InlineData('\r')]
    public void Device_info_rejects_an_unterminated_line_after_a_bounded_number_of_bytes(char reply)
    {
        var clock = new ManualTimeProvider();
        var reads = 0;
        Assert.Throws<InvalidDataException>(() => TCodeSerialOutput.ReadRawDeviceInfoLine(
            () => { reads++; return reply; }, clock, clock.GetTimestamp()));
        Assert.Equal(TCodeSerialOutput.MaximumDeviceInfoLineBytes + 1, reads);
    }

    [Fact]
    public void Device_info_deadline_is_shared_across_reply_lines_and_stops_a_continuous_trickle()
    {
        var clock = new ManualTimeProvider();
        var started = clock.GetTimestamp();
        var first = new Queue<int>(Encoding.ASCII.GetBytes("ok\r\n").Select(value => (int)value));
        Assert.Equal("ok", Encoding.ASCII.GetString(TCodeSerialOutput.ReadRawDeviceInfoLine(() =>
        {
            clock.Advance(TimeSpan.FromMilliseconds(100));
            return first.Dequeue();
        }, clock, started)!));
        var reads = 0;
        Assert.Throws<TimeoutException>(() => TCodeSerialOutput.ReadRawDeviceInfoLine(() =>
        {
            reads++;
            clock.Advance(TimeSpan.FromMilliseconds(100));
            return 'x';
        }, clock, started));
        Assert.Equal(1, reads);
    }

    [Fact]
    public void Device_info_preserves_a_partial_reply_when_the_device_goes_idle()
    {
        var clock = new ManualTimeProvider();
        var reply = new Queue<int>(Encoding.UTF8.GetBytes("firmware ✓").Select(value => (int)value));
        var bytes = TCodeSerialOutput.ReadRawDeviceInfoLine(
            () => reply.Count > 0 ? reply.Dequeue() : throw new TimeoutException(), clock, clock.GetTimestamp());
        Assert.Equal("firmware ✓", Encoding.UTF8.GetString(bytes!));
    }

    private static OutputDeviceConfig Destination(OutputDeviceType type, int port) => new()
    {
        Type = type, Host = "127.0.0.1", Port = port,
    };

    private static MotionFrame ExplicitVibration(float value) => MotionAxisHelper.CreateNeutralFrame() with
    {
        V0 = value, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.V0 },
        RequestedCommandMode = TCodeCommandMode.None, DeltaMs = 50,
    };
}
