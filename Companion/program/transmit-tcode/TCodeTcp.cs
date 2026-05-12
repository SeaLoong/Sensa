using System.Net.Sockets;
using System.Text;
using Sensa.Config;
using Sensa.Core;

namespace Sensa.TransmitTCode;

/// <summary>
/// Sends delta-only TCode commands over TCP.
/// </summary>
public sealed class TCodeTcp : IDisposable
{
    private readonly SaveFile? _save;
    private readonly OutputDeviceConfig? _output;
    private readonly Func<TCodeMotionProfile>? _profileResolver;
    private readonly Dictionary<DeviceAxis, VelocityEstimator> _velocity = DeviceAxisHelpers.All.ToDictionary(axis => axis, axis => new VelocityEstimator());
    private TcpClient? _client;
    private NetworkStream? _stream;
    private DeviceCommand? _lastSourcePose;
    private DeviceCommand? _lastEffectivePose;
    private string? _lastLine;

    public event Action<string>? OnDebugLog;

    public bool IsConnected => _client?.Connected == true && _stream is not null;

    public TCodeTcp(SaveFile save) => _save = save;

    public TCodeTcp(OutputDeviceConfig output, Func<TCodeMotionProfile> profileResolver)
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

    public void Send(DeviceCommand cmd)
    {
        if (!IsConnected)
            return;

        var (line, effectivePose) = BuildLine(cmd, forceAll: _lastEffectivePose is null);
        if (string.IsNullOrWhiteSpace(line))
            return;
        if (line == _lastLine)
            return;

        _lastEffectivePose = effectivePose;
        _lastSourcePose = cmd;
        _lastLine = line;
        SyncVelocityToPose(effectivePose);
        SendRaw(line + "\n");
        OnDebugLog?.Invoke($"TX {line}");
    }

    public void Center()
    {
        if (!IsConnected)
            return;

        var centerCommand = DeviceAxisHelpers.CreateCenterCommand(1000);
        var (line, effectivePose) = BuildLine(centerCommand, forceAll: true, forceInterval: true, durationMsOverride: 1000, padMagnitude: true);
        if (string.IsNullOrWhiteSpace(line))
            return;

        _lastEffectivePose = effectivePose;
        _lastSourcePose = centerCommand;
        _lastLine = line;
        SyncVelocityToPose(effectivePose);
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

    private (string Line, DeviceCommand EffectivePose) BuildLine(
        DeviceCommand cmd,
        bool forceAll,
        bool forceInterval = false,
        int? durationMsOverride = null,
        bool padMagnitude = false)
    {
        var profile = ResolveProfile();
        var previousEffectivePose = _lastEffectivePose ?? DeviceAxisHelpers.CreateNeutralCommand();
        var previousSourcePose = _lastSourcePose ?? previousEffectivePose;
        var effectivePose = previousEffectivePose;
        var sb = new StringBuilder();
        var deltaMs = Math.Max(durationMsOverride ?? (int)Math.Round(Math.Max(cmd.DeltaMs, 1d)), 1);
        var preferSpeedMode = PreferSpeedMode();

        foreach (var axis in DeviceAxisHelpers.All)
        {
            var config = GetAxisConfig(profile, axis);
            var source = DeviceAxisHelpers.Get(cmd, axis);
            var previousSource = DeviceAxisHelpers.Get(previousSourcePose, axis);
            var previousMapped = DeviceAxisHelpers.Get(previousEffectivePose, axis);

            if (config.Mode == TCodeAxisMode.Ignored)
            {
                if (forceAll || Math.Abs(previousSource - source) >= 0.0001f)
                    OnDebugLog?.Invoke(TCodeAxisTrace.FormatAxisTrace(axis, source, previousSource, previousMapped, previousMapped, previousMapped, config, action: "skip", note: "ignored"));
                continue;
            }

            var resolved = ResolveAxisValue(source, config);
            var remapped = resolved.Remapped;
            var mapped = resolved.Output;
            effectivePose = DeviceAxisHelpers.Set(effectivePose, axis, mapped);
            var sourceChanged = forceAll || Math.Abs(previousSource - source) >= 0.0001f;
            var mappedChanged = forceAll || Math.Abs(previousMapped - mapped) >= 0.0001f;

            if (!mappedChanged)
            {
                if (sourceChanged)
                    OnDebugLog?.Invoke(TCodeAxisTrace.FormatAxisTrace(axis, source, previousSource, previousMapped, remapped, mapped, config, action: "skip", note: "profile-held"));
                continue;
            }

            var pos = Math.Clamp((int)Math.Round(mapped * 1000f), 0, 999);
            var posText = pos.ToString("D3");
            string term;
            if (forceInterval)
            {
                term = $"I{deltaMs}";
            }
            else if (cmd.UseMaxSpeed)
            {
                term = preferSpeedMode
                    ? $"S{config.MaxSpeed}"
                    : $"I{TCodeAxisTrace.ComputeDurationMs(previousMapped, mapped, config.MaxSpeed, deltaMs)}";
            }
            else if (!preferSpeedMode)
            {
                term = $"I{deltaMs}";
            }
            else
            {
                var speed = _velocity[axis].Estimate(mapped, cmd.DeltaMs, config.MaxSpeed);
                term = $"S{speed}";
            }

            sb.Append($"{DeviceAxisHelpers.Token(axis)}{posText}{term} ");
            OnDebugLog?.Invoke(TCodeAxisTrace.FormatAxisTrace(axis, source, previousSource, previousMapped, remapped, mapped, config, action: "emit", term: term));
        }

        return (sb.ToString().TrimEnd(), effectivePose);
    }

    private void SyncVelocityToPose(DeviceCommand pose)
    {
        foreach (var axis in DeviceAxisHelpers.All)
            _velocity[axis].Sync(DeviceAxisHelpers.Get(pose, axis));
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

    private TCodeAxisConfig GetAxisConfig(TCodeMotionProfile profile, DeviceAxis axis) => axis switch
    {
        DeviceAxis.L0 => profile.L0,
        DeviceAxis.L1 => profile.L1,
        DeviceAxis.L2 => profile.L2,
        DeviceAxis.R0 => profile.R0,
        DeviceAxis.R1 => profile.R1,
        DeviceAxis.R2 => profile.R2,
        DeviceAxis.V0 => profile.V0,
        DeviceAxis.V1 => profile.V1,
        DeviceAxis.V2 => profile.V2,
        DeviceAxis.A0 => profile.A0,
        _ => profile.L0,
    };

    private void ResetEmitState()
    {
        _lastSourcePose = null;
        _lastEffectivePose = null;
        _lastLine = null;
        foreach (var axis in DeviceAxisHelpers.All)
            _velocity[axis].Reset(DeviceAxisHelpers.NeutralValue(axis));
    }

    private string GetHost() => string.IsNullOrWhiteSpace(_output?.Host) ? _save?.TcpTCode.Host ?? "127.0.0.1" : _output.Host;

    private int GetPort() => _output?.Port is > 0 and <= 65535 ? _output.Port : _save?.TcpTCode.Port ?? 9998;

    private bool PreferSpeedMode() => _output?.PreferSpeedMode ?? _save?.TCode.PreferSpeedMode ?? true;

    private TCodeMotionProfile ResolveProfile() => _profileResolver?.Invoke() ?? _save?.ResolveMotionProfile(TCodeProfileTarget.Tcp) ?? new TCodeMotionProfile();
}
