using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
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
}
