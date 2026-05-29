namespace Sensa.Input.Osc;

public sealed class OscQueryPollingService : IAsyncDisposable, IDisposable
{
    private readonly object _sync = new();
    private readonly Action<string>? _logDebug;
    private readonly Action<string>? _logError;
    private CancellationTokenSource? _cts;
    private Task? _task;
    private string _signature = string.Empty;
    private Func<CancellationToken, Task<int>>? _pollAsync;
    private OscQueryPollingServiceSnapshot _snapshot = OscQueryPollingServiceSnapshot.Disabled();
    private int _disposed;

    public OscQueryPollingService(Action<string>? logDebug = null, Action<string>? logError = null)
    {
        _logDebug = logDebug;
        _logError = logError;
    }

    public event Action? StateChanged;

    public OscQueryPollingServiceSnapshot Snapshot
    {
        get
        {
            lock (_sync)
                return _snapshot;
        }
    }

    public void Configure(bool enabled, int rateHz, Func<CancellationToken, Task<int>>? pollAsync)
    {
        ThrowIfDisposed();

        var normalizedRate = Math.Clamp(rateHz, 1, 30);
        var signature = enabled
            ? $"run|{normalizedRate}"
            : "stop";

        lock (_sync)
        {
            if (_signature == signature && enabled == (_cts is not null) && (enabled ? pollAsync is not null : true))
                return;
        }

        ReconfigureAsync(enabled, normalizedRate, pollAsync, signature).GetAwaiter().GetResult();
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0)
            return;

        await StopCoreAsync().ConfigureAwait(false);
    }

    public void Dispose()
    {
        DisposeAsync().AsTask().GetAwaiter().GetResult();
    }

    private async Task ReconfigureAsync(bool enabled, int rateHz, Func<CancellationToken, Task<int>>? pollAsync, string signature)
    {
        await StopCoreAsync().ConfigureAwait(false);

        if (!enabled || pollAsync is null)
        {
            UpdateSnapshot(new OscQueryPollingServiceSnapshot
            {
                Enabled = enabled,
                Running = false,
                RateHz = rateHz,
            }, signature);
            return;
        }

        var cts = new CancellationTokenSource();
        lock (_sync)
        {
            _cts = cts;
            _pollAsync = pollAsync;
            _task = Task.Run(() => PollLoopAsync(cts.Token), CancellationToken.None);
        }

        UpdateSnapshot(new OscQueryPollingServiceSnapshot
        {
            Enabled = true,
            Running = true,
            RateHz = rateHz,
            StartedAtUtc = DateTimeOffset.UtcNow,
        }, signature);
        _logDebug?.Invoke($"[OSCQuery/Poll] Fallback polling enabled at {rateHz}Hz.");
    }

    private async Task PollLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var rateHz = Snapshot.RateHz <= 0 ? 5 : Snapshot.RateHz;
            try
            {
                var appliedCount = 0;
                Func<CancellationToken, Task<int>>? callback;
                lock (_sync)
                    callback = _pollAsync;

                if (callback is not null)
                    appliedCount = await callback(cancellationToken).ConfigureAwait(false);

                UpdateRunState(lastAppliedCount: appliedCount, error: string.Empty);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logError?.Invoke($"[OSCQuery/Poll] {ex.Message}");
                UpdateRunState(lastAppliedCount: 0, error: ex.Message);
            }

            try
            {
                await Task.Delay(TimeSpan.FromMilliseconds(1000d / Math.Max(1, rateHz)), cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task StopCoreAsync()
    {
        CancellationTokenSource? cts;
        Task? task;
        var hadTask = false;

        lock (_sync)
        {
            cts = _cts;
            task = _task;
            hadTask = _cts is not null || _task is not null;
            _cts = null;
            _task = null;
            _pollAsync = null;
            _signature = string.Empty;
        }

        if (cts is not null)
        {
            try { cts.Cancel(); } catch { }
        }

        if (task is not null)
        {
            try { await task.ConfigureAwait(false); } catch { }
        }

        cts?.Dispose();

        if (hadTask)
        {
            UpdateSnapshot(new OscQueryPollingServiceSnapshot
            {
                Enabled = false,
                Running = false,
                RateHz = Snapshot.RateHz,
            }, string.Empty);
        }
    }

    private void UpdateRunState(int lastAppliedCount, string error)
    {
        lock (_sync)
        {
            _snapshot = _snapshot with
            {
                LastPolledAtUtc = DateTimeOffset.UtcNow,
                LastAppliedValueCount = lastAppliedCount,
                LastError = error ?? string.Empty,
            };
        }

        SafeInvoke(StateChanged);
    }

    private void UpdateSnapshot(OscQueryPollingServiceSnapshot snapshot, string signature)
    {
        lock (_sync)
        {
            _snapshot = snapshot;
            _signature = signature;
        }

        SafeInvoke(StateChanged);
    }

    private void ThrowIfDisposed()
    {
        if (Interlocked.CompareExchange(ref _disposed, 0, 0) != 0)
            throw new ObjectDisposedException(nameof(OscQueryPollingService));
    }

    private static void SafeInvoke(Action? callback)
    {
        try { callback?.Invoke(); } catch { }
    }
}

public sealed record OscQueryPollingServiceSnapshot
{
    public bool Enabled { get; init; }
    public bool Running { get; init; }
    public int RateHz { get; init; }
    public DateTimeOffset? StartedAtUtc { get; init; }
    public DateTimeOffset? LastPolledAtUtc { get; init; }
    public int LastAppliedValueCount { get; init; }
    public string LastError { get; init; } = string.Empty;

    public static OscQueryPollingServiceSnapshot Disabled() => new()
    {
        Enabled = false,
        Running = false,
        RateHz = 5,
    };
}
