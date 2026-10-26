using System.Net.WebSockets;
using System.Text;
using System.Threading.Channels;
using Sensa.Hosting;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class WebSocketStateContracts
{
    [Fact]
    public async Task A_queued_command_reply_precedes_the_next_state_even_while_states_remain_pending()
    {
        using var socket = new ControlledSocket();
        await using var client = new WebSocketClientSession(socket, CancellationToken.None, CancellationToken.None);
        client.MarkPending();
        var flushing = client.FlushStateAsync(() => "state"u8.ToArray());
        var first = await socket.Next();
        var response = client.SendAsync("reply"u8.ToArray());
        client.MarkPending();
        first.Complete();

        var next = await socket.Next();
        Assert.Equal("reply", next.Payload);
        Assert.False(flushing.IsCompleted);
        next.Complete();
        await response.WaitAsync(TimeSpan.FromSeconds(2));
        var followingState = await socket.Next();
        Assert.Equal("state", followingState.Payload);
        followingState.Complete();
        await flushing.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.Equal(1, socket.MaximumConcurrentSends);
    }

    [Fact]
    public async Task Repeated_pending_updates_share_one_worker_and_coalesce_to_the_latest_snapshot()
    {
        using var socket = new ControlledSocket();
        await using var client = new WebSocketClientSession(socket, CancellationToken.None, CancellationToken.None);
        var revision = 0;
        var snapshots = 0;
        byte[] Snapshot() { Interlocked.Increment(ref snapshots); return Encoding.UTF8.GetBytes("state-" + Volatile.Read(ref revision)); }
        client.MarkPending();
        var flushing = client.FlushStateAsync(Snapshot);
        var first = await socket.Next();
        Assert.Equal("state-0", first.Payload);
        for (var update = 1; update <= 100; update++)
        {
            Volatile.Write(ref revision, update);
            client.MarkPending();
            Assert.True(client.FlushStateAsync(Snapshot).IsCompletedSuccessfully);
        }
        first.Complete();
        var latest = await socket.Next();
        Assert.Equal("state-100", latest.Payload);
        latest.Complete();
        await flushing.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.Equal(2, snapshots);
        Assert.Equal(2, socket.Sends);
        Assert.Equal(1, socket.MaximumConcurrentSends);
    }

    [Fact]
    public async Task An_update_after_the_worker_becomes_idle_starts_a_new_flush()
    {
        using var socket = new ControlledSocket();
        await using var client = new WebSocketClientSession(socket, CancellationToken.None, CancellationToken.None);
        foreach (var revision in new[] { "first", "last" })
        {
            client.MarkPending();
            var flushing = client.FlushStateAsync(() => Encoding.UTF8.GetBytes(revision));
            var sent = await socket.Next();
            Assert.Equal(revision, sent.Payload);
            sent.Complete();
            await flushing.WaitAsync(TimeSpan.FromSeconds(2));
        }
        Assert.Equal(2, socket.Sends);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Stopping_cancels_a_state_send_or_its_wait_for_the_shared_gate(bool holdGate)
    {
        using var socket = new ControlledSocket();
        await using var client = new WebSocketClientSession(socket, CancellationToken.None, CancellationToken.None);
        if (holdGate) await client.Gate.WaitAsync();
        try
        {
            client.MarkPending();
            var flushing = client.FlushStateAsync(() => "state"u8.ToArray());
            if (!holdGate) await socket.Next();
            client.RequestStop();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => flushing.WaitAsync(TimeSpan.FromSeconds(2)));
            Assert.True(client.IsStopRequested);
            client.MarkPending();
            await client.FlushStateAsync(() => throw new Exception("Stopped clients must not read another snapshot"));
            Assert.Equal(holdGate ? 0 : 1, socket.Sends);
        }
        finally { if (holdGate) client.Gate.Release(); }
    }

    [Fact]
    public async Task A_failed_state_send_stops_the_session_and_does_not_start_more_workers()
    {
        using var socket = new ControlledSocket { SendFailure = new IOException("fixture send failure") };
        await using var client = new WebSocketClientSession(socket, CancellationToken.None, CancellationToken.None);
        client.MarkPending();
        await Assert.ThrowsAsync<IOException>(() => client.FlushStateAsync(() => "state"u8.ToArray()));
        Assert.True(client.IsStopRequested);
        Assert.Equal(1, client.Gate.CurrentCount);
        client.MarkPending();
        await client.FlushStateAsync(() => "later"u8.ToArray());
        Assert.Equal(1, socket.Sends);
    }

    [Fact]
    public async Task A_closed_socket_stops_before_a_state_send()
    {
        using var socket = new ControlledSocket { SocketState = WebSocketState.Closed };
        await using var client = new WebSocketClientSession(socket, CancellationToken.None, CancellationToken.None);
        client.MarkPending();
        await Assert.ThrowsAsync<WebSocketException>(() => client.FlushStateAsync(() => "state"u8.ToArray()));
        Assert.True(client.IsStopRequested);
        Assert.Equal(0, socket.Sends);
    }

    [Fact]
    public async Task A_state_frame_keeps_the_existing_send_timeout()
    {
        using var socket = new ControlledSocket();
        await using var client = new WebSocketClientSession(socket, CancellationToken.None, CancellationToken.None);
        client.MarkPending();
        var flushing = client.FlushStateAsync(() => "state"u8.ToArray());
        await socket.Next();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => flushing.WaitAsync(TimeSpan.FromSeconds(5)));
        Assert.True(client.IsStopRequested);
        Assert.Equal(1, client.Gate.CurrentCount);
    }

    private sealed record PendingSend(string Payload, TaskCompletionSource Permit)
    {
        public void Complete() => Permit.TrySetResult();
    }

    private sealed class ControlledSocket : WebSocket
    {
        private readonly Channel<PendingSend> _started = Channel.CreateUnbounded<PendingSend>();
        private int _active;
        public int Sends { get; private set; }
        public int MaximumConcurrentSends { get; private set; }
        public Exception? SendFailure { get; init; }
        public WebSocketState SocketState { get; init; } = WebSocketState.Open;
        public Task<PendingSend> Next() => _started.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(2));
        public override WebSocketCloseStatus? CloseStatus => null;
        public override string? CloseStatusDescription => null;
        public override WebSocketState State => SocketState;
        public override string? SubProtocol => null;
        public override void Abort() { }
        public override void Dispose() { }
        public override Task CloseAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) => Task.CompletedTask;
        public override Task CloseOutputAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) => Task.CompletedTask;
        public override Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer, CancellationToken cancellationToken) => throw new NotSupportedException("No process or network in this fixture");
        public override Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken) => SendCore(buffer.AsMemory(), cancellationToken);
        public override ValueTask SendAsync(ReadOnlyMemory<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken = default) => new(SendCore(buffer, cancellationToken));
        private async Task SendCore(ReadOnlyMemory<byte> buffer, CancellationToken token)
        {
            var active = Interlocked.Increment(ref _active);
            MaximumConcurrentSends = Math.Max(MaximumConcurrentSends, active);
            Sends++;
            try
            {
                Assert.Equal(1, active);
                if (SendFailure is { } failure) throw failure;
                var permit = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                await _started.Writer.WriteAsync(new(Encoding.UTF8.GetString(buffer.Span), permit), token);
                await permit.Task.WaitAsync(token);
            }
            finally { Interlocked.Decrement(ref _active); }
        }
    }
}
