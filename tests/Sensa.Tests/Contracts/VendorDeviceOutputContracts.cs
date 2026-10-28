using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Outputs.Devices;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>In-process HTTP transports only: no cloud API, real credentials or device is used.</summary>
public sealed class VendorDeviceOutputContracts
{
    [Fact]
    public async Task HandyConnectDiscoversWithoutMovingAndPreservesTargetTravelTime()
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("Handy", Options(), http);
        await device.ConnectAsync();
        Assert.True(device.IsConnected);
        Assert.All(transport.Requests, request => Assert.Equal("GET", request.Method));
        await device.SendAsync(Frame(.625f, 240));
        var target = Assert.Single(transport.Requests, request => request.Path == "/hdsp/xpt");
        Assert.Equal(62.5, target.Body!.Value.GetProperty("position").GetDouble());
        Assert.Equal(240, target.Body.Value.GetProperty("duration").GetInt32());
        Assert.True(target.Body.Value.GetProperty("stopOnTarget").GetBoolean());
        Assert.Contains(transport.Requests, request => request.Path == "/mode" && request.Body!.Value.GetProperty("mode").GetInt32() == 2);
        await device.StopAsync();
        var stop = transport.Requests.Last();
        Assert.Equal("/hdsp/xpvp", stop.Path);
        Assert.Equal(0, stop.Body!.Value.GetProperty("velocity").GetInt32());
    }

    [Fact]
    public async Task AnExplicitZeroDurationRemainsZeroOnTheHandyWire()
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("Handy", Options(), http);
        await device.ConnectAsync();
        await device.SendAsync(Frame(.5f, 0));
        Assert.Equal(0, transport.Requests.Last().Body!.Value.GetProperty("duration").GetInt32());
    }

    [Theory]
    [InlineData(2, "duration")]
    [InlineData(3, "t")]
    public async Task AnExplicitInstantModeDoesNotBorrowAnUnrelatedRuntimeTickDuration(int version, string field)
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        var options = Options(); options.ApiVersion = version; options.ApiKey = "test-only-key";
        await using var device = new VendorDeviceOutput("Handy", options, http);
        await device.ConnectAsync();
        await device.SendAsync(Frame(.5f, 37) with { RequestedCommandMode = TCodeCommandMode.None, RequestedMotionValue = null });
        Assert.Equal(0, transport.Requests.Last().Body!.Value.GetProperty(field).GetInt32());
    }

    [Fact]
    public async Task ALongButtplugCompatibleDurationIsNotTruncatedByTheHandyAdapter()
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("Handy", Options(), http);
        await device.ConnectAsync();
        await device.SendAsync(Frame(.5f, 100000));
        Assert.Equal(100000, transport.Requests.Last().Body!.Value.GetProperty("duration").GetInt32());
    }

    [Fact]
    public async Task HandyV3UsesAuthenticatedNativeFieldsAndNeverPutsCredentialsInUrl()
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        var options = Options(); options.ApiVersion = 3; options.ApiKey = "test-only-application-key";
        await using var device = new VendorDeviceOutput("Handy", options, http);
        await device.ConnectAsync();
        await device.SendAsync(Frame(.25f, 175));
        Assert.All(transport.Requests, request =>
        {
            Assert.Equal(options.ConnectionKey, request.Headers["X-Connection-Key"]);
            Assert.Equal(options.ApiKey, request.Headers["X-Api-Key"]);
            Assert.DoesNotContain(options.ConnectionKey, request.Url);
            Assert.DoesNotContain(options.ApiKey, request.Url);
        });
        Assert.Contains(transport.Requests, request => request.Path == "/mode2");
        var target = transport.Requests.Last();
        Assert.Equal(25, target.Body!.Value.GetProperty("xp").GetDouble());
        Assert.Equal(175, target.Body.Value.GetProperty("t").GetInt32());
        Assert.False(target.Body.Value.TryGetProperty("position", out _));
    }

    [Theory]
    [InlineData("Handy")]
    [InlineData("Autoblow")]
    [InlineData("VacuGlide")]
    public async Task CloudDiscoveryRejectsOfflineDevicesWithoutSendingMotion(string type)
    {
        using var transport = new ApiTransport(request => request.Path.EndsWith("connected") ? Json(new { connected = false }) : null);
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput(type, Options(), http);
        await Assert.ThrowsAsync<InvalidOperationException>(() => device.ConnectAsync());
        Assert.False(device.IsConnected);
        Assert.Single(transport.Requests);
        Assert.Equal("GET", transport.Requests.Single().Method);
    }

    [Fact]
    public async Task HandyV2DoesNotClaimFirmwareV4Compatibility()
    {
        using var transport = new ApiTransport(request => request.Path == "/info" ? Json(new { fwVersion = "4.0.0" }) : null);
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("Handy", Options(), http);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => device.ConnectAsync());
        Assert.Contains("API v3", error.Message);
        Assert.All(transport.Requests, request => Assert.Equal("GET", request.Method));
    }

    [Fact]
    public async Task AutoblowUsesConfiguredSpeedAndAcceptsTheZeroEndpoint()
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        var options = Options(); options.Speed = 33;
        await using var device = new VendorDeviceOutput("Autoblow", options, http);
        await device.ConnectAsync();
        Assert.All(transport.Requests, request => Assert.Equal("GET", request.Method));
        await device.SendAsync(Frame(0, 500));
        var target = transport.Requests.Last();
        Assert.Equal("/autoblow/goto", target.Path);
        Assert.Equal(0, target.Body!.Value.GetProperty("position").GetDouble());
        Assert.Equal(33, target.Body.Value.GetProperty("speed").GetInt32());
        Assert.False(target.Body.Value.TryGetProperty("duration", out _));
        await device.StopAsync();
        Assert.Equal("/autoblow/oscillate", transport.Requests.Last().Path);
        Assert.Equal(0, transport.Requests.Last().Body!.Value.GetProperty("speed").GetInt32());
    }

    [Theory]
    [InlineData("https://cluster.autoblowapi.com", "", true)]
    [InlineData("https://approved.example", "approved.example", true)]
    [InlineData("https://unapproved.example", "", false)]
    [InlineData("http://127.0.0.1:19000", "", false)]
    public async Task AutoblowClusterSelectionDoesNotLeakCredentialsToAnUnapprovedOrigin(string cluster, string trusted, bool allowed)
    {
        using var transport = new ApiTransport(request => request.Path.EndsWith("connected") ? Json(new { connected = true, cluster }) : null);
        using var http = new HttpClient(transport);
        var options = Options(); options.Endpoint = "https://latency.autoblowapi.com"; options.TrustedClusterHost = trusted;
        await using var device = new VendorDeviceOutput("Autoblow", options, http);
        if (allowed)
        {
            await device.ConnectAsync();
            Assert.Equal(new Uri(cluster).Host, new Uri(transport.Requests.Last().Url).Host);
        }
        else
        {
            await Assert.ThrowsAsync<InvalidOperationException>(() => device.ConnectAsync());
            Assert.Single(transport.Requests);
        }
    }

    [Fact]
    public async Task VacuGlideExposesRealScriptControlsAndExplicitMotorSpeed()
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("VacuGlide", Options(), http);
        await device.ConnectAsync();
        await device.SendAsync(Frame(.8f, 200));
        Assert.Equal("/vacuglide/target-speed", transport.Requests.Last().Path);
        Assert.Equal(80, transport.Requests.Last().Body!.Value.GetProperty("targetSpeed").GetDouble(), 4);
        Assert.True(device.SupportsStreaming);
        Assert.Equal("Scalar", device.CommandKind);
        await device.PrepareScriptAsync(new Uri("https://scripts.example/test.csv"));
        Assert.True(device.ScriptPrepared);
        await device.PlayScriptAsync(1200);
        Assert.True(device.ScriptPlaying);
        Assert.Equal(1200, device.ScriptPositionMs);
        await device.SeekScriptAsync(1700);
        Assert.Equal(1700, transport.Requests.Last().Body!.Value.GetProperty("startTimeMs").GetInt32());
        await device.StopScriptAsync();
        Assert.False(device.ScriptPlaying);
        Assert.Equal("/vacuglide/sync-script/stop", transport.Requests.Last().Path);
        var count = transport.Requests.Count;
        await device.SeekScriptAsync(2000);
        Assert.Equal(count, transport.Requests.Count);
        Assert.Equal(2000, device.ScriptPositionMs);
    }

    [Theory]
    [InlineData(2, "startTime", "estimatedServerTime")]
    [InlineData(3, "start_time", "server_time")]
    public async Task HandyScriptPlaybackUsesSynchronizedTimeAndVersionedSchema(int version, string positionField, string timeField)
    {
        var clock = new ManualTimeProvider();
        var serverTime = clock.GetUtcNow().ToUnixTimeMilliseconds() + 5000;
        using var transport = new ApiTransport(request => request.Path == "/servertime"
            ? version == 3 ? Json(new { server_time = serverTime }) : Json(new { serverTime }) : null);
        using var http = new HttpClient(transport);
        var options = Options(); options.ApiVersion = version; options.ApiKey = "test-application-key"; options.OffsetMs = 75;
        await using var device = new VendorDeviceOutput("Handy", options, http, clock);
        await device.ConnectAsync();
        await device.PrepareScriptAsync(new Uri("https://scripts.example/test.csv"), new string('a', 64));
        Assert.Equal(3, transport.Requests.Count(request => request.Path == "/servertime"));
        Assert.Contains(transport.Requests, request => request.Path == "/hstp/offset" && request.Body!.Value.GetProperty("offset").GetInt32() == 75);
        await device.PlayScriptAsync(2400);
        var play = transport.Requests.Last();
        Assert.Equal("/hssp/play", play.Path);
        Assert.Equal(2400, play.Body!.Value.GetProperty(positionField).GetInt32());
        Assert.Equal(serverTime, play.Body.Value.GetProperty(timeField).GetInt64());
        await device.StopAsync();
        Assert.Equal("/hssp/stop", transport.Requests.Last().Path);
    }

    [Theory]
    [InlineData("Handy")]
    [InlineData("Autoblow")]
    [InlineData("VacuGlide")]
    public async Task PlaybackRequiresSuccessfulPreparation(string type)
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput(type, Options(), http);
        await device.ConnectAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => device.PlayScriptAsync());
        Assert.DoesNotContain(transport.Requests, request => request.Path.EndsWith("play") || request.Path.EndsWith("start"));
    }

    [Fact]
    public async Task FailedPreparationNeverArmsPlayback()
    {
        using var transport = new ApiTransport(request => request.Path.EndsWith("upload-csv-url") ? Json(new { error = new { connected = true, message = "test-only-secret-must-not-escape" } }) : null);
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("VacuGlide", Options(), http);
        await device.ConnectAsync();
        var failure = await Assert.ThrowsAsync<InvalidOperationException>(() => device.PrepareScriptAsync(new Uri("https://scripts.example/test.csv")));
        Assert.DoesNotContain("test-only-secret", failure.Message);
        Assert.False(device.ScriptPrepared);
        await Assert.ThrowsAsync<InvalidOperationException>(() => device.PlayScriptAsync());
    }

    [Fact]
    public async Task StopCancelsAnInFlightCommandAndDiscardsAlreadyQueuedFrames()
    {
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var transport = new ApiTransport(async (request, cancellation) =>
        {
            if (request.Path == "/hdsp/xpt")
            {
                started.TrySetResult();
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellation);
            }
            return null;
        });
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("Handy", Options(), http);
        await device.ConnectAsync();
        var first = device.SendAsync(Frame(.8f, 200));
        await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var queued = device.SendAsync(Frame(.1f, 200));
        await device.StopAsync().WaitAsync(TimeSpan.FromSeconds(5));
        await Task.WhenAll(first, queued).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Single(transport.Requests, request => request.Path == "/hdsp/xpt");
        Assert.Equal("/hdsp/xpvp", transport.Requests.Last().Path);
    }

    [Fact]
    public async Task StopCancelsAlreadyQueuedScriptPlaybackBeforeItCanRestart()
    {
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var transport = new ApiTransport(async (request, cancellation) =>
        {
            if (request.Path == "/vacuglide/sync-script/upload-csv-url")
            {
                started.TrySetResult();
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellation);
            }
            return null;
        });
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("VacuGlide", Options(), http);
        await device.ConnectAsync();
        var prepare = device.PrepareScriptAsync(new Uri("https://scripts.example/test.csv"));
        await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var play = device.PlayScriptAsync();
        await device.StopAsync().WaitAsync(TimeSpan.FromSeconds(5));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => prepare);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => play);
        Assert.DoesNotContain(transport.Requests, request => request.Path.EndsWith("/start"));
        Assert.Equal("/vacuglide/target-speed/stop", transport.Requests.Last().Path);
    }

    [Fact]
    public async Task FailedMotionDoesNotPreventTheFinalStopAttempt()
    {
        using var transport = new ApiTransport(request => request.Path == "/hdsp/xpt" ? new(HttpStatusCode.BadGateway) : null);
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("Handy", Options(), http);
        await device.ConnectAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => device.SendAsync(Frame(.8f, 200)));
        Assert.False(device.IsConnected);
        await device.StopAsync();
        Assert.Equal("/hdsp/xpvp", transport.Requests.Last().Path);
    }

    [Theory]
    [InlineData("Vibrate", .5f, "Vibrate:10")]
    [InlineData("Pump", 1f, "Pump:3")]
    [InlineData("Thrusting", .25f, "Thrusting:5")]
    public async Task LovenseTargetsOnlyTheSelectedToyAndFunction(string function, float value, string expected)
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        var options = Options(); options.DeviceId = "test-toy"; options.Function = function; options.Axis = "V0";
        await using var device = new VendorDeviceOutput("Lovense", options, http);
        await device.ConnectAsync();
        Assert.Equal("GetToys", transport.Requests.Single().Body!.Value.GetProperty("command").GetString());
        await device.SendAsync(new() { V0 = value, DeltaMs = 100, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.V0 } });
        var action = transport.Requests.Last().Body!.Value;
        Assert.Equal(expected, action.GetProperty("action").GetString());
        Assert.Equal("test-toy", action.GetProperty("toy").GetString());
        await device.StopAsync();
        Assert.Equal("Stop", transport.Requests.Last().Body!.Value.GetProperty("action").GetString());
        Assert.Equal("test-toy", transport.Requests.Last().Body!.Value.GetProperty("toy").GetString());
    }

    [Fact]
    public async Task LovenseRequiresAnExplicitConnectedToy()
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        await using var missing = new VendorDeviceOutput("Lovense", Options(), http);
        await Assert.ThrowsAsync<InvalidOperationException>(() => missing.ConnectAsync());
        Assert.Empty(transport.Requests);
        var options = Options(); options.DeviceId = "other-toy";
        await using var unknown = new VendorDeviceOutput("Lovense", options, http);
        await Assert.ThrowsAsync<InvalidOperationException>(() => unknown.ConnectAsync());
        Assert.Single(transport.Requests);
    }

    [Fact]
    public async Task CommandsForOtherAxesDoNotAffectTheDevice()
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("Handy", Options(), http);
        await device.ConnectAsync();
        var count = transport.Requests.Count;
        await device.SendAsync(new() { R0 = .9f, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.R0 } });
        Assert.Equal(count, transport.Requests.Count);
    }

    [Theory]
    [InlineData(double.NaN, 100)]
    [InlineData(double.PositiveInfinity, 100)]
    [InlineData(-.1, 100)]
    [InlineData(1.1, 100)]
    [InlineData(.5, -1)]
    [InlineData(.5, 600001)]
    public async Task InvalidMotionNeverReachesTheApi(double value, int duration)
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("Handy", Options(), http);
        await device.ConnectAsync();
        var count = transport.Requests.Count;
        await Assert.ThrowsAsync<ArgumentException>(() => device.SendAsync(Frame((float)value, duration)));
        Assert.Equal(count, transport.Requests.Count);
    }

    [Theory]
    [InlineData("http://public.example/api")]
    [InlineData("https://user:password@example.test/api")]
    [InlineData("https://example.test/api?key=secret")]
    [InlineData("file:///tmp/api")]
    public void InvalidEndpointsFailBeforeAnyTransportIsCreated(string endpoint)
    {
        var options = Options(); options.Endpoint = endpoint;
        Assert.Throws<ArgumentException>(() => new VendorDeviceOutput("Handy", options));
    }

    [Theory]
    [InlineData("{not-json", "invalid JSON")]
    [InlineData("{\"error\":{\"message\":\"test-only-credential\"}}", "device error")]
    [InlineData("{\"result\":-3}", "failed operation")]
    public async Task MalformedAndErrorResponsesDoNotExposeResponseData(string response, string expected)
    {
        using var transport = new ApiTransport(request => new(HttpStatusCode.OK) { Content = new StringContent(response) });
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("Handy", Options(), http);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => device.ConnectAsync());
        Assert.Contains(expected, error.Message);
        Assert.DoesNotContain("test-only-credential", error.Message);
    }

    [Fact]
    public async Task OversizedResponsesAreRejected()
    {
        using var transport = new ApiTransport(request => new(HttpStatusCode.OK) { Content = new StringContent(new string('x', 65537)) });
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("Handy", Options(), http);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => device.ConnectAsync());
        Assert.Contains("size limit", error.Message);
    }

    [Fact]
    public async Task RequestTimeoutIsBoundedAndDoesNotExposeCredentials()
    {
        using var transport = new ApiTransport(async (_, cancellation) => { await Task.Delay(Timeout.InfiniteTimeSpan, cancellation); return null; });
        using var http = new HttpClient(transport);
        var options = Options(); options.RequestTimeoutMs = 100;
        await using var device = new VendorDeviceOutput("Handy", options, http);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => device.ConnectAsync().WaitAsync(TimeSpan.FromSeconds(5)));
        Assert.Contains("timed out", error.Message);
        Assert.DoesNotContain(options.ConnectionKey, error.Message);
    }

    [Theory]
    [InlineData("Autoblow", "autoblow")]
    [InlineData("VacuGlide", "vacuglide")]
    public async Task CloudScriptUploadChoosesTheDocumentedFunscriptEndpoint(string type, string prefix)
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput(type, Options(), http);
        await device.ConnectAsync();
        await device.PrepareScriptAsync(new Uri("https://scripts.example/test.funscript"));
        var upload = Assert.Single(transport.Requests, request => request.Path.Contains("upload-", StringComparison.Ordinal));
        Assert.Equal($"/{prefix}/sync-script/upload-funscript-url", upload.Path);
        Assert.Equal("https://scripts.example/test.funscript", upload.Body!.Value.GetProperty("url").GetString());
    }

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    public async Task HandyDoesNotClaimUnverifiedFunscriptUrlSupport(int version)
    {
        using var transport = new ApiTransport();
        using var http = new HttpClient(transport);
        var options = Options(); options.ApiVersion = version; options.ApiKey = "test-only-application-key";
        await using var device = new VendorDeviceOutput("Handy", options, http);
        await device.ConnectAsync();
        var count = transport.Requests.Count;
        await Assert.ThrowsAsync<InvalidOperationException>(() => device.PrepareScriptAsync(new Uri("https://scripts.example/test.funscript")));
        Assert.Equal(count, transport.Requests.Count);
    }

    [Fact]
    public async Task ScriptPreparationHasItsOwnDownloadTimeoutAndCanExceedTheLiveCommandTimeout()
    {
        using var transport = new ApiTransport(async (request, cancellation) =>
        {
            if (request.Path.EndsWith("upload-csv-url")) await Task.Delay(150, cancellation);
            return null;
        });
        using var http = new HttpClient(transport);
        var options = Options(); options.RequestTimeoutMs = 100; options.ScriptTimeoutMs = 1000;
        await using var device = new VendorDeviceOutput("Autoblow", options, http);
        await device.ConnectAsync();
        await device.PrepareScriptAsync(new Uri("https://scripts.example/test.csv"));
        Assert.True(device.ScriptPrepared);
        Assert.Equal(90000, new DeviceProtocolOptions().ScriptTimeoutMs);
    }

    [Fact]
    public async Task PendingLiveFramesCoalesceToTheNewestTargetInsteadOfReplayingAnOldQueue()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var firstRequest = true;
        using var transport = new ApiTransport(async (request, cancellation) =>
        {
            if (request.Path == "/hdsp/xpt" && firstRequest)
            {
                firstRequest = false; entered.TrySetResult(); await release.Task.WaitAsync(cancellation);
            }
            return null;
        });
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("Handy", Options(), http);
        await device.ConnectAsync();
        var first = device.SendAsync(Frame(.2f, 100));
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var obsolete = device.SendAsync(Frame(.5f, 100));
        var latest = device.SendAsync(Frame(.9f, 100));
        release.TrySetResult();
        await Task.WhenAll(first, obsolete, latest).WaitAsync(TimeSpan.FromSeconds(5));
        var targets = transport.Requests.Where(request => request.Path == "/hdsp/xpt").ToArray();
        Assert.Equal(2, targets.Length);
        Assert.Equal(20, targets[0].Body!.Value.GetProperty("position").GetDouble(), 3);
        Assert.Equal(90, targets[1].Body!.Value.GetProperty("position").GetDouble(), 3);
    }

    [Theory]
    [InlineData("Autoblow", "/autoblow/goto", "/autoblow/oscillate")]
    [InlineData("VacuGlide", "/vacuglide/target-speed", "/vacuglide/target-speed/stop")]
    public async Task CloudMotionIsStoppedEvenWhenTheCommandResponseWasCancelled(string type, string targetPath, string stopPath)
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var transport = new ApiTransport(async (request, cancellation) =>
        {
            if (request.Path == targetPath) { entered.TrySetResult(); await Task.Delay(Timeout.InfiniteTimeSpan, cancellation); }
            return null;
        });
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput(type, Options(), http);
        await device.ConnectAsync();
        var motion = device.SendAsync(Frame(.8f, 100));
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await device.StopAsync().WaitAsync(TimeSpan.FromSeconds(5));
        await motion.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(stopPath, transport.Requests.Last().Path);
    }

    [Fact]
    public async Task AQueuedLiveFrameCannotSilentlyReplaceAnExplicitScript()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var transport = new ApiTransport(async (request, cancellation) =>
        {
            if (request.Path == "/autoblow/sync-script/start") { entered.TrySetResult(); await release.Task.WaitAsync(cancellation); }
            return null;
        });
        using var http = new HttpClient(transport);
        await using var device = new VendorDeviceOutput("Autoblow", Options(), http);
        await device.ConnectAsync();
        await device.PrepareScriptAsync(new Uri("https://scripts.example/test.csv"));
        var play = device.PlayScriptAsync();
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var queued = device.SendAsync(Frame(.9f, 100));
        release.TrySetResult();
        await Task.WhenAll(play, queued).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.True(device.ScriptPlaying);
        Assert.DoesNotContain(transport.Requests, request => request.Path == "/autoblow/goto");
    }

    [Fact]
    public void DeviceSettingsCloneRetainsScriptAndAuthenticationSettingsWithoutSharingMutableState()
    {
        var options = Options(); options.ScriptFormat = "Funscript"; options.ScriptUrl = "https://scripts.example/source.funscript";
        options.ScriptTimeoutMs = 75000; options.ApiVersion = 3; options.AuthToken = "test-only-token";
        var copy = DeviceProtocolOptions.Clone(options);
        Assert.True(DeviceProtocolOptions.Equivalent(copy, options));
        copy.OffsetMs = 150;
        Assert.False(DeviceProtocolOptions.Equivalent(copy, options));
        Assert.Equal(0, options.OffsetMs);
        Assert.Equal(options.ScriptUrl, copy.ScriptUrl);
        Assert.Equal(options.ScriptTimeoutMs, copy.ScriptTimeoutMs);
        Assert.Equal(options.AuthToken, copy.AuthToken);
    }

    private static DeviceProtocolOptions Options() => new() { Endpoint = "http://127.0.0.1:19000", ConnectionKey = "test-only-connection-key", MinIntervalMs = 25 };
    private static MotionFrame Frame(float position, int duration) => new()
    {
        L0 = position, DeltaMs = duration, RequestedCommandMode = TCodeCommandMode.Interval,
        RequestedMotionValue = duration, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.L0 },
    };
    private static HttpResponseMessage Json(object data) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(JsonSerializer.Serialize(data), Encoding.UTF8, "application/json"),
    };

    internal sealed record ApiRequest(string Method, string Path, string Url, Dictionary<string, string> Headers, JsonElement? Body);
    internal sealed class ApiTransport : HttpMessageHandler
    {
        private readonly Func<ApiRequest, CancellationToken, Task<HttpResponseMessage?>> _respond;
        public ConcurrentQueue<ApiRequest> Requests { get; } = new();
        public ApiTransport(Func<ApiRequest, HttpResponseMessage?>? respond = null)
            => _respond = (request, _) => Task.FromResult(respond?.Invoke(request));
        public ApiTransport(Func<ApiRequest, CancellationToken, Task<HttpResponseMessage?>> respond) => _respond = respond;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellation)
        {
            JsonElement? body = request.Content is null ? null : JsonSerializer.Deserialize<JsonElement>(await request.Content.ReadAsStringAsync(cancellation));
            var snapshot = new ApiRequest(request.Method.Method, request.RequestUri!.AbsolutePath, request.RequestUri.AbsoluteUri,
                request.Headers.ToDictionary(header => header.Key, header => string.Join(",", header.Value), StringComparer.OrdinalIgnoreCase), body);
            Requests.Enqueue(snapshot);
            if (await _respond(snapshot, cancellation) is { } response) return response;
            if (snapshot.Path.EndsWith("connected")) return Json(new { connected = true });
            if (snapshot.Path.EndsWith("info")) return Json(new { fwVersion = "3.2.0", firmwareStatus = "UP_TO_DATE", deviceType = "vacuglide" });
            if (snapshot.Path == "/command" && body!.Value.GetProperty("command").GetString() == "GetToys")
                return Json(new { code = 200, data = new { toys = "{\"test-toy\":{\"status\":\"1\"}}" } });
            if (snapshot.Path == "/command") return Json(new { code = 200 });
            if (snapshot.Path == "/servertime")
            {
                var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                return snapshot.Headers.ContainsKey("X-Api-Key") || snapshot.Headers.ContainsKey("Authorization")
                    ? Json(new { server_time = now }) : Json(new { serverTime = now });
            }
            return Json(new { result = 0 });
        }
    }
}
