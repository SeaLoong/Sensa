using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Sensa.Hosting;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class BrowserLaunchContracts
{
    [Theory]
    [InlineData(null, false, false)]
    [InlineData(null, true, true)]
    [InlineData("true", false, true)]
    [InlineData("false", true, false)]
    public void Launch_option_overrides_only_this_process(string? option, bool configured, bool expected)
    {
        var options = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["open-browser"] = option }).Build();
        Assert.Equal(expected, SensaHost.ShouldOpenBrowser(options, configured));
    }

    [Fact]
    public void Browser_launch_waits_for_the_server_started_notification()
    {
        using var lifetime = new Lifetime();
        var opened = new List<string>();
        SensaHost.RegisterBrowserLaunch(lifetime, true, "http://127.0.0.1:5086", opened.Add, _ => Assert.Fail("Unexpected error"));
        Assert.Empty(opened);
        lifetime.Started.Cancel();
        Assert.Equal(["http://127.0.0.1:5086"], opened);
    }

    [Fact]
    public void Disabled_browser_launch_and_shell_errors_do_not_fail_server_startup()
    {
        using var disabled = new Lifetime();
        SensaHost.RegisterBrowserLaunch(disabled, false, "unused", _ => Assert.Fail("Browser must stay closed"), _ => Assert.Fail("Unexpected error"));
        disabled.Started.Cancel();
        using var failed = new Lifetime();
        Exception? observed = null;
        SensaHost.RegisterBrowserLaunch(failed, true, "http://127.0.0.1:5086", _ => throw new IOException("No browser"), error => observed = error);
        failed.Started.Cancel();
        Assert.IsType<IOException>(observed);
    }

    private sealed class Lifetime : IHostApplicationLifetime, IDisposable
    {
        public CancellationTokenSource Started { get; } = new();
        public CancellationToken ApplicationStarted => Started.Token;
        public CancellationToken ApplicationStopping => CancellationToken.None;
        public CancellationToken ApplicationStopped => CancellationToken.None;
        public void StopApplication() { }
        public void Dispose() => Started.Dispose();
    }
}
