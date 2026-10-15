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
    private readonly object _poseSync = new();
    private long _poseRevision = -1;
    private string? _poseSource;
    private PoseObservation[] _poseObservations = [];
    private volatile bool _poseBlocked;
    private int _poseRefreshPending;
    private volatile bool _usesPose;
    private volatile bool _usesSpsDepth;
    private string? _rollPoseKey;
    private ContinuousAngle _continuousRoll = new();
    public bool PoseBlocked => _poseBlocked;
    public string? ActivePoseKey { get; private set; }
    public bool IsGateClosed => _gateClosed;
    public bool CanSend => !_disposed && !_emergency && _inputActive && !_gateClosed && !_poseBlocked;

    public PoseObservation[] GetPoseObservations()
    {
        lock (_poseSync)
        {
            var source = _preferredOscSourceKeyProvider?.Invoke();
            var revision = _store.Revision;
            if (revision != _poseRevision || source != _poseSource)
            {
                _poseObservations = PoseReconstruction.Observe(_store.SnapshotEntries(), source);
                _poseRevision = revision; _poseSource = source;
            }
            return _config.Osc.InputTimeoutMs<=0 ? _poseObservations : _poseObservations.Select(p=>IsGeometryFresh(p.TimestampMs)
                ? p : p with {Valid=false,Engaged=false,Reason="坐标数据已超时，等待新的几何采样"}).ToArray();
        }
    }
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
        ActivePoseKey = null;
        _rollPoseKey = null;
        _continuousRoll = new();
        _usesPose = _config.Signals.Any(s => s.SourceMode is "SensaPose" or "SensaPoint");
        _usesSpsDepth = _config.Signals.Any(s => s.SourceMode == "SpsSocketDepth");
        _poseBlocked = _inputMode == RuntimeInputMode.Osc && _usesPose;

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
        _poseBlocked = mode == RuntimeInputMode.Osc && _usesPose;
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
        if (active && _inputMode == RuntimeInputMode.Osc && _usesPose) _poseBlocked = true;
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

        if (_usesPose || _usesSpsDepth)
        {
            // Receivers arrive as independent OSC messages. Coalesce a short burst before fitting.
            if (Interlocked.Exchange(ref _poseRefreshPending, 1) != 0) return;
            _ = Task.Run(async () =>
            {
                await Task.Delay(30);
                Interlocked.Exchange(ref _poseRefreshPending, 0);
                if (!_disposed) QueueOscRefresh();
            });
        }
        else QueueOscRefresh();
    }

    private bool HasMatchingOscProcessor(string oscPath)
    {
        if (string.IsNullOrWhiteSpace(oscPath))
            return false;

        lock (_sync)
        {
            if (_processors.Any(p=>p.Processor.Mapping.SourceMode=="SensaPoint")
                && (oscPath.StartsWith(UnityBox.Sensa.SensaPoseProtocol.PointPrefix+"/",StringComparison.Ordinal)
                    || oscPath.StartsWith(UnityBox.Sensa.SensaPoseProtocol.HandlePrefix+"/",StringComparison.Ordinal))) return true;
            foreach (var (pattern, processor) in _processors)
            {
                if (OscParameterStore.MatchesPathPattern(pattern, oscPath))
                    return true;
                if (processor.Mapping.SourceMode == "SpsSocketDepth" && oscPath.EndsWith("NewTip", StringComparison.Ordinal)
                    && OscParameterStore.MatchesPathPattern(pattern, oscPath[..^6] + "NewRoot")) return true;
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
        _rollPoseKey = null;
        _continuousRoll = new();
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
            if (_gateClosed || _poseBlocked)
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
        var poseMappings = processors.Where(p => p.Processor.Mapping.SourceMode == "SensaPose").ToArray();
        var pointMappings = processors.Where(p=>p.Processor.Mapping.SourceMode=="SensaPoint").ToArray();
        SpsPositionTracking.Observation? chosenPoint=null;
        if(pointMappings.Length>0){var points=SpsPositionTracking.Observe(_store.SnapshotEntries(),preferredSourceKey)
            .Where(p=>p.IsLocalPoint && pointMappings.Any(m=>p.Matches(m.Path))).ToArray();
            if(points.Length==1 && points[0].Valid && IsGeometryFresh(points[0].TimestampMs))chosenPoint=points[0];}
        var poseRoles = poseMappings.Concat(pointMappings).Select(p => p.Processor.Mapping.Role).ToHashSet();
        PoseObservation? chosenPose = null;
        if (poseMappings.Length > 0)
        {
            var observations = GetPoseObservations().Where(p => poseMappings.Any(m => p.Matches(m.Path)) && IsGeometryFresh(p.TimestampMs)).ToArray();
            // There is no sender identity in Contact OSC values. Never mix coordinate components across sources/rigs.
            if (!string.IsNullOrEmpty(preferredSourceKey) || observations.Select(p => p.SourceKey).Distinct().Count() <= 1)
            {
                chosenPose = observations.Where(p => p.Valid && p.Engaged).OrderByDescending(p => p.Depth).ThenBy(p => p.Key, StringComparer.Ordinal).FirstOrDefault();
                var previous = observations.FirstOrDefault(p => p.Key == ActivePoseKey && p.Valid && p.Engaged);
                if (previous is not null && chosenPose is not null && chosenPose.Depth - previous.Depth < .05) chosenPose = previous;
            }
        }
        _poseBlocked = poseMappings.Length > 0 && chosenPose is null || pointMappings.Length>0 && chosenPoint is null;
        ActivePoseKey = chosenPose?.Key;
        if (chosenPose is not null && _rollPoseKey != chosenPose.Key) { _rollPoseKey = chosenPose.Key; _continuousRoll = new(); }
        var roll = chosenPose is null ? 0 : _continuousRoll.Update(chosenPose.Roll);
        foreach (var (path, processor) in processors)
        {
            if(processor.Mapping.SourceMode=="SensaPoint") {
                if(chosenPoint!=null && chosenPoint.Matches(path)){var pointSample=processor.ProcessSample(chosenPoint.Metric(processor.Mapping.PointMetric));_signals.Add(new SignalMixInput(processor.Mapping.Role,pointSample.Output,pointSample.Normalized));}
                continue;
            }
            if (processor.Mapping.SourceMode == "SensaPose")
            {
                if (chosenPose is not null && chosenPose.Matches(path))
                {
                    var sample = processor.ProcessSample(processor.Mapping.PoseMetric == PoseMetric.Roll ? roll : chosenPose.GetMetric(processor.Mapping.PoseMetric));
                    _signals.Add(new SignalMixInput(processor.Mapping.Role, sample.Output, sample.Normalized));
                }
                continue;
            }
            if (poseRoles.Contains(processor.Mapping.Role)
                || processor.Mapping.Role == SignalRole.DepthOverride && poseRoles.Contains(SignalRole.Depth)) continue;
            var thisGateOpen = false;
            foreach (var matched in _store.MatchingEntries(path, preferredSourceKey))
            {
                var entry = matched.Entry;
                var rawValue = entry.Value.AsFloat();
                if (processor.Mapping.SourceMode == "SpsSocketDepth")
                {
                    if (!TryGetSpsTip(matched, out var tip, out var timestamp) || !IsGeometryFresh(timestamp)) continue;
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
                        rawValue = estimator.Process(rawValue, tip.Value.AsFloat(), tip.Sequence);
                    }
                }
                else if (!IsGeometryFresh(entry.TimestampMs)) continue;
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

    private bool IsGeometryFresh(long timestampMs) => _config.Osc.InputTimeoutMs <= 0
        || DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - timestampMs <= _config.Osc.InputTimeoutMs;

    private bool TryGetSpsTip(OscParameterStore.SnapshotEntry root, out OscParameterStore.Entry tip, out long timestamp)
    {
        tip = default; timestamp = 0;
        if (!root.Path.EndsWith("NewRoot", StringComparison.Ordinal)
            || !_store.TryGetLatest(root.Path[..^7] + "NewTip", root.Entry.Source.Key, out tip)) return false;
        // Either coordinate can remain unchanged in delta-only OSC. A different
        // socket, source or gate must never refresh this pair's timeout.
        timestamp = Math.Max(root.Entry.TimestampMs, tip.TimestampMs);
        return true;
    }

    private IEnumerable<long> ScalarInputTimestamps((string Path, string Mode, SignalRole Role)[] mappings, string? source)
    {
        foreach (var mapping in mappings.Where(m => m.Role != SignalRole.GateEnable))
        foreach (var matched in _store.MatchingEntries(mapping.Path, source))
        {
            if (mapping.Mode == "SpsSocketDepth")
            {
                if (TryGetSpsTip(matched, out _, out var timestamp)) yield return timestamp;
            }
            else yield return matched.Entry.TimestampMs;
        }
    }

    private void CheckInputTimeout()
    {
        if (_disposed || _inputMode != RuntimeInputMode.Osc || !_inputActive || _emergency || _config.Osc.InputTimeoutMs <= 0) return;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        (string Path,string Mode,SignalRole Role)[] mappings;
        lock (_sync) mappings = _processors.Select(p => (p.Path,p.Processor.Mapping.SourceMode,p.Processor.Mapping.Role)).ToArray();
        if (mappings.Length == 0) return;
        var source = _preferredOscSourceKeyProvider?.Invoke();
        var pointPaths=mappings.Where(m=>m.Mode=="SensaPoint").Select(m=>m.Path).ToArray();
        var posePaths=mappings.Where(m=>m.Mode=="SensaPose").Select(m=>m.Path).ToArray();
        // Metadata or a separate gate must not keep a frozen geometric input alive.
        // Use the newest geometric sample, since OSC may omit unchanged coordinates.
        var timestamps=pointPaths.Length>0
            ? SpsPositionTracking.Observe(_store.SnapshotEntries(),source).Where(p=>p.IsLocalPoint && pointPaths.Any(p.Matches)).Select(p=>p.TimestampMs)
            : posePaths.Length>0
                ? GetPoseObservations().Where(p=>posePaths.Any(p.Matches)).Select(p=>p.TimestampMs)
                : ScalarInputTimestamps(mappings, source);
        var last=timestamps.DefaultIfEmpty(_activationTimestamp).Max();
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
