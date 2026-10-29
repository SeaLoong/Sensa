using System.Net;
using Microsoft.AspNetCore.Http;
using Sensa.Hosting;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class WebUiAddressContracts
{
    [Theory]
    [InlineData("127.0.0.1", "http://127.0.0.1:5086", "http://127.0.0.1:5086")]
    [InlineData("localhost", "http://127.0.0.1:5086", "http://127.0.0.1:5086")]
    [InlineData(" localhost ", "http://127.0.0.1:5086", "http://127.0.0.1:5086")]
    [InlineData("0.0.0.0", "http://0.0.0.0:5086", "http://127.0.0.1:5086")]
    [InlineData("*", "http://*:5086", "http://127.0.0.1:5086")]
    [InlineData("+", "http://+:5086", "http://127.0.0.1:5086")]
    [InlineData("::", "http://[::]:5086", "http://[::1]:5086")]
    [InlineData("[::]", "http://[::]:5086", "http://[::1]:5086")]
    [InlineData("::1", "http://[::1]:5086", "http://[::1]:5086")]
    [InlineData("[::1]", "http://[::1]:5086", "http://[::1]:5086")]
    [InlineData("192.0.2.5", "http://192.0.2.5:5086", "http://192.0.2.5:5086")]
    [InlineData("2001:db8::5", "http://[2001:db8::5]:5086", "http://[2001:db8::5]:5086")]
    public void Listener_and_browser_addresses_preserve_explicit_targets_and_format_IPv6(string host, string listen, string browser)
    {
        var urls = SensaHost.BuildWebUiUrls(host, 5086);
        Assert.Equal(listen, urls.ListenUrl);
        Assert.Equal(browser, urls.BrowserUrl);
        var destination = new Uri(urls.BrowserUrl);
        Assert.Equal("http", destination.Scheme);
        Assert.Equal(5086, destination.Port);
        Assert.Empty(destination.UserInfo);
    }

    [Theory]
    [InlineData("0.0.0.0")]
    [InlineData("*")]
    [InlineData("+")]
    [InlineData("::")]
    [InlineData("[::]")]
    [InlineData("::1")]
    public async Task Generated_local_browser_destination_passes_the_existing_host_boundary_for_session_bootstrap(string host)
    {
        var browser = new Uri(SensaHost.BuildWebUiUrls(host, 5086).BrowserUrl);
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Parse(browser.Host.Trim('[', ']'));
        context.Request.Scheme = browser.Scheme;
        context.Request.Host = new HostString(browser.Authority);
        context.Request.Method = "GET";
        context.Request.Path = "/api/session";
        var calledNext = false;
        await new LocalAccessPolicy().InvokeAsync(context, _ => { calledNext = true; return Task.CompletedTask; });
        Assert.Equal(204, context.Response.StatusCode);
        Assert.False(calledNext);
        Assert.True(context.Response.Headers.SetCookie.Count > 0);
    }

    [Fact]
    public async Task Unspecified_host_is_still_rejected_when_requested_directly()
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Loopback;
        context.Request.Host = new HostString("0.0.0.0", 5086);
        context.Request.Method = "GET";
        context.Request.Path = "/api/session";
        var calledNext = false;
        await new LocalAccessPolicy().InvokeAsync(context, _ => { calledNext = true; return Task.CompletedTask; });
        Assert.Equal(403, context.Response.StatusCode);
        Assert.False(calledNext);
        Assert.Equal(0, context.Response.Headers.SetCookie.Count);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(65536)]
    public void Invalid_listener_ports_are_rejected_before_URL_construction(int port) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => SensaHost.BuildWebUiUrls("127.0.0.1", port));

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("http://localhost")]
    [InlineData("localhost:5086")]
    [InlineData("user@localhost")]
    [InlineData("localhost/path")]
    public void A_host_field_cannot_inject_URL_credentials_ports_or_paths(string host) =>
        Assert.ThrowsAny<ArgumentException>(() => SensaHost.BuildWebUiUrls(host, 5086));
}
