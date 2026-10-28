using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace Sensa.Input.Protocols;

/// <summary>
/// A virtual Buttplug device accepting commands as Sensa input. It does not open a hardware transport.
/// Protocol versions are negotiated independently of the version of the Buttplug NuGet package.
/// https://buttplug.io/docs/spec/ and https://buttplug.io/docs/spec-v3/spec/.
/// Advertised feature types retain their units: position, vibration intensity, rotation speed/direction.
/// </summary>
public sealed class ButtplugInputSession : IDisposable
{
    public const int MaximumMessageBytes = 65536;
    private const int MaximumBatchMessages = 128;
    private const int MaximumDurationMs = 600000;
    private const int PositionSteps = 1000;
    private readonly ProtocolInputConfig _config;
    private readonly IExternalControlSink _sink;
    private readonly TimeProvider _clock;
    private readonly string _sessionId = Guid.NewGuid().ToString("N");
    private readonly Feature[] _features;
    private readonly object _sync = new();
    private int _version;
    private bool _acquired;
    private volatile bool _disposed;
    private bool _announced;
    private long _lastActivity;
    private long _lastPing;
    private readonly int _timeoutMs;

    private sealed record Feature(string Channel, string Name, string Actuator, string ScalarType);
    private sealed class ProtocolException(string message, uint code = 3) : Exception(message)
    {
        public uint Code { get; } = code;
    }

    public ButtplugInputSession(ProtocolInputConfig config, IExternalControlSink sink, TimeProvider? clock = null)
    {
        _config = config;
        _sink = sink;
        _clock = clock ?? TimeProvider.System;
        _timeoutMs = Math.Clamp(config.TimeoutMs, 1000, 600000);
        _features = config.Features.Select(feature => new Feature(feature.Channel, feature.Name, feature.Actuator, feature.ScalarType)).ToArray();
        if (_features.Length is < 1 or > 16 || _features.Any(feature =>
            string.IsNullOrWhiteSpace(feature.Channel) || feature.Actuator is not ("Position" or "Scalar" or "Rotation")
            || feature.Actuator == "Scalar" && feature.ScalarType is not ("Vibrate" or "Oscillate" or "Constrict" or "Led" or "Temperature" or "Spray"))
            || _features.Select(feature => feature.Channel).Distinct(StringComparer.Ordinal).Count() != _features.Length)
            throw new ArgumentException("A virtual device requires 1–16 supported, named features.", nameof(config));
        _lastActivity = _lastPing = _clock.GetTimestamp();
    }

    /// <summary>Processes one complete JSON text message and returns the protocol JSON response array.</summary>
    public string Process(string json)
    {
        lock (_sync)
        {
            if (_disposed) return Serialize([Error(0, "Session closed.", 1)]);
            if (Expired())
            {
                DisposeCore();
                return Serialize([Error(0, "Session heartbeat timed out.", 2)]);
            }
            if (Encoding.UTF8.GetByteCount(json) > MaximumMessageBytes)
                return Serialize([Error(0, "Message exceeds the size limit.")]);
            var replies = new List<object>();
            try
            {
                using var document = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 16 });
                var root = document.RootElement;
                if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() is < 1 or > MaximumBatchMessages)
                    throw new ProtocolException("Expected a nonempty message array within the batch limit.");
                foreach (var message in root.EnumerateArray())
                {
                    uint id = 0;
                    try
                    {
                        RejectDuplicateProperties(message);
                        if (message.ValueKind != JsonValueKind.Object || message.EnumerateObject().Count() != 1)
                            throw new ProtocolException("Each message must contain exactly one message type.");
                        var property = message.EnumerateObject().Single();
                        var body = property.Value;
                        if (body.ValueKind != JsonValueKind.Object) throw new ProtocolException("Message fields must be an object.");
                        id = Unsigned(body, "Id");
                        if (id == 0) throw new ProtocolException("Client message IDs must be nonzero.");
                        Handle(property.Name, body, id, replies);
                    }
                    catch (ProtocolException exception) { replies.Add(Error(id, exception.Message, exception.Code)); }
                    if (_disposed) break;
                }
            }
            catch (JsonException) { replies.Add(Error(0, "Malformed JSON message.")); }
            catch (ProtocolException exception) { replies.Add(Error(0, exception.Message, exception.Code)); }
            return Serialize(replies);
        }
    }

    private void Handle(string type, JsonElement body, uint id, List<object> replies)
    {
        if (type == "RequestServerInfo")
        {
            if (_version != 0) throw new ProtocolException("Handshake already completed.", 1);
            var client = String(body, "ClientName");
            if (client.Length is < 1 or > 256) throw new ProtocolException("Invalid client name.", 1);
            int version;
            if (body.TryGetProperty("MessageVersion", out _))
            {
                if (body.TryGetProperty("ProtocolVersionMajor", out _) || body.TryGetProperty("ProtocolVersionMinor", out _))
                    throw new ProtocolException("Ambiguous protocol version.", 1);
                version = checked((int)Unsigned(body, "MessageVersion", 3));
                if (version is not (2 or 3)) throw new ProtocolException("This endpoint supports protocol versions 2, 3 and 4.", 1);
            }
            else
            {
                version = checked((int)Unsigned(body, "ProtocolVersionMajor", 4));
                _ = Unsigned(body, "ProtocolVersionMinor");
                if (version != 4) throw new ProtocolException("This endpoint supports protocol versions 2, 3 and 4.", 1);
            }
            if (!_sink.TryAcquire(_config.Id, _sessionId, out var error))
                throw new ProtocolException(string.IsNullOrWhiteSpace(error) ? "This input is already controlled by another session." : error, 4);
            _acquired = true;
            _version = version;
            Touch(ping: true);
            replies.Add(version < 4
                ? Message("ServerInfo", new { Id = id, ServerName = "Sensa", MessageVersion = version, MaxPingTime = _timeoutMs })
                : Message("ServerInfo", new { Id = id, ServerName = "Sensa", ProtocolVersionMajor = 4, ProtocolVersionMinor = 0, MaxPingTime = _timeoutMs }));
            return;
        }
        if (_version == 0) throw new ProtocolException("RequestServerInfo must complete before other messages.", 1);
        switch (type)
        {
            case "Ping":
                Touch(ping: true);
                replies.Add(Ok(id));
                return;
            case "RequestDeviceList":
                Touch();
                replies.Add(DeviceList(id));
                _announced = true;
                return;
            case "StartScanning":
                Touch();
                replies.Add(Ok(id));
                if (!_announced)
                {
                    replies.Add(_version < 4 ? Message("DeviceAdded", LegacyDevice(0)) : DeviceList(0));
                    _announced = true;
                }
                replies.Add(Message("ScanningFinished", new { Id = 0 }));
                return;
            case "StopScanning":
                Touch();
                replies.Add(Ok(id));
                return;
            case "LinearCmd" when _version is 2 or 3:
                Device(body);
                Publish(id, ParseLinear(body), replies);
                return;
            case "ScalarCmd" when _version == 3:
                Device(body);
                Publish(id, ParseScalar(body), replies);
                return;
            case "VibrateCmd" when _version == 2:
                Device(body);
                Publish(id, ParseVibration(body), replies);
                return;
            case "RotateCmd" when _version is 2 or 3:
                Device(body);
                Publish(id, ParseRotation(body), replies);
                return;
            case "OutputCmd" when _version == 4:
                Device(body);
                Publish(id, [ParseV4Output(body)], replies);
                return;
            case "StopDeviceCmd" when _version is 2 or 3:
                Device(body);
                _sink.Stop(_config.Id, _sessionId);
                Touch();
                replies.Add(Ok(id));
                return;
            case "StopAllDevices" when _version is 2 or 3:
                _sink.Stop(_config.Id, _sessionId);
                Touch();
                replies.Add(Ok(id));
                return;
            case "StopCmd" when _version == 4:
                StopV4(body);
                Touch();
                replies.Add(Ok(id));
                return;
            case "Disconnect" when _version == 4:
                replies.Add(Ok(id));
                DisposeCore();
                return;
            default:
                throw new ProtocolException("Message or feature is not supported by this negotiated protocol.");
        }
    }

    private void Publish(uint id, IReadOnlyList<ExternalControlCommand> commands, List<object> replies)
    {
        if (!_sink.Publish(_config.Id, _sessionId, commands, out var error))
            throw new ProtocolException(string.IsNullOrWhiteSpace(error) ? "Input command was rejected." : error, 4);
        Touch();
        replies.Add(Ok(id));
    }

    private IReadOnlyList<ExternalControlCommand> ParseLinear(JsonElement body)
    {
        var vectors = Array(body, "Vectors");
        var commands = new List<ExternalControlCommand>();
        var indices = new HashSet<uint>();
        foreach (var vector in vectors.EnumerateArray())
        {
            var index = Unsigned(vector, "Index");
            if (!indices.Add(index)) throw new ProtocolException("Repeated actuator index.");
            var feature = V3Feature(index, "Position");
            commands.Add(new(feature.Channel, Unit(vector, "Position"), Duration(vector)));
        }
        return commands;
    }

    private IReadOnlyList<ExternalControlCommand> ParseScalar(JsonElement body)
    {
        var scalars = Array(body, "Scalars");
        var commands = new List<ExternalControlCommand>();
        var indices = new HashSet<uint>();
        foreach (var scalar in scalars.EnumerateArray())
        {
            var index = Unsigned(scalar, "Index");
            if (!indices.Add(index)) throw new ProtocolException("Repeated actuator index.");
            var feature = V3Feature(index, "Scalar");
            if (String(scalar, "ActuatorType") != feature.ScalarType) throw new ProtocolException("Unexpected scalar actuator type.", 4);
            commands.Add(new(feature.Channel, Unit(scalar, "Scalar")));
        }
        return commands;
    }

    private IReadOnlyList<ExternalControlCommand> ParseVibration(JsonElement body)
    {
        var speeds = Array(body, "Speeds");
        var features = V2Features("Scalar").ToArray();
        var commands = new List<ExternalControlCommand>();
        var indices = new HashSet<uint>();
        foreach (var speed in speeds.EnumerateArray())
        {
            var index = Unsigned(speed, "Index");
            if (!indices.Add(index)) throw new ProtocolException("Repeated vibration index.");
            if (index >= features.Length) throw new ProtocolException("Unknown vibration index.", 4);
            commands.Add(new(features[index].Channel, Unit(speed, "Speed")));
        }
        return commands;
    }

    private IReadOnlyList<ExternalControlCommand> ParseRotation(JsonElement body)
    {
        var rotations = Array(body, "Rotations");
        var commands = new List<ExternalControlCommand>();
        var indices = new HashSet<uint>();
        foreach (var rotation in rotations.EnumerateArray())
        {
            var index = Unsigned(rotation, "Index");
            if (!indices.Add(index)) throw new ProtocolException("Repeated actuator index.");
            var feature = V3Feature(index, "Rotation");
            commands.Add(new(feature.Channel, Unit(rotation, "Speed"), Clockwise: Boolean(rotation, "Clockwise")));
        }
        return commands;
    }

    private ExternalControlCommand ParseV4Output(JsonElement body)
    {
        var feature = FeatureAt(Unsigned(body, "FeatureIndex"));
        var command = Object(body, "Command");
        if (command.EnumerateObject().Count() != 1) throw new ProtocolException("Exactly one output command is required.");
        var property = command.EnumerateObject().Single();
        var value = Integer(property.Value, "Value");
        return (feature.Actuator, property.Name) switch
        {
            ("Position", "Position") when value is >= 0 and <= PositionSteps => new(feature.Channel, (double)value / PositionSteps),
            ("Position", "HwPositionWithDuration") when value is >= 0 and <= PositionSteps => new(feature.Channel, (double)value / PositionSteps, Duration(property.Value)),
            ("Scalar", var scalarType) when scalarType == feature.ScalarType && value is >= 0 and <= PositionSteps => new(feature.Channel, (double)value / PositionSteps),
            ("Rotation", "Rotate") when value is >= -PositionSteps and <= PositionSteps => new(feature.Channel, Math.Abs((double)value) / PositionSteps, Clockwise: value >= 0),
            _ => throw new ProtocolException("Output type or value does not match the advertised feature.", 4),
        };
    }

    private void StopV4(JsonElement body)
    {
        var hasDevice = body.TryGetProperty("DeviceIndex", out _);
        var hasFeature = body.TryGetProperty("FeatureIndex", out _);
        if (hasDevice) Device(body);
        if (hasFeature) _ = Unsigned(body, "FeatureIndex");
        if (body.TryGetProperty("Inputs", out _)) _ = Boolean(body, "Inputs");
        var outputs = !body.TryGetProperty("Outputs", out _) || Boolean(body, "Outputs");
        // FeatureIndex without DeviceIndex is ignored by the v4 specification.
        var channel = hasDevice && hasFeature ? FeatureAt(Unsigned(body, "FeatureIndex")).Channel : null;
        if (outputs) _sink.Stop(_config.Id, _sessionId, channel);
    }

    private object DeviceList(uint id) => _version < 4
        ? Message("DeviceList", new { Id = id, Devices = new[] { LegacyDevice(null) } })
        : Message("DeviceList", new { Id = id, Devices = new Dictionary<string, object> { ["0"] = V4Device() } });

    private object LegacyDevice(uint? eventId) => _version == 2 ? V2Device(eventId) : V3Device(eventId);

    private object V2Device(uint? eventId)
    {
        // v2 uses command-level FeatureCount/StepCount metadata, not v3's
        // actuator arrays. VibrateCmd can represent only vibration features.
        var messages = new Dictionary<string, object> { ["StopDeviceCmd"] = new { } };
        Add("Position", "LinearCmd"); Add("Scalar", "VibrateCmd"); Add("Rotation", "RotateCmd");
        var fields = new Dictionary<string, object>
        { ["DeviceName"] = DeviceName, ["DeviceIndex"] = 0, ["DeviceMessages"] = messages };
        if (eventId.HasValue) fields["Id"] = eventId.Value;
        return fields;
        void Add(string actuator, string command)
        {
            var count = V2Features(actuator).Count();
            if (count != 0) messages[command] = new { FeatureCount = count, StepCount = Enumerable.Repeat(PositionSteps, count).ToArray() };
        }
    }

    private object V3Device(uint? eventId)
    {
        var messages = new Dictionary<string, object> { ["StopDeviceCmd"] = new { } };
        Add("Position", "LinearCmd", "Linear");
        Add("Scalar", "ScalarCmd", "Vibrate");
        Add("Rotation", "RotateCmd", "Rotate");
        var fields = new Dictionary<string, object>
        {
            ["DeviceName"] = DeviceName,
            ["DeviceIndex"] = 0,
            ["DeviceMessageTimingGap"] = 0,
            ["DeviceMessages"] = messages,
        };
        if (eventId.HasValue) fields["Id"] = eventId.Value;
        return fields;
        void Add(string actuator, string command, string protocolType)
        {
            var features = V3Features(actuator)
                .Select(feature => new { StepCount = PositionSteps, FeatureDescriptor = feature.Name,
                    ActuatorType = feature.Actuator == "Scalar" ? feature.ScalarType : protocolType }).ToArray();
            if (features.Length != 0) messages[command] = features;
        }
    }

    private object V4Device()
    {
        var features = new Dictionary<string, object>();
        for (var index = 0; index < _features.Length; index++)
        {
            var feature = _features[index];
            var output = new Dictionary<string, object>();
            switch (feature.Actuator)
            {
                case "Position":
                    output["Position"] = new { Value = new[] { 0, PositionSteps } };
                    output["HwPositionWithDuration"] = new { Value = new[] { 0, PositionSteps }, Duration = new[] { 0, MaximumDurationMs } };
                    break;
                case "Scalar": output[feature.ScalarType] = new { Value = new[] { 0, PositionSteps } }; break;
                case "Rotation": output["Rotate"] = new { Value = new[] { -PositionSteps, PositionSteps } }; break;
            }
            features[index.ToString(System.Globalization.CultureInfo.InvariantCulture)] = new { FeatureIndex = index, FeatureDescription = feature.Name, Output = output };
        }
        return new { DeviceName, DeviceIndex = 0, DeviceMessageTimingGap = 0, DeviceFeatures = features };
    }

    private string DeviceName => string.IsNullOrWhiteSpace(_config.Name) ? "Sensa Virtual Device" : _config.Name;
    private Feature FeatureAt(uint index) => index < _features.Length ? _features[index] : throw new ProtocolException("Unknown feature index.", 4);
    private Feature V3Feature(uint index, string actuator)
    {
        var matching = V3Features(actuator).ToArray();
        return index < matching.Length ? matching[index] : throw new ProtocolException("Unknown actuator index.", 4);
    }
    // V3 has no LED, temperature or spray actuator vocabulary. Do not expose a capability
    // under a different name; scalar indices address this same filtered order in metadata and commands.
    private IEnumerable<Feature> V3Features(string actuator) => _features.Where(feature => feature.Actuator == actuator
        && (actuator != "Scalar" || feature.ScalarType is "Vibrate" or "Oscillate" or "Constrict"));
    private IEnumerable<Feature> V2Features(string actuator) => _features.Where(feature => feature.Actuator == actuator
        && (actuator != "Scalar" || feature.ScalarType == "Vibrate"));

    private static void Device(JsonElement body)
    {
        if (Unsigned(body, "DeviceIndex") != 0) throw new ProtocolException("Unknown device index.", 4);
    }
    private void Touch(bool ping = false)
    {
        _lastActivity = _clock.GetTimestamp();
        if (ping) _lastPing = _lastActivity;
        _sink.Heartbeat(_config.Id, _sessionId);
    }
    private bool Expired() => RemainingActivityTime() <= TimeSpan.Zero;
    private TimeSpan RemainingActivityTime()
    {
        var timeout = TimeSpan.FromMilliseconds(_timeoutMs);
        var elapsed = _clock.GetElapsedTime(_lastActivity);
        if (_version != 0)
        {
            var pingElapsed = _clock.GetElapsedTime(_lastPing);
            if (pingElapsed > elapsed) elapsed = pingElapsed;
        }
        return timeout - elapsed;
    }
    private TimeSpan ReceiveBudget()
    {
        lock (_sync)
        {
            var remaining = RemainingActivityTime();
            return remaining > TimeSpan.Zero ? remaining : TimeSpan.FromMilliseconds(1);
        }
    }
    private static object Message(string type, object value) => new Dictionary<string, object> { [type] = value };
    private static object Ok(uint id) => Message("Ok", new { Id = id });
    private static object Error(uint id, string message, uint code = 3) => Message("Error", new { Id = id, ErrorCode = code, ErrorMessage = message });
    private static string Serialize(IEnumerable<object> replies) => JsonSerializer.Serialize(replies);

    private static JsonElement Object(JsonElement body, string property)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.Object)
            throw new ProtocolException($"{property} must be an object.");
        return value;
    }
    private static JsonElement Array(JsonElement body, string property)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.Array || value.GetArrayLength() is < 1 or > 16)
            throw new ProtocolException($"{property} must be a nonempty actuator array within the limit.");
        return value;
    }
    private static uint Unsigned(JsonElement body, string property, uint maximum = uint.MaxValue)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.Number || !value.TryGetUInt32(out var parsed) || parsed > maximum)
            throw new ProtocolException($"{property} must be an unsigned integer within range.");
        return parsed;
    }
    private static int Integer(JsonElement body, string property)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.Number || !value.TryGetInt32(out var parsed))
            throw new ProtocolException($"{property} must be an integer.");
        return parsed;
    }
    private static int Duration(JsonElement body) => checked((int)Unsigned(body, "Duration", MaximumDurationMs));
    private static string String(JsonElement body, string property)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.String)
            throw new ProtocolException($"{property} must be a string.");
        return value.GetString()!;
    }
    private static bool Boolean(JsonElement body, string property)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(property, out var value) || value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new ProtocolException($"{property} must be a boolean.");
        return value.GetBoolean();
    }
    private static double Unit(JsonElement body, string property)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.Number || !value.TryGetDouble(out var parsed) || !double.IsFinite(parsed) || parsed is < 0 or > 1)
            throw new ProtocolException($"{property} must be a finite number in 0–1.");
        return parsed;
    }
    private static void RejectDuplicateProperties(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in value.EnumerateObject())
            {
                if (!names.Add(property.Name)) throw new ProtocolException("Duplicate message field.");
                RejectDuplicateProperties(property.Value);
            }
        }
        else if (value.ValueKind == JsonValueKind.Array)
            foreach (var child in value.EnumerateArray()) RejectDuplicateProperties(child);
    }

    /// <summary>Runs an isolated protocol transport. The host validates its configured listener Host before accepting it.</summary>
    public async Task RunAsync(WebSocket socket, CancellationToken cancellationToken = default)
    {
        var buffer = new byte[4096];
        try
        {
            while (socket.State == WebSocketState.Open && !_disposed)
            {
                using var message = new MemoryStream();
                using var receiveDeadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                receiveDeadline.CancelAfter(ReceiveBudget());
                WebSocketReceiveResult frame;
                do
                {
                    frame = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), receiveDeadline.Token).ConfigureAwait(false);
                    if (frame.MessageType == WebSocketMessageType.Close)
                    {
                        await CloseAsync(socket, WebSocketCloseStatus.NormalClosure, "", cancellationToken).ConfigureAwait(false);
                        return;
                    }
                    if (frame.MessageType != WebSocketMessageType.Text || message.Length + frame.Count > MaximumMessageBytes)
                    {
                        await CloseAsync(socket, WebSocketCloseStatus.InvalidPayloadData, "Expected bounded UTF-8 JSON text.", cancellationToken).ConfigureAwait(false);
                        return;
                    }
                    message.Write(buffer, 0, frame.Count);
                } while (!frame.EndOfMessage);
                string json;
                try { json = new UTF8Encoding(false, true).GetString(message.GetBuffer(), 0, (int)message.Length); }
                catch (DecoderFallbackException)
                {
                    await CloseAsync(socket, WebSocketCloseStatus.InvalidPayloadData, "Invalid UTF-8 text.", cancellationToken).ConfigureAwait(false);
                    return;
                }
                var reply = Encoding.UTF8.GetBytes(Process(json));
                using var sendDeadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                sendDeadline.CancelAfter(TimeSpan.FromSeconds(3));
                await socket.SendAsync(new ArraySegment<byte>(reply), WebSocketMessageType.Text, true, sendDeadline.Token).ConfigureAwait(false);
            }
            if (_disposed) await CloseAsync(socket, WebSocketCloseStatus.NormalClosure, "Session closed.", cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            await CloseAsync(socket, WebSocketCloseStatus.PolicyViolation, "Session deadline exceeded.", cancellationToken).ConfigureAwait(false);
        }
        catch (WebSocketException) { }
        finally { Dispose(); }
    }

    private static async Task CloseAsync(WebSocket socket, WebSocketCloseStatus status, string reason, CancellationToken cancellationToken)
    {
        if (socket.State is not (WebSocketState.Open or WebSocketState.CloseReceived)) return;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(1));
        try { await socket.CloseOutputAsync(status, reason, deadline.Token).ConfigureAwait(false); }
        catch (WebSocketException) { }
        catch (OperationCanceledException) { socket.Abort(); }
    }

    public void Dispose()
    {
        lock (_sync) DisposeCore();
    }
    private void DisposeCore()
    {
        if (_disposed) return;
        _disposed = true;
        if (!_acquired) return;
        try { _sink.Stop(_config.Id, _sessionId); }
        finally { _sink.Release(_config.Id, _sessionId); }
        _acquired = false;
    }
}
