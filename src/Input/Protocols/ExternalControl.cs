using System.Net;
using System.Text.RegularExpressions;
using Sensa.Motion;
using Sensa.Signals;

namespace Sensa.Input.Protocols;

public sealed class ProtocolFeatureConfig
{
    public string Channel { get; set; } = "L0";
    public string Name { get; set; } = "Stroke";
    public string Actuator { get; set; } = "Position";
    public string ScalarType { get; set; } = "Vibrate";
    public string TargetAxis { get; set; } = "L0";
}

public sealed class ProtocolInputConfig
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "Protocol input";
    public string Type { get; set; } = "Buttplug";
    public bool Enabled { get; set; }
    public string Host { get; set; } = "127.0.0.1";
    public int Port { get; set; } = 12400;
    public string Path { get; set; } = "/";
    public string Address { get; set; } = "ws://127.0.0.1:54817";
    public string Identifier { get; set; } = "";
    public string ComPort { get; set; } = "";
    public int BaudRate { get; set; } = 115200;
    public int TimeoutMs { get; set; } = 10000;
    public bool RouteToMotion { get; set; } = true;
    public double MaxSpeedPerSecond { get; set; } = 1;
    public int MaxScriptDurationMs { get; set; } = 3600000;
    public List<ProtocolFeatureConfig> Features { get; set; } = [new()];
}

public sealed record ExternalControlCommand(string Channel, double Value, int DurationMs = 0, bool Clockwise = true);

public sealed record ExternalControlStatus(string? Session, long ReceivedCommands, string[] Channels);

public sealed record ExternalControlBatch(string InputId, string SessionId, long Sequence, IReadOnlyList<ExternalControlCommand> Commands);

public interface IExternalControlSink
{
    bool TryAcquire(string inputId, string sessionId, out string error);
    bool Publish(string inputId, string sessionId, IReadOnlyList<ExternalControlCommand> commands, out string error);
    void Stop(string inputId, string sessionId, string? channel = null);
    void Release(string inputId, string sessionId);
    void Heartbeat(string inputId, string sessionId);
}

public static partial class ProtocolInputConfiguration
{
    public static readonly string[] Types = ["Buttplug", "TCodeTcp", "TCodeUdp", "TCodeSerial", "TCodeWebSocket", "IntifaceDevice",
        "JsonHttp", "JsonWebSocket", "LovenseHttp", "HandyHttp", "AutoblowHttp", "VacuGlideHttp"];
    [GeneratedRegex("^[a-zA-Z0-9_-]{1,64}$", RegexOptions.CultureInvariant)]
    private static partial Regex IdentifierPattern();

    public static bool IsWebType(string type) => Types.Contains(type) && type is not ("TCodeTcp" or "TCodeUdp" or "TCodeSerial" or "IntifaceDevice");

    public static string NormalizePath(string? path)
    {
        path = string.IsNullOrWhiteSpace(path) ? "/" : path.Trim().TrimEnd('/');
        if (path.Length == 0) path = "/";
        if (path.Length > 256 || !Regex.IsMatch(path, @"^/(?:[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*)?$", RegexOptions.CultureInvariant))
            throw new ArgumentException("Protocol input path must use slash-separated letters, digits, dashes or underscores.");
        return path;
    }

    private static bool BindingsOverlap(string first, string second)
    {
        var a = IPAddress.Parse(first); var b = IPAddress.Parse(second);
        return a.Equals(b) || a.Equals(IPAddress.IPv6Any) || b.Equals(IPAddress.IPv6Any)
            || a.AddressFamily == b.AddressFamily && (a.Equals(IPAddress.Any) || b.Equals(IPAddress.Any));
    }

    public static List<ProtocolInputConfig> CloneAndValidate(IEnumerable<ProtocolInputConfig>? inputs)
    {
        var result = new List<ProtocolInputConfig>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var axes = new HashSet<string>(StringComparer.Ordinal);
        foreach (var source in inputs ?? [])
        {
            if (source is null || result.Count >= 16) throw new ArgumentException("At most 16 protocol inputs are supported.");
            var id = source.Id?.Trim() ?? "";
            if (!IdentifierPattern().IsMatch(id) || !ids.Add(id)) throw new ArgumentException("Protocol input IDs must be unique letters, digits, dashes or underscores.");
            if (!Types.Contains(source.Type)) throw new ArgumentException("Unsupported protocol input type.");
            if (!IPAddress.TryParse(source.Host, out var bind)) throw new ArgumentException("Protocol input host must be a local bind IP address.");
            if (source.Port is < 1 or > 65535 || source.TimeoutMs is < 1000 or > 600000 || source.BaudRate is < 1200 or > 4000000)
                throw new ArgumentException("Invalid protocol input port, timeout or baud rate.");
            if (!double.IsFinite(source.MaxSpeedPerSecond) || source.MaxSpeedPerSecond is < .01 or > 20)
                throw new ArgumentException("Virtual device speed must be .01–20 full strokes per second.");
            if (source.MaxScriptDurationMs is < 1000 or > 3600000)
                throw new ArgumentException("Script task duration must be 1 second to 1 hour.");
            var channels = new HashSet<string>(StringComparer.Ordinal);
            var features = new List<ProtocolFeatureConfig>();
            foreach (var feature in source.Features ?? [])
            {
                var channel = feature?.Channel ?? "";
                if (feature is null || features.Count >= 16 || !IdentifierPattern().IsMatch(channel) || !channels.Add(channel))
                    throw new ArgumentException("Protocol feature channels must be unique identifiers; at most 16 are supported.");
                if (feature.Actuator is not ("Position" or "Scalar" or "Rotation")) throw new ArgumentException("Unsupported actuator type.");
                if (feature.ScalarType is not ("Vibrate" or "Oscillate" or "Constrict" or "Led" or "Temperature" or "Spray"))
                    throw new ArgumentException("Unsupported scalar actuator type.");
                var target = feature.TargetAxis ?? "";
                if (target.Length > 0 && (!Enum.TryParse<MotionAxis>(target, out var axis) || !Enum.IsDefined(axis) || Enum.GetName(axis) != target))
                    throw new ArgumentException("Invalid target axis.");
                // Rotation is speed/direction, whereas R axes are absolute positions.
                if (feature.Actuator == "Rotation" && target.Length > 0) throw new ArgumentException("Rotation speed needs a computed binding; leave its direct target axis empty.");
                if (feature.Actuator == "Scalar" && target.Length > 0 && !target.StartsWith('V'))
                    throw new ArgumentException("Scalar intensity maps directly only to vibration axes; use a computed binding for other conversions.");
                if (source.Enabled && source.RouteToMotion && target.Length > 0 && !axes.Add(target))
                    throw new ArgumentException("Enabled protocol inputs cannot directly control the same axis. Use explicit computed bindings instead.");
                if (source.Type is "TCodeTcp" or "TCodeUdp" or "TCodeSerial" or "TCodeWebSocket" or "IntifaceDevice"
                    && (channel.Length != 2 || !"LRVA".Contains(channel[0]) || channel[1] is < '0' or > '9' || feature.Actuator == "Rotation"))
                    throw new ArgumentException("TCode channels require LRVA axes and position/scalar capabilities.");
                features.Add(new() { Channel = channel, Name = (feature.Name ?? channel).Trim(), Actuator = feature.Actuator, ScalarType = feature.ScalarType, TargetAxis = target });
            }
            if (features.Count == 0) throw new ArgumentException("A protocol input needs at least one feature.");
            result.Add(new()
            {
                Id = id, Name = (source.Name ?? id).Trim(), Type = source.Type, Enabled = source.Enabled, Host = bind.ToString(), Port = source.Port, Path = NormalizePath(source.Path),
                Address = source.Address?.Trim() ?? "", Identifier = source.Identifier?.Trim() ?? "", ComPort = source.ComPort?.Trim() ?? "",
                BaudRate = source.BaudRate, TimeoutMs = source.TimeoutMs, RouteToMotion = source.RouteToMotion, MaxSpeedPerSecond = source.MaxSpeedPerSecond, MaxScriptDurationMs = source.MaxScriptDurationMs, Features = features,
            });
        }
        var listeners = result.Where(input => input.Enabled && input.Type is not ("IntifaceDevice" or "TCodeSerial")).ToArray();
        for (var i = 0; i < listeners.Length; i++)
        for (var j = i + 1; j < listeners.Length; j++)
        {
            var first = listeners[i]; var second = listeners[j];
            if (first.Port != second.Port || (first.Type == "TCodeUdp") != (second.Type == "TCodeUdp")
                || !BindingsOverlap(first.Host, second.Host)) continue;
            if (!IsWebType(first.Type) || !IsWebType(second.Type) || first.Host != second.Host)
                throw new ArgumentException("Overlapping protocol listeners must use different ports, except web protocols sharing the same bind address.");
            if (first.Path == second.Path)
                throw new ArgumentException("Web protocol inputs sharing a port need distinct paths.");
        }
        return result;
    }
}

/// <summary>Owns external command leases and typed trajectories independently of transport framing.</summary>
public sealed class ExternalControlStore : IExternalControlSink, IDisposable
{
    private sealed class Source(ProtocolInputConfig config)
    {
        public ProtocolInputConfig Config = config;
        public string? Session;
        public long LastSeen;
        public long Count;
        public readonly Dictionary<string, Trajectory> Channels = new(StringComparer.Ordinal);
    }
    private sealed record Trajectory(ExternalControlCommand Command, double Start, long At, long Sequence);
    private readonly object _sync = new();
    private readonly object _events = new();
    private readonly TimeProvider _clock;
    private readonly ITimer _watchdog;
    private Dictionary<string, Source> _sources = new(StringComparer.Ordinal);
    private bool _disposed;
    private long _sequence;
    public event Action<ExternalControlBatch>? CommandsReceived;
    public event Action<string, string?, long>? Stopped;
    public event Action? Changed;
    public event Action? CommandsCleared;
    public ExternalControlStore(IEnumerable<ProtocolInputConfig>? inputs = null, TimeProvider? clock = null)
    {
        _clock = clock ?? TimeProvider.System;
        Configure(inputs);
        _watchdog = _clock.CreateTimer(_ => Expire(), null, TimeSpan.FromMilliseconds(100), TimeSpan.FromMilliseconds(100));
    }
    private long Now => _clock.GetUtcNow().ToUnixTimeMilliseconds();
    private static long LeaseDeadline(Source source)
    {
        var activeUntil = source.LastSeen;
        // TCode has no negotiated Ping; Handy HDSP also accepts finite moves.
        // Retain the lease through arrival, then apply the normal idle grace.
        if (source.Config.Type is "TCodeTcp" or "TCodeUdp" or "TCodeSerial" or "TCodeWebSocket" or "HandyHttp")
            foreach (var trajectory in source.Channels.Values)
                activeUntil = Math.Max(activeUntil, trajectory.At + trajectory.Command.DurationMs);
        return activeUntil + source.Config.TimeoutMs;
    }
    public void Configure(IEnumerable<ProtocolInputConfig>? inputs)
    { lock (_events) ConfigureCore(inputs); }
    private void ConfigureCore(IEnumerable<ProtocolInputConfig>? inputs)
    {
        var validated = ProtocolInputConfiguration.CloneAndValidate(inputs);
        string[] previous;
        lock (_sync)
        {
            previous = _sources.Keys.ToArray();
            ++_sequence;
            _sources = validated.Where(input => input.Enabled).ToDictionary(input => input.Id, input => new Source(input), StringComparer.Ordinal);
        }
        foreach (var id in previous) Stopped?.Invoke(id, null, Interlocked.Read(ref _sequence));
        Changed?.Invoke();
    }
    public bool TryAcquire(string inputId, string sessionId, out string error)
    { lock (_events) return TryAcquireCore(inputId, sessionId, out error); }
    private bool TryAcquireCore(string inputId, string sessionId, out string error)
    {
        Expire();
        lock (_sync)
        {
            error = "";
            if (_disposed || !_sources.TryGetValue(inputId, out var source)) { error = "Input is disabled."; return false; }
            if (string.IsNullOrEmpty(sessionId)) { error = "Session identity is required."; return false; }
            if (source.Session is not null && source.Session != sessionId) { error = "Another client owns this input."; return false; }
            source.Session = sessionId; source.LastSeen = Now;
        }
        Changed?.Invoke(); return true;
    }
    public bool Publish(string inputId, string sessionId, IReadOnlyList<ExternalControlCommand> commands, out string error)
    { lock (_events) return PublishCore(inputId, sessionId, commands, out error); }
    private bool PublishCore(string inputId, string sessionId, IReadOnlyList<ExternalControlCommand> commands, out string error)
    {
        Expire();
        ExternalControlCommand[] accepted;
        long sequence;
        lock (_sync)
        {
            error = "";
            if (_disposed || !_sources.TryGetValue(inputId, out var source) || source.Session != sessionId)
            { error = "The control session is unavailable."; return false; }
            if (commands is null || commands.Count is < 1 or > 16) { error = "A command batch needs 1 to 16 channels."; return false; }
            var channels = new HashSet<string>(StringComparer.Ordinal);
            foreach (var command in commands)
            {
                if (command is null || !double.IsFinite(command.Value) || command.Value is < 0 or > 1 || command.DurationMs is < 0 or > 600000
                    || !channels.Add(command.Channel) || !source.Config.Features.Any(feature => feature.Channel == command.Channel))
                { error = "Invalid channel, value, duration or duplicate channel."; return false; }
            }
            var now = Now;
            accepted = commands.ToArray();
            sequence = ++_sequence;
            foreach (var command in accepted)
            {
                var start = source.Channels.TryGetValue(command.Channel, out var old) ? ValueAt(old, now) : double.NaN;
                source.Channels[command.Channel] = new(command, start, now, sequence);
            }
            source.LastSeen = now; source.Count += accepted.Length;
        }
        CommandsReceived?.Invoke(new(inputId, sessionId, sequence, accepted)); Changed?.Invoke(); return true;
    }
    private static double ValueAt(Trajectory trajectory, long now) => trajectory.Command.DurationMs <= 0 || now - trajectory.At >= trajectory.Command.DurationMs ? trajectory.Command.Value
        : trajectory.Start + (trajectory.Command.Value - trajectory.Start) * Math.Clamp((double)(now - trajectory.At) / trajectory.Command.DurationMs, 0, 1);
    public ComputedSignalSample Read(string path, long now)
    {
        var slash = path.IndexOf('/');
        if (slash <= 0) return ComputedSignalSample.Invalid("Choose an input/channel.");
        var parts = path[(slash + 1)..].Split('/');
        lock (_sync)
        {
            if (!_sources.TryGetValue(path[..slash], out var source) || source.Session is null
                || now < source.LastSeen || now >= LeaseDeadline(source)
                || !source.Channels.TryGetValue(parts[0], out var trajectory))
                return ComputedSignalSample.Invalid("Waiting for protocol input.");
            var value = parts.Length == 1 || parts is [_, "value"] ? ValueAt(trajectory, now)
                : parts is [_, "target"] or [_, "speed"] ? trajectory.Command.Value
                : parts is [_, "clockwise"] ? trajectory.Command.Clockwise ? 1d : 0d : double.NaN;
            if (!double.IsFinite(value)) return ComputedSignalSample.Invalid("The trajectory starting position is unknown, or the channel metric is invalid.");
            return ComputedSignalSample.Success((float)value, null, trajectory.At,
                originKey: "protocol:" + path[..slash] + ":" + source.Session + ":" + path[(slash + 1)..]);
        }
    }
    public bool IsCurrent(ExternalControlBatch batch, string channel)
    {
        lock (_sync) return !_disposed && _sources.TryGetValue(batch.InputId, out var source) && source.Session == batch.SessionId
            && Now >= source.LastSeen && Now < LeaseDeadline(source)
            && source.Channels.TryGetValue(channel, out var trajectory) && trajectory.Sequence == batch.Sequence;
    }
    public bool HasNewerCommand(string inputId, string? channel, long sequence)
    {
        lock (_sync) return _sources.TryGetValue(inputId, out var source)
            && source.Channels.Any(pair => (channel is null || pair.Key == channel) && pair.Value.Sequence > sequence);
    }
    public void Stop(string inputId, string sessionId, string? channel = null)
    { lock (_events) StopCore(inputId, sessionId, channel); }
    private void StopCore(string inputId, string sessionId, string? channel)
    {
        lock (_sync)
        {
            if (!_sources.TryGetValue(inputId, out var source) || source.Session != sessionId) return;
            if (channel is null) source.Channels.Clear(); else source.Channels.Remove(channel);
            source.LastSeen = Now; ++_sequence;
        }
        Stopped?.Invoke(inputId, channel, Interlocked.Read(ref _sequence)); Changed?.Invoke();
    }
    public void Release(string inputId, string sessionId)
    { lock (_events) ReleaseCore(inputId, sessionId); }
    private void ReleaseCore(string inputId, string sessionId)
    {
        lock (_sync)
        {
            if (!_sources.TryGetValue(inputId, out var source) || source.Session != sessionId) return;
            source.Session = null; source.Channels.Clear(); ++_sequence;
        }
        Stopped?.Invoke(inputId, null, Interlocked.Read(ref _sequence)); Changed?.Invoke();
    }
    public void Heartbeat(string inputId, string sessionId)
    { lock (_events) HeartbeatCore(inputId, sessionId); }
    private void HeartbeatCore(string inputId, string sessionId)
    {
        Expire();
        lock (_sync) if (_sources.TryGetValue(inputId, out var source) && source.Session == sessionId) source.LastSeen = Now;
    }
    public void ClearCommands()
    { lock (_events) ClearCommandsCore(); CommandsCleared?.Invoke(); }
    private void ClearCommandsCore()
    {
        lock (_sync) { ++_sequence; foreach (var source in _sources.Values) source.Channels.Clear(); }
    }
    public void Expire()
    { lock (_events) ExpireCore(); }
    private void ExpireCore()
    {
        List<string> expired = [];
        lock (_sync)
        {
            var now = Now;
            foreach (var source in _sources.Values)
                if (source.Session is not null && (now < source.LastSeen || now >= LeaseDeadline(source)))
                { source.Session = null; source.Channels.Clear(); ++_sequence; expired.Add(source.Config.Id); }
        }
        foreach (var id in expired) Stopped?.Invoke(id, null, Interlocked.Read(ref _sequence));
        if (expired.Count > 0) Changed?.Invoke();
    }
    public ExternalControlStatus? GetStatus(string inputId)
    {
        lock (_sync) return _sources.TryGetValue(inputId, out var source)
            ? new(source.Session, source.Count, source.Channels.Keys.ToArray()) : null;
    }
    public object[] Snapshot()
    {
        lock (_sync) return _sources.Values.Select(source => (object)new
        { id = source.Config.Id, name = source.Config.Name, type = source.Config.Type, enabled = true, connected = source.Session is not null,
            session = source.Session, receivedCommands = source.Count, channels = source.Channels.Keys.ToArray() }).ToArray();
    }
    public void Dispose()
    {
        lock (_sync) { if (_disposed) return; _disposed = true; }
        _watchdog.Dispose(); Configure([]);
    }
}
