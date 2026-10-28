using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;

namespace Sensa.Input.Protocols;

/// <summary>A bounded position trajectory; speed is normalized range travelled per second.</summary>
public sealed class ProtocolScriptTrajectory
{
    public sealed record Point(long AtMs, double Position);
    private readonly Point[] _points;
    public ProtocolScriptTrajectory(IEnumerable<Point> points)
    {
        _points = points.ToArray();
        if (_points.Length == 0 || _points.Any(point => point.AtMs < 0 || !double.IsFinite(point.Position) || point.Position is < 0 or > 1)
            || _points.Zip(_points.Skip(1)).Any(pair => pair.First.AtMs >= pair.Second.AtMs))
            throw new ArgumentException("A trajectory needs increasing, finite time-position points.", nameof(points));
    }
    public long DurationMs => _points[^1].AtMs;
    public double Sample(long atMs)
    {
        var upper = Upper(atMs);
        if (upper == 0) return _points[0].Position;
        if (upper == _points.Length) return _points[^1].Position;
        var a = _points[upper - 1]; var b = _points[upper];
        return a.Position + (b.Position - a.Position) * (atMs - a.AtMs) / (b.AtMs - a.AtMs);
    }
    public double SpeedPerSecond(long atMs)
    {
        var upper = Upper(atMs);
        if (upper == 0 || upper == _points.Length) return 0;
        var a = _points[upper - 1]; var b = _points[upper];
        return Math.Abs(b.Position - a.Position) * 1000 / (b.AtMs - a.AtMs);
    }
    private int Upper(long atMs)
    {
        var low = 0; var high = _points.Length;
        while (low < high) { var mid = low + (high - low) / 2; if (_points[mid].AtMs <= atMs) low = mid + 1; else high = mid; }
        return low;
    }
}

/// <summary>Shared script boundary. URLs never inherit inbound authentication or cookies.</summary>
public static class ProtocolScriptLoader
{
    public const int MaximumBytes = 1024 * 1024;
    public const long MaximumDurationMs = 16777214;
    public static HttpClient CreateHttpClient() => CreateHttpClient(null, null, null);
    internal static HttpClient CreateHttpClient(Func<string, CancellationToken, Task<IPAddress[]>>? resolve,
        Func<IPEndPoint, CancellationToken, ValueTask<Stream>>? dial, IWebProxy? proxy)
    {
        var inheritedProxy = proxy ?? HttpClient.DefaultProxy;
        var handler = new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false, Credentials = null, Proxy = inheritedProxy };
        handler.ConnectCallback = (context, token) => ConnectPinnedAsync(context.InitialRequestMessage.RequestUri!, context.DnsEndPoint,
            resolve ?? Dns.GetHostAddressesAsync, dial ?? ConnectSocketAsync, token);
        return new(new ScriptProxyGuard(handler, inheritedProxy)) { Timeout = Timeout.InfiniteTimeSpan };
    }
    private sealed class ScriptProxyGuard(HttpMessageHandler inner, IWebProxy proxy) : DelegatingHandler(inner)
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            var uri = request.RequestUri!;
            if (!proxy.IsBypassed(uri) && proxy.GetProxy(uri) is { } destination && destination != uri)
                throw new InvalidDataException("URL imports through a network proxy cannot verify the final address; upload the script file with multipart instead.");
            return base.SendAsync(request, token);
        }
    }
    internal static async ValueTask<Stream> ConnectPinnedAsync(Uri uri, DnsEndPoint endpoint,
        Func<string, CancellationToken, Task<IPAddress[]>> resolve, Func<IPEndPoint, CancellationToken, ValueTask<Stream>> dial, CancellationToken token)
    {
        if (!endpoint.Host.Trim('[', ']').Equals(uri.IdnHost.Trim('[', ']'), StringComparison.OrdinalIgnoreCase) || endpoint.Port != uri.Port)
            throw new InvalidDataException("URL imports through a network proxy cannot verify the final address; upload the script file with multipart instead.");
        var allowLoopback = IPAddress.TryParse(uri.IdnHost.Trim('[', ']'), out var literal) && IPAddress.IsLoopback(literal);
        var addresses = IPAddress.TryParse(endpoint.Host.Trim('[', ']'), out var address) ? [address] : await resolve(endpoint.Host, token).ConfigureAwait(false);
        if (addresses.Length == 0 || addresses.Any(candidate => allowLoopback ? !IPAddress.IsLoopback(candidate) : !PublicAddress(candidate)))
            throw new InvalidDataException("The actual script connection resolved to a nonpublic address.");
        foreach (var candidate in addresses)
        {
            try { return await dial(new(candidate, endpoint.Port), token).ConfigureAwait(false); }
            catch (SocketException) { }
        }
        throw new HttpRequestException("The script host could not be connected.");
    }
    private static async ValueTask<Stream> ConnectSocketAsync(IPEndPoint endpoint, CancellationToken token)
    {
        var socket = new Socket(endpoint.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
        try
        {
            // Connect to the vetted IP, never resolve the hostname a third time.
            await socket.ConnectAsync(endpoint, token).ConfigureAwait(false);
            if (socket.RemoteEndPoint is not IPEndPoint remote || !remote.Address.Equals(endpoint.Address))
                throw new IOException("The script connection did not reach the vetted address.");
            return new NetworkStream(socket, ownsSocket: true);
        }
        catch { socket.Dispose(); throw; }
    }

    public static async Task<ProtocolScriptTrajectory> DownloadAsync(Uri uri, bool csv, HttpClient client, TimeProvider clock, CancellationToken token, string? expectedSha256 = null)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10), clock);
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(token, timeout.Token);
        await ValidateUrlAsync(uri, cancel.Token).ConfigureAwait(false);
        if (client.DefaultRequestHeaders.Any()) throw new InvalidDataException("The script client must not carry default request headers.");
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        HttpResponseMessage received;
        try { received = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancel.Token).ConfigureAwait(false); }
        catch (HttpRequestException error) when (error.InnerException is InvalidDataException rejected)
        { throw new InvalidDataException(rejected.Message); }
        using var response = received;
        if ((int)response.StatusCode is >= 300 and < 400) throw new InvalidDataException("Script redirects are not supported.");
        if (!response.IsSuccessStatusCode) throw new InvalidDataException("The script server rejected the request.");
        if (response.RequestMessage?.RequestUri is { } final && final != uri)
            throw new InvalidDataException("The script client followed a redirect; use a client with redirects disabled.");
        if (response.Content.Headers.ContentLength > MaximumBytes) throw new InvalidDataException("Script exceeds 1 MiB.");
        await using var stream = await response.Content.ReadAsStreamAsync(cancel.Token).ConfigureAwait(false);
        var bytes = await ReadBoundedAsync(stream, MaximumBytes, cancel.Token).ConfigureAwait(false);
        if (expectedSha256 is not null && (expectedSha256.Length != 64 || expectedSha256.Any(character => !Uri.IsHexDigit(character))
            || !Convert.ToHexString(SHA256.HashData(bytes)).Equals(expectedSha256, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidDataException("Script SHA-256 does not match.");
        return Parse(bytes, csv);
    }

    internal static async Task ValidateUrlAsync(Uri uri, CancellationToken token, Func<string, CancellationToken, Task<IPAddress[]>>? resolve = null)
    {
        if (!uri.IsAbsoluteUri || uri.UserInfo.Length != 0 || uri.Fragment.Length != 0)
            throw new InvalidDataException("Use an absolute script URL without credentials or fragments.");
        var host = uri.IdnHost.Trim('[', ']');
        if (IPAddress.TryParse(host, out var literal))
        {
            if (IPAddress.IsLoopback(literal) && uri.Scheme is "http" or "https") return;
            if (uri.Scheme != "https" || !PublicAddress(literal)) throw new InvalidDataException("Script hosts must be public HTTPS or literal loopback HTTP(S).");
            return;
        }
        if (uri.Scheme != "https" || !host.Contains('.') || host.EndsWith(".", StringComparison.Ordinal)
            || new[] { ".localhost", ".local", ".internal", ".test", ".invalid" }.Any(suffix => host.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidDataException("Script hosts must be public HTTPS or literal loopback HTTP(S).");
        var addresses = await (resolve ?? Dns.GetHostAddressesAsync)(host, token).ConfigureAwait(false);
        if (addresses.Length == 0 || addresses.Any(address => !PublicAddress(address)))
            throw new InvalidDataException("Script hosts must resolve exclusively to public addresses.");
    }

    private static bool PublicAddress(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        if (IPAddress.IsLoopback(address) || address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any)) return false;
        var b = address.GetAddressBytes();
        if (address.AddressFamily == AddressFamily.InterNetworkV6)
            return !address.IsIPv6LinkLocal && !address.IsIPv6SiteLocal && !address.IsIPv6Multicast && (b[0] & 0xe0) == 0x20
                && !(b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0d && b[3] == 0xb8);
        return b[0] is not (0 or 10 or 127) && b[0] < 224
            && !(b[0] == 100 && b[1] is >= 64 and <= 127) && !(b[0] == 169 && b[1] == 254)
            && !(b[0] == 172 && b[1] is >= 16 and <= 31) && !(b[0] == 192 && b[1] == 168)
            && !(b[0] == 192 && b[1] == 0) && !(b[0] == 198 && b[1] is 18 or 19)
            && !(b[0] == 198 && b[1] == 51 && b[2] == 100) && !(b[0] == 203 && b[1] == 0 && b[2] == 113);
    }

    public static ProtocolScriptTrajectory Parse(byte[] bytes, bool csv)
    {
        if (bytes.Length > MaximumBytes) throw new InvalidDataException("Script exceeds 1 MiB.");
        var points = new List<ProtocolScriptTrajectory.Point>();
        if (csv)
        {
            var text = new UTF8Encoding(false, true).GetString(bytes).TrimStart('\uFEFF');
            if (!text.EndsWith('\n')) throw new InvalidDataException("CSV scripts must end with a newline.");
            foreach (var line in text.Split('\n'))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                var pair = line.TrimEnd('\r').Split(',');
                if (pair.Length != 2 || !long.TryParse(pair[0], NumberStyles.None, CultureInfo.InvariantCulture, out var at)
                    || !double.TryParse(pair[1], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var pos))
                    throw new InvalidDataException("CSV requires time,position pairs without a header.");
                Add(at, pos);
            }
        }
        else
        {
            using var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 16 });
            ValidateNames(document.RootElement);
            if (document.RootElement.ValueKind != JsonValueKind.Object || !document.RootElement.TryGetProperty("actions", out var actions)
                || actions.ValueKind != JsonValueKind.Array) throw new InvalidDataException("Funscript requires an actions array.");
            var hasInverted = document.RootElement.TryGetProperty("inverted", out var invert);
            if (hasInverted && invert.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) throw new InvalidDataException("inverted must be boolean.");
            var inverted = hasInverted && invert.GetBoolean();
            foreach (var point in actions.EnumerateArray())
            {
                if (point.ValueKind != JsonValueKind.Object || !point.TryGetProperty("at", out var at) || at.ValueKind != JsonValueKind.Number || !at.TryGetInt64(out var time)
                    || !point.TryGetProperty("pos", out var pos) || pos.ValueKind != JsonValueKind.Number || !pos.TryGetDouble(out var position)) throw new InvalidDataException("Invalid funscript action.");
                Add(time, inverted ? 100 - position : position);
            }
        }
        if (points.Count == 0) throw new InvalidDataException("The script has no actions.");
        return new(points);
        void Add(long at, double position)
        {
            if (points.Count >= 100000 || at is < 0 or > MaximumDurationMs || !double.IsFinite(position) || position is < 0 or > 100
                || points.Count > 0 && at <= points[^1].AtMs) throw new InvalidDataException("Script actions must be increasing, bounded millisecond/percent pairs.");
            points.Add(new(at, position / 100));
        }
    }

    internal static void ValidateNames(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in value.EnumerateObject())
            { if (!names.Add(property.Name)) throw new InvalidDataException("Duplicate JSON property."); ValidateNames(property.Value); }
        }
        else if (value.ValueKind == JsonValueKind.Array) foreach (var child in value.EnumerateArray()) ValidateNames(child);
    }
    internal static async Task<byte[]> ReadBoundedAsync(Stream stream, int maximum, CancellationToken token)
    {
        using var buffer = new MemoryStream();
        var bytes = new byte[4096]; int count;
        while ((count = await stream.ReadAsync(bytes, token).ConfigureAwait(false)) != 0)
        { if (buffer.Length + count > maximum) throw new InvalidDataException("Payload exceeds its size limit."); buffer.Write(bytes, 0, count); }
        return buffer.ToArray();
    }
}

/// <summary>
/// Local, selectable-endpoint compatibility for the documented Autoblow/VacuGlide HTTP API.
/// Position features bridge the original script trajectory; scalar VacuGlide script conversion uses
/// abs(delta position)/seconds, clamped to 1 (one full-range movement per second), not a physical motor model.
/// Official references: https://developers.autoblow.com/reference/http-api-v1-autoblow/
/// and https://developers.autoblow.com/reference/http-api-v1-vacuglide/ .
/// </summary>
public sealed class VendorCloudInputSession : IDisposable
{
    private readonly ProtocolInputConfig _config;
    private readonly IExternalControlSink _sink;
    private readonly TimeProvider _clock;
    private readonly HttpClient _client;
    private readonly bool _ownsClient;
    private readonly ITimer _timer;
    private readonly object _sync = new();
    private readonly CancellationTokenSource _lifetime = new();
    private readonly CancellationToken _stopToken;
    private readonly string _instance = Guid.NewGuid().ToString("N");
    private readonly Dictionary<string, ProtocolScriptTrajectory> _scripts = new(StringComparer.Ordinal);
    private readonly ExternalControlStore? _store;
    private CancellationTokenSource? _fetch;
    private ProtocolScriptTrajectory? _script;
    private string? _owner, _session, _scriptToken;
    private string _mode = "ONLINE_CONNECTED";
    private long _lastActivity, _startedAt, _positionMs, _generation, _taskStartedAt;
    private int _offsetMs;
    private double _low, _high = 1, _speed;
    private bool _positionKnown;
    private double _motionStart, _motionTarget;
    private long _motionAt;
    private int _motionDuration;
    private bool _disposed, _loop;
    private bool Vacu => _config.Type == "VacuGlideHttp";
    private string Prefix => Vacu ? "/vacuglide" : "/autoblow";
    private sealed class ApiError(int status, string message) : Exception(message) { public int Status { get; } = status; }

    public VendorCloudInputSession(ProtocolInputConfig config, IExternalControlSink sink, TimeProvider? clock = null, HttpClient? client = null)
    {
        if (config.Type is not ("AutoblowHttp" or "VacuGlideHttp")) throw new ArgumentException("Choose AutoblowHttp or VacuGlideHttp.", nameof(config));
        _config = config; _sink = sink; _clock = clock ?? TimeProvider.System;
        _stopToken = _lifetime.Token;
        _client = client ?? ProtocolScriptLoader.CreateHttpClient(); _ownsClient = client is null;
        _store = sink as ExternalControlStore;
        if (_store is not null) _store.CommandsCleared += Clear;
        _timer = _clock.CreateTimer(_ => Tick(), null, TimeSpan.FromMilliseconds(20), TimeSpan.FromMilliseconds(20));
    }

    public async Task HandleAsync(HttpContext context)
    {
        object result; var status = 200;
        try
        {
            var path = (context.Request.Path.Value ?? "").TrimEnd('/');
            if (!path.StartsWith(Prefix + "/", StringComparison.Ordinal)) throw new ApiError(404, "Unknown API endpoint.");
            var operation = path[Prefix.Length..];
            var get = HttpMethods.IsGet(context.Request.Method);
            var upload = operation is "/sync-script/upload-csv" or "/sync-script/upload-funscript";
            var download = operation is "/sync-script/upload-csv-url" or "/sync-script/upload-funscript-url";
            if (get && operation is not ("/connected" or "/info" or "/state")) throw new ApiError(405, "This operation requires PUT.");
            if (!get && !HttpMethods.IsPut(context.Request.Method)) throw new ApiError(405, "Use GET or PUT as documented.");
            if (!get && !upload && !download && operation is not ("/sync-script/start" or "/sync-script/stop" or "/sync-script/offset"
                or "/sync-script/load-token" or "/sync-script/loop" or "/goto" or "/oscillate" or "/oscillate/start" or "/oscillate/stop" or "/target-speed" or "/target-speed/stop"))
                throw new ApiError(404, "This API operation is not implemented.");
            var identity = Identity(context);
            if (get)
            {
                lock (_sync)
                {
                    Alive();
                    result = operation switch
                    {
                        "/connected" => new { connected = true, deviceType = Vacu ? "vacuglide" : "autoblow-ultra", emulated = true },
                        "/info" => new { deviceType = Vacu ? "vacuglide" : "autoblow-ultra", firmwareStatus = "EMULATED", firmwareVersion = "Sensa", hardwareVersion = "virtual", emulated = true },
                        _ => State(),
                    };
                }
            }
            else if (upload || download)
            {
                CancellationTokenSource pending; long generation;
                lock (_sync)
                {
                    Alive(); Acquire(identity); StopMotion();
                    pending = CancellationTokenSource.CreateLinkedTokenSource(_stopToken, context.RequestAborted);
                    _fetch = pending; generation = _generation;
                }
                try
                {
                    var csv = operation.Contains("-csv", StringComparison.Ordinal);
                    ProtocolScriptTrajectory script;
                    if (download)
                    {
                        var body = await Body(context.Request, pending.Token).ConfigureAwait(false);
                        if (!Uri.TryCreate(Text(body, "url"), UriKind.Absolute, out var uri)) throw new ApiError(400, "Invalid script URL.");
                        script = await ProtocolScriptLoader.DownloadAsync(uri, csv, _client, _clock, pending.Token).ConfigureAwait(false);
                    }
                    else script = ProtocolScriptLoader.Parse(await FileBody(context.Request, pending.Token).ConfigureAwait(false), csv);
                    lock (_sync)
                    {
                        Alive(); if (generation != _generation || _owner != identity) throw new ApiError(409, "Script preparation was superseded.");
                        if (_scripts.Count >= 8) _scripts.Remove(_scripts.Keys.First());
                        _scriptToken = Guid.NewGuid().ToString("N"); _scripts[_scriptToken] = _script = script;
                        _positionMs = 0; _loop = false; _mode = "SYNC_SCRIPT_PAUSED"; _lastActivity = _clock.GetTimestamp();
                        result = State();
                    }
                }
                finally { lock (_sync) { if (ReferenceEquals(_fetch, pending)) _fetch = null; } pending.Dispose(); }
            }
            else
            {
                var body = await Body(context.Request, context.RequestAborted).ConfigureAwait(false);
                lock (_sync) { Alive(); Acquire(identity); result = Command(operation, body); }
            }
        }
        catch (ApiError error) { status = error.Status; result = Error(error.Message); }
        catch (JsonException) { status = 400; result = Error("Malformed JSON."); }
        catch (InvalidDataException error) { status = 400; result = Error(error.Message); }
        catch (DecoderFallbackException) { status = 400; result = Error("Scripts must be UTF-8."); }
        catch (OperationCanceledException) when (!context.RequestAborted.IsCancellationRequested)
        { status = 408; result = Error("The request timed out, stopped or was superseded."); }
        catch (HttpRequestException) { status = 502; result = Error("The script server could not be reached."); }
        catch (SocketException) { status = 400; result = Error("The script host could not be resolved."); }
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json; charset=utf-8";
        await JsonSerializer.SerializeAsync(context.Response.Body, result, cancellationToken: context.RequestAborted).ConfigureAwait(false);
    }

    private object Command(string operation, JsonElement body)
    {
        switch (operation)
        {
            case "/sync-script/load-token":
                var token = Text(body, "scriptToken");
                if (!_scripts.TryGetValue(token, out var script)) throw new ApiError(404, "Unknown local script token.");
                StopMotion(); _scriptToken = token; _script = script; _positionMs = 0; _loop = false; _mode = "SYNC_SCRIPT_PAUSED"; break;
            case "/sync-script/loop":
                if (!body.TryGetProperty("loop", out var loop) || loop.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                    throw new ApiError(400, "loop must be boolean.");
                if (loop.GetBoolean() && (_script is null || _script.DurationMs <= 0)) throw new ApiError(400, "Load a script with a positive duration before looping.");
                _positionMs = CurrentTime(); _startedAt = _clock.GetTimestamp(); _loop = loop.GetBoolean(); break;
            case "/sync-script/start":
                if (_script is null) throw new ApiError(400, "SYNC_SCRIPT_NOT_LOADED");
                _ = ScriptFeature();
                var start = Integer(body, "startTimeMs", 0, ProtocolScriptLoader.MaximumDurationMs);
                StopMotion(); _positionMs = start; _taskStartedAt = _startedAt = _clock.GetTimestamp(); _mode = "SYNC_SCRIPT_PLAYING"; PublishCurrent(); break;
            case "/sync-script/stop":
                _positionMs = CurrentTime(); StopMotion(); _mode = "SYNC_SCRIPT_PAUSED"; break;
            case "/sync-script/offset":
                _offsetMs = (int)Integer(body, "offsetTimeMs", -600000, 600000); if (_mode == "SYNC_SCRIPT_PLAYING") PublishCurrent(); break;
            case "/goto" when !Vacu:
                var target = Number(body, "position", 0, 100) / 100;
                var speed = Number(body, "speed", 0, 100) / 100;
                var feature = Feature("Position");
                if (speed == 0) { StopMotion(); _speed = 0; break; }
                var current = KnownPosition(); var duration = MovementDuration(current, target, speed);
                StopMotion(); EstablishPosition(current); _mode = "GO_TO"; _speed = speed;
                Publish([new(feature.Channel, target, duration)]); break;
            case "/oscillate" when !Vacu:
                var nextSpeed = Number(body, "speed", 0, 100) / 100;
                var lowPercent = Number(body, "minY", 0, 100); var highPercent = Number(body, "maxY", 0, 100);
                if (highPercent - lowPercent < 10) throw new ApiError(400, "Oscillator endpoints must be at least 10 percent apart.");
                var low = lowPercent / 100; var high = highPercent / 100;
                _ = Feature("Position");
                var origin = nextSpeed > 0 ? KnownPosition() : 0;
                StopMotion(); _speed = nextSpeed; _low = low; _high = high; _mode = "OSCILLATOR_PAUSED";
                if (nextSpeed > 0) { EstablishPosition(origin); _mode = "OSCILLATOR_PLAYING"; OscillateNext(); }
                break;
            case "/oscillate/start" when !Vacu:
                if (_speed <= 0) throw new ApiError(400, "Set a positive oscillator speed first.");
                _ = KnownPosition(); _mode = "OSCILLATOR_PLAYING"; OscillateNext(); break;
            case "/oscillate/stop" when !Vacu:
                StopMotion(); _mode = "OSCILLATOR_PAUSED"; break;
            case "/target-speed" when Vacu:
                var intensity = Number(body, "targetSpeed", 0, 100) / 100; var scalar = Feature("Scalar");
                StopMotion(); _mode = "TARGET_SPEED_PLAYING"; _speed = intensity; Publish([new(scalar.Channel, intensity)]); break;
            case "/target-speed/stop" when Vacu:
                StopMotion(); _speed = 0; _mode = "TARGET_SPEED_PAUSED"; break;
            default: throw new ApiError(404, "This API operation is not implemented for this input type.");
        }
        return State();
    }

    private ProtocolFeatureConfig Feature(string actuator) => _config.Features.FirstOrDefault(feature => feature.Actuator == actuator)
        ?? throw new ApiError(422, "Configure a " + actuator + " feature for this operation.");
    private ProtocolFeatureConfig ScriptFeature() => _config.Features.FirstOrDefault(feature => feature.Actuator == "Position")
        ?? (Vacu ? Feature("Scalar") : throw new ApiError(422, "Autoblow script trajectories require a Position feature."));
    private long CurrentTime()
    {
        var at = _mode == "SYNC_SCRIPT_PLAYING" ? _positionMs + (long)_clock.GetElapsedTime(_startedAt).TotalMilliseconds : _positionMs;
        return _loop && _script is { DurationMs: > 0 } ? at % _script.DurationMs : Math.Min(ProtocolScriptLoader.MaximumDurationMs, at);
    }
    private void PublishCurrent()
    {
        var script = _script!; var feature = ScriptFeature(); var at = CurrentTime() + _offsetMs;
        at = _loop && script.DurationMs > 0 ? (at % script.DurationMs + script.DurationMs) % script.DurationMs : Math.Clamp(at, 0, script.DurationMs);
        var value = feature.Actuator == "Position" ? script.Sample(at) : Math.Clamp(script.SpeedPerSecond(at), 0, 1);
        Publish([new(feature.Channel, value)]);
    }
    private void Publish(IReadOnlyList<ExternalControlCommand> commands)
    {
        if (_session is null || !_sink.Publish(_config.Id, _session, commands, out _))
        { StopMotion(); Release(); throw new ApiError(409, "The control lease is unavailable."); }
        if (_config.Features.First(feature => feature.Channel == commands[0].Channel).Actuator == "Position")
        {
            var start = _positionKnown ? MotionPosition() : commands[0].Value;
            _motionStart = start; _motionTarget = commands[0].Value; _motionAt = _clock.GetTimestamp(); _motionDuration = commands[0].DurationMs;
            _positionKnown = true;
        }
    }
    private void EstablishPosition(double position)
    { _positionKnown = true; _motionStart = _motionTarget = position; _motionDuration = 0; _motionAt = _clock.GetTimestamp(); }
    private double MotionPosition() => _motionDuration == 0 ? _motionTarget
        : _motionStart + (_motionTarget - _motionStart) * Math.Clamp(_clock.GetElapsedTime(_motionAt).TotalMilliseconds / _motionDuration, 0, 1);
    private double KnownPosition() => _positionKnown ? MotionPosition() : throw new ApiError(422, "The starting position is unknown; first play a position script to establish a commanded position.");
    private int MovementDuration(double from, double to, double speed)
    {
        var duration = Math.Ceiling(Math.Abs(to - from) / (speed * _config.MaxSpeedPerSecond) * 1000);
        if (duration > 600000) throw new ApiError(422, "The calibrated move would exceed ten minutes.");
        return Math.Max(1, (int)duration);
    }
    private void OscillateNext()
    {
        var current = KnownPosition(); var target = _motionTarget >= _high ? _low : _high;
        Publish([new(Feature("Position").Channel, target, MovementDuration(current, target, _speed))]);
    }
    private void Tick()
    {
        lock (_sync)
        {
            if (_disposed || _session is null) return;
            if (_mode == "SYNC_SCRIPT_PLAYING" && _clock.GetElapsedTime(_taskStartedAt).TotalMilliseconds >= _config.MaxScriptDurationMs)
            { StopMotion(); _mode = "SYNC_SCRIPT_PAUSED"; _lastActivity = _clock.GetTimestamp(); return; }
            if (_mode is "TARGET_SPEED_PLAYING" or "OSCILLATOR_PLAYING" or "GO_TO"
                && _clock.GetElapsedTime(_lastActivity).TotalMilliseconds >= _config.TimeoutMs)
            { Release(); return; }
            if (_mode is "SYNC_SCRIPT_PLAYING" or "TARGET_SPEED_PLAYING" or "OSCILLATOR_PLAYING" or "GO_TO")
            {
                _sink.Heartbeat(_config.Id, _session);
                try
                {
                    if (_mode == "SYNC_SCRIPT_PLAYING")
                    {
                        PublishCurrent();
                        if (!_loop && CurrentTime() + _offsetMs >= _script!.DurationMs)
                        { var end = _script.DurationMs; StopMotion(); _positionMs = end; _mode = "SYNC_SCRIPT_PAUSED"; _lastActivity = _clock.GetTimestamp(); }
                    }
                    else if (_mode == "OSCILLATOR_PLAYING")
                    {
                        if (_clock.GetElapsedTime(_motionAt).TotalMilliseconds >= _motionDuration) OscillateNext();
                    }
                    else if (_mode == "GO_TO")
                    {
                        if (_clock.GetElapsedTime(_motionAt).TotalMilliseconds >= _motionDuration)
                        { _mode = "ONLINE_CONNECTED"; _lastActivity = _clock.GetTimestamp(); }
                    }
                    else if (!_sink.Publish(_config.Id, _session, [new(Feature("Scalar").Channel, _speed)], out _)) Release();
                }
                catch (ApiError) { Release(); }
            }
            else if (_clock.GetElapsedTime(_lastActivity).TotalMilliseconds >= _config.TimeoutMs) Release();
        }
    }
    private object State() => new
    {
        operationalMode = _mode, position = _positionKnown ? (double?)(MotionPosition() * 100) : null, oscillatorTargetSpeed = _speed * 100,
        oscillatorLowPoint = _low * 100, oscillatorHighPoint = _high * 100, targetSpeed = _speed * 100,
        syncScriptCurrentTime = CurrentTime(), syncScriptOffsetTime = _offsetMs, syncScriptToken = _scriptToken ?? "", syncScriptLoop = _loop,
        emulated = true, scriptScalarConversion = "clamp(abs(delta position01) / delta seconds, 0, 1)",
        maxSpeedPerSecond = _config.MaxSpeedPerSecond,
    };
    private object Error(string message) => new { error = new { code = "SENSA_INPUT_ERROR", message, connected = !_disposed } };
    private void Acquire(string identity)
    {
        if (_session is not null && _mode is not ("SYNC_SCRIPT_PLAYING" or "TARGET_SPEED_PLAYING" or "OSCILLATOR_PLAYING" or "GO_TO")
            && _clock.GetElapsedTime(_lastActivity).TotalMilliseconds >= _config.TimeoutMs) Release();
        if (_owner is not null && _owner != identity) throw new ApiError(409, "Another source owns this input.");
        var session = _session ?? _instance + ":" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)));
        if (!_sink.TryAcquire(_config.Id, session, out _)) throw new ApiError(409, "The input is unavailable or owned by another client.");
        _session = session; _owner = identity; _lastActivity = _clock.GetTimestamp();
    }
    private string Identity(HttpContext context)
    {
        var key = context.Request.Headers["x-device-token"].ToString();
        if (_config.Identifier.Length > 0 && !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(key), Encoding.UTF8.GetBytes(_config.Identifier)))
            throw new ApiError(401, "The local device token is invalid.");
        var session = context.Request.Headers["X-Sensa-Session"].ToString();
        if (session.Length > 128 || session.Any(char.IsControl) || key.Length > 512 || key.Any(char.IsControl)) throw new ApiError(400, "Invalid session identifier.");
        return context.Connection.RemoteIpAddress + "\n" + session + "\n" + key;
    }
    private void StopMotion()
    {
        ++_generation; _fetch?.Cancel(); _fetch = null;
        if (_session is not null) _sink.Stop(_config.Id, _session);
        if (_mode == "SYNC_SCRIPT_PLAYING") _positionMs = CurrentTime();
        _positionKnown = false;
        _mode = _script is null ? "ONLINE_CONNECTED" : "SYNC_SCRIPT_PAUSED";
    }
    private void Release()
    {
        StopMotion();
        if (_session is not null) _sink.Release(_config.Id, _session);
        _session = _owner = null; _script = null; _scriptToken = null; _scripts.Clear(); _positionMs = 0; _loop = false;
    }
    private void Clear() { lock (_sync) { if (!_disposed) StopMotion(); } }
    private void Alive() { if (_disposed) throw new ApiError(503, "The input has stopped."); }
    private async Task<JsonElement> Body(HttpRequest request, CancellationToken token)
    {
        if (request.ContentType is { Length: > 0 } contentType && !contentType.Split(';')[0].Trim().Equals("application/json", StringComparison.OrdinalIgnoreCase))
            throw new ApiError(415, "Use application/json.");
        if (request.ContentLength > 65536) throw new ApiError(413, "Request body exceeds 64 KiB.");
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3), _clock);
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(token, timeout.Token, _stopToken);
        var bytes = await ProtocolScriptLoader.ReadBoundedAsync(request.Body, 65536, cancel.Token).ConfigureAwait(false);
        using var document = JsonDocument.Parse(bytes.Length == 0 ? "{}"u8.ToArray() : bytes, new JsonDocumentOptions { MaxDepth = 16 });
        ProtocolScriptLoader.ValidateNames(document.RootElement);
        if (document.RootElement.ValueKind != JsonValueKind.Object) throw new ApiError(400, "Commands must be JSON objects.");
        return document.RootElement.Clone();
    }
    private async Task<byte[]> FileBody(HttpRequest request, CancellationToken token)
    {
        if (!MediaTypeHeaderValue.TryParse(request.ContentType, out var type) || !type.MediaType.Equals("multipart/form-data", StringComparison.OrdinalIgnoreCase)
            || !type.Boundary.HasValue || type.Boundary.Length > 72) throw new ApiError(415, "Use multipart/form-data with one file part.");
        const int maximum = ProtocolScriptLoader.MaximumBytes + 65536;
        if (request.ContentLength > maximum) throw new ApiError(413, "Script body exceeds its size limit.");
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3), _clock);
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(token, timeout.Token, _stopToken);
        using var memory = new MemoryStream(await ProtocolScriptLoader.ReadBoundedAsync(request.Body, maximum, cancel.Token).ConfigureAwait(false));
        var reader = new MultipartReader(HeaderUtilities.RemoveQuotes(type.Boundary).Value!, memory) { BodyLengthLimit = ProtocolScriptLoader.MaximumBytes };
        var section = await reader.ReadNextSectionAsync(cancel.Token).ConfigureAwait(false);
        if (section is null || !ContentDispositionHeaderValue.TryParse(section.ContentDisposition, out var disposition)
            || HeaderUtilities.RemoveQuotes(disposition.Name).Value != "file") throw new ApiError(400, "One file part named file is required.");
        var bytes = await ProtocolScriptLoader.ReadBoundedAsync(section.Body, ProtocolScriptLoader.MaximumBytes, cancel.Token).ConfigureAwait(false);
        if (await reader.ReadNextSectionAsync(cancel.Token).ConfigureAwait(false) is not null) throw new ApiError(400, "Upload exactly one file part.");
        return bytes;
    }
    private static string Text(JsonElement body, string name) => body.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
        && value.GetString() is { Length: > 0 and <= 4096 } text ? text : throw new ApiError(400, name + " is required.");
    private static double Number(JsonElement body, string name, double minimum, double maximum) => body.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number) && number >= minimum && number <= maximum
        ? number : throw new ApiError(400, name + " must be a finite number within range.");
    private static long Integer(JsonElement body, string name, long minimum, long maximum) => body.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var number) && number >= minimum && number <= maximum
        ? number : throw new ApiError(400, name + " must be an integer within range.");
    public void Dispose()
    {
        lock (_sync)
        {
            if (_disposed) return;
            _disposed = true; _lifetime.Cancel(); Release(); _timer.Dispose();
            if (_store is not null) _store.CommandsCleared -= Clear;
            if (_ownsClient) _client.Dispose();
        }
        _lifetime.Dispose();
    }
}
