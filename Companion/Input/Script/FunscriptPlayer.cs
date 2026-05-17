using System.Text.Json;
using Sensa.Motion;

namespace Sensa.Input.Script;

public sealed record FunscriptAction(long AtMs, float Pos01);

public sealed record FunscriptPlaybackSnapshot(
    bool Loaded,
    bool Playing,
    bool Paused,
    bool Loop,
    double Speed,
    long PositionMs,
    long DurationMs,
    int ActionCount,
    string FileName,
    float CurrentL0,
    string State);

public sealed class FunscriptPlayer
{
    private readonly object _gate = new();
    private Timer? _playbackTimer;

    private List<FunscriptAction> _actions = new();
    private string _fileName = string.Empty;
    private bool _loop;
    private double _speed = 1.0;
    private long _durationMs;
    private long _resumePositionMs;
    private long _resumeStartedAtMs;
    private bool _playing;
    private float _lastL0;
    private string _state = "empty";

    public event Action<float>? OnFrame;
    public event Action? OnStateChanged;

    public FunscriptPlaybackSnapshot Load(string fileName, Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream);

        var parsed = ParseFunscript(stream);
        FunscriptPlaybackSnapshot snapshot;

        lock (_gate)
        {
            StopPlaybackTimerLocked();
            _actions = parsed.Actions;
            _fileName = string.IsNullOrWhiteSpace(fileName) ? "script.funscript" : fileName;
            _durationMs = parsed.DurationMs;
            _resumePositionMs = 0;
            _resumeStartedAtMs = 0;
            _playing = false;
            _lastL0 = _actions.Count > 0 ? _actions[0].Pos01 : 0f;
            _state = "stopped";
            snapshot = BuildSnapshotLocked();
        }

        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot Configure(bool? loop = null, double? speed = null)
    {
        FunscriptPlaybackSnapshot snapshot;
        lock (_gate)
        {
            var now = Environment.TickCount64;
            AdvanceLocked(now);

            if (loop.HasValue)
                _loop = loop.Value;

            if (speed.HasValue)
                _speed = ClampSpeed(speed.Value);

            if (_playing)
                _resumeStartedAtMs = now;

            snapshot = BuildSnapshotLocked();
        }

        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot Play(bool restart = false, bool? loop = null, double? speed = null)
    {
        FunscriptPlaybackSnapshot snapshot;
        float currentL0;
        lock (_gate)
        {
            if (_actions.Count == 0)
                throw new InvalidOperationException("请先加载脚本文件。");

            var now = Environment.TickCount64;
            AdvanceLocked(now);

            if (loop.HasValue)
                _loop = loop.Value;

            if (speed.HasValue)
                _speed = ClampSpeed(speed.Value);

            if (restart || _resumePositionMs >= _durationMs)
                _resumePositionMs = 0;

            _resumeStartedAtMs = now;
            _playing = true;
            _lastL0 = SampleAtLocked(_resumePositionMs);
            _state = "playing";
            EnsurePlaybackTimerLocked();

            snapshot = BuildSnapshotLocked();
            currentL0 = _lastL0;
        }

        OnFrame?.Invoke(currentL0);
        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot Pause()
    {
        FunscriptPlaybackSnapshot snapshot;
        lock (_gate)
        {
            AdvanceLocked(Environment.TickCount64);
            _playing = false;
            StopPlaybackTimerLocked();

            if (_actions.Count == 0)
            {
                _state = "empty";
            }
            else
            {
                _state = _resumePositionMs > 0 ? "paused" : "stopped";
            }

            snapshot = BuildSnapshotLocked();
        }

        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot Stop()
    {
        FunscriptPlaybackSnapshot snapshot;
        lock (_gate)
        {
            StopPlaybackTimerLocked();
            _playing = false;
            _resumePositionMs = 0;
            _resumeStartedAtMs = 0;
            _lastL0 = 0f;
            _state = _actions.Count == 0 ? "empty" : "stopped";
            snapshot = BuildSnapshotLocked();
        }

        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot Clear()
    {
        FunscriptPlaybackSnapshot snapshot;
        lock (_gate)
        {
            StopPlaybackTimerLocked();
            _actions = new List<FunscriptAction>();
            _fileName = string.Empty;
            _durationMs = 0;
            _resumePositionMs = 0;
            _resumeStartedAtMs = 0;
            _playing = false;
            _lastL0 = 0f;
            _state = "empty";
            snapshot = BuildSnapshotLocked();
        }

        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot Seek(long positionMs)
    {
        FunscriptPlaybackSnapshot snapshot;
        float currentL0;

        lock (_gate)
        {
            if (_actions.Count == 0)
                throw new InvalidOperationException("请先加载脚本文件。");

            var clampedPosition = Math.Clamp(positionMs, 0L, _durationMs);
            _resumePositionMs = clampedPosition;
            _resumeStartedAtMs = Environment.TickCount64;
            _lastL0 = SampleAtLocked(_resumePositionMs);

            if (_resumePositionMs >= _durationMs)
            {
                _playing = false;
                _state = "finished";
            }
            else if (_playing)
            {
                _state = "playing";
            }
            else
            {
                _state = _resumePositionMs > 0 ? "paused" : "stopped";
            }

            snapshot = BuildSnapshotLocked();
            currentL0 = _lastL0;
        }

        OnFrame?.Invoke(currentL0);
        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot GetSnapshot()
    {
        lock (_gate)
        {
            AdvanceLocked(Environment.TickCount64);
            return BuildSnapshotLocked();
        }
    }

    public MotionFrame Sample(double deltaMs)
    {
        lock (_gate)
        {
            AdvanceLocked(Environment.TickCount64);

            if (!_playing || _actions.Count == 0)
                return MotionFrame.Zero with { DeltaMs = deltaMs };

            return MotionFrame.Zero with
            {
                L0 = _lastL0,
                DeltaMs = deltaMs,
            };
        }
    }

    private void HandlePlaybackTick()
    {
        float currentL0;
        bool shouldEmit;

        lock (_gate)
        {
            AdvanceLocked(Environment.TickCount64);
            shouldEmit = _playing && _actions.Count > 0;
            currentL0 = _lastL0;

            if (!shouldEmit)
                StopPlaybackTimerLocked();
        }

        if (shouldEmit)
            OnFrame?.Invoke(currentL0);

        OnStateChanged?.Invoke();
    }

    private void EnsurePlaybackTimerLocked()
    {
        _playbackTimer ??= new Timer(_ => HandlePlaybackTick(), null, 20, 20);
        _playbackTimer.Change(20, 20);
    }

    private void StopPlaybackTimerLocked()
    {
        _playbackTimer?.Change(Timeout.Infinite, Timeout.Infinite);
    }

    private FunscriptPlaybackSnapshot BuildSnapshotLocked()
    {
        var loaded = _actions.Count > 0;

        return new FunscriptPlaybackSnapshot(
            Loaded: loaded,
            Playing: _playing,
            Paused: !_playing && _state == "paused",
            Loop: _loop,
            Speed: _speed,
            PositionMs: _resumePositionMs,
            DurationMs: _durationMs,
            ActionCount: _actions.Count,
            FileName: _fileName,
            CurrentL0: loaded ? _lastL0 : 0f,
            State: loaded ? _state : "empty");
    }

    private void AdvanceLocked(long nowMs)
    {
        if (_actions.Count == 0)
        {
            _durationMs = 0;
            _resumePositionMs = 0;
            _resumeStartedAtMs = 0;
            _playing = false;
            _lastL0 = 0f;
            _state = "empty";
            return;
        }

        if (!_playing)
        {
            _lastL0 = _state == "stopped" ? 0f : SampleAtLocked(_resumePositionMs);
            return;
        }

        var elapsedMs = Math.Max(0L, nowMs - _resumeStartedAtMs);
        var advancedPosition = _resumePositionMs + (long)Math.Round(elapsedMs * _speed);

        if (_loop && _durationMs > 0)
        {
            advancedPosition %= _durationMs;
            _resumePositionMs = advancedPosition;
            _resumeStartedAtMs = nowMs;
            _lastL0 = SampleAtLocked(_resumePositionMs);
            _state = "playing";
            return;
        }

        if (advancedPosition >= _durationMs)
        {
            _resumePositionMs = _durationMs;
            _resumeStartedAtMs = nowMs;
            _playing = false;
            _lastL0 = SampleAtLocked(_resumePositionMs);
            _state = "finished";
            return;
        }

        _resumePositionMs = advancedPosition;
        _resumeStartedAtMs = nowMs;
        _lastL0 = SampleAtLocked(_resumePositionMs);
        _state = "playing";
    }

    private float SampleAtLocked(long positionMs)
    {
        if (_actions.Count == 0)
            return 0f;

        if (positionMs <= _actions[0].AtMs)
            return _actions[0].Pos01;

        if (positionMs >= _actions[^1].AtMs)
            return _actions[^1].Pos01;

        var low = 0;
        var high = _actions.Count - 1;

        while (low <= high)
        {
            var mid = low + ((high - low) / 2);
            var current = _actions[mid].AtMs;

            if (current == positionMs)
                return _actions[mid].Pos01;

            if (current < positionMs)
                low = mid + 1;
            else
                high = mid - 1;
        }

        var upperIndex = Math.Clamp(low, 1, _actions.Count - 1);
        var previous = _actions[upperIndex - 1];
        var next = _actions[upperIndex];
        var span = Math.Max(next.AtMs - previous.AtMs, 1L);
        var t = (positionMs - previous.AtMs) / (float)span;
        return previous.Pos01 + ((next.Pos01 - previous.Pos01) * t);
    }

    private static double ClampSpeed(double value) => Math.Clamp(value, 0.1, 4.0);

    private static ParsedScript ParseFunscript(Stream stream)
    {
        using var document = JsonDocument.Parse(stream);

        if (!document.RootElement.TryGetProperty("actions", out var actionsElement) || actionsElement.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("脚本文件缺少 actions 数组。");

        var actions = new List<FunscriptAction>();

        foreach (var actionElement in actionsElement.EnumerateArray())
        {
            if (!actionElement.TryGetProperty("at", out var atElement)
                || !actionElement.TryGetProperty("pos", out var posElement)
                || atElement.ValueKind != JsonValueKind.Number
                || posElement.ValueKind != JsonValueKind.Number)
            {
                continue;
            }

            var atMs = Math.Max(atElement.GetInt64(), 0L);
            var pos01 = (float)Math.Clamp(posElement.GetDouble() / 100.0, 0.0, 1.0);
            actions.Add(new FunscriptAction(atMs, pos01));
        }

        if (actions.Count == 0)
            throw new InvalidDataException("脚本文件中没有可播放的动作数据。");

        actions.Sort(static (left, right) => left.AtMs.CompareTo(right.AtMs));
        return new ParsedScript(actions, Math.Max(actions[^1].AtMs, 1L));
    }

    ~FunscriptPlayer()
    {
        _playbackTimer?.Dispose();
    }

    private sealed record ParsedScript(List<FunscriptAction> Actions, long DurationMs);
}