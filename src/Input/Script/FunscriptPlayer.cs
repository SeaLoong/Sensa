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
    string State)
{
    public IReadOnlyList<int> ActivityBins { get; init; } = Array.Empty<int>();
    public bool LoopRangeActive { get; init; }
    public long? LoopStartMs { get; init; }
    public long? LoopEndMs { get; init; }
}

public sealed class FunscriptPlayer : IDisposable
{
    private const int ActivityBinCount = 64;

    private readonly object _gate = new();
    private readonly object _eventGate = new();
    private long _frameRevision;
    private ITimer? _playbackTimer;
    private readonly TimeProvider _timeProvider;
    private long NowMs => (long)_timeProvider.GetElapsedTime(0, _timeProvider.GetTimestamp()).TotalMilliseconds;

    public FunscriptPlayer(TimeProvider? timeProvider = null) => _timeProvider = timeProvider ?? TimeProvider.System;

    private List<FunscriptAction> _actions = new();
    private int[] _activityBins = Array.Empty<int>();
    private string _fileName = string.Empty;
    private bool _loop;
    private long? _loopStartMs;
    private long? _loopEndMs;
    private double _speed = 1.0;
    private long _durationMs;
    private long _resumePositionMs;
    private double _positionFractionMs;
    private bool _finalFramePending;
    private long _resumeStartedAtMs;
    private bool _playing;
    private float _lastL0;
    private string _state = "empty";

    public event Action<float>? OnFrame;
    public event Action? OnStopped;
    public event Action? OnStateChanged;

    public FunscriptPlaybackSnapshot Load(string fileName, Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream);

        var parsed = ParseFunscript(stream);
        FunscriptPlaybackSnapshot snapshot;

        lock (_gate)
        {
            StopPlaybackTimerLocked();
            _frameRevision++;
            _actions = parsed.Actions;
            _activityBins = parsed.ActivityBins;
            _fileName = string.IsNullOrWhiteSpace(fileName) ? "script.funscript" : fileName;
            _durationMs = parsed.DurationMs;
            _loopStartMs = null;
            _loopEndMs = null;
            _resumePositionMs = 0;
            _positionFractionMs = 0;
            _finalFramePending = false;
            _resumeStartedAtMs = 0;
            _playing = false;
            _lastL0 = _actions.Count > 0 ? _actions[0].Pos01 : 0f;
            _state = "stopped";
            snapshot = BuildSnapshotLocked();
        }

        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot Configure(bool? loop = null, double? speed = null, bool updateLoopRange = false, long? loopStartMs = null, long? loopEndMs = null)
    {
        FunscriptPlaybackSnapshot snapshot;
        lock (_gate)
        {
            var now = NowMs;
            AdvanceLocked(now);

            if (loop.HasValue)
                _loop = loop.Value;

            if (speed.HasValue)
                _speed = ClampSpeed(speed.Value);

            if (updateLoopRange)
            {
                SetLoopRangeLocked(loopStartMs, loopEndMs);

                var loopWindow = GetLoopWindowLocked();
                if (_playing && _loop && loopWindow.Active && (_resumePositionMs < loopWindow.StartMs || _resumePositionMs >= loopWindow.EndMs))
                {
                    _resumePositionMs = loopWindow.StartMs;
                    _lastL0 = SampleAtLocked(_resumePositionMs);
                }
            }

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
        long revision;
        lock (_gate)
        {
            if (_actions.Count == 0)
                throw new InvalidOperationException("请先加载脚本文件。");

            var now = NowMs;
            AdvanceLocked(now);

            if (loop.HasValue)
                _loop = loop.Value;

            if (speed.HasValue)
                _speed = ClampSpeed(speed.Value);

            var loopWindow = GetLoopWindowLocked();

            if (restart || _resumePositionMs >= _durationMs)
            {
                _resumePositionMs = _loop && loopWindow.Active ? loopWindow.StartMs : 0;
            }
            else if (_loop && loopWindow.Active && (_resumePositionMs < loopWindow.StartMs || _resumePositionMs >= loopWindow.EndMs))
            {
                _resumePositionMs = loopWindow.StartMs;
            }

            _resumeStartedAtMs = now;
            _playing = true;
            _lastL0 = SampleAtLocked(_resumePositionMs);
            _state = "playing";
            EnsurePlaybackTimerLocked();

            snapshot = BuildSnapshotLocked();
            currentL0 = _lastL0;
            revision = ++_frameRevision;
        }

        PublishFrame(currentL0, revision);
        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot Pause()
    {
        FunscriptPlaybackSnapshot snapshot;
        lock (_eventGate)
        {
            lock (_gate)
            {
                _frameRevision++;
                AdvanceLocked(NowMs);
                _playing = false;
                _finalFramePending = false;
                StopPlaybackTimerLocked();
                _state = _actions.Count == 0 ? "empty" : _resumePositionMs > 0 ? "paused" : "stopped";
                snapshot = BuildSnapshotLocked();
            }
            OnStopped?.Invoke();
        }
        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot Stop()
    {
        FunscriptPlaybackSnapshot snapshot;
        lock (_eventGate)
        {
            lock (_gate)
            {
                _frameRevision++;
                StopPlaybackTimerLocked();
                _playing = false;
                _resumePositionMs = 0;
                _positionFractionMs = 0;
                _finalFramePending = false;
                _resumeStartedAtMs = 0;
                _lastL0 = 0f;
                _state = _actions.Count == 0 ? "empty" : "stopped";
                snapshot = BuildSnapshotLocked();
            }
            OnStopped?.Invoke();
        }
        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot Clear()
    {
        FunscriptPlaybackSnapshot snapshot;
        lock (_eventGate)
        {
            lock (_gate)
            {
                _frameRevision++;
                StopPlaybackTimerLocked();
                _actions = new List<FunscriptAction>();
                _activityBins = Array.Empty<int>();
                _fileName = string.Empty;
                _durationMs = 0;
                _loopStartMs = null;
                _loopEndMs = null;
                _resumePositionMs = 0;
                _positionFractionMs = 0;
                _finalFramePending = false;
                _resumeStartedAtMs = 0;
                _playing = false;
                _lastL0 = 0f;
                _state = "empty";
                snapshot = BuildSnapshotLocked();
            }
            OnStopped?.Invoke();
        }
        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot Seek(long positionMs)
    {
        FunscriptPlaybackSnapshot snapshot;
        float currentL0;
        long revision;

        lock (_gate)
        {
            if (_actions.Count == 0)
                throw new InvalidOperationException("请先加载脚本文件。");

            (snapshot, currentL0) = SeekToPositionLocked(positionMs);
            revision = ++_frameRevision;
        }

        PublishFrame(currentL0, revision);
        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot StepAction(int direction)
    {
        FunscriptPlaybackSnapshot snapshot;
        float currentL0;
        long revision;

        lock (_gate)
        {
            if (_actions.Count == 0)
                throw new InvalidOperationException("请先加载脚本文件。");

            var targetPositionMs = ResolveStepActionTargetLocked(direction);
            (snapshot, currentL0) = SeekToPositionLocked(targetPositionMs);
            revision = ++_frameRevision;
        }

        PublishFrame(currentL0, revision);
        OnStateChanged?.Invoke();
        return snapshot;
    }

    public FunscriptPlaybackSnapshot GetSnapshot()
    {
        lock (_gate)
        {
            AdvanceLocked(NowMs);
            return BuildSnapshotLocked();
        }
    }

    public MotionFrame Sample(double deltaMs)
    {
        lock (_gate)
        {
            AdvanceLocked(NowMs);

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
        long revision;

        lock (_gate)
        {
            var wasPlaying = _playing;
            AdvanceLocked(NowMs);
            shouldEmit = (wasPlaying || _finalFramePending) && _actions.Count > 0;
            _finalFramePending = false;
            currentL0 = _lastL0;
            revision = _frameRevision;

            if (!shouldEmit)
                StopPlaybackTimerLocked();
        }

        if (shouldEmit)
            PublishFrame(currentL0, revision);

        OnStateChanged?.Invoke();
    }

    private void PublishFrame(float l0, long revision)
    {
        // Serialize frame admission with stops without invoking consumers under the state lock.
        // 帧接纳与停止串行；调用订阅者时不持有播放器状态锁。
        lock (_eventGate)
        {
            var handlers = OnFrame;
            if (handlers is null) return;
            foreach (Action<float> handler in handlers.GetInvocationList())
            {
                lock (_gate)
                {
                    if (revision != _frameRevision) return;
                }
                handler(l0);
            }
        }
    }

    private void EnsurePlaybackTimerLocked()
    {
        _playbackTimer ??= _timeProvider.CreateTimer(_ => HandlePlaybackTick(), null,
            TimeSpan.FromMilliseconds(20), TimeSpan.FromMilliseconds(20));
        _playbackTimer.Change(TimeSpan.FromMilliseconds(20), TimeSpan.FromMilliseconds(20));
    }

    private void StopPlaybackTimerLocked()
    {
        _playbackTimer?.Change(Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
    }

    private (FunscriptPlaybackSnapshot Snapshot, float CurrentL0) SeekToPositionLocked(long positionMs)
    {
        var clampedPosition = Math.Clamp(positionMs, 0L, _durationMs);
        _resumePositionMs = clampedPosition;
        _positionFractionMs = 0;
        _finalFramePending = false;
        _resumeStartedAtMs = NowMs;
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

        return (BuildSnapshotLocked(), _lastL0);
    }

    private void SetLoopRangeLocked(long? loopStartMs, long? loopEndMs)
    {
        var normalizedStart = NormalizeLoopBoundaryMs(loopStartMs);
        var normalizedEnd = NormalizeLoopBoundaryMs(loopEndMs);

        if (normalizedStart.HasValue && normalizedEnd.HasValue && normalizedEnd.Value < normalizedStart.Value)
            (normalizedStart, normalizedEnd) = (normalizedEnd, normalizedStart);

        _loopStartMs = normalizedStart;
        _loopEndMs = normalizedEnd;
    }

    private (bool Active, long StartMs, long EndMs) GetLoopWindowLocked()
    {
        if (_durationMs <= 0)
            return (false, 0L, 0L);

        if (!_loopStartMs.HasValue || !_loopEndMs.HasValue)
            return (false, 0L, _durationMs);

        var startMs = NormalizeLoopBoundaryMs(_loopStartMs) ?? 0L;
        var endMs = NormalizeLoopBoundaryMs(_loopEndMs) ?? _durationMs;

        if (endMs <= startMs)
            return (false, 0L, _durationMs);

        return (true, startMs, endMs);
    }

    private long? NormalizeLoopBoundaryMs(long? value)
    {
        if (!value.HasValue)
            return null;

        return Math.Clamp(value.Value, 0L, _durationMs);
    }

    private long ResolveStepActionTargetLocked(int direction)
    {
        if (_actions.Count == 0)
            return 0L;

        if (direction >= 0)
        {
            foreach (var action in _actions)
            {
                if (action.AtMs > _resumePositionMs)
                    return action.AtMs;
            }

            return _durationMs;
        }

        for (var index = _actions.Count - 1; index >= 0; index--)
        {
            if (_actions[index].AtMs < _resumePositionMs)
                return _actions[index].AtMs;
        }

        return 0L;
    }

    private FunscriptPlaybackSnapshot BuildSnapshotLocked()
    {
        var loaded = _actions.Count > 0;
        var loopWindow = GetLoopWindowLocked();

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
            State: loaded ? _state : "empty")
        {
            ActivityBins = loaded ? _activityBins : Array.Empty<int>(),
            LoopRangeActive = loopWindow.Active,
            LoopStartMs = _loopStartMs,
            LoopEndMs = _loopEndMs,
        };
    }

    private void AdvanceLocked(long nowMs)
    {
        if (_actions.Count == 0)
        {
            _durationMs = 0;
            _resumePositionMs = 0;
            _positionFractionMs = 0;
            _finalFramePending = false;
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
        var preciseDelta = elapsedMs * _speed + _positionFractionMs;
        var wholeDelta = (long)Math.Floor(preciseDelta);
        _positionFractionMs = preciseDelta - wholeDelta;
        var advancedPosition = _resumePositionMs + wholeDelta;
        var loopWindow = GetLoopWindowLocked();

        if (_loop && loopWindow.Active)
        {
            var loopSpanMs = Math.Max(loopWindow.EndMs - loopWindow.StartMs, 1L);

            if (_resumePositionMs < loopWindow.StartMs || _resumePositionMs >= loopWindow.EndMs)
            {
                _resumePositionMs = loopWindow.StartMs;
                _resumeStartedAtMs = nowMs;
                _lastL0 = SampleAtLocked(_resumePositionMs);
                _state = "playing";
                return;
            }

            if (advancedPosition >= loopWindow.EndMs)
            {
                var offsetMs = advancedPosition - loopWindow.StartMs;
                advancedPosition = loopWindow.StartMs + (offsetMs % loopSpanMs);
            }

            _resumePositionMs = advancedPosition;
            _resumeStartedAtMs = nowMs;
            _lastL0 = SampleAtLocked(_resumePositionMs);
            _state = "playing";
            return;
        }

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
            _finalFramePending = true;
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

    private static double ClampSpeed(double value)
    {
        if (!double.IsFinite(value))
            throw new ArgumentOutOfRangeException(nameof(value), "Playback speed must be finite. / 播放速度必须是有限数。");
        return Math.Clamp(value, 0.1, 4.0);
    }

    private static ParsedScript ParseFunscript(Stream stream)
    {
        using var document = JsonDocument.Parse(stream);

        if (document.RootElement.ValueKind != JsonValueKind.Object
            || !document.RootElement.TryGetProperty("actions", out var actionsElement) || actionsElement.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("脚本文件缺少 actions 数组。");

        var inverted = document.RootElement.TryGetProperty("inverted", out var invertedElement)
            && invertedElement.ValueKind == JsonValueKind.True;
        var actions = new List<FunscriptAction>();

        foreach (var actionElement in actionsElement.EnumerateArray())
        {
            if (actionElement.ValueKind != JsonValueKind.Object
                || !actionElement.TryGetProperty("at", out var atElement)
                || !actionElement.TryGetProperty("pos", out var posElement)
                || atElement.ValueKind != JsonValueKind.Number
                || posElement.ValueKind != JsonValueKind.Number)
            {
                continue;
            }

            if (!atElement.TryGetInt64(out var rawTime) || !posElement.TryGetDouble(out var rawPosition) || !double.IsFinite(rawPosition))
                continue;
            var atMs = Math.Max(rawTime, 0L);
            var pos01 = (float)Math.Clamp(rawPosition / 100.0, 0.0, 1.0);
            if (inverted) pos01 = 1f - pos01;
            if (atMs > 7L * 24 * 60 * 60 * 1000 || actions.Count >= 500000) throw new InvalidDataException("Script exceeds the duration or action limit.");
            actions.Add(new FunscriptAction(atMs, pos01));
        }

        if (actions.Count == 0)
            throw new InvalidDataException("脚本文件中没有可播放的动作数据。");

        // Resolve duplicates before sorting so the final original action wins deterministically.
        // 排序前处理重复时间戳，确定性地保留原文件中最后一条动作。
        actions = actions.GroupBy(action => action.AtMs)
            .Select(group => group.Last())
            .OrderBy(action => action.AtMs)
            .ToList();
        var durationMs = Math.Max(actions[^1].AtMs, 1L);
        return new ParsedScript(actions, durationMs, BuildActivityBins(actions, durationMs));
    }

    private static int[] BuildActivityBins(IReadOnlyList<FunscriptAction> actions, long durationMs)
    {
        if (actions.Count == 0 || durationMs <= 0)
            return Array.Empty<int>();

        var bins = new int[ActivityBinCount];
        foreach (var action in actions)
        {
            var ratio = Math.Clamp(action.AtMs / (double)durationMs, 0d, 1d);
            var index = Math.Min((int)Math.Floor(ratio * ActivityBinCount), ActivityBinCount - 1);
            bins[index]++;
        }

        return bins;
    }

    public void Dispose()
    {
        lock (_eventGate)
        lock (_gate)
        {
            _frameRevision++;
            _playing = false;
            _finalFramePending = false;
            _playbackTimer?.Dispose();
            _playbackTimer = null;
        }
    }

    private sealed record ParsedScript(List<FunscriptAction> Actions, long DurationMs, int[] ActivityBins);
}