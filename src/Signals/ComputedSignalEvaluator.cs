namespace Sensa.Signals;

/// <summary>Validity and provenance travel with the value through every calculation.</summary>
public sealed record ComputedSignalSample(float? Value, bool Valid, string Reason,
    string? SourceKey, long TimestampMs, string? CoordinateFrame = null, string? OriginKey = null)
{
    public static ComputedSignalSample Success(float value, string? sourceKey, long timestampMs,
        string? coordinateFrame = null, string? originKey = null) => new(value, true, "", sourceKey, timestampMs, coordinateFrame, originKey);
    public static ComputedSignalSample Invalid(string reason) => new(null, false, reason, null, 0);
}

/// <summary>
/// Compiles a bounded acyclic calculation graph. A single evaluation reuses leaf reads and
/// intermediate values; it never publishes synthetic OSC parameters or retains stale results.
/// </summary>
public sealed partial class ComputedSignalEvaluator : ISignalProcessor
{
    public const int MaximumSignals = 64;
    public const int MaximumInputs = 16;
    public const int MaximumDepth = 16;

    private readonly Dictionary<string, ComputedSignalConfig> _signals;
    private readonly ComputedSignalConfig[] _ordered;
    private readonly object _sync = new();

    public ComputedSignalEvaluator(IEnumerable<ComputedSignalConfig>? signals)
    {
        var definitions = CloneAndValidate(signals);
        _signals = definitions.ToDictionary(signal => signal.Id, StringComparer.Ordinal);
        var ordered = new List<ComputedSignalConfig>();
        var visited = new HashSet<string>(StringComparer.Ordinal);
        void Visit(ComputedSignalConfig signal)
        {
            if (!visited.Add(signal.Id)) return;
            foreach (var input in ActiveInputs(signal).Where(input => input.SourceMode == "Computed"))
                Visit(_signals[input.OscPath]);
            ordered.Add(signal);
        }
        foreach (var signal in definitions) Visit(signal);
        _ordered = ordered.ToArray();
    }

    /// <summary>Resolve all definitions once, with one read per distinct external leaf.</summary>
    public IReadOnlyDictionary<string, ComputedSignalSample> Evaluate(long nowMs,
        Func<ComputedSignalInputConfig, ComputedSignalSample> resolver)
    {
        ArgumentNullException.ThrowIfNull(resolver);
        lock (_sync) return EvaluateCore(nowMs, resolver);
    }

    /// <summary>Discard time-dependent state after deactivation, source changes or emergency stop.</summary>
    public void Reset()
    {
        lock (_sync) _temporal.Clear();
    }

    private IReadOnlyDictionary<string, ComputedSignalSample> EvaluateCore(long nowMs,
        Func<ComputedSignalInputConfig, ComputedSignalSample> resolver)
    {
        var results = new Dictionary<string, ComputedSignalSample>(StringComparer.Ordinal);
        var leaves = new Dictionary<(string Mode, string Path, PointMetric Point, PoseMetric Pose), ComputedSignalSample>();
        foreach (var signal in _ordered)
        {
            var inputs = ActiveInputs(signal).ToArray();
            var samples = new ComputedSignalSample[inputs.Length];
            for (var index = 0; index < inputs.Length; index++)
            {
                var input = inputs[index];
                if (input.SourceMode == "Constant")
                    samples[index] = ComputedSignalSample.Success(input.Value, null, nowMs);
                else if (input.SourceMode == "Computed")
                    samples[index] = results[input.OscPath];
                else
                {
                    var key = (input.SourceMode, input.OscPath, input.PointMetric, input.PoseMetric);
                    if (!leaves.TryGetValue(key, out var sample))
                    {
                        sample = resolver(input);
                        leaves.Add(key, sample);
                    }
                    samples[index] = sample;
                }
            }
            results.Add(signal.Id, Calculate(signal, inputs, samples, nowMs));
        }
        return results;
    }

    /// <summary>External leaves reachable from the requested calculations; inactive weights are skipped.</summary>
    public IReadOnlyList<ComputedSignalInputConfig> GetRequiredInputs(IEnumerable<string> ids)
    {
        ArgumentNullException.ThrowIfNull(ids);
        var visited = new HashSet<string>(StringComparer.Ordinal);
        var leaves = new Dictionary<(string Mode, string Path, PointMetric Point, PoseMetric Pose), ComputedSignalInputConfig>();
        void Visit(string id)
        {
            if (!visited.Add(id)) return;
            if (!_signals.TryGetValue(id, out var signal))
                throw new ArgumentException($"请选择已有的计算信号：{id} / Choose an existing computed signal: {id}");
            foreach (var input in ActiveInputs(signal))
            {
                if (input.SourceMode == "Computed") Visit(input.OscPath);
                else if (input.SourceMode != "Constant")
                    leaves.TryAdd((input.SourceMode, input.OscPath, input.PointMetric, input.PoseMetric), CloneInput(input));
            }
        }
        foreach (var id in ids) Visit(id);
        return leaves.Values.ToArray();
    }

    public static List<ComputedSignalConfig> CloneAndValidate(IEnumerable<ComputedSignalConfig>? source)
    {
        var definitions = source?.ToArray() ?? [];
        if (definitions.Length > MaximumSignals)
            throw new ArgumentException($"最多可配置 {MaximumSignals} 个计算信号 / Use at most {MaximumSignals} computed signals.");
        var result = new List<ComputedSignalConfig>(definitions.Length);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var definition in definitions)
        {
            if (definition is null) throw new ArgumentException("请提供完整的计算信号配置 / A computed signal definition is required.");
            var id = definition.Id?.Trim() ?? "";
            if (id.Length is < 1 or > 48 || !char.IsAsciiLetter(id[0])
                || id.Any(character => !char.IsAsciiLetterOrDigit(character) && character is not '_' and not '-'))
                throw new ArgumentException("计算信号 ID 使用 1～48 个英文字母、数字、下划线或短横线，并以字母开头 / Computed signal IDs use 1–48 ASCII letters, digits, underscores or hyphens and start with a letter.");
            if (!ids.Add(id)) throw new ArgumentException($"请为每个计算信号设置唯一的 ID：{id} / Choose a unique computed signal ID: {id}");
            var name = definition.Name?.Trim() ?? "";
            if (name.Length > 80) throw new ArgumentException($"计算信号 {id} 的名称最多 80 个字符 / Computed signal {id}: use a name of at most 80 characters.");
            if (!Enum.IsDefined(definition.Operation)) throw new ArgumentException($"请为计算信号 {id} 选择一种计算方式 / Computed signal {id}: choose a supported calculation.");
            if (definition.MaxAgeMs != 0 && definition.MaxAgeMs is < 100 or > 60000)
                throw new ArgumentException($"计算信号 {id} 的输入有效期可设为 0（沿用来源规则）或 100～60000 毫秒 / Computed signal {id}: use zero to follow source freshness rules or an input age between 100 and 60000 ms.");
            if (definition.TimeMs is < 0 or > 60000)
                throw new ArgumentException($"计算信号 {id} 的处理时间可设为 0～60000 毫秒 / Computed signal {id}: use a processing time from zero to 60000 ms.");
            if (!float.IsFinite(definition.Threshold) || !float.IsFinite(definition.ReleaseThreshold)
                || !float.IsFinite(definition.FrequencyHz) || definition.FrequencyHz is < 0 or > 100
                || !float.IsFinite(definition.Amplitude) || !float.IsFinite(definition.Offset))
                throw new ArgumentException($"请为计算信号 {id} 设置有限的阈值、幅度和偏移，频率范围为 0～100 Hz / Computed signal {id}: thresholds, amplitude and offset must be finite; frequency ranges from zero to 100 Hz.");
            if (definition.Operation == ComputedSignalOperation.DeadZone && definition.Threshold < 0
                || definition.Operation == ComputedSignalOperation.Hysteresis && definition.ReleaseThreshold > definition.Threshold)
                throw new ArgumentException($"计算信号 {id} 的死区需为非负数，迟滞关闭阈值不高于开启阈值 / Computed signal {id}: dead-zone size must be non-negative and the release threshold must not exceed the active threshold.");
            var inputs = definition.Inputs?.ToArray() ?? [];
            if (!ValidInputCount(definition.Operation, inputs.Length))
                throw new ArgumentException(IsGeometry(definition.Operation)
                    ? $"计算信号 {id} 的空间计算输入不完整：点距离与夹角使用两组三维量（6 个输入），平面计算使用位置、原点、法向（9 个输入），双轴平面使用位置、原点和两条轴（12 个输入） / Computed signal {id}: distance and angle calculations require 6 inputs, normal-defined planes require 9, and axis-defined planes require 12."
                    : $"计算信号 {id} 的输入数量与运算方式不符：时间与门限处理使用一个输入，正弦波可使用零或一个输入，差值和比值使用两个输入 / Computed signal {id}: temporal and threshold operations require one input, sine accepts zero or one, and difference and ratio require two.");
            var copies = new List<ComputedSignalInputConfig>(inputs.Length);
            foreach (var input in inputs)
            {
                if (input is null) throw new ArgumentException($"请补全计算信号 {id} 的输入配置 / Computed signal {id}: an input definition is required.");
                var copy = CloneInput(input);
                if (copy.SourceMode is not ("Direct" or "SensaPoint" or "SensaPose" or "Computed" or "Constant"
                    or "Manual" or "Script" or "DeviceFeedback" or "RecordingReplay" or "Protocol"))
                    throw new ArgumentException($"请为计算信号 {id} 选择一种输入类型 / Computed signal {id}: choose a supported input type.");
                if (copy.SourceMode != "Constant" && (copy.OscPath.Length is < 1 or > 512))
                    throw new ArgumentException($"请为计算信号 {id} 填写输入路径或计算信号 ID，最长 512 个字符 / Computed signal {id}: each input requires a path or calculation ID of at most 512 characters.");
                if (!Enum.IsDefined(copy.PointMetric) || !Enum.IsDefined(copy.PoseMetric))
                    throw new ArgumentException($"请为计算信号 {id} 选择有效的空间指标 / Computed signal {id}: choose a supported spatial metric.");
                if (!float.IsFinite(copy.Weight) || copy.Weight < 0 || !float.IsFinite(copy.Value))
                    throw new ArgumentException($"计算信号 {id} 的权重需为有限的非负数，常量需为有限数值 / Computed signal {id}: weights must be finite and non-negative, and constants must be finite.");
                copies.Add(copy);
            }
            if (definition.Operation == ComputedSignalOperation.WeightedAverage && !copies.Any(input => input.Weight > 0))
                throw new ArgumentException($"请为计算信号 {id} 至少设置一个大于零的权重 / Computed signal {id}: at least one weight must be greater than zero.");
            result.Add(new ComputedSignalConfig
            {
                Id = id, Name = name, Operation = definition.Operation, Inputs = copies, MaxAgeMs = definition.MaxAgeMs,
                TimeMs = definition.TimeMs, Threshold = definition.Threshold, ReleaseThreshold = definition.ReleaseThreshold,
                FrequencyHz = definition.FrequencyHz, Amplitude = definition.Amplitude, Offset = definition.Offset,
            });
        }
        var lookup = result.ToDictionary(signal => signal.Id, StringComparer.Ordinal);
        var state = new Dictionary<string, int>(StringComparer.Ordinal);
        var depths = new Dictionary<string, int>(StringComparer.Ordinal);
        int Visit(ComputedSignalConfig signal)
        {
            if (state.GetValueOrDefault(signal.Id) == 1)
                throw new ArgumentException($"请按输入到结果的方向连接计算信号 {signal.Id}，并移除循环引用 / Computed signal {signal.Id}: calculations must form a chain without cycles.");
            if (depths.TryGetValue(signal.Id, out var depth)) return depth;
            state[signal.Id] = 1;
            depth = 1;
            // Validate every reference, including temporarily zero-weight inputs, so a later weight edit is predictable.
            foreach (var input in signal.Inputs.Where(input => input.SourceMode == "Computed"))
            {
                if (!lookup.TryGetValue(input.OscPath, out var dependency))
                    throw new ArgumentException($"计算信号 {signal.Id} 引用的 {input.OscPath} 尚未定义，请先创建该计算信号 / Computed signal {signal.Id}: unknown calculation {input.OscPath}.");
                depth = Math.Max(depth, 1 + Visit(dependency));
            }
            if (depth > MaximumDepth) throw new ArgumentException($"计算信号 {signal.Id} 的计算链最多为 {MaximumDepth} 层 / Computed signal {signal.Id}: use a chain of at most {MaximumDepth} calculations.");
            state[signal.Id] = 2;
            depths[signal.Id] = depth;
            return depth;
        }
        foreach (var signal in result) Visit(signal);
        return result;
    }

    public static void ValidateMappingReferences(IEnumerable<SignalMapping> mappings,
        IEnumerable<ComputedSignalConfig> definitions)
    {
        var ids = definitions.Select(signal => signal.Id).ToHashSet(StringComparer.Ordinal);
        foreach (var mapping in mappings.Where(mapping => mapping.SourceMode == "Computed"))
            if (!ids.Contains(mapping.OscPath))
                throw new ArgumentException($"映射引用的计算信号 {mapping.OscPath} 尚未定义，请先创建或重新选择计算信号 / Mapping references an unknown computed signal: {mapping.OscPath}");
    }

    private static IEnumerable<ComputedSignalInputConfig> ActiveInputs(ComputedSignalConfig signal) =>
        signal.Operation == ComputedSignalOperation.WeightedAverage
            ? signal.Inputs.Where(input => input.Weight > 0) : signal.Inputs;

    private static ComputedSignalInputConfig CloneInput(ComputedSignalInputConfig input) => new()
    {
        SourceMode = input.SourceMode?.Trim() ?? "Direct", OscPath = input.OscPath?.Trim() ?? "",
        PointMetric = input.PointMetric, PoseMetric = input.PoseMetric, Weight = input.Weight, Value = input.Value,
    };

    private ComputedSignalSample Calculate(ComputedSignalConfig signal,
        ComputedSignalInputConfig[] inputs, ComputedSignalSample[] samples, long nowMs)
    {
        var invalid = samples.FirstOrDefault(sample => !sample.Valid || !sample.Value.HasValue || !float.IsFinite(sample.Value.Value));
        if (invalid is not null)
            return Invalidate(signal.Id, string.IsNullOrWhiteSpace(invalid.Reason)
                ? "等待有效的计算输入 / Waiting for valid calculation inputs" : invalid.Reason);
        if (samples.Any(sample => sample.TimestampMs > nowMs
            || signal.MaxAgeMs > 0 && (double)nowMs - sample.TimestampMs > signal.MaxAgeMs))
            return Invalidate(signal.Id, "部分计算输入已超时 / A calculation input has expired");
        var sources = samples.Select(sample => sample.SourceKey).Where(source => !string.IsNullOrEmpty(source)).Distinct(StringComparer.Ordinal).ToArray();
        if (sources.Length > 1)
            return Invalidate(signal.Id, "请选择同一 OSC 来源的输入 / Choose inputs from the same OSC source");
        string? frame;
        if (IsGeometry(signal.Operation))
        {
            if (!TryGeometryFrame(signal.Operation, samples, out frame))
                return Invalidate(signal.Id, "空间计算需要同一坐标系、同量纲的 XYZ 分组；位置与方向请分别选择 / Spatial calculations require compatible coordinate frames and consistent XYZ groups; choose positions and directions separately");
        }
        else
        {
            var frames = samples.Select(sample => sample.CoordinateFrame).Where(frame => !string.IsNullOrEmpty(frame)).Distinct(StringComparer.Ordinal).ToArray();
            string? convertedFrame = null;
            if (frames.Length == 2 && signal.Operation == ComputedSignalOperation.Product
                && samples.Count(sample => sample.CoordinateFrame == "AvatarRootLocal") == 1
                && samples.Count(sample => sample.CoordinateFrame == "AvatarRootLocal:Scale") == 1
                && samples.Select((sample, index) => !string.IsNullOrEmpty(sample.CoordinateFrame) || inputs[index].SourceMode == "Constant").All(value => value))
                convertedFrame = "AvatarRootMeters";
            else if (signal.Operation == ComputedSignalOperation.Ratio && samples.Length == 2
                && samples[0].CoordinateFrame == "AvatarRootMeters" && samples[1].CoordinateFrame == "AvatarRootLocal:Scale")
                convertedFrame = "AvatarRootLocal";
            if (frames.Length > 1 && convertedFrame is null)
                return Invalidate(signal.Id, "请选择同一坐标系的空间输入 / Choose spatial inputs in the same coordinate frame");
            frame = convertedFrame ?? frames.SingleOrDefault();
        }
        var source = sources.SingleOrDefault();
        var origin = CombineOrigins(samples);
        var timestamp = samples.Length == 0 ? nowMs : samples.Min(sample => sample.TimestampMs);
        if (IsTemporal(signal.Operation))
            return CalculateTemporal(signal, samples, nowMs, source, frame, origin, timestamp);
        var values = samples.Select(sample => (double)sample.Value!.Value).ToArray();
        if (signal.Operation == ComputedSignalOperation.Ratio && values[1] == 0)
            return Invalidate(signal.Id, "请为比值选择非零分母 / Choose a non-zero denominator for the ratio");
        if (IsGeometry(signal.Operation))
        {
            if (!TryGeometryValue(signal.Operation, values, out var geometricValue, out var reason))
                return Invalidate(signal.Id, reason);
            if (signal.Operation is ComputedSignalOperation.VectorAngle or ComputedSignalOperation.PlaneAngle)
                frame = string.IsNullOrEmpty(frame) ? "Angle" : frame + ":Angle";
            return FiniteResult(signal.Id, geometricValue, source, timestamp, frame, origin);
        }
        double value = signal.Operation switch
        {
            ComputedSignalOperation.WeightedAverage => values.Select((item, index) => item * inputs[index].Weight).Sum()
                / inputs.Sum(input => (double)input.Weight),
            ComputedSignalOperation.Average => values.Average(),
            ComputedSignalOperation.Sum => values.Sum(),
            ComputedSignalOperation.Difference => values[0] - values[1],
            ComputedSignalOperation.Product => values.Aggregate(1d, (product, item) => product * item),
            ComputedSignalOperation.Ratio => values[0] / values[1],
            ComputedSignalOperation.Minimum => values.Min(),
            ComputedSignalOperation.Maximum => values.Max(),
            ComputedSignalOperation.Magnitude => Math.Sqrt(values.Sum(item => item * item)),
            ComputedSignalOperation.DeadZone => Math.Abs(values[0]) <= signal.Threshold ? 0 : values[0],
            _ => double.NaN,
        };
        return FiniteResult(signal.Id, value, source, timestamp, frame, origin);
    }

    private ComputedSignalSample FiniteResult(string id, double value, string? source,
        long timestamp, string? frame, string? origin)
    {
        if (!double.IsFinite(value) || value > float.MaxValue || value < -float.MaxValue)
            return Invalidate(id, "计算结果超出有限数值范围 / The calculation exceeds the finite numeric range");
        return ComputedSignalSample.Success((float)value, source, timestamp, frame, origin);
    }

    private ComputedSignalSample Invalidate(string id, string reason)
    {
        _temporal.Remove(id);
        return ComputedSignalSample.Invalid(reason);
    }

    private static bool ValidInputCount(ComputedSignalOperation operation, int count) => operation switch
    {
        ComputedSignalOperation.PointDistance or ComputedSignalOperation.VectorAngle or ComputedSignalOperation.PlaneAngle => count == 6,
        ComputedSignalOperation.PlaneDepth or ComputedSignalOperation.PlaneOffset => count == 9,
        ComputedSignalOperation.PlaneDepthFromAxes or ComputedSignalOperation.PlaneOffsetFromAxes => count == 12,
        ComputedSignalOperation.Sine => count is 0 or 1,
        ComputedSignalOperation.Difference or ComputedSignalOperation.Ratio => count == 2,
        _ when IsTemporal(operation) || operation == ComputedSignalOperation.DeadZone => count == 1,
        _ => count is >= 1 and <= MaximumInputs,
    };

    private static string? CombineOrigins(ComputedSignalSample[] samples)
    {
        var origins = samples.Select(sample => sample.OriginKey).Where(origin => !string.IsNullOrEmpty(origin))
            .Distinct(StringComparer.Ordinal).OrderBy(origin => origin, StringComparer.Ordinal).ToArray();
        if (origins.Length == 0) return null;
        if (origins.Length == 1) return origins[0];
        // A digest bounds lineage size even when a calculation is referenced repeatedly in a deep DAG.
        var bytes = System.Text.Encoding.UTF8.GetBytes(string.Join('\0', origins));
        return "combined:" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes));
    }
}
