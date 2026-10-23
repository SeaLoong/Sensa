using System.Net;
using System.Net.Sockets;
using System.Text;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Signals;

namespace Sensa.Outputs.TCode;

/// <summary>
/// Sends delta-only TCode commands over UDP.
/// </summary>
public sealed class TCodeUdpOutput : IDisposable
{
    private readonly object _ioGate = new();
    private readonly TimeProvider _timeProvider;
    private readonly AppConfig? _config;
    private readonly OutputDeviceConfig? _output;
    private readonly Func<TCodeMotionProfile>? _profileResolver;
    private readonly Dictionary<MotionAxis, AxisVelocityTracker> _velocity = MotionAxisHelper.All.ToDictionary(axis => axis, axis => new AxisVelocityTracker());
    private UdpClient? _client;
    private IPEndPoint? _remote;
    public OutputTelemetry Telemetry { get; } = new();
    private MotionFrame? _lastSourceFrame;
    private MotionFrame? _lastEffectiveFrame;
    private string? _lastLine;
    private long _lastFullSendAt;

    public event Action<string>? OnDebugLog;

    public bool IsConnected => _client is not null && _remote is not null;

    public TCodeUdpOutput(AppConfig config, TimeProvider? timeProvider = null)
    {
        _config = config;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    public TCodeUdpOutput(OutputDeviceConfig output, Func<TCodeMotionProfile> profileResolver, TimeProvider? timeProvider = null)
    {
        _output = output;
        _profileResolver = profileResolver;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    public void Connect() { lock (_ioGate) ConnectCore(); }

    private void ConnectCore()
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
        ResetEmitState();
        Console.WriteLine($"[TCode/UDP] Ready: {host}:{GetPort()}");
    }

    public void Disconnect() { lock (_ioGate) DisconnectCore(); }

    private void DisconnectCore()
    {
        try { if (_client is not null && _remote is not null) _client.Send(Encoding.ASCII.GetBytes("DSTOP\n"), _remote); } catch { }
        _client?.Dispose();
        _client = null;
        _remote = null;
        ResetEmitState();
    }

    public void Dispose() => Disconnect();

    public void Send(MotionFrame frame) { lock (_ioGate) SendCore(frame); }

    private void SendCore(MotionFrame frame)
    {
        if (!IsConnected)
            return;

        var refresh = _timeProvider.GetElapsedTime(_lastFullSendAt).TotalMilliseconds >= 1000;
        var (line, effectiveFrame) = BuildLine(frame, forceAll: refresh || _lastEffectiveFrame is null);
        if (string.IsNullOrWhiteSpace(line))
            return;
        if (frame.ActiveAxes is null && !refresh && line == _lastLine)
            return;

        if (!SendRaw(line + "\n")) return;
        _lastEffectiveFrame = effectiveFrame;
        _lastSourceFrame = frame;
        if (refresh) _lastFullSendAt = _timeProvider.GetTimestamp();
        _lastLine = line;
        SyncVelocityToFrame(effectiveFrame);
                Telemetry.RecordTCode(line);
        OnDebugLog?.Invoke($"TX {line}");
    }

    public void Center() { lock (_ioGate) CenterCore(); }

    private void CenterCore()
    {
        if (!IsConnected)
            return;

        var centerFrame = MotionAxisHelper.CreateCenterFrame(1000);
        var (line, effectiveFrame) = BuildLine(centerFrame, forceAll: true, forceInterval: true, durationMsOverride: 1000, padMagnitude: true);
        if (string.IsNullOrWhiteSpace(line))
            return;

        if (!SendRaw(line + "\n")) return;
        _lastEffectiveFrame = effectiveFrame;
        _lastSourceFrame = centerFrame;
        _lastLine = line;
        SyncVelocityToFrame(effectiveFrame);
                Telemetry.RecordTCode(line);
        OnDebugLog?.Invoke($"CENTER {line}");
    }

    public void EmergencyStop() { lock (_ioGate) EmergencyStopCore(); }

    private void EmergencyStopCore()
    {
        if (!IsConnected)
            return;

        ResetEmitState();
        if(SendRaw("DSTOP\n"))Telemetry.SetState("stopped");
        OnDebugLog?.Invoke("TX DSTOP");
    }

    private bool SendRaw(string text)
    {
        if (!IsConnected)
            return false;

        try
        {
            var bytes = Encoding.ASCII.GetBytes(text);
            _client!.Send(bytes, bytes.Length, _remote!);
            return true;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[TCode/UDP] Send error: {ex.Message}");
            ResetEmitState();
            Disconnect();
            return false;
        }
    }

    private (string Line, MotionFrame EffectiveFrame) BuildLine(MotionFrame frame, bool forceAll, bool forceInterval = false, int? durationMsOverride = null, bool padMagnitude = false) =>
        TCodeEncoder.BuildLine(ResolveProfile(), _output, _lastEffectiveFrame, _lastSourceFrame, _velocity, message => OnDebugLog?.Invoke(message), frame, forceAll, forceInterval, durationMsOverride, padMagnitude);

    private void SyncVelocityToFrame(MotionFrame frame)
    {
        foreach (var axis in MotionAxisHelper.All) _velocity[axis].Sync(MotionAxisHelper.Get(frame, axis));
    }

    private void ResetEmitState()
    {
        Telemetry.SetState("idle",clear:true);
        _lastSourceFrame = null;
        _lastEffectiveFrame = null;
        _lastLine = null;
        foreach (var axis in MotionAxisHelper.All)
            _velocity[axis].Reset(MotionAxisHelper.NeutralValue(axis));
    }

    private string GetHost() => string.IsNullOrWhiteSpace(_output?.Host) ? _config?.UdpTCode.Host ?? "127.0.0.1" : _output.Host;

    private int GetPort() => _output?.Port is > 0 and <= 65535 ? _output.Port : _config?.UdpTCode.Port ?? 9999;

    private TCodeMotionProfile ResolveProfile() => _profileResolver?.Invoke() ?? _config?.ResolveMotionProfile(TCodeProfileTarget.Udp) ?? new TCodeMotionProfile();
}
