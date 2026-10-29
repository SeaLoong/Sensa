using System.Net.WebSockets;
using System.Text;

namespace Sensa.Input.Protocols;

/// <summary>Plain-text TCode over a routed WebSocket endpoint.</summary>
public sealed class TCodeWebSocketInput(ProtocolInputConfig config, IExternalControlSink sink)
{
    private sealed class Connection(TCodeInputSession session)
    {
        public readonly object Sync = new();
        public readonly TCodeInputSession Session = session;
        public readonly TCodeLineFramer Framer = new();
        public long? MessageEpoch;
        public long? LineEpoch;
        public int MessageBytes;
    }
    private readonly object _sync = new();
    private readonly HashSet<Connection> _connections = [];

    public void ResetCommands()
    {
        Connection[] connections;
        lock (_sync) connections = _connections.ToArray();
        foreach (var connection in connections)
            lock (connection.Sync)
            {
                connection.Framer.Reset(); connection.LineEpoch = null;
                connection.Session.ResetCommands();
            }
    }

    public async Task RunAsync(WebSocket socket, CancellationToken cancellation)
    {
        using var session = new TCodeInputSession(config, sink, "tcode-ws:" + Guid.NewGuid().ToString("N"));
        if (!session.TryAcquire(out _))
        {
            await socket.CloseOutputAsync(WebSocketCloseStatus.PolicyViolation, "Input already controlled", cancellation);
            return;
        }
        var connection = new Connection(session);
        lock (_sync) _connections.Add(connection);
        try
        {
            var bytes = new byte[2048];
            while (!cancellation.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                var pending = socket.ReceiveAsync(bytes.AsMemory(), cancellation).AsTask();
                _ = pending.ContinueWith(completed => { _ = completed.Exception; }, CancellationToken.None,
                    TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
                ValueWebSocketReceiveResult received;
                while (true)
                {
                    var remaining = session.RemainingIdleTime;
                    if (remaining <= TimeSpan.Zero) throw new TimeoutException("TCode connection expired.");
                    var budget = remaining < TimeSpan.FromMilliseconds(250) ? remaining : TimeSpan.FromMilliseconds(250);
                    try { received = await pending.WaitAsync(budget, cancellation); break; }
                    catch (TimeoutException) when (!pending.IsCompleted) { }
                }
                if (received.MessageType == WebSocketMessageType.Close) return;
                if (received.MessageType != WebSocketMessageType.Text)
                    throw new InvalidDataException("TCode WebSocket requires text frames.");
                var replies = new List<string>();
                lock (connection.Sync)
                {
                    connection.MessageEpoch ??= session.Epoch;
                    connection.LineEpoch ??= connection.MessageEpoch;
                    connection.MessageBytes += received.Count;
                    if (connection.MessageBytes > TCodeProtocol.MaximumLineBytes)
                        throw new InvalidDataException("TCode WebSocket message exceeds the input limit.");
                    foreach (var line in connection.Framer.Push(bytes.AsSpan(0, received.Count)))
                    {
                        if (!session.TryProcessLine(line, out var response, out var error, connection.LineEpoch))
                            throw new InvalidDataException(error);
                        if (response.Length != 0) replies.Add(response);
                    }
                    if (connection.Framer.PendingBytes == 0) connection.LineEpoch = null;
                    if (received.EndOfMessage) { connection.MessageEpoch = null; connection.MessageBytes = 0; }
                }
                foreach (var response in replies)
                {
                    using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
                    deadline.CancelAfter(TimeSpan.FromSeconds(1));
                    await socket.SendAsync(Encoding.ASCII.GetBytes(response), WebSocketMessageType.Text, true, deadline.Token);
                }
            }
        }
        catch (Exception error) when (error is OperationCanceledException or WebSocketException or ObjectDisposedException or IOException or TimeoutException or FormatException)
        {
            // A failed or expired source releases only its own lease and targets.
        }
        finally
        {
            lock (_sync) _connections.Remove(connection);
            session.Dispose(); socket.Abort();
        }
    }
}
