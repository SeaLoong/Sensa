using Sensa.Config;
using Sensa.Core;
using Sensa.TransmitIntiface;
using Sensa.TransmitTCode;
using Sensa.ServiceRecording;
using Sensa.UiActions;

namespace Sensa.ApplicationLoop;

/// <summary>
/// Event-driven signal processing engine — no loop. Sends are triggered by:
///   - ParameterStore.OnSet (OSC parameter arrives)
///   - Manual PUT / WS handler (user moves slider)
///   - Script timer (funscript frame advances)
/// </summary>
public sealed class Routine : IDisposable
{
    private readonly SaveFile            _save;
    private readonly ParameterStore      _store;
    private readonly OscReceiver         _osc;
    private readonly IntifaceTransmitter? _intiface;
    private readonly TCodeSerial?        _tcode;
    private readonly TCodeUdp?           _tcodeUdp;
    private readonly TCodeTcp?           _tcodeTcp;
    private readonly RecordingBuffer?    _recorder;
    private readonly ScriptInputPlayer   _scriptInput;
    private readonly UiActionQueue       _actions;
    private readonly Func<DeviceCommand, Task>? _sendOutputsAsync;
    private readonly Func<Task>? _emergencyStopAsync;
    private readonly Timer? _actionTimer;
    private readonly Timer? _logTimer;

    // Per-signal processors
    private readonly List<(string Path, SignalProcessor Processor)> _processors = new();
    private readonly SignalFusion _fusion = new();
    private readonly List<(SignalRole, float)> _signals = new();

    private volatile DeviceCommand _lastCommandField = DeviceCommand.Zero;
    private volatile DeviceCommand _manualOverrideField = DeviceCommand.Zero;
    private volatile bool _manualOverrideEnabled;
    private volatile InputMode _inputMode = InputMode.Osc;
    private volatile bool _emergency;
    private volatile bool _inputActive = true;
    private DeviceCommand? _lastSentCmd;

    public DeviceCommand LastCommand          => _lastCommandField;
    public DeviceCommand ManualOverrideCommand => _manualOverrideField;
    public bool          ManualOverrideEnabled => _manualOverrideEnabled;
    public InputMode     CurrentInputMode      => _inputMode;
    public bool          IsEmergency           => _emergency;
    public bool          InputActive           => _inputActive;

    public event Action<string>? OnLog;
    public event Action<string>? OnDebugLog;

    public Routine(
        SaveFile            save,
        ParameterStore      store,
        OscReceiver         osc,
        UiActionQueue       actions,
        IntifaceTransmitter? intiface  = null,
        TCodeSerial?        tcode     = null,
        TCodeUdp?           tcodeUdp  = null,
        TCodeTcp?           tcodeTcp  = null,
        RecordingBuffer?    recorder  = null,
        ScriptInputPlayer?  scriptInput = null,
        Func<DeviceCommand, Task>? sendOutputsAsync = null,
        Func<Task>? emergencyStopAsync = null,
        Func<int>? loopRateResolver = null)
    {
        _save     = save;
        _store    = store;
        _osc      = osc;
        _intiface = intiface;
        _tcode    = tcode;
        _tcodeUdp = tcodeUdp;
        _tcodeTcp = tcodeTcp;
        _recorder = recorder;
        _scriptInput = scriptInput ?? new ScriptInputPlayer();
        _actions  = actions;
        _sendOutputsAsync = sendOutputsAsync;
        _emergencyStopAsync = emergencyStopAsync;

        RebuildProcessors();

        // Event-driven OSC: fire on every parameter change
        _store.OnSet += (_, _) => { _ = TrySendAsync(); };

        // Avatar change: reset processors + OSC receiver clears ParameterStore
        _osc.OnAvatarChange += () =>
        {
            foreach (var (_, proc) in _processors) proc.Reset();
            OnLog?.Invoke("[Routine] Avatar changed — EMA reset.");
        };

        // Drain UI actions and log periodically (only housekeeping, no sending)
        _actionTimer = new Timer(_ => DrainActions(), null, 50, 50);
        _logTimer = new Timer(_ =>
        {
            OnDebugLog?.Invoke(
                $"[Routine] mode={_inputMode} emg={_emergency} " +
                $"lastSent: L0={_lastSentCmd?.L0:F2} R0={_lastSentCmd?.R0:F2} V0={_lastSentCmd?.V0:F2}");
        }, null, 1000, 1000);
    }

    public void RebuildProcessors()
    {
        _processors.Clear();
        foreach (var sig in _save.Signals)
        {
            if (string.IsNullOrWhiteSpace(sig.OscPath))
                continue;
            _processors.Add((sig.OscPath, new SignalProcessor(sig)));
        }
    }

    // ────────────────────────────────────────────────────────────────

    public void EmergencyStop()
    {
        _emergency = true;
        _ = SendEmergencyAsync();
    }

    public void ClearEmergency()
    {
        _emergency = false;
        // Re-send current state after clearing emergency
        _lastSentCmd = null;
        _ = TrySendAsync();
    }

    public void SetManualOverride(DeviceCommand cmd)
    {
        _manualOverrideField = cmd;
        _manualOverrideEnabled = true;
        OnLog?.Invoke("[Manual] Override enabled.");
        _ = TrySendAsync();
    }

    public void ClearManualOverride()
    {
        _manualOverrideField = DeviceCommand.Zero;
        _manualOverrideEnabled = false;
        OnLog?.Invoke("[Manual] Override cleared.");
    }

    public void SetInputMode(InputMode mode)
    {
        if (_inputMode == mode) return;
        _inputMode = mode;

        if (mode != InputMode.Manual) _manualOverrideEnabled = false;
        if (mode != InputMode.Script) _scriptInput.Pause();
        if (mode != InputMode.Osc) _inputActive = true;

        OnLog?.Invoke($"[Input] Mode switched to {mode}.");
        _ = TrySendAsync();
    }

    public void SetInputActive(bool active)
    {
        _inputActive = active;
        OnLog?.Invoke($"[Input] {(active ? "Active" : "Inactive")}.");
    }

    /// <summary>
    /// Event-driven send: called by any trigger (OSC param, manual, script, mode switch).
    /// Fuses the current input into a DeviceCommand and sends if changed.
    /// </summary>
    public async Task TrySendAsync()
    {
        if (_emergency || !_inputActive) return;

        DrainActions();

        // Build command from current input mode
        var deltaMs = 20.0;
        DeviceCommand cmd;

        switch (_inputMode)
        {
            case InputMode.Manual when _manualOverrideEnabled:
                cmd = _manualOverrideField with { DeltaMs = deltaMs };
                break;
            case InputMode.Manual:
                cmd = DeviceCommand.Zero with { DeltaMs = deltaMs };
                break;
            case InputMode.Script:
                cmd = _scriptInput.Sample(deltaMs);
                break;
            default: // OSC
                cmd = FuseOscSignals(deltaMs);
                break;
        }

        if (_emergency)
            cmd = cmd with { L0 = 0f, R0 = 0.5f, R1 = 0.5f, R2 = 0.5f, L1 = 0.5f, L2 = 0.5f, V0 = 0f, V1 = 0f, V2 = 0f, A0 = 0.5f, DeltaMs = deltaMs };

        _lastCommandField = cmd;

        if (CmdEquals(cmd, _lastSentCmd)) return;
        _lastSentCmd = cmd;

        _recorder?.Push(cmd);

        if (_sendOutputsAsync is not null)
        {
            try { await _sendOutputsAsync(cmd); }
            catch (Exception ex) { OnLog?.Invoke($"[Outputs] {ex.Message}"); }
        }
        else
        {
            if (_save.Intiface.Enabled && _intiface is { IsConnected: true })
            {
                try { await _intiface.SendAsync(cmd); }
                catch (Exception ex) { OnLog?.Invoke($"[Intiface] {ex.Message}"); }
            }
            if (_save.TCode.Enabled) _tcode?.Send(cmd);
            if (_save.UdpTCode.Enabled) _tcodeUdp?.Send(cmd);
            if (_save.TcpTCode.Enabled) _tcodeTcp?.Send(cmd);
        }
    }

    // ────────────────────────────────────────────────────────────────
    //  Helpers
    // ────────────────────────────────────────────────────────────────

    private void DrainActions()
    {
        while (_actions.TryDequeue(out var action))
        {
            try { action(); }
            catch (Exception ex) { OnLog?.Invoke($"[UiAction] {ex.Message}"); }
        }
    }

    private DeviceCommand FuseOscSignals(double deltaMs)
    {
        _signals.Clear();
        foreach (var (path, proc) in _processors)
        {
            if (!_store.TryGetLatest(path, out var entry)) continue;
            _signals.Add((proc.Config.Role, proc.Process(entry.Value.AsFloat())));
        }
        return _fusion.Fuse(_signals, deltaMs: deltaMs);
    }

    private static bool CmdEquals(DeviceCommand? a, DeviceCommand? b)
    {
        if (a is null || b is null) return a is null && b is null;
        return Math.Abs(a.L0 - b.L0) < 0.001f
            && Math.Abs(a.R0 - b.R0) < 0.001f
            && Math.Abs(a.R1 - b.R1) < 0.001f
            && Math.Abs(a.R2 - b.R2) < 0.001f
            && Math.Abs(a.L1 - b.L1) < 0.001f
            && Math.Abs(a.L2 - b.L2) < 0.001f
            && Math.Abs(a.V0 - b.V0) < 0.001f
            && Math.Abs(a.V1 - b.V1) < 0.001f
            && Math.Abs(a.V2 - b.V2) < 0.001f
            && Math.Abs(a.A0 - b.A0) < 0.001f;
    }

    private async Task SendEmergencyAsync()
    {
        if (_emergencyStopAsync is not null)
        {
            try { await _emergencyStopAsync(); } catch { }
            return;
        }
        _tcode?.EmergencyStop();
        _tcodeUdp?.EmergencyStop();
        _tcodeTcp?.EmergencyStop();
        if (_intiface is { IsConnected: true })
        {
            try { await _intiface.StopAllAsync(); } catch { }
        }
    }

    public void Dispose()
    {
        _actionTimer?.Dispose();
        _logTimer?.Dispose();
    }
}
