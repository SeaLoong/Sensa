using Buttplug.Client;

namespace Sensa.Outputs.Intiface;

public sealed partial class IntifaceOutputClient
{
    private readonly SemaphoreSlim _lifecycleGate = new(1, 1);
    private IntifaceWebSocketConnector? _connector;
    private CancellationTokenSource? _connecting;
    private int _disposed;

    public async Task ConnectAsync(CancellationToken ct = default)
    {
        ObjectDisposedException.ThrowIf(Volatile.Read(ref _disposed) != 0, this);
        await _lifecycleGate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            ObjectDisposedException.ThrowIf(Volatile.Read(ref _disposed) != 0, this);
            if (_connected) return;
            await RetireConnectionAsync().ConfigureAwait(false);
            var address = new Uri(_config.WebsocketAddress);
            var connector = new IntifaceWebSocketConnector(address);
            var client = new ButtplugClient("Sensa");
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
            deadline.CancelAfter(TimeSpan.FromSeconds(5));
            lock (_devLock)
            {
                _client = client; _connector = connector; _connecting = deadline;
                _connected = false; ResetDevices();
            }
            Observe(client);
            try
            {
                await client.ConnectAsync(connector, deadline.Token).WaitAsync(deadline.Token).ConfigureAwait(false);
                lock (_devLock)
                {
                    if (!ReferenceEquals(_client, client) || !connector.Connected || Volatile.Read(ref _disposed) != 0)
                        throw new OperationCanceledException("The Intiface connection was replaced.");
                    _connected = true;
                }
                OnLog?.Invoke($"Intiface connected: {address.GetComponents(UriComponents.SchemeAndServer, UriFormat.UriEscaped)}");
                DevicesChanged?.Invoke();
            }
            catch
            {
                await RetireConnectionAsync().ConfigureAwait(false);
                throw;
            }
            finally { lock (_devLock) if (ReferenceEquals(_connecting, deadline)) _connecting = null; }
        }
        finally { _lifecycleGate.Release(); }
    }

    private void Observe(ButtplugClient client)
    {
        client.DeviceAdded += (_, e) =>
        {
            lock (_devLock)
            {
                if (!ReferenceEquals(_client, client)) return;
                ++_motionEpoch;
                _devices.RemoveAll(device => device.Index == e.Device.Index);
                _lastLinearSent.Remove(e.Device.Index); _lastVibrateSent.Remove(e.Device.Index); ClearMappedOutputs(e.Device.Index);
                _devices.Add(e.Device);
            }
            OnLog?.Invoke($"Device added: {e.Device.Name}"); DevicesChanged?.Invoke();
        };
        client.DeviceRemoved += (_, e) =>
        {
            lock (_devLock)
            {
                if (!ReferenceEquals(_client, client)) return;
                ++_motionEpoch; _devices.Remove(e.Device);
                _lastLinearSent.Remove(e.Device.Index); _lastVibrateSent.Remove(e.Device.Index); ClearMappedOutputs(e.Device.Index);
                Telemetry.RemovePrefix($"#{e.Device.Index}/");
            }
            OnLog?.Invoke($"Device removed: {e.Device.Name}"); DevicesChanged?.Invoke();
        };
        client.ServerDisconnect += (_, _) =>
        {
            lock (_devLock)
            {
                if (!ReferenceEquals(_client, client)) return;
                _connected = false; ResetDevices(); Telemetry.SetState("idle", clear: true);
            }
            OnLog?.Invoke("Intiface disconnected."); DevicesChanged?.Invoke();
        };
    }

    private void ResetDevices()
    {
        _devices.Clear(); _lastLinearSent.Clear(); _lastVibrateSent.Clear(); ClearMappedOutputs();
    }

    private async Task RetireConnectionAsync()
    {
        ButtplugClient? client; IntifaceWebSocketConnector? connector; bool stop;
        lock (_devLock)
        {
            client = _client; connector = _connector; stop = _connected;
            // Detach ownership before awaiting old I/O; its callbacks and late stop
            // acknowledgement must not clear a replacement connection's state.
            _client = null; _connector = null; _connected = false; ResetDevices();
            Telemetry.SetState("idle", clear: true);
        }
        if (client is null && connector is null) return;
        if (stop && client is not null)
        {
            try
            {
                using var deadline = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));
                await client.StopAllDevicesAsync(deadline.Token).WaitAsync(deadline.Token).ConfigureAwait(false);
            }
            catch { }
        }
        if (connector is not null) await connector.DisposeAsync().ConfigureAwait(false);
        if (client is not null)
            try { await client.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false); } catch { }
        DevicesChanged?.Invoke();
    }

    private void CancelConnecting()
    {
        CancellationTokenSource? connecting;
        lock (_devLock) connecting = _connecting;
        try { connecting?.Cancel(); } catch (ObjectDisposedException) { }
    }

    public async Task DisconnectAsync()
    {
        CancelConnecting();
        await _lifecycleGate.WaitAsync().ConfigureAwait(false);
        try { await RetireConnectionAsync().ConfigureAwait(false); }
        finally { _lifecycleGate.Release(); }
    }

    public async Task StopAllAsync()
    {
        ButtplugClient? client;
        lock (_devLock) { client = _client; if (client is null) return; ClearMappedOutputs(); }
        var stopped = false;
        try
        {
            using var deadline = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));
            await client.StopAllDevicesAsync(deadline.Token).WaitAsync(deadline.Token).ConfigureAwait(false); stopped = true;
        }
        catch { }
        lock (_devLock)
        {
            if (!ReferenceEquals(_client, client)) return;
            _lastLinearSent.Clear(); _lastVibrateSent.Clear(); ClearMappedOutputs();
            Telemetry.SetState(stopped ? "stopped" : "error", clear: stopped);
        }
        OnDebugLog?.Invoke("TX StopAll");
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        await DisconnectAsync().ConfigureAwait(false);
    }
}
