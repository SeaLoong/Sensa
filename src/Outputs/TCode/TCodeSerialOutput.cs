using System.IO.Ports;
using System.Text;
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
    private static readonly UTF8Encoding StrictUtf8DeviceInfoEncoding = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
    private static readonly UTF8Encoding Utf8DeviceInfoEncoding = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: false);
    private static readonly Encoding Latin1DeviceInfoEncoding = Encoding.Latin1;
    private static readonly Encoding? Gb18030DeviceInfoEncoding;

    private readonly AppConfig? _config;
    private readonly OutputDeviceConfig? _output;
    private readonly Func<TCodeMotionProfile>? _profileResolver;
    private readonly Dictionary<MotionAxis, AxisVelocityTracker> _velocity = MotionAxisHelper.All.ToDictionary(axis => axis, axis => new AxisVelocityTracker());
    private readonly object _ioGate = new();
    private SerialPort? _port;
    private MotionFrame? _lastSourceFrame;
    private MotionFrame? _lastEffectiveFrame;
    private string? _lastSentLine;
    private TCodeDeviceInfo? _deviceInfo;

    public event Action<string>? OnDebugLog;

    static TCodeSerialOutput()
    {
        try
        {
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        }
        catch
        {
            // 已注册或当前平台无需额外 provider。
        }

        try
        {
            Gb18030DeviceInfoEncoding = Encoding.GetEncoding(54936);
        }
        catch
        {
            Gb18030DeviceInfoEncoding = null;
        }
    }

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
        lock (_ioGate)
        {
            DisconnectCore();
            _port = new SerialPort(GetComPort(), 115200, Parity.None, 8, StopBits.One)
            {
                ReadTimeout = 100,
                WriteTimeout = 200,
                Encoding = Utf8DeviceInfoEncoding,
            };
            _port.Open();
            ResetEmitState();
            _deviceInfo = QueryDeviceInfo();
            Console.WriteLine($"[TCode] Connected to {GetComPort()}");
        }
    }

    public void Disconnect()
    {
        lock (_ioGate)
        {
            DisconnectCore();
        }
    }

    public void Dispose() => Disconnect();

    public void Send(MotionFrame frame)
    {
        lock (_ioGate)
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
    }

    /// <summary>Returns active axes to the requested center pose in ~1 second.</summary>
    public void Center()
    {
        lock (_ioGate)
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
    }

    public void EmergencyStop()
    {
        lock (_ioGate)
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
            var commandMode = ResolveCommandMode(frame, config);
            var previousCommandMode = ResolveCommandMode(previousSourceFrame, config);
            var motionInstructionChanged = forceAll
                || commandMode != previousCommandMode
                || frame.RequestedCommandMode != previousSourceFrame.RequestedCommandMode
                || frame.RequestedMotionValue != previousSourceFrame.RequestedMotionValue;
            var mappedChanged = forceAll || Math.Abs(previousMapped - mapped) >= 0.0001f || motionInstructionChanged;

            if (!mappedChanged)
            {
                if (sourceChanged)
                    OnDebugLog?.Invoke(TCodeAxisDebugFormatter.FormatAxisTrace(axis, source, previousSource, previousMapped, remapped, mapped, config, action: "hold", note: "post-profile-unchanged"));
                continue;
            }

            var pos = Math.Clamp((int)Math.Round(mapped * 1000f), 0, 999);
            var posText = pos.ToString("D3");
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
        if (frame.RequestedCommandMode.HasValue)
            return frame.RequestedCommandMode.Value;

        return _output?.SlopeMode switch
        {
            TCodeSlopeMode.Speed => TCodeCommandMode.Speed,
            TCodeSlopeMode.Interval => TCodeCommandMode.Interval,
            TCodeSlopeMode.NoSlope => TCodeCommandMode.None,
            _ => axis.CommandMode,
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

        OnDebugLog?.Invoke("DEVINFO begin D0 / D1 / D2");

        try
        {
            var fw = QuerySingleLine("D0");
            var ver = QuerySingleLine("D1");
            var axes = QueryMultiLine("D2");

            OnDebugLog?.Invoke($"DEVINFO done fw={FormatDeviceInfoSummaryValue(fw)} tcode={FormatDeviceInfoSummaryValue(ver)} axes={axes.Count}");

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
            OnDebugLog?.Invoke($"DEVINFO failed {ex.Message}");

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
        lock (_ioGate)
        {
            if (_port?.IsOpen != true)
            {
                _deviceInfo = TCodeDeviceInfo.Unsupported("串口未连接");
                OnDebugLog?.Invoke("DEVINFO skipped: 串口未连接");
                return;
            }

            OnDebugLog?.Invoke("DEVINFO refresh requested");
            _deviceInfo = QueryDeviceInfo();
        }
    }

    private string? QuerySingleLine(string command)
    {
        return QueryLines(command, maxLines: 1, readTimeoutMs: 250).FirstOrDefault();
    }

    private IReadOnlyList<string> QueryMultiLine(string command)
    {
        if (_port?.IsOpen != true)
            return Array.Empty<string>();

        return QueryLines(command, maxLines: 24, readTimeoutMs: 120);
    }

    private IReadOnlyList<string> QueryLines(string command, int maxLines, int readTimeoutMs)
    {
        if (_port?.IsOpen != true)
            return Array.Empty<string>();

        var lines = new List<string>();
        var oldTimeout = _port.ReadTimeout;
        try
        {
            _port.DiscardInBuffer();
            _port.ReadTimeout = readTimeoutMs;
            OnDebugLog?.Invoke($"DEVINFO TX {command}");
            _port.WriteLine(command);

            for (var i = 0; i < maxLines; i++)
            {
                var rawLine = ReadRawDeviceInfoLine(_port);
                if (rawLine is null)
                    break;

                if (rawLine.Length == 0)
                    continue;

                var (decodedLine, encodingLabel, includeHexInLog) = DecodeDeviceInfoBytes(rawLine);
                if (string.IsNullOrWhiteSpace(decodedLine))
                    continue;

                var hexSuffix = includeHexInLog ? $" | HEX {BitConverter.ToString(rawLine)}" : string.Empty;
                OnDebugLog?.Invoke($"DEVINFO RX {command} [{encodingLabel}] {decodedLine}{hexSuffix}");
                lines.Add(decodedLine);
            }

            if (lines.Count == 0)
                OnDebugLog?.Invoke($"DEVINFO RX {command} <no response>");
        }
        catch (TimeoutException)
        {
            if (lines.Count == 0)
                OnDebugLog?.Invoke($"DEVINFO RX {command} <timeout>");
        }
        catch (Exception ex)
        {
            OnDebugLog?.Invoke($"DEVINFO ERR {command} {ex.Message}");
            throw;
        }
        finally
        {
            _port.ReadTimeout = oldTimeout;
        }

        return lines;
    }

    private static byte[]? ReadRawDeviceInfoLine(SerialPort port)
    {
        using var buffer = new MemoryStream();

        while (true)
        {
            try
            {
                var nextByte = port.ReadByte();
                if (nextByte < 0)
                    return buffer.Length > 0 ? buffer.ToArray() : null;

                var value = (byte)nextByte;
                if (value == (byte)'\n')
                    return buffer.ToArray();

                if (value == (byte)'\r')
                    continue;

                buffer.WriteByte(value);
            }
            catch (TimeoutException)
            {
                return buffer.Length > 0 ? buffer.ToArray() : null;
            }
        }
    }

    private static (string Text, string EncodingLabel, bool IncludeHexInLog) DecodeDeviceInfoBytes(byte[] bytes)
    {
        if (bytes.Length == 0)
            return (string.Empty, "empty", false);

        if (TryDecodeUtf8(bytes, out var utf8Text))
            return (SanitizeDeviceInfoText(utf8Text), "utf-8", false);

        if (TryDecodeWithEncoding(Gb18030DeviceInfoEncoding, bytes, out var gb18030Text))
            return (SanitizeDeviceInfoText(gb18030Text), "gb18030", false);

        var fallbackText = SanitizeDeviceInfoText(Utf8DeviceInfoEncoding.GetString(bytes));
        if (string.IsNullOrWhiteSpace(fallbackText))
            fallbackText = SanitizeDeviceInfoText(Latin1DeviceInfoEncoding.GetString(bytes));

        var includeHexInLog = fallbackText.Contains('�') || fallbackText.Contains('?');
        return (fallbackText, "fallback", includeHexInLog);
    }

    private static bool TryDecodeUtf8(byte[] bytes, out string text)
    {
        try
        {
            text = StrictUtf8DeviceInfoEncoding.GetString(bytes);
            return true;
        }
        catch (DecoderFallbackException)
        {
            text = string.Empty;
            return false;
        }
    }

    private static bool TryDecodeWithEncoding(Encoding? encoding, byte[] bytes, out string text)
    {
        if (encoding is null)
        {
            text = string.Empty;
            return false;
        }

        text = encoding.GetString(bytes);
        return true;
    }

    private static string SanitizeDeviceInfoText(string value)
    {
        return (value ?? string.Empty)
            .Replace("\0", string.Empty, StringComparison.Ordinal)
            .Trim();
    }

    private static string FormatDeviceInfoSummaryValue(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "<none>" : value.Trim();

    private void DisconnectCore()
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
