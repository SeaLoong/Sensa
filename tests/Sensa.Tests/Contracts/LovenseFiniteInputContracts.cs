using System.Net;
using System.Text;
using Microsoft.AspNetCore.Http;
using Sensa.Input.Protocols;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Real lease store and virtual time; no remote service or hardware is contacted.</summary>
public sealed class LovenseFiniteInputContracts
{
    [Fact]
    public async Task A_finite_Function_outlives_the_stream_timeout_and_stops_at_its_requested_total_time()
    {
        var clock = new ManualTimeProvider();
        var config = Config();
        using var store = new ExternalControlStore([config], clock);
        using var input = new HttpProtocolInput(config, store, clock);
        Assert.Equal(200, await Command(input, """{"command":"Function","action":"Vibrate:12","timeSec":20,"apiVer":1}"""));
        clock.Advance(TimeSpan.FromSeconds(12));
        Assert.NotNull(store.GetStatus(config.Id)!.Session);
        Assert.Equal(.6f, store.Read("lovense/V0", Now(clock)).Value);
        clock.Advance(TimeSpan.FromSeconds(8));
        Assert.False(store.Read("lovense/V0", Now(clock)).Valid);
        var count = store.GetStatus(config.Id)!.ReceivedCommands;
        clock.Advance(TimeSpan.FromSeconds(10));
        Assert.Null(store.GetStatus(config.Id)!.Session);
        Assert.Equal(count, store.GetStatus(config.Id)!.ReceivedCommands);
    }

    [Fact]
    public async Task The_official_twenty_second_loop_survives_a_pause_longer_than_the_stream_lease()
    {
        var clock = new ManualTimeProvider();
        var config = Config(); config.TimeoutMs = 1000;
        using var store = new ExternalControlStore([config], clock);
        using var input = new HttpProtocolInput(config, store, clock);
        Assert.Equal(200, await Command(input, """{"command":"Function","action":"Vibrate:12","timeSec":20,"loopRunningSec":9,"loopPauseSec":4,"apiVer":1}"""));
        clock.Advance(TimeSpan.FromMilliseconds(9500));
        Assert.NotNull(store.GetStatus(config.Id)!.Session);
        Assert.Equal(0, store.Read("lovense/V0", Now(clock)).Value);
        clock.Advance(TimeSpan.FromMilliseconds(4000));
        Assert.Equal(.6f, store.Read("lovense/V0", Now(clock)).Value);
        clock.Advance(TimeSpan.FromMilliseconds(6500));
        Assert.False(store.Read("lovense/V0", Now(clock)).Valid);
    }

    [Theory]
    [InlineData("")]
    [InlineData(",\"loopRunningSec\":9,\"loopPauseSec\":4")]
    public async Task Indefinite_Functions_remain_stream_leases_and_do_not_self_renew(string loop)
    {
        var clock = new ManualTimeProvider();
        var config = Config(); config.TimeoutMs = 1000;
        using var store = new ExternalControlStore([config], clock);
        using var input = new HttpProtocolInput(config, store, clock);
        Assert.Equal(200, await Command(input, "{\"command\":\"Function\",\"action\":\"Vibrate:12\",\"timeSec\":0" + loop + "}"));
        var count = store.GetStatus(config.Id)!.ReceivedCommands;
        clock.Advance(TimeSpan.FromSeconds(14));
        Assert.Null(store.GetStatus(config.Id)!.Session);
        Assert.False(store.Read("lovense/V0", Now(clock)).Valid);
        Assert.Equal(count, store.GetStatus(config.Id)!.ReceivedCommands);
    }

    [Fact]
    public async Task Clearing_input_cancels_a_finite_loop_without_late_resume_or_self_renewal()
    {
        var clock = new ManualTimeProvider();
        var config = Config(); config.TimeoutMs = 1000;
        using var store = new ExternalControlStore([config], clock);
        using var input = new HttpProtocolInput(config, store, clock);
        Assert.Equal(200, await Command(input, """{"command":"Function","action":"Vibrate:12","timeSec":20,"loopRunningSec":2,"loopPauseSec":2}"""));
        clock.Advance(TimeSpan.FromMilliseconds(500));
        store.ClearCommands();
        var count = store.GetStatus(config.Id)!.ReceivedCommands;
        clock.Advance(TimeSpan.FromSeconds(25));
        Assert.False(store.Read("lovense/V0", Now(clock)).Valid);
        Assert.Null(store.GetStatus(config.Id)!.Session);
        Assert.Equal(count, store.GetStatus(config.Id)!.ReceivedCommands);
    }

    private static long Now(ManualTimeProvider clock) => clock.GetUtcNow().ToUnixTimeMilliseconds();
    private static ProtocolInputConfig Config() => new()
    {
        Id = "lovense", Type = "LovenseHttp", Enabled = true, TimeoutMs = 10000,
        Features = [new() { Channel = "V0", Name = "Vibration", Actuator = "Scalar", ScalarType = "Vibrate", TargetAxis = "V0" }],
    };
    private static async Task<int> Command(HttpProtocolInput input, string json)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = "POST"; context.Request.Path = "/command";
        context.Request.ContentType = "application/json";
        var bytes = Encoding.UTF8.GetBytes(json);
        context.Request.Body = new MemoryStream(bytes); context.Request.ContentLength = bytes.Length;
        context.Connection.RemoteIpAddress = IPAddress.Loopback;
        context.Request.Headers.Origin = "https://isolated.example";
        context.Response.Body = new MemoryStream();
        await input.HandleAsync(context);
        return context.Response.StatusCode;
    }
}
