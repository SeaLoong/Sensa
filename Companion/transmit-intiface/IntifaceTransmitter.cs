using Buttplug.Client;
using Buttplug.Core.Messages;
using Sensa.Config;
using Sensa.Core;

namespace Sensa.TransmitIntiface;

/// <summary>
/// Drives Buttplug/Intiface connected devices using the Buttplug v5 API.
/// Connects via WebSocket (managed intiface-engine child process, or user-specified Intiface Central).
///
/// Linear device formula:  position01 = Clamp01(1 - L0)
/// L0=0 → device at top (position01=1.0); L0=1 → device at bottom (position01=0.0).
/// </summary>
public sealed class IntifaceTransmitter : IAsyncDisposable
{
    private readonly IntifaceConfig _cfg;
    private ButtplugClient? _client;
    private volatile bool _connected;  // written from event thread, read from loop thread

    private readonly List<ButtplugClientDevice> _devices = new();
    private readonly object _devLock = new();

    public bool IsConnected => _connected;
    public IReadOnlyList<ButtplugClientDevice> Devices
    {
        // Return a copy so callers get a stable snapshot rather than a live view.
        get { lock (_devLock) return new List<ButtplugClientDevice>(_devices).AsReadOnly(); }
    }

    public event Action<string>? OnLog;

    public IntifaceTransmitter(IntifaceConfig cfg) => _cfg = cfg;

    // ────────────────────────────────────────────────────────────────

    public async Task ConnectAsync(CancellationToken ct = default)
    {
        _client = new ButtplugClient("Sensa");
        _client.DeviceAdded    += (_, e) => { lock (_devLock) _devices.Add(e.Device);    OnLog?.Invoke($"Device added: {e.Device.Name}"); };
        _client.DeviceRemoved  += (_, e) => { lock (_devLock) _devices.Remove(e.Device); OnLog?.Invoke($"Device removed: {e.Device.Name}"); };
        _client.ServerDisconnect += (_, _) => { _connected = false; OnLog?.Invoke("Intiface disconnected."); };

        // ButtplugClientExtensions.ConnectAsync(client, uri, token)
        await _client.ConnectAsync(new Uri(_cfg.WebsocketAddress), ct);
        _connected = true;
        OnLog?.Invoke($"Intiface connected: {_cfg.WebsocketAddress}");
    }

    public async Task DisconnectAsync()
    {
        if (_client is null) return;
        // Ensure StopAll and Disconnect both run even if StopAll throws.
        try { await StopAllAsync(); } catch { }
        try { await _client.DisconnectAsync(); } catch { }
        _connected = false;
        lock (_devLock) _devices.Clear();
    }

    public async Task StartScanAsync() =>
        await (_client?.StartScanningAsync() ?? Task.CompletedTask);

    public async Task StopScanAsync() =>
        await (_client?.StopScanningAsync() ?? Task.CompletedTask);

    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Send a DeviceCommand to all connected devices.
    /// Uses Buttplug v5 feature-based API.
    /// </summary>
    public async Task SendAsync(DeviceCommand cmd)
    {
        if (!_connected) return;

        // L0=0 → top (position=1.0); L0=1 → bottom (position=0.0)
        double position01 = Math.Clamp(1.0 - cmd.L0, 0.0, 1.0);
        uint   durationMs = (uint)Math.Max(cmd.DeltaMs, 1.0);

        List<ButtplugClientDevice> snapshot;
        lock (_devLock) snapshot = new List<ButtplugClientDevice>(_devices);

        foreach (var device in snapshot)
        {
            try
            {
                // Position (linear) features
                var posFeatures = device.GetFeaturesWithOutput(OutputType.Position).ToList();
                foreach (var f in posFeatures)
                    await f.RunOutputAsync(DeviceOutput.PositionWithDuration.Percent(position01, durationMs));

                // Vibrate features: always update (including sending 0) so motors can stop cleanly.
                var vibFeatures = device.GetFeaturesWithOutput(OutputType.Vibrate).ToList();
                if (vibFeatures.Count > 0)
                {
                    double vibrateVal = posFeatures.Count == 0
                        ? Math.Clamp(cmd.L0, 0.0, 1.0)    // depth → vibrate on linear-less devices
                        : Math.Clamp(cmd.Vibrate, 0.0, 1.0);
                    foreach (var f in vibFeatures)
                        await f.RunOutputAsync(DeviceOutput.Vibrate.Percent(vibrateVal));
                }
            }
            catch (Exception ex)
            {
                OnLog?.Invoke($"[Intiface] Send error ({device.Name}): {ex.Message}");
            }
        }
    }

    public async Task StopAllAsync()
    {
        if (_client is null) return;
        try { await _client.StopAllDevicesAsync(); } catch { }
    }

    public async ValueTask DisposeAsync() => await DisconnectAsync();
}

// ═══════════════════════════════════════════════════════════════════════
//  IntifaceEngineHost — manages the embedded intiface-engine.exe process
// ═══════════════════════════════════════════════════════════════════════

public sealed class IntifaceEngineHost : IDisposable
{
    private System.Diagnostics.Process? _process;
    private readonly int _port;

    public bool IsRunning => _process?.HasExited == false;

    public IntifaceEngineHost(int port = 12345) => _port = port;

    /// <summary>
    /// Looks for intiface-engine.exe next to the executable or in %LOCALAPPDATA%\Sensa\,
    /// then launches it as a child process.
    /// </summary>
    public void Start()
    {
        if (IsRunning) return;

        var enginePath = FindEngine();
        if (enginePath is null)
        {
            Console.Error.WriteLine("[Intiface] intiface-engine.exe not found. " +
                                    "Use Intiface Central or place it next to the executable.");
            return;
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
        var sibling = Path.Combine(AppContext.BaseDirectory, "intiface-engine.exe");
        if (File.Exists(sibling)) return sibling;

        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var cached = Path.Combine(localAppData, "Sensa", "intiface-engine.exe");
        if (File.Exists(cached)) return cached;

        return null;
    }
}

