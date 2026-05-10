using System.IO.Ports;
using Sensa.Config;
using Sensa.Core;

namespace Sensa.TransmitTCode;

/// <summary>
/// Sends TCode commands to an OSR2/SR6/OSR6 device over a COM serial port.
/// Speed mode: L0{pos*1000}S{velocity}
/// Interval mode (fallback): L0{pos*1000}I{durationMs}
///
/// OSR2 drives L0, R0, R1 (3 axes).
/// SR6/OSR6 drives all six axes: L0, R0, R1, R2 (twist), L1 (surge), L2 (sway).
/// Unknown axes sent to an OSR2 are silently ignored by the firmware.
///
/// Thread-safe: Invoke <see cref="Send"/> from the main loop thread only.
/// </summary>
public sealed class TCodeSerial : IDisposable
{
    private readonly SaveFile? _save;
    private readonly OutputDeviceConfig? _output;
    private readonly Func<TCodeMotionProfile>? _profileResolver;
    private SerialPort? _port;
    private VelocityEstimator _velL0 = new();
    private VelocityEstimator _velR0 = new();
    private VelocityEstimator _velR1 = new();
    private VelocityEstimator _velR2 = new();
    private VelocityEstimator _velL1 = new();
    private VelocityEstimator _velL2 = new();
    private VelocityEstimator _velV0 = new();
    private VelocityEstimator _velV1 = new();
    private VelocityEstimator _velV2 = new();
    private VelocityEstimator _velA0 = new();
    private double _pendingDeltaMs;
    private long _centerDeadlineMs; // 0 = no center in progress
    private DeviceCommand? _lastSentCmd;
    private string? _lastSentLine;

    public bool IsConnected => _port?.IsOpen == true;

    public TCodeSerial(SaveFile save) => _save = save;

    public TCodeSerial(OutputDeviceConfig output, Func<TCodeMotionProfile> profileResolver)
    {
        _output = output;
        _profileResolver = profileResolver;
    }

    // ────────────────────────────────────────────────────────────────

    public void Connect()
    {
        Disconnect();
        _port = new SerialPort(GetComPort(), 115200, Parity.None, 8, StopBits.One)
        {
            ReadTimeout  = 100,
            WriteTimeout = 200,
        };
        _port.Open();
        Console.WriteLine($"[TCode] Connected to {GetComPort()}");
    }

    public void Disconnect()
    {
        if (_port?.IsOpen == true)
        {
            try { _port.WriteLine("DSTOP"); } catch { }
            _port.Close();
        }
        _port?.Dispose();
        _port = null;
        _pendingDeltaMs = 0;
        _centerDeadlineMs = 0;
    }

    public void Dispose() => Disconnect();

    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Send a device command. Maps all TCode axes (L0/L1/L2/R0/R1/R2/V0/V1/V2/A0).
    /// OSR2 firmware silently ignores unsupported axes; SR6/OSR6 uses all ten.
    /// </summary>
    public void Send(DeviceCommand cmd)
    {
        if (_port?.IsOpen != true) return;

        // During center period override position to neutral regardless of loop command
        if (_centerDeadlineMs > 0)
        {
            if (Environment.TickCount64 < _centerDeadlineMs)
            {
                // Use the pendingDeltaMs accumulation but override all values to centre
                _pendingDeltaMs += Math.Max(cmd.DeltaMs, 0);
                var ci = 1000.0 / Math.Max(GetUpdatesPerSecond(), 10);
                if (_pendingDeltaMs + 0.001 < ci)
                    return;
                // Send another centre command while centering
                _pendingDeltaMs = 0;
                try { _port.WriteLine("L0500I2000 L1500I2000 L2500I2000 R0500I2000 R1500I2000 R2500I2000 V0000I2000 V1000I2000 V2000I2000 A0500I2000"); }
                catch { }
                return;
            }
            _centerDeadlineMs = 0; // centre period done, resume normal operation
        }

        _pendingDeltaMs += Math.Max(cmd.DeltaMs, 0);
        var minIntervalMs = 1000.0 / Math.Max(GetUpdatesPerSecond(), 10);
        if (_pendingDeltaMs + 0.001 < minIntervalMs)
            return;

        var sendCmd = cmd with { DeltaMs = Math.Max(_pendingDeltaMs, 1) };
        _pendingDeltaMs = 0;

        // Skip sending if command unchanged since last send (event-driven optimization)
        if (_lastSentCmd is not null &&
            sendCmd.L0 == _lastSentCmd.L0 &&
            sendCmd.R0 == _lastSentCmd.R0 &&
            sendCmd.R1 == _lastSentCmd.R1 &&
            sendCmd.R2 == _lastSentCmd.R2 &&
            sendCmd.L1 == _lastSentCmd.L1 &&
            sendCmd.L2 == _lastSentCmd.L2 &&
            sendCmd.V0 == _lastSentCmd.V0 &&
            sendCmd.V1 == _lastSentCmd.V1 &&
            sendCmd.V2 == _lastSentCmd.V2 &&
            sendCmd.A0 == _lastSentCmd.A0)
            return;

        _lastSentCmd = sendCmd;

        var profile = ResolveProfile();

        var sb = new System.Text.StringBuilder();

        AppendAxis(sb, "L0", sendCmd.L0, profile.L0, _velL0, (int)sendCmd.DeltaMs);
        AppendAxis(sb, "L1", sendCmd.L1, profile.L1, _velL1, (int)sendCmd.DeltaMs);
        AppendAxis(sb, "L2", sendCmd.L2, profile.L2, _velL2, (int)sendCmd.DeltaMs);
        AppendAxis(sb, "R0", sendCmd.R0, profile.R0, _velR0, (int)sendCmd.DeltaMs);
        AppendAxis(sb, "R1", sendCmd.R1, profile.R1, _velR1, (int)sendCmd.DeltaMs);
        AppendAxis(sb, "R2", sendCmd.R2, profile.R2, _velR2, (int)sendCmd.DeltaMs);
        AppendAxis(sb, "V0", sendCmd.V0, profile.V0, _velV0, (int)sendCmd.DeltaMs);
        AppendAxis(sb, "V1", sendCmd.V1, profile.V1, _velV1, (int)sendCmd.DeltaMs);
        AppendAxis(sb, "V2", sendCmd.V2, profile.V2, _velV2, (int)sendCmd.DeltaMs);
        AppendAxis(sb, "A0", sendCmd.A0, profile.A0, _velA0, (int)sendCmd.DeltaMs);

        string line = sb.ToString().TrimEnd();
        if (line.Length == 0) return;

        if (line == _lastSentLine) return; // identical serialised string — skip
        _lastSentLine = line;
        try   { _port.WriteLine(line); }
        catch (Exception ex) { Console.Error.WriteLine($"[TCode] Write error: {ex.Message}"); }
    }

    /// <summary>Slowly return all axes to centre (~2 s). Call once after connect; not for emergency.</summary>
    public void Center()
    {
        if (_port?.IsOpen != true) return;
        _centerDeadlineMs = Environment.TickCount64 + 2200; // 2.2s to allow for timing jitter
        Console.WriteLine($"[TCode] Centering on {GetComPort()}");
        try { _port.WriteLine("L0500I2000 L1500I2000 L2500I2000 R0500I2000 R1500I2000 R2500I2000 V0000I2000 V1000I2000 V2000I2000 A0500I2000"); }
        catch { }
    }

    /// <summary>Emergency stop — sends DSTOP.</summary>
    public void EmergencyStop()
    {
        if (_port?.IsOpen != true) return;
        _pendingDeltaMs = 0;
        try { _port.WriteLine("DSTOP"); }
        catch { }
    }

    // ────────────────────────────────────────────────────────────────
    //  Helpers
    // ────────────────────────────────────────────────────────────────

    private void AppendAxis(System.Text.StringBuilder sb, string axis, float value,
                            TCodeAxisConfig axisConfig, VelocityEstimator vel, int deltaMs)
    {
        if (axisConfig.Invert) value = 1f - value;
        float mapped = MapToRange(value, axisConfig);
        int   pos    = (int)(mapped * 1000f);
        pos = Math.Clamp(pos, 0, 999);

        if (PreferSpeedMode())
        {
            int speed = vel.Estimate(mapped, axisConfig.MaxSpeed);
            sb.Append($"{axis}{pos:D3}S{speed:D4} ");
        }
        else
        {
            int duration = Math.Max(deltaMs, 1);
            sb.Append($"{axis}{pos:D3}I{duration:D4} ");
        }
    }

    /// <summary>Maps normalised [0,1] to device range [Min,Max]/1000.</summary>
    private static float MapToRange(float v, TCodeAxisConfig axisConfig)
    {
        var min = Math.Clamp(axisConfig.Min, 0, 999);
        var max = Math.Clamp(axisConfig.Max, min, 999);
        return (min + ((max - min) * Math.Clamp(v, 0f, 1f))) / 1000f;
    }

    private string GetComPort() => string.IsNullOrWhiteSpace(_output?.ComPort) ? _save?.TCode.ComPort ?? "COM3" : _output.ComPort;

    private int GetUpdatesPerSecond() => Math.Clamp(_output?.UpdatesPerSecond ?? _save?.TCode.UpdatesPerSecond ?? 50, 10, 240);

    private bool PreferSpeedMode() => _output?.PreferSpeedMode ?? _save?.TCode.PreferSpeedMode ?? true;

    private TCodeMotionProfile ResolveProfile() => _profileResolver?.Invoke() ?? _save?.ResolveMotionProfile(TCodeProfileTarget.TCode) ?? new TCodeMotionProfile();
}
