using Buttplug.Client;
using Buttplug.Core.Messages;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Outputs.Intiface;
using Sensa.Outputs.Adapters;
using Sensa.Outputs.TCode;
using Sensa.Outputs.Devices;

namespace Sensa.Outputs;

public sealed class OutputCoordinator : IMotionOutput, IAsyncDisposable
{
    private readonly AppConfig _config;
    private readonly Action<string> _log;
    private readonly Action<string> _logDebug;
    private readonly Action<string> _logError;
    private readonly object _sync = new();
    private readonly Dictionary<string, OutputConnection> _connections = new(StringComparer.OrdinalIgnoreCase);
    private readonly Func<OutputDeviceConfig, VendorDeviceOutput>? _vendorFactory;
    private int _stateChangeBatchDepth;
    private bool _stateChangePending;

    public Func<bool> CanSend { get; set; } = () => false;
    public Func<bool> CanRouteSignals { get; set; } = () => false;
    public SignalOutputCoordinator SignalOutputs { get; }
    public event Action? StateChanged;

    public OutputCoordinator(AppConfig config, Action<string> log, Action<string> logDebug, Action<string> logError,
        Func<OutputDeviceConfig, ISignalOutputAdapter>? signalAdapterFactory = null,
        Func<OutputDeviceConfig, VendorDeviceOutput>? vendorFactory = null)
    {
        _config = config;
        _log = log;
        _logDebug = logDebug;
        _logError = logError;
        _vendorFactory = vendorFactory;
        SignalOutputs = new(config, id => TryGetConnection(id)?.IsConnected == true, SendRoutedMotionAsync, StopRoutedMotionAsync,
            logError, adapterFactory: signalAdapterFactory);
        SignalOutputs.CanSend = () => CanRouteSignals();
        SignalOutputs.StateChanged += NotifyStateChanged;
        RebuildConnections();
    }

    public void RebuildConnections()
    {
        List<OutputConnection> oldConnections;
        lock (_sync)
        {
            oldConnections = _connections.Values.ToList();
            _connections.Clear();
            foreach (var output in _config.Outputs.Where(output => !SignalOutputConfiguration.IsProtocolOutput(output.Type)))
            {
                _connections[output.Id] = new OutputConnection(_config, output, _log, _logDebug, _logError, NotifyStateChanged, _vendorFactory);
            }
        }

        foreach (var connection in oldConnections)
        {
            connection.DisposeAsync().AsTask().GetAwaiter().GetResult();
        }
    }

    public async Task ReloadAsync()
    {
        await SignalOutputs.ReloadAsync();
        List<OutputConnection> staleConnections;
        var nextConnections = new Dictionary<string, OutputConnection>(StringComparer.OrdinalIgnoreCase);
        lock (_sync)
        {
            var remaining = new Dictionary<string, OutputConnection>(_connections, StringComparer.OrdinalIgnoreCase);
            foreach (var output in _config.Outputs.Where(output => !SignalOutputConfiguration.IsProtocolOutput(output.Type)))
            {
                if (remaining.TryGetValue(output.Id, out var existing) && existing.CanReuse(output))
                {
                    nextConnections[output.Id] = existing;
                    remaining.Remove(output.Id);
                    continue;
                }


                nextConnections[output.Id] = new OutputConnection(_config, output, _log, _logDebug, _logError, NotifyStateChanged, _vendorFactory);
            }

            staleConnections = remaining.Values.ToList();
            _connections.Clear();
            foreach (var entry in nextConnections)
                _connections[entry.Key] = entry.Value;
        }

        foreach (var connection in staleConnections)
        {
            await connection.DisposeAsync();
        }

        NotifyStateChanged();
    }

    public async Task ConnectEnabledAsync()
    {
        foreach (var output in _config.Outputs.Where(output => output.Enabled))
        {
            await ConnectAsync(output.Id);
        }
    }

    public async Task<bool> ConnectAsync(string outputId)
    {
        if (_config.Outputs.FirstOrDefault(output => output.Id == outputId) is { } target && SignalOutputConfiguration.IsProtocolOutput(target.Type))
            return await SignalOutputs.ConnectAsync(outputId);
        OutputConnection? connection;
        lock (_sync)
            _connections.TryGetValue(outputId, out connection);

        if (connection is null)
            return false;

        if (connection.IsConnected)
            return true;

        return await connection.ConnectAsync();
    }

    public async Task DisconnectAsync(string outputId)
    {
        if (_config.Outputs.FirstOrDefault(output => output.Id == outputId) is { } target && SignalOutputConfiguration.IsProtocolOutput(target.Type))
        { await SignalOutputs.DisconnectAsync(outputId); return; }
        OutputConnection? connection;
        lock (_sync)
            _connections.TryGetValue(outputId, out connection);

        if (connection is not null)
            await connection.DisconnectAsync();
    }

    public Task<bool> ConnectPrimaryAsync(OutputDeviceType type)
    {
        var output = _config.GetPrimaryOutput(type);
        return output is null ? Task.FromResult(false) : ConnectAsync(output.Id);
    }

    public Task DisconnectPrimaryAsync(OutputDeviceType type)
    {
        var output = _config.GetPrimaryOutput(type);
        return output is null ? Task.CompletedTask : DisconnectAsync(output.Id);
    }

    public async Task SendAsync(MotionFrame frame)
    {
        List<(OutputDeviceConfig Output, OutputConnection Connection)> activeConnections;
        lock (_sync)
        {
            activeConnections = _config.Outputs
                .Where(output => output.Enabled && !SignalOutputConfiguration.UsesBindings(output))
                .Select(output => (_connections.TryGetValue(output.Id, out var connection) ? (Output: output, Connection: connection) : default))
                .Where(tuple => tuple.Connection is not null)
                .Select(tuple => (tuple.Output, tuple.Connection!))
                .ToList();
        }

        await Task.WhenAll(activeConnections.Select(item => Task.Run(async () =>
        {
            if (!CanSend() || !item.Output.Enabled || !item.Connection.IsConnected) return;
            try { await item.Connection.SendAsync(frame, CanSend); }
            catch (Exception ex) { _logError($"[Output] {ex.Message}"); }
        })));
    }

    public async Task RefreshUdpAsync(MotionFrame frame)
    {
        OutputConnection[] connections;
        lock (_sync) connections = _config.Outputs.Where(o => o.Enabled && o.Type == OutputDeviceType.TCodeUdp && !SignalOutputConfiguration.UsesBindings(o))
            .Select(o => _connections.GetValueOrDefault(o.Id)).OfType<OutputConnection>().ToArray();
        foreach (var connection in connections)
            if (CanSend()) await connection.SendAsync(frame, CanSend);
    }

    public bool IsConnected(string? outputId)
    {
        if (string.IsNullOrWhiteSpace(outputId))
            return false;

        if (_config.Outputs.FirstOrDefault(output => output.Id == outputId) is { } target && SignalOutputConfiguration.IsProtocolOutput(target.Type))
            return SignalOutputs.IsConnected(outputId);
        lock (_sync)
            return _connections.TryGetValue(outputId, out var connection) && connection.IsConnected;
    }

    public IReadOnlyList<ButtplugClientDevice> GetDevices(string? outputId)
    {
        if (string.IsNullOrWhiteSpace(outputId))
            return Array.Empty<ButtplugClientDevice>();

        lock (_sync)
            return _connections.TryGetValue(outputId, out var connection)
                ? connection.Devices
                : Array.Empty<ButtplugClientDevice>();
    }

    public async Task EmergencyStopAsync()
    {
        await SignalOutputs.StopAsync();
        List<OutputConnection> connections;
        lock (_sync)
            connections = _connections.Values.ToList();

        await Task.WhenAll(connections.Select(connection => Task.Run(async () =>
        {
            try { await connection.EmergencyStopAsync(); }
            catch (Exception ex) { _logError($"[Emergency] {ex.Message}"); }
        })));

        NotifyStateChanged();
    }

    public async Task StopUnboundAsync()
    {
        OutputConnection[] connections;
        lock (_sync) connections = _config.Outputs.Where(output => !SignalOutputConfiguration.UsesBindings(output))
            .Select(output => _connections.GetValueOrDefault(output.Id)).OfType<OutputConnection>().ToArray();
        await Task.WhenAll(connections.Select(async connection =>
        {
            try { await connection.EmergencyStopAsync(); }
            catch (Exception ex) { _logError($"[Output] {ex.Message}"); }
        }));
        NotifyStateChanged();
    }

    public async Task RunStateChangeBatchAsync(Func<Task> action)
    {
        lock (_sync)
            _stateChangeBatchDepth += 1;

        try
        {
            await action();
        }
        finally
        {
            bool shouldNotify;
            lock (_sync)
            {
                _stateChangeBatchDepth = Math.Max(0, _stateChangeBatchDepth - 1);
                shouldNotify = _stateChangeBatchDepth == 0 && _stateChangePending;
                if (shouldNotify)
                    _stateChangePending = false;
            }

            if (shouldNotify)
                StateChanged?.Invoke();
        }
    }

    public Task StartScanAsync(string outputId) =>
        TryGetConnection(outputId)?.StartScanAsync() ?? Task.CompletedTask;

    public Task StopScanAsync(string outputId) =>
        TryGetConnection(outputId)?.StopScanAsync() ?? Task.CompletedTask;

    public Task RefreshTCodeDeviceInfoAsync(string outputId) =>
        TryGetConnection(outputId)?.RefreshTCodeDeviceInfoAsync() ?? Task.CompletedTask;

    public void CancelPendingVendorCommands()
    {
        OutputConnection[] connections;
        lock (_sync) connections = _connections.Values.ToArray();
        foreach (var connection in connections) connection.CancelPendingVendorCommands();
    }

    public async Task<object> VendorScriptAsync(string outputId, string action, string? url = null, int positionMs = 0, bool? loop = null)
    {
        var output = _config.FindOutput(outputId) ?? throw new InvalidOperationException("Output does not exist.");
        if (!OutputConfigHelpers.IsVendorOutput(output.Type)) throw new InvalidOperationException("This output does not support vendor scripts.");
        if (action is "play" or "seek" && (!output.Enabled || !CanRouteSignals()))
            throw new InvalidOperationException("Enable this output and activate input before playing or seeking a device script.");
        var connection = TryGetConnection(outputId) ?? throw new InvalidOperationException("Output connection is unavailable.");
        var result = await connection.VendorScriptAsync(action, url ?? output.Device.ScriptUrl, positionMs,
            () => output.Enabled && CanRouteSignals(), loop);
        NotifyStateChanged();
        return result;
    }

    public Task StartPrimaryScanAsync(OutputDeviceType type)
    {
        var output = _config.GetPrimaryOutput(type);
        return output is null ? Task.CompletedTask : StartScanAsync(output.Id);
    }

    public Task StopPrimaryScanAsync(OutputDeviceType type)
    {
        var output = _config.GetPrimaryOutput(type);
        return output is null ? Task.CompletedTask : StopScanAsync(output.Id);
    }

    public object[] BuildOverview()
    {
        return _config.Outputs.Select(output =>
        {
            var connection = TryGetConnection(output.Id);
            var devices = connection?.Devices.Select(device => new
            {
                name = device.Name,
                index = device.Index,
                features = device.Features.Select(pair => new
                {
                    index = pair.Key, description = pair.Value.FeatureDefinition.FeatureDescription,
                    outputTypes = pair.Value.FeatureDefinition.Output?.Keys.ToArray() ?? [],
                }).ToArray(),
                positionFeatures = IntifacePositionFeatures.For(device).Count,
                vibrateFeatures = device.GetFeaturesWithOutput(OutputType.Vibrate).Count(),
            }).ToArray() ?? Array.Empty<object>();

            return new
            {
                id = output.Id,
                name = output.Name,
                type = output.Type,
                enabled = output.Enabled,
                connected = SignalOutputConfiguration.IsProtocolOutput(output.Type) ? SignalOutputs.IsConnected(output.Id) : connection?.IsConnected ?? false,
                signalStatus = SignalOutputs.Snapshot(output.Id),
                profileId = OutputConfigHelpers.IsTCodeOutput(output.Type) ? output.MotionProfileId : null,
                profileName = OutputConfigHelpers.IsTCodeOutput(output.Type) ? _config.ResolveAxisProfileName(output.MotionProfileId) : null,
                tcodeSettings = OutputConfigHelpers.IsTCodeOutput(output.Type)
                    ? new
                    {
                        speedUnitBase = output.SpeedUnitBase,
                        slopeMode = output.SlopeMode,
                    }
                    : null,
                tcodeDeviceInfo = OutputConfigHelpers.IsTCodeOutput(output.Type)
                    ? connection?.GetTCodeDeviceInfo() ?? TCodeDeviceInfo.Unsupported("未连接")
                    : null,
                summary = BuildSummary(output),
                telemetry = connection?.Telemetry,
                deviceApi = connection?.VendorSnapshot,
                devices,
            };
        }).ToArray();
    }

    public async ValueTask DisposeAsync()
    {
        await SignalOutputs.DisposeAsync();
        List<OutputConnection> connections;
        lock (_sync)
        {
            connections = _connections.Values.ToList();
            _connections.Clear();
        }

        foreach (var connection in connections)
        {
            await connection.DisposeAsync();
        }
    }

    private async Task SendRoutedMotionAsync(string outputId, MotionFrame frame)
    {
        var connection = TryGetConnection(outputId);
        if (connection?.IsConnected == true && CanRouteSignals()) await connection.SendAsync(frame, CanRouteSignals);
    }
    private async Task StopRoutedMotionAsync(string outputId)
    {
        if (TryGetConnection(outputId) is { } connection) await connection.EmergencyStopAsync();
    }

    private static string BuildSummary(OutputDeviceConfig output)
    {
        return output.Type switch
        {
            OutputDeviceType.TCodeSerial => string.IsNullOrWhiteSpace(output.ComPort) ? "未设置串口" : output.ComPort,
            OutputDeviceType.TCodeUdp => $"{output.Host}:{output.Port}",
            OutputDeviceType.TCodeTcp => $"{output.Host}:{output.Port}",
            OutputDeviceType.Intiface => output.WebsocketAddress,
            _ => output.Name,
        };
    }

    private OutputConnection? TryGetConnection(string outputId)
    {
        lock (_sync)
            return _connections.TryGetValue(outputId, out var connection) ? connection : null;
    }

    private void NotifyStateChanged()
    {
        lock (_sync)
        {
            if (_stateChangeBatchDepth > 0)
            {
                _stateChangePending = true;
                return;
            }
        }

        StateChanged?.Invoke();
    }
}

internal sealed class OutputConnection : IAsyncDisposable
{
    private readonly SemaphoreSlim _operationGate = new(1, 1);
    private readonly AppConfig _config;
    private readonly OutputDeviceConfig _output;
    private readonly Action<string> _log;
    private readonly Action<string> _logDebug;
    private readonly Action<string> _logError;
    private readonly Action? _notifyChanged;
    private readonly TCodeSerialOutput? _serial;
    private readonly TCodeUdpOutput? _udp;
    private readonly TCodeTcpOutput? _tcp;
    private IntifaceOutputClient? _intiface;
    private string _intifaceConfigKey = string.Empty;
    private EmbeddedIntifaceEngine? _intifaceHost;
    private VendorDeviceOutput? _vendor;
    private DeviceProtocolOptions? _vendorConfiguration;
    private readonly Func<OutputDeviceConfig, VendorDeviceOutput>? _vendorFactory;

    public OutputConnection(AppConfig config, OutputDeviceConfig output, Action<string> log, Action<string> logDebug, Action<string> logError, Action? notifyChanged,
        Func<OutputDeviceConfig, VendorDeviceOutput>? vendorFactory = null)
    {
        _config = config;
        _output = output;
        _log = log;
        _logDebug = logDebug;
        _logError = logError;
        _notifyChanged = notifyChanged;
        _vendorFactory = vendorFactory;

        switch (_output.Type)
        {
            case OutputDeviceType.TCodeSerial:
                _serial = new TCodeSerialOutput(_output, () => _config.ResolveMotionProfile(_output.MotionProfileId));
                _serial.OnDebugLog += message => _logDebug($"[Output/TCodeSerial/{_output.Name}] {message}");
                break;
            case OutputDeviceType.TCodeUdp:
                _udp = new TCodeUdpOutput(_output, () => _config.ResolveMotionProfile(_output.MotionProfileId));
                _udp.OnDebugLog += message => _logDebug($"[Output/TCodeUdp/{_output.Name}] {message}");
                break;
            case OutputDeviceType.TCodeTcp:
                _tcp = new TCodeTcpOutput(_output, () => _config.ResolveMotionProfile(_output.MotionProfileId));
                _tcp.OnDebugLog += message => _logDebug($"[Output/TCodeTcp/{_output.Name}] {message}");
                break;
            case OutputDeviceType.Intiface:
                ConfigureIntifaceClient();
                break;
            case OutputDeviceType.Handy:
            case OutputDeviceType.Autoblow:
            case OutputDeviceType.VacuGlide:
            case OutputDeviceType.Lovense:
                ConfigureVendorClient();
                break;
        }
    }

    public bool CanReuse(OutputDeviceConfig output) =>
        string.Equals(_output.Id, output.Id, StringComparison.OrdinalIgnoreCase)
        && _output.Type == output.Type
        && (!OutputConfigHelpers.IsVendorOutput(output.Type) || DeviceProtocolOptions.Equivalent(_vendorConfiguration, output.Device));

    public bool IsConnected => _output.Type switch
    {
        OutputDeviceType.TCodeSerial => _serial?.IsConnected == true,
        OutputDeviceType.TCodeUdp => _udp?.IsConnected == true,
        OutputDeviceType.TCodeTcp => _tcp?.IsConnected == true,
        OutputDeviceType.Intiface => _intiface?.IsConnected == true,
        OutputDeviceType.Handy or OutputDeviceType.Autoblow or OutputDeviceType.VacuGlide or OutputDeviceType.Lovense => _vendor?.IsConnected == true,
        _ => false,
    };

    public IReadOnlyList<ButtplugClientDevice> Devices => _intiface?.Devices ?? Array.Empty<ButtplugClientDevice>();
    public OutputTelemetrySnapshot? Telemetry => (_serial?.Telemetry ?? _udp?.Telemetry ?? _tcp?.Telemetry ?? _intiface?.Telemetry)?.Snapshot;
    public object? VendorSnapshot => _vendor is null ? null : new
    {
        supportsStreaming = _vendor.SupportsStreaming,
        commandKind = _vendor.CommandKind,
        supportsScripts = _vendor.SupportsScripts,
        supportsScriptLoop = _vendor.SupportsScriptLoop,
        scriptLoop = _vendor.ScriptLoop,
        scriptPrepared = _vendor.ScriptPrepared,
        scriptPlaying = _vendor.ScriptPlaying,
        scriptPositionMs = _vendor.ScriptPositionMs,
        lastError = _vendor.LastError,
    };

    public void CancelPendingVendorCommands() => _vendor?.CancelPendingCommands();

    public TCodeDeviceInfo GetTCodeDeviceInfo()
    {
        return _output.Type switch
        {
            OutputDeviceType.TCodeSerial => _serial?.DeviceInfo ?? TCodeDeviceInfo.Unsupported("未查询"),
            OutputDeviceType.TCodeUdp => TCodeDeviceInfo.Unsupported("UDP 输出不支持回读 D 指令"),
            OutputDeviceType.TCodeTcp => TCodeDeviceInfo.Unsupported("TCP 输出当前未实现 D 指令回读"),
            _ => TCodeDeviceInfo.Unsupported("非 TCode 输出"),
        };
    }

    public async Task<bool> ConnectAsync()
    {
        await _operationGate.WaitAsync();
        try { return await ConnectCoreAsync(); }
        finally { _operationGate.Release(); }
    }

    private async Task<bool> ConnectCoreAsync()
    {
        try
        {
            if (IsConnected)
                return true;

            switch (_output.Type)
            {
                case OutputDeviceType.TCodeSerial:
                    if (string.IsNullOrWhiteSpace(_output.ComPort))
                        return false;
                    _serial?.Connect();
                    // Connecting does not move the device. Motion requires active input.
                    _log($"[Output] 已连接 {Label}: {_output.ComPort}");
                    _notifyChanged?.Invoke();
                    return _serial?.IsConnected == true;
                case OutputDeviceType.TCodeUdp:
                    _udp?.Connect();
                    // Connecting does not move the device. Motion requires active input.
                    _log($"[Output] 已连接 {Label}: {_output.Host}:{_output.Port}");
                    _notifyChanged?.Invoke();
                    return _udp?.IsConnected == true;
                case OutputDeviceType.TCodeTcp:
                    _tcp?.Connect();
                    // Connecting does not move the device. Motion requires active input.
                    _log($"[Output] 已连接 {Label}: {_output.Host}:{_output.Port}");
                    _notifyChanged?.Invoke();
                    return _tcp?.IsConnected == true;
                case OutputDeviceType.Intiface:
                    await EnsureIntifaceClientConfiguredAsync();

                    if (_output.ManageEngineProcess)
                    {
                        if (_intifaceHost?.IsRunning != true)
                        {
                            _intifaceHost?.Dispose();
                            _intifaceHost = new EmbeddedIntifaceEngine(_output.Port);
                            if (!_intifaceHost.Start())
                            {
                                _log($"[Output] 跳过 {Label} 连接：内置 Intiface 引擎不可用。");
                                return false;
                            }

                            await Task.Delay(1500);
                        }
                    }

                    if (_intiface is not null && !_intiface.IsConnected)
                        await _intiface.ConnectAsync();
                    if (_intiface?.IsConnected == true)
                        _log($"[Output] 已连接 {Label}: {_output.WebsocketAddress}");
                    _notifyChanged?.Invoke();
                    return _intiface?.IsConnected == true;
                case OutputDeviceType.Handy:
                case OutputDeviceType.Autoblow:
                case OutputDeviceType.VacuGlide:
                case OutputDeviceType.Lovense:
                    await EnsureVendorClientConfiguredAsync();
                    await _vendor!.ConnectAsync();
                    _log($"[Output] 已连接 {Label}");
                    _notifyChanged?.Invoke();
                    return _vendor.IsConnected;
                default:
                    return false;
            }
        }
        catch (Exception ex)
        {
            _logError($"[Output] 连接失败 {Label}: {ex.Message}");
            return false;
        }
    }

    public async Task DisconnectAsync()
    {
        _vendor?.CancelPendingCommands();
        await _operationGate.WaitAsync();
        try { await DisconnectCoreAsync(); }
        finally { _operationGate.Release(); }
    }

    private async Task DisconnectCoreAsync()
    {
        switch (_output.Type)
        {
            case OutputDeviceType.TCodeSerial:
                _serial?.Disconnect();
                break;
            case OutputDeviceType.TCodeUdp:
                _udp?.Disconnect();
                break;
            case OutputDeviceType.TCodeTcp:
                _tcp?.Disconnect();
                break;
            case OutputDeviceType.Intiface:
                if (_intiface is not null)
                    await _intiface.DisconnectAsync();
                _intifaceHost?.Dispose();
                _intifaceHost = null;
                break;
            case OutputDeviceType.Handy:
            case OutputDeviceType.Autoblow:
            case OutputDeviceType.VacuGlide:
            case OutputDeviceType.Lovense:
                if (_vendor is not null) await _vendor.DisconnectAsync();
                break;
        }

        _log($"[Output] 已断开 {Label}");
        _notifyChanged?.Invoke();
    }

    public async Task SendAsync(MotionFrame frame, Func<bool>? canSend = null)
    {
        await _operationGate.WaitAsync();
        try { if (canSend?.Invoke() == false) return; await SendCoreAsync(frame); }
        finally { _operationGate.Release(); }
    }

    private Task SendCoreAsync(MotionFrame frame)
    {
        switch (_output.Type)
        {
            case OutputDeviceType.TCodeSerial:
                _serial?.Send(frame);
                break;
            case OutputDeviceType.TCodeUdp:
                _udp?.Send(frame);
                break;
            case OutputDeviceType.TCodeTcp:
                _tcp?.Send(frame);
                break;
            case OutputDeviceType.Intiface:
                return _intiface?.SendAsync(frame) ?? Task.CompletedTask;
            case OutputDeviceType.Handy:
            case OutputDeviceType.Autoblow:
            case OutputDeviceType.VacuGlide:
            case OutputDeviceType.Lovense:
                // An active script owns its API mode until explicitly stopped;
                // live frames cannot take it over.
                return _vendor?.SupportsStreaming == true && !_vendor.ScriptPlaying
                    ? _vendor.SendAsync(frame) : Task.CompletedTask;
        }

        return Task.CompletedTask;
    }

    public async Task EmergencyStopAsync()
    {
        if (_vendor is { } vendor)
        {
            // Cancel the REST client's active/queued motion before waiting on an outer
            // connection operation; the in-flight HTTP request must not delay stop.
            await vendor.StopAsync();
            return;
        }
        await _operationGate.WaitAsync();
        try { await EmergencyStopCoreAsync(); }
        finally { _operationGate.Release(); }
    }

    private async Task EmergencyStopCoreAsync()
    {
        switch (_output.Type)
        {
            case OutputDeviceType.TCodeSerial:
                _serial?.EmergencyStop();
                break;
            case OutputDeviceType.TCodeUdp:
                _udp?.EmergencyStop();
                break;
            case OutputDeviceType.TCodeTcp:
                _tcp?.EmergencyStop();
                break;
            case OutputDeviceType.Intiface:
                if (_intiface is not null && _intiface.IsConnected)
                    await _intiface.StopAllAsync();
                break;
            case OutputDeviceType.Handy:
            case OutputDeviceType.Autoblow:
            case OutputDeviceType.VacuGlide:
            case OutputDeviceType.Lovense:
                if (_vendor is not null) await _vendor.StopAsync();
                break;
        }
    }

    public Task StartScanAsync() => _intiface?.StartScanAsync() ?? Task.CompletedTask;

    public Task StopScanAsync() => _intiface?.StopScanAsync() ?? Task.CompletedTask;

    public Task RefreshTCodeDeviceInfoAsync()
    {
        if (_output.Type != OutputDeviceType.TCodeSerial)
            return Task.CompletedTask;

        if (_serial?.IsConnected == true)
        {
            _serial.RefreshDeviceInfo();
            _notifyChanged?.Invoke();
        }

        return Task.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        _vendor?.CancelPendingCommands();
        await _operationGate.WaitAsync();
        try { await DisposeCoreAsync(); }
        finally { _operationGate.Release(); }
    }

    private async ValueTask DisposeCoreAsync()
    {
        switch (_output.Type)
        {
            case OutputDeviceType.TCodeSerial:
                _serial?.Dispose();
                break;
            case OutputDeviceType.TCodeUdp:
                _udp?.Dispose();
                break;
            case OutputDeviceType.TCodeTcp:
                _tcp?.Dispose();
                break;
            case OutputDeviceType.Intiface:
                if (_intiface is not null)
                    await _intiface.DisposeAsync();
                _intiface = null;
                _intifaceConfigKey = string.Empty;
                _intifaceHost?.Dispose();
                _intifaceHost = null;
                break;
            case OutputDeviceType.Handy:
            case OutputDeviceType.Autoblow:
            case OutputDeviceType.VacuGlide:
            case OutputDeviceType.Lovense:
                if (_vendor is not null) await _vendor.DisposeAsync();
                _vendor = null;
                _vendorConfiguration = null;
                break;
        }

        _notifyChanged?.Invoke();
    }

    private string Label => $"{_output.Name} ({_output.Id})";

    public async Task<object> VendorScriptAsync(string action, string url, int positionMs, Func<bool> canMove, bool? loop = null)
    {
        // The vendor client cancels queued work on Stop; do not hold _operationGate
        // across script network requests or an emergency stop could be blocked by preparation.
        var client = _vendor ?? throw new InvalidOperationException("This output does not support device scripts.");
        if (!client.SupportsScripts) throw new InvalidOperationException("This device API does not support synchronized scripts.");
        switch (action)
        {
            case "prepare":
                if (!Uri.TryCreate(url, UriKind.Absolute, out var scriptUrl)) throw new ArgumentException("Enter a valid reachable script URL.");
                await client.PrepareScriptAsync(scriptUrl);
                break;
            case "play":
                if (!canMove()) throw new InvalidOperationException("Input is no longer active.");
                await client.PlayScriptAsync(positionMs, canMove);
                if (!canMove()) await client.StopAsync();
                break;
            case "seek":
                if (!canMove()) throw new InvalidOperationException("Input is no longer active.");
                await client.SeekScriptAsync(positionMs, canMove);
                if (!canMove()) await client.StopAsync();
                break;
            case "loop":
                if (!loop.HasValue) throw new ArgumentException("Specify a boolean loop setting.");
                await client.SetScriptLoopAsync(loop.Value);
                break;
            case "stop": await client.StopScriptAsync(); break;
            default: throw new ArgumentException("Unknown device script action.");
        }
        _notifyChanged?.Invoke();
        return new { ok = true, scriptPrepared = client.ScriptPrepared, scriptPlaying = client.ScriptPlaying, scriptPositionMs = client.ScriptPositionMs,
            supportsScriptLoop = client.SupportsScriptLoop, scriptLoop = client.ScriptLoop };
    }

    private void ConfigureVendorClient()
    {
        _vendor = _vendorFactory?.Invoke(_output) ?? new VendorDeviceOutput(_output.Type.ToString(), _output.Device);
        _vendorConfiguration = DeviceProtocolOptions.Clone(_output.Device);
    }

    private async Task EnsureVendorClientConfiguredAsync()
    {
        if (_vendor is not null && DeviceProtocolOptions.Equivalent(_vendorConfiguration, _output.Device)) return;
        if (_vendor is not null) await _vendor.DisposeAsync();
        ConfigureVendorClient();
    }

    private void ConfigureIntifaceClient()
    {
        _intiface = new IntifaceOutputClient(new IntifaceConfig
        {
            Enabled = _output.Enabled,
            ManageEngineProcess = _output.ManageEngineProcess,
            WebsocketAddress = _output.WebsocketAddress,
            Port = _output.Port,
            VibrationAxis = _output.VibrationAxis,
            FeatureRoutes = Sensa.Outputs.Intiface.IntifaceFeatureRoute.CloneAndValidate(_output.IntifaceFeatures),
        });
        _intiface.OnLog += message => _log($"[Intiface/{_output.Name}] {message}");
        _intiface.OnDebugLog += message => _logDebug($"[Output/Intiface/{_output.Name}] {message}");
        _intiface.DevicesChanged += HandleIntifaceDevicesChanged;
        _intifaceConfigKey = BuildIntifaceConfigKey();
    }

    private async Task EnsureIntifaceClientConfiguredAsync()
    {
        if (_output.Type != OutputDeviceType.Intiface)
            return;

        var nextConfigKey = BuildIntifaceConfigKey();
        if (_intiface is not null && string.Equals(_intifaceConfigKey, nextConfigKey, StringComparison.Ordinal))
            return;

        if (_intiface is not null)
            await _intiface.DisposeAsync();

        _intiface = null;
        _intifaceConfigKey = string.Empty;
        ConfigureIntifaceClient();
    }

    private string BuildIntifaceConfigKey() => $"{_output.WebsocketAddress}|{_output.Port}|{_output.ManageEngineProcess}|{_output.VibrationAxis}|{System.Text.Json.JsonSerializer.Serialize(_output.IntifaceFeatures)}";

    private void HandleIntifaceDevicesChanged() => _notifyChanged?.Invoke();
}

internal static class OutputConfigHelpers
{
    public static bool IsVendorOutput(OutputDeviceType type) =>
        type is OutputDeviceType.Handy or OutputDeviceType.Autoblow or OutputDeviceType.VacuGlide or OutputDeviceType.Lovense;
    public static bool IsTCodeOutput(OutputDeviceType type) =>
        type == OutputDeviceType.TCodeSerial || type == OutputDeviceType.TCodeUdp || type == OutputDeviceType.TCodeTcp;
}
