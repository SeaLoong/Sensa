using System.Diagnostics;
using Sensa.Config;
using Sensa.Core;
using Sensa.TransmitIntiface;
using Sensa.TransmitTCode;
using Sensa.ServiceRecording;
using Sensa.UiActions;

namespace Sensa.ApplicationLoop;

// ═══════════════════════════════════════════════════════════════════════
//  SafetySystem — intensity cap, ramp-up, idle behavior, emergency stop
// ═══════════════════════════════════════════════════════════════════════

public sealed class SafetySystem
{
    private readonly SafetyConfig _cfg;
    private float  _currentCap = 0f;       // ramps from 0→cap over RampUpMs
    private long   _rampStartMs = -1;
    private bool   _emergency = false;
    private DeviceCommand _heldCommand = DeviceCommand.Zero with { GateOpen = false, Vibrate = 0f };

    public bool EmergencyActive => _emergency;

    public SafetySystem(SafetyConfig cfg) => _cfg = cfg;

    public void TriggerEmergency()  => _emergency = true;
    public void ClearEmergency()    { _emergency = false; _rampStartMs = -1; _currentCap = 0f; }

    /// <summary>Apply safety constraints to a DeviceCommand, returning the modified command.</summary>
    public DeviceCommand Apply(DeviceCommand raw)
    {
        if (_emergency)
            // Rotation and linear-offset axes (R0/R1/R2/L1/L2) default to 0.5 (centre)
            // so the device doesn't jerk to an extreme position on stop.
            return raw with { L0 = 0f, R0 = 0.5f, R1 = 0.5f, R2 = 0.5f, L1 = 0.5f, L2 = 0.5f, Vibrate = 0f, GateOpen = false };

        // Ramp-up: first time we get a nonzero command, start the ramp
        bool anyActivity = raw.GateOpen && HasActivity(raw);
        long now = Environment.TickCount64;

        if (anyActivity)
        {
            if (_rampStartMs < 0) _rampStartMs = now;

            float elapsed = (float)(now - _rampStartMs);
            float rampT   = _cfg.RampUpMs > 0 ? Math.Clamp(elapsed / _cfg.RampUpMs, 0f, 1f) : 1f;
            _currentCap   = rampT * _cfg.GlobalIntensityCap;
        }
        else
        {
            // Idle behavior
            switch (_cfg.Idle)
            {
                case IdleBehavior.Park:
                    return raw with { L0 = 0.5f, R0 = 0.5f, R1 = 0.5f, R2 = 0.5f, L1 = 0.5f, L2 = 0.5f, Vibrate = 0f, GateOpen = false };
                case IdleBehavior.StayAtPosition:
                    return _heldCommand with { DeltaMs = raw.DeltaMs, GateOpen = false, Vibrate = 0f };
                case IdleBehavior.RetractToZero:
                default:
                    _rampStartMs = -1; // reset ramp when idle
                    _currentCap  = 0f;
                    // L0 retracts to 0; symmetric axes (R0/R1/R2/L1/L2) return to centre.
                    return raw with { L0 = 0f, R0 = 0.5f, R1 = 0.5f, R2 = 0.5f, L1 = 0.5f, L2 = 0.5f, Vibrate = 0f, GateOpen = false };
            }
        }

        // Apply cap to stroke and vibration only.
        // Rotation axes (R0, R1) represent physical angle offsets centred at 0.5
        // and must not be intensity-scaled — clamping them breaks the centre position
        // during ramp-up.
        var safe = raw with
        {
            L0      = Math.Clamp(raw.L0,      0f, _currentCap),
            Vibrate = Math.Clamp(raw.Vibrate, 0f, _currentCap),
        };
        _heldCommand = safe with { GateOpen = false, Vibrate = 0f };
        return safe;
    }

    private static bool HasActivity(DeviceCommand raw)
    {
        return raw.L0 > 0.01f
            || raw.Vibrate > 0.01f
            || Math.Abs(raw.R0 - 0.5f) > 0.01f
            || Math.Abs(raw.R1 - 0.5f) > 0.01f
            || Math.Abs(raw.R2 - 0.5f) > 0.01f
            || Math.Abs(raw.L1 - 0.5f) > 0.01f
            || Math.Abs(raw.L2 - 0.5f) > 0.01f;
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Routine — the main 50 Hz closed-loop tick
// ═══════════════════════════════════════════════════════════════════════

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
    private readonly SafetySystem        _safety;
    private readonly Func<DeviceCommand, Task>? _sendOutputsAsync;
    private readonly Func<Task>? _emergencyStopAsync;
    private readonly Func<int>? _loopRateResolver;

    // Per-signal processors; duplicate OSC paths are allowed so one parameter can drive multiple axes.
    private readonly List<(string Path, SignalProcessor Processor)> _processors = new();
    private readonly SignalFusion _fusion = new();
    private readonly RhythmDetector _rhythm = new();

    // Pre-allocated signal list — reused every tick to avoid per-frame GC allocations
    private readonly List<(SignalRole, float)> _signals = new();

    private CancellationTokenSource? _cts;
    private Task? _loopTask;

    // ── Public computed state for UI display ───────────────────────
    private volatile DeviceCommand _lastCommandField = DeviceCommand.Zero;
    private volatile DeviceCommand _manualOverrideField = DeviceCommand.Zero;
    private volatile bool _manualOverrideEnabled;
    private volatile InputMode _inputMode = InputMode.Osc;
    public DeviceCommand LastCommand  => _lastCommandField;
    public DeviceCommand ManualOverrideCommand => _manualOverrideField;
    public bool          ManualOverrideEnabled => _manualOverrideEnabled;
    public InputMode     CurrentInputMode => _inputMode;
    public bool          IsRunning    => _cts is not null && !_cts.IsCancellationRequested;
    public bool          IsEmergency  => _safety.EmergencyActive;

    // ── Events ─────────────────────────────────────────────────────
    public event Action<string>? OnLog;

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
        _safety   = new SafetySystem(save.Safety);
        _sendOutputsAsync = sendOutputsAsync;
        _emergencyStopAsync = emergencyStopAsync;
        _loopRateResolver = loopRateResolver;

        RebuildProcessors();
        _osc.OnAvatarChange += () =>
        {
            // Reset EMA state on all processors so stale smoothed values don't bleed across avatars.
            foreach (var (_, proc) in _processors) proc.Reset();
            OnLog?.Invoke("[Routine] Avatar changed — parameter store cleared, EMA reset.");
        };
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

    public void Start()
    {
        if (_cts is not null) return;
        _cts = new CancellationTokenSource();
        _loopTask = RunLoopAsync(_cts.Token);
        OnLog?.Invoke("[Routine] Started.");
    }

    public async Task StopAsync()
    {
        if (_cts is null) return;
        _cts.Cancel();
        try { if (_loopTask != null) await _loopTask; } catch (OperationCanceledException) { }
        _cts.Dispose();
        _cts = null;
        OnLog?.Invoke("[Routine] Stopped.");
    }

    public void EmergencyStop()
    {
        _safety.TriggerEmergency();
        _ = SendEmergencyAsync();
    }

    public void ClearEmergency() => _safety.ClearEmergency();

    public void SetManualOverride(DeviceCommand cmd)
    {
        _manualOverrideField = cmd;
        _manualOverrideEnabled = true;
        OnLog?.Invoke("[ManualTest] Override enabled.");
    }

    public void ClearManualOverride()
    {
        _manualOverrideField = DeviceCommand.Zero;
        _manualOverrideEnabled = false;
        OnLog?.Invoke("[ManualTest] Override cleared.");
    }

    public void SetInputMode(InputMode mode)
    {
        if (_inputMode == mode)
            return;

        _inputMode = mode;

        if (mode != InputMode.Manual)
            _manualOverrideEnabled = false;

        if (mode != InputMode.Script)
            _scriptInput.Pause();

        OnLog?.Invoke($"[Input] Mode switched to {mode}.");
    }

    // ────────────────────────────────────────────────────────────────

    private async Task RunLoopAsync(CancellationToken ct)
    {
        var lastTick = Stopwatch.GetTimestamp();

        while (!ct.IsCancellationRequested)
        {
            var now = Stopwatch.GetTimestamp();
            var tickMs = Math.Max(1000.0 / Math.Max(_loopRateResolver?.Invoke() ?? _save.GetRecommendedLoopRate(), 10), 1);
            var deltaMs = Stopwatch.GetElapsedTime(lastTick, now).TotalMilliseconds;
            if (deltaMs < 0.5)
                deltaMs = tickMs;
            lastTick = now;

            // 1. Drain UI actions
            while (_actions.TryDequeue(out var action))
            {
                try { action(); } catch (Exception ex) { OnLog?.Invoke($"[UiAction] {ex.Message}"); }
            }

            // 2. Build signal list from ParameterStore (reuse pre-allocated list to reduce GC)
            _signals.Clear();
            foreach (var (path, proc) in _processors)
            {
                if (!_store.TryGetLatest(path, out var entry)) continue;
                float processed = proc.Process(entry.Value.AsFloat());
                _signals.Add((proc.Config.Role, processed));
            }

            // 3. Fuse signals into a DeviceCommand
            var rawCmd = _fusion.Fuse(_signals, deltaMs: deltaMs);

            // 4. Rhythm detection (uses L0 depth; respects saved RhythmConfig)
            var rc = _save.Rhythm;
            _rhythm.Feed(rawCmd.L0, rc.WindowMs, rc.MinBpm, rc.MaxBpm);
            // 5. Select active input source and pass through safety.
            var selectedInput = _inputMode switch
            {
                InputMode.Manual when _manualOverrideEnabled => _manualOverrideField with { DeltaMs = deltaMs },
                InputMode.Manual => DeviceCommand.Zero with { DeltaMs = deltaMs, GateOpen = false },
                InputMode.Script => _scriptInput.Sample(deltaMs),
                _ => rawCmd with { DeltaMs = deltaMs },
            };

            var safeCmd = _safety.Apply(selectedInput) with { DeltaMs = deltaMs };

            _lastCommandField = safeCmd;

            // 6. Transmit
            if (_sendOutputsAsync is not null)
            {
                try { await _sendOutputsAsync(safeCmd); }
                catch (Exception ex) { OnLog?.Invoke($"[Outputs] {ex.Message}"); }
            }
            else
            {
                if (_save.Intiface.Enabled && _intiface is { IsConnected: true })
                {
                    try { await _intiface.SendAsync(safeCmd); }
                    catch (Exception ex) { OnLog?.Invoke($"[Intiface] {ex.Message}"); }
                }
                if (_save.TCode.Enabled)
                    _tcode?.Send(safeCmd);
                if (_save.UdpTCode.Enabled)
                    _tcodeUdp?.Send(safeCmd);
                if (_save.TcpTCode.Enabled)
                    _tcodeTcp?.Send(safeCmd);
            }

            // 7. Record
            _recorder?.Push(safeCmd);

            var elapsedMs = Stopwatch.GetElapsedTime(now).TotalMilliseconds;
            var remainingMs = tickMs - elapsedMs;
            if (remainingMs > 0.5)
                await Task.Delay(TimeSpan.FromMilliseconds(remainingMs), ct);
        }
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
        _cts?.Cancel();
        _cts?.Dispose();
    }
}
