using Buttplug.Client;
using Buttplug.Core.Messages;
using Sensa.Config;
using Sensa.Core;
using Sensa.TransmitIntiface;
using Sensa.TransmitTCode;

public sealed class OutputRuntimeManager : IAsyncDisposable
{
    private readonly SaveFile _save;
    private readonly Action<string> _log;
    private readonly Action<string> _logError;
    private readonly object _sync = new();
    private readonly Dictionary<string, OutputRuntimeEntry> _runtimes = new(StringComparer.OrdinalIgnoreCase);

    public OutputRuntimeManager(SaveFile save, Action<string> log, Action<string> logError)
    {
        _save = save;
        _log = log;
        _logError = logError;
        RebuildRuntimes();
    }

    public void RebuildRuntimes()
    {
        List<OutputRuntimeEntry> oldRuntimes;
        lock (_sync)
        {
            oldRuntimes = _runtimes.Values.ToList();
            _runtimes.Clear();
            foreach (var output in _save.Outputs)
            {
                _runtimes[output.Id] = new OutputRuntimeEntry(_save, output, _log, _logError);
            }
        }

        foreach (var runtime in oldRuntimes)
        {
            runtime.DisposeAsync().AsTask().GetAwaiter().GetResult();
        }
    }

    public async Task ReloadAsync()
    {
        List<OutputRuntimeEntry> oldRuntimes;
        lock (_sync)
        {
            oldRuntimes = _runtimes.Values.ToList();
            _runtimes.Clear();
            foreach (var output in _save.Outputs)
            {
                _runtimes[output.Id] = new OutputRuntimeEntry(_save, output, _log, _logError);
            }
        }

        foreach (var runtime in oldRuntimes)
        {
            await runtime.DisposeAsync();
        }
    }

    public async Task ConnectEnabledAsync()
    {
        foreach (var output in _save.Outputs.Where(output => output.Enabled))
        {
            await ConnectAsync(output.Id);
        }
    }

    public async Task<bool> ConnectAsync(string outputId)
    {
        OutputRuntimeEntry? runtime;
        lock (_sync)
            _runtimes.TryGetValue(outputId, out runtime);

        if (runtime is null)
            return false;

        return await runtime.ConnectAsync();
    }

    public async Task DisconnectAsync(string outputId)
    {
        OutputRuntimeEntry? runtime;
        lock (_sync)
            _runtimes.TryGetValue(outputId, out runtime);

        if (runtime is not null)
            await runtime.DisconnectAsync();
    }

    public Task<bool> ConnectPrimaryAsync(OutputDeviceType type)
    {
        var output = _save.GetPrimaryOutput(type);
        return output is null ? Task.FromResult(false) : ConnectAsync(output.Id);
    }

    public Task DisconnectPrimaryAsync(OutputDeviceType type)
    {
        var output = _save.GetPrimaryOutput(type);
        return output is null ? Task.CompletedTask : DisconnectAsync(output.Id);
    }

    public async Task SendAsync(DeviceCommand cmd)
    {
        List<(OutputDeviceConfig Output, OutputRuntimeEntry Runtime)> activeRuntimes;
        lock (_sync)
        {
            activeRuntimes = _save.Outputs
                .Where(output => output.Enabled)
                .Select(output => (_runtimes.TryGetValue(output.Id, out var runtime) ? (Output: output, Runtime: runtime) : default))
                .Where(tuple => tuple.Runtime is not null)
                .Select(tuple => (tuple.Output, tuple.Runtime!))
                .ToList();
        }

        foreach (var (output, runtime) in activeRuntimes)
        {
            if (!output.Enabled || !runtime.IsConnected)
                continue;

            await runtime.SendAsync(cmd);
        }
    }

    public bool IsConnected(string? outputId)
    {
        if (string.IsNullOrWhiteSpace(outputId))
            return false;

        lock (_sync)
            return _runtimes.TryGetValue(outputId, out var runtime) && runtime.IsConnected;
    }

    public IReadOnlyList<ButtplugClientDevice> GetDevices(string? outputId)
    {
        if (string.IsNullOrWhiteSpace(outputId))
            return Array.Empty<ButtplugClientDevice>();

        lock (_sync)
            return _runtimes.TryGetValue(outputId, out var runtime)
                ? runtime.Devices
                : Array.Empty<ButtplugClientDevice>();
    }

    public async Task EmergencyStopAsync()
    {
        List<OutputRuntimeEntry> runtimes;
        lock (_sync)
            runtimes = _runtimes.Values.ToList();

        foreach (var runtime in runtimes)
        {
            await runtime.EmergencyStopAsync();
        }
    }

    public Task StartScanAsync(string outputId) =>
        TryGetRuntime(outputId)?.StartScanAsync() ?? Task.CompletedTask;

    public Task StopScanAsync(string outputId) =>
        TryGetRuntime(outputId)?.StopScanAsync() ?? Task.CompletedTask;

    public Task StartPrimaryScanAsync(OutputDeviceType type)
    {
        var output = _save.GetPrimaryOutput(type);
        return output is null ? Task.CompletedTask : StartScanAsync(output.Id);
    }

    public Task StopPrimaryScanAsync(OutputDeviceType type)
    {
        var output = _save.GetPrimaryOutput(type);
        return output is null ? Task.CompletedTask : StopScanAsync(output.Id);
    }

    public object[] BuildOverview()
    {
        return _save.Outputs.Select(output =>
        {
            var runtime = TryGetRuntime(output.Id);
            var devices = runtime?.Devices.Select(device => new
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
                connected = runtime?.IsConnected ?? false,
                profileId = SaveFileOutputHelpers.IsTCodeOutput(output.Type) ? output.MotionProfileId : null,
                profileName = SaveFileOutputHelpers.IsTCodeOutput(output.Type) ? _save.ResolveAxisProfileName(output.MotionProfileId) : null,
                summary = BuildSummary(output),
                devices,
            };
        }).ToArray();
    }

    public async ValueTask DisposeAsync()
    {
        List<OutputRuntimeEntry> runtimes;
        lock (_sync)
        {
            runtimes = _runtimes.Values.ToList();
            _runtimes.Clear();
        }

        foreach (var runtime in runtimes)
        {
            await runtime.DisposeAsync();
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

    private OutputRuntimeEntry? TryGetRuntime(string outputId)
    {
        lock (_sync)
            return _runtimes.TryGetValue(outputId, out var runtime) ? runtime : null;
    }
}

internal sealed class OutputRuntimeEntry : IAsyncDisposable
{
    private readonly SaveFile _save;
    private readonly OutputDeviceConfig _output;
    private readonly Action<string> _log;
    private readonly Action<string> _logError;
    private readonly TCodeSerial? _serial;
    private readonly TCodeUdp? _udp;
    private readonly TCodeTcp? _tcp;
    private readonly IntifaceTransmitter? _intiface;
    private IntifaceEngineHost? _intifaceHost;

    public OutputRuntimeEntry(SaveFile save, OutputDeviceConfig output, Action<string> log, Action<string> logError)
    {
        _save = save;
        _output = output;
        _log = log;
        _logError = logError;

        switch (_output.Type)
        {
            case OutputDeviceType.TCodeSerial:
                _serial = new TCodeSerial(_output, () => _save.ResolveMotionProfile(_output.MotionProfileId));
                break;
            case OutputDeviceType.TCodeUdp:
                _udp = new TCodeUdp(_output, () => _save.ResolveMotionProfile(_output.MotionProfileId));
                break;
            case OutputDeviceType.TCodeTcp:
                _tcp = new TCodeTcp(_output, () => _save.ResolveMotionProfile(_output.MotionProfileId));
                break;
            case OutputDeviceType.Intiface:
                _intiface = new IntifaceTransmitter(new IntifaceConfig
                {
                    Enabled = _output.Enabled,
                    ManageEngineProcess = _output.ManageEngineProcess,
                    WebsocketAddress = _output.WebsocketAddress,
                    Port = _output.Port,
                });
                _intiface.OnLog += message => _log($"[Intiface/{_output.Name}] {message}");
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
                    _serial?.Center(); // slow return to centre after connect
                    _log($"[Output] 已连接 {Label}: {_output.ComPort}");
                    return _serial?.IsConnected == true;
                case OutputDeviceType.TCodeUdp:
                    _udp?.Connect();
                    _udp?.Center();
                    _log($"[Output] 已连接 {Label}: {_output.Host}:{_output.Port}");
                    return _udp?.IsConnected == true;
                case OutputDeviceType.TCodeTcp:
                    _tcp?.Connect();
                    _tcp?.Center();
                    _log($"[Output] 已连接 {Label}: {_output.Host}:{_output.Port}");
                    return _tcp?.IsConnected == true;
                case OutputDeviceType.Intiface:
                    if (_output.ManageEngineProcess)
                    {
                        if (_intifaceHost?.IsRunning != true)
                        {
                            _intifaceHost?.Dispose();
                            _intifaceHost = new IntifaceEngineHost(_output.Port);
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
    }

    public Task SendAsync(DeviceCommand cmd)
    {
        switch (_output.Type)
        {
            case OutputDeviceType.TCodeSerial:
                _serial?.Send(cmd);
                break;
            case OutputDeviceType.TCodeUdp:
                _udp?.Send(cmd);
                break;
            case OutputDeviceType.TCodeTcp:
                _tcp?.Send(cmd);
                break;
            case OutputDeviceType.Intiface:
                return _intiface?.SendAsync(cmd) ?? Task.CompletedTask;
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

    public async ValueTask DisposeAsync()
    {
        switch (_output.Type)
        {
            case OutputDeviceType.TCodeSerial:
                _serial?.Center();
                _serial?.Dispose();
                break;
            case OutputDeviceType.TCodeUdp:
                _udp?.Center();
                _udp?.Dispose();
                break;
            case OutputDeviceType.TCodeTcp:
                _tcp?.Center();
                _tcp?.Dispose();
                break;
            case OutputDeviceType.Intiface:
                if (_intiface is not null)
                    await _intiface.DisposeAsync();
                _intifaceHost?.Dispose();
                _intifaceHost = null;
                break;
        }
    }

    private string Label => $"{_output.Name} ({_output.Id})";
}

internal static class SaveFileOutputHelpers
{
    public static bool IsTCodeOutput(OutputDeviceType type) =>
        type == OutputDeviceType.TCodeSerial || type == OutputDeviceType.TCodeUdp || type == OutputDeviceType.TCodeTcp;
}
