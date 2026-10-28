using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Buttplug.Client;
using Buttplug.Core.Messages;

namespace Sensa.Outputs.Intiface;

/// <summary>
/// Bounded WebSocket framing around the upstream Buttplug JSON protocol/sorter.
/// A logical JSON message can span receive buffers and continuation frames.
/// </summary>
internal sealed class IntifaceWebSocketConnector : ButtplugRemoteJSONConnector, IButtplugClientConnector, IAsyncDisposable
{
    internal const int MaximumMessageBytes = 1024 * 1024;
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);
    private readonly Uri _address;
    private readonly ClientWebSocket _socket = new();
    private readonly CancellationTokenSource _lifetime = new();
    private readonly CancellationToken _lifetimeToken;
    private readonly SemaphoreSlim _writeGate = new(1, 1);
    private readonly object _stateSync = new();
    private Task? _reader;
    private int _terminated;
    private int _disconnectStarted;
    private int _connectStarted;

    public bool Connected => Volatile.Read(ref _terminated) == 0 && Volatile.Read(ref _disconnectStarted) == 0
        && _socket.State == WebSocketState.Open;
    public event EventHandler? Disconnected;
    internal Task Completion => _reader ?? Task.CompletedTask;

    public IntifaceWebSocketConnector(Uri address)
    {
        _address = address;
        _lifetimeToken = _lifetime.Token;
    }

    public async Task ConnectAsync(CancellationToken token = default)
    {
        if (Interlocked.Exchange(ref _connectStarted, 1) != 0)
            throw new InvalidOperationException("The Intiface connector cannot be reused.");
        using var pending = CancellationTokenSource.CreateLinkedTokenSource(token, _lifetimeToken);
        try
        {
            await _socket.ConnectAsync(_address, pending.Token).ConfigureAwait(false);
            _reader = Task.Run(ReadAsync);
            // Cleanup runs in ReadAsync's finally; observe unexpected callback faults
            // without joining a reader that may be resuming this caller inline.
            _ = _reader.ContinueWith(task => { _ = task.Exception; }, CancellationToken.None,
                TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
        }
        catch { Terminate(); throw; }
    }

    public async Task<ButtplugMessage> SendAsync(ButtplugMessage message, CancellationToken token = default)
    {
        using var pending = CancellationTokenSource.CreateLinkedTokenSource(token, _lifetimeToken);
        try
        {
            ReturnMessage prepared;
            await _writeGate.WaitAsync(pending.Token).ConfigureAwait(false);
            try
            {
                lock (_stateSync)
                {
                    if (!Connected) throw new InvalidOperationException("The Intiface transport is disconnected.");
                    // Preparation and termination cannot race a promise into an already
                    // drained upstream sorter. Its token also includes this connection.
                    prepared = PrepareMessage(message, pending.Token);
                }
                var bytes = StrictUtf8.GetBytes(prepared.Message);
                if (bytes.Length > MaximumMessageBytes) throw new InvalidDataException("The Intiface message exceeds the size limit.");
                try { await _socket.SendAsync(bytes, WebSocketMessageType.Text, true, pending.Token).ConfigureAwait(false); }
                catch { Terminate(); throw; }
            }
            finally { _writeGate.Release(); }
            return await prepared.Promise.WaitAsync(pending.Token).ConfigureAwait(false);
        }
        finally { pending.Cancel(); }
    }

    private async Task ReadAsync()
    {
        var buffer = new byte[4096];
        try
        {
            while (!_lifetimeToken.IsCancellationRequested)
            {
                using var message = new MemoryStream();
                ValueWebSocketReceiveResult part;
                do
                {
                    part = await _socket.ReceiveAsync(buffer.AsMemory(), _lifetimeToken).ConfigureAwait(false);
                    if (part.MessageType == WebSocketMessageType.Close) return;
                    if (part.MessageType != WebSocketMessageType.Text)
                        throw new InvalidDataException("Intiface messages must be WebSocket text.");
                    if (message.Length + part.Count > MaximumMessageBytes)
                        throw new InvalidDataException("The Intiface message exceeds the size limit.");
                    message.Write(buffer, 0, part.Count);
                } while (!part.EndOfMessage);
                var json = StrictUtf8.GetString(message.GetBuffer(), 0, checked((int)message.Length));
                using (var document = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 64 }))
                    if (document.RootElement.ValueKind != JsonValueKind.Array)
                        throw new InvalidDataException("Intiface messages must contain a JSON array.");
                // Keep the upstream protocol parser and request correlation. A late
                // valid reply to a cancelled request is not a fatal framing error.
                ReceiveMessages(json);
            }
        }
        catch (Exception error) when (error is OperationCanceledException or WebSocketException or IOException or InvalidDataException
            or ObjectDisposedException or DecoderFallbackException or JsonException or Buttplug.Core.ButtplugException or Newtonsoft.Json.JsonException) { }
        finally { Terminate(); }
    }

    public async Task DisconnectAsync(CancellationToken token = default)
    {
        if (Interlocked.Exchange(ref _disconnectStarted, 1) != 0) { Terminate(); return; }
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromMilliseconds(250));
        try
        {
            await _writeGate.WaitAsync(deadline.Token).ConfigureAwait(false);
            try
            {
                if (_socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
                    await _socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", deadline.Token).ConfigureAwait(false);
            }
            finally { _writeGate.Release(); }
        }
        catch (Exception error) when (error is OperationCanceledException or WebSocketException or ObjectDisposedException) { }
        finally { Terminate(); }
        // The upstream sorter can resume callers inline on our receive thread.
        // Joining that same reader from such a caller would deadlock cleanup.
    }

    private void Terminate()
    {
        lock (_stateSync)
        {
            if (_terminated != 0) return;
            Volatile.Write(ref _terminated, 1);
        }
        _lifetime.Cancel();
        _socket.Abort();
        _socket.Dispose();
        base.Dispose(true);
        _lifetime.Dispose();
        Disconnected?.Invoke(this, EventArgs.Empty);
    }

    protected override void Dispose(bool disposing) => Terminate();
    public async ValueTask DisposeAsync() { await DisconnectAsync().ConfigureAwait(false); }
}
