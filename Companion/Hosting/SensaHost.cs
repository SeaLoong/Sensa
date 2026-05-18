using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Ports;
using System.Management;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Buttplug.Core.Messages;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Win32;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Input.Script;
using Sensa.Motion;
using Sensa.Outputs;
using Sensa.Recording;
using Sensa.Runtime;

namespace Sensa.Hosting;

public static class SensaHost
{
    // Sensa is Windows-only (WMI + Registry for serial port enumeration)
#pragma warning disable CA1416
    private const int ManualDefaultSpeed = 999;
    private const int ManualDefaultIntervalMs = 100;
    private const int ManualIntervalMaxMs = 1000;

    public static async Task RunAsync(string[] args)
    {
        Console.Title = "Sensa";
        Console.WriteLine("Sensa Web Service starting…");

        var config = AppConfig.Load();
        config.NormalizeForRuntime();
        var uiUrl = $"http://{config.WebUi.Host}:{config.WebUi.Port}";

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            WebRootPath = "web",
        });
        builder.WebHost.UseUrls(uiUrl);
        builder.Services.Configure<JsonOptions>(options =>
        {
            options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
            options.SerializerOptions.WriteIndented = true;
        });

        var wsJsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        wsJsonOptions.Converters.Add(new JsonStringEnumConverter());

        var app = builder.Build();

        var logBuffer = new RuntimeLogBuffer();
        void Log(string message) => LogEntry(message, RuntimeLogLevel.Info);
        void LogDebug(string message) => LogEntry(message, RuntimeLogLevel.Debug);
        void LogError(string message) => LogEntry(message, RuntimeLogLevel.Error);

        void LogEntry(string message, RuntimeLogLevel level)
        {
            logBuffer.Add(message, level);
            if (level >= RuntimeLogLevel.Warning)
                Console.Error.WriteLine(message);
            else
                Console.WriteLine(message);
        }

        var parameterStore = new OscParameterStore();
        var oscReceiver = new OscInputReceiver(parameterStore, config.Osc.ReceiverHost, config.Osc.ReceiverPort);
        var oscQueryClient = new OscQueryClient();
        var recorder = new MotionRecorder();
        var scriptPlayer = new FunscriptPlayer();
        var outputCoordinator = new OutputCoordinator(config, Log, LogDebug, LogError);
        string? selectedOscSourceKey = null;

        string? ResolvePreferredOscSourceKeyForRuntime()
        {
            var sources = parameterStore.SnapshotSources();
            if (sources.Length <= 1)
                return null;

            if (!string.IsNullOrWhiteSpace(selectedOscSourceKey)
                && sources.Any(source => string.Equals(source.Key, selectedOscSourceKey, StringComparison.Ordinal)))
            {
                return selectedOscSourceKey;
            }

            if (!string.IsNullOrWhiteSpace(config.Osc.PreferredSourcePersistentId))
            {
                var matched = sources.FirstOrDefault(source => string.Equals(source.PersistentId, config.Osc.PreferredSourcePersistentId, StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrWhiteSpace(matched.Key))
                    return matched.Key;
            }

            return null;
        }

        var motionRuntime = new MotionRuntime(
            config,
            parameterStore,
            oscReceiver,
            recorder: recorder,
            scriptPlayer: scriptPlayer,
            sendOutputsAsync: outputCoordinator.SendAsync,
            emergencyStopAsync: outputCoordinator.EmergencyStopAsync,
            preferredOscSourceKeyProvider: ResolvePreferredOscSourceKeyForRuntime);
        motionRuntime.OnLog += Log;
        motionRuntime.OnDebugLog += message => LogEntry(message, RuntimeLogLevel.Debug);

        var wsClients = new ConcurrentDictionary<string, WebSocketClientSession>();
        var wsShutdown = new CancellationTokenSource();
        var oscQueryRefreshGate = new SemaphoreSlim(1, 1);
        var oscQueryRefreshQueued = 0;
        var oscQueryRefreshGateDisposed = 0;
        var oscPreviewStatePushQueued = 0;
        string? oscListenerError = null;

        object BuildStateEnvelope() => new
        {
            type = "state",
            data = BuildOverviewSnapshot(),
            logs = logBuffer.Snapshot(50),
        };

        void DisposeOscQueryRefreshGate()
        {
            if (Interlocked.Exchange(ref oscQueryRefreshGateDisposed, 1) != 0)
                return;

            oscQueryRefreshGate.Dispose();
        }

        void RemoveWsClient(string clientId)
        {
            if (wsClients.TryRemove(clientId, out var client))
                client.RequestStop();
        }

        async Task CloseWsSocketAsync(WebSocketClientSession client, WebSocketCloseStatus status, string description, bool abortAfterClose = false)
        {
            client.RequestStop();

            try
            {
                using var timeout = new CancellationTokenSource(abortAfterClose ? TimeSpan.FromMilliseconds(200) : TimeSpan.FromMilliseconds(1000));

                switch (client.Socket.State)
                {
                    case WebSocketState.Open when abortAfterClose:
                        await client.Socket.CloseOutputAsync(status, description, timeout.Token).ConfigureAwait(false);
                        break;
                    case WebSocketState.Open:
                    case WebSocketState.CloseReceived:
                        await client.Socket.CloseAsync(status, description, timeout.Token).ConfigureAwait(false);
                        break;
                }
            }
            catch
            {
            }

            if (abortAfterClose && client.Socket.State is not (WebSocketState.Closed or WebSocketState.None or WebSocketState.Aborted))
            {
                try { client.Socket.Abort(); } catch { }
            }
        }

        async Task CloseWsClientAsync(string clientId, WebSocketClientSession client, WebSocketCloseStatus status, string description, bool abortAfterClose = false)
        {
            if (!wsClients.TryRemove(clientId, out _))
                return;

            await CloseWsSocketAsync(client, status, description, abortAfterClose).ConfigureAwait(false);
        }

        async Task CloseAllWsClientsAsync(WebSocketCloseStatus status, string description, bool abortAfterClose = false)
        {
            wsShutdown.Cancel();

            var snapshot = wsClients.ToArray();
            if (snapshot.Length == 0)
                return;

            await Task.WhenAll(snapshot.Select(entry => CloseWsClientAsync(entry.Key, entry.Value, status, description, abortAfterClose))).ConfigureAwait(false);
        }

        void QueueClientStatePush(string clientId)
        {
            if (!wsClients.TryGetValue(clientId, out var client))
                return;

            client.MarkPending();
            _ = FlushClientStateAsync(clientId, client);
        }

        async Task FlushClientStateAsync(string clientId, WebSocketClientSession client)
        {
            if (!await client.Gate.WaitAsync(0))
                return;

            try
            {
                while (client.ConsumePending())
                {
                    if (client.IsStopRequested || client.Socket.State != WebSocketState.Open)
                    {
                        RemoveWsClient(clientId);
                        return;
                    }

                    var payloadJson = JsonSerializer.Serialize(BuildStateEnvelope(), wsJsonOptions);
                    var payloadBytes = Encoding.UTF8.GetBytes(payloadJson);
                    await client.Socket.SendAsync(payloadBytes, WebSocketMessageType.Text, true, client.ConnectionToken).ConfigureAwait(false);
                }
            }
            catch
            {
                RemoveWsClient(clientId);
            }
            finally
            {
                client.Gate.Release();
            }
        }

        void NotifyStateChanged()
        {
            foreach (var clientId in wsClients.Keys)
                QueueClientStatePush(clientId);
        }

        void QueueOscPreviewStateChanged()
        {
            if (wsShutdown.IsCancellationRequested)
                return;

            if (Interlocked.Exchange(ref oscPreviewStatePushQueued, 1) != 0)
                return;

            _ = Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(50, wsShutdown.Token).ConfigureAwait(false);
                    NotifyStateChanged();
                }
                catch (OperationCanceledException) when (wsShutdown.IsCancellationRequested)
                {
                }
                finally
                {
                    Interlocked.Exchange(ref oscPreviewStatePushQueued, 0);
                }
            });
        }

        bool ShouldRunOscListener() => motionRuntime.CurrentInputMode == RuntimeInputMode.Osc;

        string? ResolveSelectedOscSourceKey(OscParameterStore.SourceSnapshot[] sources)
        {
            if (sources.Length <= 1)
                return null;

            if (!string.IsNullOrWhiteSpace(selectedOscSourceKey)
                && sources.Any(source => string.Equals(source.Key, selectedOscSourceKey, StringComparison.Ordinal)))
            {
                return selectedOscSourceKey;
            }

            if (!string.IsNullOrWhiteSpace(config.Osc.PreferredSourcePersistentId))
            {
                var matched = sources.FirstOrDefault(source => string.Equals(source.PersistentId, config.Osc.PreferredSourcePersistentId, StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrWhiteSpace(matched.Key))
                    return matched.Key;
            }

            return null;
        }

        object SetOscSourceSelectionCore(string? sourceKey)
        {
            var normalizedSourceKey = string.IsNullOrWhiteSpace(sourceKey) ? null : sourceKey.Trim();
            selectedOscSourceKey = normalizedSourceKey;

            var snapshotSources = parameterStore.SnapshotSources();
            var selectedSource = snapshotSources.FirstOrDefault(source => string.Equals(source.Key, normalizedSourceKey, StringComparison.Ordinal));
            config.Osc.PreferredSourcePersistentId = string.IsNullOrWhiteSpace(selectedSource.PersistentId) ? string.Empty : selectedSource.PersistentId;
            config.Save();

            NotifyStateChanged();
            return new
            {
                ok = true,
                sourceKey = normalizedSourceKey,
                persisted = !string.IsNullOrWhiteSpace(config.Osc.PreferredSourcePersistentId),
            };
        }

        async Task<OscQuerySnapshot> RefreshOscQueryCoreAsync(bool logResult)
        {
            var normalizedUrl = config.Osc.OscQueryEnabled
                ? OscQueryClient.NormalizeUrl(config.Osc.OscQueryUrl)
                : string.Empty;
            await oscQueryRefreshGate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (string.IsNullOrWhiteSpace(normalizedUrl))
                {
                    await oscQueryClient.StopListeningAsync().ConfigureAwait(false);
                    oscQueryClient.Clear();
                    return oscQueryClient.Snapshot;
                }

                var snapshot = await oscQueryClient.RefreshAsync(normalizedUrl, wsShutdown.Token).ConfigureAwait(false);
                await SyncOscQueryListenAsync(snapshot).ConfigureAwait(false);

                if (logResult)
                {
                    if (!string.IsNullOrWhiteSpace(snapshot.Error))
                        LogError($"[OSCQuery] Sync failed: {snapshot.Error}");
                    else
                        Log($"[OSCQuery] Synced {snapshot.Nodes.Count} paths from {(string.IsNullOrWhiteSpace(snapshot.Name) ? snapshot.Url : snapshot.Name)}.");
                }

                return snapshot;
            }
            finally
            {
                oscQueryRefreshGate.Release();
            }
        }

        async Task SyncOscQueryListenAsync(OscQuerySnapshot snapshot)
        {
            try
            {
                if (ShouldRunOscListener() && snapshot.SupportsListen)
                    await oscQueryClient.StartListeningAsync(wsShutdown.Token).ConfigureAwait(false);
                else
                    await oscQueryClient.StopListeningAsync().ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (wsShutdown.IsCancellationRequested)
            {
            }
            catch (Exception ex)
            {
                LogError($"[OSCQuery] LISTEN connect failed: {ex.Message}");
            }
        }

        void QueueOscQueryListenSync()
        {
            var snapshot = oscQueryClient.Snapshot;
            _ = Task.Run(async () =>
            {
                await SyncOscQueryListenAsync(snapshot).ConfigureAwait(false);
                NotifyStateChanged();
            });
        }

        void QueueOscQueryRefresh(bool logResult = false)
        {
            if (Interlocked.Exchange(ref oscQueryRefreshQueued, 1) != 0)
                return;

            _ = Task.Run(async () =>
            {
                try
                {
                    await RefreshOscQueryCoreAsync(logResult).ConfigureAwait(false);
                    NotifyStateChanged();
                }
                catch (OperationCanceledException)
                {
                }
                catch (Exception ex)
                {
                    LogError($"[OSCQuery] Sync failed: {ex.Message}");
                    NotifyStateChanged();
                }
                finally
                {
                    Interlocked.Exchange(ref oscQueryRefreshQueued, 0);
                }
            });
        }

        void SyncOscServices(bool forceReceiverReconfigure = false, bool forceQueryRefresh = false)
        {
            var shouldListen = ShouldRunOscListener();

            if (!shouldListen)
            {
                oscListenerError = null;
                if (oscReceiver.IsRunning)
                {
                    oscReceiver.Stop();
                    Log("[OSC] Listener stopped.");
                }

                QueueOscQueryListenSync();
            }
            else if (!oscReceiver.IsRunning)
            {
                try
                {
                    oscReceiver.Start();
                    oscListenerError = null;
                    Log($"[OSC] Listening on {config.Osc.ReceiverHost}:{config.Osc.ReceiverPort}");
                }
                catch (Exception ex)
                {
                    oscListenerError = $"无法监听 {config.Osc.ReceiverHost}:{config.Osc.ReceiverPort}：{ex.Message}";
                    throw new InvalidOperationException(oscListenerError, ex);
                }
            }
            else if (forceReceiverReconfigure
                || !string.Equals(oscReceiver.Host, config.Osc.ReceiverHost, StringComparison.OrdinalIgnoreCase)
                || oscReceiver.Port != config.Osc.ReceiverPort)
            {
                try
                {
                    oscReceiver.Reconfigure(config.Osc.ReceiverHost, config.Osc.ReceiverPort);
                    oscListenerError = null;
                    Log($"[OSC] Listening on {config.Osc.ReceiverHost}:{config.Osc.ReceiverPort}");
                }
                catch (Exception ex)
                {
                    oscListenerError = $"无法监听 {config.Osc.ReceiverHost}:{config.Osc.ReceiverPort}：{ex.Message}";
                    throw new InvalidOperationException(oscListenerError, ex);
                }
            }
            else
            {
                oscListenerError = null;
            }

            var normalizedUrl = config.Osc.OscQueryEnabled
                ? OscQueryClient.NormalizeUrl(config.Osc.OscQueryUrl)
                : string.Empty;
            if (string.IsNullOrWhiteSpace(normalizedUrl))
            {
                oscQueryClient.Clear();
                QueueOscQueryListenSync();
                return;
            }

            var shouldRefreshQuery = shouldListen
                && (forceQueryRefresh
                    || !string.Equals(oscQueryClient.Snapshot.Url, normalizedUrl, StringComparison.OrdinalIgnoreCase)
                    || oscQueryClient.Snapshot.Nodes.Count == 0
                    || !string.IsNullOrWhiteSpace(oscQueryClient.Snapshot.Error));

            if (shouldRefreshQuery)
            {
                QueueOscQueryRefresh(forceQueryRefresh);
            }
            else
            {
                QueueOscQueryListenSync();
            }
        }

        void HandleRuntimeStateChanged()
        {
            try
            {
                SyncOscServices();
            }
            catch (Exception ex)
            {
                LogError($"[OSC] {ex.Message}");
            }

            NotifyStateChanged();
        }

        oscQueryClient.ValueReceived += (path, value, source) =>
        {
            parameterStore.Set(path, value, source);
        };
        parameterStore.OnSetWithSource += (_, _, _) => QueueOscPreviewStateChanged();
        oscQueryClient.AvatarChanged += () =>
        {
            parameterStore.Clear();
            NotifyStateChanged();
        };
        oscQueryClient.StructureChanged += () => QueueOscQueryRefresh();
        oscQueryClient.ListenStateChanged += NotifyStateChanged;

        motionRuntime.StateChanged += HandleRuntimeStateChanged;
        outputCoordinator.StateChanged += NotifyStateChanged;
        logBuffer.EntryAdded += _ => NotifyStateChanged();

        Task<bool> ConnectTCodeAsync() => outputCoordinator.ConnectPrimaryAsync(OutputDeviceType.TCodeSerial);
        Task DisconnectTCodeAsync() => outputCoordinator.DisconnectPrimaryAsync(OutputDeviceType.TCodeSerial);
        Task<bool> ConnectTCodeUdpAsync() => outputCoordinator.ConnectPrimaryAsync(OutputDeviceType.TCodeUdp);
        Task DisconnectTCodeUdpAsync() => outputCoordinator.DisconnectPrimaryAsync(OutputDeviceType.TCodeUdp);
        Task<bool> ConnectTCodeTcpAsync() => outputCoordinator.ConnectPrimaryAsync(OutputDeviceType.TCodeTcp);
        Task DisconnectTCodeTcpAsync() => outputCoordinator.DisconnectPrimaryAsync(OutputDeviceType.TCodeTcp);
        Task<bool> ConnectIntifaceAsync() => outputCoordinator.ConnectPrimaryAsync(OutputDeviceType.Intiface);
        Task DisconnectIntifaceAsync() => outputCoordinator.DisconnectPrimaryAsync(OutputDeviceType.Intiface);
        Task<bool> ConnectOutputAsync(string outputId) => outputCoordinator.ConnectAsync(outputId);
        Task DisconnectOutputAsync(string outputId) => outputCoordinator.DisconnectAsync(outputId);

        async Task<AppConfig> ApplyConfigUpdateAsync(AppConfig incoming)
        {
            var previousConfig = new AppConfig();
            previousConfig.CopyFrom(config);
            var previousOscHost = config.Osc.ReceiverHost;
            var previousOscPort = config.Osc.ReceiverPort;
            var previousOscQueryEnabled = config.Osc.OscQueryEnabled;
            var previousOscQueryUrl = config.Osc.OscQueryUrl;

            var candidate = new AppConfig();
            candidate.CopyFrom(incoming);
            candidate.ValidateUniqueOutputTargets();

            config.CopyFrom(candidate);
            motionRuntime.RebuildProcessors();

            var receiverChanged = !string.Equals(previousOscHost, config.Osc.ReceiverHost, StringComparison.OrdinalIgnoreCase)
                || previousOscPort != config.Osc.ReceiverPort;
            var queryEnabledChanged = previousOscQueryEnabled != config.Osc.OscQueryEnabled;
            var queryChanged = !string.Equals(
                OscQueryClient.NormalizeUrl(previousOscQueryUrl),
                OscQueryClient.NormalizeUrl(config.Osc.OscQueryUrl),
                StringComparison.OrdinalIgnoreCase);

            try
            {
                SyncOscServices(forceReceiverReconfigure: receiverChanged, forceQueryRefresh: queryEnabledChanged || queryChanged);
                await outputCoordinator.ReloadAsync().ConfigureAwait(false);
                await outputCoordinator.ConnectEnabledAsync().ConfigureAwait(false);
                config.Save();
                Log("[Config] Updated from WebUI.");
                NotifyStateChanged();
                return config;
            }
            catch
            {
                config.CopyFrom(previousConfig);
                motionRuntime.RebuildProcessors();

                try
                {
                    config.Osc.ReceiverHost = previousOscHost;
                    config.Osc.ReceiverPort = previousOscPort;
                    config.Osc.OscQueryEnabled = previousOscQueryEnabled;
                    config.Osc.OscQueryUrl = previousOscQueryUrl;
                    SyncOscServices(forceReceiverReconfigure: true, forceQueryRefresh: true);
                }
                catch
                {
                }

                throw;
            }
        }

        object SetInputActiveCore(bool active)
        {
            motionRuntime.SetInputActive(active);
            SyncOscServices();
            return new { ok = true, active = motionRuntime.InputActive, oscListening = oscReceiver.IsRunning };
        }

        object SetInputModeCore(string modeText)
        {
            if (!Enum.TryParse<RuntimeInputMode>(modeText, ignoreCase: true, out var mode))
                throw new InvalidOperationException($"Unknown input mode: {modeText}");

            motionRuntime.SetInputMode(mode);
            SyncOscServices();
            return new { ok = true, mode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant(), oscListening = oscReceiver.IsRunning };
        }

        object ApplyManualInputCore(ManualInputRequest request)
        {
            var requestedCommandMode = NormalizeManualMotionMode(request.MotionMode);
            var requestedMotionValue = NormalizeManualMotionValue(requestedCommandMode, request.MotionValue);
            var frame = new MotionFrame
            {
                L0 = NormalizeManualInputValue(request.L0),
                R0 = NormalizeManualInputValue(request.R0),
                R1 = NormalizeManualInputValue(request.R1),
                R2 = NormalizeManualInputValue(request.R2),
                L1 = NormalizeManualInputValue(request.L1),
                L2 = NormalizeManualInputValue(request.L2),
                V0 = NormalizeManualInputValue(request.V0),
                V1 = NormalizeManualInputValue(request.V1),
                V2 = NormalizeManualInputValue(request.V2),
                A0 = NormalizeManualInputValue(request.A0),
                A1 = NormalizeManualInputValue(request.A1),
                A2 = NormalizeManualInputValue(request.A2),
                RequestedCommandMode = requestedCommandMode,
                RequestedMotionValue = requestedMotionValue,
            };

            if (request.Enabled)
            {
                motionRuntime.SetManualOverride(frame);
                motionRuntime.SetInputMode(RuntimeInputMode.Manual);
                LogDebug($"[Input/Manual] raw L0={request.L0} R0={request.R0} R1={request.R1} R2={request.R2} L1={request.L1} L2={request.L2} V0={request.V0} V1={request.V1} V2={request.V2} A0={request.A0} A1={request.A1} A2={request.A2} motionMode={(requestedCommandMode?.ToString() ?? "profile")} motionValue={(requestedMotionValue?.ToString() ?? "profile")}");
            }
            else
            {
                motionRuntime.ClearManualOverride();
                LogDebug("[Input/Manual] Cleared");
            }

            return new
            {
                ok = true,
                inputMode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant(),
                command = motionRuntime.ManualOverrideCommand,
            };
        }

        object ClearManualInputCore()
        {
            motionRuntime.ClearManualOverride();
            return new
            {
                ok = true,
                inputMode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant(),
            };
        }

        async Task<object> LoadScriptFromStreamCoreAsync(string fileName, Stream content, bool loop, double speed)
        {
            scriptPlayer.Load(fileName, content);
            scriptPlayer.Configure(loop: loop, speed: speed);
            motionRuntime.SetInputMode(RuntimeInputMode.Script);
            Log($"[Input/Script] Loaded: {fileName}");

            return await Task.FromResult(new
            {
                ok = true,
                inputMode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant(),
                script = scriptPlayer.GetSnapshot(),
            }).ConfigureAwait(false);
        }

        async Task<object> LoadScriptFromTextCoreAsync(ScriptUploadRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.FileName))
                throw new InvalidOperationException("请先选择脚本文件。");
            if (string.IsNullOrWhiteSpace(request.Content))
                throw new InvalidOperationException("脚本内容为空。");

            var buffer = Encoding.UTF8.GetBytes(request.Content);
            await using var stream = new MemoryStream(buffer, writable: false);
            return await LoadScriptFromStreamCoreAsync(request.FileName, stream, request.Loop ?? false, request.Speed ?? 1.0).ConfigureAwait(false);
        }

        object PlayScriptCore(ScriptPlaybackRequest request)
        {
            var snapshot = scriptPlayer.Play(request.Restart, request.Loop, request.Speed);
            motionRuntime.SetInputMode(RuntimeInputMode.Script);
            Log($"[Input/Script] Playback started: {snapshot.FileName}");
            return new
            {
                ok = true,
                inputMode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant(),
                script = snapshot,
            };
        }

        object PauseScriptCore()
        {
            var snapshot = scriptPlayer.Pause();
            Log("[Input/Script] Playback paused.");
            return new { ok = true, script = snapshot };
        }

        object StopScriptCore()
        {
            var snapshot = scriptPlayer.Stop();
            Log("[Input/Script] Playback stopped.");
            return new { ok = true, script = snapshot };
        }

        object ConfigureScriptCore(ScriptConfigureRequest request)
        {
            var snapshot = scriptPlayer.Configure(request.Loop, request.Speed);
            LogDebug($"[Input/Script] Settings updated: loop={snapshot.Loop} speed={snapshot.Speed:0.##}x");
            return new { ok = true, script = snapshot };
        }

        object SeekScriptCore(ScriptSeekRequest request)
        {
            var snapshot = scriptPlayer.Seek(request.PositionMs);
            LogDebug($"[Input/Script] Seek: {snapshot.PositionMs}ms");
            return new { ok = true, script = snapshot };
        }

        object ClearScriptCore()
        {
            var snapshot = scriptPlayer.Clear();
            Log("[Input/Script] Cleared current script.");
            return new { ok = true, script = snapshot };
        }

        async Task<object> RefreshOscQueryResultAsync()
        {
            if (string.IsNullOrWhiteSpace(OscQueryClient.NormalizeUrl(config.Osc.OscQueryUrl)))
                throw new InvalidOperationException("请先填写 OSCQuery 地址。");

            var snapshot = await RefreshOscQueryCoreAsync(logResult: true).ConfigureAwait(false);
            NotifyStateChanged();
            if (!string.IsNullOrWhiteSpace(snapshot.Error))
                throw new InvalidOperationException(snapshot.Error);

            return new { ok = true, query = snapshot };
        }

        object BuildOverviewSnapshot()
        {
            var command = motionRuntime.LastCommand;
            var scriptSnapshot = scriptPlayer.GetSnapshot();
            var serialOutput = config.GetPrimaryOutput(OutputDeviceType.TCodeSerial);
            var udpOutput = config.GetPrimaryOutput(OutputDeviceType.TCodeUdp);
            var tcpOutput = config.GetPrimaryOutput(OutputDeviceType.TCodeTcp);
            var intifaceOutput = config.GetPrimaryOutput(OutputDeviceType.Intiface);
            var oscSourceSnapshots = parameterStore.SnapshotSources();
            var effectiveSelectedSourceKey = ResolveSelectedOscSourceKey(oscSourceSnapshots);
            var oscPreview = parameterStore.SnapshotEntries()
                .GroupBy(entry => entry.Entry.Source.Key, StringComparer.Ordinal)
                .SelectMany(group => group
                    .OrderByDescending(entry => entry.Entry.TimestampMs)
                    .Take(24))
                .OrderByDescending(entry => entry.Entry.TimestampMs)
                .Select(entry => new
                {
                    path = entry.Path,
                    type = entry.Entry.Value.Type.ToString().ToLowerInvariant(),
                    value = FormatOscPreviewValue(entry.Entry.Value),
                    numericValue = entry.Entry.Value.AsFloat(),
                    entry.Entry.TimestampMs,
                    sourceKey = entry.Entry.Source.Key,
                    sourceLabel = entry.Entry.Source.Label,
                    sourcePersistentId = entry.Entry.Source.PersistentId,
                    sourceAddress = entry.Entry.Source.Address,
                    sourcePort = entry.Entry.Source.Port,
                })
                .ToArray();
            var oscQuerySnapshot = oscQueryClient.Snapshot;
            var devices = outputCoordinator.GetDevices(intifaceOutput?.Id).Select(device => new
            {
                name = device.Name,
                index = device.Index,
                positionFeatures = device.GetFeaturesWithOutput(OutputType.Position).Count(),
                vibrateFeatures = device.GetFeaturesWithOutput(OutputType.Vibrate).Count(),
            }).ToArray();
            var outputs = outputCoordinator.BuildOverview();
            var runtimeState = new
            {
                isEmergency = motionRuntime.IsEmergency,
                motionRuntime.ManualOverrideEnabled,
                inputActive = motionRuntime.InputActive,
                inputMode = motionRuntime.CurrentInputMode,
                command,
                manualCommand = motionRuntime.ManualOverrideCommand,
            };

            return new
            {
                runtime = runtimeState,
                loop = runtimeState,
                input = new
                {
                    mode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant(),
                    script = scriptSnapshot,
                },
                osc = new
                {
                    config.Osc.ReceiverHost,
                    config.Osc.ReceiverPort,
                    listening = oscReceiver.IsRunning,
                    listenerError = oscListenerError,
                    preview = oscPreview,
                    sources = oscSourceSnapshots.Select(source => new
                    {
                        key = source.Key,
                        label = source.Label,
                        persistentId = source.PersistentId,
                        address = source.Address,
                        port = source.Port,
                        parameterCount = source.ParameterCount,
                        source.LastSeenTimestampMs,
                        canPersistSelection = !string.IsNullOrWhiteSpace(source.PersistentId),
                    }).ToArray(),
                    selectedSourceKey = effectiveSelectedSourceKey,
                    preferredSourcePersistentId = config.Osc.PreferredSourcePersistentId,
                    query = new
                    {
                        enabled = config.Osc.OscQueryEnabled,
                        url = string.IsNullOrWhiteSpace(oscQuerySnapshot.Url) ? OscQueryClient.NormalizeUrl(config.Osc.OscQueryUrl) : oscQuerySnapshot.Url,
                        name = oscQuerySnapshot.Name,
                        oscIp = oscQuerySnapshot.OscIp,
                        oscPort = oscQuerySnapshot.OscPort,
                        oscTransport = oscQuerySnapshot.OscTransport,
                        supportsListen = oscQuerySnapshot.SupportsListen,
                        wsIp = oscQuerySnapshot.WsIp,
                        wsPort = oscQuerySnapshot.WsPort,
                        webSocketUrl = oscQuerySnapshot.WebSocketUrl,
                        listenConnected = oscQueryClient.IsListenConnected,
                        listeningPathCount = oscQueryClient.ListeningPathCount,
                        streamSourceLabel = oscQueryClient.ListenSource.Label,
                        streamSourcePersistentId = oscQueryClient.ListenSource.PersistentId,
                        refreshedAtUtc = oscQuerySnapshot.RefreshedAtUtc,
                        error = oscQuerySnapshot.Error,
                        nodes = oscQuerySnapshot.Nodes,
                    },
                },
                tcode = new
                {
                    connected = outputCoordinator.IsConnected(serialOutput?.Id),
                    config = config.TCode,
                },
                udpTCode = new
                {
                    connected = outputCoordinator.IsConnected(udpOutput?.Id),
                    config = config.UdpTCode,
                },
                tcpTCode = new
                {
                    connected = outputCoordinator.IsConnected(tcpOutput?.Id),
                    config = config.TcpTCode,
                },
                intiface = new
                {
                    connected = outputCoordinator.IsConnected(intifaceOutput?.Id),
                    config = config.Intiface,
                    devices,
                },
                outputs,
                recording = new
                {
                    recorder.IsActive,
                    recorder.FrameCount,
                },
                signals = config.Signals.Select((signal, index) =>
                {
                    var hasLatest = parameterStore.TryGetLatest(signal.OscPath, effectiveSelectedSourceKey, out var matchedPath, out var entry);
                    return new
                    {
                        index,
                        signal,
                        latest = hasLatest
                            ? new
                            {
                                path = matchedPath,
                                value = entry.Value.AsFloat(),
                                entry.TimestampMs,
                                type = entry.Value.Type.ToString(),
                                sourceKey = entry.Source.Key,
                                sourceLabel = entry.Source.Label,
                                sourcePersistentId = entry.Source.PersistentId,
                            }
                            : null,
                    };
                }).ToArray(),
            };
        }

        object[] BuildSerialPortList()
        {
            try
            {
                var descriptions = ReadSerialPortDescriptions();

                return SerialPort.GetPortNames()
                    .Where(static name => !string.IsNullOrWhiteSpace(name))
                    .OrderBy(static name => name, StringComparer.OrdinalIgnoreCase)
                    .Select(name => new
                    {
                        portName = name,
                        description = descriptions.TryGetValue(name, out var description) ? description : null,
                    })
                    .ToArray<object>();
            }
            catch (Exception ex)
            {
                LogError($"[Meta] Failed to enumerate serial ports: {ex.Message}");
                return Array.Empty<object>();
            }
        }

        app.UseDefaultFiles();
        app.UseStaticFiles(new StaticFileOptions
        {
            OnPrepareResponse = context =>
            {
                var path = context.Context.Request.Path.Value ?? string.Empty;
                if (path.EndsWith(".html", StringComparison.OrdinalIgnoreCase)
                    || path.EndsWith("/app.js", StringComparison.OrdinalIgnoreCase)
                    || path.EndsWith("/styles.css", StringComparison.OrdinalIgnoreCase))
                {
                    context.Context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
                    context.Context.Response.Headers.Pragma = "no-cache";
                    context.Context.Response.Headers.Expires = "0";
                }
            },
        });
        app.UseWebSockets(new WebSocketOptions
        {
            KeepAliveInterval = TimeSpan.FromSeconds(10),
        });

        app.MapGet("/api/meta/serial-ports", () => Results.Ok(BuildSerialPortList()));
        app.MapGet("/api/config", () => Results.Ok(config));
        app.MapPut("/api/config", async (AppConfig incoming) =>
        {
            try
            {
                var updated = await ApplyConfigUpdateAsync(incoming).ConfigureAwait(false);
                return Results.Ok(updated);
            }
            catch (Exception ex)
            {
                LogError($"[Config] Update failed: {ex.Message}");
                return Results.BadRequest(new { ok = false, error = ex.Message });
            }
        });
        app.MapGet("/api/state/overview", () => Results.Ok(BuildOverviewSnapshot()));
        app.MapGet("/api/state/logs", () => Results.Ok(logBuffer.Snapshot()));
        app.MapPut("/api/input/osc/source", (OscSourceSelectionRequest request) =>
        {
            return Results.Ok(SetOscSourceSelectionCore(request.SourceKey));
        });
        app.MapPost("/api/input/oscquery/refresh", async () =>
        {
            try
            {
                return Results.Ok(await RefreshOscQueryResultAsync().ConfigureAwait(false));
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { ok = false, error = ex.Message });
            }
        });

        IResult EmergencyStopResult()
        {
            motionRuntime.EmergencyStop();
            return Results.Ok(new { ok = true, motionRuntime.IsEmergency });
        }

        IResult ClearEmergencyResult()
        {
            motionRuntime.ClearEmergency();
            return Results.Ok(new { ok = true, motionRuntime.IsEmergency });
        }

        app.MapPost("/api/control/runtime/emergency-stop", EmergencyStopResult);
        app.MapPost("/api/control/loop/emergency-stop", EmergencyStopResult);
        app.MapPost("/api/control/runtime/clear-emergency", ClearEmergencyResult);
        app.MapPost("/api/control/loop/clear-emergency", ClearEmergencyResult);

        app.MapPut("/api/input/active", (InputActiveRequest request) =>
        {
            try
            {
                return Results.Ok(SetInputActiveCore(request.Active));
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { ok = false, error = ex.Message });
            }
        });

        app.MapPut("/api/input/mode", (InputModeRequest request) =>
        {
            try
            {
                return Results.Ok(SetInputModeCore(request.Mode));
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { ok = false, error = ex.Message });
            }
        });

        app.MapPut("/api/input/manual", (ManualInputRequest request) =>
        {
            return Results.Ok(ApplyManualInputCore(request));
        });

        app.MapDelete("/api/input/manual", () =>
        {
            return Results.Ok(ClearManualInputCore());
        });

        app.MapPost("/api/input/script/load", async (HttpRequest request) =>
        {
            if (!request.HasFormContentType)
                return Results.BadRequest(new { ok = false, error = "Expected multipart/form-data." });

            var form = await request.ReadFormAsync();
            var file = form.Files.GetFile("file");
            if (file is null || file.Length == 0)
                return Results.BadRequest(new { ok = false, error = "请先选择脚本文件。" });

            var loop = ReadBoolOrDefault(form["loop"].ToString(), false);
            var speed = ReadDoubleOrDefault(form["speed"].ToString(), 1.0);

            try
            {
                using var stream = file.OpenReadStream();
                return Results.Ok(await LoadScriptFromStreamCoreAsync(file.FileName, stream, loop, speed).ConfigureAwait(false));
            }
            catch (Exception ex)
            {
                LogError($"[Input/Script] Load failed: {ex.Message}");
                return Results.BadRequest(new { ok = false, error = ex.Message });
            }
        });

        app.MapPost("/api/input/script/play", (ScriptPlaybackRequest request) =>
        {
            try
            {
                return Results.Ok(PlayScriptCore(request));
            }
            catch (Exception ex)
            {
                LogError($"[Input/Script] Play failed: {ex.Message}");
                return Results.BadRequest(new { ok = false, error = ex.Message });
            }
        });

        app.MapPost("/api/input/script/pause", () =>
        {
            return Results.Ok(PauseScriptCore());
        });

        app.MapPost("/api/input/script/stop", () =>
        {
            return Results.Ok(StopScriptCore());
        });

        app.MapPut("/api/input/script/configure", (ScriptConfigureRequest request) =>
        {
            try
            {
                return Results.Ok(ConfigureScriptCore(request));
            }
            catch (Exception ex)
            {
                LogError($"[Input/Script] Configure failed: {ex.Message}");
                return Results.BadRequest(new { ok = false, error = ex.Message });
            }
        });

        app.MapPut("/api/input/script/seek", (ScriptSeekRequest request) =>
        {
            try
            {
                return Results.Ok(SeekScriptCore(request));
            }
            catch (Exception ex)
            {
                LogError($"[Input/Script] Seek failed: {ex.Message}");
                return Results.BadRequest(new { ok = false, error = ex.Message });
            }
        });

        app.MapDelete("/api/input/script", () =>
        {
            return Results.Ok(ClearScriptCore());
        });

        app.MapPost("/api/control/intiface/connect", async () =>
        {
            var ok = await ConnectIntifaceAsync();
            var primary = config.GetPrimaryOutput(OutputDeviceType.Intiface);
            var message = ok
                ? "Intiface connected."
                : config.Intiface.ManageEngineProcess
                    ? "Intiface connection failed. Ensure intiface-engine.exe exists locally or disable engine management."
                    : "Intiface connection failed. Check the configured WebSocket address and whether Intiface Central is running.";
            return Results.Ok(new { ok, connected = outputCoordinator.IsConnected(primary?.Id), message });
        });
        app.MapPost("/api/control/intiface/disconnect", async () =>
        {
            await DisconnectIntifaceAsync();
            var primary = config.GetPrimaryOutput(OutputDeviceType.Intiface);
            return Results.Ok(new { ok = true, connected = outputCoordinator.IsConnected(primary?.Id), message = "Intiface disconnected." });
        });
        app.MapPost("/api/control/intiface/scan-start", async () =>
        {
            await outputCoordinator.StartPrimaryScanAsync(OutputDeviceType.Intiface);
            return Results.Ok(new { ok = true });
        });
        app.MapPost("/api/control/intiface/scan-stop", async () =>
        {
            await outputCoordinator.StopPrimaryScanAsync(OutputDeviceType.Intiface);
            return Results.Ok(new { ok = true });
        });

        app.MapPost("/api/control/output/{outputId}/connect", async (string outputId) =>
        {
            var output = config.FindOutput(outputId);
            if (output is null)
                return Results.NotFound(new { ok = false, error = "输出不存在。" });

            var ok = await ConnectOutputAsync(outputId);
            LogDebug($"[Output] Connect {outputId} → {ok}");
            return Results.Ok(new
            {
                ok,
                connected = outputCoordinator.IsConnected(outputId),
                outputId,
                type = output.Type,
                message = ok ? $"{output.Name} 已连接。" : $"{output.Name} 连接失败。",
            });
        });

        app.MapPost("/api/control/output/{outputId}/disconnect", async (string outputId) =>
        {
            var output = config.FindOutput(outputId);
            if (output is null)
                return Results.NotFound(new { ok = false, error = "输出不存在。" });

            await DisconnectOutputAsync(outputId);
            LogDebug($"[Output] Disconnect {outputId}");
            return Results.Ok(new
            {
                ok = true,
                connected = outputCoordinator.IsConnected(outputId),
                outputId,
                type = output.Type,
                message = $"{output.Name} 已断开。",
            });
        });

        app.MapPost("/api/control/output/{outputId}/scan-start", async (string outputId) =>
        {
            var output = config.FindOutput(outputId);
            if (output is null)
                return Results.NotFound(new { ok = false, error = "输出不存在。" });
            if (output.Type != OutputDeviceType.Intiface)
                return Results.BadRequest(new { ok = false, error = "只有 Intiface 输出支持扫描。" });

            await outputCoordinator.StartScanAsync(outputId);
            return Results.Ok(new { ok = true, outputId });
        });

        app.MapPost("/api/control/output/{outputId}/scan-stop", async (string outputId) =>
        {
            var output = config.FindOutput(outputId);
            if (output is null)
                return Results.NotFound(new { ok = false, error = "输出不存在。" });
            if (output.Type != OutputDeviceType.Intiface)
                return Results.BadRequest(new { ok = false, error = "只有 Intiface 输出支持扫描。" });

            await outputCoordinator.StopScanAsync(outputId);
            return Results.Ok(new { ok = true, outputId });
        });

        app.MapPost("/api/control/output/{outputId}/device-info-refresh", async (string outputId) =>
        {
            var output = config.FindOutput(outputId);
            if (output is null)
                return Results.NotFound(new { ok = false, error = "输出不存在。" });
            if (!OutputConfigHelpers.IsTCodeOutput(output.Type))
                return Results.BadRequest(new { ok = false, error = "只有 TCode 输出支持设备信息。" });

            await outputCoordinator.RefreshTCodeDeviceInfoAsync(outputId);
            return Results.Ok(new { ok = true, outputId });
        });

        app.MapPost("/api/control/tcode/connect", async () =>
        {
            var ok = await ConnectTCodeAsync();
            var primary = config.GetPrimaryOutput(OutputDeviceType.TCodeSerial);
            var message = ok
                ? $"TCode connected: {config.TCode.ComPort}"
                : "TCode connection failed. Check the COM port, driver, and whether another app is already using the device.";
            return Results.Ok(new { ok, connected = outputCoordinator.IsConnected(primary?.Id), message });
        });
        app.MapPost("/api/control/tcode/disconnect", async () =>
        {
            await DisconnectTCodeAsync();
            var primary = config.GetPrimaryOutput(OutputDeviceType.TCodeSerial);
            return Results.Ok(new { ok = true, connected = outputCoordinator.IsConnected(primary?.Id), message = "TCode disconnected." });
        });

        app.MapPost("/api/control/udp/connect", async () =>
        {
            var ok = await ConnectTCodeUdpAsync();
            var primary = config.GetPrimaryOutput(OutputDeviceType.TCodeUdp);
            var message = ok
                ? $"UDP connected: {config.UdpTCode.Host}:{config.UdpTCode.Port}"
                : "UDP connection failed. Check host/port and whether target accepts TCode over UDP.";
            return Results.Ok(new { ok, connected = outputCoordinator.IsConnected(primary?.Id), message });
        });
        app.MapPost("/api/control/udp/disconnect", async () =>
        {
            await DisconnectTCodeUdpAsync();
            var primary = config.GetPrimaryOutput(OutputDeviceType.TCodeUdp);
            return Results.Ok(new { ok = true, connected = outputCoordinator.IsConnected(primary?.Id), message = "UDP disconnected." });
        });

        app.MapPost("/api/control/tcp/connect", async () =>
        {
            var ok = await ConnectTCodeTcpAsync();
            var primary = config.GetPrimaryOutput(OutputDeviceType.TCodeTcp);
            var message = ok
                ? $"TCP connected: {config.TcpTCode.Host}:{config.TcpTCode.Port}"
                : "TCP connection failed. Check host/port and whether target accepts TCode over TCP.";
            return Results.Ok(new { ok, connected = outputCoordinator.IsConnected(primary?.Id), message });
        });
        app.MapPost("/api/control/tcp/disconnect", async () =>
        {
            await DisconnectTCodeTcpAsync();
            var primary = config.GetPrimaryOutput(OutputDeviceType.TCodeTcp);
            return Results.Ok(new { ok = true, connected = outputCoordinator.IsConnected(primary?.Id), message = "TCP disconnected." });
        });

        app.Map("/api/ws", async context =>
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                return;
            }

            if (wsShutdown.IsCancellationRequested)
            {
                context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
                return;
            }

            using var socket = await context.WebSockets.AcceptWebSocketAsync();
            var clientId = Guid.NewGuid().ToString("N");
            var client = new WebSocketClientSession(socket, context.RequestAborted, wsShutdown.Token);
            wsClients[clientId] = client;

            var buffer = new byte[16384];
            QueueClientStatePush(clientId);

            try
            {
                while (!client.ConnectionToken.IsCancellationRequested && socket.State == WebSocketState.Open)
                {
                    using var messageBuffer = new MemoryStream();
                    WebSocketReceiveResult? result;

                    do
                    {
                        result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), client.ConnectionToken);
                        if (result.MessageType == WebSocketMessageType.Close)
                            break;

                        if (result.Count > 0)
                            await messageBuffer.WriteAsync(buffer.AsMemory(0, result.Count), client.ConnectionToken).ConfigureAwait(false);
                    }
                    while (result is not null && !result.EndOfMessage);

                    if (result?.MessageType == WebSocketMessageType.Close)
                        break;

                    if (result?.MessageType == WebSocketMessageType.Text)
                    {
                        try
                        {
                            var json = Encoding.UTF8.GetString(messageBuffer.GetBuffer(), 0, checked((int)messageBuffer.Length));
                            var response = await HandleWebSocketCommand(json).ConfigureAwait(false);
                            var responseBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(response, wsJsonOptions));
                            await socket.SendAsync(responseBytes, WebSocketMessageType.Text, true, client.ConnectionToken).ConfigureAwait(false);
                        }
                        catch (Exception ex)
                        {
                            var errorBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { id = string.Empty, ok = false, data = new { error = ex.Message } }, wsJsonOptions));
                            await socket.SendAsync(errorBytes, WebSocketMessageType.Text, true, client.ConnectionToken).ConfigureAwait(false);
                        }
                    }
                }
            }
            catch (OperationCanceledException)
            {
            }
            catch (WebSocketException)
            {
                // Browser refresh / abrupt disconnect.
            }
            finally
            {
                RemoveWsClient(clientId);
            }

            await CloseWsSocketAsync(
                client,
                wsShutdown.IsCancellationRequested ? WebSocketCloseStatus.EndpointUnavailable : WebSocketCloseStatus.NormalClosure,
                wsShutdown.IsCancellationRequested ? "Service shutting down" : "Closing").ConfigureAwait(false);
        });

        app.Lifetime.ApplicationStopping.Register(() =>
        {
            Log("[Sensa] Shutting down…");
            CloseAllWsClientsAsync(WebSocketCloseStatus.EndpointUnavailable, "Service shutting down", abortAfterClose: true).GetAwaiter().GetResult();
            recorder.Stop();
            outputCoordinator.DisposeAsync().AsTask().GetAwaiter().GetResult();
            oscReceiver.Stop();
            oscReceiver.Dispose();
            oscQueryClient.DisposeAsync().AsTask().GetAwaiter().GetResult();
            DisposeOscQueryRefreshGate();
            motionRuntime.Dispose();
            config.Save();
        });

        SyncOscServices(forceReceiverReconfigure: true, forceQueryRefresh: true);

        await outputCoordinator.ConnectEnabledAsync();
        NotifyStateChanged();

        Log($"[WebUI] Available at {uiUrl}");

        if (config.WebUi.AutoOpenBrowser)
        {
            try
            {
                Process.Start(new ProcessStartInfo { FileName = uiUrl, UseShellExecute = true });
            }
            catch (Exception ex)
            {
                LogError($"[WebUI] Failed to open browser: {ex.Message}");
            }
        }

        await app.RunAsync();

        motionRuntime.Dispose();
        oscReceiver.Stop();
        oscReceiver.Dispose();
        await oscQueryClient.DisposeAsync();
        DisposeOscQueryRefreshGate();
        await outputCoordinator.DisposeAsync();
        config.Save();

        async Task<object> HandleWebSocketCommand(string json)
        {
            string? requestId = string.Empty;
            try
            {
                using var document = JsonDocument.Parse(json);
                var root = document.RootElement;
                requestId = root.TryGetProperty("id", out var idElement) ? idElement.GetString() : string.Empty;
                var method = root.TryGetProperty("method", out var methodElement) ? methodElement.GetString()?.ToUpperInvariant() : "";
                var path = root.TryGetProperty("path", out var pathElement) ? pathElement.GetString() ?? string.Empty : string.Empty;

                object? result = null;
                var ok = true;

                switch (path)
                {
                    case "/api/config" when method == "GET":
                        result = config;
                        break;

                    case "/api/config" when method == "PUT":
                    {
                        if (!root.TryGetProperty("body", out var body))
                        {
                            ok = false;
                            result = new { error = "Missing request body." };
                            break;
                        }

                        var updated = JsonSerializer.Deserialize<AppConfig>(body.GetRawText(), wsJsonOptions);
                        if (updated is null)
                        {
                            ok = false;
                            result = new { error = "Invalid config payload." };
                            break;
                        }

                        result = await ApplyConfigUpdateAsync(updated).ConfigureAwait(false);

                        break;
                    }

                    case "/api/state/overview" when method == "GET":
                        result = BuildOverviewSnapshot();
                        break;

                    case "/api/state/logs" when method == "GET":
                        result = logBuffer.Snapshot();
                        break;

                    case "/api/input/osc/source" when method == "PUT":
                    {
                        if (!root.TryGetProperty("body", out var body))
                        {
                            ok = false;
                            result = new { error = "Missing request body." };
                            break;
                        }

                        var request = JsonSerializer.Deserialize<OscSourceSelectionRequest>(body.GetRawText(), wsJsonOptions);
                        if (request is null)
                        {
                            ok = false;
                            result = new { error = "Invalid OSC source selection request." };
                            break;
                        }

                        result = SetOscSourceSelectionCore(request.SourceKey);
                        break;
                    }

                    case "/api/meta/serial-ports" when method == "GET":
                        result = BuildSerialPortList();
                        break;

                    case "/api/input/oscquery/refresh" when method == "POST":
                        result = await RefreshOscQueryResultAsync().ConfigureAwait(false);
                        break;

                    case "/api/input/manual" when method == "PUT":
                    {
                        if (!root.TryGetProperty("body", out var body))
                        {
                            ok = false;
                            result = new { error = "Missing request body." };
                            break;
                        }

                        var request = JsonSerializer.Deserialize<ManualInputRequest>(body.GetRawText(), wsJsonOptions);
                        if (request is null)
                        {
                            ok = false;
                            result = new { error = "Invalid manual input request." };
                            break;
                        }

                        result = ApplyManualInputCore(request);

                        break;
                    }
                    case "/api/input/manual" when method == "DELETE":
                        result = ClearManualInputCore();
                        break;

                    case "/api/control/runtime/emergency-stop" when method == "POST":
                    case "/api/control/loop/emergency-stop" when method == "POST":
                        motionRuntime.EmergencyStop();
                        NotifyStateChanged();
                        result = new { motionRuntime.IsEmergency };
                        break;

                    case "/api/control/runtime/clear-emergency" when method == "POST":
                    case "/api/control/loop/clear-emergency" when method == "POST":
                        motionRuntime.ClearEmergency();
                        NotifyStateChanged();
                        result = new { motionRuntime.IsEmergency };
                        break;

                    case "/api/input/active" when method == "PUT":
                    {
                        if (root.TryGetProperty("body", out var body) && body.TryGetProperty("active", out var activeElement))
                        {
                            var active = activeElement.GetBoolean();
                            result = SetInputActiveCore(active);
                        }
                        else
                        {
                            ok = false;
                            result = new { error = "Missing active flag." };
                        }

                        break;
                    }
                    case "/api/input/mode" when method == "PUT":
                    {
                        if (root.TryGetProperty("body", out var body) && body.TryGetProperty("mode", out var modeElement))
                        {
                            var modeText = modeElement.GetString() ?? string.Empty;
                            result = SetInputModeCore(modeText);
                        }
                        else
                        {
                            ok = false;
                            result = new { error = "Missing mode." };
                        }

                        break;
                    }
                    case "/api/input/script/load" when method == "POST":
                    {
                        if (!root.TryGetProperty("body", out var body))
                        {
                            ok = false;
                            result = new { error = "Missing request body." };
                            break;
                        }

                        var request = JsonSerializer.Deserialize<ScriptUploadRequest>(body.GetRawText(), wsJsonOptions);
                        if (request is null)
                        {
                            ok = false;
                            result = new { error = "Invalid script upload request." };
                            break;
                        }

                        result = await LoadScriptFromTextCoreAsync(request).ConfigureAwait(false);
                        break;
                    }
                    case "/api/input/script/play" when method == "POST":
                    {
                        if (!root.TryGetProperty("body", out var body))
                        {
                            ok = false;
                            result = new { error = "Missing request body." };
                            break;
                        }

                        var request = JsonSerializer.Deserialize<ScriptPlaybackRequest>(body.GetRawText(), wsJsonOptions);
                        if (request is null)
                        {
                            ok = false;
                            result = new { error = "Invalid playback request." };
                            break;
                        }

                        result = PlayScriptCore(request);
                        break;
                    }
                    case "/api/input/script/pause" when method == "POST":
                    {
                        result = PauseScriptCore();
                        break;
                    }
                    case "/api/input/script/stop" when method == "POST":
                    {
                        result = StopScriptCore();
                        break;
                    }
                    case "/api/input/script/configure" when method == "PUT":
                    {
                        if (!root.TryGetProperty("body", out var body))
                        {
                            ok = false;
                            result = new { error = "Missing request body." };
                            break;
                        }

                        var request = JsonSerializer.Deserialize<ScriptConfigureRequest>(body.GetRawText(), wsJsonOptions);
                        if (request is null)
                        {
                            ok = false;
                            result = new { error = "Invalid script settings request." };
                            break;
                        }

                        result = ConfigureScriptCore(request);
                        break;
                    }
                    case "/api/input/script/seek" when method == "PUT":
                    {
                        if (!root.TryGetProperty("body", out var body))
                        {
                            ok = false;
                            result = new { error = "Missing request body." };
                            break;
                        }

                        var request = JsonSerializer.Deserialize<ScriptSeekRequest>(body.GetRawText(), wsJsonOptions);
                        if (request is null)
                        {
                            ok = false;
                            result = new { error = "Invalid seek request." };
                            break;
                        }

                        result = SeekScriptCore(request);
                        break;
                    }
                    case "/api/input/script" when method == "DELETE":
                    {
                        result = ClearScriptCore();
                        break;
                    }
                    case var route when method == "POST" && TryMatchOutputAction(route, out var outputId, out var action):
                    {
                        if (string.IsNullOrWhiteSpace(outputId))
                        {
                            ok = false;
                            break;
                        }

                        result = action switch
                        {
                            "connect" => await HandleOutputAction(outputId, async () =>
                            {
                                var connected = await ConnectOutputAsync(outputId);
                                return new { connected, isConnected = outputCoordinator.IsConnected(outputId) };
                            }),
                            "disconnect" => await HandleOutputAction(outputId, async () =>
                            {
                                await DisconnectOutputAsync(outputId);
                                return new { isConnected = outputCoordinator.IsConnected(outputId) };
                            }),
                            "scan-start" => await HandleOutputAction(outputId, async () =>
                            {
                                await outputCoordinator.StartScanAsync(outputId);
                                return new { ok = true, outputId };
                            }),
                            "scan-stop" => await HandleOutputAction(outputId, async () =>
                            {
                                await outputCoordinator.StopScanAsync(outputId);
                                return new { ok = true, outputId };
                            }),
                            "device-info-refresh" => await HandleOutputAction(outputId, async () =>
                            {
                                await outputCoordinator.RefreshTCodeDeviceInfoAsync(outputId);
                                return new { ok = true, outputId };
                            }),
                            _ => null,
                        };

                        if (result is null)
                            ok = false;
                        else
                            NotifyStateChanged();

                        break;
                    }
                    default:
                        ok = false;
                        result = new { error = $"Unknown WS command: {method} {path}" };
                        break;
                }

                return new { id = requestId, ok, data = result };
            }
            catch (Exception ex)
            {
                return new { id = requestId, ok = false, data = new { error = ex.Message } };
            }
        }

        bool TryMatchOutputAction(string path, out string? outputId, out string? action)
        {
            outputId = null;
            action = null;

            var segments = path.Split('/');
            if (segments.Length >= 5 && segments[1] == "api" && segments[2] == "control" && segments[3] == "output")
            {
                outputId = segments[4];
                action = segments.Length >= 6 ? segments[5] : null;
                return action == "connect" || action == "disconnect" || action == "scan-start" || action == "scan-stop" || action == "device-info-refresh";
            }

            return false;
        }

        async Task<object?> HandleOutputAction(string? outputId, Func<Task<object>> action)
        {
            if (string.IsNullOrWhiteSpace(outputId))
                return null;

            var output = config.FindOutput(outputId);
            if (output is null)
                return null;

            return await action();
        }
    }

    private static Dictionary<string, string> ReadSerialPortDescriptions()
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Name FROM Win32_SerialPort");

            foreach (var obj in searcher.Get())
            {
                var name = obj["Name"]?.ToString();
                if (string.IsNullOrWhiteSpace(name))
                    continue;

                var match = System.Text.RegularExpressions.Regex.Match(name, @"\((COM\d+)\)$");
                if (!match.Success)
                    continue;

                var comPort = match.Groups[1].Value;
                var description = name[..name.LastIndexOf('(')].Trim();
                if (!result.ContainsKey(comPort))
                    result[comPort] = description;
            }
        }
        catch
        {
        }

        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Name FROM Win32_PnPEntity WHERE Name LIKE '%(COM%'");

            foreach (var obj in searcher.Get())
            {
                var name = obj["Name"]?.ToString();
                if (string.IsNullOrWhiteSpace(name))
                    continue;

                var match = System.Text.RegularExpressions.Regex.Match(name, @"\((COM\d+)\)$");
                if (!match.Success)
                    continue;

                var comPort = match.Groups[1].Value;
                if (result.ContainsKey(comPort))
                    continue;

                var description = name[..name.LastIndexOf('(')].Trim();
                result[comPort] = description;
            }
        }
        catch
        {
        }

        return result.Count == 0 ? ReadSerialPortDescriptionsFromRegistry() : result;
    }

    private static Dictionary<string, string> ReadSerialPortDescriptionsFromRegistry()
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DEVICEMAP\SERIALCOMM");
            if (key is null)
                return result;

            foreach (var valueName in key.GetValueNames())
            {
                var portName = key.GetValue(valueName) as string;
                if (!string.IsNullOrWhiteSpace(portName))
                    result[portName] = portName;
            }
        }
        catch
        {
        }

        return result;
    }

    private static bool ReadBoolOrDefault(string? raw, bool fallback) =>
        bool.TryParse(raw, out var parsed) ? parsed : fallback;

    private static double ReadDoubleOrDefault(string? raw, double fallback) =>
        double.TryParse(raw, out var parsed) ? parsed : fallback;

    private static float NormalizeManualInputValue(int raw) => Math.Clamp(raw, 0, 999) / 1000f;

    private static TCodeCommandMode? NormalizeManualMotionMode(TCodeCommandMode? rawMode)
    {
        return rawMode.HasValue ? rawMode.Value : null;
    }

    private static int? NormalizeManualMotionValue(TCodeCommandMode? mode, int? rawValue)
    {
        if (!mode.HasValue)
        {
            var resolvedSpeed = rawValue is > 0 ? rawValue.Value : ManualDefaultSpeed;
            return Math.Clamp(resolvedSpeed, 1, 999);
        }

        var resolvedMode = mode.Value;

        if (resolvedMode == TCodeCommandMode.None)
            return null;

        if (resolvedMode == TCodeCommandMode.Interval)
        {
            var requested = rawValue is > 0 ? rawValue.Value : ManualDefaultIntervalMs;
            return Math.Clamp(requested, 1, ManualIntervalMaxMs);
        }

        var requestedSpeed = rawValue is > 0 ? rawValue.Value : ManualDefaultSpeed;

        return Math.Clamp(requestedSpeed, 1, 999);
    }

    private static string FormatOscPreviewValue(OscValue value) =>
        value.Type switch
        {
            OscValueType.Float => value.Float.ToString("0.###"),
            OscValueType.Int => value.Int.ToString(),
            OscValueType.Bool => value.Bool ? "true" : "false",
            _ => "0",
        };
}

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
    double? Speed);

public sealed record ScriptSeekRequest(long PositionMs);

file sealed class WebSocketClientSession
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

    public void MarkPending() => Interlocked.Exchange(ref _pending, 1);

    public bool ConsumePending() => Interlocked.Exchange(ref _pending, 0) == 1;

    public void RequestStop()
    {
        if (Interlocked.Exchange(ref _stopRequested, 1) != 0)
            return;

        try { _connectionCts.Cancel(); } catch { }
    }
}
