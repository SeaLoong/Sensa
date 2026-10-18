using System.Net;
using System.Net.Sockets;
using System.Text;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Fixed-target OSC control, with mock UDP and virtual time / 固定目标、模拟 UDP 与虚拟时钟。</summary>
public sealed class OgbControlContracts
{
    [Fact]
    public async Task Heartbeat_requires_opt_in_and_a_running_osc_mode_then_sends_every_five_seconds()
    {
        using var peer = BoundUdp();
        var clock = new ManualTimeProvider();
        using var service = new OgbControlService(clock);
        var config = Target(peer);
        config.Enabled = false;
        service.Configure(config, true); clock.Advance(TimeSpan.FromSeconds(15));
        Assert.False(service.Snapshot().Active); Assert.Equal(0, peer.Available);
        config.Enabled = true;
        service.Configure(config, false); clock.Advance(TimeSpan.FromSeconds(15));
        Assert.False(service.Snapshot().Active); Assert.Equal(0, peer.Available);
        service.Configure(config, true); await Expect(peer, true);
        Assert.True(service.Snapshot().Active);
        clock.Advance(TimeSpan.FromMilliseconds(4999)); Assert.Equal(0, peer.Available);
        clock.Advance(TimeSpan.FromMilliseconds(1)); await Expect(peer, true);
        service.Configure(config, false); await Expect(peer, false);
        clock.Advance(TimeSpan.FromSeconds(20));
        Assert.False(service.Snapshot().Active); Assert.Equal(0, peer.Available);
        Assert.False(service.Snapshot().LastSentValue);
    }

    [Fact]
    public async Task Reconfiguration_disables_the_previous_explicit_target_before_enabling_the_new_one()
    {
        using var first = BoundUdp(); using var second = BoundUdp();
        var clock = new ManualTimeProvider();
        using var service = new OgbControlService(clock);
        service.Configure(Target(first), true); await Expect(first, true);
        service.Configure(Target(second), true);
        await Expect(first, false); await Expect(second, true);
        clock.Advance(TimeSpan.FromSeconds(5)); await Expect(second, true);
        Assert.Equal(0, first.Available);
        service.Configure(new() { Enabled = false }, true); await Expect(second, false);
        clock.Advance(TimeSpan.FromSeconds(10)); Assert.Equal(0, second.Available);
    }

    [Fact]
    public async Task Repeated_sync_does_not_restart_the_timer_and_dispose_sends_false_only_once()
    {
        using var peer = BoundUdp();
        var clock = new ManualTimeProvider();
        var service = new OgbControlService(clock);
        var config = Target(peer);
        service.Configure(config, true); await Expect(peer, true);
        clock.Advance(TimeSpan.FromSeconds(2)); service.Configure(config, true);
        Assert.Equal(0, peer.Available);
        clock.Advance(TimeSpan.FromSeconds(3)); await Expect(peer, true);
        service.Dispose(); await Expect(peer, false);
        service.Dispose(); service.Configure(config, true);
        clock.Advance(TimeSpan.FromSeconds(20)); Assert.Equal(0, peer.Available);
    }

    [Fact]
    public async Task Invalid_target_stops_an_existing_heartbeat_and_surfaces_an_error()
    {
        using var peer = BoundUdp();
        var clock = new ManualTimeProvider();
        using var service = new OgbControlService(clock);
        service.Configure(Target(peer), true); await Expect(peer, true);
        service.Configure(new() { Enabled = true, Host = "not-an-ip.invalid", Port = 9000 }, true);
        await Expect(peer, false);
        Assert.False(service.Snapshot().Active);
        Assert.NotEmpty(service.Snapshot().LastError);
        clock.Advance(TimeSpan.FromSeconds(20)); Assert.Equal(0, peer.Available);
    }

    [Fact]
    public void Configuration_copy_is_independent_and_old_configs_keep_control_disabled()
    {
        var original = new AppConfig();
        Assert.False(original.Osc.OgbControl.Enabled);
        original.Osc.OgbControl = new() { Enabled = true, Host = " ::1 ", Port = 19000 };
        var copy = new AppConfig(); copy.CopyFrom(original);
        original.Osc.OgbControl.Port = 19001;
        Assert.Equal("::1", copy.Osc.OgbControl.Host);
        Assert.Equal(19000, copy.Osc.OgbControl.Port);
        Assert.True(copy.Osc.OgbControl.Enabled);
    }

    [Theory]
    [InlineData("127.0.0.1", "localhost")]
    [InlineData("127.0.0.1", "::ffff:127.0.0.1")]
    [InlineData("0.0.0.0", "127.0.0.1")]
    [InlineData("::", "::1")]
    public void Control_cannot_loop_into_the_sensa_listener(string listenHost, string targetHost)
    {
        var config = new AppConfig();
        config.Osc.ReceiverHost = listenHost; config.Osc.ReceiverPort = 19000;
        config.Osc.OgbControl = new() { Enabled = true, Host = targetHost, Port = 19000 };
        Assert.Throws<InvalidOperationException>(config.ValidateOgbControlTarget);
        config.Osc.OgbControl.Port = 19001;
        config.ValidateOgbControlTarget();
    }

    [Theory]
    [InlineData("0.0.0.0")]
    [InlineData("::")]
    [InlineData("::ffff:0.0.0.0")]
    [InlineData("::ffff:224.0.0.1")]
    [InlineData("255.255.255.255")]
    [InlineData("224.0.0.1")]
    [InlineData("ff02::1")]
    [InlineData("example.invalid")]
    public void A_control_target_must_be_an_explicit_unicast_ip(string host) =>
        Assert.Throws<InvalidOperationException>(() => new OgbControlConfig { Enabled = true, Host = host }.ResolveTarget());

    private static UdpClient BoundUdp() => new(new IPEndPoint(IPAddress.Loopback, 0));
    private static OgbControlConfig Target(UdpClient socket) => new()
    {
        Enabled = true, Host = "127.0.0.1", Port = ((IPEndPoint)socket.Client.LocalEndPoint!).Port,
    };

    private static async Task Expect(UdpClient socket, bool enabled)
    {
        var received = await socket.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(3));
        var end = Array.IndexOf(received.Buffer, (byte)0);
        Assert.Equal("/avatar/parameters/OGB_ENABLED", Encoding.ASCII.GetString(received.Buffer, 0, end));
        var tagsOffset = (end + 4) & ~3;
        var tagsEnd = Array.IndexOf(received.Buffer, (byte)0, tagsOffset);
        Assert.Equal(enabled ? ",T" : ",F", Encoding.ASCII.GetString(received.Buffer, tagsOffset, tagsEnd - tagsOffset));
        Assert.Equal((tagsEnd + 4) & ~3, received.Buffer.Length);
    }
}
