using System.Net;
using System.Text.Json;
using Sensa.Input.Osc;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class OscQueryBoundaryContracts
{
    [Theory]
    [InlineData("1e999", null)]
    [InlineData("-1e999", null)]
    [InlineData("1e100", 1e100)]
    public async Task Overflowing_remote_values_do_not_poison_the_shared_state_snapshot(string literal, double? finiteMinimum)
    {
        using var http = new HttpClient(new QueryHandler(literal));
        await using var query = new OscQueryClient(http);
        var snapshot = await query.RefreshAsync("http://oscquery.invalid/");
        Assert.Empty(snapshot.Error);
        var overflowing = Assert.Single(snapshot.Nodes, node => node.Path == "Overflow");
        Assert.Null(overflowing.ParsedValue);
        Assert.Equal(finiteMinimum, overflowing.Min);
        Assert.Equal(1, overflowing.Max);
        Assert.Equal(literal, overflowing.CurrentValue);
        var healthy = Assert.Single(snapshot.Nodes, node => node.Path == "Healthy");
        Assert.Equal(.25f, healthy.ParsedValue!.Value.AsFloat());
        // This is the same JSON serialization used for HTTP and shared WebSocket state.
        var serialized = JsonSerializer.Serialize(snapshot, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        using var document = JsonDocument.Parse(serialized);
        Assert.Equal(2, document.RootElement.GetProperty("nodes").GetArrayLength());
    }

    [Theory]
    [InlineData("NAME", 513)]
    [InlineData("OSC_IP", 254)]
    [InlineData("WS_IP", 254)]
    [InlineData("OSC_TRANSPORT", 17)]
    public async Task Oversized_host_metadata_cannot_be_multiplied_across_parameter_previews(string field, int length)
    {
        var host = JsonSerializer.Serialize(new Dictionary<string, object> { [field] = new string('x', length), ["OSC_PORT"] = 9001 });
        using var http = new HttpClient(new QueryHandler("0.5", host));
        await using var query = new OscQueryClient(http);
        var snapshot = await query.RefreshAsync("http://oscquery.invalid/");
        Assert.Contains("HOST_INFO " + field, snapshot.Error);
        Assert.Empty(snapshot.Nodes);
        Assert.Empty(snapshot.Name);
        Assert.Empty(snapshot.OscIp);
        Assert.DoesNotContain(new string('x', length), JsonSerializer.Serialize(snapshot));
    }

    [Fact]
    public async Task A_long_supported_source_name_is_preserved_exactly_for_selection()
    {
        var name = new string('x', 512);
        var host = JsonSerializer.Serialize(new { NAME = name, OSC_PORT = 9001 });
        using var http = new HttpClient(new QueryHandler("0.5", host));
        await using var query = new OscQueryClient(http);
        var snapshot = await query.RefreshAsync("http://oscquery.invalid/");
        Assert.Empty(snapshot.Error);
        Assert.Equal(name, snapshot.Name);
        Assert.Equal(name, query.SnapshotSource.Label);
        Assert.Equal("oscquery:name:" + name, query.SnapshotSource.PersistentId);
    }

    private sealed class QueryHandler(string literal, string? hostInfo = null) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var content = request.RequestUri!.Query == "?HOST_INFO" ? hostInfo ?? """{"NAME":"mock","OSC_PORT":9001}"""
                : """
                  {"CONTENTS":{
                    "Overflow":{"FULL_PATH":"/avatar/parameters/Overflow","TYPE":"d","VALUE":[LITERAL],"RANGE":[{"MIN":LITERAL,"MAX":1}]},
                    "Healthy":{"FULL_PATH":"/avatar/parameters/Healthy","TYPE":"f","VALUE":[0.25],"RANGE":[{"MIN":0,"MAX":1}]}
                  }}
                  """.Replace("LITERAL", literal, StringComparison.Ordinal);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(content) });
        }
    }
}
