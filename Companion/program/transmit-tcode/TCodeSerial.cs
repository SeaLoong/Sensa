using System.IO.Ports;
using Sensa.Config;
using Sensa.Core;

namespace Sensa.TransmitTCode;

/// <summary>
/// Sends TCode commands to an OSR2/SR6/OSR6 device over a COM serial port.
///
/// Commands are emitted only for axes whose effective target changed after applying
/// the motion profile (bounds / invert / lock / ignore). There is no background send loop.
/// </summary>
public sealed class TCodeSerial : IDisposable
{
    private readonly SaveFile? _save;
    private readonly OutputDeviceConfig? _output;
    private readonly Func<TCodeMotionProfile>? _profileResolver;
    private readonly Dictionary<DeviceAxis, VelocityEstimator> _velocity = DeviceAxisHelpers.All.ToDictionary(axis => axis, axis => new VelocityEstimator());
    private SerialPort? _port;
    private DeviceCommand? _lastSourcePose;
    private DeviceCommand? _lastEffectivePose;
    private string? _lastSentLine;

    public event Action<string>? OnDebugLog;

    public bool IsConnected => _port?.IsOpen == true;

    public TCodeSerial(SaveFile save) => _save = save;

    public TCodeSerial(OutputDeviceConfig output, Func<TCodeMotionProfile> profileResolver)
    {
        _output = output;
        _profileResolver = profileResolver;
    }

    public void Connect()
    {
        Disconnect();
        _port = new SerialPort(GetComPort(), 115200, Parity.None, 8, StopBits.One)
        {
            ReadTimeout = 100,
            WriteTimeout = 200,
        };
        _port.Open();
        ResetEmitState();
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
        ResetEmitState();
    }

    public void Dispose() => Disconnect();

    public void Send(DeviceCommand cmd)
    {
        if (_port?.IsOpen != true)
            return;

        var (line, effectivePose) = BuildLine(cmd, forceAll: _lastEffectivePose is null);
        if (string.IsNullOrWhiteSpace(line))
            return;
        if (line == _lastSentLine)
            return;

        _lastEffectivePose = effectivePose;
        _lastSourcePose = cmd;
        _lastSentLine = line;
        SyncVelocityToPose(effectivePose);

        try
        {
            _port.WriteLine(line);
            OnDebugLog?.Invoke($"TX {line}");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[TCode] Write error: {ex.Message}");
        }
    }

    /// <summary>Returns active axes to the requested center pose in ~1 second.</summary>
    public void Center()
    {
        if (_port?.IsOpen != true)
            return;

        var centerCommand = DeviceAxisHelpers.CreateCenterCommand(1000);
        var (line, effectivePose) = BuildLine(centerCommand, forceAll: true, forceInterval: true, durationMsOverride: 1000, padMagnitude: true);
        if (string.IsNullOrWhiteSpace(line))
            return;

        _lastEffectivePose = effectivePose;
        _lastSourcePose = centerCommand;
        _lastSentLine = line;
        SyncVelocityToPose(effectivePose);

        try
        {
            _port.WriteLine(line);
            OnDebugLog?.Invoke($"CENTER {line}");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[TCode] Center error: {ex.Message}");
        }
    }

    public void EmergencyStop()
    {
        if (_port?.IsOpen != true)
            return;

        ResetEmitState();
        try
        {
            _port.WriteLine("DSTOP");
            OnDebugLog?.Invoke("TX DSTOP");
        }
        catch { }
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
        var sb = new System.Text.StringBuilder();
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
        _lastSentLine = null;
        foreach (var axis in DeviceAxisHelpers.All)
            _velocity[axis].Reset(DeviceAxisHelpers.NeutralValue(axis));
    }

    private string GetComPort() => string.IsNullOrWhiteSpace(_output?.ComPort) ? _save?.TCode.ComPort ?? "COM3" : _output.ComPort;

    private bool PreferSpeedMode() => _output?.PreferSpeedMode ?? _save?.TCode.PreferSpeedMode ?? true;

    private TCodeMotionProfile ResolveProfile() => _profileResolver?.Invoke() ?? _save?.ResolveMotionProfile(TCodeProfileTarget.TCode) ?? new TCodeMotionProfile();
}
