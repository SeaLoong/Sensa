using Buttplug.Client;
using Buttplug.Core;
using Buttplug.Core.Messages;
using Sensa.Configuration;
using Sensa.Motion;

namespace Sensa.Outputs.Intiface;

/// <summary>
/// Drives Buttplug/Intiface connected devices using Buttplug 5.0.1 (wire protocol v4).
/// Connects via WebSocket (managed intiface-engine child process, or user-specified Intiface Central).
///
/// Default linear device formula:  position01 = Clamp01(1 - L0)
/// L0=0 → device at top (position01=1.0); L0=1 → device at bottom (position01=0.0).
/// </summary>
public sealed partial class IntifaceOutputClient : IAsyncDisposable
{
    static IntifaceOutputClient()
    {
        // Buttplug 5.0.1 lazily writes an unguarded static metadata Dictionary.
        // CLR type initialization serializes these immutable lookups before any
        // client can connect; normal connections and commands remain concurrent.
        // 上游元数据字典首次写入无锁；先借 CLR 类型初始化串行预热，连接和命令仍并行。
        // https://github.com/buttplugio/buttplug-csharp/blob/ec8e6ff175e33dd75778cc91c485ec1a24353915/Buttplug/Core/Messages/ButtplugMessage.cs
        foreach (var messageType in ButtplugUtils.GetAllMessageTypes())
            _ = ButtplugMessage.GetName(messageType);
    }

    private readonly IntifaceConfig _config;
    private ButtplugClient? _client;
    private volatile bool _connected;  // written from event thread, read from loop thread

    private readonly List<ButtplugClientDevice> _devices = new();
    private readonly object _devLock = new();
    private readonly Dictionary<uint, (double Position, uint Duration)> _lastLinearSent = new();
    private readonly Dictionary<uint, double> _lastVibrateSent = new();

    public bool IsConnected => _connected;
    public OutputTelemetry Telemetry { get; } = new();
    public IReadOnlyList<ButtplugClientDevice> Devices
    {
        // Return a copy so callers get a stable snapshot rather than a live view.
        get { lock (_devLock) return new List<ButtplugClientDevice>(_devices).AsReadOnly(); }
    }

    public event Action<string>? OnLog;
    public event Action<string>? OnDebugLog;
    public event Action? DevicesChanged;

    public IntifaceOutputClient(IntifaceConfig config)
    {
        _config = config;
        _featureRoutes = IntifaceFeatureRoute.CloneAndValidate(config.FeatureRoutes);
    }

    // ────────────────────────────────────────────────────────────────

    public async Task ConnectAsync(CancellationToken ct = default)
    {
        var client = new ButtplugClient("Sensa");
        lock (_devLock)
        {
            _client = client; _connected = false;
            _devices.Clear(); _lastLinearSent.Clear(); _lastVibrateSent.Clear(); ClearMappedOutputs();
        }
        client.DeviceAdded += (_, e) =>
        {
            lock (_devLock)
            {
                if (!ReferenceEquals(_client, client)) return;
                ++_motionEpoch;
                _devices.RemoveAll(device => device.Index == e.Device.Index);
                _lastLinearSent.Remove(e.Device.Index); _lastVibrateSent.Remove(e.Device.Index); ClearMappedOutputs(e.Device.Index);
                _devices.Add(e.Device);
            }
            OnLog?.Invoke($"Device added: {e.Device.Name}");
            DevicesChanged?.Invoke();
        };
        client.DeviceRemoved += (_, e) =>
        {
            lock (_devLock)
            {
                if (!ReferenceEquals(_client, client)) return;
                ++_motionEpoch;
                _devices.Remove(e.Device);
                _lastLinearSent.Remove(e.Device.Index);
                _lastVibrateSent.Remove(e.Device.Index);
                ClearMappedOutputs(e.Device.Index);
                Telemetry.RemovePrefix($"#{e.Device.Index}/");
            }
            OnLog?.Invoke($"Device removed: {e.Device.Name}");
            DevicesChanged?.Invoke();
        };
        client.ServerDisconnect += (_, _) =>
        {
            lock (_devLock)
            {
                if (!ReferenceEquals(_client, client)) return;
                _connected = false;
                Telemetry.SetState("idle",clear:true);
                _lastLinearSent.Clear();
                _lastVibrateSent.Clear();
                _devices.Clear(); ClearMappedOutputs();
            }
            OnLog?.Invoke("Intiface disconnected.");
            DevicesChanged?.Invoke();
        };

        // ButtplugClientExtensions.ConnectAsync(client, uri, token)
        await client.ConnectAsync(new Uri(_config.WebsocketAddress), ct).WaitAsync(TimeSpan.FromSeconds(5), ct);
        lock (_devLock)
        {
            if (!ReferenceEquals(_client, client)) throw new OperationCanceledException("The Intiface connection was replaced.");
            _connected = true;
        }
        OnLog?.Invoke($"Intiface connected: {_config.WebsocketAddress}");
        DevicesChanged?.Invoke();
    }

    public async Task DisconnectAsync()
    {
        if (_client is null) return;
        // Ensure StopAll and Disconnect both run even if StopAll throws.
        try { await StopAllAsync(); } catch { }
        try { await _client.DisconnectAsync().WaitAsync(TimeSpan.FromSeconds(1)); } catch { }
        _connected = false;
        Telemetry.SetState("idle",clear:true);
        lock (_devLock)
        {
            _devices.Clear();
            _lastLinearSent.Clear();
            _lastVibrateSent.Clear();
            ClearMappedOutputs();
        }
        DevicesChanged?.Invoke();
    }

    public async Task StartScanAsync() =>
        await (_client?.StartScanningAsync() ?? Task.CompletedTask);

    public async Task StopScanAsync() =>
        await (_client?.StopScanningAsync() ?? Task.CompletedTask);

    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Send a MotionFrame to all connected devices.
    /// Uses Buttplug wire v4 feature capabilities; default vibration reads the configured axis.
    /// 使用 Buttplug wire v4 特征接口；默认振动读取明确配置的轴。
    /// </summary>
    public async Task SendAsync(MotionFrame frame)
    {
        if (!_connected) return;
        using var deadline = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));
        long epoch;
        lock (_devLock) epoch = _motionEpoch;

        // L0=0 → top (position=1.0); L0=1 → bottom (position=0.0)
        double position01 = Math.Clamp(1.0 - frame.L0, 0.0, 1.0);
        uint   durationMs = (uint)Math.Max(frame.DeltaMs, 1.0);

        List<ButtplugClientDevice> snapshot;
        lock (_devLock) snapshot = new List<ButtplugClientDevice>(_devices);

        bool failed=false;
        foreach (var device in snapshot)
        {
            try
            {
                // Position (linear) features
                var posFeatures = IntifacePositionFeatures.For(device).Where(feature => !OverridesDefault(device, feature, "Position")).ToList();
                bool shouldSendLinear;
                lock (_devLock) shouldSendLinear = !_lastLinearSent.TryGetValue(device.Index, out var lastLinear) || Math.Abs(lastLinear.Position - position01) >= 0.001 || lastLinear.Duration != durationMs;
                var emitted = new List<string>();
                if (posFeatures.Count > 0 && shouldSendLinear && (frame.ActiveAxes is null || frame.ActiveAxes.Contains(MotionAxis.L0)))
                {
                    foreach (var f in posFeatures)
                    {
                        deadline.Token.ThrowIfCancellationRequested();
                        if (!IsMotionEpochCurrent(epoch)) return;
                        await f.RunOutputAsync(IntifacePositionFeatures.Command(f.FeatureDefinition, position01, durationMs), deadline.Token).WaitAsync(deadline.Token);
                    }

                    lock (_devLock)
                        if (epoch == _motionEpoch) _lastLinearSent[device.Index] = (position01, durationMs);
                    if (!IsMotionEpochCurrent(epoch)) return;
                    if(posFeatures.Count>0)Telemetry.RecordTarget($"#{device.Index}/Position",$"{device.Name} · 位置",position01*100);

                    emitted.Add($"linear={position01:F3}@{durationMs}ms");
                }

                // Vibrate features: always update (including sending 0) so motors can stop cleanly.
                var vibFeatures = device.GetFeaturesWithOutput(OutputType.Vibrate).Where(feature => !OverridesDefault(device, feature, "Vibrate")).ToList();
                if (vibFeatures.Count > 0 && (frame.ActiveAxes is null || frame.ActiveAxes.Contains(Enum.Parse<MotionAxis>(IntifaceConfig.NormalizeVibrationAxis(_config.VibrationAxis)))))
                {
                    var selectedValue = IntifaceConfig.NormalizeVibrationAxis(_config.VibrationAxis) switch
                    {
                        "V1" => frame.V1,
                        "V2" => frame.V2,
                        "L0" => frame.L0,
                        _ => frame.V0,
                    };
                    double vibrateVal = float.IsFinite(selectedValue) ? Math.Clamp(selectedValue, 0.0, 1.0) : 0;
                    bool shouldSendVibrate;
                    lock (_devLock) shouldSendVibrate = !_lastVibrateSent.TryGetValue(device.Index, out var lastVibrate)
                        || (vibrateVal == 0 && lastVibrate != 0) || Math.Abs(lastVibrate - vibrateVal) >= 0.001;
                    if (shouldSendVibrate)
                    {
                        foreach (var f in vibFeatures)
                        {
                            deadline.Token.ThrowIfCancellationRequested();
                            if (!IsMotionEpochCurrent(epoch)) return;
                            await f.RunOutputAsync(DeviceOutput.Vibrate.Percent(vibrateVal), deadline.Token).WaitAsync(deadline.Token);
                        }

                        lock (_devLock)
                            if (epoch == _motionEpoch) _lastVibrateSent[device.Index] = vibrateVal;
                        if (!IsMotionEpochCurrent(epoch)) return;
                        Telemetry.RecordTarget($"#{device.Index}/Vibrate",$"{device.Name} · 震动",vibrateVal*100);

                        emitted.Add($"vibrate={vibrateVal:F3}");
                    }
                }

                await SendMappedOutputsAsync(device, frame, epoch, deadline.Token).ConfigureAwait(false);

                if (emitted.Count > 0)
                    OnDebugLog?.Invoke($"TX {device.Name}#{device.Index} {string.Join(" ", emitted)}");
            }
            catch (OperationCanceledException) when (deadline.IsCancellationRequested)
            {
                OnLog?.Invoke("[Intiface] Output deadline exceeded; remaining device commands discarded.");
                Telemetry.SetState("error");
                return;
            }
            catch (Exception ex)
            {
                OnLog?.Invoke($"[Intiface] Send error ({device.Name}): {ex.Message}");
                failed=true;
            }
        }
        if(failed)Telemetry.SetState("error");
    }

    public async Task StopAllAsync()
    {
        if (_client is null) return;
        lock (_devLock) ClearMappedOutputs();
        try { await _client.StopAllDevicesAsync().WaitAsync(TimeSpan.FromMilliseconds(500)); Telemetry.SetState("stopped",clear:true); } catch { Telemetry.SetState("error"); }
        lock (_devLock)
        {
            _lastLinearSent.Clear();
            _lastVibrateSent.Clear();
            ClearMappedOutputs();
        }
        OnDebugLog?.Invoke("TX StopAll");
    }

    public async ValueTask DisposeAsync() => await DisconnectAsync();
}

// ═══════════════════════════════════════════════════════════════════════
//  IntifaceEngineHost — manages the embedded intiface-engine.exe process
// ═══════════════════════════════════════════════════════════════════════

public sealed class EmbeddedIntifaceEngine : IDisposable
{
    private System.Diagnostics.Process? _process;
    private readonly int _port;

    public bool IsRunning => _process?.HasExited == false;

    public EmbeddedIntifaceEngine(int port = 12345) => _port = port;

    /// <summary>
    /// Looks for intiface-engine.exe next to the executable or in %LOCALAPPDATA%\Sensa\,
    /// then launches it as a child process.
    /// </summary>
    public bool Start()
    {
        if (IsRunning) return true;

        var enginePath = FindEngine();
        if (enginePath is null)
        {
            Console.Error.WriteLine("[Intiface] intiface-engine not found. " +
                                    "Use Intiface Central or place it next to the executable.");
            return false;
        }

        var psi = new System.Diagnostics.ProcessStartInfo
        {
            FileName        = enginePath,
            Arguments       = $"--websocket-port {_port} --use-bluetooth-le --use-hid " +
                               "--crash-reporting false",
            UseShellExecute = false,
            CreateNoWindow  = true,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
        };

        _process = new System.Diagnostics.Process { StartInfo = psi, EnableRaisingEvents = true };
        _process.OutputDataReceived += (_, e) => { if (e.Data != null) Console.WriteLine($"[intiface] {e.Data}"); };
        _process.ErrorDataReceived  += (_, e) => { if (e.Data != null) Console.Error.WriteLine($"[intiface] {e.Data}"); };
        _process.Start();
        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();
        Console.WriteLine($"[Intiface] Engine started (PID {_process.Id})");
        return true;
    }

    public void Stop()
    {
        try { _process?.Kill(entireProcessTree: true); } catch { }
        _process?.Dispose();
        _process = null;
    }

    public void Dispose() => Stop();

    private static string? FindEngine()
    {
        var executable = OperatingSystem.IsWindows() ? "intiface-engine.exe" : "intiface-engine";
        var sibling = Path.Combine(AppContext.BaseDirectory, executable);
        if (File.Exists(sibling)) return sibling;

        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var cached = Path.Combine(localAppData, "Sensa", executable);
        if (File.Exists(cached)) return cached;

        return null;
    }
}

