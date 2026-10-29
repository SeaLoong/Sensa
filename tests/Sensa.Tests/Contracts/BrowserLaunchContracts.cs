using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Sensa.Hosting;
using Xunit;
using System.Text.Json;
using Sensa.Configuration;

namespace Sensa.Tests.Contracts;

public sealed class BrowserLaunchContracts
{
    [Theory]
    [InlineData(null, true)]
    [InlineData("true", true)]
    [InlineData("false", false)]
    [InlineData("invalid", true)]
    public void Launch_option_overrides_only_this_process(string? option, bool expected)
    {
        var options = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["open-browser"] = option }).Build();
        Assert.Equal(expected, SensaHost.ShouldOpenBrowser(options));
    }

    [Fact]
    public void Legacy_saved_false_is_ignored_and_headless_is_an_explicit_launch_option()
    {
        var directory = Path.Combine(Path.GetTempPath(), "sensa-browser-migration-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            var path = Path.Combine(directory, "config.json");
            File.WriteAllText(path, """{"webUi":{"autoOpenBrowser":false,"port":5086},"outputs":[]}""");
            var config = AppConfig.Load(path);
            Assert.Equal(5086, config.WebUi.Port);
            config.Save(path);
            using var saved = JsonDocument.Parse(File.ReadAllText(path));
            Assert.False(saved.RootElement.GetProperty("WebUi").TryGetProperty("AutoOpenBrowser", out _));
            Assert.True(SensaHost.ShouldOpenBrowser(new ConfigurationBuilder().Build()));
        }
        finally { Directory.Delete(directory, recursive: true); }
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
