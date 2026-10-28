using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Sensa.Configuration;
using Sensa.Motion;

namespace Sensa.Outputs.Devices;

/// <summary>
/// Explicit vendor REST integrations. Position and scalar commands retain their
/// distinct semantics; script preparation and playback are explicit operations.
/// </summary>
public sealed class VendorDeviceOutput : IAsyncDisposable
{
    private const int MaximumResponseBytes = 64 * 1024;
    private readonly string _type;
    private readonly DeviceProtocolOptions _options;
    private readonly HttpClient _http;
    private readonly bool _ownsHttp;
    private readonly TimeProvider _clock;
    private readonly MotionAxis _axis;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _generationSync = new();
    private CancellationTokenSource _motionCancellation = new();
    private long _generation;
    private long _latestFrame;
    private long? _lastSentTimestamp;
    private Uri _endpoint;
    private volatile bool _disposed;
    private int _disposeStarted;
    private volatile bool _connected;
    private volatile bool _canStop;
    private int _mode = -1;
    private double _lastPosition;
    private volatile bool _scriptPrepared;
    private volatile bool _scriptPlaying;
    private volatile int _scriptPositionMs;
    private long _serverTimeOffsetMs;

    public bool IsConnected => _connected && !_disposed;
    public bool SupportsStreaming => true;
    public string CommandKind => _type is "VacuGlide" or "Lovense" ? "Scalar" : "Position";
    public bool SupportsScripts => _type is "Handy" or "Autoblow" or "VacuGlide";
    public bool ScriptPrepared => _scriptPrepared;
    public bool ScriptPlaying => _scriptPlaying;
    public int ScriptPositionMs => _scriptPositionMs;
    public string? LastError { get; private set; }

    /// <summary>Invalidate pending motion immediately; the owner then performs its ordered stop.</summary>
    public void CancelPendingCommands() => CancelMotion();

    public VendorDeviceOutput(string type, DeviceProtocolOptions options, HttpClient? client = null, TimeProvider? time = null)
    {
        _type = type switch
        {
            "Handy" or "Autoblow" or "VacuGlide" or "Lovense" => type,
            _ => throw new ArgumentException("Unsupported vendor API output type.", nameof(type)),
        };
        _options = DeviceProtocolOptions.Clone(options);
        DeviceProtocolOptions.Validate(_options);
        _axis = Enum.Parse<MotionAxis>(_options.Axis);
        _clock = time ?? TimeProvider.System;
        _endpoint = DeviceProtocolOptions.ValidateEndpoint(_options.Endpoint.Length > 0 ? _options.Endpoint : type switch
        {
            "Handy" => _options.ApiVersion == 3 ? "https://www.handyfeeling.com/api/handy-rest/v3/" : "https://www.handyfeeling.com/api/handy/v2/",
            "Autoblow" or "VacuGlide" => "https://latency.autoblowapi.com/",
            "Lovense" => "https://127-0-0-1.lovense.club:30010/",
            _ => throw new InvalidOperationException(),
        });
        _ownsHttp = client is null;
        // Device credentials must not follow redirects to a different host.
        _http = client ?? new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = Timeout.InfiniteTimeSpan };
    }

    public async Task ConnectAsync(CancellationToken cancellation = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        await _gate.WaitAsync(cancellation);
        try
        {
            if (IsConnected) return;
            LastError = null;
            if (_type == "Lovense")
            {
                if (_options.DeviceId.Length == 0) throw new InvalidOperationException("Select a specific Lovense toy ID before connecting.");
                var result = await RequestAsync(HttpMethod.Post, "command", new { command = "GetToys" }, cancellation);
                if (!TryFindLovenseToy(result, _options.DeviceId)) throw new InvalidOperationException("The selected Lovense toy is not connected.");
            }
            else
            {
                if (_options.ConnectionKey.Length == 0) throw new InvalidOperationException("Configure the device connection key before connecting.");
                if (_type == "Handy" && _options.ApiVersion == 3 && _options.ApiKey.Length == 0 && _options.AuthToken.Length == 0)
                    throw new InvalidOperationException("Handy API v3 requires an application API key or client token.");
                var prefix = CloudPrefix;
                var status = Unwrap(await RequestAsync(HttpMethod.Get, prefix + "connected", null, cancellation));
                if (!status.TryGetProperty("connected", out var connected) || connected.ValueKind != JsonValueKind.True)
                    throw new InvalidOperationException("The device is not connected to its API.");
                if (_type != "Handy" && status.TryGetProperty("cluster", out var cluster) && cluster.ValueKind == JsonValueKind.String)
                    _endpoint = ValidateCluster(cluster.GetString()!);
                var info = Unwrap(await RequestAsync(HttpMethod.Get, prefix + "info", null, cancellation));
                if (_type == "Handy" && _options.ApiVersion == 2 && info.TryGetProperty("fwVersion", out var firmware)
                    && firmware.ValueKind == JsonValueKind.String && int.TryParse(firmware.GetString()!.Split('.')[0], out var major) && major != 3)
                    throw new InvalidOperationException("This Handy firmware requires a different API version; firmware v4+ uses API v3.");
                if (_type == "VacuGlide" && info.TryGetProperty("deviceType", out var deviceType) && deviceType.GetString() != "vacuglide")
                    throw new InvalidOperationException("The selected device is not a VacuGlide.");
                if (_type != "Handy") await RequestAsync(HttpMethod.Get, prefix + "state", null, cancellation);
            }
            _mode = -1;
            _lastSentTimestamp = null;
            _scriptPrepared = _scriptPlaying = false;
            _scriptPositionMs = 0;
            _canStop = _connected = true;
        }
        catch
        {
            _connected = false;
            throw;
        }
        finally { _gate.Release(); }
    }

    public async Task SendAsync(MotionFrame frame, CancellationToken cancellation = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (frame.ActiveAxes is not null && !frame.ActiveAxes.Contains(_axis)) return;
        var position = MotionAxisHelper.Get(frame, _axis);
        if (!float.IsFinite(position) || position is < 0 or > 1) throw new ArgumentException("Device command must be finite and within 0–1.", nameof(frame));
        var requestedDuration = frame.RequestedCommandMode == TCodeCommandMode.Interval ? frame.RequestedMotionValue ?? frame.DeltaMs : frame.DeltaMs;
        if (!double.IsFinite(requestedDuration) || requestedDuration is < 0 or > 600000)
            throw new ArgumentException("Device command duration must be 0–600000 ms.", nameof(frame));
        var duration = (int)Math.Round(requestedDuration);

        long generation;
        CancellationToken motionToken;
        lock (_generationSync) { generation = _generation; motionToken = _motionCancellation.Token; }
        var sequence = Interlocked.Increment(ref _latestFrame);
        using var commandCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellation, motionToken);
        try
        {
            await _gate.WaitAsync(commandCancellation.Token);
            try
            {
                EnsureConnected();
                if (generation != Volatile.Read(ref _generation) || sequence != Volatile.Read(ref _latestFrame)) return;
                if (_lastSentTimestamp is { } previous)
                {
                    var remaining = TimeSpan.FromMilliseconds(_options.MinIntervalMs) - _clock.GetElapsedTime(previous);
                    if (remaining > TimeSpan.Zero) await Task.Delay(remaining, _clock, commandCancellation.Token);
                }
                if (sequence != Volatile.Read(ref _latestFrame)) return;
                // Explicit script playback owns this device until stopped; a queued
                // live frame must not silently switch the API mode underneath it.
                if (_scriptPlaying) return;
                if (_type == "Handy")
                {
                    await SetHandyModeAsync(2, commandCancellation.Token);
                    object payload = _options.ApiVersion == 3
                        ? new { xp = Math.Round(position * 100, 4), t = duration, stop_on_target = true, immediate_rsp = true }
                        : new { position = Math.Round(position * 100, 4), duration, stopOnTarget = true, immediateResponse = true };
                    await RequestAsync(HttpMethod.Put, "hdsp/xpt", payload, commandCancellation.Token);
                }
                else if (_type == "Autoblow")
                {
                    // This API exposes a speed, not a duration: keep that distinction explicit.
                    _mode = 2;
                    await RequestAsync(HttpMethod.Put, "autoblow/goto", new { position = Math.Round(position * 100, 4), speed = _options.Speed }, commandCancellation.Token);
                }
                else if (_type == "VacuGlide")
                {
                    _mode = 2;
                    await RequestAsync(HttpMethod.Put, "vacuglide/target-speed", new { targetSpeed = Math.Round(position * 100, 4) }, commandCancellation.Token);
                }
                else
                {
                    var maximum = _options.Function == "Pump" ? 3 : 20;
                    var strength = (int)Math.Round(position * maximum, MidpointRounding.AwayFromZero);
                    await RequestAsync(HttpMethod.Post, "command", new
                    {
                        command = "Function", action = $"{_options.Function}:{strength}", timeSec = 0,
                        toy = _options.DeviceId, apiVer = 1, stopPrevious = 1,
                    }, commandCancellation.Token);
                }
                _lastPosition = position;
                _lastSentTimestamp = _clock.GetTimestamp();
            }
            finally { _gate.Release(); }
        }
        catch (OperationCanceledException) when (motionToken.IsCancellationRequested && !cancellation.IsCancellationRequested) { }
        catch
        {
            _connected = false;
            throw;
        }
    }

    public async Task PrepareScriptAsync(Uri url, string? sha256 = null, CancellationToken cancellation = default)
    {
        ArgumentNullException.ThrowIfNull(url);
        if (!url.IsAbsoluteUri || url.Scheme is not ("https" or "http") || url.UserInfo.Length > 0 || url.AbsoluteUri.Length > 8192)
            throw new ArgumentException("A script requires a reachable HTTP(S) URL without embedded credentials.", nameof(url));
        if (sha256 is not null && (sha256.Length != 64 || sha256.Any(character => !Uri.IsHexDigit(character))))
            throw new ArgumentException("Script SHA-256 must contain 64 hexadecimal characters.", nameof(sha256));
        if (!SupportsScripts) throw new InvalidOperationException("This output does not expose synchronized scripts.");
        if (_type == "Handy" && (_options.ScriptFormat == "Funscript" || url.AbsolutePath.EndsWith(".funscript", StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("Handy synchronized playback requires a CSV script URL.");
        if (_type is "Autoblow" or "VacuGlide" && url.Scheme != "https")
            throw new ArgumentException("Autoblow cloud script downloads require a public HTTPS URL.", nameof(url));
        await RunScheduledAsync(async operationCancellation =>
        {
            EnsureConnected();
            if (_scriptPlaying) await StopScriptCoreAsync(operationCancellation);
            _scriptPrepared = false;
            if (_type == "Handy")
            {
                await SetHandyModeAsync(1, operationCancellation);
                var payload = new Dictionary<string, object> { ["url"] = url.AbsoluteUri };
                if (sha256 is not null && _options.ApiVersion == 2) payload["sha256"] = sha256.ToLowerInvariant();
                await RequestAsync(HttpMethod.Put, "hssp/setup", payload, operationCancellation, _options.ScriptTimeoutMs);
                if (_options.OffsetMs != 0) await RequestAsync(HttpMethod.Put, "hstp/offset", new { offset = _options.OffsetMs }, operationCancellation);
                await SynchronizeServerTimeCoreAsync(operationCancellation);
            }
            else
            {
                var format = _options.ScriptFormat == "Funscript" || url.AbsolutePath.EndsWith(".funscript", StringComparison.OrdinalIgnoreCase) ? "funscript" : "csv";
                await RequestAsync(HttpMethod.Put, CloudPrefix + $"sync-script/upload-{format}-url", new { url = url.AbsoluteUri }, operationCancellation, _options.ScriptTimeoutMs);
                if (_options.OffsetMs != 0) await RequestAsync(HttpMethod.Put, CloudPrefix + "sync-script/offset", new { offsetTimeMs = _options.OffsetMs }, operationCancellation);
            }
            _scriptPositionMs = 0;
            operationCancellation.ThrowIfCancellationRequested();
            _scriptPrepared = true;
        }, cancellation);
    }

    public async Task PlayScriptAsync(int positionMs = 0, CancellationToken cancellation = default)
    {
        ValidateScriptPosition(positionMs);
        await RunScheduledAsync(async operationCancellation => { EnsureConnected(); await PlayScriptCoreAsync(positionMs, operationCancellation); }, cancellation);
    }

    public async Task PlayScriptAsync(int positionMs, Func<bool> canMove, CancellationToken cancellation = default)
    {
        ValidateScriptPosition(positionMs);
        await RunScheduledAsync(async operationCancellation =>
        {
            EnsureConnected();
            if (!canMove()) throw new InvalidOperationException("Input is no longer active.");
            await PlayScriptCoreAsync(positionMs, operationCancellation);
        }, cancellation);
    }

    public async Task SeekScriptAsync(int positionMs, CancellationToken cancellation = default)
    {
        ValidateScriptPosition(positionMs);
        await RunScheduledAsync(async operationCancellation =>
        {
            EnsureConnected();
            if (!_scriptPrepared) throw new InvalidOperationException("Prepare a script before seeking.");
            if (_scriptPlaying) await PlayScriptCoreAsync(positionMs, operationCancellation);
            else _scriptPositionMs = positionMs;
        }, cancellation);
    }

    public async Task SeekScriptAsync(int positionMs, Func<bool> canMove, CancellationToken cancellation = default)
    {
        ValidateScriptPosition(positionMs);
        await RunScheduledAsync(async operationCancellation =>
        {
            EnsureConnected();
            if (!canMove()) throw new InvalidOperationException("Input is no longer active.");
            if (!_scriptPrepared) throw new InvalidOperationException("Prepare a script before seeking.");
            if (_scriptPlaying) await PlayScriptCoreAsync(positionMs, operationCancellation);
            else _scriptPositionMs = positionMs;
        }, cancellation);
    }

    public async Task StopScriptAsync(CancellationToken cancellation = default)
    {
        CancelMotion();
        await _gate.WaitAsync(cancellation);
        try { if (_canStop && _scriptPrepared) await StopScriptCoreAsync(cancellation); }
        finally { _gate.Release(); }
    }

    public async Task StopAsync(CancellationToken cancellation = default)
    {
        if (_disposed) return;
        CancelMotion();
        await _gate.WaitAsync(cancellation);
        try
        {
            if (!_canStop) return;
            if (_type == "VacuGlide")
            {
                // The documented target-speed stop stops the motor whatever is playing.
                await RequestAsync(HttpMethod.Put, "vacuglide/target-speed/stop", null, cancellation);
                _scriptPlaying = false;
                _lastSentTimestamp = null;
                return;
            }
            if (_scriptPrepared) await StopScriptCoreAsync(cancellation);
            if (_type == "Handy" && _mode == 2)
            {
                object payload = _options.ApiVersion == 3
                    ? new { xp = _lastPosition * 100, vp = 0, stop_on_target = true, immediate_rsp = true }
                    : new { position = _lastPosition * 100, velocity = 0, stopOnTarget = true, immediateResponse = true };
                await RequestAsync(HttpMethod.Put, "hdsp/xpvp", payload, cancellation);
            }
            else if (_type == "Autoblow" && _mode == 2)
                await RequestAsync(HttpMethod.Put, "autoblow/oscillate", new { speed = 0, minY = 0, maxY = 100 }, cancellation);
            else if (_type == "Lovense")
                await RequestAsync(HttpMethod.Post, "command", new { command = "Function", action = "Stop", timeSec = 0, toy = _options.DeviceId, apiVer = 1 }, cancellation);
            _lastSentTimestamp = null;
        }
        finally { _gate.Release(); }
    }

    public async Task DisconnectAsync(CancellationToken cancellation = default)
    {
        try { await StopAsync(cancellation); }
        finally
        {
            _connected = _canStop = _scriptPrepared = _scriptPlaying = false;
            _mode = -1;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposeStarted, 1) != 0) return;
        try { await DisconnectAsync(); }
        catch (Exception error) when (error is InvalidOperationException or OperationCanceledException) { LastError = "The final device stop could not be confirmed."; }
        _disposed = true;
        lock (_generationSync) { _motionCancellation.Cancel(); _motionCancellation.Dispose(); }
        if (_ownsHttp) _http.Dispose();
        // Waiters may still be unwinding after cancellation, so the managed gate is not disposed.
    }

    private string CloudPrefix => _type switch { "Autoblow" => "autoblow/", "VacuGlide" => "vacuglide/", _ => "" };

    private void CancelMotion()
    {
        lock (_generationSync)
        {
            if (_disposed) return;
            Interlocked.Increment(ref _generation);
            Interlocked.Increment(ref _latestFrame);
            var previous = _motionCancellation;
            _motionCancellation = new CancellationTokenSource();
            previous.Cancel();
            previous.Dispose();
        }
    }

    private async Task RunScheduledAsync(Func<CancellationToken, Task> operation, CancellationToken cancellation)
    {
        long generation;
        CancellationToken motionToken;
        lock (_generationSync) { generation = _generation; motionToken = _motionCancellation.Token; }
        using var scheduledCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellation, motionToken);
        await _gate.WaitAsync(scheduledCancellation.Token);
        try
        {
            if (generation != Volatile.Read(ref _generation)) throw new OperationCanceledException("The operation was cancelled by a device stop.");
            await operation(scheduledCancellation.Token);
        }
        finally { _gate.Release(); }
    }

    private async Task SetHandyModeAsync(int mode, CancellationToken cancellation)
    {
        if (_mode == mode) return;
        await RequestAsync(HttpMethod.Put, _options.ApiVersion == 3 ? "mode2" : "mode", new { mode }, cancellation);
        _mode = mode;
    }

    private async Task PlayScriptCoreAsync(int positionMs, CancellationToken cancellation)
    {
        if (!_scriptPrepared) throw new InvalidOperationException("Prepare a script before playback.");
        if (_type == "Handy")
        {
            await SetHandyModeAsync(1, cancellation);
            var estimatedTime = _clock.GetUtcNow().ToUnixTimeMilliseconds() + _serverTimeOffsetMs;
            object payload = _options.ApiVersion == 3
                ? new { start_time = positionMs, server_time = estimatedTime }
                : new { startTime = positionMs, estimatedServerTime = estimatedTime };
            await RequestAsync(HttpMethod.Put, "hssp/play", payload, cancellation);
        }
        else await RequestAsync(HttpMethod.Put, CloudPrefix + "sync-script/start", new { startTimeMs = positionMs }, cancellation);
        _scriptPositionMs = positionMs;
        _scriptPlaying = true;
        _mode = 1;
    }

    private async Task StopScriptCoreAsync(CancellationToken cancellation)
    {
        if (_type == "Handy")
        {
            if (_mode != 1) return;
            await RequestAsync(HttpMethod.Put, "hssp/stop", null, cancellation);
        }
        else await RequestAsync(HttpMethod.Put, CloudPrefix + "sync-script/stop", new { }, cancellation);
        _scriptPlaying = false;
    }

    private async Task SynchronizeServerTimeCoreAsync(CancellationToken cancellation)
    {
        // The lowest-RTT sample avoids bias from a queued response; midpoint estimates transit time.
        long bestRoundTrip = long.MaxValue;
        for (var sample = 0; sample < 3; sample++)
        {
            var before = _clock.GetUtcNow().ToUnixTimeMilliseconds();
            var result = Unwrap(await RequestAsync(HttpMethod.Get, "servertime", null, cancellation));
            var after = _clock.GetUtcNow().ToUnixTimeMilliseconds();
            var name = _options.ApiVersion == 3 ? "server_time" : "serverTime";
            if (!result.TryGetProperty(name, out var value) || !value.TryGetInt64(out var serverTime) || serverTime < 0)
                throw new InvalidOperationException("The Handy API returned an invalid server time.");
            var roundTrip = Math.Max(0, after - before);
            if (roundTrip < bestRoundTrip) { bestRoundTrip = roundTrip; _serverTimeOffsetMs = serverTime - before - roundTrip / 2; }
        }
    }

    private Uri ValidateCluster(string value)
    {
        if (!value.Contains("://", StringComparison.Ordinal)) value = "https://" + value;
        var cluster = DeviceProtocolOptions.ValidateEndpoint(value);
        var sameOrigin = cluster.Scheme == _endpoint.Scheme && cluster.IdnHost == _endpoint.IdnHost && cluster.Port == _endpoint.Port;
        var official = _endpoint.Scheme == "https" && (_endpoint.IdnHost == "autoblowapi.com" || _endpoint.IdnHost.EndsWith(".autoblowapi.com", StringComparison.OrdinalIgnoreCase))
            && cluster.Scheme == "https" && (cluster.IdnHost == "autoblowapi.com" || cluster.IdnHost.EndsWith(".autoblowapi.com", StringComparison.OrdinalIgnoreCase));
        var explicitlyTrusted = cluster.Scheme == "https" && cluster.IdnHost.Equals(_options.TrustedClusterHost, StringComparison.OrdinalIgnoreCase);
        if (!sameOrigin && !official && !explicitlyTrusted)
            throw new InvalidOperationException("The API selected a different cluster host. Configure its exact trusted hostname before sending credentials.");
        return cluster;
    }

    private async Task<JsonElement> RequestAsync(HttpMethod method, string path, object? body, CancellationToken cancellation, int? timeoutMs = null)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromMilliseconds(timeoutMs ?? _options.RequestTimeoutMs));
        using var request = new HttpRequestMessage(method, new Uri(_endpoint, path));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (_type == "Handy")
        {
            request.Headers.Add("X-Connection-Key", _options.ConnectionKey);
            if (_options.ApiVersion == 3)
            {
                if (_options.ApiKey.Length > 0) request.Headers.Add("X-Api-Key", _options.ApiKey);
                if (_options.AuthToken.Length > 0) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.AuthToken);
            }
        }
        else if (_type is "Autoblow" or "VacuGlide") request.Headers.Add("x-device-token", _options.ConnectionKey);
        if (body is not null) request.Content = JsonContent.Create(body);
        try
        {
            using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            timeout.Token.ThrowIfCancellationRequested();
            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException($"{_type} API rejected the request (HTTP {(int)response.StatusCode}).");
            if (response.Content.Headers.ContentLength > MaximumResponseBytes) throw new InvalidOperationException("The device API response exceeds the size limit.");
            await using var content = await response.Content.ReadAsStreamAsync(timeout.Token);
            using var buffer = new MemoryStream();
            var bytes = new byte[4096];
            int read;
            while ((read = await content.ReadAsync(bytes, timeout.Token)) > 0)
            {
                if (buffer.Length + read > MaximumResponseBytes) throw new InvalidOperationException("The device API response exceeds the size limit.");
                buffer.Write(bytes, 0, read);
            }
            if (buffer.Length == 0) return JsonSerializer.SerializeToElement(new { });
            using var document = JsonDocument.Parse(buffer.ToArray(), new JsonDocumentOptions { MaxDepth = 32 });
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) throw new InvalidOperationException("The device API returned an invalid response.");
            if (root.TryGetProperty("error", out var error) && error.ValueKind is not (JsonValueKind.Null or JsonValueKind.False))
            {
                if (error.ValueKind == JsonValueKind.Object && error.TryGetProperty("connected", out var connected) && connected.ValueKind == JsonValueKind.False)
                    _connected = false;
                throw new InvalidOperationException($"{_type} API reported a device error.");
            }
            if (_type == "Lovense" && (!root.TryGetProperty("code", out var code) || !code.TryGetInt32(out var numeric) || numeric != 200))
                throw new InvalidOperationException("Lovense API rejected the command.");
            if (root.TryGetProperty("result", out var result) && result.ValueKind == JsonValueKind.Number && result.TryGetInt32(out var resultCode) && resultCode < 0)
                throw new InvalidOperationException($"{_type} API reported a failed operation.");
            timeout.Token.ThrowIfCancellationRequested();
            LastError = null;
            return root.Clone();
        }
        catch (OperationCanceledException) when (!cancellation.IsCancellationRequested)
        {
            LastError = $"{_type} API request timed out.";
            throw new InvalidOperationException(LastError);
        }
        catch (HttpRequestException)
        {
            LastError = $"{_type} API could not be reached.";
            throw new InvalidOperationException(LastError);
        }
        catch (JsonException)
        {
            LastError = $"{_type} API returned invalid JSON.";
            throw new InvalidOperationException(LastError);
        }
        catch (InvalidOperationException error)
        {
            LastError = error.Message;
            throw;
        }
    }

    private static JsonElement Unwrap(JsonElement root) => root.TryGetProperty("result", out var value) && value.ValueKind == JsonValueKind.Object ? value : root;

    private static bool TryFindLovenseToy(JsonElement root, string id)
    {
        if (!root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object || !data.TryGetProperty("toys", out var toys)) return false;
        if (toys.ValueKind == JsonValueKind.String)
        {
            try { using var document = JsonDocument.Parse(toys.GetString()!, new JsonDocumentOptions { MaxDepth = 16 }); return IsToyConnected(document.RootElement, id); }
            catch (JsonException) { return false; }
        }
        return IsToyConnected(toys, id);
    }

    private static bool IsToyConnected(JsonElement toys, string id)
    {
        if (toys.ValueKind != JsonValueKind.Object || !toys.TryGetProperty(id, out var toy) || toy.ValueKind != JsonValueKind.Object
            || !toy.TryGetProperty("status", out var status)) return false;
        return status.ValueKind == JsonValueKind.String ? status.GetString() == "1" : status.ValueKind == JsonValueKind.Number && status.TryGetInt32(out var number) && number == 1;
    }

    private void ValidateScriptPosition(int positionMs)
    {
        var maximum = _type is "Autoblow" or "VacuGlide" ? 16777214 : 86400000;
        if (positionMs < 0 || positionMs > maximum) throw new ArgumentOutOfRangeException(nameof(positionMs), "Script position is outside this device API's supported range.");
    }

    private void EnsureConnected()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (!IsConnected) throw new InvalidOperationException("Connect the vendor API output first.");
    }
}
