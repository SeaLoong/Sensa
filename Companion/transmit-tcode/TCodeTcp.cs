using System.Net.Sockets;
using System.Text;
using Sensa.Config;
using Sensa.Core;

namespace Sensa.TransmitTCode;

/// <summary>
/// Sends TCode commands over TCP (ASCII + newline).
/// </summary>
public sealed class TCodeTcp : IDisposable
{
    private readonly TCodeConfig _tcode;
    private readonly TcpTCodeConfig _cfg;
    private TcpClient? _client;
    private NetworkStream? _stream;

    private readonly VelocityEstimator _velL0 = new();
    private readonly VelocityEstimator _velR0 = new();
    private readonly VelocityEstimator _velR1 = new();
    private readonly VelocityEstimator _velR2 = new();
    private readonly VelocityEstimator _velL1 = new();
    private readonly VelocityEstimator _velL2 = new();

    public bool IsConnected => _client?.Connected == true && _stream is not null;

    public TCodeTcp(TCodeConfig tcode, TcpTCodeConfig cfg)
    {
        _tcode = tcode;
        _cfg = cfg;
    }

    public void Connect()
    {
        Disconnect();
        if (string.IsNullOrWhiteSpace(_cfg.Host))
            throw new InvalidOperationException("TCP host is empty.");

        _client = new TcpClient();
        _client.Connect(_cfg.Host, _cfg.Port);
        _stream = _client.GetStream();
        Console.WriteLine($"[TCode/TCP] Connected: {_cfg.Host}:{_cfg.Port}");
    }

    public void Disconnect()
    {
        try { _stream?.Dispose(); } catch { }
        _stream = null;
        try { _client?.Close(); } catch { }
        _client = null;
    }

    public void Dispose() => Disconnect();

    public void Send(DeviceCommand cmd)
    {
        if (!IsConnected) return;
        var line = BuildLine(cmd);
        if (line.Length == 0) return;

        try
        {
            var bytes = Encoding.ASCII.GetBytes(line + "\n");
            _stream!.Write(bytes, 0, bytes.Length);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[TCode/TCP] Send error: {ex.Message}");
        }
    }

    public void Park()
    {
        if (!IsConnected) return;
        SendRaw("L0500S500 R0500S500 R1500S500 R2500S500 L1500S500 L2500S500\n");
    }

    public void EmergencyStop()
    {
        if (!IsConnected) return;
        SendRaw("DSTOP\n");
    }

    private void SendRaw(string text)
    {
        if (!IsConnected) return;
        try
        {
            var bytes = Encoding.ASCII.GetBytes(text);
            _stream!.Write(bytes, 0, bytes.Length);
        }
        catch { }
    }

    private string BuildLine(DeviceCommand cmd)
    {
        var sb = new StringBuilder();
        AppendAxis(sb, "L0", cmd.L0, _tcode.L0Invert, _velL0, (int)cmd.DeltaMs);
        AppendAxis(sb, "R0", cmd.R0, false, _velR0, (int)cmd.DeltaMs);
        AppendAxis(sb, "R1", cmd.R1, false, _velR1, (int)cmd.DeltaMs);
        AppendAxis(sb, "R2", cmd.R2, false, _velR2, (int)cmd.DeltaMs);
        AppendAxis(sb, "L1", cmd.L1, false, _velL1, (int)cmd.DeltaMs);
        AppendAxis(sb, "L2", cmd.L2, false, _velL2, (int)cmd.DeltaMs);
        return sb.ToString().TrimEnd();
    }

    private void AppendAxis(StringBuilder sb, string axis, float value, bool invert, VelocityEstimator vel, int deltaMs)
    {
        if (invert) value = 1f - value;
        var mapped = (_tcode.MinPos + (_tcode.MaxPos - _tcode.MinPos) * value) / 1000f;
        var pos = Math.Clamp((int)(mapped * 1000f), 0, 999);

        if (_tcode.PreferSpeedMode)
        {
            var speed = vel.Estimate(mapped, _tcode.MaxVelocity);
            sb.Append($"{axis}{pos:D3}S{speed:D4} ");
        }
        else
        {
            var duration = Math.Max(deltaMs, 1);
            sb.Append($"{axis}{pos:D3}I{duration:D4} ");
        }
    }
}
