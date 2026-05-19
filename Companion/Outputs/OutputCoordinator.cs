using Buttplug.Client;
using Buttplug.Core.Messages;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Outputs.Intiface;
using Sensa.Outputs.TCode;

namespace Sensa.Outputs;

public sealed class OutputCoordinator : IAsyncDisposable
{
    private readonly AppConfig _config;
    private readonly Action<string> _log;
    private readonly Action<string> _logDebug;
    private readonly Action<string> _logError;
    private readonly object _sync = new();
    private readonly Dictionary<string, OutputConnection> _connections = new(StringComparer.OrdinalIgnoreCase);
    private int _stateChangeBatchDepth;
    private bool _stateChangePending;

    public event Action? StateChanged;

    public OutputCoordinator(AppConfig config, Action<string> log, Action<string> logDebug, Action<string> logError)
    {
        _config = config;
        _log = log;
        _logDebug = logDebug;
        _logError = logError;
        RebuildConnections();
    }

    public void RebuildConnections()
    {
        List<OutputConnection> oldConnections;
        lock (_sync)
        {
            oldConnections = _connections.Values.ToList();
            _connections.Clear();
            foreach (var output in _config.Outputs)
            {
                _connections[output.Id] = new OutputConnection(_config, output, _log, _logDebug, _logError, NotifyStateChanged);
            }
        }

        foreach (var connection in oldConnections)
        {
            connection.DisposeAsync().AsTask().GetAwaiter().GetResult();
        }
    }

    public async Task ReloadAsync()
    {
        List<OutputConnection> oldConnections;
        lock (_sync)
        {
            oldConnections = _connections.Values.ToList();
            _connections.Clear();
            foreach (var output in _config.Outputs)
            {
                _connections[output.Id] = new OutputConnection(_config, output, _log, _logDebug, _logError, NotifyStateChanged);
            }
        }

        foreach (var connection in oldConnections)
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
        OutputConnection? connection;
        lock (_sync)
            _connections.TryGetValue(outputId, out connection);

        if (connection is null)
            return false;

        return await connection.ConnectAsync();
    }

    public async Task DisconnectAsync(string outputId)
    {
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
                .Where(output => output.Enabled)
                .Select(output => (_connections.TryGetValue(output.Id, out var connection) ? (Output: output, Connection: connection) : default))
                .Where(tuple => tuple.Connection is not null)
                .Select(tuple => (tuple.Output, tuple.Connection!))
                .ToList();
        }

        foreach (var (output, connection) in activeConnections)
        {
            if (!output.Enabled || !connection.IsConnected)
                continue;

            await connection.SendAsync(frame);
        }
    }

    public bool IsConnected(string? outputId)
    {
        if (string.IsNullOrWhiteSpace(outputId))
            return false;

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
        List<OutputConnection> connections;
        lock (_sync)
            connections = _connections.Values.ToList();

        foreach (var connection in connections)
        {
            await connection.EmergencyStopAsync();
        }

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
                positionFeatures = device.GetFeaturesWithOutput(OutputType.Position).Count(),
                vibrateFeatures = device.GetFeaturesWithOutput(OutputType.Vibrate).Count(),
            }).ToArray() ?? Array.Empty<object>();

            return new
            {
                id = output.Id,
                name = output.Name,
                type = output.Type,
                enabled = output.Enabled,
                connected = connection?.IsConnected ?? false,
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
                devices,
            };
        }).ToArray();
    }

    public async ValueTask DisposeAsync()
    {
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
    private readonly AppConfig _config;
    private readonly OutputDeviceConfig _output;
    private readonly Action<string> _log;
    private readonly Action<string> _logDebug;
    private readonly Action<string> _logError;
    private readonly Action? _notifyChanged;
    private readonly TCodeSerialOutput? _serial;
    private readonly TCodeUdpOutput? _udp;
    private readonly TCodeTcpOutput? _tcp;
    private readonly IntifaceOutputClient? _intiface;
    private EmbeddedIntifaceEngine? _intifaceHost;

    public OutputConnection(AppConfig config, OutputDeviceConfig output, Action<string> log, Action<string> logDebug, Action<string> logError, Action? notifyChanged)
    {
        _config = config;
        _output = output;
        _log = log;
        _logDebug = logDebug;
        _logError = logError;
        _notifyChanged = notifyChanged;

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
                _intiface = new IntifaceOutputClient(new IntifaceConfig
                {
                    Enabled = _output.Enabled,
                    ManageEngineProcess = _output.ManageEngineProcess,
                    WebsocketAddress = _output.WebsocketAddress,
                    Port = _output.Port,
                });
                _intiface.OnLog += message => _log($"[Intiface/{_output.Name}] {message}");
                _intiface.OnDebugLog += message => _logDebug($"[Output/Intiface/{_output.Name}] {message}");
                _intiface.DevicesChanged += () => _notifyChanged?.Invoke();
                break;
        }
    }

    public bool IsConnected => _output.Type switch
    {
        OutputDeviceType.TCodeSerial => _serial?.IsConnected == true,
        OutputDeviceType.TCodeUdp => _udp?.IsConnected == true,
        OutputDeviceType.TCodeTcp => _tcp?.IsConnected == true,
        OutputDeviceType.Intiface => _intiface?.IsConnected == true,
        _ => false,
    };

    public IReadOnlyList<ButtplugClientDevice> Devices => _intiface?.Devices ?? Array.Empty<ButtplugClientDevice>();

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
        try
        {
            switch (_output.Type)
            {
                case OutputDeviceType.TCodeSerial:
                    if (string.IsNullOrWhiteSpace(_output.ComPort))
                        return false;
                    _serial?.Connect();
                    _serial?.Center();
                    _log($"[Output] 已连接 {Label}: {_output.ComPort}");
                    _notifyChanged?.Invoke();
                    return _serial?.IsConnected == true;
                case OutputDeviceType.TCodeUdp:
                    _udp?.Connect();
                    _udp?.Center();
                    _log($"[Output] 已连接 {Label}: {_output.Host}:{_output.Port}");
                    _notifyChanged?.Invoke();
                    return _udp?.IsConnected == true;
                case OutputDeviceType.TCodeTcp:
                    _tcp?.Connect();
                    _tcp?.Center();
                    _log($"[Output] 已连接 {Label}: {_output.Host}:{_output.Port}");
                    _notifyChanged?.Invoke();
                    return _tcp?.IsConnected == true;
                case OutputDeviceType.Intiface:
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
        }

        _log($"[Output] 已断开 {Label}");
        _notifyChanged?.Invoke();
    }

    public Task SendAsync(MotionFrame frame)
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
        }

        return Task.CompletedTask;
    }

    public async Task EmergencyStopAsync()
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
                _intifaceHost?.Dispose();
                _intifaceHost = null;
                break;
        }

        _notifyChanged?.Invoke();
    }

    private string Label => $"{_output.Name} ({_output.Id})";
}

internal static class OutputConfigHelpers
{
    public static bool IsTCodeOutput(OutputDeviceType type) =>
        type == OutputDeviceType.TCodeSerial || type == OutputDeviceType.TCodeUdp || type == OutputDeviceType.TCodeTcp;
}
