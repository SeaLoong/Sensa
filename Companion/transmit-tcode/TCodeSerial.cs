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
    private readonly TCodeConfig _cfg;
    private SerialPort? _port;
    private VelocityEstimator _velL0 = new();
    private VelocityEstimator _velR0 = new();
    private VelocityEstimator _velR1 = new();
    private VelocityEstimator _velR2 = new();
    private VelocityEstimator _velL1 = new();
    private VelocityEstimator _velL2 = new();

    public bool IsConnected => _port?.IsOpen == true;

    public TCodeSerial(TCodeConfig cfg) => _cfg = cfg;

    // ────────────────────────────────────────────────────────────────

    public void Connect()
    {
        Disconnect();
        _port = new SerialPort(_cfg.ComPort, 115200, Parity.None, 8, StopBits.One)
        {
            ReadTimeout  = 100,
            WriteTimeout = 200,
        };
        _port.Open();
        Console.WriteLine($"[TCode] Connected to {_cfg.ComPort}");
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
    }

    public void Dispose() => Disconnect();

    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Send a device command. Maps all TCode axes (L0/R0/R1/R2/L1/L2) with velocity.
    /// OSR2 firmware silently ignores R2/L1/L2; SR6/OSR6 uses all six.
    /// </summary>
    public void Send(DeviceCommand cmd)
    {
        if (_port?.IsOpen != true) return;

        var sb = new System.Text.StringBuilder();

        AppendAxis(sb, "L0", cmd.L0, _cfg.L0Invert, _velL0, (int)cmd.DeltaMs);
        AppendAxis(sb, "R0", cmd.R0, false,          _velR0, (int)cmd.DeltaMs);
        AppendAxis(sb, "R1", cmd.R1, false,          _velR1, (int)cmd.DeltaMs);
        AppendAxis(sb, "R2", cmd.R2, false,          _velR2, (int)cmd.DeltaMs);
        AppendAxis(sb, "L1", cmd.L1, false,          _velL1, (int)cmd.DeltaMs);
        AppendAxis(sb, "L2", cmd.L2, false,          _velL2, (int)cmd.DeltaMs);

        string line = sb.ToString().TrimEnd();
        if (line.Length == 0) return;

        try   { _port.WriteLine(line); }
        catch (Exception ex) { Console.Error.WriteLine($"[TCode] Write error: {ex.Message}"); }
    }

    /// <summary>Park all axes at centre (L0 at 0.5 = mid-stroke).</summary>
    public void Park()
    {
        if (_port?.IsOpen != true) return;
        try { _port.WriteLine("L0500S500 R0500S500 R1500S500 R2500S500 L1500S500 L2500S500"); }
        catch { }
    }

    /// <summary>Emergency stop — sends DSTOP.</summary>
    public void EmergencyStop()
    {
        if (_port?.IsOpen != true) return;
        try { _port.WriteLine("DSTOP"); }
        catch { }
    }

    // ────────────────────────────────────────────────────────────────
    //  Helpers
    // ────────────────────────────────────────────────────────────────

    private void AppendAxis(System.Text.StringBuilder sb, string axis, float value,
                            bool invert, VelocityEstimator vel, int deltaMs)
    {
        if (invert) value = 1f - value;
        float mapped = MapToRange(value);
        int   pos    = (int)(mapped * 1000f);
        pos = Math.Clamp(pos, 0, 999);

        if (_cfg.PreferSpeedMode)
        {
            int speed = vel.Estimate(mapped, _cfg.MaxVelocity);
            sb.Append($"{axis}{pos:D3}S{speed:D4} ");
        }
        else
        {
            int duration = Math.Max(deltaMs, 1);
            sb.Append($"{axis}{pos:D3}I{duration:D4} ");
        }
    }

    /// <summary>Maps normalised [0,1] to device range [MinPos,MaxPos]/1000.</summary>
    private float MapToRange(float v)
    {
        return (_cfg.MinPos + (_cfg.MaxPos - _cfg.MinPos) * v) / 1000f;
    }
}
