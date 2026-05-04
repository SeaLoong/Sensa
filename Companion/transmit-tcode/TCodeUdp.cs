using System.Net;
using System.Net.Sockets;
using System.Text;
using Sensa.Config;
using Sensa.Core;

namespace Sensa.TransmitTCode;

/// <summary>
/// Sends TCode commands over UDP (ASCII + newline).
/// This is intended for network bridges or firmware that accepts TCode via UDP.
/// </summary>
public sealed class TCodeUdp : IDisposable
{
    private readonly TCodeConfig _tcode;
    private readonly UdpTCodeConfig _cfg;
    private UdpClient? _client;
    private IPEndPoint? _remote;

    private readonly VelocityEstimator _velL0 = new();
    private readonly VelocityEstimator _velR0 = new();
    private readonly VelocityEstimator _velR1 = new();
    private readonly VelocityEstimator _velR2 = new();
    private readonly VelocityEstimator _velL1 = new();
    private readonly VelocityEstimator _velL2 = new();

    public bool IsConnected => _client is not null && _remote is not null;

    public TCodeUdp(TCodeConfig tcode, UdpTCodeConfig cfg)
    {
        _tcode = tcode;
        _cfg = cfg;
    }

    public void Connect()
    {
        Disconnect();
        if (string.IsNullOrWhiteSpace(_cfg.Host))
            throw new InvalidOperationException("UDP host is empty.");

        var addrs = Dns.GetHostAddresses(_cfg.Host);
        var addr = addrs.FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork || a.AddressFamily == AddressFamily.InterNetworkV6)
            ?? throw new InvalidOperationException($"Cannot resolve UDP host '{_cfg.Host}'.");

        _remote = new IPEndPoint(addr, _cfg.Port);
        _client = new UdpClient(addr.AddressFamily);
        Console.WriteLine($"[TCode/UDP] Ready: {_cfg.Host}:{_cfg.Port}");
    }

    public void Disconnect()
    {
        _client?.Dispose();
        _client = null;
        _remote = null;
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
            _client!.Send(bytes, bytes.Length, _remote!);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[TCode/UDP] Send error: {ex.Message}");
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
            _client!.Send(bytes, bytes.Length, _remote!);
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
