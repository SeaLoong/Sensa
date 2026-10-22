using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Input.Script;
using Sensa.Motion;
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
    private readonly IMotionOutput _output;
    private readonly TimeProvider _timeProvider;
    private readonly CancellationTokenSource _lifetime = new();
    private readonly bool _ownsScriptPlayer;
    private readonly MotionRecorder? _recorder;
    private readonly FunscriptPlayer _scriptPlayer;
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
    private volatile bool _scriptOutputStopped;
    private volatile bool _disposed;
    private int _oscRefreshQueued;
    private readonly Dictionary<(string Source, string Root), SpsDepthEstimator> _spsDepth = new();
    private readonly ITimer _watchdog;
    private long _activationTimestamp;
    private long _generation;
    private long _appliedGeneration = -1;
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
    private ComputedSignalEvaluator _computedEvaluator = new([]);
    private ComputedSignalInputConfig[] _computedInputs = [];
    private HashSet<string> _computedExactPaths = new(StringComparer.Ordinal);
    private (string Pattern, string Prefix)[] _computedPatterns = [];
    private bool _usesComputedSpatial;
    private volatile bool _usesComputed;
    private volatile bool _computedInputBlocked;
    private string _computedInputBlockedReason = "";
    private string? _rollPoseKey;
    private ContinuousAngle _continuousRoll = new();
    public bool PoseBlocked => _poseBlocked;
    public bool ComputedInputBlocked => _inputMode == RuntimeInputMode.Osc && _computedInputBlocked;
    public string ComputedInputBlockedReason => ComputedInputBlocked ? _computedInputBlockedReason : "";
    public int SpatialSampleMaxAgeMs => _config.Osc.InputTimeoutMs > 0 ? _config.Osc.InputTimeoutMs : UnityBox.Sensa.SensaPoseProtocol.MaximumSampleAgeMs;
    public string SpatialInputBlockedReason => _inputMode != RuntimeInputMode.Osc || !_usesPose ? ""
        : !_config.Osc.AllowExperimentalSpatialInput ? "实验 Contact 定位尚未启用 / Experimental Contact positioning is disabled"
        : _poseBlocked ? "等待完整且未过期的局部几何采样 / Waiting for complete, fresh local geometry" : "";
    public string SpatialInputStatus => _inputMode != RuntimeInputMode.Osc || !_usesPose ? ""
        : SpatialInputBlockedReason.Length > 0 ? SpatialInputBlockedReason
        : "实验局部估计；非世界或网格位置 / Experimental local estimate; not world or mesh position";
    public string? ActivePoseKey { get; private set; }
    public bool IsGateClosed => _gateClosed;
    public bool CanSend => !_disposed && !_emergency && _inputActive && !_gateClosed && !_poseBlocked && !ComputedInputBlocked
        && (_inputMode != RuntimeInputMode.Script || !_scriptOutputStopped);

    public PoseObservation[] GetPoseObservations()
    {
        lock (_poseSync)
        {
            var source = _preferredOscSourceKeyProvider?.Invoke();
            var revision = _store.Revision;
            if (revision != _poseRevision || source != _poseSource)
            {
                _poseObservations = PoseReconstruction.Observe(_store.SnapshotEntries(UnityBox.Sensa.SensaPoseProtocol.Prefix + "/", source), source);
                _poseRevision = revision; _poseSource = source;
            }
            return _poseObservations.Select(p=>IsSpatialGeometryFresh(p.TimestampMs)
                ? p : p with {Valid=false,Engaged=false,Reason="部分坐标已超时 / A contributing coordinate has expired"}).ToArray();
        }
    }

    /// <summary>Evaluate saved definitions once against one source-filtered snapshot.
    /// 预览与动作使用同一求值器；每次读取只使用一份采样快照。</summary>
    public IReadOnlyDictionary<string, ComputedSignalSample> GetComputedSignalResults(
        OscParameterStore.SnapshotEntry[]? snapshot = null, string? sourceKey = null)
    {
        if (_config.ComputedSignals.Count == 0)
            return new Dictionary<string, ComputedSignalSample>(StringComparer.Ordinal);
        ComputedSignalEvaluator evaluator;
        lock (_sync) evaluator = _computedEvaluator;
        var now = _timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        var resolver = new ComputedSignalResolver(snapshot ?? _store.SnapshotEntries(),
            sourceKey ?? _preferredOscSourceKeyProvider?.Invoke(), now, SpatialSampleMaxAgeMs,
            _config.Osc.AllowExperimentalSpatialInput, _config.Osc.InputTimeoutMs);
        return evaluator.Evaluate(now, resolver.Resolve);
    }
    private long _lastEventTimestamp;

    public MotionFrame LastCommand => _currentFrame;
    public MotionFrame ManualOverrideCommand => _manualFrame;
    public bool ManualOverrideEnabled => _manualOverrideEnabled;
    public RuntimeInputMode CurrentInputMode => _inputMode;
    public bool IsEmergency => _emergency;
    public bool InputActive => _inputActive;

    /// <summary>Refresh an admitted target, ordered with dispatch and stops. / 按发送与停止顺序刷新本代已接纳目标。</summary>
    public async Task RefreshCurrentTargetAsync(Func<MotionFrame, Task> refresh)
    {
        ArgumentNullException.ThrowIfNull(refresh);
        await _sendGate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (!CanSend || _appliedGeneration != Interlocked.Read(ref _generation)) return;
            await refresh(_currentFrame).ConfigureAwait(false);
        }
        finally { _sendGate.Release(); }
    }

    public event Action<string>? OnLog;
    public event Action<string>? OnDebugLog;
    public event Action? StateChanged;

    public MotionRuntime(
        AppConfig config,
        OscParameterStore store,
        IMotionOutput output,
        MotionRecorder? recorder = null,
        FunscriptPlayer? scriptPlayer = null,
        Func<string?>? preferredOscSourceKeyProvider = null,
        TimeProvider? timeProvider = null)
    {
        _config = config;
        _store = store;
        _output = output ?? throw new ArgumentNullException(nameof(output));
        _timeProvider = timeProvider ?? store.Clock;
        _lastEventTimestamp = _timeProvider.GetTimestamp();
        _ownsScriptPlayer = scriptPlayer is null;
        _recorder = recorder;
        _scriptPlayer = scriptPlayer ?? new FunscriptPlayer(_timeProvider);
        _preferredOscSourceKeyProvider = preferredOscSourceKeyProvider;

        _watchdog = _timeProvider.CreateTimer(_ => CheckInputTimeout(), null,
            TimeSpan.FromMilliseconds(500), TimeSpan.FromMilliseconds(500));
        RebuildProcessors();

        _store.OnSetWithSource += HandleOscValueChanged;
        _store.AvatarChanged += HandleAvatarChanged;
        _scriptPlayer.OnStopped += HandleScriptStopped;
        _scriptPlayer.OnFrame += HandleScriptFrame;
        _scriptPlayer.OnStateChanged += HandleScriptStateChanged;
    }

    public void RebuildProcessors()
    {
        var spatialRoles = _config.Signals.Where(signal => signal.SourceMode is "SensaPoint" or "SensaPose")
            .Select(signal => signal.Role).ToHashSet();
        var computedMappings = _config.Signals.Where(signal => signal.SourceMode == "Computed"
            && !SpatialRoleTakesPriority(spatialRoles, signal)).ToArray();
        lock (_sync)
        {
            _spsDepth.Clear();
            _processors.Clear();
            _computedEvaluator = new(_config.ComputedSignals);
            foreach (var mapping in _config.Signals)
            {
                if (string.IsNullOrWhiteSpace(mapping.OscPath))
                    continue;
                _processors.Add((mapping.OscPath, new SignalChannelProcessor(mapping)));
            }
            _computedInputs = _computedEvaluator.GetRequiredInputs(computedMappings.Select(s => s.OscPath)).ToArray();
            var scalarPaths = _computedInputs.Where(input => input.SourceMode == "Direct")
                .Select(input => input.OscPath).Distinct(StringComparer.Ordinal).ToArray();
            _computedExactPaths = scalarPaths.Where(path => path.IndexOfAny(['*', ';', '\n']) < 0)
                .ToHashSet(StringComparer.Ordinal);
            _computedPatterns = scalarPaths.Where(path => path.IndexOfAny(['*', ';', '\n']) >= 0)
                .Select(path => (path, path.IndexOfAny([';', '\n']) >= 0 ? "" : path[..path.IndexOf('*')]))
                .ToArray();
            _usesComputedSpatial = _computedInputs.Any(input => input.SourceMode is "SensaPoint" or "SensaPose");
        }
        ActivePoseKey = null;
        _rollPoseKey = null;
        _continuousRoll = new();
        _usesPose = _config.Signals.Any(s => s.SourceMode is "SensaPose" or "SensaPoint")
            || _usesComputedSpatial;
        _usesComputed = computedMappings.Length > 0;
        _computedInputBlocked = _inputMode == RuntimeInputMode.Osc && _usesComputed;
        _computedInputBlockedReason = "等待计算输入 / Waiting for calculation inputs";
        _usesSpsDepth = _config.Signals.Any(s => s.SourceMode is "OgbDepth" or "OgbTouch" or "SpsSocketDepth");
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
        if (_inputMode == RuntimeInputMode.Manual)
            SetInputActive(false);
        OnLog?.Invoke("[Manual] Override disabled (baseline preserved).");
        NotifyStateChanged();
    }

    public void SetInputMode(RuntimeInputMode mode)
    {
        if (_inputMode == mode)
            return;

        SetInputActive(false);
        Interlocked.Increment(ref _generation);
        _gateClosed = false;
        _poseBlocked = mode == RuntimeInputMode.Osc && _usesPose;
        _computedInputBlocked = mode == RuntimeInputMode.Osc && _usesComputed;
        _inputMode = mode;
        _forceNextFrame = true;
        OnLog?.Invoke($"[Input] Mode switched to {mode}.");
        NotifyStateChanged();

        if (mode != RuntimeInputMode.Script)
            _scriptPlayer.Pause();

    }

    public void SetInputActive(bool active)
    {
        if (active && _emergency) return;
        if (_inputActive == active)
            return;

        Interlocked.Increment(ref _generation);
        _activationTimestamp = _timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        // No geometry was observed while disarmed: a different plug may now
        // occupy the same instance. / 未启用期间可能换了 Plug，重新估长。
        if (active && _inputMode == RuntimeInputMode.Osc) { lock (_sync) _spsDepth.Clear(); }
        if (active && _inputMode == RuntimeInputMode.Osc && _usesPose) _poseBlocked = true;
        if (active && _inputMode == RuntimeInputMode.Osc && _usesComputed) _computedInputBlocked = true;
        _inputActive = active;
        if (active && _inputMode == RuntimeInputMode.Script) _scriptOutputStopped = false;
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

        if (_usesPose || _usesSpsDepth || _usesComputed)
        {
            // Receivers arrive as independent OSC messages. Coalesce a short burst before fitting.
            if (Interlocked.Exchange(ref _poseRefreshPending, 1) != 0) return;
            _ = RefreshGeometryAsync();
        }
        else QueueOscRefresh();
    }

    private async Task RefreshGeometryAsync()
    {
        try
        {
            await Task.Delay(TimeSpan.FromMilliseconds(30), _timeProvider, _lifetime.Token);
            Interlocked.Exchange(ref _poseRefreshPending, 0);
            if (!_disposed) QueueOscRefresh();
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { }
    }

    private bool HasMatchingOscProcessor(string oscPath)
    {
        if (string.IsNullOrWhiteSpace(oscPath))
            return false;

        lock (_sync)
        {
            if (_computedExactPaths.Contains(oscPath)
                || _computedPatterns.Any(pattern => oscPath.StartsWith(pattern.Prefix, StringComparison.Ordinal)
                    && OscParameterStore.MatchesPathPattern(pattern.Pattern, oscPath))) return true;
            if (_usesComputedSpatial
                && (oscPath.StartsWith("Sensa/", StringComparison.Ordinal)
                    || oscPath.StartsWith(ShaderRootTracking.Prefix + "/", StringComparison.Ordinal))) return true;
            if (_processors.Any(p=>p.Processor.Mapping.SourceMode=="SensaPoint")
                && (oscPath.StartsWith(UnityBox.Sensa.SensaPoseProtocol.PointPrefix+"/",StringComparison.Ordinal)
                    || oscPath.StartsWith(UnityBox.Sensa.SensaPoseProtocol.HandlePrefix+"/",StringComparison.Ordinal)
                    || oscPath.StartsWith(UnityBox.Sensa.SensaFixedAnchorProtocol.Prefix+"/",StringComparison.Ordinal)
                    || oscPath.StartsWith(UnityBox.Sensa.SensaContactProtocol.Prefix+"/",StringComparison.Ordinal)
                    || oscPath.StartsWith(ShaderRootTracking.Prefix+"/",StringComparison.Ordinal))) return true;
            foreach (var (pattern, processor) in _processors)
            {
                if (OscParameterStore.MatchesPathPattern(pattern, oscPath))
                    return true;
                if (processor.Mapping.SourceMode == "OgbDepth"
                    && OgbDepthAddress.TryParse(oscPath, out var ogb)
                    && (OscParameterStore.MatchesPathPattern(pattern, ogb.LegacyPath)
                        || ogb.IsSocket && OscParameterStore.MatchesPathPattern(pattern, ogb.RootPath))) return true;
                if (processor.Mapping.SourceMode == "OgbTouch"
                    && OgbTouchAddress.TryParse(oscPath, out var touch)
                    && OscParameterStore.MatchesPathPattern(pattern, touch.ValuePath)) return true;
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
        OnLog?.Invoke("[MotionRuntime] Avatar changed; processors reset, reactivate when ready. / Avatar 已更换；处理器已复位，就绪后重新启用输入。");
        NotifyStateChanged();
    }

    private void HandleScriptFrame(float l0)
    {
        if (_disposed || _inputMode != RuntimeInputMode.Script || !_inputActive || _emergency)
            return;

        _scriptOutputStopped = false;
        _ = ApplyScriptPatchAsync(l0, "ScriptFrame");
    }

    private void HandleScriptStateChanged() => NotifyStateChanged();

    private void HandleScriptStopped()
    {
        if (_disposed || _inputMode != RuntimeInputMode.Script || !_inputActive || _emergency)
            return;
        _scriptOutputStopped = true;
        Interlocked.Increment(ref _generation);
        lock (_sync) _pendingPatch = null;
        _forceNextFrame = true;
        _ = SendEmergencyAsync();
    }

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
            if (_gateClosed || _poseBlocked || ComputedInputBlocked)
            {
                _forceNextFrame = true;
                if (!_gateStopSent) await StopOutputsAsync();
                _gateStopSent = true;
                NotifyStateChanged();
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
        var poseRoles = poseMappings.Concat(pointMappings).Select(p => p.Processor.Mapping.Role).ToHashSet();
        var computedMappings = processors.Where(p => p.Processor.Mapping.SourceMode == "Computed"
            && !SpatialRoleTakesPriority(poseRoles, p.Processor.Mapping)).ToArray();
        var computed = computedMappings.Length > 0 ? GetComputedSignalResults() : null;
        var invalidComputed = computedMappings.Select(mapping =>
            computed!.TryGetValue(mapping.Path, out var result) ? result
                : ComputedSignalSample.Invalid("请选择已保存的计算信号 / Select a saved computed signal"))
            .FirstOrDefault(result => !result.Valid);
        _computedInputBlocked = invalidComputed is not null;
        _computedInputBlockedReason = invalidComputed?.Reason ?? "";
        if ((poseMappings.Length > 0 || pointMappings.Length > 0) && !_config.Osc.AllowExperimentalSpatialInput)
        {
            _poseBlocked = true; ActivePoseKey = null;
            return new MotionPatch();
        }
        SpsPositionTracking.Observation? chosenPoint=null;
        if(pointMappings.Length>0){var points=SpsPositionTracking.Observe(_store.SnapshotEntries(), preferredSourceKey, SpatialSampleMaxAgeMs, _timeProvider)
            .Where(p=>p.IsMappablePoint && pointMappings.Any(m=>p.Matches(m.Path))).ToArray();
            if(points.Length==1 && points[0].Valid && IsSpatialGeometryFresh(points[0].TimestampMs)
                && pointMappings.All(mapping => points[0].SupportsMetric(mapping.Processor.Mapping.PointMetric)))chosenPoint=points[0];}
        PoseObservation? chosenPose = null;
        if (poseMappings.Length > 0)
        {
            var observations = GetPoseObservations().Where(p => poseMappings.Any(m => p.Matches(m.Path)) && IsSpatialGeometryFresh(p.TimestampMs)).ToArray();
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
            if (processor.Mapping.SourceMode == "Computed")
            {
                if (SpatialRoleTakesPriority(poseRoles, processor.Mapping)) continue;
                if (computed!.TryGetValue(path, out var result) && result.Valid && result.Value.HasValue)
                {
                    var sample = processor.ProcessSample(result.Value.Value);
                    if (processor.Mapping.Role == SignalRole.GateEnable) gateOpen &= sample.Output > .5f;
                    else if (processor.Mapping.Role == SignalRole.DepthOverride)
                        depthOverride = Math.Max(depthOverride ?? 0, sample.Output);
                    else _signals.Add(new SignalMixInput(processor.Mapping.Role, sample.Output, sample.Normalized));
                }
                continue;
            }
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
            if (SpatialRoleTakesPriority(poseRoles, processor.Mapping)) continue;
            var thisGateOpen = false;
            foreach (var rawValue in ReadScalarValues(path, processor.Mapping.SourceMode, preferredSourceKey))
            {
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

    private static bool SpatialRoleTakesPriority(HashSet<SignalRole> spatialRoles, SignalMapping mapping) =>
        spatialRoles.Contains(mapping.Role)
        || mapping.Role == SignalRole.DepthOverride && spatialRoles.Contains(SignalRole.Depth);

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

    private bool IsSpatialGeometryFresh(long timestampMs) =>
        _timeProvider.GetUtcNow().ToUnixTimeMilliseconds() - timestampMs <= SpatialSampleMaxAgeMs;

    private bool IsGeometryFresh(long timestampMs) => _config.Osc.InputTimeoutMs <= 0
        || _timeProvider.GetUtcNow().ToUnixTimeMilliseconds() - timestampMs <= _config.Osc.InputTimeoutMs;

    private sealed record OgbInput(OgbDepthAddress Address, string Source,
        OscParameterStore.Entry? Root, OscParameterStore.Entry? Tip,
        OscParameterStore.Entry? Legacy, OscParameterStore.Entry? Close)
    {
        public bool ModernActive => Address.IsSocket && (Root?.Value.AsFloat() > 0 || Tip?.Value.AsFloat() > 0);
        public long Timestamp => ModernActive || Legacy is null
            ? Math.Max(Root?.TimestampMs ?? 0, Tip?.TimestampMs ?? 0) : Legacy.Value.TimestampMs;
    }

    private OgbInput[] ReadOgbInputs(string pattern, string? source)
    {
        // One snapshot and one result per source/full parent/party. This is not
        // a same-frame or Contact Sender guarantee. / 快照分组不证明同帧或 Sender 身份。
        var groups = new Dictionary<(string Source, OgbDepthAddress Address), Dictionary<string, OscParameterStore.Entry>>();
        foreach (var item in _store.SnapshotEntries())
        {
            if (!string.IsNullOrWhiteSpace(source) && item.Entry.Source.Key != source) continue;
            if (!OgbDepthAddress.TryParse(item.Path, out var address)
                || !(OscParameterStore.MatchesPathPattern(pattern, address.LegacyPath)
                    || address.IsSocket && OscParameterStore.MatchesPathPattern(pattern, address.RootPath))) continue;
            var key = (item.Entry.Source.Key, address);
            if (!groups.TryGetValue(key, out var entries)) groups[key] = entries = new(StringComparer.Ordinal);
            entries[item.Path] = item.Entry;
        }
        return groups.Select(pair =>
        {
            OscParameterStore.Entry? Get(string path) => pair.Value.TryGetValue(path, out var entry) ? entry : null;
            var address = pair.Key.Address;
            return new OgbInput(address, pair.Key.Source, Get(address.RootPath),
                Get(address.TipPath), Get(address.LegacyPath), Get(address.ClosePath));
        }).ToArray();
    }

    private static bool IsUnitValue(OscParameterStore.Entry? entry) =>
        entry is { } value && float.IsFinite(value.Value.AsFloat()) && value.Value.AsFloat() is >= 0 and <= 1;

    private float? ProcessSpsPair(string source, string rootPath, OscParameterStore.Entry? root, OscParameterStore.Entry? tip)
    {
        lock (_sync)
        {
            var key = (source, rootPath);
            if (!_spsDepth.TryGetValue(key, out var estimator))
            {
                if (_spsDepth.Count >= 4096) return null;
                _spsDepth[key] = estimator = new SpsDepthEstimator();
            }
            if (!IsUnitValue(root) || !IsUnitValue(tip)) { estimator.Reset(); return 0; }
            return estimator.Process(root!.Value.Value.AsFloat(), tip!.Value.Value.AsFloat(), tip.Value.Sequence);
        }
    }

    private void ResetSpsPair(string source, string rootPath)
    {
        lock (_sync)
            if (_spsDepth.TryGetValue((source, rootPath), out var estimator)) estimator.Reset();
    }

    private sealed record OgbTouchInput(OgbTouchAddress Address, OscParameterStore.Entry? Value, OscParameterStore.Entry? Close)
    {
        public long Timestamp => Value?.TimestampMs ?? 0;
    }

    private OgbTouchInput[] ReadOgbTouchInputs(string pattern, string? source)
    {
        var groups = new Dictionary<(string Source, OgbTouchAddress Address), Dictionary<string, OscParameterStore.Entry>>();
        foreach (var item in _store.SnapshotEntries())
        {
            if (!string.IsNullOrWhiteSpace(source) && item.Entry.Source.Key != source) continue;
            if (!OgbTouchAddress.TryParse(item.Path, out var address)
                || !OscParameterStore.MatchesPathPattern(pattern, address.ValuePath)) continue;
            var key = (item.Entry.Source.Key, address);
            if (!groups.TryGetValue(key, out var entries)) groups[key] = entries = new(StringComparer.Ordinal);
            entries[item.Path] = item.Entry;
        }
        return groups.Select(pair =>
        {
            OscParameterStore.Entry? Get(string path) => pair.Value.TryGetValue(path, out var entry) ? entry : null;
            return new OgbTouchInput(pair.Key.Address, Get(pair.Key.Address.ValuePath), Get(pair.Key.Address.ClosePath));
        }).ToArray();
    }

    private IEnumerable<float> ReadScalarValues(string path, string mode, string? source)
    {
        if (mode == "OgbTouch")
        {
            foreach (var input in ReadOgbTouchInputs(path, source))
            {
                if (!IsGeometryFresh(input.Timestamp)) continue;
                var open = !input.Address.NeedsClose || IsUnitValue(input.Close) && input.Close!.Value.Value.AsFloat() > .5f;
                yield return open && IsUnitValue(input.Value) ? input.Value!.Value.Value.AsFloat() : 0;
            }
            yield break;
        }
        if (mode == "OgbDepth")
        {
            foreach (var input in ReadOgbInputs(path, source))
            {
                if (!IsGeometryFresh(input.Timestamp))
                {
                    ResetSpsPair(input.Source, input.Address.RootPath);
                    continue;
                }
                if (input.ModernActive)
                {
                    // A positive partial/uncalibrated modern pair suppresses the
                    // legacy detector; otherwise fallback could jump to full.
                    // 正值现代通道不回退旧检测器，缺配对或未估长时保持零。
                    var value = ProcessSpsPair(input.Source, input.Address.RootPath, input.Root, input.Tip);
                    if (value.HasValue) yield return value.Value;
                }
                else
                {
                    ResetSpsPair(input.Source, input.Address.RootPath);
                    var close = !input.Address.IsSocket || input.Address.Party != "Others" || input.Close is null
                        || IsUnitValue(input.Close) && input.Close.Value.Value.AsFloat() > .5f;
                    yield return IsUnitValue(input.Legacy) && close ? input.Legacy!.Value.Value.AsFloat() : 0;
                }
            }
            yield break;
        }
        foreach (var matched in _store.MatchingEntries(path, source))
        {
            if (mode == "SpsSocketDepth")
            {
                if (!TryGetSpsTip(matched, out var tip, out var timestamp) || !IsGeometryFresh(timestamp)) continue;
                var value = ProcessSpsPair(matched.Entry.Source.Key, matched.Path, matched.Entry, tip);
                if (value.HasValue) yield return value.Value;
            }
            else if (IsGeometryFresh(matched.Entry.TimestampMs)) yield return matched.Entry.Value.AsFloat();
        }
    }

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
        {
            if (mapping.Mode == "OgbTouch")
            {
                foreach (var input in ReadOgbTouchInputs(mapping.Path, source))
                    if (input.Value.HasValue) yield return input.Timestamp;
                continue;
            }
            if (mapping.Mode == "OgbDepth")
            {
                // A Close update or fresh suppressed legacy value cannot refresh
                // the selected modern pair. / Close 或被抑制的旧值不能续期现代配对。
                foreach (var input in ReadOgbInputs(mapping.Path, source)) yield return input.Timestamp;
                continue;
            }
            foreach (var matched in _store.MatchingEntries(mapping.Path, source))
            {
                if (mapping.Mode == "SpsSocketDepth")
                {
                    if (TryGetSpsTip(matched, out _, out var timestamp)) yield return timestamp;
                }
                else yield return matched.Entry.TimestampMs;
            }
        }
    }

    private void CheckInputTimeout()
    {
        if (_disposed || _inputMode != RuntimeInputMode.Osc || !_inputActive || _emergency) return;
        // Calculations use the oldest contributing input, even when other OSC
        // parameters keep arriving. / 其他参数持续更新也不能延长旧计算输入的有效期。
        if (_usesComputed) QueueOscRefresh();
        var now = _timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        (string Path,string Mode,SignalRole Role)[] mappings;
        PointMetric[] pointMetrics;
        lock (_sync)
        {
            mappings = _processors.Where(p => p.Processor.Mapping.SourceMode != "Computed")
                .Select(p => (p.Path,p.Processor.Mapping.SourceMode,p.Processor.Mapping.Role)).ToArray();
            pointMetrics = _processors.Where(p => p.Processor.Mapping.SourceMode == "SensaPoint")
                .Select(p => p.Processor.Mapping.PointMetric).ToArray();
        }
        if (mappings.Length == 0 || _usesComputed && mappings.All(mapping => mapping.Role == SignalRole.GateEnable)) return;
        var source = _preferredOscSourceKeyProvider?.Invoke();
        var pointPaths=mappings.Where(m=>m.Mode=="SensaPoint").Select(m=>m.Path).ToArray();
        var posePaths=mappings.Where(m=>m.Mode=="SensaPose").Select(m=>m.Path).ToArray();
        var timeoutMs = pointPaths.Length > 0 || posePaths.Length > 0 ? SpatialSampleMaxAgeMs : _config.Osc.InputTimeoutMs;
        if (timeoutMs <= 0) return;
        // A Contact estimate depends on every range. Delta-only silence cannot certify freshness.
        var inputs = new List<IEnumerable<long>>();
        if (pointPaths.Length > 0)
        {
            var points = SpsPositionTracking.Observe(_store.SnapshotEntries(), source, SpatialSampleMaxAgeMs, _timeProvider)
                .Where(p => p.IsMappablePoint && pointPaths.Any(p.Matches)).ToArray();
            // Match BuildOscPatch: several points are ambiguous even if one is fresh.
            inputs.Add(points.Length == 1 && points[0].Valid
                && pointMetrics.All(points[0].SupportsMetric)
                ? [points[0].TimestampMs] : []);
        }
        if (posePaths.Length > 0)
        {
            // A newer, unselected rig cannot extend the target's lifetime.
            var selected = GetPoseObservations().FirstOrDefault(p => p.Key == ActivePoseKey
                && p.Valid && p.Engaged && posePaths.Any(p.Matches));
            inputs.Add(selected is not null ? [selected.TimestampMs] : []);
        }
        if (inputs.Count == 0) inputs.Add(ScalarInputTimestamps(mappings, source));
        if (inputs.All(timestamps => now - Math.Max(timestamps.DefaultIfEmpty(_activationTimestamp).Max(),
                _activationTimestamp) <= timeoutMs)) return;
        OnLog?.Invoke("[MotionRuntime] OSC input timeout; emergency stop.");
        EmergencyStop();
    }

    private async Task ApplyPatchCoreAsync(MotionPatch patch, string source, TCodeCommandMode? requestedCommandMode = null, int? requestedMotionValue = null)
    {
        var generation = Interlocked.Read(ref _generation);
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
        // A stop/re-arm during dispatch cannot credit this old target to the new activation.
        // 发送期间停止并重启许可时，不能把旧目标登记到新的许可代次。
        var dispatched = await SendOutputsAsync(next).ConfigureAwait(false);
        _appliedGeneration = dispatched ? generation : -1;
        if (!dispatched) _forceNextFrame = true;
        NotifyStateChanged();
    }

    private async Task<bool> SendOutputsAsync(MotionFrame frame)
    {
        if (!CanSend) return false;
        try { await _output.SendAsync(frame).ConfigureAwait(false); return true; }
        catch (Exception ex) { OnLog?.Invoke($"[Outputs] {ex.Message}"); return false; }
    }

    private async Task StopOutputsAsync()
    {
        try { await _output.EmergencyStopAsync().ConfigureAwait(false); }
        catch (Exception ex) { OnLog?.Invoke($"[Outputs] {ex.Message}"); }
    }

    private async Task SendEmergencyAsync()
    {
        await _sendGate.WaitAsync().ConfigureAwait(false);
        try { await StopOutputsAsync().ConfigureAwait(false); }
        finally { _sendGate.Release(); NotifyStateChanged(); }
    }

    private double ConsumeElapsedMs()
    {
        var now = _timeProvider.GetTimestamp();
        var previous = Interlocked.Exchange(ref _lastEventTimestamp, now);
        return Math.Max(_timeProvider.GetElapsedTime(previous, now).TotalMilliseconds, 1d);
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
        _lifetime.Cancel();
        _watchdog.Dispose();
        lock (_sync) _pendingPatch = null;
        _store.OnSetWithSource -= HandleOscValueChanged;
        _store.AvatarChanged -= HandleAvatarChanged;
        _scriptPlayer.OnStopped -= HandleScriptStopped;
        _scriptPlayer.OnFrame -= HandleScriptFrame;
        _scriptPlayer.OnStateChanged -= HandleScriptStateChanged;
        if (_ownsScriptPlayer) _scriptPlayer.Dispose();
        // Pending workers may still release this managed semaphore after cancellation.
    }
}
