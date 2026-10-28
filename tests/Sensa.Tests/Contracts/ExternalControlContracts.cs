using System.Net;
using Sensa.Configuration;
using Sensa.Input.Protocols;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class ExternalControlContracts
{
    private static ProtocolInputConfig Input() => new() { Id = "bridge", Enabled = true, TimeoutMs = 1000 };

    [Fact]
    public void Unknown_initial_position_is_not_invented_but_the_accepted_target_and_arrival_are_available()
    {
        var clock = new ManualTimeProvider();
        using var store = new ExternalControlStore([Input()], clock);
        Assert.True(store.TryAcquire("bridge", "client", out _));
        Assert.True(store.Publish("bridge", "client", [new("L0", .8, 400)], out _));
        Assert.False(store.Read("bridge/L0", Now(clock)).Valid);
        Assert.Equal(.8f, store.Read("bridge/L0/target", Now(clock)).Value);
        clock.Advance(TimeSpan.FromMilliseconds(400));
        Assert.Equal(.8f, store.Read("bridge/L0", Now(clock)).Value);
        Assert.True(store.Publish("bridge", "client", [new("L0", .2, 400)], out _));
        clock.Advance(TimeSpan.FromMilliseconds(200));
        Assert.Equal(.5f, store.Read("bridge/L0", Now(clock)).Value!.Value, 5);
    }

    [Fact]
    public void A_replacement_trajectory_starts_from_the_current_interpolated_command_position()
    {
        var clock = new ManualTimeProvider();
        using var store = new ExternalControlStore([Input()], clock);
        Assert.True(store.TryAcquire("bridge", "client", out _));
        Assert.True(store.Publish("bridge", "client", [new("L0", .2)], out _));
        Assert.True(store.Publish("bridge", "client", [new("L0", 1, 800)], out _));
        clock.Advance(TimeSpan.FromMilliseconds(200));
        Assert.Equal(.4f, store.Read("bridge/L0", Now(clock)).Value!.Value, 5);
        Assert.True(store.Publish("bridge", "client", [new("L0", 0, 400)], out _));
        clock.Advance(TimeSpan.FromMilliseconds(200));
        Assert.Equal(.2f, store.Read("bridge/L0", Now(clock)).Value!.Value, 5);
    }

    [Theory]
    [InlineData(double.NaN, 0)]
    [InlineData(double.PositiveInfinity, 0)]
    [InlineData(-.01, 0)]
    [InlineData(1.01, 0)]
    [InlineData(.5, -1)]
    [InlineData(.5, 600001)]
    public void Invalid_batches_leave_all_previous_channels_and_the_lease_timestamp_unchanged(double value, int duration)
    {
        var clock = new ManualTimeProvider();
        var input = Input(); input.Features.Add(new() { Channel = "R0", TargetAxis = "R0" });
        using var store = new ExternalControlStore([input], clock);
        Assert.True(store.TryAcquire("bridge", "client", out _));
        Assert.True(store.Publish("bridge", "client", [new("L0", .25)], out _));
        clock.Advance(TimeSpan.FromMilliseconds(500));
        Assert.False(store.Publish("bridge", "client", [new("L0", .75), new("R0", value, duration)], out _));
        Assert.Equal(.25f, store.Read("bridge/L0", Now(clock)).Value);
        clock.Advance(TimeSpan.FromMilliseconds(500));
        Assert.False(store.Read("bridge/L0", Now(clock)).Valid);
    }

    [Fact]
    public void Only_the_owner_can_refresh_stop_release_or_replace_a_channel_and_expiry_revokes_the_old_owner()
    {
        var clock = new ManualTimeProvider();
        using var store = new ExternalControlStore([Input()], clock);
        Assert.True(store.TryAcquire("bridge", "owner", out _));
        Assert.False(store.TryAcquire("bridge", "other", out _));
        Assert.True(store.Publish("bridge", "owner", [new("L0", .6)], out _));
        store.Stop("bridge", "other"); store.Release("bridge", "other"); store.Heartbeat("bridge", "other");
        Assert.Equal(.6f, store.Read("bridge/L0", Now(clock)).Value);
        clock.Advance(TimeSpan.FromMilliseconds(1000));
        Assert.False(store.Publish("bridge", "owner", [new("L0", .8)], out _));
        Assert.True(store.TryAcquire("bridge", "new", out _));
        Assert.False(store.Publish("bridge", "owner", [new("L0", .8)], out _));
        Assert.False(store.Read("bridge/L0", Now(clock)).Valid);
    }

    [Fact]
    public void Rotation_retains_speed_and_direction_as_separate_computable_metrics()
    {
        var clock = new ManualTimeProvider(); var input = Input();
        input.Features = [new() { Channel = "rotation", Actuator = "Rotation", TargetAxis = "" }];
        using var store = new ExternalControlStore([input], clock);
        Assert.True(store.TryAcquire("bridge", "client", out _));
        Assert.True(store.Publish("bridge", "client", [new("rotation", .7, Clockwise: false)], out _));
        Assert.Equal(.7f, store.Read("bridge/rotation/speed", Now(clock)).Value);
        Assert.Equal(0f, store.Read("bridge/rotation/clockwise", Now(clock)).Value);
        Assert.False(store.Read("bridge/rotation/nonsense", Now(clock)).Valid);
    }

    [Fact]
    public void Clear_and_reconfigure_invalidate_old_batches_even_with_the_same_client_name()
    {
        var input = Input(); using var store = new ExternalControlStore([input]);
        ExternalControlBatch? batch = null; store.CommandsReceived += value => batch = value;
        Assert.True(store.TryAcquire("bridge", "same", out _));
        Assert.True(store.Publish("bridge", "same", [new("L0", .5)], out _));
        var old = batch!;
        store.ClearCommands(); Assert.False(store.IsCurrent(old, "L0"));
        store.Configure([input]); Assert.True(store.TryAcquire("bridge", "same", out _));
        Assert.True(store.Publish("bridge", "same", [new("L0", .8)], out _));
        Assert.False(store.IsCurrent(old, "L0")); Assert.True(store.IsCurrent(batch!, "L0"));
    }

    [Theory]
    [InlineData("https://allowed.example", "127.0.0.1", "127.0.0.1", true)]
    [InlineData("https://other.example", "127.0.0.1", "127.0.0.1", false)]
    [InlineData("null", "localhost", "127.0.0.1", false)]
    [InlineData("", "localhost", "127.0.0.1", true)]
    [InlineData("", "localhost", "192.168.1.2", false)]
    [InlineData("https://allowed.example", "rebinding.example", "127.0.0.1", false)]
    public void Browser_origin_and_host_are_both_checked_and_bare_native_clients_are_local(string origin, string host, string peer, bool allowed)
    {
        var input = Input(); input.AllowedOrigins = ["https://allowed.example"];
        Assert.Equal(allowed, ProtocolInputCoordinator.IsRequestAllowed(input, host, origin, IPAddress.Parse(peer)));
    }

    [Theory]
    [InlineData("*")]
    [InlineData("https://site.example/path")]
    [InlineData("https://site.example/?token=secret")]
    [InlineData("https://user:password@site.example")]
    public void Origin_configuration_rejects_wildcards_paths_and_credentials(string origin)
    {
        var input = Input(); input.AllowedOrigins = [origin];
        Assert.Throws<ArgumentException>(() => ProtocolInputConfiguration.CloneAndValidate([input]));
    }

    [Fact]
    public void Direct_axis_conflicts_and_protocol_feedback_loops_are_rejected_before_listeners_start()
    {
        var first = Input(); var second = Input(); second.Id = "other"; second.Port++;
        Assert.Throws<ArgumentException>(() => ProtocolInputConfiguration.CloneAndValidate([first, second]));
        second.RouteToMotion = false;
        Assert.Equal(2, ProtocolInputConfiguration.CloneAndValidate([first, second]).Count);
        var config = new AppConfig { ProtocolInputs = [first], Outputs = [new() { Id = "loop", Type = OutputDeviceType.Intiface, WebsocketAddress = "ws://localhost:12400" }] };
        Assert.Throws<ArgumentException>(() => config.NormalizeForRuntime());
    }

    [Fact]
    public void A_WSDM_virtual_device_cannot_be_rediscovered_by_an_output_to_the_same_Central_host()
    {
        var input = Input(); input.Type = "IntifaceDevice"; input.Address = "ws://127.0.0.1:54817";
        var output = new OutputDeviceConfig { Id = "central", Type = OutputDeviceType.Intiface, Enabled = true, WebsocketAddress = "ws://localhost:12345" };
        var config = new AppConfig { ProtocolInputs = [input], Outputs = [output] };
        Assert.Throws<ArgumentException>(() => config.NormalizeForRuntime());
        output.Enabled = false;
        config.NormalizeForRuntime();
    }

    [Theory]
    [InlineData(OutputDeviceType.Handy)]
    [InlineData(OutputDeviceType.Autoblow)]
    [InlineData(OutputDeviceType.VacuGlide)]
    [InlineData(OutputDeviceType.Lovense)]
    public void Vendor_duplicate_target_validation_never_exposes_the_connection_key(OutputDeviceType type)
    {
        var first = new OutputDeviceConfig { Id = "one", Type = type };
        first.Device.ConnectionKey = "test-only-private-key"; first.Device.DeviceId = "test-only-private-id";
        var second = new OutputDeviceConfig { Id = "two", Type = type, Device = Sensa.Outputs.Devices.DeviceProtocolOptions.Clone(first.Device) };
        var config = new AppConfig { Outputs = [first, second] };
        config.NormalizeForRuntime();
        var error = Assert.Throws<InvalidOperationException>(() => config.ValidateUniqueOutputTargets());
        Assert.DoesNotContain("test-only-private-key", error.Message);
        Assert.DoesNotContain("test-only-private-id", error.Message);
    }

    private static long Now(TimeProvider clock) => clock.GetUtcNow().ToUnixTimeMilliseconds();
}
