using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;

namespace Sensa.Input.Protocols;

/// <summary>Bounded local API adapters. Vendor compatibility requires an upstream-selectable endpoint.</summary>
public sealed partial class HttpProtocolInput : IDisposable
{
    public const int MaximumBodyBytes = 65536;
    private readonly ProtocolInputConfig _config;
    private readonly IExternalControlSink _sink;
    private readonly TimeProvider _clock;
    private readonly object _sync = new();
    private readonly string _instance = Guid.NewGuid().ToString("N");
    private readonly ITimer _timer;
    private readonly VendorCloudInputSession? _cloud;
    private string? _owner;
    private string? _session;
    private long _lastActivity;
    private bool _disposed;
    private sealed class InputException(int status, string message) : Exception(message) { public int Status { get; } = status; }
    private sealed record Reply(int Status, object Body);

    public HttpProtocolInput(ProtocolInputConfig config, IExternalControlSink sink, TimeProvider? clock = null, HttpClient? scriptClient = null)
    {
        _config = config;
        _sink = sink;
        _clock = clock ?? TimeProvider.System;
        if (config.Type == "HandyHttp")
        {
            _scriptHttp = scriptClient ?? ProtocolScriptLoader.CreateHttpClient();
            _ownsScriptHttp = scriptClient is null;
        }
        if (config.Type is "AutoblowHttp" or "VacuGlideHttp") _cloud = new(config, sink, _clock, scriptClient);
        if (sink is ExternalControlStore store) store.CommandsCleared += CancelFromRuntime;
        _timer = _clock.CreateTimer(_ => Tick(), null, TimeSpan.FromMilliseconds(50), TimeSpan.FromMilliseconds(50));
    }

    public async Task HandleAsync(HttpContext context)
    {
        if (_cloud is not null) { await _cloud.HandleAsync(context).ConfigureAwait(false); return; }
        Reply reply;
        try
        {
            var path = (context.Request.Path.Value ?? "/").TrimEnd('/');
            if (path.Length == 0) path = "/";
            var method = context.Request.Method;
            JsonElement body = default;
            if (HttpMethods.IsPost(method) || HttpMethods.IsPut(method))
            {
                if (context.Request.ContentType is { Length: > 0 } contentType
                    && !contentType.Split(';')[0].Trim().Equals("application/json", StringComparison.OrdinalIgnoreCase))
                    throw new InputException(415, "Use application/json for commands.");
                var bytes = await ReadBodyAsync(context.Request, context.RequestAborted).ConfigureAwait(false);
                if (bytes.Length != 0)
                {
                    using var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 16 });
                    body = document.RootElement.Clone();
                    ValidateObject(body);
                }
            }
            else if (!HttpMethods.IsGet(method)) throw new InputException(405, "Method is not supported.");
            var identity = HttpIdentity(context);
            if (_config.Type == "HandyHttp" && HandyPath(path) == "/hssp/setup" && HttpMethods.IsPut(method))
                reply = await PrepareHandyScriptAsync(body, identity, context.RequestAborted).ConfigureAwait(false);
            else lock (_sync)
            {
                ThrowIfDisposed();
                reply = _config.Type switch
                {
                    "JsonHttp" => ProcessJson(path, method, body, identity),
                    "LovenseHttp" => ProcessLovense(path, method, body, context.Request.Query, identity),
                    "HandyHttp" => ProcessHandy(path, method, body, identity),
                    _ => new(404, ErrorBody("This API operation is not supported.")),
                };
            }
        }
        catch (InputException error) { reply = new(error.Status, ErrorBody(error.Message)); }
        catch (JsonException) { reply = new(400, ErrorBody("Malformed JSON command.")); }
        catch (BadHttpRequestException error) { reply = new(error.StatusCode, ErrorBody("Invalid request body.")); }
        context.Response.StatusCode = reply.Status;
        context.Response.ContentType = "application/json; charset=utf-8";
        await JsonSerializer.SerializeAsync(context.Response.Body, reply.Body, cancellationToken: context.RequestAborted).ConfigureAwait(false);
    }

    private Reply ProcessJson(string path, string method, JsonElement body, string identity)
    {
        if (path is "/" or "/status" && HttpMethods.IsGet(method)) return JsonStatus();
        if (!(HttpMethods.IsPost(method) || HttpMethods.IsPut(method))) throw new InputException(405, "Commands require POST or PUT.");
        ValidateObject(body);
        if (path is not ("/" or "/command" or "/commands" or "/stop" or "/heartbeat")) throw new InputException(404, "Unknown command endpoint.");
        var operation = body.TryGetProperty("command", out var command) ? Text(command, "command") : "";
        if (operation == "status") return JsonStatus();
        if (operation is not ("" or "stop" or "heartbeat")) throw new InputException(400, "Unknown JSON control command.");
        if (path == "/stop" || operation == "stop")
        {
            if (body.TryGetProperty("commands", out _) || body.TryGetProperty("value", out _))
                throw new InputException(400, "A stop request cannot also start a command.");
            var channel = body.TryGetProperty("channel", out var selected) ? Text(selected, "channel") : null;
            if (channel is not null) _ = Feature(channel);
            Acquire(identity);
            _sink.Stop(_config.Id, _session!, channel);
            return new(200, new { ok = true });
        }
        if (path == "/heartbeat" || operation == "heartbeat")
        {
            Acquire(identity);
            _sink.Heartbeat(_config.Id, _session!);
            return new(200, new { ok = true });
        }
        if (path is not ("/" or "/command" or "/commands")) throw new InputException(404, "Unknown command endpoint.");
        var commands = new List<ExternalControlCommand>();
        if (body.TryGetProperty("commands", out var batch))
        {
            if (batch.ValueKind != JsonValueKind.Array || batch.GetArrayLength() is < 1 or > 16)
                throw new InputException(400, "Use 1–16 commands per batch.");
            foreach (var value in batch.EnumerateArray()) commands.Add(ParseJsonCommand(value));
        }
        else commands.Add(ParseJsonCommand(body));
        if (commands.Select(value => value.Channel).Distinct(StringComparer.Ordinal).Count() != commands.Count)
            throw new InputException(400, "Command channels must be unique in a batch.");
        Publish(identity, commands);
        return new(200, new { ok = true, accepted = commands.Count });
    }

    private Reply JsonStatus() => new(200, new { ok = true, inputId = _config.Id,
        channels = _config.Features.Select(feature => new { channel = feature.Channel, actuator = feature.Actuator }).ToArray() });

    private ExternalControlCommand ParseJsonCommand(JsonElement command)
    {
        ValidateObject(command);
        var channel = command.TryGetProperty("channel", out var name) ? Text(name, "channel")
            : command.TryGetProperty("path", out name) ? Text(name, "path")
            : command.TryGetProperty("address", out name) ? Text(name, "address")
            : throw new InputException(400, "Choose a channel, path or address.");
        channel = channel.TrimStart('/');
        _ = Feature(channel);
        var value = Number(command, "value", 0, 1);
        var duration = command.TryGetProperty("durationMs", out _) ? Integer(command, "durationMs", 0, 600000) : 0;
        var clockwise = !command.TryGetProperty("clockwise", out _) || Bool(command, "clockwise");
        return new(channel, value, duration, clockwise);
    }

    private ProtocolFeatureConfig Feature(string channel) => _config.Features.FirstOrDefault(feature => feature.Channel == channel)
        ?? throw new InputException(400, "This channel is not configured for the input.");
    private ProtocolFeatureConfig Actuator(string type, int index = 0) => _config.Features.Where(feature => feature.Actuator == type).ElementAtOrDefault(index)
        ?? throw new InputException(400, "This actuator is not configured for the input.");
    private void Acquire(string identity)
    {
        Expire();
        if (_owner is not null && _owner != identity) throw new InputException(409, "Another source owns this input.");
        var session = _session ?? _instance + ":" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)));
        if (!_sink.TryAcquire(_config.Id, session, out _)) throw new InputException(409, "The input is unavailable or controlled by another client.");
        _owner = identity;
        _session = session;
        _lastActivity = _clock.GetTimestamp();
    }
    private void Publish(string identity, IReadOnlyList<ExternalControlCommand> commands)
    {
        Acquire(identity);
        if (!_sink.Publish(_config.Id, _session!, commands, out _)) throw new InputException(409, "The input rejected this command.");
        _lastActivity = _clock.GetTimestamp();
    }
    private void Release()
    {
        _effect = null;
        _handyFiniteMoveAt = null;
        CancelHandyPlayback();
        _hampActive = false;
        _handyMotion = null;
        if (_session is not null)
        {
            var session = _session;
            _session = _owner = null;
            _sink.Stop(_config.Id, session);
            _sink.Release(_config.Id, session);
        }
    }
    private void Expire()
    {
        // A finite accepted script is a server-side task, rather than a stream requiring client pings.
        // Its independent task deadline is checked by PublishScriptFrame, including while looping.
        var finiteMoveExpired = _handyFiniteMoveAt is not { } started
            || _clock.GetElapsedTime(started).TotalMilliseconds >= (long)_handyFiniteMoveDuration + _config.TimeoutMs;
        if (!_scriptPlaying && !FiniteLovenseEffectActive() && finiteMoveExpired && _session is not null
            && _clock.GetElapsedTime(_lastActivity).TotalMilliseconds >= _config.TimeoutMs) Release();
    }
    private void Tick()
    {
        lock (_sync)
        {
            if (_disposed) return;
            try { Expire(); TickLovense(); TickHandy(); PublishScriptFrame(); }
            catch (InputException) { Release(); }
        }
    }
    private static string HttpIdentity(HttpContext context)
    {
        var explicitSession = context.Request.Headers["X-Sensa-Session"].ToString();
        if (explicitSession.Length > 128 || explicitSession.Any(char.IsControl)) throw new InputException(400, "Invalid session identifier.");
        return context.Connection.RemoteIpAddress + "\n" + explicitSession;
    }
    private static async Task<byte[]> ReadBodyAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        if (request.ContentLength > MaximumBodyBytes) throw new InputException(413, "Request body exceeds 64 KiB.");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(3));
        using var content = new MemoryStream();
        var buffer = new byte[4096];
        int length;
        try
        {
            while ((length = await request.Body.ReadAsync(buffer, deadline.Token).ConfigureAwait(false)) != 0)
            {
                if (content.Length + length > MaximumBodyBytes) throw new InputException(413, "Request body exceeds 64 KiB.");
                content.Write(buffer, 0, length);
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { throw new InputException(408, "Request body timed out."); }
        return content.ToArray();
    }
    private static void ValidateObject(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Object) throw new InputException(400, "Commands must be JSON objects.");
        ValidateNames(value);
    }
    private static void ValidateNames(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            var keys = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in value.EnumerateObject())
            {
                if (!keys.Add(property.Name)) throw new InputException(400, "Duplicate JSON property.");
                ValidateNames(property.Value);
            }
        }
        else if (value.ValueKind == JsonValueKind.Array) foreach (var child in value.EnumerateArray()) ValidateNames(child);
    }
    private static string Text(JsonElement value, string name) => value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 and <= 4096 } text
        ? text : throw new InputException(400, name + " must be a nonempty string.");
    private static string String(JsonElement body, string name) => body.ValueKind == JsonValueKind.Object && body.TryGetProperty(name, out var value) ? Text(value, name) : throw new InputException(400, name + " is required.");
    private static double Number(JsonElement body, string name, double minimum, double maximum)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.Number
            || !value.TryGetDouble(out var number) || !double.IsFinite(number) || number < minimum || number > maximum)
            throw new InputException(400, name + " must be a finite number within range.");
        return number;
    }
    private static int Integer(JsonElement body, string name, int minimum, int maximum)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.Number
            || !value.TryGetInt32(out var number) || number < minimum || number > maximum)
            throw new InputException(400, name + " must be an integer within range.");
        return number;
    }
    private static bool Bool(JsonElement body, string name) => body.ValueKind == JsonValueKind.Object && body.TryGetProperty(name, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False
        ? value.GetBoolean() : throw new InputException(400, name + " must be boolean.");
    private object ErrorBody(string message) => _config.Type == "LovenseHttp" ? new { code = 400, type = "Error", message } as object
        : new { error = new { code = 400, message, connected = !_disposed } };
    private void ThrowIfDisposed() { if (_disposed) throw new InputException(503, "The input has stopped."); }

    public async Task RunAsync(WebSocket socket, CancellationToken cancellationToken = default)
    {
        var identity = "websocket:" + Guid.NewGuid().ToString("N");
        try
        {
            var buffer = new byte[4096];
            while (socket.State == WebSocketState.Open)
            {
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                deadline.CancelAfter(TimeSpan.FromMilliseconds(_config.TimeoutMs));
                using var message = new MemoryStream();
                WebSocketReceiveResult frame;
                do
                {
                    frame = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), deadline.Token).ConfigureAwait(false);
                    if (frame.MessageType == WebSocketMessageType.Close)
                    { await CloseSocketAsync(socket, WebSocketCloseStatus.NormalClosure, cancellationToken).ConfigureAwait(false); return; }
                    if (frame.MessageType != WebSocketMessageType.Text || message.Length + frame.Count > MaximumBodyBytes)
                    { await CloseSocketAsync(socket, WebSocketCloseStatus.InvalidPayloadData, cancellationToken).ConfigureAwait(false); return; }
                    message.Write(buffer, 0, frame.Count);
                } while (!frame.EndOfMessage);
                Reply reply;
                try
                {
                    using var document = JsonDocument.Parse(message.ToArray(), new JsonDocumentOptions { MaxDepth = 16 });
                    lock (_sync) { ThrowIfDisposed(); reply = ProcessJson("/", "POST", document.RootElement, identity); }
                }
                catch (JsonException) { reply = new(400, ErrorBody("Malformed JSON command.")); }
                catch (InputException error) { reply = new(error.Status, ErrorBody(error.Message)); }
                using var sendDeadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                sendDeadline.CancelAfter(TimeSpan.FromSeconds(3));
                await socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(reply.Body), WebSocketMessageType.Text, true, sendDeadline.Token).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        { await CloseSocketAsync(socket, WebSocketCloseStatus.PolicyViolation, cancellationToken).ConfigureAwait(false); }
        catch (WebSocketException) { }
        finally { lock (_sync) { if (_owner == identity) Release(); } }
    }
    private static async Task CloseSocketAsync(WebSocket socket, WebSocketCloseStatus status, CancellationToken cancellationToken)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(1));
        if (socket.State is not (WebSocketState.Open or WebSocketState.CloseReceived)) return;
        try { await socket.CloseOutputAsync(status, "", deadline.Token).ConfigureAwait(false); }
        catch (WebSocketException) { }
        catch (OperationCanceledException) { socket.Abort(); }
    }
    private void CancelFromRuntime()
    {
        lock (_sync) { _effect = null; _hampActive = false; _handyMotion = null; _handyFiniteMoveAt = null; CancelHandyPlayback(); }
    }
    public void Dispose()
    {
        lock (_sync)
        {
            if (_disposed) return;
            _disposed = true;
            _timer.Dispose();
            if (_sink is ExternalControlStore store) store.CommandsCleared -= CancelFromRuntime;
            _cloud?.Dispose();
            Release();
            if (_ownsScriptHttp) _scriptHttp?.Dispose();
        }
    }
}
