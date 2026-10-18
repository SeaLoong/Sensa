using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Outputs;
using Sensa.Runtime;

namespace Sensa.Application;

/// <summary>
/// Validates, disarms, applies and recovers a configuration change as one operation.
/// 将校验、关闭输入、应用及恢复配置集中为一次操作。
/// </summary>
public sealed class ConfigurationUpdate(
    AppConfig config,
    MotionRuntime runtime,
    OutputCoordinator outputs,
    Action<bool, bool> syncOsc,
    Action configureHub,
    Action<AppConfig> save,
    Action<string> log,
    SemaphoreSlim? mutationGate = null)
{
    private readonly SemaphoreSlim updateGate = mutationGate ?? new(1, 1);

    static Dictionary<string, OutputDeviceConfig> BuildOutputLookup(IEnumerable<OutputDeviceConfig> outputs)
    {
        return outputs
            .Where(output => output is not null && !string.IsNullOrWhiteSpace(output.Id))
            .ToDictionary(output => output.Id, StringComparer.OrdinalIgnoreCase);
    }

    static bool HasOutputTopologyChanges(AppConfig previousConfigSnapshot, AppConfig currentConfigSnapshot)
    {
        var previousOutputs = BuildOutputLookup(previousConfigSnapshot.Outputs);
        var currentOutputs = BuildOutputLookup(currentConfigSnapshot.Outputs);
        if (previousOutputs.Count != currentOutputs.Count)
            return true;

        foreach (var (outputId, currentOutput) in currentOutputs)
        {
            if (!previousOutputs.TryGetValue(outputId, out var previousOutput))
                return true;

            if (previousOutput.Type != currentOutput.Type)
                return true;
        }

        return false;
    }

    static bool HasOutputConnectionTargetChanged(OutputDeviceConfig? previousOutput, OutputDeviceConfig currentOutput)
    {
        if (previousOutput is null)
            return true;

        if (previousOutput.Type != currentOutput.Type)
            return true;

        return currentOutput.Type switch
        {
            OutputDeviceType.TCodeSerial => !string.Equals(
                NormalizeOutputComPort(previousOutput.ComPort),
                NormalizeOutputComPort(currentOutput.ComPort),
                StringComparison.Ordinal),

            OutputDeviceType.TCodeUdp =>
                !string.Equals(NormalizeOutputHost(previousOutput.Host, "127.0.0.1"), NormalizeOutputHost(currentOutput.Host, "127.0.0.1"), StringComparison.Ordinal)
                || NormalizeOutputPort(previousOutput.Port, 9999) != NormalizeOutputPort(currentOutput.Port, 9999),

            OutputDeviceType.TCodeTcp =>
                !string.Equals(NormalizeOutputHost(previousOutput.Host, "127.0.0.1"), NormalizeOutputHost(currentOutput.Host, "127.0.0.1"), StringComparison.Ordinal)
                || NormalizeOutputPort(previousOutput.Port, 9998) != NormalizeOutputPort(currentOutput.Port, 9998),

            OutputDeviceType.Intiface =>
                !string.Equals(
                    NormalizeOutputWebsocketAddress(previousOutput.WebsocketAddress, "ws://localhost:12345"),
                    NormalizeOutputWebsocketAddress(currentOutput.WebsocketAddress, "ws://localhost:12345"),
                    StringComparison.Ordinal)
                || NormalizeOutputPort(previousOutput.Port, 12345) != NormalizeOutputPort(currentOutput.Port, 12345)
                || previousOutput.ManageEngineProcess != currentOutput.ManageEngineProcess,

            _ => false,
        };
    }

    static string NormalizeOutputComPort(string? value) => (value ?? string.Empty).Trim().ToUpperInvariant();

    static string NormalizeOutputHost(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback.ToLowerInvariant() : value.Trim().ToLowerInvariant();

    static int NormalizeOutputPort(int value, int fallback) => value is > 0 and <= 65535 ? value : fallback;

    static string NormalizeOutputWebsocketAddress(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback.ToLowerInvariant() : value.Trim().ToLowerInvariant();

    static string NormalizeOscHubHost(string? value) => string.IsNullOrWhiteSpace(value) ? "127.0.0.1" : value.Trim().ToLowerInvariant();

    static int NormalizeOscHubPort(int value) => value is > 0 and <= 65535 ? value : 9002;

    static bool HasOscHubConfigChanged(OscReceiverConfig previous, OscReceiverConfig current)
    {
        var previousHub = previous.Hub ?? new OscHubConfig();
        var currentHub = current.Hub ?? new OscHubConfig();

        if (previousHub.Enabled != currentHub.Enabled
            || previousHub.Mode != currentHub.Mode
            || previousHub.FixedRateHz != currentHub.FixedRateHz
            || previousHub.ForwardAvatarChange != currentHub.ForwardAvatarChange)
        {
            return true;
        }

        var previousTargets = (previousHub.Targets ?? new List<OscHubTargetConfig>())
            .OrderBy(target => target.Id, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var currentTargets = (currentHub.Targets ?? new List<OscHubTargetConfig>())
            .OrderBy(target => target.Id, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (previousTargets.Length != currentTargets.Length)
            return true;

        for (var index = 0; index < previousTargets.Length; index++)
        {
            var left = previousTargets[index];
            var right = currentTargets[index];

            if (!string.Equals(left.Id, right.Id, StringComparison.OrdinalIgnoreCase)
                || !string.Equals(left.Name, right.Name, StringComparison.Ordinal)
                || left.Enabled != right.Enabled
                || !string.Equals(NormalizeOscHubHost(left.Host), NormalizeOscHubHost(right.Host), StringComparison.Ordinal)
                || NormalizeOscHubPort(left.Port) != NormalizeOscHubPort(right.Port))
            {
                return true;
            }
        }

        return false;
    }

    async Task ApplyOutputConfigChangesAsync(AppConfig previousConfigSnapshot)
    {
        var previousOutputs = BuildOutputLookup(previousConfigSnapshot.Outputs);
        var requiresReload = HasOutputTopologyChanges(previousConfigSnapshot, config);

        await outputs.RunStateChangeBatchAsync(async () =>
        {
            if (requiresReload)
                await outputs.ReloadAsync().ConfigureAwait(false);

            foreach (var output in config.Outputs)
            {
                previousOutputs.TryGetValue(output.Id, out var previousOutput);
                var isConnected = outputs.IsConnected(output.Id);

                if (!output.Enabled)
                {
                    if (isConnected)
                        await outputs.DisconnectAsync(output.Id).ConfigureAwait(false);
                    continue;
                }

                var needsReconnect = HasOutputConnectionTargetChanged(previousOutput, output);
                if (needsReconnect)
                {
                    if (isConnected)
                        await outputs.DisconnectAsync(output.Id).ConfigureAwait(false);

                    await outputs.ConnectAsync(output.Id).ConfigureAwait(false);
                    continue;
                }

                if (previousOutput is null || !previousOutput.Enabled)
                {
                    if (!isConnected)
                        await outputs.ConnectAsync(output.Id).ConfigureAwait(false);
                }
            }
        }).ConfigureAwait(false);
    }

    public async Task<AppConfig> ApplyAsync(AppConfig incoming)
    {
        await updateGate.WaitAsync();
        try { return await ApplyConfigUpdateCoreAsync(incoming); }
        finally { updateGate.Release(); }
    }

    async Task<AppConfig> ApplyConfigUpdateCoreAsync(AppConfig incoming)
    {
        var previousConfig = new AppConfig();
        previousConfig.CopyFrom(config);
        var previousOscEnabled = config.Osc.Enabled;
        var previousOscHost = config.Osc.ReceiverHost;
        var previousOscPort = config.Osc.ReceiverPort;
        var previousOscQueryEnabled = config.Osc.OscQueryEnabled;
        var previousOscQueryUrl = config.Osc.OscQueryUrl;

        var candidate = new AppConfig();
        candidate.CopyFrom(incoming);
        candidate.ValidateUniqueOutputTargets();
        candidate.ValidateOscQueryPolling();
        candidate.ValidateOscQueryReceiverService();
        candidate.ValidateOscHubTargets();

        runtime.SetInputActive(false);
        await outputs.EmergencyStopAsync();
        try
        {
            config.CopyFrom(candidate);
            runtime.RebuildProcessors();

            var receiverChanged = previousOscEnabled != config.Osc.Enabled
                || !string.Equals(previousOscHost, config.Osc.ReceiverHost, StringComparison.OrdinalIgnoreCase)
                || previousOscPort != config.Osc.ReceiverPort;
            var queryEnabledChanged = previousOscQueryEnabled != config.Osc.OscQueryEnabled;
            var queryChanged = !string.Equals(
                OscQueryClient.NormalizeUrl(previousOscQueryUrl),
                OscQueryClient.NormalizeUrl(config.Osc.OscQueryUrl),
                StringComparison.OrdinalIgnoreCase);
            var hubChanged = HasOscHubConfigChanged(previousConfig.Osc, config.Osc);

            if (hubChanged)
                configureHub();

            syncOsc(receiverChanged, queryEnabledChanged || queryChanged);
            await ApplyOutputConfigChangesAsync(previousConfig).ConfigureAwait(false);
            save(config);
            log("[Config] WebUI 配置已更新。 / Updated from WebUI.");
            return config;
        }
        catch
        {
            config.CopyFrom(previousConfig);
            runtime.RebuildProcessors();

            try
            {
                config.Osc.Enabled = previousOscEnabled;
                config.Osc.ReceiverHost = previousOscHost;
                config.Osc.ReceiverPort = previousOscPort;
                config.Osc.OscQueryEnabled = previousOscQueryEnabled;
                config.Osc.OscQueryUrl = previousOscQueryUrl;
                configureHub();
                syncOsc(true, true);
                outputs.RebuildConnections();
                await outputs.RunStateChangeBatchAsync(async () =>
                {
                    foreach (var output in config.Outputs.Where(output => output.Enabled))
                        await outputs.ConnectAsync(output.Id).ConfigureAwait(false);
                }).ConfigureAwait(false);
            }
            catch
            {
            }

            throw;
        }
    }


}
