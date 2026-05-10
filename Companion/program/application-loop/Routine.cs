using System.Diagnostics;
using Sensa.Config;
using Sensa.Core;
using Sensa.TransmitIntiface;
using Sensa.TransmitTCode;
using Sensa.ServiceRecording;
using Sensa.UiActions;

namespace Sensa.ApplicationLoop;

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
    private readonly Func<DeviceCommand, Task>? _sendOutputsAsync;
    private readonly Func<Task>? _emergencyStopAsync;
    private readonly Func<int>? _loopRateResolver;

    // Per-signal processors; duplicate OSC paths are allowed so one parameter can drive multiple axes.
    private readonly List<(string Path, SignalProcessor Processor)> _processors = new();
    private readonly SignalFusion _fusion = new();

    // Pre-allocated signal list — reused every tick to avoid per-frame GC allocations
    private readonly List<(SignalRole, float)> _signals = new();

    private CancellationTokenSource? _cts;
    private Task? _loopTask;

    // ── Public computed state for UI display ───────────────────────
    private volatile DeviceCommand _lastCommandField = DeviceCommand.Zero;
    private volatile DeviceCommand _manualOverrideField = DeviceCommand.Zero;
    private volatile bool _manualOverrideEnabled;
    private volatile InputMode _inputMode = InputMode.Osc;
    private volatile bool _emergency;
    private volatile bool _inputActive; // user-facing master switch: false → no data sent
    public DeviceCommand LastCommand  => _lastCommandField;
    public DeviceCommand ManualOverrideCommand => _manualOverrideField;
    public bool          ManualOverrideEnabled => _manualOverrideEnabled;
    public InputMode     CurrentInputMode => _inputMode;
    public bool          IsRunning    => _cts is not null && !_cts.IsCancellationRequested;
    public bool          IsEmergency  => _emergency;
    public bool          InputActive  => _inputActive;

    private int _tickCounter;
    private DeviceCommand? _lastSentCmd; // for event-driven dedup

    // ── Events ─────────────────────────────────────────────────────
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
        _loopRateResolver = loopRateResolver;

        RebuildProcessors();
        _osc.OnAvatarChange += () =>
        {
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
        _emergency = true;
        _ = SendEmergencyAsync();
    }

    public void ClearEmergency() => _emergency = false;

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

        // Auto-enable input when switching to a non-OSC mode
        if (mode != InputMode.Osc)
            _inputActive = true;

        OnLog?.Invoke($"[Input] Mode switched to {mode}.");
    }

    public void SetInputActive(bool active)
    {
        _inputActive = active;
        OnLog?.Invoke($"[Input] {(active ? "Active" : "Inactive")}.");
    }

    /// <summary>Directly send a command to all outputs (event-driven path for manual/script).</summary>
    public Task SendToOutputsAsync(DeviceCommand cmd) =>
        _sendOutputsAsync?.Invoke(cmd) ?? Task.CompletedTask;

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

            // 4. Select active input source.
            var selectedInput = _inputMode switch
            {
                InputMode.Manual when _manualOverrideEnabled => _manualOverrideField with { DeltaMs = deltaMs },
                InputMode.Manual => DeviceCommand.Zero with { DeltaMs = deltaMs },
                InputMode.Script => _scriptInput.Sample(deltaMs),
                _ => rawCmd with { DeltaMs = deltaMs },
            };

            // 5. Emergency stop: zero all axes, centre rotation/linear offsets
            var cmd = _emergency
                ? selectedInput with { L0 = 0f, R0 = 0.5f, R1 = 0.5f, R2 = 0.5f, L1 = 0.5f, L2 = 0.5f, V0 = 0f, V1 = 0f, V2 = 0f, A0 = 0.5f, DeltaMs = deltaMs }
                : selectedInput;

            _lastCommandField = cmd;

            // When input is inactive, skip transmission entirely (device holds last position)
            if (!_inputActive)
            {
                var idleMs = tickMs - Stopwatch.GetElapsedTime(now).TotalMilliseconds;
                if (idleMs > 0.5)
                    await Task.Delay(TimeSpan.FromMilliseconds(idleMs), ct);
                continue;
            }

            // Periodic debug log (every 50 ticks ≈ 1s at 50Hz)
            _tickCounter++;
            if (_tickCounter % 50 == 0)
            {
                OnDebugLog?.Invoke(
                    $"[Loop] mode={_inputMode} emg={_emergency} " +
                    $"L0={cmd.L0:F2} R0={cmd.R0:F2} R1={cmd.R1:F2} R2={cmd.R2:F2} " +
                    $"L1={cmd.L1:F2} L2={cmd.L2:F2} V0={cmd.V0:F2} V1={cmd.V1:F2} V2={cmd.V2:F2} A0={cmd.A0:F2} " +
                    $"deltaMs={cmd.DeltaMs:F1}");
            }

            // 6. Transmit — event-driven: only send when the command actually differs from last sent
            if (!_emergency && _inputActive)
            {
                var changed = _lastSentCmd is null ||
                    Math.Abs(cmd.L0 - _lastSentCmd.L0) > 0.001f ||
                    Math.Abs(cmd.R0 - _lastSentCmd.R0) > 0.001f ||
                    Math.Abs(cmd.R1 - _lastSentCmd.R1) > 0.001f ||
                    Math.Abs(cmd.R2 - _lastSentCmd.R2) > 0.001f ||
                    Math.Abs(cmd.L1 - _lastSentCmd.L1) > 0.001f ||
                    Math.Abs(cmd.L2 - _lastSentCmd.L2) > 0.001f ||
                    Math.Abs(cmd.V0 - _lastSentCmd.V0) > 0.001f ||
                    Math.Abs(cmd.V1 - _lastSentCmd.V1) > 0.001f ||
                    Math.Abs(cmd.V2 - _lastSentCmd.V2) > 0.001f ||
                    Math.Abs(cmd.A0 - _lastSentCmd.A0) > 0.001f;

                if (changed)
                {
                    _lastSentCmd = cmd;
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
                        if (_save.TCode.Enabled)
                            _tcode?.Send(cmd);
                        if (_save.UdpTCode.Enabled)
                            _tcodeUdp?.Send(cmd);
                        if (_save.TcpTCode.Enabled)
                            _tcodeTcp?.Send(cmd);
                    }
                }
            }

            // 7. Record
            _recorder?.Push(cmd);

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
