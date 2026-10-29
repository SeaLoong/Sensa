using System.Net;
using System.Net.Sockets;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Server.Kestrel.Transport.Sockets;
using Microsoft.Extensions.DependencyInjection;
using Sensa.Hosting;
using Sensa.Input.Osc;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class DesktopInstanceContracts
{
    [Fact]
    public void Named_and_fresh_instances_have_independent_configurations_and_keep_host_arguments()
    {
        var original = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "desktop-parent", "config.json"));
        var named = DesktopLaunchOptions.Parse(["--instance", "studio-2", "--open-browser", "false"], original);
        Assert.Equal(Path.Combine(Path.GetDirectoryName(original)!, "instances", "studio-2", "config.json"), named.ConfigPath);
        Assert.Equal(["--open-browser", "false"], named.HostArguments);
        var fresh = DesktopLaunchOptions.Parse(["--new-instance"], original, () => "unique-session");
        Assert.EndsWith(Path.Combine("instances", "unique-session", "config.json"), fresh.ConfigPath);
        var alternate = DesktopLaunchOptions.Parse(["--config", original, "--instance=third"], "unused.json");
        Assert.EndsWith(Path.Combine("instances", "third", "config.json"), alternate.ConfigPath);
    }

    [Theory]
    [InlineData("../outside")]
    [InlineData("a/b")]
    [InlineData(".")]
    [InlineData("")]
    [InlineData("name:port")]
    public void Instance_names_cannot_escape_the_profile_directory(string name) =>
        Assert.Throws<ArgumentException>(() => DesktopLaunchOptions.Parse(["--instance", name], "config.json"));

    [Fact]
    public void Conflicting_or_incomplete_launch_arguments_are_rejected()
    {
        Assert.Throws<ArgumentException>(() => DesktopLaunchOptions.Parse(["--instance"], "config.json"));
        Assert.Throws<ArgumentException>(() => DesktopLaunchOptions.Parse(["--config"], "config.json"));
        Assert.Throws<ArgumentException>(() => DesktopLaunchOptions.Parse(["--new-instance", "--instance", "a"], "config.json"));
        Assert.Throws<ArgumentException>(() => DesktopLaunchOptions.Parse(["--config=a", "--config=b"], "config.json"));
    }

    [Fact]
    public async Task One_configuration_has_one_owner_and_duplicate_launches_only_request_its_ui()
    {
        var directory = Path.Combine(Path.GetTempPath(), "sensa-instance-contract-" + Guid.NewGuid().ToString("N"));
        try
        {
            var path = Path.Combine(directory, "config.json");
            var commands = new List<bool>();
            await using (var owner = DesktopInstanceCoordinator.TryAcquire(path))
            {
                Assert.NotNull(owner);
                Assert.Null(DesktopInstanceCoordinator.TryAcquire(path));
                await using var separate = DesktopInstanceCoordinator.TryAcquire(Path.Combine(directory, "another.json"));
                Assert.NotNull(separate);
                owner.Start(open => { lock (commands) commands.Add(open); return Task.CompletedTask; });
                Assert.True(await DesktopInstanceCoordinator.NotifyOwnerAsync(path, true));
                Assert.True(await DesktopInstanceCoordinator.NotifyOwnerAsync(path, false));
                Assert.Equal([true, false], commands);
            }
            // The old lock file remains, but no stale process metadata prevents restart.
            await using var next = DesktopInstanceCoordinator.TryAcquire(path);
            Assert.NotNull(next);
        }
        finally { Directory.Delete(directory, recursive: true); }
    }

    [Fact]
    public void Page_presence_tracks_pages_and_expiry_without_reopening_user_closed_tabs_on_a_timer()
    {
        var now = DateTimeOffset.Parse("2026-01-01T00:00:00Z");
        var pages = new BrowserPagePresence(() => now);
        Assert.True(pages.TryBeginLaunch());
        Assert.False(pages.TryBeginLaunch());
        now += TimeSpan.FromSeconds(4);
        Assert.True(pages.Update("tab-a", true));
        Assert.True(pages.Update("tab-b", true));
        Assert.False(pages.TryBeginLaunch());
        Assert.True(pages.Update("tab-a", false));
        Assert.False(pages.TryBeginLaunch());
        now += BrowserPagePresence.Lifetime;
        Assert.True(pages.TryBeginLaunch());
        Assert.False(pages.Update("../arbitrary-id", true));
    }

    [Fact]
    public async Task Two_instances_keep_independent_cookies_in_one_host_wide_browser_cookie_jar()
    {
        var first = new LocalAccessPolicy(); var second = new LocalAccessPolicy();
        static DefaultHttpContext Request(int port, string path, string? cookies = null)
        {
            var context = new DefaultHttpContext();
            context.Connection.RemoteIpAddress = IPAddress.Loopback;
            context.Connection.LocalPort = port;
            context.Request.Host = new HostString("127.0.0.1", port);
            context.Request.Method = "GET"; context.Request.Path = path;
            if (cookies is not null) context.Request.Headers.Cookie = cookies;
            return context;
        }
        var a = Request(5086, "/api/session"); var b = Request(5087, "/api/session");
        await first.InvokeAsync(a, _ => throw new Exception("Session endpoint must be handled"));
        await second.InvokeAsync(b, _ => throw new Exception("Session endpoint must be handled"));
        var cookieA = a.Response.Headers.SetCookie.ToString().Split(';')[0];
        var cookieB = b.Response.Headers.SetCookie.ToString().Split(';')[0];
        Assert.StartsWith("SensaSession_5086=", cookieA);
        Assert.StartsWith("SensaSession_5087=", cookieB);
        var cookieJar = cookieA + "; " + cookieB;
        var accepted = 0;
        await first.InvokeAsync(Request(5086, "/api/config", cookieJar), _ => { accepted++; return Task.CompletedTask; });
        await second.InvokeAsync(Request(5087, "/api/config", cookieJar), _ => { accepted++; return Task.CompletedTask; });
        Assert.Equal(2, accepted);
        var crossed = Request(5087, "/api/config", cookieA);
        await second.InvokeAsync(crossed, _ => throw new Exception("Another instance's cookie cannot authenticate"));
        Assert.Equal(401, crossed.Response.StatusCode);
    }

    [Fact]
    public void A_delayed_heartbeat_cannot_resurrect_a_closed_page()
    {
        var pages = new BrowserPagePresence();
        Assert.True(pages.Update("tab", true, 1));
        Assert.True(pages.Update("tab", false, 3));
        Assert.True(pages.Update("tab", true, 2));
        Assert.Equal(0, pages.Count);
        Assert.True(pages.TryBeginLaunch());
        Assert.True(pages.Update("tab", true, 4));
        Assert.Equal(1, pages.Count);
    }

    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("localhost")]
    public async Task Kestrel_keeps_the_fallback_socket_bound_and_reports_the_actual_address(string host)
    {
        using var occupied = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
        occupied.Bind(new IPEndPoint(IPAddress.Loopback, 0)); occupied.Listen();
        var originalPort = ((IPEndPoint)occupied.LocalEndPoint!).Port;
        var bound = 0;
        var builder = WebApplication.CreateSlimBuilder();
        builder.WebHost.UseUrls(SensaHost.BuildWebUiUrls(host, originalPort).ListenUrl);
        builder.Services.Configure<SocketTransportOptions>(options => options.CreateBoundListenSocket = endpoint =>
            ListenerPortBinding.BindTcp(endpoint, port => bound = port));
        await using var app = builder.Build();
        app.MapGet("/", () => "isolated");
        await app.StartAsync();
        try
        {
            var address = Assert.Single(app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses);
            Assert.NotEqual(originalPort, bound);
            Assert.Equal(bound, new Uri(address).Port);
            using var client = new HttpClient();
            Assert.Equal("isolated", await client.GetStringAsync(address));
            using var conflict = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
            Assert.Throws<SocketException>(() => conflict.Bind(new IPEndPoint(IPAddress.Loopback, bound)));
        }
        finally { await app.StopAsync(); }
    }

    [Fact]
    public void Udp_receivers_auto_assign_only_when_requested_and_do_not_share_each_others_packets()
    {
        using var occupied = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        var originalPort = ((IPEndPoint)occupied.Client.LocalEndPoint!).Port;
        using var fixedReceiver = new OscInputReceiver(new(), port: originalPort);
        Assert.Throws<SocketException>(() => fixedReceiver.Start());
        using var independent = new OscInputReceiver(new(), port: originalPort, resolvePortConflicts: true);
        var changed = 0;
        independent.PortChanged += port => changed = port;
        independent.Start();
        Assert.NotEqual(originalPort, independent.Port);
        Assert.Equal(independent.Port, changed);
        Assert.True(independent.IsRunning);
        using var conflict = new UdpClient();
        Assert.Throws<SocketException>(() => conflict.Client.Bind(new IPEndPoint(IPAddress.Loopback, changed)));
    }
}
