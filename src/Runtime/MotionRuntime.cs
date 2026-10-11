using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Input.Script;
using Sensa.Motion;
using Sensa.Outputs.Intiface;
using Sensa.Outputs.TCode;
using Sensa.Recording;
using Sensa.Signals;
using System.Text;

namespace Sensa.Runtime;

/// <summary>
/// Fully event-driven signal router.
///
/// State changes are triggered by:
///   - OscParameterStore.OnSet            (OSC parameter arrives)
///   - Manual input API / WS command      (user updates manual pose)
///   - FunscriptPlayer.OnFrame            (script playback timer event)
///   - Mode / emergency / active toggles  (control-plane events)
///
/// There is no continuous send loop. The runtime maintains the current desired pose,
/// and each event applies an axis patch onto that pose. Output adapters then emit
/// only the axes that actually changed.
/// </summary>
public sealed class MotionRuntime : IDisposable
{
    private const int ManualDefaultSpeed = 999;
    private const int ManualDefaultIntervalMs = 100;
    private const int ManualIntervalMaxMs = 1000;

    private readonly AppConfig _config;
    private readonly OscParameterStore _store;
    private readonly OscInputReceiver _oscReceiver;
    private readonly IntifaceOutputClient? _intifaceOutput;
    private readonly TCodeSerialOutput? _serialOutput;
    private readonly TCodeUdpOutput? _udpOutput;
    private readonly TCodeTcpOutput? _tcpOutput;
    private readonly MotionRecorder? _recorder;
    private readonly FunscriptPlayer _scriptPlayer;
    private readonly Func<MotionFrame, Task>? _sendOutputsAsync;
    private readonly Func<Task>? _emergencyStopAsync;
    private readonly Func<string?>? _preferredOscSourceKeyProvider;
    private readonly object _sync = new();
    private readonly SemaphoreSlim _sendGate = new(1, 1);

    private readonly List<(string Path, SignalChannelProcessor Processor)> _processors = new();
    private readonly SignalMixer _mixer = new();
    private readonly List<SignalMixInput> _signals = new();

    private volatile MotionFrame _currentFrame = MotionAxisHelper.CreateNeutralFrame();
    private volatile MotionFrame _manualFrame = MotionAxisHelper.CreateNeutralFrame();
    private volatile bool _manualOverrideEnabled;
    private volatile RuntimeInputMode _inputMode = RuntimeInputMode.Manual;
    private volatile bool _emergency;
    private volatile bool _inputActive = false;
    private volatile bool _disposed;
    private int _oscRefreshQueued;
    private readonly Dictionary<string, SpsDepthEstimator> _spsDepth = new();
    private readonly System.Threading.Timer _watchdog;
    private long _activationTimestamp;
    private long _generation;
    private bool _patchWorkerRunning;
    private (MotionPatch Patch, string Source, TCodeCommandMode? Mode, int? Value, long Generation)? _pendingPatch;
    private volatile bool _gateClosed;
    private bool _gateStopSent;
    private volatile bool _forceNextFrame = true;
    public bool IsGateClosed => _gateClosed;
    public bool CanSend => !_disposed && !_emergency && _inputActive && !_gateClosed;
    private long _lastEventTimestampMs = Environment.TickCount64;

    public MotionFrame LastCommand => _currentFrame;
    public MotionFrame ManualOverrideCommand => _manualFrame;
    public bool ManualOverrideEnabled => _manualOverrideEnabled;
    public RuntimeInputMode CurrentInputMode => _inputMode;
    public bool IsEmergency => _emergency;
    public bool InputActive => _inputActive;

    public event Action<string>? OnLog;
    public event Action<string>? OnDebugLog;
    public event Action? StateChanged;

    public MotionRuntime(
        AppConfig config,
        OscParameterStore store,
        OscInputReceiver oscReceiver,
        IntifaceOutputClient? intifaceOutput = null,
        TCodeSerialOutput? serialOutput = null,
        TCodeUdpOutput? udpOutput = null,
        TCodeTcpOutput? tcpOutput = null,
        MotionRecorder? recorder = null,
        FunscriptPlayer? scriptPlayer = null,
        Func<MotionFrame, Task>? sendOutputsAsync = null,
        Func<Task>? emergencyStopAsync = null,
        Func<string?>? preferredOscSourceKeyProvider = null)
    {
        _config = config;
        _store = store;
        _oscReceiver = oscReceiver;
        _intifaceOutput = intifaceOutput;
        _serialOutput = serialOutput;
        _udpOutput = udpOutput;
        _tcpOutput = tcpOutput;
        _recorder = recorder;
        _scriptPlayer = scriptPlayer ?? new FunscriptPlayer();
        _sendOutputsAsync = sendOutputsAsync;
        _emergencyStopAsync = emergencyStopAsync;
        _preferredOscSourceKeyProvider = preferredOscSourceKeyProvider;

        _watchdog = new System.Threading.Timer(_ => CheckInputTimeout(), null, 500, 500);
        RebuildProcessors();

        _store.OnSetWithSource += HandleOscValueChanged;
        _oscReceiver.OnAvatarChange += HandleAvatarChanged;
        _scriptPlayer.OnFrame += HandleScriptFrame;
        _scriptPlayer.OnStateChanged += HandleScriptStateChanged;
    }

    public void RebuildProcessors()
    {
        lock (_sync)
        {
            _processors.Clear();
            foreach (var mapping in _config.Signals)
            {
                if (string.IsNullOrWhiteSpace(mapping.OscPath))
                    continue;
                _processors.Add((mapping.OscPath, new SignalChannelProcessor(mapping)));
            }
        }

        if (!_disposed && _inputMode == RuntimeInputMode.Osc && _inputActive && !_emergency)
            QueueOscRefresh();
        else
            NotifyStateChanged();
    }

    public void EmergencyStop()
    {
        if (_emergency)
            return;

        _emergency = true;
        _forceNextFrame = true;
        _inputActive = false;
        Interlocked.Increment(ref _generation);
        lock (_sync) _pendingPatch = null;
        _scriptPlayer.Pause();
        NotifyStateChanged();
        _ = SendEmergencyAsync();
    }

    public void ClearEmergency()
    {
        if (!_emergency)
            return;

        _emergency = false;
        NotifyStateChanged();
        // Clearing emergency never resumes motion; input must be explicitly activated.
    }

    public void SetManualOverride(MotionFrame frame)
    {
        _manualFrame = NormalizeManualFrame(frame);
        _manualOverrideEnabled = true;
        OnLog?.Invoke("[Manual] Pose updated.");
        NotifyStateChanged();

        if (_inputMode == RuntimeInputMode.Manual && _inputActive && !_emergency)
            _ = ApplyManualOverrideAsync("Manual");
    }

    public void ClearManualOverride()
    {
        _manualOverrideEnabled = false;
        OnLog?.Invoke("[Manual] Override disabled (baseline preserved).");
        NotifyStateChanged();
    }

    public void SetInputMode(RuntimeInputMode mode)
    {
        if (_inputMode == mode)
            return;

        Interlocked.Increment(ref _generation);
        _gateClosed = false;
        _inputMode = mode;
        _forceNextFrame = true;
        OnLog?.Invoke($"[Input] Mode switched to {mode}.");
        NotifyStateChanged();

        if (mode != RuntimeInputMode.Script)
            _scriptPlayer.Pause();

        if (_emergency || !_inputActive)
            return;

        switch (mode)
        {
            case RuntimeInputMode.Manual when _manualOverrideEnabled:
                _ = ApplyManualOverrideAsync("ManualMode");
                break;
            case RuntimeInputMode.Osc:
                QueueOscRefresh();
                break;
            case RuntimeInputMode.Script:
            {
                var snapshot = _scriptPlayer.GetSnapshot();
                if (snapshot.Loaded)
                    _ = ApplyScriptPatchAsync(snapshot.CurrentL0, "ScriptMode");
                break;
            }
        }
    }

    public void SetInputActive(bool active)
    {
        if (active && _emergency) return;
        if (_inputActive == active)
            return;

        Interlocked.Increment(ref _generation);
        _activationTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        _inputActive = active;
        _forceNextFrame = true;
        if (!active) { lock (_sync) _pendingPatch = null; _scriptPlayer.Pause(); _ = SendEmergencyAsync(); }
        OnLog?.Invoke($"[Input] {(active ? "Active" : "Inactive")}.");
        NotifyStateChanged();

        if (!active || _emergency)
            return;

        switch (_inputMode)
        {
            case RuntimeInputMode.Osc:
                QueueOscRefresh();
                break;
            case RuntimeInputMode.Manual when _manualOverrideEnabled:
                _ = ApplyManualOverrideAsync("ManualActive");
                break;
            case RuntimeInputMode.Script:
            {
                var snapshot = _scriptPlayer.GetSnapshot();
                if (snapshot.Loaded)
                    _ = ApplyScriptPatchAsync(snapshot.CurrentL0, "ScriptActive");
                break;
            }
        }
    }

    private void HandleOscValueChanged(string path, OscValue __, OscSource ___)
    {
        if (_disposed || _inputMode != RuntimeInputMode.Osc || !_inputActive || _emergency)
            return;

        if (!HasMatchingOscProcessor(path))
            return;

        QueueOscRefresh();
    }

    private bool HasMatchingOscProcessor(string oscPath)
    {
        if (string.IsNullOrWhiteSpace(oscPath))
            return false;

        lock (_sync)
        {
            foreach (var (pattern, _) in _processors)
            {
                if (OscParameterStore.MatchesPathPattern(pattern, oscPath))
                    return true;
            }
        }

        return false;
    }

    private void HandleAvatarChanged()
    {
        lock (_sync)
        {
            foreach (var (_, processor) in _processors)
                processor.Reset();
        }

        lock (_sync) _spsDepth.Clear();
        if (_inputMode == RuntimeInputMode.Osc && _inputActive) EmergencyStop();
        OnLog?.Invoke("[MotionRuntime] Avatar changed — signal processors reset; reactivate input when ready.");
        NotifyStateChanged();
    }

    private void HandleScriptFrame(float l0)
    {
        if (_disposed || _inputMode != RuntimeInputMode.Script || !_inputActive || _emergency)
            return;

        _ = ApplyScriptPatchAsync(l0, "ScriptFrame");
    }

    private void HandleScriptStateChanged() => NotifyStateChanged();

    private void QueueOscRefresh()
    {
        if (_disposed)
            return;

        if (Interlocked.Exchange(ref _oscRefreshQueued, 1) != 0)
            return;

        _ = ProcessQueuedOscRefreshAsync();
    }

    private async Task ProcessQueuedOscRefreshAsync()
    {
        await _sendGate.WaitAsync().ConfigureAwait(false);
        try
        {
            Interlocked.Exchange(ref _oscRefreshQueued, 0);

            if (_disposed)
                return;

            NotifyStateChanged();

            if (_inputMode != RuntimeInputMode.Osc || !_inputActive || _emergency)
                return;

            var patch = BuildOscPatch();
            if (_gateClosed)
            {
                _forceNextFrame = true;
                if (!_gateStopSent && _emergencyStopAsync is not null) await _emergencyStopAsync();
                _gateStopSent = true;
                return;
            }
            _gateStopSent = false;
            if (patch.IsEmpty)
                return;

            await ApplyPatchCoreAsync(patch, "OSC").ConfigureAwait(false);
        }
        finally
        {
            _sendGate.Release();
        }

        if (Interlocked.CompareExchange(ref _oscRefreshQueued, 0, 1) == 1)
            _ = ProcessQueuedOscRefreshAsync();
    }

    private MotionPatch BuildOscPatch()
    {
        _signals.Clear();
        var preferredSourceKey = _preferredOscSourceKeyProvider?.Invoke();
        List<(string Path, SignalChannelProcessor Processor)> processors;

        lock (_sync)
            processors = new List<(string Path, SignalChannelProcessor Processor)>(_processors);

        var gateOpen = true;
        float? depthOverride = null;
        foreach (var (path, processor) in processors)
        {
            var thisGateOpen = false;
            foreach (var matched in _store.MatchingEntries(path, preferredSourceKey))
            {
                var entry = matched.Entry;
                if (_config.Osc.InputTimeoutMs > 0 && DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - entry.TimestampMs > _config.Osc.InputTimeoutMs) continue;
                var rawValue = entry.Value.AsFloat();
                if (processor.Mapping.SourceMode == "SpsSocketDepth")
                {
                    if (!matched.Path.EndsWith("NewRoot", StringComparison.Ordinal)) continue;
                    var tipPath = matched.Path[..^7] + "NewTip";
                    if (!_store.TryGetLatest(tipPath, entry.Source.Key, out var tip)) continue;
                    // OSC can be delta-only: a saturated tip may legitimately remain
                    // unchanged while root proximity keeps updating. Identity, not
                    // timestamp proximity, determines whether this is the same pair.
                    var key = entry.Source.Key + "|" + matched.Path;
                    lock (_sync)
                    {
                        if (!_spsDepth.TryGetValue(key, out var estimator))
                        {
                            if (_spsDepth.Count >= 4096) continue;
                            _spsDepth[key] = estimator = new SpsDepthEstimator();
                        }
                        rawValue = estimator.Process(rawValue, tip.Value.AsFloat());
                    }
                }
                var sample = processor.ProcessSample(rawValue);
                if (processor.Mapping.Role == SignalRole.GateEnable) { thisGateOpen |= sample.Output > .5f; continue; }
                if (processor.Mapping.Role == SignalRole.DepthOverride) { depthOverride = Math.Max(depthOverride ?? 0, sample.Output); continue; }
                _signals.Add(new SignalMixInput(processor.Mapping.Role, sample.Output, sample.Normalized));
            }
            if (processor.Mapping.Role == SignalRole.GateEnable) gateOpen &= thisGateOpen;
        }
        _gateClosed = !gateOpen;
        if (depthOverride.HasValue)
        {
            _signals.RemoveAll(s => s.Role == SignalRole.Depth);
            _signals.Add(new SignalMixInput(SignalRole.Depth, depthOverride.Value, 1));
        }

        var patch = _mixer.FusePatch(_signals);
        if (_signals.Count > 0)
            OnDebugLog?.Invoke($"[Signal/Fuse] {(patch.IsEmpty ? "<empty>" : FormatPatch(patch))}");
        return patch;
    }

    private Task ApplyScriptPatchAsync(float l0, string source)
    {
        var patch = new MotionPatch();
        patch.Set(MotionAxis.L0, l0);
        return ApplyPatchAsync(patch, source, requestedCommandMode: TCodeCommandMode.None);
    }

    private Task ApplyManualOverrideAsync(string source)
    {
        return ApplyPatchAsync(
            MotionAxisHelper.CreatePatchFromFrame(_manualFrame),
            source,
            requestedCommandMode: _manualFrame.RequestedCommandMode,
            requestedMotionValue: _manualFrame.RequestedMotionValue);
    }

    private Task ApplyPatchAsync(MotionPatch patch, string source, TCodeCommandMode? requestedCommandMode = null, int? requestedMotionValue = null)
    {
        lock (_sync)
        {
            if (!CanSend) return Task.CompletedTask;
            _pendingPatch = (patch, source, requestedCommandMode, requestedMotionValue, Interlocked.Read(ref _generation));
            if (_patchWorkerRunning) return Task.CompletedTask;
            _patchWorkerRunning = true;
        }
        return Task.Run(async () =>
        {
            while (true)
            {
                await _sendGate.WaitAsync().ConfigureAwait(false);
                try
                {
                    (MotionPatch Patch, string Source, TCodeCommandMode? Mode, int? Value, long Generation)? pending;
                    lock (_sync)
                    {
                        pending = _pendingPatch; _pendingPatch = null;
                        if (pending is null) { _patchWorkerRunning = false; return; }
                    }
                    var request = pending.Value;
                    if (CanSend && request.Generation == Interlocked.Read(ref _generation))
                        await ApplyPatchCoreAsync(request.Patch, request.Source, request.Mode, request.Value);
                }
                catch (Exception ex) { OnLog?.Invoke($"[MotionRuntime] {ex.Message}"); }
                finally { _sendGate.Release(); }
            }
        });
    }

    private void CheckInputTimeout()
    {
        if (_disposed || _inputMode != RuntimeInputMode.Osc || !_inputActive || _emergency || _config.Osc.InputTimeoutMs <= 0) return;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        string[] paths;
        lock (_sync) paths = _processors.Select(p => p.Path).ToArray();
        if (paths.Length == 0) return;
        var source = _preferredOscSourceKeyProvider?.Invoke();
        var last = paths.SelectMany(p => _store.MatchingEntries(p, source)).Select(e => e.Entry.TimestampMs).DefaultIfEmpty(_activationTimestamp).Max();
        if (now - Math.Max(last, _activationTimestamp) <= _config.Osc.InputTimeoutMs) return;
        OnLog?.Invoke("[MotionRuntime] OSC input timeout; emergency stop.");
        EmergencyStop();
    }

    private async Task ApplyPatchCoreAsync(MotionPatch patch, string source, TCodeCommandMode? requestedCommandMode = null, int? requestedMotionValue = null)
    {
        if (!CanSend) return;
        var elapsedMs = ConsumeElapsedMs();
        var deltaMs = requestedCommandMode == TCodeCommandMode.Interval && requestedMotionValue is > 0
            ? requestedMotionValue.Value
            : elapsedMs;
        var previous = _currentFrame;
        var motionRequestChanged = previous.RequestedCommandMode != requestedCommandMode
            || previous.RequestedMotionValue != requestedMotionValue;
        var patched = patch.IsEmpty
            ? previous with { DeltaMs = deltaMs }
            : MotionAxisHelper.ApplyPatch(previous, patch, deltaMs);
        var next = patched with
        {
            RequestedCommandMode = requestedCommandMode,
            RequestedMotionValue = requestedMotionValue,
        };

        var motionLabel = requestedCommandMode.HasValue
            ? $"requested mode={requestedCommandMode.Value} value={requestedMotionValue?.ToString() ?? "default"}"
            : "auto";
        OnDebugLog?.Invoke($"[MotionRuntime/{source}/Patch] delta={deltaMs:F0}ms motion={motionLabel} {(patch.IsEmpty ? "<empty>" : FormatPatch(patch))}");

        _currentFrame = next;

        if (!_forceNextFrame && !motionRequestChanged && MotionAxisHelper.AreEqual(previous, next))
        {
            if (!patch.IsEmpty)
                OnDebugLog?.Invoke($"[MotionRuntime/{source}] Patch applied but produced no effective pose change.");
            NotifyStateChanged();
            return;
        }

        OnDebugLog?.Invoke($"[MotionRuntime/{source}] L0={next.L0:F3} R0={next.R0:F3} R1={next.R1:F3} R2={next.R2:F3} L1={next.L1:F3} L2={next.L2:F3} V0={next.V0:F3} V1={next.V1:F3} V2={next.V2:F3} A0={next.A0:F3} A1={next.A1:F3} A2={next.A2:F3}");

        _recorder?.Push(next);
        _forceNextFrame = false;
        await SendOutputsAsync(next).ConfigureAwait(false);
        NotifyStateChanged();
    }

    private async Task ResendCurrentPoseAsync()
    {
        await _sendGate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_disposed || _emergency || !_inputActive)
                return;

            var isManual = _inputMode == RuntimeInputMode.Manual && _manualOverrideEnabled;
            var current = _currentFrame with
            {
                DeltaMs = isManual && _manualFrame.RequestedCommandMode == TCodeCommandMode.Interval
                    ? (_manualFrame.RequestedMotionValue ?? ManualDefaultIntervalMs)
                    : ConsumeElapsedMs(),
                RequestedCommandMode = isManual ? _manualFrame.RequestedCommandMode : _currentFrame.RequestedCommandMode,
                RequestedMotionValue = isManual ? _manualFrame.RequestedMotionValue : _currentFrame.RequestedMotionValue,
            };
            _currentFrame = current;
            OnDebugLog?.Invoke("[MotionRuntime/Resume] Re-sending current pose after state transition.");
            await SendOutputsAsync(current).ConfigureAwait(false);
            NotifyStateChanged();
        }
        finally
        {
            _sendGate.Release();
        }
    }

    private async Task SendOutputsAsync(MotionFrame frame)
    {
        if (!CanSend) return;
        if (_sendOutputsAsync is not null)
        {
            try
            {
                await _sendOutputsAsync(frame).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                OnLog?.Invoke($"[Outputs] {ex.Message}");
            }
            return;
        }

        if (_config.Intiface.Enabled && _intifaceOutput is { IsConnected: true })
        {
            try
            {
                await _intifaceOutput.SendAsync(frame).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                OnLog?.Invoke($"[Intiface] {ex.Message}");
            }
        }

        if (_config.TCode.Enabled)
            _serialOutput?.Send(frame);
        if (_config.UdpTCode.Enabled)
            _udpOutput?.Send(frame);
        if (_config.TcpTCode.Enabled)
            _tcpOutput?.Send(frame);
    }

    private async Task SendEmergencyAsync()
    {
        await _sendGate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_emergencyStopAsync is not null)
            {
                try
                {
                    await _emergencyStopAsync().ConfigureAwait(false);
                }
                catch
                {
                }
                return;
            }

            _serialOutput?.EmergencyStop();
            _udpOutput?.EmergencyStop();
            _tcpOutput?.EmergencyStop();
            if (_intifaceOutput is { IsConnected: true })
            {
                try
                {
                    await _intifaceOutput.StopAllAsync().ConfigureAwait(false);
                }
                catch
                {
                }
            }
        }
        finally
        {
            _sendGate.Release();
            NotifyStateChanged();
        }
    }

    private double ConsumeElapsedMs()
    {
        var now = Environment.TickCount64;
        var previous = Interlocked.Exchange(ref _lastEventTimestampMs, now);
        var delta = now - previous;
        return Math.Max(delta, 1L);
    }

    private static string FormatPatch(MotionPatch patch)
    {
        var sb = new StringBuilder();
        foreach (var axis in MotionAxisHelper.All)
        {
            if (!patch.TryGetValue(axis, out var value))
                continue;

            if (sb.Length > 0)
                sb.Append(' ');

            sb.Append(MotionAxisHelper.Token(axis));
            sb.Append('=');
            sb.Append(value.ToString("F3"));
        }

        return sb.Length == 0 ? "<empty>" : sb.ToString();
    }

    private static MotionFrame NormalizeManualFrame(MotionFrame frame)
    {
        if (!frame.RequestedCommandMode.HasValue)
        {
            var requestedSpeed = frame.RequestedMotionValue is > 0 ? Math.Clamp(frame.RequestedMotionValue.Value, 1, 999) : ManualDefaultSpeed;
            return frame with
            {
                DeltaMs = 1000,
                RequestedCommandMode = null,
                RequestedMotionValue = requestedSpeed,
            };
        }

        var requestedCommandMode = frame.RequestedCommandMode.Value;
        int? requestedMotionValue = requestedCommandMode switch
        {
            TCodeCommandMode.None => null,
            TCodeCommandMode.Interval => frame.RequestedMotionValue is > 0 ? Math.Clamp(frame.RequestedMotionValue.Value, 1, ManualIntervalMaxMs) : ManualDefaultIntervalMs,
            _ => frame.RequestedMotionValue is > 0 ? Math.Clamp(frame.RequestedMotionValue.Value, 1, 999) : ManualDefaultSpeed,
        };

        return frame with
        {
            DeltaMs = requestedCommandMode == TCodeCommandMode.Interval ? requestedMotionValue ?? ManualDefaultIntervalMs : 1000,
            RequestedCommandMode = requestedCommandMode,
            RequestedMotionValue = requestedMotionValue,
        };
    }

    private void NotifyStateChanged()
    {
        if (_disposed)
            return;
        StateChanged?.Invoke();
    }

    public void Dispose()
    {
        if (_disposed)
            return;

        _disposed = true;
        _watchdog.Dispose();
        lock (_sync) _pendingPatch = null;
        _store.OnSetWithSource -= HandleOscValueChanged;
        _oscReceiver.OnAvatarChange -= HandleAvatarChanged;
        _scriptPlayer.OnFrame -= HandleScriptFrame;
        _scriptPlayer.OnStateChanged -= HandleScriptStateChanged;
        // Pending workers may still release this managed semaphore after cancellation.
    }
}
