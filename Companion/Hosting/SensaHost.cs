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
        var recorder = new MotionRecorder();
        var scriptPlayer = new FunscriptPlayer();
        var outputCoordinator = new OutputCoordinator(config, Log, LogDebug, LogError);

        var motionRuntime = new MotionRuntime(
            config,
            parameterStore,
            oscReceiver,
            recorder: recorder,
            scriptPlayer: scriptPlayer,
            sendOutputsAsync: outputCoordinator.SendAsync,
            emergencyStopAsync: outputCoordinator.EmergencyStopAsync);
        motionRuntime.OnLog += Log;
        motionRuntime.OnDebugLog += message => LogEntry(message, RuntimeLogLevel.Debug);

        var wsClients = new ConcurrentDictionary<string, WebSocketClientSession>();
        var wsShutdown = new CancellationTokenSource();

        object BuildStateEnvelope() => new
        {
            type = "state",
            data = BuildOverviewSnapshot(),
            logs = logBuffer.Snapshot(50),
        };

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

        motionRuntime.StateChanged += NotifyStateChanged;
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

        object BuildOverviewSnapshot()
        {
            var command = motionRuntime.LastCommand;
            var scriptSnapshot = scriptPlayer.GetSnapshot();
            var serialOutput = config.GetPrimaryOutput(OutputDeviceType.TCodeSerial);
            var udpOutput = config.GetPrimaryOutput(OutputDeviceType.TCodeUdp);
            var tcpOutput = config.GetPrimaryOutput(OutputDeviceType.TCodeTcp);
            var intifaceOutput = config.GetPrimaryOutput(OutputDeviceType.Intiface);
            var oscPreview = parameterStore.Snapshot()
                .OrderByDescending(entry => entry.Value.TimestampMs)
                .Take(24)
                .Select(entry => new
                {
                    path = entry.Key,
                    type = entry.Value.Value.Type.ToString().ToLowerInvariant(),
                    value = FormatOscPreviewValue(entry.Value.Value),
                    numericValue = entry.Value.Value.AsFloat(),
                    entry.Value.TimestampMs,
                })
                .ToArray();
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
                    preview = oscPreview,
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
                    var hasLatest = parameterStore.TryGetLatest(signal.OscPath, out var matchedPath, out var entry);
                    return new
                    {
                        index,
                        signal,
                        latest = hasLatest
                            ? new { path = matchedPath, value = entry.Value.AsFloat(), entry.TimestampMs, type = entry.Value.Type.ToString() }
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
            var previousOscHost = config.Osc.ReceiverHost;
            var previousOscPort = config.Osc.ReceiverPort;

            try
            {
                var candidate = new AppConfig();
                candidate.CopyFrom(incoming);
                candidate.ValidateUniqueOutputTargets();

                config.CopyFrom(candidate);
                motionRuntime.RebuildProcessors();

                if (!string.Equals(previousOscHost, config.Osc.ReceiverHost, StringComparison.OrdinalIgnoreCase)
                    || previousOscPort != config.Osc.ReceiverPort)
                {
                    try
                    {
                        oscReceiver.Reconfigure(config.Osc.ReceiverHost, config.Osc.ReceiverPort);
                        Log($"[OSC] Listening on {config.Osc.ReceiverHost}:{config.Osc.ReceiverPort}");
                    }
                    catch
                    {
                        config.Osc.ReceiverHost = previousOscHost;
                        config.Osc.ReceiverPort = previousOscPort;
                        oscReceiver.Reconfigure(previousOscHost, previousOscPort);
                        throw;
                    }
                }

                await outputCoordinator.ReloadAsync();
                await outputCoordinator.ConnectEnabledAsync();
                config.Save();
                Log("[Config] Updated from WebUI.");
                NotifyStateChanged();
                return Results.Ok(config);
            }
            catch (Exception ex)
            {
                LogError($"[Config] Update failed: {ex.Message}");
                return Results.BadRequest(new { ok = false, error = ex.Message });
            }
        });
        app.MapGet("/api/state/overview", () => Results.Ok(BuildOverviewSnapshot()));
        app.MapGet("/api/state/logs", () => Results.Ok(logBuffer.Snapshot()));

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
            motionRuntime.SetInputActive(request.Active);
            return Results.Ok(new { ok = true, active = motionRuntime.InputActive });
        });

        app.MapPut("/api/input/mode", (InputModeRequest request) =>
        {
            if (!Enum.TryParse<RuntimeInputMode>(request.Mode, ignoreCase: true, out var mode))
                return Results.BadRequest(new { ok = false, error = $"Unknown input mode: {request.Mode}" });

            motionRuntime.SetInputMode(mode);
            return Results.Ok(new { ok = true, mode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant() });
        });

        app.MapPut("/api/input/manual", (ManualInputRequest request) =>
        {
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
            };

            if (request.Enabled)
            {
                motionRuntime.SetManualOverride(frame);
                motionRuntime.SetInputMode(RuntimeInputMode.Manual);
                LogDebug($"[Input/Manual] HTTP raw L0={request.L0} R0={request.R0} R1={request.R1} R2={request.R2} L1={request.L1} L2={request.L2} V0={request.V0} V1={request.V1} V2={request.V2} A0={request.A0}");
            }
            else
            {
                motionRuntime.ClearManualOverride();
                LogDebug("[Input/Manual] Cleared");
            }

            return Results.Ok(new
            {
                ok = true,
                inputMode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant(),
                command = motionRuntime.ManualOverrideCommand,
            });
        });

        app.MapDelete("/api/input/manual", () =>
        {
            motionRuntime.ClearManualOverride();
            return Results.Ok(new
            {
                ok = true,
                inputMode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant(),
            });
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
                scriptPlayer.Load(file.FileName, stream);
                scriptPlayer.Configure(loop: loop, speed: speed);
                motionRuntime.SetInputMode(RuntimeInputMode.Script);
                Log($"[Input/Script] Loaded: {file.FileName}");

                return Results.Ok(new
                {
                    ok = true,
                    inputMode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant(),
                    script = scriptPlayer.GetSnapshot(),
                });
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
                var snapshot = scriptPlayer.Play(request.Restart, request.Loop, request.Speed);
                motionRuntime.SetInputMode(RuntimeInputMode.Script);
                Log($"[Input/Script] Playback started: {snapshot.FileName}");
                return Results.Ok(new
                {
                    ok = true,
                    inputMode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant(),
                    script = snapshot,
                });
            }
            catch (Exception ex)
            {
                LogError($"[Input/Script] Play failed: {ex.Message}");
                return Results.BadRequest(new { ok = false, error = ex.Message });
            }
        });

        app.MapPost("/api/input/script/pause", () =>
        {
            var snapshot = scriptPlayer.Pause();
            Log("[Input/Script] Playback paused.");
            return Results.Ok(new { ok = true, script = snapshot });
        });

        app.MapPost("/api/input/script/stop", () =>
        {
            var snapshot = scriptPlayer.Stop();
            Log("[Input/Script] Playback stopped.");
            return Results.Ok(new { ok = true, script = snapshot });
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
                    var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), client.ConnectionToken);
                    if (result.MessageType == WebSocketMessageType.Close)
                        break;

                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        try
                        {
                            var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                            var response = await HandleWebSocketCommand(json);
                            var responseBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(response, wsJsonOptions));
                            await socket.SendAsync(responseBytes, WebSocketMessageType.Text, true, client.ConnectionToken);
                        }
                        catch (Exception ex)
                        {
                            var errorBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { ok = false, error = ex.Message }, wsJsonOptions));
                            await socket.SendAsync(errorBytes, WebSocketMessageType.Text, true, client.ConnectionToken);
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
            motionRuntime.Dispose();
            config.Save();
        });

        oscReceiver.Start();
        Log($"[OSC] Listening on {config.Osc.ReceiverHost}:{config.Osc.ReceiverPort}");

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
        await outputCoordinator.DisposeAsync();
        config.Save();

        async Task<object> HandleWebSocketCommand(string json)
        {
            try
            {
                using var document = JsonDocument.Parse(json);
                var root = document.RootElement;
                var id = root.TryGetProperty("id", out var idElement) ? idElement.GetString() : null;
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
                        if (root.TryGetProperty("body", out var body))
                        {
                            var updated = JsonSerializer.Deserialize<AppConfig>(body.GetRawText(), wsJsonOptions);
                            if (updated is not null)
                            {
                                var previousOscHost = config.Osc.ReceiverHost;
                                var previousOscPort = config.Osc.ReceiverPort;
                                config.CopyFrom(updated);
                                config.Save();
                                motionRuntime.RebuildProcessors();

                                if (!string.Equals(previousOscHost, config.Osc.ReceiverHost, StringComparison.OrdinalIgnoreCase)
                                    || previousOscPort != config.Osc.ReceiverPort)
                                {
                                    oscReceiver.Reconfigure(config.Osc.ReceiverHost, config.Osc.ReceiverPort);
                                    Log($"[OSC] Listening on {config.Osc.ReceiverHost}:{config.Osc.ReceiverPort}");
                                }

                                await outputCoordinator.ReloadAsync();
                                await outputCoordinator.ConnectEnabledAsync();
                                NotifyStateChanged();
                                result = config;
                            }
                        }

                        break;
                    }

                    case "/api/state/overview" when method == "GET":
                        result = BuildOverviewSnapshot();
                        break;

                    case "/api/state/logs" when method == "GET":
                        result = logBuffer.Snapshot();
                        break;

                    case "/api/meta/serial-ports" when method == "GET":
                        result = BuildSerialPortList();
                        break;

                    case "/api/input/manual" when method == "PUT":
                    {
                        if (root.TryGetProperty("body", out var body))
                        {
                            var request = JsonSerializer.Deserialize<ManualInputRequest>(body.GetRawText(), wsJsonOptions);
                            if (request is not null)
                            {
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
                                };

                                if (request.Enabled)
                                {
                                    motionRuntime.SetManualOverride(frame);
                                    motionRuntime.SetInputMode(RuntimeInputMode.Manual);
                                    LogDebug($"[Input/Manual] WS raw L0={request.L0} R0={request.R0} R1={request.R1} R2={request.R2} L1={request.L1} L2={request.L2} V0={request.V0} V1={request.V1} V2={request.V2} A0={request.A0}");
                                }
                                else
                                {
                                    motionRuntime.ClearManualOverride();
                                }

                                result = new { inputMode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant(), command = motionRuntime.ManualOverrideCommand };
                                NotifyStateChanged();
                            }
                        }

                        break;
                    }
                    case "/api/input/manual" when method == "DELETE":
                        motionRuntime.ClearManualOverride();
                        result = new { inputMode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant() };
                        NotifyStateChanged();
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
                            motionRuntime.SetInputActive(active);
                            NotifyStateChanged();
                            result = new { active = motionRuntime.InputActive };
                        }

                        break;
                    }
                    case "/api/input/mode" when method == "PUT":
                    {
                        if (root.TryGetProperty("body", out var body) && body.TryGetProperty("mode", out var modeElement))
                        {
                            var modeText = modeElement.GetString() ?? string.Empty;
                            if (Enum.TryParse<RuntimeInputMode>(modeText, ignoreCase: true, out var mode))
                            {
                                motionRuntime.SetInputMode(mode);
                                NotifyStateChanged();
                                result = new { mode = motionRuntime.CurrentInputMode.ToString().ToLowerInvariant() };
                            }
                        }

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

                return new { id, ok, data = result };
            }
            catch (Exception ex)
            {
                return new { id = string.Empty, ok = false, data = new { error = ex.Message } };
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
                return action == "connect" || action == "disconnect" || action == "scan-start" || action == "scan-stop";
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
    int A0);

public sealed record ScriptPlaybackRequest(
    bool Restart,
    bool? Loop,
    double? Speed);

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
