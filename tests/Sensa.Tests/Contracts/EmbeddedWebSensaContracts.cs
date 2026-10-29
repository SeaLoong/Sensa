using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Sensa.Hosting;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class EmbeddedWebSensaContracts
{
    [Fact]
    public async Task Embedded_standalone_directory_serves_its_index_and_preserves_pairing_queries_on_redirect()
    {
        var provider = new EmbeddedFileProvider(typeof(EmbeddedWebSensaContracts).Assembly, "Sensa.RouteFixture");
        Assert.True(provider.GetFileInfo("/websensa/index.html").Exists);
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = Environments.Production });
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        await using var app = builder.Build();
        SensaHost.UseStandaloneDocuments(app);
        app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = provider });
        app.UseStaticFiles(new StaticFileOptions { FileProvider = provider });
        await app.StartAsync();
        try
        {
            using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { BaseAddress = new Uri(app.Urls.Single()) };
            using var response = await client.GetAsync("/websensa/");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Contains("WebSensa embedded route fixture", await response.Content.ReadAsStringAsync());
            using var redirect = await client.GetAsync("/websensa?input=explorer&session=fixture");
            Assert.Equal(HttpStatusCode.Moved, redirect.StatusCode);
            Assert.Equal("/websensa/?input=explorer&session=fixture", redirect.Headers.Location?.OriginalString);
        }
        finally { await app.StopAsync(); }
    }

    [Theory]
    [InlineData("GET", "", "?input=explorer&session=fixture", "/websensa/?input=explorer&session=fixture")]
    [InlineData("HEAD", "/mounted", "?next=https%3A%2F%2Foutside.example", "/mounted/websensa/?next=https%3A%2F%2Foutside.example")]
    [InlineData("GET", "/\\outside.example", "?input=explorer", "/%5Coutside.example/websensa/?input=explorer")]
    public async Task Standalone_redirect_preserves_local_mount_and_query(string method, string pathBase, string query, string expected)
    {
        using var services = new ServiceCollection().AddLogging().BuildServiceProvider();
        var app = new ApplicationBuilder(services);
        SensaHost.UseStandaloneDocuments(app);
        var context = RedirectContext(services, method, pathBase, query);

        await app.Build()(context);

        Assert.Equal(StatusCodes.Status301MovedPermanently, context.Response.StatusCode);
        Assert.Equal(expected, context.Response.Headers.Location.ToString());
        Assert.Equal("sensa.example", new Uri(new Uri("https://sensa.example"), context.Response.Headers.Location.ToString()).Host);
    }

    [Theory]
    [InlineData("//outside.example")]
    [InlineData("///outside.example")]
    public async Task Standalone_redirect_rejects_nonlocal_mount_before_writing_location(string pathBase)
    {
        using var services = new ServiceCollection().AddLogging().BuildServiceProvider();
        var app = new ApplicationBuilder(services);
        SensaHost.UseStandaloneDocuments(app);
        var context = RedirectContext(services, "GET", pathBase, "?input=explorer");

        await Assert.ThrowsAsync<InvalidOperationException>(() => app.Build()(context));

        Assert.False(context.Response.Headers.ContainsKey("Location"));
    }

    private static DefaultHttpContext RedirectContext(IServiceProvider services, string method, string pathBase, string query)
    {
        var context = new DefaultHttpContext { RequestServices = services };
        context.Request.Method = method;
        context.Request.Path = "/websensa";
        context.Request.PathBase = new PathString(pathBase);
        context.Request.QueryString = new QueryString(query);
        return context;
    }
}
