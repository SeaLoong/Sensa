using Sensa.Configuration;
using Sensa.Signals;

namespace Sensa.Outputs;

/// <summary>A destination declares capabilities; bindings connect signals to those capabilities.</summary>
public sealed class SignalOutputOptions
{
    public List<SignalOutputBinding> Bindings { get; set; } = [];
    public bool VrChat { get; set; }
    public string ServerUrl { get; set; } = "";
    public string ClientId { get; set; } = "";
    public string SlotId { get; set; } = "";
    public int Channel { get; set; }
    public double MaxIntensity { get; set; }
    public int TaskDurationMs { get; set; } = 250;
    public List<string> WaveformFrames { get; set; } = [];
    public string RecordingFormat { get; set; } = "Funscript";
    public string RecordingName { get; set; } = "";
    public string MidiPortName { get; set; } = "";
    public string MqttTopicPrefix { get; set; } = "";
    public string MqttClientId { get; set; } = "";
    public bool MqttUseTls { get; set; }
}

public sealed class SignalOutputBinding
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public ComputedSignalInputConfig Source { get; set; } = new() { SourceMode = "Manual", OscPath = "L0" };
    public string Address { get; set; } = "";
    public string ValueType { get; set; } = "Float";
    public int? Channel { get; set; }
    public double InputMin { get; set; }
    public double InputMax { get; set; } = 1;
    public double OutputMin { get; set; }
    public double OutputMax { get; set; } = 1;
    public double StopValue { get; set; }
    public int RateHz { get; set; } = 20;
    public double Epsilon { get; set; } = .001;
    public string SendMode { get; set; } = "OnChange";
    public string Curve { get; set; } = "Linear";

    public double Map(double value)
    {
        var normal = Math.Clamp((value - InputMin) / (InputMax - InputMin), 0, 1);
        normal = Curve switch { "EaseIn" => normal * normal, "EaseOut" => 1 - (1 - normal) * (1 - normal),
            "SCurve" => normal * normal * (3 - 2 * normal), _ => normal };
        var result = OutputMin + normal * (OutputMax - OutputMin);
        return ValueType switch { "Int" => Math.Clamp(Math.Round(result, MidpointRounding.AwayFromZero), int.MinValue, int.MaxValue),
            "Bool" => result >= .5 ? 1 : 0, _ => result };
    }
}

public static class SignalOutputConfiguration
{
    public static bool IsProtocolOutput(OutputDeviceType type) => type is OutputDeviceType.OscParameter
        or OutputDeviceType.Dglab or OutputDeviceType.Recording or OutputDeviceType.HttpJson
        or OutputDeviceType.WebSocketJson or OutputDeviceType.Mqtt or OutputDeviceType.Midi;
    public static bool UsesBindings(OutputDeviceConfig output) => IsProtocolOutput(output.Type)
        || output.Signal.Bindings.Count > 0;

    public static SignalOutputOptions Clone(SignalOutputOptions? source)
    {
        source ??= new();
        var bindings = source.Bindings ?? [];
        if (bindings.Count > 64) throw new ArgumentException("每个输出最多连接 64 个信号 / Connect at most 64 signals to an output.");
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var copy = new SignalOutputOptions
        {
            VrChat = source.VrChat, ServerUrl = source.ServerUrl?.Trim() ?? "", ClientId = source.ClientId?.Trim() ?? "",
            SlotId = source.SlotId?.Trim() ?? "", Channel = source.Channel, MaxIntensity = source.MaxIntensity,
            TaskDurationMs = source.TaskDurationMs, WaveformFrames = (source.WaveformFrames ?? []).ToList(),
            RecordingFormat = source.RecordingFormat ?? "Funscript", RecordingName = source.RecordingName?.Trim() ?? "",
            MqttTopicPrefix = source.MqttTopicPrefix?.Trim() ?? "", MqttClientId = source.MqttClientId?.Trim() ?? "",
            MqttUseTls = source.MqttUseTls, MidiPortName = source.MidiPortName?.Trim() ?? "",
        };
        if (copy.Channel is < 0 or > 1 || !double.IsFinite(copy.MaxIntensity) || copy.MaxIntensity is < 0 or > 1000
            || copy.TaskDurationMs is < 100 or > 1000 || copy.WaveformFrames.Count > 100
            || copy.RecordingFormat is not ("Funscript" or "JsonLines" or "Csv") || copy.RecordingName.Length > 80)
            throw new ArgumentException("请检查通道、用户强度上限、100～1000 ms 任务时长和录制格式 / Check the channel, intensity limit, 100–1000 ms task duration and recording format.");
        foreach (var binding in bindings)
        {
            if (binding is null) throw new ArgumentException("请补全输出连接 / Complete the output binding.");
            var id = string.IsNullOrWhiteSpace(binding.Id) ? "Binding" + (copy.Bindings.Count + 1) : binding.Id.Trim();
            if (id.Length > 80 || !ids.Add(id)) throw new ArgumentException("请使用唯一的输出连接标识 / Use unique output binding IDs.");
            var input = binding.Source ?? new();
            var path = input.OscPath?.Trim() ?? "";
            if (input.SourceMode is not ("Direct" or "Computed" or "Constant" or "Manual" or "Script" or "DeviceFeedback" or "RecordingReplay" or "Protocol" or "SensaPoint" or "SensaPose")
                || path.Length > 512 || input.SourceMode != "Constant" && path.Length == 0 || !float.IsFinite(input.Value)
                || !Enum.IsDefined(input.PointMetric) || !Enum.IsDefined(input.PoseMetric))
                throw new ArgumentException("请选择完整的信号来源 / Choose a complete signal source.");
            var numbers = new[] { binding.InputMin, binding.InputMax, binding.OutputMin, binding.OutputMax, binding.StopValue, binding.Epsilon };
            if (binding.Channel is < 0 or > 1 || numbers.Any(number => !double.IsFinite(number)) || binding.InputMax == binding.InputMin || !double.IsFinite(binding.InputMax - binding.InputMin)
                || binding.RateHz is < 1 or > 100 || binding.Epsilon < 0 || binding.Epsilon > 1000000
                || binding.ValueType is not ("Float" or "Int" or "Bool")
                || binding.SendMode is not ("OnChange" or "FixedRate" or "OnEvent")
                || binding.Curve is not ("Linear" or "EaseIn" or "EaseOut" or "SCurve"))
                throw new ArgumentException("请检查输出量程、曲线、类型和 1～100 Hz 发送频率 / Check output ranges, curve, type and the 1–100 Hz send rate.");
            copy.Bindings.Add(new()
            {
                Id = id, Name = binding.Name?.Trim() ?? "", Address = binding.Address?.Trim() ?? "", ValueType = binding.ValueType, Channel = binding.Channel,
                InputMin = binding.InputMin, InputMax = binding.InputMax, OutputMin = binding.OutputMin, OutputMax = binding.OutputMax,
                StopValue = binding.StopValue, RateHz = binding.RateHz, Epsilon = binding.Epsilon, SendMode = binding.SendMode, Curve = binding.Curve,
                Source = new() { SourceMode = input.SourceMode, OscPath = path, PointMetric = input.PointMetric, PoseMetric = input.PoseMetric,
                    Value = input.Value, Weight = input.Weight },
            });
        }
        return copy;
    }

    private static string Canonical(string path)
    {
        var result = path.TrimStart('/');
        return result.StartsWith("avatar/parameters/", StringComparison.Ordinal) ? result[18..] : result;
    }

    public static void Validate(AppConfig config)
    {
        if (config.Outputs.Count > 64) throw new ArgumentException("最多配置 64 个输出 / Configure at most 64 outputs.");
        var computed = config.ComputedSignals.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
        var evaluator = new ComputedSignalEvaluator(config.ComputedSignals);
        foreach (var output in config.Outputs)
        {
            if (!UsesBindings(output)) continue;
            if (output.Enabled && output.Signal.Bindings.Count == 0)
                throw new ArgumentException("请为已启用的输出添加信号连接 / Add a signal binding to an enabled output.");
            ValidateEndpoint(output);
            foreach (var binding in output.Signal.Bindings)
            {
                if (Math.Abs(binding.OutputMin) > float.MaxValue || Math.Abs(binding.OutputMax) > float.MaxValue || Math.Abs(binding.StopValue) > float.MaxValue
                    || binding.ValueType == "Int" && new[] { binding.OutputMin, binding.OutputMax, binding.StopValue }.Any(value => value < int.MinValue || value > int.MaxValue))
                    throw new ArgumentException("请使用目标类型支持的数值范围 / Use values supported by the selected output type.");
                if (binding.Source.SourceMode == "Computed" && !computed.Contains(binding.Source.OscPath))
                    throw new ArgumentException("输出引用的计算信号尚未定义 / The output references an undefined computed signal.");
                if (output.Type == OutputDeviceType.OscParameter)
                {
                    if (!binding.Address.StartsWith('/') || binding.Address.Length > 512 || binding.Address.Any(char.IsWhiteSpace)
                        || binding.Address.IndexOfAny(['*', '?', '[', ']', '{', '}']) >= 0)
                        throw new ArgumentException("OSC 输出需要完整参数地址 / OSC output requires a complete parameter address.");
                    var actualHost = output.Signal.VrChat ? "127.0.0.1" : output.Host;
                    var actualPort = output.Signal.VrChat ? 9000 : output.Port;
                    var localTarget = string.Equals(actualHost, "localhost", StringComparison.OrdinalIgnoreCase)
                        || System.Net.IPAddress.TryParse(actualHost, out var ip) && System.Net.IPAddress.IsLoopback(ip);
                    if (localTarget && actualPort == config.Osc.ReceiverPort && config.Osc.Enabled)
                        throw new ArgumentException("OSC 输出目标与本机监听相同，请选择接收应用的端口 / Choose the receiving application's port instead of Sensa's listener.");
                    if (output.Signal.VrChat || localTarget && actualPort == 9000)
                    {
                        var reads = binding.Source.SourceMode == "Computed"
                            ? evaluator.GetRequiredInputs([binding.Source.OscPath]) : [binding.Source];
                        var written = Canonical(binding.Address);
                        if (reads.Any(input => input.SourceMode == "Direct"
                            && Sensa.Input.Osc.OscParameterStore.MatchesPathPattern(Canonical(input.OscPath), written)))
                            throw new ArgumentException("请为反馈使用独立参数，避免直接读写回路 / Choose a separate feedback parameter to avoid a direct loop.");
                    }
                }
                if (!IsProtocolOutput(output.Type) && (!Enum.TryParse<Sensa.Motion.MotionAxis>(binding.Address, out var targetAxis)
                    || !Enum.IsDefined(targetAxis) || binding.Address != targetAxis.ToString()))
                    throw new ArgumentException("请选择有效的目标轴 / Choose a supported target axis.");
                if (output.Type is OutputDeviceType.Handy or OutputDeviceType.Autoblow or OutputDeviceType.VacuGlide or OutputDeviceType.Lovense
                    && binding.Address != output.Device.Axis)
                    throw new ArgumentException("Vendor output bindings must target the configured device source axis.");
                if (output.Type == OutputDeviceType.Intiface && binding.Address != "L0"
                    && binding.Address != IntifaceConfig.NormalizeVibrationAxis(output.VibrationAxis)
                    && !output.IntifaceFeatures.Any(route => route.SourceAxis == binding.Address
                        || route.OutputType == "Rotate" && route.DirectionAxis == binding.Address))
                    throw new ArgumentException("请选择默认轴或执行器映射使用的轴 / Choose a default axis or an axis used by an actuator mapping.");
                if (!IsProtocolOutput(output.Type) && new[] { binding.OutputMin, binding.OutputMax, binding.StopValue }.Any(value => value is < 0 or > 1))
                    throw new ArgumentException("目标轴使用 0～1 的数值 / Target axes use values from 0 to 1.");
                if (output.Type == OutputDeviceType.Recording && binding.Address.Length > 80)
                    throw new ArgumentException("录制信号标识最多 80 个字符 / Recording signal IDs support up to 80 characters.");
                if (output.Type == OutputDeviceType.Dglab && binding.Address is not ("Intensity" or "Pulse"))
                    throw new ArgumentException("请选择强度或波形 / Choose intensity or pulse.");
                if (output.Type == OutputDeviceType.Midi)
                    foreach (var value in new[] { binding.OutputMin, binding.OutputMax, binding.StopValue })
                        _ = Adapters.MidiCcOutputCodec.Encode(new(binding.Address, value, Enum.Parse<Adapters.SignalOutputValueType>(binding.ValueType)));
                if (output.Type is OutputDeviceType.OscParameter or OutputDeviceType.HttpJson or OutputDeviceType.WebSocketJson or OutputDeviceType.Mqtt)
                    foreach (var value in new[] { binding.OutputMin, binding.OutputMax, binding.StopValue })
                    {
                        var address = output.Type == OutputDeviceType.Mqtt ? output.Signal.MqttTopicPrefix + binding.Address : binding.Address;
                        var sample = new Adapters.SignalOutputValue(address, value, Enum.Parse<Adapters.SignalOutputValueType>(binding.ValueType));
                        var payload = output.Type == OutputDeviceType.OscParameter
                            ? Adapters.OscSignalOutputCodec.Encode(sample) : Adapters.JsonSignalOutputCodec.Encode(sample);
                        if (output.Type == OutputDeviceType.Mqtt) _ = Adapters.MqttOutputCodec.Publish(payload.Address, payload.Data.Span);
                    }
            }
            var addresses = output.Signal.Bindings.Select(binding => (output.Type == OutputDeviceType.Recording && binding.Address.Length == 0 ? binding.Id : binding.Address)
                + (output.Type == OutputDeviceType.Dglab ? ":" + (binding.Channel ?? output.Signal.Channel) : ""));
            if (addresses.Distinct(StringComparer.Ordinal).Count() != output.Signal.Bindings.Count)
                throw new ArgumentException("请为每条连接选择独立的目标 / Choose a distinct target for each binding.");
            if (output.Type == OutputDeviceType.Dglab)
            {
                if (output.Signal.ServerUrl.Length > 0) _ = Dglab.DglabV4Protocol.ValidateServerUrl(output.Signal.ServerUrl);
                if (output.Signal.ClientId.Length > 0) Dglab.DglabV4Protocol.ValidateIdentifier(output.Signal.ClientId, "clientId");
                if (output.Signal.SlotId.Length > 0) Dglab.DglabV4Protocol.ValidateIdentifier(output.Signal.SlotId, "slotId");
                if (output.Signal.WaveformFrames.Count > 0)
                    _ = Dglab.DglabV4Protocol.Pulse(new("validation", "validation", Dglab.DglabChannel.A), output.Signal.WaveformFrames,
                        output.Signal.TaskDurationMs, output.Signal.WaveformFrames[0]?.Length == 6 ? 2 : 3);
            }
        }
    }

    private static void ValidateEndpoint(OutputDeviceConfig output)
    {
        if (output.Type is OutputDeviceType.HttpJson or OutputDeviceType.WebSocketJson)
        {
            if (!output.Enabled && string.IsNullOrWhiteSpace(output.WebsocketAddress)) return;
            if (!Uri.TryCreate(output.WebsocketAddress, UriKind.Absolute, out var address))
                throw new ArgumentException("请填写完整的服务地址 / Enter an absolute service URL.");
            _ = output.Type == OutputDeviceType.HttpJson
                ? Adapters.SerializedOutputPayloadTransport.ValidateAddress(address, "http", "https")
                : Adapters.SerializedOutputPayloadTransport.ValidateAddress(address, "ws", "wss");
        }
        else if (output.Type is OutputDeviceType.OscParameter or OutputDeviceType.Mqtt)
        {
            var host = output.Type == OutputDeviceType.OscParameter && output.Signal.VrChat ? "127.0.0.1" : output.Host;
            var port = output.Type == OutputDeviceType.OscParameter && output.Signal.VrChat ? 9000 : output.Port;
            if (output.Enabled || !string.IsNullOrWhiteSpace(host))
                Adapters.SerializedOutputPayloadTransport.ValidateHost(host, port);
            if (output.Type == OutputDeviceType.Mqtt)
                _ = Adapters.MqttOutputCodec.Connect(new() { Host = host, Port = port, UseTls = output.Signal.MqttUseTls,
                    ClientId = string.IsNullOrWhiteSpace(output.Signal.MqttClientId) ? "sensa-" + output.Id : output.Signal.MqttClientId });
        }
    }
}
