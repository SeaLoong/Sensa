using System.IO.Ports;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Signals;

namespace Sensa.Outputs.TCode;

/// <summary>
/// Sends TCode commands to an OSR2/SR6/OSR6 device over a COM serial port.
///
/// Commands are emitted only for axes whose effective target changed after applying
/// the motion profile (bounds / invert / lock / ignore). There is no background send loop.
/// </summary>
public sealed class TCodeSerialOutput : IDisposable
{
    private readonly AppConfig? _config;
    private readonly OutputDeviceConfig? _output;
    private readonly Func<TCodeMotionProfile>? _profileResolver;
    private readonly Dictionary<MotionAxis, AxisVelocityTracker> _velocity = MotionAxisHelper.All.ToDictionary(axis => axis, axis => new AxisVelocityTracker());
    private SerialPort? _port;
    private MotionFrame? _lastSourceFrame;
    private MotionFrame? _lastEffectiveFrame;
    private string? _lastSentLine;
    private TCodeDeviceInfo? _deviceInfo;

    public event Action<string>? OnDebugLog;

    public bool IsConnected => _port?.IsOpen == true;
    public TCodeDeviceInfo? DeviceInfo => _deviceInfo;

    public TCodeSerialOutput(AppConfig config) => _config = config;

    public TCodeSerialOutput(OutputDeviceConfig output, Func<TCodeMotionProfile> profileResolver)
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
        _deviceInfo = QueryDeviceInfo();
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
        _deviceInfo = null;
        ResetEmitState();
    }

    public void Dispose() => Disconnect();

    public void Send(MotionFrame frame)
    {
        if (_port?.IsOpen != true)
            return;

        var (line, effectiveFrame) = BuildLine(frame, forceAll: _lastEffectiveFrame is null);
        if (string.IsNullOrWhiteSpace(line))
            return;
        if (line == _lastSentLine)
            return;

        _lastEffectiveFrame = effectiveFrame;
        _lastSourceFrame = frame;
        _lastSentLine = line;
        SyncVelocityToFrame(effectiveFrame);

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

        var centerFrame = MotionAxisHelper.CreateCenterFrame(1000);
        var (line, effectiveFrame) = BuildLine(centerFrame, forceAll: true, forceInterval: true, durationMsOverride: 1000, padMagnitude: true);
        if (string.IsNullOrWhiteSpace(line))
            return;

        _lastEffectiveFrame = effectiveFrame;
        _lastSourceFrame = centerFrame;
        _lastSentLine = line;
        SyncVelocityToFrame(effectiveFrame);

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
        var sb = new System.Text.StringBuilder();
        var deltaMs = Math.Max(durationMsOverride ?? (int)Math.Round(Math.Max(frame.DeltaMs, 1d)), 1);

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
            int? speedLimitForLog = null;
            int? requestedSpeedForLog = null;
            int? logicalSpeedForLog = null;
            int? emittedSpeedForLog = null;
            int? durationMsForLog = null;
            string term;
            if (forceInterval)
            {
                durationMsForLog = deltaMs;
                term = $"I{deltaMs}";
            }
            else if (commandMode == TCodeCommandMode.None)
            {
                term = string.Empty;
            }
            else if (commandMode == TCodeCommandMode.Interval)
            {
                var requestedLogicalSpeed = TCodeAxisDebugFormatter.HasRequestedSpeed(frame)
                    ? TCodeAxisDebugFormatter.ResolveRequestedSpeed(frame, config.MaxSpeed)
                    : (int?)null;
                var logicalSpeedLimit = requestedLogicalSpeed ?? Math.Clamp(config.MaxSpeed, 1, 999);
                var durationMs = frame.RequestedCommandMode == TCodeCommandMode.Interval
                    ? TCodeAxisDebugFormatter.ResolveRequestedDurationMs(frame, deltaMs)
                    : TCodeAxisDebugFormatter.ComputeDurationMs(previousMapped, mapped, logicalSpeedLimit, deltaMs);
                speedLimitForLog = logicalSpeedLimit;
                requestedSpeedForLog = requestedLogicalSpeed;
                durationMsForLog = durationMs;
                term = $"I{durationMs}";
            }
            else
            {
                var requestedLogicalSpeed = TCodeAxisDebugFormatter.HasRequestedSpeed(frame)
                    ? TCodeAxisDebugFormatter.ResolveRequestedSpeed(frame, config.MaxSpeed)
                    : (int?)null;
                var logicalSpeedLimit = requestedLogicalSpeed ?? Math.Clamp(config.MaxSpeed, 1, 999);
                var logicalSpeed = requestedLogicalSpeed ?? _velocity[axis].Estimate(mapped, frame.DeltaMs, logicalSpeedLimit);
                var emittedSpeed = ConvertSpeedToOutputUnits(logicalSpeed);
                speedLimitForLog = logicalSpeedLimit;
                requestedSpeedForLog = requestedLogicalSpeed;
                logicalSpeedForLog = logicalSpeed;
                emittedSpeedForLog = emittedSpeed;
                term = $"S{emittedSpeed}";
            }

            term = ApplyRampSuffix(term, config.RampType);

            sb.Append($"{MotionAxisHelper.Token(axis)}{posText}{term} ");
            OnDebugLog?.Invoke(TCodeAxisDebugFormatter.FormatAxisTrace(
                axis,
                source,
                previousSource,
                previousMapped,
                remapped,
                mapped,
                config,
                action: "emit",
                term: term,
                speedLimit: speedLimitForLog,
                requestedSpeed: requestedSpeedForLog,
                logicalSpeed: logicalSpeedForLog,
                emittedSpeed: emittedSpeedForLog,
                durationMs: durationMsForLog));
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
            TCodeSlopeMode.NoSlope => TCodeCommandMode.None,
            _ => frame.RequestedCommandMode ?? axis.CommandMode,
        };
    }

    private int ConvertSpeedToOutputUnits(int logicalSpeed)
    {
        var clamped = Math.Max(logicalSpeed, 0);
        return _output?.SpeedUnitBase == TCodeSpeedUnitBase.PerSecond ? clamped * 10 : clamped;
    }

    private static string ApplyRampSuffix(string term, TCodeRampType rampType)
    {
        if (string.IsNullOrWhiteSpace(term))
            return string.Empty;

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

    private TCodeDeviceInfo QueryDeviceInfo()
    {
        if (_port?.IsOpen != true)
        {
            return TCodeDeviceInfo.Unsupported("串口未连接");
        }

        try
        {
            var fw = QuerySingleLine("D0");
            var ver = QuerySingleLine("D1");
            var axes = QueryMultiLine("D2");

            return new TCodeDeviceInfo
            {
                Supported = true,
                FirmwareVersion = fw,
                TCodeVersion = ver,
                AxisDescriptors = axes,
                UpdatedAtUtc = DateTimeOffset.UtcNow,
                Status = "ok",
            };
        }
        catch (Exception ex)
        {
            return new TCodeDeviceInfo
            {
                Supported = true,
                FirmwareVersion = null,
                TCodeVersion = null,
                AxisDescriptors = Array.Empty<string>(),
                UpdatedAtUtc = DateTimeOffset.UtcNow,
                Status = $"query-failed:{ex.Message}",
            };
        }
    }

    public void RefreshDeviceInfo()
    {
        if (_port?.IsOpen != true)
        {
            _deviceInfo = TCodeDeviceInfo.Unsupported("串口未连接");
            return;
        }

        _deviceInfo = QueryDeviceInfo();
    }

    private string? QuerySingleLine(string command)
    {
        if (_port?.IsOpen != true)
            return null;

        var oldTimeout = _port.ReadTimeout;
        try
        {
            _port.DiscardInBuffer();
            _port.ReadTimeout = 250;
            _port.WriteLine(command);
            var line = _port.ReadLine();
            return string.IsNullOrWhiteSpace(line) ? null : line.Trim();
        }
        catch
        {
            return null;
        }
        finally
        {
            _port.ReadTimeout = oldTimeout;
        }
    }

    private IReadOnlyList<string> QueryMultiLine(string command)
    {
        if (_port?.IsOpen != true)
            return Array.Empty<string>();

        var lines = new List<string>();
        var oldTimeout = _port.ReadTimeout;
        try
        {
            _port.DiscardInBuffer();
            _port.ReadTimeout = 120;
            _port.WriteLine(command);
            for (var i = 0; i < 24; i++)
            {
                try
                {
                    var line = _port.ReadLine();
                    if (string.IsNullOrWhiteSpace(line))
                        continue;
                    lines.Add(line.Trim());
                }
                catch (TimeoutException)
                {
                    break;
                }
            }
        }
        finally
        {
            _port.ReadTimeout = oldTimeout;
        }

        return lines;
    }

    private void ResetEmitState()
    {
        _lastSourceFrame = null;
        _lastEffectiveFrame = null;
        _lastSentLine = null;
        foreach (var axis in MotionAxisHelper.All)
            _velocity[axis].Reset(MotionAxisHelper.NeutralValue(axis));
    }

    private string GetComPort() => string.IsNullOrWhiteSpace(_output?.ComPort) ? _config?.TCode.ComPort ?? "COM3" : _output.ComPort;

    private TCodeMotionProfile ResolveProfile() => _profileResolver?.Invoke() ?? _config?.ResolveMotionProfile(TCodeProfileTarget.TCode) ?? new TCodeMotionProfile();
}
