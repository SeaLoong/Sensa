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
    private readonly SaveFile? _save;
    private readonly OutputDeviceConfig? _output;
    private readonly Func<TCodeMotionProfile>? _profileResolver;
    private UdpClient? _client;
    private IPEndPoint? _remote;

    private readonly VelocityEstimator _velL0 = new();
    private readonly VelocityEstimator _velR0 = new();
    private readonly VelocityEstimator _velR1 = new();
    private readonly VelocityEstimator _velR2 = new();
    private readonly VelocityEstimator _velL1 = new();
    private readonly VelocityEstimator _velL2 = new();

    public bool IsConnected => _client is not null && _remote is not null;

    public TCodeUdp(SaveFile save) => _save = save;

    public TCodeUdp(OutputDeviceConfig output, Func<TCodeMotionProfile> profileResolver)
    {
        _output = output;
        _profileResolver = profileResolver;
    }

    public void Connect()
    {
        Disconnect();
        var host = GetHost();
        if (string.IsNullOrWhiteSpace(host))
            throw new InvalidOperationException("UDP host is empty.");

        var addrs = Dns.GetHostAddresses(host);
        var addr = addrs.FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork || a.AddressFamily == AddressFamily.InterNetworkV6)
            ?? throw new InvalidOperationException($"Cannot resolve UDP host '{host}'.");

        _remote = new IPEndPoint(addr, GetPort());
        _client = new UdpClient(addr.AddressFamily);
        Console.WriteLine($"[TCode/UDP] Ready: {host}:{GetPort()}");
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
        var profile = ResolveProfile();
        var sb = new StringBuilder();
        AppendAxis(sb, "L0", cmd.L0, profile.L0, _velL0, (int)cmd.DeltaMs);
        AppendAxis(sb, "R0", cmd.R0, profile.R0, _velR0, (int)cmd.DeltaMs);
        AppendAxis(sb, "R1", cmd.R1, profile.R1, _velR1, (int)cmd.DeltaMs);
        AppendAxis(sb, "R2", cmd.R2, profile.R2, _velR2, (int)cmd.DeltaMs);
        AppendAxis(sb, "L1", cmd.L1, profile.L1, _velL1, (int)cmd.DeltaMs);
        AppendAxis(sb, "L2", cmd.L2, profile.L2, _velL2, (int)cmd.DeltaMs);
        return sb.ToString().TrimEnd();
    }

    private void AppendAxis(StringBuilder sb, string axis, float value, TCodeAxisConfig axisConfig, VelocityEstimator vel, int deltaMs)
    {
        if (axisConfig.Invert) value = 1f - value;
        var min = Math.Clamp(axisConfig.Min, 0, 999);
        var max = Math.Clamp(axisConfig.Max, min, 999);
        var mapped = (min + ((max - min) * Math.Clamp(value, 0f, 1f))) / 1000f;
        var pos = Math.Clamp((int)(mapped * 1000f), 0, 999);

        if (PreferSpeedMode())
        {
            var speed = vel.Estimate(mapped, axisConfig.MaxSpeed);
            sb.Append($"{axis}{pos:D3}S{speed:D4} ");
        }
        else
        {
            var duration = Math.Max(deltaMs, 1);
            sb.Append($"{axis}{pos:D3}I{duration:D4} ");
        }
    }

    private string GetHost() => string.IsNullOrWhiteSpace(_output?.Host) ? _save?.UdpTCode.Host ?? "127.0.0.1" : _output.Host;

    private int GetPort() => _output?.Port is > 0 and <= 65535 ? _output.Port : _save?.UdpTCode.Port ?? 9999;

    private bool PreferSpeedMode() => _output?.PreferSpeedMode ?? _save?.TCode.PreferSpeedMode ?? true;

    private TCodeMotionProfile ResolveProfile() => _profileResolver?.Invoke() ?? _save?.ResolveMotionProfile(TCodeProfileTarget.Udp) ?? new TCodeMotionProfile();
}
