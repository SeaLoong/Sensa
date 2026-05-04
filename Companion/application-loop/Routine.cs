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
    private readonly UiActionQueue       _actions;
    private readonly SafetySystem        _safety;

    // Per-signal processors keyed by OSC path
    private readonly Dictionary<string, SignalProcessor> _processors = new();
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
    public DeviceCommand LastCommand  => _lastCommandField;
    public DeviceCommand ManualOverrideCommand => _manualOverrideField;
    public bool          ManualOverrideEnabled => _manualOverrideEnabled;
    public float         CurrentBpm   { get; private set; } = 0f;
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
        RecordingBuffer?    recorder  = null)
    {
        _save     = save;
        _store    = store;
        _osc      = osc;
        _intiface = intiface;
        _tcode    = tcode;
        _tcodeUdp = tcodeUdp;
        _tcodeTcp = tcodeTcp;
        _recorder = recorder;
        _actions  = actions;
        _safety   = new SafetySystem(save.Safety);

        RebuildProcessors();
        _osc.OnAvatarChange += () =>
        {
            // Reset EMA state on all processors so stale smoothed values don't bleed across avatars.
            foreach (var proc in _processors.Values) proc.Reset();
            OnLog?.Invoke("[Routine] Avatar changed — parameter store cleared, EMA reset.");
        };
    }

    public void RebuildProcessors()
    {
        _processors.Clear();
        foreach (var sig in _save.Signals)
        {
            _processors[sig.OscPath] = new SignalProcessor(sig);
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

    // ────────────────────────────────────────────────────────────────

    private async Task RunLoopAsync(CancellationToken ct)
    {
        double tickMs = 1000.0 / Math.Max(_save.TCode.UpdatesPerSecond, 10);
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(tickMs));

        while (await timer.WaitForNextTickAsync(ct))
        {
            // 1. Drain UI actions
            while (_actions.TryDequeue(out var action))
            {
                try { action(); } catch (Exception ex) { OnLog?.Invoke($"[UiAction] {ex.Message}"); }
            }

            // 2. Build signal list from ParameterStore (reuse pre-allocated list to reduce GC)
            _signals.Clear();
            foreach (var (path, proc) in _processors)
            {
                if (!_store.TryGet(path, out var entry)) continue;
                float processed = proc.Process(entry.Value.AsFloat());
                _signals.Add((proc.Config.Role, processed));
            }

            // 3. Fuse signals into a DeviceCommand
            var rawCmd = _fusion.Fuse(_signals, deltaMs: tickMs);

            // 4. Rhythm detection (uses L0 depth; respects saved RhythmConfig)
            var rc = _save.Rhythm;
            _rhythm.Feed(rawCmd.L0, rc.WindowMs, rc.MinBpm, rc.MaxBpm);
            CurrentBpm = _rhythm.CurrentBpm;

            // 5. Safety constraints
            var safeCmd = _safety.Apply(rawCmd);
            safeCmd = safeCmd with { DeltaMs = tickMs };

            // 5.5 Manual test override for Web UI functional testing.
            // Still passes through SafetySystem so emergency stop and intensity limits remain effective.
            if (_manualOverrideEnabled)
            {
                var manualCmd = _manualOverrideField with { DeltaMs = tickMs };
                safeCmd = _safety.Apply(manualCmd) with { DeltaMs = tickMs };
            }

            _lastCommandField = safeCmd;

            // 6. Transmit
            if (_intiface is { IsConnected: true })
            {
                try { await _intiface.SendAsync(safeCmd); }
                catch (Exception ex) { OnLog?.Invoke($"[Intiface] {ex.Message}"); }
            }
            _tcode?.Send(safeCmd);
            _tcodeUdp?.Send(safeCmd);
            _tcodeTcp?.Send(safeCmd);

            // 7. Record
            _recorder?.Push(safeCmd);
        }
    }

    private async Task SendEmergencyAsync()
    {
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
