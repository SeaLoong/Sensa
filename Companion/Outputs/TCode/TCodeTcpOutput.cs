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
    private readonly AppConfig? _config;
    private readonly OutputDeviceConfig? _output;
    private readonly Func<TCodeMotionProfile>? _profileResolver;
    private readonly Dictionary<MotionAxis, AxisVelocityTracker> _velocity = MotionAxisHelper.All.ToDictionary(axis => axis, axis => new AxisVelocityTracker());
    private TcpClient? _client;
    private NetworkStream? _stream;
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

    public void Connect()
    {
        Disconnect();
        var host = GetHost();
        if (string.IsNullOrWhiteSpace(host))
            throw new InvalidOperationException("TCP host is empty.");

        _client = new TcpClient();
        _client.Connect(host, GetPort());
        _stream = _client.GetStream();
        ResetEmitState();
        Console.WriteLine($"[TCode/TCP] Connected: {host}:{GetPort()}");
    }

    public void Disconnect()
    {
        try { _stream?.Dispose(); } catch { }
        _stream = null;
        try { _client?.Close(); } catch { }
        _client = null;
        ResetEmitState();
    }

    public void Dispose() => Disconnect();

    public void Send(MotionFrame frame)
    {
        if (!IsConnected)
            return;

        var (line, effectiveFrame) = BuildLine(frame, forceAll: _lastEffectiveFrame is null);
        if (string.IsNullOrWhiteSpace(line))
            return;
        if (line == _lastLine)
            return;

        _lastEffectiveFrame = effectiveFrame;
        _lastSourceFrame = frame;
        _lastLine = line;
        SyncVelocityToFrame(effectiveFrame);
        SendRaw(line + "\n");
        OnDebugLog?.Invoke($"TX {line}");
    }

    public void Center()
    {
        if (!IsConnected)
            return;

        var centerFrame = MotionAxisHelper.CreateCenterFrame(1000);
        var (line, effectiveFrame) = BuildLine(centerFrame, forceAll: true, forceInterval: true, durationMsOverride: 1000, padMagnitude: true);
        if (string.IsNullOrWhiteSpace(line))
            return;

        _lastEffectiveFrame = effectiveFrame;
        _lastSourceFrame = centerFrame;
        _lastLine = line;
        SyncVelocityToFrame(effectiveFrame);
        SendRaw(line + "\n");
        OnDebugLog?.Invoke($"CENTER {line}");
    }

    public void EmergencyStop()
    {
        if (!IsConnected)
            return;

        ResetEmitState();
        SendRaw("DSTOP\n");
        OnDebugLog?.Invoke("TX DSTOP");
    }

    private void SendRaw(string text)
    {
        if (!IsConnected)
            return;

        try
        {
            var bytes = Encoding.ASCII.GetBytes(text);
            _stream!.Write(bytes, 0, bytes.Length);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[TCode/TCP] Send error: {ex.Message}");
        }
    }

    private (string Line, MotionFrame EffectiveFrame) BuildLine(
        MotionFrame frame,
        bool forceAll,
        bool forceInterval = false,
        int? durationMsOverride = null,
        bool padMagnitude = false)
    {
        var profile = ResolveProfile();
        var previousEffectiveFrame = _lastEffectiveFrame ?? MotionAxisHelper.CreateNeutralFrame();
        var previousSourceFrame = _lastSourceFrame ?? previousEffectiveFrame;
        var effectiveFrame = previousEffectiveFrame;
        var sb = new StringBuilder();
        var deltaMs = Math.Max(durationMsOverride ?? (int)Math.Round(Math.Max(frame.DeltaMs, 1d)), 1);
        var preferSpeedMode = PreferSpeedMode();

        foreach (var axis in MotionAxisHelper.All)
        {
            var config = GetAxisConfig(profile, axis);
            var source = MotionAxisHelper.Get(frame, axis);
            var previousSource = MotionAxisHelper.Get(previousSourceFrame, axis);
            var previousMapped = MotionAxisHelper.Get(previousEffectiveFrame, axis);

            if (config.Mode == TCodeAxisMode.Ignored)
            {
                if (forceAll || Math.Abs(previousSource - source) >= 0.0001f)
                    OnDebugLog?.Invoke(TCodeAxisDebugFormatter.FormatAxisTrace(axis, source, previousSource, previousMapped, previousMapped, previousMapped, config, action: "skip", note: "ignored"));
                continue;
            }

            var resolved = ResolveAxisValue(source, config);
            var remapped = resolved.Remapped;
            var mapped = resolved.Output;
            effectiveFrame = MotionAxisHelper.Set(effectiveFrame, axis, mapped);
            var sourceChanged = forceAll || Math.Abs(previousSource - source) >= 0.0001f;
            var mappedChanged = forceAll || Math.Abs(previousMapped - mapped) >= 0.0001f;

            if (!mappedChanged)
            {
                if (sourceChanged)
                    OnDebugLog?.Invoke(TCodeAxisDebugFormatter.FormatAxisTrace(axis, source, previousSource, previousMapped, remapped, mapped, config, action: "skip", note: "profile-held"));
                continue;
            }

            var pos = Math.Clamp((int)Math.Round(mapped * 1000f), 0, 999);
            var posText = pos.ToString("D3");
            string term;
            if (forceInterval)
            {
                term = $"I{deltaMs}";
            }
                else if (frame.UseMaxSpeed)
            {
                term = preferSpeedMode
                    ? $"S{config.MaxSpeed}"
                    : $"I{TCodeAxisDebugFormatter.ComputeDurationMs(previousMapped, mapped, config.MaxSpeed, deltaMs)}";
            }
            else if (!preferSpeedMode)
            {
                term = $"I{deltaMs}";
            }
            else
            {
                var speed = _velocity[axis].Estimate(mapped, frame.DeltaMs, config.MaxSpeed);
                term = $"S{speed}";
            }

            sb.Append($"{MotionAxisHelper.Token(axis)}{posText}{term} ");
            OnDebugLog?.Invoke(TCodeAxisDebugFormatter.FormatAxisTrace(axis, source, previousSource, previousMapped, remapped, mapped, config, action: "emit", term: term));
        }

        return (sb.ToString().TrimEnd(), effectiveFrame);
    }

    private void SyncVelocityToFrame(MotionFrame frame)
    {
        foreach (var axis in MotionAxisHelper.All)
            _velocity[axis].Sync(MotionAxisHelper.Get(frame, axis));
    }

    private static (float Remapped, float Output) ResolveAxisValue(float value, TCodeAxisConfig axisConfig)
    {
        if (axisConfig.Mode == TCodeAxisMode.Locked)
            value = axisConfig.LockValue;
        if (axisConfig.Invert)
            value = 1f - value;

        var normalized = Math.Clamp(value, 0f, 1f);
        var remapped = RemapToRange(normalized, axisConfig);
        var output = ClampToBounds(remapped, axisConfig);
        return (remapped, output);
    }

    private static float RemapToRange(float value, TCodeAxisConfig axisConfig)
    {
        var min = Math.Clamp(axisConfig.RemapMin, 0, 999);
        var max = Math.Clamp(axisConfig.RemapMax, min, 999);
        return (min + ((max - min) * Math.Clamp(value, 0f, 1f))) / 1000f;
    }

    private static float ClampToBounds(float value, TCodeAxisConfig axisConfig)
    {
        var min = Math.Clamp(axisConfig.Min, 0, 999);
        var max = Math.Clamp(axisConfig.Max, min, 999);
        var normalized = Math.Clamp(value, 0f, 1f);
        return Math.Clamp(normalized, min / 1000f, max / 1000f);
    }

    private TCodeAxisConfig GetAxisConfig(TCodeMotionProfile profile, MotionAxis axis) => axis switch
    {
        MotionAxis.L0 => profile.L0,
        MotionAxis.L1 => profile.L1,
        MotionAxis.L2 => profile.L2,
        MotionAxis.R0 => profile.R0,
        MotionAxis.R1 => profile.R1,
        MotionAxis.R2 => profile.R2,
        MotionAxis.V0 => profile.V0,
        MotionAxis.V1 => profile.V1,
        MotionAxis.V2 => profile.V2,
        MotionAxis.A0 => profile.A0,
        _ => profile.L0,
    };

    private void ResetEmitState()
    {
        _lastSourceFrame = null;
        _lastEffectiveFrame = null;
        _lastLine = null;
        foreach (var axis in MotionAxisHelper.All)
            _velocity[axis].Reset(MotionAxisHelper.NeutralValue(axis));
    }

    private string GetHost() => string.IsNullOrWhiteSpace(_output?.Host) ? _config?.TcpTCode.Host ?? "127.0.0.1" : _output.Host;

    private int GetPort() => _output?.Port is > 0 and <= 65535 ? _output.Port : _config?.TcpTCode.Port ?? 9998;

    private bool PreferSpeedMode() => _output?.PreferSpeedMode ?? _config?.TCode.PreferSpeedMode ?? true;

    private TCodeMotionProfile ResolveProfile() => _profileResolver?.Invoke() ?? _config?.ResolveMotionProfile(TCodeProfileTarget.Tcp) ?? new TCodeMotionProfile();
}
