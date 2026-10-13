using System.Net.Sockets;
using System.Text;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Signals;

namespace Sensa.Outputs.TCode;

/// <summary>
/// Sends delta-only TCode commands over TCP.
/// </summary>
public sealed class TCodeTcpOutput : IDisposable
{
    private readonly object _ioGate = new();
    private readonly AppConfig? _config;
    private readonly OutputDeviceConfig? _output;
    private readonly Func<TCodeMotionProfile>? _profileResolver;
    private readonly Dictionary<MotionAxis, AxisVelocityTracker> _velocity = MotionAxisHelper.All.ToDictionary(axis => axis, axis => new AxisVelocityTracker());
    private TcpClient? _client;
    private NetworkStream? _stream;
    public OutputTelemetry Telemetry { get; } = new();
    private MotionFrame? _lastSourceFrame;
    private MotionFrame? _lastEffectiveFrame;
    private string? _lastLine;

    public event Action<string>? OnDebugLog;

    public bool IsConnected => _client?.Connected == true && _stream is not null;

    public TCodeTcpOutput(AppConfig config) => _config = config;

    public TCodeTcpOutput(OutputDeviceConfig output, Func<TCodeMotionProfile> profileResolver)
    {
        _output = output;
        _profileResolver = profileResolver;
    }

    public void Connect() { lock (_ioGate) ConnectCore(); }

    private void ConnectCore()
    {
        Disconnect();
        var host = GetHost();
        if (string.IsNullOrWhiteSpace(host))
            throw new InvalidOperationException("TCP host is empty.");

        _client = new TcpClient();
        _client.ConnectAsync(host, GetPort()).WaitAsync(TimeSpan.FromSeconds(3)).GetAwaiter().GetResult();
        _client.SendTimeout = 500;
        _stream = _client.GetStream();
        _stream.WriteTimeout = 500;
        ResetEmitState();
        Console.WriteLine($"[TCode/TCP] Connected: {host}:{GetPort()}");
    }

    public void Disconnect() { lock (_ioGate) DisconnectCore(); }

    private void DisconnectCore()
    {
        try { _stream?.Write(Encoding.ASCII.GetBytes("DSTOP\n")); } catch { }
        try { _stream?.Dispose(); } catch { }
        _stream = null;
        try { _client?.Close(); } catch { }
        _client = null;
        ResetEmitState();
    }

    public void Dispose() => Disconnect();

    public void Send(MotionFrame frame) { lock (_ioGate) SendCore(frame); }

    private void SendCore(MotionFrame frame)
    {
        if (!IsConnected)
            return;

        var (line, effectiveFrame) = BuildLine(frame, forceAll: _lastEffectiveFrame is null);
        if (string.IsNullOrWhiteSpace(line))
            return;
        if (line == _lastLine)
            return;

        if (!SendRaw(line + "\n")) return;
        _lastEffectiveFrame = effectiveFrame;
        _lastSourceFrame = frame;
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
            _stream!.Write(bytes, 0, bytes.Length);
            return true;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[TCode/TCP] Send error: {ex.Message}");
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

    private string GetHost() => string.IsNullOrWhiteSpace(_output?.Host) ? _config?.TcpTCode.Host ?? "127.0.0.1" : _output.Host;

    private int GetPort() => _output?.Port is > 0 and <= 65535 ? _output.Port : _config?.TcpTCode.Port ?? 9998;

    private TCodeMotionProfile ResolveProfile() => _profileResolver?.Invoke() ?? _config?.ResolveMotionProfile(TCodeProfileTarget.Tcp) ?? new TCodeMotionProfile();
}
