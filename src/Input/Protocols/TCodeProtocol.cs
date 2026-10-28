using System.Globalization;
using System.Text;

namespace Sensa.Input.Protocols;

/// <summary>A complete newline-delimited TCode instruction, validated before any command is published.</summary>
public sealed record TCodeInstruction(IReadOnlyList<TCodeAxisInstruction> Commands, bool Stop, IReadOnlyList<int> Queries);
public sealed record TCodeAxisInstruction(string Channel, double Value, int? IntervalMs, int? Speed);

/// <summary>
/// TCode 0.3 commands and the common 0.4 core. Smooth/gradient modifiers and EEPROM writes are
/// deliberately rejected: advertising them without preserving their trajectory would change motion.
/// Magnitude digits are a decimal fraction, not an integer divided by its largest representable value.
/// https://github.com/multiaxis/TCode-Spec/blob/master/README.md
/// </summary>
public static class TCodeProtocol
{
    public const int MaximumLineBytes = 4096;
    public const int MaximumDurationMs = 60000;

    public static bool IsChannel(string channel) => channel.Length == 2
        && "LRVA".Contains(char.ToUpperInvariant(channel[0])) && channel[1] is >= '0' and <= '9';

    public static TCodeInstruction ParseLine(string line)
    {
        ArgumentNullException.ThrowIfNull(line);
        if (line.Length > MaximumLineBytes || line.Any(character => character > 127 || char.IsControl(character) && character is not ('\t' or '\r' or '\n')))
            throw new FormatException("TCode requires a bounded ASCII line.");
        line = line.TrimEnd('\r', '\n');
        if (line.Contains('\r') || line.Contains('\n')) throw new FormatException("Parse one complete TCode line at a time.");
        var commands = new Dictionary<string, TCodeAxisInstruction>(StringComparer.Ordinal);
        var queries = new List<int>();
        var stop = false;
        foreach (var raw in line.Split([' ', '\t'], StringSplitOptions.RemoveEmptyEntries))
        {
            var token = raw.ToUpperInvariant();
            if (token == "DSTOP") { stop = true; continue; }
            if (token is "D0" or "D1" or "D2") { queries.Add(token[1] - '0'); continue; }
            if (token.Length < 3 || !IsChannel(token[..2])) throw new FormatException("Unsupported TCode instruction.");
            var at = 2;
            while (at < token.Length && token[at] is >= '0' and <= '9')
                at++;
            if (at == 2) throw new FormatException("A TCode axis needs magnitude digits.");
            var magnitude = double.Parse("0." + token[2..at], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture);
            // Very long decimal fractions can round up to one in binary floating point.
            magnitude = Math.Min(magnitude, Math.BitDecrement(1d));
            int? interval = null, speed = null;
            if (at < token.Length)
            {
                var kind = token[at++];
                if (kind is not ('I' or 'S') || at == token.Length
                    || token[at..].Any(character => character is < '0' or > '9')
                    || !int.TryParse(token.AsSpan(at), NumberStyles.None, CultureInfo.InvariantCulture, out var number))
                    throw new FormatException("Unsupported TCode timing or smooth-motion modifier.");
                if (kind == 'I')
                {
                    if (number > MaximumDurationMs) throw new FormatException("TCode duration exceeds the input limit.");
                    interval = number;
                }
                else
                {
                    if (number <= 0) throw new FormatException("TCode speed must be positive.");
                    speed = number;
                }
            }
            commands[token[..2]] = new(token[..2], magnitude, interval, speed);
        }
        if (stop && commands.Count != 0) throw new FormatException("A stop instruction cannot also start motion.");
        return new(commands.Values.ToArray(), stop, queries);
    }
}

/// <summary>Incremental framing shared by stream and WebSocket device inputs; invalid bytes discard the pending line.</summary>
public sealed class TCodeLineFramer
{
    private readonly StringBuilder _pending = new();
    private readonly object _sync = new();
    private bool _discarding;
    public int PendingBytes { get { lock (_sync) return _pending.Length; } }
    public void Reset() { lock (_sync) { _pending.Clear(); _discarding = false; } }

    public IReadOnlyList<string> Push(ReadOnlySpan<byte> bytes)
    {
        lock (_sync) return PushCore(bytes);
    }
    private IReadOnlyList<string> PushCore(ReadOnlySpan<byte> bytes)
    {
        var lines = new List<string>();
        foreach (var value in bytes)
        {
            if (value is 10 or 13)
            {
                if (_discarding) { _discarding = false; _pending.Clear(); continue; }
                if (_pending.Length > 0) { lines.Add(_pending.ToString()); _pending.Clear(); }
                continue;
            }
            if (_discarding) continue;
            if (value > 127 || value < 32 && value != 9 || _pending.Length >= TCodeProtocol.MaximumLineBytes)
            {
                _pending.Clear(); _discarding = true;
                throw new FormatException("Invalid or oversized TCode frame; pending motion was discarded.");
            }
            _pending.Append((char)value);
        }
        return lines;
    }
}

/// <summary>Owns one source session and its commanded trajectories; no physical position is assumed for an initial S command.</summary>
public sealed class TCodeInputSession : IDisposable
{
    private readonly ProtocolInputConfig _config;
    private readonly IExternalControlSink _sink;
    private readonly string _sessionId;
    private readonly TimeProvider _clock;
    private readonly object _sync = new();
    private readonly Dictionary<string, Trajectory> _targets = new(StringComparer.Ordinal);
    private readonly HashSet<string> _channels;
    private bool _acquired, _disposed;
    private long _epoch;
    private long _lastAcceptedAt;
    public long Epoch { get { lock (_sync) return _epoch; } }
    /// <summary>A TCode command has no Ping: its finite motion must finish before the idle grace starts.</summary>
    public TimeSpan RemainingIdleTime
    {
        get
        {
            lock (_sync)
            {
                if (_disposed) return TimeSpan.Zero;
                var now = _clock.GetTimestamp();
                var timeout = TimeSpan.FromMilliseconds(Math.Max(100, _config.TimeoutMs));
                var remaining = timeout - _clock.GetElapsedTime(_lastAcceptedAt, now);
                foreach (var trajectory in _targets.Values)
                {
                    var untilArrival = TimeSpan.FromMilliseconds(trajectory.DurationMs) + timeout - _clock.GetElapsedTime(trajectory.StartedAt, now);
                    if (untilArrival > remaining) remaining = untilArrival;
                }
                return remaining > TimeSpan.Zero ? remaining : TimeSpan.Zero;
            }
        }
    }

    public TCodeInputSession(ProtocolInputConfig config, IExternalControlSink sink, string sessionId, TimeProvider? clock = null)
    {
        _config = config; _sink = sink; _sessionId = sessionId; _clock = clock ?? TimeProvider.System;
        _lastAcceptedAt = _clock.GetTimestamp();
        _channels = config.Features.Select(feature => feature.Channel.ToUpperInvariant()).ToHashSet(StringComparer.Ordinal);
        if (_channels.Count == 0 || _channels.Any(channel => !TCodeProtocol.IsChannel(channel)))
            throw new ArgumentException("TCode inputs need configured axis channel names such as L0 and R0.", nameof(config));
    }

    public bool TryAcquire(out string error)
    {
        lock (_sync)
        {
            if (_disposed) { error = "The TCode session has ended."; return false; }
            if (_acquired) { error = ""; return true; }
            _acquired = _sink.TryAcquire(_config.Id, _sessionId, out error);
            if (_acquired) _lastAcceptedAt = _clock.GetTimestamp();
            return _acquired;
        }
    }

    public bool TryProcessLine(string line, out string response, out string error, long? expectedEpoch = null)
    {
        lock (_sync)
        {
            if (expectedEpoch is { } epoch && epoch != _epoch)
            { response = ""; error = "The pending TCode frame belongs to a cleared input generation."; return false; }
            return TryProcessLineCore(line, out response, out error);
        }
    }

    private bool TryProcessLineCore(string line, out string response, out string error)
    {
        response = "";
        if (!TryAcquire(out error)) return false;
        try
        {
            var instruction = TCodeProtocol.ParseLine(line);
            var now = _clock.GetTimestamp();
            var updates = new Dictionary<string, Trajectory>(StringComparer.Ordinal);
            var commands = new List<ExternalControlCommand>();
            foreach (var command in instruction.Commands)
            {
                if (!_channels.Contains(command.Channel)) throw new FormatException("TCode channel is not configured for this input.");
                var previous = _targets.GetValueOrDefault(command.Channel);
                var knownStart = previous is not null && previous.HasKnownPosition(_clock, now);
                var start = previous?.At(_clock, now) ?? command.Value;
                var duration = command.IntervalMs ?? 0;
                if (command.Speed is { } speed)
                {
                    if (!knownStart) throw new FormatException("A speed command needs a known previously commanded position.");
                    // The specification's S1000 traverses one normalized axis per second.
                    // Decimal magnitudes can leave sub-nanosecond binary rounding noise at whole milliseconds.
                    var requested = Math.Ceiling(Math.Round(Math.Abs(command.Value - start) * 1000000d / speed, 9));
                    if (requested > TCodeProtocol.MaximumDurationMs) throw new FormatException("TCode speed would exceed the input duration limit.");
                    duration = (int)requested;
                }
                commands.Add(new(command.Channel, command.Value, duration));
                updates[command.Channel] = new(start, command.Value, now, duration, knownStart || duration == 0);
            }
            if (instruction.Stop) Stop();
            if (commands.Count > 0)
            {
                // A sink admits the entire batch or none of it. Never publish a valid prefix.
                if (!_sink.Publish(_config.Id, _sessionId, commands, out error)) { Stop(); return false; }
                foreach (var (channel, trajectory) in updates) _targets[channel] = trajectory;
            }
            if (commands.Count > 0 || instruction.Stop || instruction.Queries.Count > 0)
            {
                _lastAcceptedAt = now;
                _sink.Heartbeat(_config.Id, _sessionId);
            }
            response = string.Concat(instruction.Queries.Select(query => query switch
            {
                0 => "Sensa external control bridge\n",
                1 => "TCode v0.3\n",
                _ => string.Concat(_channels.Order(StringComparer.Ordinal).Select(channel => channel + " 0 9999\n")),
            }));
            error = "";
            return true;
        }
        catch (FormatException exception)
        {
            Stop(); error = exception.Message; return false;
        }
    }

    public string ProcessLine(string line, long? expectedEpoch = null) => TryProcessLine(line, out var response, out var error, expectedEpoch) ? response : "ERR " + error + "\n";
    public void Stop() { lock (_sync) { if (_acquired && !_disposed) _sink.Stop(_config.Id, _sessionId); _targets.Clear(); } }
    public void ResetMotionBaseline() { lock (_sync) { _targets.Clear(); _epoch++; _lastAcceptedAt = _clock.GetTimestamp(); } }
    public void ResetCommands() { lock (_sync) { _epoch++; Stop(); _lastAcceptedAt = _clock.GetTimestamp(); } }
    public void Heartbeat() { lock (_sync) { if (_acquired && !_disposed) _sink.Heartbeat(_config.Id, _sessionId); } }
    public void Dispose()
    {
        lock (_sync)
        {
            if (_disposed) return;
            Stop(); _disposed = true;
            if (_acquired) { _sink.Release(_config.Id, _sessionId); _acquired = false; }
        }
    }
    private sealed record Trajectory(double Start, double Target, long StartedAt, int DurationMs, bool KnownStart)
    {
        public bool HasKnownPosition(TimeProvider clock, long now) => KnownStart || clock.GetElapsedTime(StartedAt, now).TotalMilliseconds >= DurationMs;
        public double At(TimeProvider clock, long now) => DurationMs <= 0 ? Target
            : Start + (Target - Start) * Math.Clamp(clock.GetElapsedTime(StartedAt, now).TotalMilliseconds / DurationMs, 0, 1);
    }
}
