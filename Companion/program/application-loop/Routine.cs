using Sensa.Config;
using Sensa.Core;
using Sensa.ServiceRecording;
using Sensa.TransmitIntiface;
using Sensa.TransmitTCode;
using System.Text;

namespace Sensa.ApplicationLoop;

/// <summary>
/// Fully event-driven signal router.
///
/// State changes are triggered by:
///   - ParameterStore.OnSet               (OSC parameter arrives)
///   - Manual input API / WS command      (user updates manual pose)
///   - ScriptInputPlayer.OnFrame          (script playback timer event)
///   - Mode / emergency / active toggles  (control-plane events)
///
/// There is no continuous send loop. The routine maintains the current desired pose,
/// and each event applies an axis patch onto that pose. Output transmitters then emit
/// only the axes that actually changed.
/// </summary>
public sealed class Routine : IDisposable
{
    private readonly SaveFile _save;
    private readonly ParameterStore _store;
    private readonly OscReceiver _osc;
    private readonly IntifaceTransmitter? _intiface;
    private readonly TCodeSerial? _tcode;
    private readonly TCodeUdp? _tcodeUdp;
    private readonly TCodeTcp? _tcodeTcp;
    private readonly RecordingBuffer? _recorder;
    private readonly ScriptInputPlayer _scriptInput;
    private readonly Func<DeviceCommand, Task>? _sendOutputsAsync;
    private readonly Func<Task>? _emergencyStopAsync;
    private readonly object _sync = new();
    private readonly SemaphoreSlim _sendGate = new(1, 1);

    private readonly List<(string Path, SignalProcessor Processor)> _processors = new();
    private readonly SignalFusion _fusion = new();
    private readonly List<(SignalRole, float)> _signals = new();

    private volatile DeviceCommand _currentPose = DeviceAxisHelpers.CreateNeutralCommand();
    private volatile DeviceCommand _manualPose = DeviceAxisHelpers.CreateNeutralCommand();
    private volatile bool _manualOverrideEnabled;
    private volatile InputMode _inputMode = InputMode.Osc;
    private volatile bool _emergency;
    private volatile bool _inputActive = false;
    private volatile bool _disposed;
    private int _oscRefreshQueued;
    private long _lastEventTimestampMs = Environment.TickCount64;

    public DeviceCommand LastCommand => _currentPose;
    public DeviceCommand ManualOverrideCommand => _manualPose;
    public bool ManualOverrideEnabled => _manualOverrideEnabled;
    public InputMode CurrentInputMode => _inputMode;
    public bool IsEmergency => _emergency;
    public bool InputActive => _inputActive;

    public event Action<string>? OnLog;
    public event Action<string>? OnDebugLog;
    public event Action? StateChanged;

    public Routine(
        SaveFile save,
        ParameterStore store,
        OscReceiver osc,
        IntifaceTransmitter? intiface = null,
        TCodeSerial? tcode = null,
        TCodeUdp? tcodeUdp = null,
        TCodeTcp? tcodeTcp = null,
        RecordingBuffer? recorder = null,
        ScriptInputPlayer? scriptInput = null,
        Func<DeviceCommand, Task>? sendOutputsAsync = null,
        Func<Task>? emergencyStopAsync = null)
    {
        _save = save;
        _store = store;
        _osc = osc;
        _intiface = intiface;
        _tcode = tcode;
        _tcodeUdp = tcodeUdp;
        _tcodeTcp = tcodeTcp;
        _recorder = recorder;
        _scriptInput = scriptInput ?? new ScriptInputPlayer();
        _sendOutputsAsync = sendOutputsAsync;
        _emergencyStopAsync = emergencyStopAsync;

        RebuildProcessors();

        _store.OnSet += HandleOscValueChanged;
        _osc.OnAvatarChange += HandleAvatarChanged;
        _scriptInput.OnFrame += HandleScriptFrame;
        _scriptInput.OnStateChanged += HandleScriptStateChanged;
    }

    public void RebuildProcessors()
    {
        lock (_sync)
        {
            _processors.Clear();
            foreach (var sig in _save.Signals)
            {
                if (string.IsNullOrWhiteSpace(sig.OscPath))
                    continue;
                _processors.Add((sig.OscPath, new SignalProcessor(sig)));
            }
        }

        if (!_disposed && _inputMode == InputMode.Osc && _inputActive && !_emergency)
            QueueOscRefresh();
        else
            NotifyStateChanged();
    }

    public void EmergencyStop()
    {
        if (_emergency)
            return;

        _emergency = true;
        NotifyStateChanged();
        _ = SendEmergencyAsync();
    }

    public void ClearEmergency()
    {
        if (!_emergency)
            return;

        _emergency = false;
        NotifyStateChanged();
        _ = ResendCurrentPoseAsync();
    }

    public void SetManualOverride(DeviceCommand cmd)
    {
        _manualPose = cmd with { DeltaMs = 0d, UseMaxSpeed = true };
        _manualOverrideEnabled = true;
        OnLog?.Invoke("[Manual] Pose updated.");
        NotifyStateChanged();

        if (_inputMode == InputMode.Manual && _inputActive && !_emergency)
            _ = ApplyPatchAsync(DeviceAxisHelpers.CreatePatchFromCommand(_manualPose), "Manual", useMaxSpeed: true);
    }

    public void ClearManualOverride()
    {
        _manualOverrideEnabled = false;
        OnLog?.Invoke("[Manual] Override disabled (baseline preserved).");
        NotifyStateChanged();
    }

    public void SetInputMode(InputMode mode)
    {
        if (_inputMode == mode)
            return;

        _inputMode = mode;
        OnLog?.Invoke($"[Input] Mode switched to {mode}.");
        NotifyStateChanged();

        if (mode != InputMode.Script)
            _scriptInput.Pause();

        if (_emergency || !_inputActive)
            return;

        switch (mode)
        {
            case InputMode.Manual when _manualOverrideEnabled:
                _ = ApplyPatchAsync(DeviceAxisHelpers.CreatePatchFromCommand(_manualPose), "ManualMode", useMaxSpeed: true);
                break;
            case InputMode.Osc:
                QueueOscRefresh();
                break;
            case InputMode.Script:
            {
                var snapshot = _scriptInput.GetSnapshot();
                if (snapshot.Loaded)
                    _ = ApplyScriptPatchAsync(snapshot.CurrentL0, "ScriptMode");
                break;
            }
        }
    }

    public void SetInputActive(bool active)
    {
        if (_inputActive == active)
            return;

        _inputActive = active;
        OnLog?.Invoke($"[Input] {(active ? "Active" : "Inactive")}.");
        NotifyStateChanged();

        if (!active || _emergency)
            return;

        switch (_inputMode)
        {
            case InputMode.Osc:
                QueueOscRefresh();
                break;
            case InputMode.Manual when _manualOverrideEnabled:
                _ = ApplyPatchAsync(DeviceAxisHelpers.CreatePatchFromCommand(_manualPose), "ManualActive", useMaxSpeed: true);
                break;
            case InputMode.Script:
            {
                var snapshot = _scriptInput.GetSnapshot();
                if (snapshot.Loaded)
                    _ = ApplyScriptPatchAsync(snapshot.CurrentL0, "ScriptActive");
                break;
            }
        }
    }

    private void HandleOscValueChanged(string path, OscValue __)
    {
        if (_disposed || _inputMode != InputMode.Osc || !_inputActive || _emergency)
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
                if (ParameterStore.MatchesPathPattern(pattern, oscPath))
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

        OnLog?.Invoke("[Routine] Avatar changed — EMA reset.");
        NotifyStateChanged();
    }

    private void HandleScriptFrame(float l0)
    {
        if (_disposed || _inputMode != InputMode.Script || !_inputActive || _emergency)
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

            if (_inputMode != InputMode.Osc || !_inputActive || _emergency)
                return;

            var patch = BuildOscPatch();
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

    private DeviceAxisPatch BuildOscPatch()
    {
        _signals.Clear();
        List<(string Path, SignalProcessor Processor)> processors;

        lock (_sync)
            processors = new List<(string Path, SignalProcessor Processor)>(_processors);

        foreach (var (path, processor) in processors)
        {
            if (!_store.TryGetLatest(path, out var matchedPath, out var entry))
                continue;

            var rawValue = entry.Value.AsFloat();
            var processedValue = processor.Process(rawValue);
            _signals.Add((processor.Config.Role, processedValue));
            OnDebugLog?.Invoke($"[Signal/OSC] {(matchedPath == path ? path : $"{path} => {matchedPath}")} raw={rawValue:F4} -> {processor.Config.Role}={processedValue:F4}");
        }

        var patch = _fusion.FusePatch(_signals);
        if (_signals.Count > 0)
            OnDebugLog?.Invoke($"[Signal/Fuse] {(patch.IsEmpty ? "<empty>" : FormatPatch(patch))}");
        return patch;
    }

    private Task ApplyScriptPatchAsync(float l0, string source)
    {
        var patch = new DeviceAxisPatch();
        patch.Set(DeviceAxis.L0, l0);
        return ApplyPatchAsync(patch, source);
    }

    private async Task ApplyPatchAsync(DeviceAxisPatch patch, string source, bool useMaxSpeed = false)
    {
        await _sendGate.WaitAsync().ConfigureAwait(false);
        try
        {
            await ApplyPatchCoreAsync(patch, source, useMaxSpeed).ConfigureAwait(false);
        }
        finally
        {
            _sendGate.Release();
        }
    }

    private async Task ApplyPatchCoreAsync(DeviceAxisPatch patch, string source, bool useMaxSpeed = false)
    {
        var deltaMs = ConsumeElapsedMs();
        var previous = _currentPose;
        var next = patch.IsEmpty
            ? previous with { DeltaMs = deltaMs, UseMaxSpeed = useMaxSpeed }
            : DeviceAxisHelpers.ApplyPatch(previous, patch, deltaMs) with { UseMaxSpeed = useMaxSpeed };

        OnDebugLog?.Invoke($"[Routine/{source}/Patch] delta={deltaMs:F0}ms motion={(useMaxSpeed ? "max-speed" : "auto")} {(patch.IsEmpty ? "<empty>" : FormatPatch(patch))}");

        _currentPose = next;

        if (patch.IsEmpty || DeviceAxisHelpers.Equals(previous, next))
        {
            if (!patch.IsEmpty)
                OnDebugLog?.Invoke($"[Routine/{source}] Patch applied but produced no effective pose change.");
            NotifyStateChanged();
            return;
        }

        OnDebugLog?.Invoke($"[Routine/{source}] L0={next.L0:F3} R0={next.R0:F3} R1={next.R1:F3} R2={next.R2:F3} L1={next.L1:F3} L2={next.L2:F3} V0={next.V0:F3} V1={next.V1:F3} V2={next.V2:F3} A0={next.A0:F3}");

        _recorder?.Push(next);
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

            var current = _currentPose with { DeltaMs = ConsumeElapsedMs(), UseMaxSpeed = _inputMode == InputMode.Manual && _manualOverrideEnabled };
            _currentPose = current;
            OnDebugLog?.Invoke($"[Routine/Resume] Re-sending current pose after state transition.");
            await SendOutputsAsync(current).ConfigureAwait(false);
            NotifyStateChanged();
        }
        finally
        {
            _sendGate.Release();
        }
    }

    private async Task SendOutputsAsync(DeviceCommand cmd)
    {
        if (_sendOutputsAsync is not null)
        {
            try
            {
                await _sendOutputsAsync(cmd).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                OnLog?.Invoke($"[Outputs] {ex.Message}");
            }
            return;
        }

        if (_save.Intiface.Enabled && _intiface is { IsConnected: true })
        {
            try
            {
                await _intiface.SendAsync(cmd).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                OnLog?.Invoke($"[Intiface] {ex.Message}");
            }
        }

        if (_save.TCode.Enabled)
            _tcode?.Send(cmd);
        if (_save.UdpTCode.Enabled)
            _tcodeUdp?.Send(cmd);
        if (_save.TcpTCode.Enabled)
            _tcodeTcp?.Send(cmd);
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

            _tcode?.EmergencyStop();
            _tcodeUdp?.EmergencyStop();
            _tcodeTcp?.EmergencyStop();
            if (_intiface is { IsConnected: true })
            {
                try
                {
                    await _intiface.StopAllAsync().ConfigureAwait(false);
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

    private static string FormatPatch(DeviceAxisPatch patch)
    {
        var sb = new StringBuilder();
        foreach (var axis in DeviceAxisHelpers.All)
        {
            if (!patch.TryGetValue(axis, out var value))
                continue;

            if (sb.Length > 0)
                sb.Append(' ');

            sb.Append(DeviceAxisHelpers.Token(axis));
            sb.Append('=');
            sb.Append(value.ToString("F3"));
        }

        return sb.Length == 0 ? "<empty>" : sb.ToString();
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
        _store.OnSet -= HandleOscValueChanged;
        _osc.OnAvatarChange -= HandleAvatarChanged;
        _scriptInput.OnFrame -= HandleScriptFrame;
        _scriptInput.OnStateChanged -= HandleScriptStateChanged;
        _sendGate.Dispose();
    }
}
