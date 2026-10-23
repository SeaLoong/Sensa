namespace Sensa.Signals;

public sealed partial class ComputedSignalEvaluator
{
    public const int MaximumDelaySamples = 4096;
    private readonly Dictionary<string, TemporalState> _temporal = new(StringComparer.Ordinal);

    private sealed class TemporalState(string identity, long nowMs)
    {
        public string Identity { get; } = identity;
        public long StartedMs { get; } = nowMs;
        public long LastMs { get; set; } = nowMs;
        public bool Initialized { get; set; }
        public double Value { get; set; }
        public double PreviousValue { get; set; }
        public bool PreviousGate { get; set; }
        public bool Gate { get; set; }
        public long? ActiveSinceMs { get; set; }
        public long? DeadlineMs { get; set; }
        public ComputedSignalSample? LastOutput { get; set; }
        public Queue<(long AtMs, ComputedSignalSample Sample)> History { get; } = new();
        public ComputedSignalSample? Delayed { get; set; }
    }

    internal static bool IsTemporal(ComputedSignalOperation operation) => operation is
        ComputedSignalOperation.Smooth or ComputedSignalOperation.Hysteresis or ComputedSignalOperation.Delay
        or ComputedSignalOperation.Derivative or ComputedSignalOperation.PeakHold
        or ComputedSignalOperation.RisingEdge or ComputedSignalOperation.FallingEdge
        or ComputedSignalOperation.Pulse or ComputedSignalOperation.Cooldown or ComputedSignalOperation.Duration
        or ComputedSignalOperation.Sine or ComputedSignalOperation.Envelope;

    private ComputedSignalSample CalculateTemporal(ComputedSignalConfig signal, ComputedSignalSample[] samples,
        long nowMs, string? source, string? frame, string? origin, long timestamp)
    {
        var identity = string.Join('\0', source, frame, origin);
        if (!_temporal.TryGetValue(signal.Id, out var state) || state.Identity != identity || nowMs < state.LastMs)
        {
            state = new TemporalState(identity, nowMs);
            _temporal[signal.Id] = state;
        }
        // Runtime and UI previews may inspect the same tick. Reading an event twice does not consume it.
        if (state.Initialized && nowMs == state.LastMs) return state.LastOutput!;

        var x = samples.Length == 0 ? 1d : samples[0].Value!.Value;
        var elapsed = state.Initialized ? Math.Max(0, (double)nowMs - state.LastMs) : 0;
        var gate = x >= signal.Threshold;
        var rising = state.Initialized && gate && !state.PreviousGate;
        var falling = state.Initialized && !gate && state.PreviousGate;
        double value;
        ComputedSignalSample? delayed = null;
        switch (signal.Operation)
        {
            case ComputedSignalOperation.Smooth:
                value = !state.Initialized || signal.TimeMs == 0 ? x
                    : state.Value + (x - state.Value) * (1 - Math.Exp(-elapsed / signal.TimeMs));
                break;
            case ComputedSignalOperation.Hysteresis:
                if (x >= signal.Threshold) state.Gate = true;
                else if (x <= signal.ReleaseThreshold) state.Gate = false;
                value = state.Gate ? 1 : 0;
                frame = null;
                break;
            case ComputedSignalOperation.Delay:
                if (state.History.Count >= MaximumDelaySamples)
                    return Invalidate(signal.Id, "延迟缓冲已满，请降低采样频率或缩短延迟 / Delay buffer is full; reduce the sample rate or delay duration");
                state.History.Enqueue((nowMs, ComputedSignalSample.Success((float)x, source, timestamp, frame, origin)));
                var cutoff = nowMs < long.MinValue + signal.TimeMs ? long.MinValue : nowMs - signal.TimeMs;
                while (state.History.TryPeek(out var first) && first.AtMs <= cutoff)
                    state.Delayed = state.History.Dequeue().Sample;
                delayed = state.Delayed;
                value = delayed?.Value ?? 0;
                break;
            case ComputedSignalOperation.Derivative:
                value = state.Initialized && elapsed > 0 ? (x - state.PreviousValue) * 1000 / elapsed : 0;
                frame = DerivativeFrame(frame);
                break;
            case ComputedSignalOperation.PeakHold:
                if (!state.Initialized || signal.TimeMs == 0 || x >= state.Value
                    || !state.DeadlineMs.HasValue || nowMs >= state.DeadlineMs.Value)
                {
                    state.Value = x;
                    state.DeadlineMs = Deadline(nowMs, signal.TimeMs);
                }
                value = state.Value;
                break;
            case ComputedSignalOperation.RisingEdge:
                value = rising ? 1 : 0;
                frame = null;
                break;
            case ComputedSignalOperation.FallingEdge:
                value = falling ? 1 : 0;
                frame = null;
                break;
            case ComputedSignalOperation.Pulse:
                if (rising) state.DeadlineMs = Deadline(nowMs, signal.TimeMs);
                value = rising || state.DeadlineMs.HasValue && nowMs < state.DeadlineMs.Value ? 1 : 0;
                frame = null;
                break;
            case ComputedSignalOperation.Cooldown:
                var accepted = rising && (!state.DeadlineMs.HasValue || nowMs >= state.DeadlineMs.Value);
                if (accepted) state.DeadlineMs = Deadline(nowMs, signal.TimeMs);
                value = accepted ? 1 : 0;
                frame = null;
                break;
            case ComputedSignalOperation.Duration:
                if (!gate) state.ActiveSinceMs = null;
                else state.ActiveSinceMs ??= nowMs;
                value = state.ActiveSinceMs.HasValue && (double)nowMs - state.ActiveSinceMs.Value >= signal.TimeMs ? 1 : 0;
                frame = null;
                break;
            case ComputedSignalOperation.Sine:
                var cycles = ((double)nowMs - state.StartedMs) / 1000 * signal.FrequencyHz % 1;
                value = signal.Offset + signal.Amplitude * Math.Sin(cycles * Math.Tau) * x;
                break;
            case ComputedSignalOperation.Envelope:
                value = signal.TimeMs == 0 ? gate ? 1 : 0
                    : Math.Clamp(state.Value + (gate ? 1 : -1) * elapsed / signal.TimeMs, 0, 1);
                frame = null;
                break;
            default:
                throw new InvalidOperationException("Unsupported temporal operation");
        }

        if (!double.IsFinite(value) || value > float.MaxValue || value < -float.MaxValue)
            return Invalidate(signal.Id, "计算结果超出有限数值范围 / The calculation exceeds the finite numeric range");
        var output = signal.Operation == ComputedSignalOperation.Delay
            ? delayed ?? ComputedSignalSample.Invalid("等待延迟时间内的首个有效样本 / Waiting for the first delayed sample")
            : ComputedSignalSample.Success((float)value, source, timestamp, frame, origin);
        state.Value = value;
        state.PreviousValue = x;
        state.PreviousGate = gate;
        state.LastMs = nowMs;
        state.Initialized = true;
        state.LastOutput = output;
        return output;
    }

    private static long Deadline(long nowMs, int durationMs) =>
        nowMs > long.MaxValue - durationMs ? long.MaxValue : nowMs + durationMs;

    private static string? DerivativeFrame(string? frame)
    {
        if (frame is null) return null;
        if (frame.EndsWith(":Velocity", StringComparison.Ordinal)) return frame[..^9] + ":Acceleration";
        if (frame.EndsWith(":Angle", StringComparison.Ordinal)) return frame[..^6] + ":AngularVelocity";
        if (frame.EndsWith(":ProximityRate", StringComparison.Ordinal)) return frame[..^14] + ":ProximityAcceleration";
        return frame + ":Velocity";
    }
}
