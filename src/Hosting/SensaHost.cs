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
using Sensa.Application;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Input.Script;
using Sensa.Motion;
using Sensa.Outputs;
using Sensa.Recording;
using Sensa.Runtime;
using Sensa.Signals;

namespace Sensa.Hosting;

public static class SensaHost
{
    public static async Task RunAsync(string[] args)
    {
        if (OperatingSystem.IsWindows()) Console.Title = "Sensa";
        Console.WriteLine("Sensa Web Service starting…");

        var configUpdateGate = new SemaphoreSlim(1, 1);
        var config = AppConfig.Load();
        config.NormalizeForRuntime();
        var uiUrl = $"http://{config.WebUi.Host}:{config.WebUi.Port}";

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ContentRootPath = AppContext.BaseDirectory,
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

        builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 4 * 1024 * 1024);
        var app = builder.Build();
        var accessPolicy = new LocalAccessPolicy();
        app.Use((context, next) => accessPolicy.InvokeAsync(context, next));

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
        using var ogbControl = new OgbControlService(logError: LogError);
        var oscQueryClient = new OscQueryClient();
        var oscQueryPollingService = new OscQueryPollingService(LogDebug, LogError);
        var oscQueryReceiverService = new OscQueryReceiverService(LogDebug, LogError);
        var oscPacketPreviewStore = new OscPacketPreviewStore();
        var oscHubForwarder = new OscHubForwarder(LogDebug, LogError);
        var recorder = new MotionRecorder();
        var scriptPlayer = new FunscriptPlayer();
        var outputCoordinator = new OutputCoordinator(config, Log, LogDebug, LogError);
        string? selectedOscSourceKey = null;

        string? ResolvePreferredOscSourceKeyForRuntime()
        {
            var sources = parameterStore.SnapshotSources();
            if (!string.IsNullOrWhiteSpace(selectedOscSourceKey))
            {
                return selectedOscSourceKey;
            }

            if (!string.IsNullOrWhiteSpace(config.Osc.PreferredSourcePersistentId))
            {
                var matched = sources.FirstOrDefault(source => string.Equals(source.PersistentId, config.Osc.PreferredSourcePersistentId, StringComparison.OrdinalIgnoreCase));
                return !string.IsNullOrWhiteSpace(matched.Key) ? matched.Key : "unavailable:" + config.Osc.PreferredSourcePersistentId;
            }

            return null;
        }

        var motionRuntime = new MotionRuntime(
            config,
            parameterStore,
            outputCoordinator,
            recorder: recorder,
            scriptPlayer: scriptPlayer,
            preferredOscSourceKeyProvider: ResolvePreferredOscSourceKeyForRuntime);
        outputCoordinator.CanSend = () => motionRuntime.CanSend;
        oscReceiver.IsSourceAllowed = source => config.Osc.AllowedSourceAddresses.Count == 0 || config.Osc.AllowedSourceAddresses.Contains(source.Address);
        motionRuntime.OnLog += Log;
        motionRuntime.OnDebugLog += message => LogEntry(message, RuntimeLogLevel.Debug);

        var wsClients = new ConcurrentDictionary<string, WebSocketClientSession>();
        var wsSlots = new SemaphoreSlim(16, 16);
        var wsShutdown = new CancellationTokenSource();
        var oscQueryRefreshGate = new SemaphoreSlim(1, 1);
        var oscQueryRefreshQueued = 0;
        var oscQueryRefreshGateDisposed = 0;
        var oscPreviewStatePushQueued = 0;
        string? oscListenerError = null;
        var oscReceiverActivitySync = new object();
        DateTimeOffset? oscReceiverLastReceivedAtUtc = null;
        DateTimeOffset? oscReceiverLastAvatarParameterAtUtc = null;
        DateTimeOffset? oscReceiverLastRawPacketAtUtc = null;
        string oscReceiverLastSourceKey = string.Empty;
        string oscReceiverLastSourceLabel = string.Empty;
        string? oscReceiverLastSourcePersistentId = null;
        string oscReceiverLastSourceAddress = string.Empty;
        int oscReceiverLastSourcePort = 0;
        long oscReceiverReceivedEventCount = 0;

        long stateRevision = 0;
        long cachedRevision = -1;
        byte[]? cachedState = null;
        var stateCacheGate = new object();
        byte[] StatePayload()
        {
            lock (stateCacheGate)
            {
                if (cachedState is null || cachedRevision != stateRevision)
                {
                    cachedState = JsonSerializer.SerializeToUtf8Bytes(BuildStateEnvelope(), wsJsonOptions);
                    cachedRevision = stateRevision;
                }
                return cachedState;
            }
        }

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

                    var payloadBytes = StatePayload();
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(client.ConnectionToken);
                    timeout.CancelAfter(TimeSpan.FromSeconds(3));
                    await client.Socket.SendAsync(payloadBytes, WebSocketMessageType.Text, true, timeout.Token).ConfigureAwait(false);
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

        var udpRefreshRunning = 0;
        using var udpRefreshTimer = new System.Threading.Timer(_ =>
        {
            if (wsShutdown.IsCancellationRequested || Interlocked.Exchange(ref udpRefreshRunning, 1) != 0) return;
            _ = Task.Run(async () =>
            {
                try { await motionRuntime.RefreshCurrentTargetAsync(outputCoordinator.RefreshUdpAsync); }
                catch (Exception ex) { LogError($"[UDP] {ex.Message}"); }
                finally { Interlocked.Exchange(ref udpRefreshRunning, 0); }
            });
        }, null, 1000, 1000);
        var stateDirty = 1;
        using var stateTimer = new System.Threading.Timer(_ =>
        {
            if (wsShutdown.IsCancellationRequested || Interlocked.Exchange(ref stateDirty, 0) == 0) return;
            Interlocked.Increment(ref stateRevision);
            foreach (var clientId in wsClients.Keys) QueueClientStatePush(clientId);
        }, null, 100, 100);
        void NotifyStateChanged() => Interlocked.Exchange(ref stateDirty, 1);


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

        static bool IsOscQueryManagedSource(OscSource source)
        {
            return !string.IsNullOrWhiteSpace(source.Key)
                && source.Key.StartsWith("oscquery:", StringComparison.OrdinalIgnoreCase);
        }

        void RecordOscReceiverActivity(OscSource source, bool avatarParameter = false, bool rawPacket = false)
        {
            if (IsOscQueryManagedSource(source))
                return;

            var timestamp = DateTimeOffset.UtcNow;
            lock (oscReceiverActivitySync)
            {
                oscReceiverLastReceivedAtUtc = timestamp;
                oscReceiverLastSourceKey = source.Key;
                oscReceiverLastSourceLabel = source.Label;
                oscReceiverLastSourcePersistentId = source.PersistentId;
                oscReceiverLastSourceAddress = source.Address;
                oscReceiverLastSourcePort = source.Port;
                oscReceiverReceivedEventCount += 1;

                if (avatarParameter)
                    oscReceiverLastAvatarParameterAtUtc = timestamp;

                if (rawPacket)
                    oscReceiverLastRawPacketAtUtc = timestamp;
            }
        }

        static bool IsOscQueryNodeReadable(OscQueryNodeInfo node)
        {
            var access = node.Access;
            return !string.IsNullOrWhiteSpace(node.Path)
                && node.ParsedValue.HasValue
                && (!access.HasValue || (access.Value & 0x1) != 0);
        }

        int ApplyOscQueryPolledValues(OscQuerySnapshot snapshot)
        {
            if (snapshot.SupportsListen || !string.IsNullOrWhiteSpace(snapshot.Error))
                return 0;

            var source = OscQueryClient.BuildSnapshotSource(snapshot);
            var applied = 0;
            foreach (var node in snapshot.Nodes)
            {
                if (!IsOscQueryNodeReadable(node) || !node.ParsedValue.HasValue)
                    continue;

                parameterStore.Set(node.Path, node.ParsedValue.Value, source);
                applied += 1;
            }

            return applied;
        }

        bool ShouldRunOscListener() => config.Osc.Enabled && motionRuntime.CurrentInputMode == RuntimeInputMode.Osc;

        string? ResolveSelectedOscSourceKey(OscParameterStore.SourceSnapshot[] sources)
        {
            if (!string.IsNullOrWhiteSpace(selectedOscSourceKey))
            {
                return selectedOscSourceKey;
            }

            if (!string.IsNullOrWhiteSpace(config.Osc.PreferredSourcePersistentId))
            {
                var matched = sources.FirstOrDefault(source => string.Equals(source.PersistentId, config.Osc.PreferredSourcePersistentId, StringComparison.OrdinalIgnoreCase));
                return !string.IsNullOrWhiteSpace(matched.Key) ? matched.Key : "unavailable:" + config.Osc.PreferredSourcePersistentId;
            }

            return null;
        }

        OscParameterStore.SourceSnapshot? ResolveOscHubSource(OscParameterStore.SourceSnapshot[] sources)
        {
            var selectedKey = ResolveSelectedOscSourceKey(sources);
            if (!string.IsNullOrWhiteSpace(selectedKey))
            {
                var selectedSource = sources.FirstOrDefault(source => string.Equals(source.Key, selectedKey, StringComparison.Ordinal));
                return string.IsNullOrWhiteSpace(selectedSource.Key) ? null : selectedSource;
            }

            return sources.Length == 1 ? sources[0] : null;
        }

        bool IsOscHubSourceAllowed(OscSource source)
        {
            if (!config.Osc.Hub.Enabled)
                return false;

            var snapshotSources = parameterStore.SnapshotSources();
            if (snapshotSources.Length == 0)
            {
                if (!string.IsNullOrWhiteSpace(config.Osc.PreferredSourcePersistentId))
                {
                    return !string.IsNullOrWhiteSpace(source.PersistentId)
                        && string.Equals(config.Osc.PreferredSourcePersistentId, source.PersistentId, StringComparison.OrdinalIgnoreCase);
                }

                return true;
            }

            var resolvedSource = ResolveOscHubSource(snapshotSources);
            if (!resolvedSource.HasValue)
                return false;

            return string.Equals(resolvedSource.Value.Key, source.Key, StringComparison.Ordinal);
        }

        void ReplayOscHubSnapshot()
        {
            oscHubForwarder.ClearPending();

            if (!config.Osc.Hub.Enabled)
                return;

            var snapshotSources = parameterStore.SnapshotSources();
            var resolvedSource = ResolveOscHubSource(snapshotSources);
            if (!resolvedSource.HasValue)
                return;

            var sourceKey = resolvedSource.Value.Key;
            var entries = parameterStore.SnapshotEntries()
                .Where(entry => string.Equals(entry.Entry.Source.Key, sourceKey, StringComparison.Ordinal))
                .OrderBy(entry => entry.Path, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            oscHubForwarder.ReplaySnapshot(entries);
        }

        void ConfigureOscHub(bool replaySnapshot = false)
        {
            oscHubForwarder.Configure(config.Osc.Hub);

            if (replaySnapshot)
                ReplayOscHubSnapshot();
        }

        object SetOscSourceSelectionCore(string? sourceKey)
        {
            configUpdateGate.Wait();
            try { return SetOscSourceSelectionLocked(sourceKey); }
            finally { configUpdateGate.Release(); }
        }
        object SetOscSourceSelectionLocked(string? sourceKey)
        {
            var normalizedSourceKey = string.IsNullOrWhiteSpace(sourceKey) ? null : sourceKey.Trim();
            selectedOscSourceKey = normalizedSourceKey;

            var snapshotSources = parameterStore.SnapshotSources();
            var selectedSource = snapshotSources.FirstOrDefault(source => string.Equals(source.Key, normalizedSourceKey, StringComparison.Ordinal));
            config.Osc.PreferredSourcePersistentId = string.IsNullOrWhiteSpace(selectedSource.PersistentId) ? string.Empty : selectedSource.PersistentId;
            config.Save();

            ReplayOscHubSnapshot();
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

        void ConfigureOscQueryPolling()
        {
            var snapshot = oscQueryClient.Snapshot;
            var shouldPoll = ShouldRunOscListener()
                && config.Osc.OscQueryEnabled
                && config.Osc.OscQueryPolling.Enabled
                && !string.IsNullOrWhiteSpace(snapshot.Url)
                && !snapshot.SupportsListen
                && string.IsNullOrWhiteSpace(snapshot.Error);

            oscQueryPollingService.Configure(shouldPoll, config.Osc.OscQueryPolling.RateHz, async cancellationToken =>
            {
                cancellationToken.ThrowIfCancellationRequested();

                var refreshed = await RefreshOscQueryCoreAsync(logResult: false).ConfigureAwait(false);
                var applied = ApplyOscQueryPolledValues(refreshed);

                if (refreshed.SupportsListen || !string.IsNullOrWhiteSpace(refreshed.Error) || !ShouldRunOscListener() || !config.Osc.OscQueryPolling.Enabled)
                    _ = Task.Run(ConfigureOscQueryPolling, CancellationToken.None);

                if (applied > 0)
                    QueueOscPreviewStateChanged();

                NotifyStateChanged();
                return applied;
            });
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
                    ConfigureOscQueryPolling();
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
                ogbControl.Configure(config.Osc.OgbControl, shouldRun: false);
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
                    oscReceiver.Reconfigure(config.Osc.ReceiverHost, config.Osc.ReceiverPort);
                    oscReceiver.Start();
                    oscListenerError = null;
                    Log($"[OSC] Listening on {config.Osc.ReceiverHost}:{config.Osc.ReceiverPort}");
                }
                catch (Exception ex)
                {
                    ogbControl.Configure(config.Osc.OgbControl, shouldRun: false);
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
                    ogbControl.Configure(config.Osc.OgbControl, shouldRun: false);
                    oscListenerError = $"无法监听 {config.Osc.ReceiverHost}:{config.Osc.ReceiverPort}：{ex.Message}";
                    throw new InvalidOperationException(oscListenerError, ex);
                }
            }
            else
            {
                oscListenerError = null;
            }

            config.ValidateOgbControlTarget();
            ogbControl.Configure(config.Osc.OgbControl,
                shouldListen && oscReceiver.IsRunning && motionRuntime.CurrentInputMode == RuntimeInputMode.Osc);

            try
            {
                oscQueryReceiverService.Configure(shouldListen, config.Osc.OscQueryReceiver, config.Osc.ReceiverPort);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"无法启动 OSCQuery 接收器广播：{ex.Message}", ex);
            }

            var normalizedUrl = config.Osc.OscQueryEnabled
                ? OscQueryClient.NormalizeUrl(config.Osc.OscQueryUrl)
                : string.Empty;
            if (string.IsNullOrWhiteSpace(normalizedUrl))
            {
                oscQueryClient.Clear();
                QueueOscQueryListenSync();
                ConfigureOscQueryPolling();
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

            ConfigureOscQueryPolling();
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
        parameterStore.OnSetWithSource += (path, value, source) =>
        {
            RecordOscReceiverActivity(source, avatarParameter: true);
            QueueOscPreviewStateChanged();

            if (IsOscHubSourceAllowed(source))
                oscHubForwarder.ForwardParameter(path, value);
        };
        oscReceiver.OnUnhandledPacket += (payload, source) =>
        {
            RecordOscReceiverActivity(source, rawPacket: true);
            oscPacketPreviewStore.AddPacket(payload, source);
            QueueOscPreviewStateChanged();

            if (IsOscHubSourceAllowed(source))
                oscHubForwarder.ForwardRawPacket(payload, "OSC raw passthrough");
        };
        oscReceiver.OnAvatarChange += () =>
        {
            oscHubForwarder.ForwardAvatarChange();
            NotifyStateChanged();
        };
        oscQueryClient.AvatarChanged += () =>
        {
            parameterStore.ChangeAvatar();
            oscHubForwarder.ForwardAvatarChange();
            NotifyStateChanged();
        };
        oscQueryClient.StructureChanged += () => QueueOscQueryRefresh();
        ogbControl.StateChanged += NotifyStateChanged;
        oscQueryClient.ListenStateChanged += NotifyStateChanged;
        oscQueryPollingService.StateChanged += NotifyStateChanged;
        oscQueryReceiverService.StateChanged += NotifyStateChanged;

        motionRuntime.StateChanged += HandleRuntimeStateChanged;
        outputCoordinator.StateChanged += NotifyStateChanged;
        logBuffer.EntryAdded += _ => NotifyStateChanged();

        async Task<object> RefreshOscQueryResultAsync()
        {
            if (string.IsNullOrWhiteSpace(OscQueryClient.NormalizeUrl(config.Osc.OscQueryUrl)))
                throw new InvalidOperationException("请先填写 OSCQuery 地址。");

            var snapshot = await RefreshOscQueryCoreAsync(logResult: true).ConfigureAwait(false);
            ConfigureOscQueryPolling();
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
                .OrderBy(entry => entry.Path, StringComparer.Ordinal)
                .Select(entry => new
                {
                    path = entry.Path,
                    type = entry.Entry.Value.Type.ToString().ToLowerInvariant(),
                    value = FormatOscPreviewValue(entry.Entry.Value),
                    numericValue = entry.Entry.Value.AsFloat(),
                    classification = OscParameterClassifier.Classify(entry.Path),
                    entry.Entry.TimestampMs,
                    sourceKey = entry.Entry.Source.Key,
                    sourceLabel = entry.Entry.Source.Label,
                    sourcePersistentId = entry.Entry.Source.PersistentId,
                    sourceAddress = entry.Entry.Source.Address,
                    sourcePort = entry.Entry.Source.Port,
                })
                .ToArray();
            var oscQuerySnapshot = oscQueryClient.Snapshot;
            var oscQueryPollingSnapshot = oscQueryPollingService.Snapshot;
            var oscQueryReceiverSnapshot = oscQueryReceiverService.Snapshot;
            var oscHubSnapshot = oscHubForwarder.BuildSnapshot();
            var oscHubSource = ResolveOscHubSource(oscSourceSnapshots);
            var oscHubBlockedBySourceSelection = config.Osc.Hub.Enabled && oscSourceSnapshots.Length > 1 && !oscHubSource.HasValue;
            var trackingPreview = oscPacketPreviewStore.Snapshot("tracking");
            var rawPreview = oscPacketPreviewStore.Snapshot();
            DateTimeOffset? oscReceiverLastSeenAtUtc;
            DateTimeOffset? oscReceiverLastAvatarParameterSeenAtUtc;
            DateTimeOffset? oscReceiverLastRawPacketSeenAtUtc;
            string oscReceiverLastSeenSourceKey;
            string oscReceiverLastSeenSourceLabel;
            string? oscReceiverLastSeenSourcePersistentId;
            string oscReceiverLastSeenSourceAddress;
            int oscReceiverLastSeenSourcePort;
            long oscReceiverEventCount;
            lock (oscReceiverActivitySync)
            {
                oscReceiverLastSeenAtUtc = oscReceiverLastReceivedAtUtc;
                oscReceiverLastAvatarParameterSeenAtUtc = oscReceiverLastAvatarParameterAtUtc;
                oscReceiverLastRawPacketSeenAtUtc = oscReceiverLastRawPacketAtUtc;
                oscReceiverLastSeenSourceKey = oscReceiverLastSourceKey;
                oscReceiverLastSeenSourceLabel = oscReceiverLastSourceLabel;
                oscReceiverLastSeenSourcePersistentId = oscReceiverLastSourcePersistentId;
                oscReceiverLastSeenSourceAddress = oscReceiverLastSourceAddress;
                oscReceiverLastSeenSourcePort = oscReceiverLastSourcePort;
                oscReceiverEventCount = oscReceiverReceivedEventCount;
            }
            var oscQueryReceiverReceivedSinceStarted = oscQueryReceiverSnapshot.Running
                && oscQueryReceiverSnapshot.StartedAtUtc.HasValue
                && oscReceiverLastSeenAtUtc.HasValue
                && oscReceiverLastSeenAtUtc.Value >= oscQueryReceiverSnapshot.StartedAtUtc.Value;
            var devices = outputCoordinator.GetDevices(intifaceOutput?.Id).Select(device => new
            {
                name = device.Name,
                index = device.Index,
                positionFeatures = Sensa.Outputs.Intiface.IntifacePositionFeatures.For(device).Count,
                vibrateFeatures = device.GetFeaturesWithOutput(OutputType.Vibrate).Count(),
            }).ToArray();
            var outputs = outputCoordinator.BuildOverview();
            var runtimeState = new
            {
                isEmergency = motionRuntime.IsEmergency,
                gateClosed = motionRuntime.IsGateClosed,
                poseBlocked = motionRuntime.PoseBlocked,
                spatialInputBlockedReason = motionRuntime.SpatialInputBlockedReason,
                spatialInputStatus = motionRuntime.SpatialInputStatus,
                spatialSampleMaxAgeMs = motionRuntime.SpatialSampleMaxAgeMs,
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
                    enabled = config.Osc.Enabled,
                    config.Osc.ReceiverHost,
                    config.Osc.ReceiverPort,
                    listening = oscReceiver.IsRunning,
                    listenerError = oscListenerError,
                    ogbControl = ogbControl.Snapshot(),
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
                        polling = new
                        {
                            enabled = config.Osc.OscQueryPolling.Enabled,
                            running = oscQueryPollingSnapshot.Running,
                            rateHz = oscQueryPollingSnapshot.RateHz,
                            startedAtUtc = oscQueryPollingSnapshot.StartedAtUtc,
                            lastPolledAtUtc = oscQueryPollingSnapshot.LastPolledAtUtc,
                            lastAppliedValueCount = oscQueryPollingSnapshot.LastAppliedValueCount,
                            error = oscQueryPollingSnapshot.LastError,
                        },
                        nodes = oscQuerySnapshot.Nodes,
                    },
                    queryReceiver = new
                    {
                        enabled = config.Osc.OscQueryReceiver.Enabled,
                        running = oscQueryReceiverSnapshot.Running,
                        serviceName = oscQueryReceiverSnapshot.ServiceName,
                        httpPort = oscQueryReceiverSnapshot.HttpPort,
                        httpUrl = oscQueryReceiverSnapshot.HttpUrl,
                        oscPort = oscQueryReceiverSnapshot.OscPort,
                        startedAtUtc = oscQueryReceiverSnapshot.StartedAtUtc,
                        advertisedPaths = oscQueryReceiverSnapshot.AdvertisedPaths,
                        receivedSinceStarted = oscQueryReceiverReceivedSinceStarted,
                        lastReceivedAtUtc = oscReceiverLastSeenAtUtc,
                        lastAvatarParameterAtUtc = oscReceiverLastAvatarParameterSeenAtUtc,
                        lastRawPacketAtUtc = oscReceiverLastRawPacketSeenAtUtc,
                        lastSourceKey = oscReceiverLastSeenSourceKey,
                        lastSourceLabel = oscReceiverLastSeenSourceLabel,
                        lastSourcePersistentId = oscReceiverLastSeenSourcePersistentId,
                        lastSourceAddress = oscReceiverLastSeenSourceAddress,
                        lastSourcePort = oscReceiverLastSeenSourcePort,
                        receivedEventCount = oscReceiverEventCount,
                        error = oscQueryReceiverSnapshot.Error,
                    },
                    trackingPreview = trackingPreview.Select(entry => new
                    {
                        category = entry.Category,
                        path = entry.Address,
                        type = entry.TypeTag,
                        value = entry.ValueSummary,
                        entry.TimestampMs,
                        sourceKey = entry.SourceKey,
                        sourceLabel = entry.SourceLabel,
                        sourcePersistentId = entry.SourcePersistentId,
                        sourceAddress = entry.SourceAddress,
                        sourcePort = entry.SourcePort,
                    }).ToArray(),
                    rawPreview = rawPreview.Select(entry => new
                    {
                        category = entry.Category,
                        path = entry.Address,
                        type = entry.TypeTag,
                        value = entry.ValueSummary,
                        entry.TimestampMs,
                        sourceKey = entry.SourceKey,
                        sourceLabel = entry.SourceLabel,
                        sourcePersistentId = entry.SourcePersistentId,
                        sourceAddress = entry.SourceAddress,
                        sourcePort = entry.SourcePort,
                    }).ToArray(),
                    hub = new
                    {
                        enabled = config.Osc.Hub.Enabled,
                        mode = oscHubSnapshot.Mode,
                        fixedRateHz = oscHubSnapshot.FixedRateHz,
                        forwardAvatarChange = oscHubSnapshot.ForwardAvatarChange,
                        targetCount = oscHubSnapshot.TargetCount,
                        activeTargetCount = oscHubSnapshot.ActiveTargetCount,
                        pendingPacketCount = oscHubSnapshot.PendingPacketCount,
                        pendingAvatarChange = oscHubSnapshot.PendingAvatarChange,
                        forwardedPacketCount = oscHubSnapshot.ForwardedPacketCount,
                        droppedPacketCount = oscHubSnapshot.DroppedPacketCount,
                        lastForwardedAtUtc = oscHubSnapshot.LastForwardedAtUtc,
                        lastDroppedAtUtc = oscHubSnapshot.LastDroppedAtUtc,
                        lastDropReason = oscHubSnapshot.LastDropReason,
                        blockedBySourceSelection = oscHubBlockedBySourceSelection,
                        effectiveSourceKey = oscHubSource?.Key ?? string.Empty,
                        effectiveSourceLabel = oscHubSource?.Label ?? string.Empty,
                        effectiveSourceParameterCount = oscHubSource?.ParameterCount ?? 0,
                        canForward = config.Osc.Hub.Enabled && oscHubSnapshot.ActiveTargetCount > 0 && !oscHubBlockedBySourceSelection,
                        targets = oscHubSnapshot.Targets,
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
                poseTracking = new { observations = motionRuntime.GetPoseObservations(), activeKey = motionRuntime.ActivePoseKey,
                    spsRoots = SpsPositionTracking.Observe(parameterStore.SnapshotEntries(), selectedOscSourceKey, motionRuntime.SpatialSampleMaxAgeMs) },
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
                    || path.EndsWith("/app.bundle.js", StringComparison.OrdinalIgnoreCase)
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

        var configurationUpdate = new ConfigurationUpdate(
            config, motionRuntime, outputCoordinator,
            (receiverChanged, queryChanged) => SyncOscServices(forceReceiverReconfigure: receiverChanged, forceQueryRefresh: queryChanged),
            () => ConfigureOscHub(replaySnapshot: true),
            updated => updated.Save(),
            Log,
            configUpdateGate);
        var application = new SensaApplication(
            config, motionRuntime, scriptPlayer, recorder, outputCoordinator,
            new ApplicationHost(
                BuildOverviewSnapshot,
                () => logBuffer.Snapshot(),
                BuildSerialPortList,
                configurationUpdate.ApplyAsync,
                SetOscSourceSelectionCore,
                RefreshOscQueryResultAsync,
                () => SyncOscServices(),
                () => oscReceiver.IsRunning,
                NotifyStateChanged,
                Log,
                LogDebug,
                LogError));
        var httpCommands = new HttpCommandAdapter(application);
        var webSocketCommands = new WebSocketCommandAdapter(application);
        app.MapMethods("/api/{**path}", ["GET", "POST", "PUT", "DELETE"],
            (HttpRequest request) => httpCommands.HandleAsync(request));

        app.Map("/api/ws", async context =>
        {
            if (!await wsSlots.WaitAsync(0)) { context.Response.StatusCode = 429; return; }
            try { await HandleWebSocketAsync(context); }
            finally { wsSlots.Release(); }
        });
        async Task HandleWebSocketAsync(HttpContext context)
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

                        if (messageBuffer.Length + result.Count > 4 * 1024 * 1024)
                        {
                            await socket.CloseOutputAsync(WebSocketCloseStatus.MessageTooBig, "Message exceeds 4 MiB", client.ConnectionToken);
                            return;
                        }
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
                            var response = await webSocketCommands.HandleAsync(json).ConfigureAwait(false);
                            var responseBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(response, wsJsonOptions));
                            await client.SendAsync(responseBytes).ConfigureAwait(false);
                        }
                        catch (Exception ex)
                        {
                            var errorBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { id = string.Empty, ok = false, data = new { error = ex.Message } }, wsJsonOptions));
                            await client.SendAsync(errorBytes).ConfigureAwait(false);
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
                await CloseWsSocketAsync(client,
                    wsShutdown.IsCancellationRequested ? WebSocketCloseStatus.EndpointUnavailable : WebSocketCloseStatus.NormalClosure,
                    wsShutdown.IsCancellationRequested ? "Service shutting down" : "Closing").ConfigureAwait(false);
                await client.DisposeAsync();
            }
        }

        app.Lifetime.ApplicationStopping.Register(() =>
        {
            Log("[Sensa] Shutting down…");
            CloseAllWsClientsAsync(WebSocketCloseStatus.EndpointUnavailable, "Service shutting down", abortAfterClose: true).GetAwaiter().GetResult();
            ogbControl.Dispose();
            recorder.Stop();
            outputCoordinator.DisposeAsync().AsTask().GetAwaiter().GetResult();
            oscReceiver.Stop();
            oscReceiver.Dispose();
            oscQueryClient.DisposeAsync().AsTask().GetAwaiter().GetResult();
            oscQueryPollingService.DisposeAsync().AsTask().GetAwaiter().GetResult();
            oscQueryReceiverService.DisposeAsync().AsTask().GetAwaiter().GetResult();
            oscHubForwarder.Dispose();
            DisposeOscQueryRefreshGate();
            motionRuntime.Dispose();
            scriptPlayer.Dispose();
            try { config.Save(); } catch (Exception ex) { LogError($"[Config] {ex.Message}"); }
        });

        ConfigureOscHub(replaySnapshot: true);
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

        ogbControl.Dispose();
        motionRuntime.Dispose();
        scriptPlayer.Dispose();
        oscReceiver.Stop();
        oscReceiver.Dispose();
        await oscQueryClient.DisposeAsync();
        await oscQueryPollingService.DisposeAsync();
        await oscQueryReceiverService.DisposeAsync();
        oscHubForwarder.Dispose();
        DisposeOscQueryRefreshGate();
        await outputCoordinator.DisposeAsync();
        config.Save();

    }

    private static Dictionary<string, string> ReadSerialPortDescriptions()
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!OperatingSystem.IsWindows()) return result;

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
        if (!OperatingSystem.IsWindows()) return result;
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

    private static string FormatOscPreviewValue(OscValue value) =>
        value.Type switch
        {
            OscValueType.Float => value.Float.ToString("0.###"),
            OscValueType.Int => value.Int.ToString(),
            OscValueType.Bool => value.Bool ? "true" : "false",
            _ => "0",
        };
}
