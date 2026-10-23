using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Sensa.Outputs.Dglab;

/// <summary>
/// DG-LAB 4 APP V4 controller. Connect and reconnect are explicit; pending commands are never replayed.
/// Short operation leases expire at the APP. Stop clears the selected channel and requests zero while connected.
/// </summary>
public sealed class DglabV4Client : IAsyncDisposable
{
    public const int MaximumPendingRequests = 32;
    private const int StoppingRequestReserve = 4;
    private readonly object _sync = new();
    private readonly SemaphoreSlim _lifecycle = new(1, 1), _sendGate = new(1, 1);
    private readonly Func<IDglabSocket> _socketFactory;
    private readonly TimeProvider _clock;
    private readonly DglabDeviceStore _devices = new();
    private readonly Dictionary<(string Client, string Id), TaskCompletionSource<JsonElement>> _pending = new();
    private readonly HashSet<DglabTarget> _controlled = [];
    private IDglabSocket? _socket;
    private CancellationTokenSource? _lifetime;
    private Task? _receiver, _heartbeat;
    private TaskCompletionSource<string>? _hello;
    private DglabConnectionOptions _options = new();
    private string? _targetId, _lastError, _commandError;
    private string _state = "Disconnected";
    private long _generation, _sequence;
    private int _missedPongs;
    private bool _disposed;

    public DglabV4Client(Func<IDglabSocket>? socketFactory = null, TimeProvider? clock = null)
    { _socketFactory = socketFactory ?? (() => new DglabWebSocket()); _clock = clock ?? TimeProvider.System; }

    public event Action? Changed;

    public DglabConnectionSnapshot Snapshot
    {
        get
        {
            lock (_sync)
            {
                var connected = _socket?.IsOpen == true && _targetId is not null;
                return new(connected, _commandError is null ? _state : "CommandError", _targetId,
                    _targetId is null ? null : DglabV4Protocol.BuildPairingUrl(_options.ServerUrl, _targetId),
                    _targetId is null ? null : DglabV4Protocol.BuildAppPairingUrl(_options.ServerUrl, _targetId),
                    _devices.Snapshot(), _lastError, _generation);
            }
        }
    }

    public async Task<DglabConnectionSnapshot> ConnectAsync(DglabConnectionOptions options, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(options);
        var address = DglabV4Protocol.ValidateServerUrl(options.ServerUrl);
        if (options.ConnectTimeoutMs is < 100 or > 30000 || options.ResponseTimeoutMs is < 100 or > 30000)
            throw new ArgumentException("DG-LAB timeouts must be between 100 and 30000 ms.");
        await _lifecycle.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            await DisconnectCoreAsync().ConfigureAwait(false);
            var socket = _socketFactory();
            var lifetime = new CancellationTokenSource();
            long generation;
            Task<string> hello;
            lock (_sync)
            {
                _options = new() { ServerUrl = address.AbsoluteUri, ConnectTimeoutMs = options.ConnectTimeoutMs,
                    ResponseTimeoutMs = options.ResponseTimeoutMs };
                generation = ++_generation;
                _socket = socket; _lifetime = lifetime; _state = "Connecting"; _lastError = null; _commandError = null;
                _hello = new(TaskCreationOptions.RunContinuationsAsynchronously);
                hello = _hello.Task;
            }
            Notify();
            using var timeout = new CancellationTokenSource(TimeSpan.FromMilliseconds(options.ConnectTimeoutMs), _clock);
            using var attempt = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token, lifetime.Token);
            try
            {
                await socket.ConnectAsync(address, attempt.Token).ConfigureAwait(false);
                lock (_sync) if (_generation == generation) _state = "WaitingForServer";
                _receiver = ReceiveLoopAsync(socket, generation, lifetime.Token);
                await hello.WaitAsync(TimeSpan.FromMilliseconds(options.ConnectTimeoutMs), _clock, attempt.Token).ConfigureAwait(false);
                lock (_sync)
                    if (_generation != generation || !socket.IsOpen || _targetId is null)
                        throw new IOException("DG-LAB disconnected during pairing setup.");
                _heartbeat = HeartbeatLoopAsync(socket, generation, lifetime.Token);
                Notify();
                return Snapshot;
            }
            catch (Exception error)
            {
                FailConnection(generation, error.Message);
                await socket.DisposeAsync().ConfigureAwait(false);
                throw;
            }
        }
        finally { _lifecycle.Release(); }
    }

    public Task<JsonElement> RequestDevicesAsync(string clientId, CancellationToken cancellationToken = default) =>
        RequestAsync(clientId, "devices.get", null, cancellationToken);

    public Task<JsonElement> SetTemporaryIntensityAsync(DglabTarget target, double value, int durationMs,
        CancellationToken cancellationToken = default)
    {
        // Validate before limiting so NaN and negative commands never turn into plausible zero values.
        _ = DglabV4Protocol.TemporaryIntensity(target, value, durationMs);
        lock (_sync) value = _devices.LimitIntensity(target, value);
        return OperateAsync(target, DglabV4Protocol.TemporaryIntensity(target, value, durationMs), cancellationToken);
    }

    public Task<JsonElement> SendPulseAsync(DglabTarget target, IReadOnlyList<string> frames, int durationMs,
        CancellationToken cancellationToken = default, int version = 3) =>
        OperateAsync(target, DglabV4Protocol.Pulse(target, frames, durationMs, version), cancellationToken);

    /// <summary>Returns after socket write; the real APP task completion remains observed and bounded.</summary>
    public async Task DispatchTemporaryIntensityAsync(DglabTarget target, double value, int durationMs,
        CancellationToken cancellationToken = default)
    {
        _ = DglabV4Protocol.TemporaryIntensity(target, value, durationMs);
        RegisterControl(target);
        lock (_sync) value = _devices.LimitIntensity(target, value);
        var dispatch = await BeginRequestAsync(target.ClientId, "device.op",
            DglabV4Protocol.TemporaryIntensity(target, value, durationMs), cancellationToken).ConfigureAwait(false);
        _ = ObserveDispatchedAsync(dispatch, cancellationToken);
    }

    /// <summary>Starts one finite pulse task; repeated calls replace it rather than implicitly looping it.</summary>
    public async Task DispatchPulseAsync(DglabTarget target, IReadOnlyList<string> frames, int durationMs,
        CancellationToken cancellationToken = default, int version = 3)
    {
        var operation = DglabV4Protocol.Pulse(target, frames, durationMs, version);
        RegisterControl(target);
        var dispatch = await BeginRequestAsync(target.ClientId, "device.op", operation, cancellationToken).ConfigureAwait(false);
        _ = ObserveDispatchedAsync(dispatch, cancellationToken);
    }

    public Task<JsonElement> ResetIntensityAsync(DglabTarget target, CancellationToken cancellationToken = default) =>
        OperateAsync(target, DglabV4Protocol.Reset(target), cancellationToken, requireDevice: false);

    public Task<JsonElement> ClearAsync(DglabTarget target, CancellationToken cancellationToken = default)
    {
        DglabV4Protocol.ValidateTarget(target);
        return RequestAsync(target.ClientId, "device.op.clear", DglabV4Protocol.Clear(target), cancellationToken);
    }

    public async Task StopAsync(DglabTarget target, CancellationToken cancellationToken = default)
    {
        // Both are sent even when one RPC fails; a clear may complete earlier pending operations as "cleared".
        await Task.WhenAll(ClearAsync(target, cancellationToken), ResetIntensityAsync(target, cancellationToken)).ConfigureAwait(false);
        lock (_sync) _controlled.Remove(target);
    }

    public bool TryReadFeedback(DglabTarget target, string path, out double value)
    {
        lock (_sync)
        {
            value = 0;
            return _socket?.IsOpen == true && _targetId is not null && _devices.TryRead(target, path, out value);
        }
    }

    public async Task DisconnectAsync(CancellationToken cancellationToken = default)
    {
        await _lifecycle.WaitAsync(cancellationToken).ConfigureAwait(false);
        try { await DisconnectCoreAsync().ConfigureAwait(false); }
        finally { _lifecycle.Release(); }
    }

    public async ValueTask DisposeAsync()
    {
        await _lifecycle.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_disposed) return;
            await DisconnectCoreAsync().ConfigureAwait(false);
            _disposed = true;
        }
        finally { _lifecycle.Release(); }
    }

    private Task<JsonElement> OperateAsync(DglabTarget target, JsonObject operation, CancellationToken cancellationToken,
        bool requireDevice = true)
    {
        RegisterControl(target, requireDevice);
        return RequestAsync(target.ClientId, "device.op", operation, cancellationToken);
    }

    private void RegisterControl(DglabTarget target, bool requireDevice = true)
    {
        lock (_sync)
        {
            if (requireDevice && _commandError is not null)
                throw new InvalidOperationException("DG-LAB command failed; reconnect explicitly before continuing. " + _commandError);
            if (requireDevice && !_devices.CanOperate(target))
                throw new InvalidOperationException("请选择已连接的 DG-LAB APP 设备与通道 / Select an attached DG-LAB APP device and channel.");
            if (_controlled.Count >= 128 && !_controlled.Contains(target))
                throw new InvalidOperationException("DG-LAB controlled-channel limit exceeded.");
            _controlled.Add(target);
        }
    }

    private async Task<JsonElement> RequestAsync(string clientId, string method, JsonNode? data, CancellationToken cancellationToken)
    {
        var dispatch = await BeginRequestAsync(clientId, method, data, cancellationToken).ConfigureAwait(false);
        return await dispatch.Completion.ConfigureAwait(false);
    }

    private async Task<PendingDispatch> BeginRequestAsync(string clientId, string method, JsonNode? data,
        CancellationToken cancellationToken)
    {
        DglabV4Protocol.ValidateIdentifier(clientId, nameof(clientId));
        TaskCompletionSource<JsonElement> completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
        IDglabSocket socket;
        CancellationToken lifetime;
        long generation;
        string id;
        int timeout;
        lock (_sync)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (_socket?.IsOpen != true || _targetId is null || !_devices.ContainsClient(clientId))
                throw new InvalidOperationException("DG-LAB APP connection is not ready.");
            // Each channel needs clear and zero. Reserve both A/B pairs even while cancelled
            // ordinary requests are still waiting for their asynchronous cleanup to run.
            var stopping = method == "device.op.clear" || method == "device.op" && data is JsonObject operation
                && operation["t"] is JsonValue action && action.TryGetValue<int>(out var type) && type == 7;
            if (_pending.Count >= MaximumPendingRequests + (stopping ? StoppingRequestReserve : 0))
                throw new InvalidOperationException("DG-LAB request queue is full.");
            socket = _socket; generation = _generation; lifetime = _lifetime!.Token;
            id = generation + "-" + Interlocked.Increment(ref _sequence);
            timeout = _options.ResponseTimeoutMs;
            if (method == "device.op" && data is JsonObject task && task["d"] is JsonValue length
                && length.TryGetValue<int>(out var duration) && duration > timeout)
                timeout = duration + 1000;
            _pending.Add((clientId, id), completion);
        }
        var deadline = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeout), _clock);
        var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, lifetime, deadline.Token);
        try
        {
            await SendAsync(socket, generation, DglabV4Protocol.Request(clientId, id, method, data), linked.Token).ConfigureAwait(false);
        }
        catch
        {
            lock (_sync) _pending.Remove((clientId, id));
            completion.TrySetCanceled();
            if (completion.Task.IsFaulted) _ = completion.Task.Exception;
            linked.Dispose(); deadline.Dispose();
            throw;
        }
        return new PendingDispatch(AwaitReplyAsync(completion.Task, clientId, id, timeout, cancellationToken,
            lifetime, deadline, linked), generation);
    }

    private async Task<JsonElement> AwaitReplyAsync(Task<JsonElement> completion, string clientId, string id,
        int timeout, CancellationToken cancellationToken, CancellationToken lifetime,
        CancellationTokenSource deadline, CancellationTokenSource linked)
    {
        using (deadline)
        using (linked)
        {
            try
            {
                return await completion.WaitAsync(TimeSpan.FromMilliseconds(timeout), _clock, linked.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (lifetime.IsCancellationRequested && !cancellationToken.IsCancellationRequested)
            {
                throw new IOException("DG-LAB disconnected before acknowledging the command.");
            }
            finally { lock (_sync) _pending.Remove((clientId, id)); }
        }
    }

    private async Task ObserveDispatchedAsync(PendingDispatch dispatch, CancellationToken cancellationToken)
    {
        try { await dispatch.Completion.ConfigureAwait(false); }
        catch (Exception error)
        {
            lock (_sync)
            {
                // Old generations and explicitly cancelled routes cannot change the new session's error state.
                if (_generation != dispatch.Generation || cancellationToken.IsCancellationRequested) return;
                _commandError = error is OperationCanceledException ? "DG-LAB APP response timeout." : error.Message;
                _lastError = _commandError;
            }
            Notify();
        }
    }

    private sealed record PendingDispatch(Task<JsonElement> Completion, long Generation);

    private async Task SendAsync(IDglabSocket socket, long generation, string frame, CancellationToken cancellationToken)
    {
        await _sendGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            lock (_sync)
                if (_generation != generation || _socket != socket || !socket.IsOpen)
                    throw new IOException("DG-LAB connection changed before sending.");
            await socket.SendTextAsync(frame, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception error)
        {
            // A cancelled or partial socket send cannot be replayed or reused as a known-good command.
            FailConnection(generation, error.Message);
            throw;
        }
        finally { _sendGate.Release(); }
    }

    private async Task ReceiveLoopAsync(IDglabSocket socket, long generation, CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                var text = await socket.ReceiveTextAsync(cancellationToken).ConfigureAwait(false);
                if (text is null) throw new IOException("DG-LAB relay closed the connection.");
                if (Encoding.UTF8.GetByteCount(text) > DglabWebSocket.MaximumMessageBytes)
                    throw new InvalidDataException("DG-LAB message exceeds 1 MiB.");
                JsonObject? frame;
                try { frame = JsonNode.Parse(text, documentOptions: new JsonDocumentOptions { MaxDepth = 32 }) as JsonObject; }
                catch (JsonException) { continue; }
                if (frame is null) continue;
                lock (_sync)
                {
                    if (_generation != generation || _socket != socket) return;
                    HandleFrame(frame);
                }
                Notify();
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (Exception error) { FailConnection(generation, error.Message); }
    }

    private void HandleFrame(JsonObject frame)
    {
        var type = String(frame, "type");
        var clientId = String(frame, "clientId");
        switch (type)
        {
            case "hello":
                if (clientId is null) return;
                DglabV4Protocol.ValidateIdentifier(clientId, nameof(clientId));
                if (_targetId is not null && _targetId != clientId) throw new InvalidDataException("DG-LAB pairing identity changed.");
                _targetId = clientId; _state = _devices.Count > 0 ? "Paired" : "WaitingForApp";
                _hello?.TrySetResult(clientId);
                break;
            case "client_attached":
                if (clientId is null || _targetId is null) return;
                _devices.Attach(clientId, NowMs); _state = "Paired";
                break;
            case "client_disconnected":
                if (clientId is null) return;
                _devices.Remove(clientId);
                foreach (var item in _pending.Where(item => item.Key.Client == clientId).ToArray())
                {
                    _pending.Remove(item.Key); item.Value.TrySetException(new IOException("DG-LAB APP disconnected."));
                }
                _controlled.RemoveWhere(target => target.ClientId == clientId);
                _state = _devices.Count > 0 ? "Paired" : "WaitingForApp";
                break;
            case "message":
                if (clientId is null || !_devices.ContainsClient(clientId) || frame["data"] is not JsonObject data) return;
                _devices.Apply(clientId, data, NowMs);
                _controlled.RemoveWhere(target => !_devices.CanOperate(target));
                if (String(data, "t") != "resp") return;
                var id = String(data, "reqId") ?? String(data, "requestId");
                if (id is null || !_pending.Remove((clientId, id), out var waiter)) return;
                if (String(data, "error") is { Length: > 0 } error) waiter.TrySetException(new IOException("DG-LAB: " + error));
                else waiter.TrySetResult(data["result"] is { } result ? JsonSerializer.SerializeToElement(result) : JsonSerializer.SerializeToElement<object?>(null));
                break;
            case "pong": _missedPongs = 0; break;
            case "idle_timeout": throw new IOException("DG-LAB relay idle timeout.");
            case "error": throw new IOException("DG-LAB: " + (String(frame, "message") ?? String(frame, "code") ?? "relay error"));
        }
    }

    private async Task HeartbeatLoopAsync(IDglabSocket socket, long generation, CancellationToken cancellationToken)
    {
        try
        {
            while (true)
            {
                await Task.Delay(TimeSpan.FromSeconds(2), _clock, cancellationToken).ConfigureAwait(false);
                lock (_sync)
                {
                    if (_generation != generation || _socket != socket) return;
                    if (_missedPongs >= 3) throw new IOException("DG-LAB relay ping timeout.");
                    _missedPongs++;
                }
                await SendAsync(socket, generation, "{\"type\":\"ping\"}", cancellationToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (Exception error) { FailConnection(generation, error.Message); }
    }

    private async Task DisconnectCoreAsync()
    {
        IDglabSocket? socket;
        long generation;
        DglabTarget[] targets;
        lock (_sync) { socket = _socket; generation = _generation; targets = _controlled.ToArray(); }
        if (socket is null) return;
        // Teardown sends best-effort channel stops without waiting for APP RPC completion.
        using (var deadline = new CancellationTokenSource(TimeSpan.FromMilliseconds(500), _clock))
        {
            try
            {
                if (socket.IsOpen) foreach (var target in targets)
                {
                    var id = generation + "-" + Interlocked.Increment(ref _sequence);
                    await SendAsync(socket, generation, DglabV4Protocol.Request(target.ClientId, id, "device.op.clear", DglabV4Protocol.Clear(target)), deadline.Token).ConfigureAwait(false);
                    id = generation + "-" + Interlocked.Increment(ref _sequence);
                    await SendAsync(socket, generation, DglabV4Protocol.Request(target.ClientId, id, "device.op", DglabV4Protocol.Reset(target)), deadline.Token).ConfigureAwait(false);
                }
            }
            catch { /* The finite task lease remains the APP-side expiry when delivery is unavailable. */ }
        }
        lock (_sync)
        {
            if (_socket == socket)
            {
                _generation++; _socket = null; _state = "Disconnected"; _targetId = null;
                _lifetime?.Cancel(); _hello?.TrySetCanceled();
                foreach (var waiter in _pending.Values) waiter.TrySetException(new IOException("DG-LAB connection closed."));
                _pending.Clear(); _devices.Clear(); _controlled.Clear();
            }
        }
        socket.Abort();
        await socket.DisposeAsync().ConfigureAwait(false);
        Notify();
    }

    private void FailConnection(long generation, string error)
    {
        IDglabSocket? socket;
        lock (_sync)
        {
            if (_generation != generation) return;
            _generation++;
            _state = "Disconnected"; _lastError = error; _targetId = null; _missedPongs = 0;
            socket = _socket;
            _lifetime?.Cancel(); _hello?.TrySetException(new IOException(error));
            foreach (var waiter in _pending.Values) waiter.TrySetException(new IOException(error));
            _pending.Clear(); _devices.Clear(); _controlled.Clear();
        }
        socket?.Abort(); Notify();
    }

    private long NowMs => _clock.GetUtcNow().ToUnixTimeMilliseconds();
    private static string? String(JsonObject node, string key) => node[key] is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
    private void Notify()
    {
        if (Changed is not { } changed) return;
        foreach (Action handler in changed.GetInvocationList()) { try { handler(); } catch { } }
    }
}
