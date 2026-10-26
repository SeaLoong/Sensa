using System.Net.WebSockets;
using Sensa.Configuration;

namespace Sensa.Hosting;

public sealed record InputModeRequest(string Mode);

public sealed record InputActiveRequest(bool Active);

public sealed record OscSourceSelectionRequest(string? SourceKey);

public sealed record ManualInputRequest(
    bool Enabled,
    int L0,
    int R0,
    int R1,
    int R2,
    int L1,
    int L2,
    int V0,
    int V1,
    int V2,
    int A0,
    int A1,
    int A2,
    TCodeCommandMode? MotionMode,
    int? MotionValue);

public sealed record ScriptUploadRequest(
    string FileName,
    string Content,
    bool? Loop,
    double? Speed);

public sealed record ScriptPlaybackRequest(
    bool Restart,
    bool? Loop,
    double? Speed);

public sealed record ScriptConfigureRequest(
    bool? Loop,
    double? Speed)
{
    public bool UpdateLoopRange { get; init; }
    public long? LoopStartMs { get; init; }
    public long? LoopEndMs { get; init; }
}

public sealed record ScriptSeekRequest(long PositionMs);

internal sealed class WebSocketClientSession
{
    private readonly CancellationTokenSource _connectionCts;
    private readonly object _stateSync = new();
    private bool _pending;
    private bool _flushingState;
    private int _stopRequested;

    public WebSocketClientSession(WebSocket socket, CancellationToken requestAborted, CancellationToken shutdownToken)
    {
        Socket = socket;
        _connectionCts = CancellationTokenSource.CreateLinkedTokenSource(requestAborted, shutdownToken);
    }

    public WebSocket Socket { get; }
    public SemaphoreSlim Gate { get; } = new(1, 1);
    public CancellationToken ConnectionToken => _connectionCts.Token;
    public bool IsStopRequested => _connectionCts.IsCancellationRequested;

    public async Task SendAsync(byte[] payload)
    {
        await Gate.WaitAsync(ConnectionToken);
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ConnectionToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(3));
            await Socket.SendAsync(payload, WebSocketMessageType.Text, true, timeout.Token);
        }
        finally { Gate.Release(); }
    }

    public async Task DisposeAsync()
    {
        RequestStop();
        await Gate.WaitAsync();
        try { _connectionCts.Dispose(); }
        finally { Gate.Release(); }
    }

    public void MarkPending()
    {
        lock (_stateSync) { if (!IsStopRequested) _pending = true; }
    }

    public async Task FlushStateAsync(Func<byte[]> payload)
    {
        lock (_stateSync)
        {
            if (_flushingState || IsStopRequested) return;
            _flushingState = true;
        }
        try
        {
            while (true)
            {
                lock (_stateSync)
                {
                    // Finish under the same lock as MarkPending: a final update
                    // either belongs to this worker or can start the next one.
                    if (!_pending || IsStopRequested) { _flushingState = false; return; }
                    _pending = false;
                }
                if (Socket.State != WebSocketState.Open)
                    throw new WebSocketException(WebSocketError.InvalidState);
                // Release the shared send gate after every state frame, so
                // queued command replies precede another pending state.
                await SendAsync(payload()).ConfigureAwait(false);
            }
        }
        catch
        {
            RequestStop();
            lock (_stateSync) { _flushingState = false; _pending = false; }
            throw;
        }
    }

    public void RequestStop()
    {
        if (Interlocked.Exchange(ref _stopRequested, 1) != 0)
            return;

        try { _connectionCts.Cancel(); } catch { }
    }
}
