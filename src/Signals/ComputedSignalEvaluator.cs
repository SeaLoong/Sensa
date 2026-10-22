namespace Sensa.Signals;

/// <summary>Validity and provenance travel with the value through every calculation.</summary>
public sealed record ComputedSignalSample(float? Value, bool Valid, string Reason,
    string? SourceKey, long TimestampMs, string? CoordinateFrame = null)
{
    public static ComputedSignalSample Success(float value, string? sourceKey, long timestampMs,
        string? coordinateFrame = null) => new(value, true, "", sourceKey, timestampMs, coordinateFrame);
    public static ComputedSignalSample Invalid(string reason) => new(null, false, reason, null, 0);
}

/// <summary>
/// Compiles a bounded acyclic calculation graph. A single evaluation reuses leaf reads and
/// intermediate values; it never publishes synthetic OSC parameters or retains stale results.
/// </summary>
public sealed class ComputedSignalEvaluator
{
    public const int MaximumSignals = 64;
    public const int MaximumInputs = 16;
    public const int MaximumDepth = 16;

    private readonly Dictionary<string, ComputedSignalConfig> _signals;
    private readonly ComputedSignalConfig[] _ordered;

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
            var inputs = definition.Inputs?.ToArray() ?? [];
            if (inputs.Length is < 1 or > MaximumInputs
                || definition.Operation is ComputedSignalOperation.Difference or ComputedSignalOperation.Ratio && inputs.Length != 2)
                throw new ArgumentException($"计算信号 {id} 可使用 1～{MaximumInputs} 个输入，差值和比值各需两个输入 / Computed signal {id}: use 1–{MaximumInputs} inputs; difference and ratio require two.");
            var copies = new List<ComputedSignalInputConfig>(inputs.Length);
            foreach (var input in inputs)
            {
                if (input is null) throw new ArgumentException($"请补全计算信号 {id} 的输入配置 / Computed signal {id}: an input definition is required.");
                var copy = CloneInput(input);
                if (copy.SourceMode is not ("Direct" or "SensaPoint" or "SensaPose" or "Computed" or "Constant"))
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

    private static ComputedSignalSample Calculate(ComputedSignalConfig signal,
        ComputedSignalInputConfig[] inputs, ComputedSignalSample[] samples, long nowMs)
    {
        var invalid = samples.FirstOrDefault(sample => !sample.Valid || !sample.Value.HasValue || !float.IsFinite(sample.Value.Value));
        if (invalid is not null)
            return ComputedSignalSample.Invalid(string.IsNullOrWhiteSpace(invalid.Reason)
                ? "等待有效的计算输入 / Waiting for valid calculation inputs" : invalid.Reason);
        if (samples.Any(sample => sample.TimestampMs > nowMs
            || signal.MaxAgeMs > 0 && (double)nowMs - sample.TimestampMs > signal.MaxAgeMs))
            return ComputedSignalSample.Invalid("部分计算输入已超时 / A calculation input has expired");
        var sources = samples.Select(sample => sample.SourceKey).Where(source => !string.IsNullOrEmpty(source)).Distinct(StringComparer.Ordinal).ToArray();
        if (sources.Length > 1)
            return ComputedSignalSample.Invalid("请选择同一 OSC 来源的输入 / Choose inputs from the same OSC source");
        var frames = samples.Select(sample => sample.CoordinateFrame).Where(frame => !string.IsNullOrEmpty(frame)).Distinct(StringComparer.Ordinal).ToArray();
        if (frames.Length > 1)
            return ComputedSignalSample.Invalid("请选择同一坐标系的空间输入 / Choose spatial inputs in the same coordinate frame");
        var values = samples.Select(sample => (double)sample.Value!.Value).ToArray();
        if (signal.Operation == ComputedSignalOperation.Ratio && values[1] == 0)
            return ComputedSignalSample.Invalid("请为比值选择非零分母 / Choose a non-zero denominator for the ratio");
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
            _ => double.NaN,
        };
        if (!double.IsFinite(value) || value > float.MaxValue || value < -float.MaxValue)
            return ComputedSignalSample.Invalid("计算结果超出有限数值范围 / The calculation exceeds the finite numeric range");
        return ComputedSignalSample.Success((float)value, sources.SingleOrDefault(),
            samples.Min(sample => sample.TimestampMs), frames.SingleOrDefault());
    }
}
