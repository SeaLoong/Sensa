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
    private readonly AppConfig? _config;
    private readonly OutputDeviceConfig? _output;
    private readonly Func<TCodeMotionProfile>? _profileResolver;
    private readonly Dictionary<MotionAxis, AxisVelocityTracker> _velocity = MotionAxisHelper.All.ToDictionary(axis => axis, axis => new AxisVelocityTracker());
    private UdpClient? _client;
    private IPEndPoint? _remote;
    private MotionFrame? _lastSourceFrame;
    private MotionFrame? _lastEffectiveFrame;
    private string? _lastLine;

    public event Action<string>? OnDebugLog;

    public bool IsConnected => _client is not null && _remote is not null;

    public TCodeUdpOutput(AppConfig config) => _config = config;

    public TCodeUdpOutput(OutputDeviceConfig output, Func<TCodeMotionProfile> profileResolver)
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
        ResetEmitState();
        Console.WriteLine($"[TCode/UDP] Ready: {host}:{GetPort()}");
    }

    public void Disconnect()
    {
        _client?.Dispose();
        _client = null;
        _remote = null;
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
            _client!.Send(bytes, bytes.Length, _remote!);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[TCode/UDP] Send error: {ex.Message}");
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
        var speedWindowMs = ResolveSpeedWindowMs();

        foreach (var axis in MotionAxisHelper.All)
        {
            var config = GetAxisConfig(profile, axis);
            var source = MotionAxisHelper.Get(frame, axis);
            var previousSource = MotionAxisHelper.Get(previousSourceFrame, axis);
            var previousMapped = MotionAxisHelper.Get(previousEffectiveFrame, axis);

            if (config.Mode == TCodeAxisMode.Ignored)
            {
                if (forceAll || Math.Abs(previousSource - source) >= 0.0001f)
                    OnDebugLog?.Invoke(TCodeAxisDebugFormatter.FormatAxisTrace(axis, source, previousSource, previousMapped, previousMapped, previousMapped, config, action: "ignored", note: "axis-ignored"));
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
                    OnDebugLog?.Invoke(TCodeAxisDebugFormatter.FormatAxisTrace(axis, source, previousSource, previousMapped, remapped, mapped, config, action: "hold", note: "post-profile-unchanged"));
                continue;
            }

            var pos = Math.Clamp((int)Math.Round(mapped * 1000f), 0, 999);
            var posText = pos.ToString("D3");
            var commandMode = ResolveCommandMode(frame, config);
            string term;
            if (forceInterval)
            {
                term = $"I{deltaMs}";
            }
            else if (commandMode == TCodeCommandMode.Interval)
            {
                var requestedSpeed = frame.RequestedMotionValue is > 0 ? Math.Clamp(frame.RequestedMotionValue.Value, 1, 999) : config.MaxSpeed;
                var effectiveSpeedLimit = Math.Clamp(Math.Min(requestedSpeed, config.MaxSpeed), 1, 999);
                var durationMs = frame.RequestedCommandMode == TCodeCommandMode.Interval
                    ? TCodeAxisDebugFormatter.ResolveRequestedDurationMs(frame, deltaMs)
                    : TCodeAxisDebugFormatter.ComputeDurationMs(previousMapped, mapped, effectiveSpeedLimit, deltaMs, speedWindowMs);
                term = $"I{durationMs}";
            }
            else
            {
                var requestedSpeed = frame.RequestedMotionValue is > 0 ? Math.Clamp(frame.RequestedMotionValue.Value, 1, 999) : config.MaxSpeed;
                var effectiveSpeedLimit = Math.Clamp(Math.Min(requestedSpeed, config.MaxSpeed), 1, 999);
                var speed = frame.RequestedCommandMode == TCodeCommandMode.Speed
                    ? Math.Min(TCodeAxisDebugFormatter.ResolveRequestedSpeed(frame, effectiveSpeedLimit), effectiveSpeedLimit)
                    : _velocity[axis].Estimate(mapped, frame.DeltaMs, effectiveSpeedLimit, speedWindowMs);
                term = $"S{speed}";
            }

            term = ApplyRampSuffix(term, config.RampType);

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
        MotionAxis.A1 => profile.A1,
        MotionAxis.A2 => profile.A2,
        _ => profile.L0,
    };

    private TCodeCommandMode ResolveCommandMode(MotionFrame frame, TCodeAxisConfig axis)
    {
        return _output?.SlopeMode switch
        {
            TCodeSlopeMode.Speed => TCodeCommandMode.Speed,
            TCodeSlopeMode.Interval => TCodeCommandMode.Interval,
            _ => frame.RequestedCommandMode ?? axis.CommandMode,
        };
    }

    private double ResolveSpeedWindowMs() => _output?.SpeedUnitBase == TCodeSpeedUnitBase.PerSecond ? 1000d : 100d;

    private static string ApplyRampSuffix(string term, TCodeRampType rampType)
    {
        var suffix = rampType switch
        {
            TCodeRampType.Linear => "=",
            TCodeRampType.EaseIn => "<",
            TCodeRampType.EaseOut => ">",
            TCodeRampType.EaseInOut => "<>",
            _ => string.Empty,
        };

        return string.IsNullOrEmpty(suffix) ? term : $"{term}{suffix}";
    }

    private void ResetEmitState()
    {
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
