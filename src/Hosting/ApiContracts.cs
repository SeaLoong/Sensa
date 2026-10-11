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
    private int _pending;
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

    public void MarkPending() => Interlocked.Exchange(ref _pending, 1);

    public bool ConsumePending() => Interlocked.Exchange(ref _pending, 0) == 1;

    public void RequestStop()
    {
        if (Interlocked.Exchange(ref _stopRequested, 1) != 0)
            return;

        try { _connectionCts.Cancel(); } catch { }
    }
}
