using System.Net;
using System.Text;
using System.Text.Json;
using Sensa.Outputs.Devices;
using Xunit;
using static Sensa.Tests.Contracts.VendorDeviceOutputContracts;

namespace Sensa.Tests.Contracts;

/// <summary>Real vendor JSON schemas over in-process HTTP handlers; no device/cloud interaction.</summary>
public sealed class VendorScriptLoopContracts
{
    [Theory]
    [InlineData("Handy", 2, "/hssp/loop", "activated")]
    [InlineData("Handy", 3, "", "loop")]
    [InlineData("Autoblow", 2, "/autoblow/sync-script/loop", "loop")]
    [InlineData("VacuGlide", 2, "/vacuglide/sync-script/loop", "loop")]
    public async Task Loop_choice_is_explicit_prepared_and_paused_and_never_starts_playback(string type, int version, string loopPath, string field)
    {
        using var transport = new ApiTransport(request => DefaultResponse(request, version));
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput(type, Options(version), http);
        await Assert.ThrowsAsync<InvalidOperationException>(() => device.SetScriptLoopAsync(true));
        await device.ConnectAsync();
        Assert.True(device.SupportsScriptLoop);
        var before = transport.Requests.Count;
        await Assert.ThrowsAsync<InvalidOperationException>(() => device.SetScriptLoopAsync(true));
        Assert.Equal(before, transport.Requests.Count);
        await device.PrepareScriptAsync(new Uri("https://scripts.example/loop.csv"));
        before = transport.Requests.Count;
        await device.SetScriptLoopAsync(true);
        Assert.True(device.ScriptLoop);
        Assert.False(device.ScriptPlaying);
        Assert.DoesNotContain(transport.Requests, IsPlay);
        if (loopPath.Length == 0) Assert.Equal(before, transport.Requests.Count);
        else
        {
            var change = transport.Requests.Last();
            Assert.Equal(loopPath, change.Path);
            Assert.True(change.Body!.Value.GetProperty(field).GetBoolean());
        }
        await device.PlayScriptAsync(1250);
        Assert.True(device.ScriptPlaying);
        var play = transport.Requests.Last();
        if (type == "Handy" && version == 3)
        {
            Assert.True(play.Body!.Value.GetProperty("loop").GetBoolean());
            Assert.DoesNotContain(transport.Requests, request => request.Path == "/hssp/loop");
        }
        else Assert.True(transport.Requests.Last(request => request.Path == loopPath).Body!.Value.GetProperty(field).GetBoolean());
        before = transport.Requests.Count;
        await Assert.ThrowsAsync<InvalidOperationException>(() => device.SetScriptLoopAsync(false));
        Assert.Equal(before, transport.Requests.Count);
        Assert.True(device.ScriptLoop);
        await device.StopScriptAsync();
        Assert.False(device.ScriptPlaying);
        await device.SetScriptLoopAsync(false);
        Assert.False(device.ScriptLoop);
        Assert.Equal(1, transport.Requests.Count(IsPlay));
    }

    [Theory]
    [InlineData("Handy", 2, "/hssp/loop", "activated")]
    [InlineData("Handy", 3, "", "loop")]
    [InlineData("Autoblow", 2, "/autoblow/sync-script/loop", "loop")]
    [InlineData("VacuGlide", 2, "/vacuglide/sync-script/loop", "loop")]
    public async Task Preparing_another_script_resets_the_next_play_policy_and_reapplies_false_before_start(string type, int version, string loopPath, string field)
    {
        using var transport = new ApiTransport(request => DefaultResponse(request, version));
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput(type, Options(version), http);
        await device.ConnectAsync();
        await device.PrepareScriptAsync(new Uri("https://scripts.example/first.csv"));
        await device.SetScriptLoopAsync(true);
        await device.PlayScriptAsync();
        await device.StopAsync();
        Assert.False(device.ScriptPlaying);
        await device.PrepareScriptAsync(new Uri("https://scripts.example/second.csv"));
        Assert.False(device.ScriptLoop);
        var before = transport.Requests.Count;
        await device.PlayScriptAsync(750);
        var requests = transport.Requests.Skip(before).ToArray();
        if (type == "Handy" && version == 3)
            Assert.False(requests.Last().Body!.Value.GetProperty("loop").GetBoolean());
        else
        {
            Assert.Equal(loopPath, requests[^2].Path);
            Assert.False(requests[^2].Body!.Value.GetProperty(field).GetBoolean());
            Assert.True(IsPlay(requests[^1]));
        }
        Assert.Equal(2, transport.Requests.Count(IsPlay));
    }

    [Theory]
    [InlineData("3.1.9", false)]
    [InlineData("3.2.0", true)]
    [InlineData("3.2.0-beta.1", true)]
    [InlineData("3.10.0", true)]
    [InlineData("3.x", false)]
    [InlineData("", false)]
    public async Task Handy_v2_loop_requires_confirmed_firmware_3_2_without_breaking_ordinary_scripts(string firmware, bool supported)
    {
        using var transport = new ApiTransport(request => request.Path == "/info" ? Json(new { fwVersion = firmware }) : DefaultResponse(request));
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("Handy", Options(), http);
        Assert.False(device.SupportsScriptLoop);
        await device.ConnectAsync();
        Assert.Equal(supported, device.SupportsScriptLoop);
        await device.PrepareScriptAsync(new Uri("https://scripts.example/first.csv"));
        if (supported) await device.SetScriptLoopAsync(true);
        else await Assert.ThrowsAsync<InvalidOperationException>(() => device.SetScriptLoopAsync(true));
        await device.PlayScriptAsync();
        Assert.True(device.ScriptPlaying);
        Assert.Equal(supported, transport.Requests.Any(request => request.Path == "/hssp/loop"));
        Assert.Equal(supported, device.ScriptLoop);
    }

    [Theory]
    [InlineData("Handy", "/hssp/loop")]
    [InlineData("Autoblow", "/autoblow/sync-script/loop")]
    [InlineData("VacuGlide", "/vacuglide/sync-script/loop")]
    public async Task Stop_cancels_a_pending_loop_change_and_its_late_response_cannot_commit_or_start(string type, string loopPath)
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var transport = new ApiTransport(async (request, _) =>
        {
            if (request.Path == loopPath) { entered.TrySetResult(); await release.Task; }
            return DefaultResponse(request);
        });
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput(type, Options(), http);
        await device.ConnectAsync();
        await device.PrepareScriptAsync(new Uri("https://scripts.example/first.csv"));
        var pending = device.SetScriptLoopAsync(true);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var stop = device.StopAsync();
        release.TrySetResult();
        await stop.WaitAsync(TimeSpan.FromSeconds(5));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => pending);
        Assert.False(device.ScriptLoop);
        Assert.False(device.ScriptPlaying);
        Assert.DoesNotContain(transport.Requests, IsPlay);
    }

    [Theory]
    [InlineData("Handy", "/hssp/loop")]
    [InlineData("Autoblow", "/autoblow/sync-script/loop")]
    [InlineData("VacuGlide", "/vacuglide/sync-script/loop")]
    public async Task A_rejected_loop_change_preserves_the_last_selected_policy_without_claiming_success(string type, string loopPath)
    {
        var reject = false;
        using var transport = new ApiTransport(request => request.Path == loopPath && reject
            ? new HttpResponseMessage(HttpStatusCode.BadRequest) : DefaultResponse(request));
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput(type, Options(), http);
        await device.ConnectAsync();
        await device.PrepareScriptAsync(new Uri("https://scripts.example/first.csv"));
        await device.SetScriptLoopAsync(true);
        reject = true;
        await Assert.ThrowsAsync<InvalidOperationException>(() => device.SetScriptLoopAsync(false));
        Assert.True(device.ScriptLoop);
        Assert.False(device.ScriptPlaying);
        Assert.Contains("HTTP 400", device.LastError);
        reject = false;
    }

    [Fact]
    public async Task Lovense_does_not_advertise_synchronized_looping_or_send_an_invented_endpoint()
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        var options = Options(); options.DeviceId = "test-toy";
        await using var device = new VendorDeviceOutput("Lovense", options, http);
        await device.ConnectAsync();
        Assert.False(device.SupportsScriptLoop);
        var before = transport.Requests.Count;
        await Assert.ThrowsAsync<InvalidOperationException>(() => device.SetScriptLoopAsync(true));
        Assert.Equal(before, transport.Requests.Count);
    }

    private static HttpResponseMessage? DefaultResponse(ApiRequest request, int version = 2)
    {
        if (request.Path != "/servertime") return null;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return version == 3 ? Json(new { server_time = now }) : Json(new { serverTime = now });
    }

    private static bool IsPlay(ApiRequest request) => request.Path.EndsWith("/hssp/play", StringComparison.Ordinal)
        || request.Path.EndsWith("/sync-script/start", StringComparison.Ordinal);
    private static DeviceProtocolOptions Options(int version = 2) => new()
    {
        Endpoint = "http://127.0.0.1:19000/", ConnectionKey = "test-only-connection-key",
        ApiKey = "test-only-application-key", ApiVersion = version, MinIntervalMs = 25,
    };
    private static HttpResponseMessage Json(object value) => new(HttpStatusCode.OK)
    { Content = new StringContent(JsonSerializer.Serialize(value), Encoding.UTF8, "application/json") };
}
