namespace Sensa.Tests.Support;

/// <summary>Virtual time for contracts; no wall-clock sleeps or private watchdog calls.</summary>
internal sealed class ManualTimeProvider : TimeProvider
{
    private readonly object _gate = new();
    private readonly List<ManualTimer> _timers = [];
    private long _ticks;
    private static readonly DateTimeOffset Epoch = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
    public override long TimestampFrequency => TimeSpan.TicksPerSecond;
    public override long GetTimestamp() { lock (_gate) return _ticks; }
    public override DateTimeOffset GetUtcNow() { lock (_gate) return Epoch.AddTicks(_ticks); }

    public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
    {
        var timer = new ManualTimer(this, callback, state);
        timer.Change(dueTime, period);
        return timer;
    }

    public void Advance(TimeSpan duration)
    {
        if (duration < TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(duration));
        long end;
        lock (_gate) end = checked(_ticks + duration.Ticks);
        for (var callbacks = 0; ; callbacks++)
        {
            ManualTimer? next;
            lock (_gate)
            {
                next = _timers.Where(t => !t.Disposed && t.Due <= end).OrderBy(t => t.Due).FirstOrDefault();
                if (next is null) { _ticks = end; return; }
                if (callbacks > 100000) throw new InvalidOperationException("Timer did not advance virtual time.");
                _ticks = next.Due;
                next.Due = next.Period > 0 ? checked(_ticks + next.Period) : long.MaxValue;
            }
            next.Callback(next.State);
        }
    }

    private sealed class ManualTimer(ManualTimeProvider clock, TimerCallback callback, object? state) : ITimer
    {
        public TimerCallback Callback { get; } = callback;
        public object? State { get; } = state;
        public long Due { get; set; } = long.MaxValue;
        public long Period { get; private set; }
        public bool Disposed { get; private set; }

        public bool Change(TimeSpan dueTime, TimeSpan period)
        {
            lock (clock._gate)
            {
                if (Disposed) return false;
                if (dueTime < Timeout.InfiniteTimeSpan || period < Timeout.InfiniteTimeSpan)
                    throw new ArgumentOutOfRangeException(nameof(dueTime));
                Due = dueTime == Timeout.InfiniteTimeSpan ? long.MaxValue : checked(clock._ticks + dueTime.Ticks);
                Period = period.Ticks;
                if (!clock._timers.Contains(this)) clock._timers.Add(this);
                return true;
            }
        }

        public void Dispose() { lock (clock._gate) { Disposed = true; clock._timers.Remove(this); } }
        public ValueTask DisposeAsync() { Dispose(); return ValueTask.CompletedTask; }
    }
}
