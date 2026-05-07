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
using Sensa.ApplicationLoop;
using Sensa.Config;
using Sensa.Core;
using Sensa.ServiceRecording;
using Sensa.TransmitIntiface;
using Sensa.TransmitTCode;
using Sensa.UiActions;

Console.Title = "Sensa";
Console.WriteLine("Sensa Web Service starting…");

var save = SaveFile.Load();
save.NormalizeForRuntime();
var uiUrl = $"http://{save.WebUi.Host}:{save.WebUi.Port}";

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(uiUrl);
builder.Services.Configure<JsonOptions>(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.SerializerOptions.WriteIndented = true;
});
var wsJsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
wsJsonOptions.Converters.Add(new JsonStringEnumConverter());

var app = builder.Build();

var logBuffer = new ServiceLogBuffer();
void Log(string message)
{
    logBuffer.Add(message);
    Console.WriteLine(message);
}

void LogError(string message)
{
    logBuffer.Add(message);
    Console.Error.WriteLine(message);
}

var paramStore  = new ParameterStore();
var oscReceiver = new OscReceiver(paramStore, save.Osc.ReceiverHost, save.Osc.ReceiverPort);
var recorder    = new RecordingBuffer();
var scriptInput = new ScriptInputPlayer();
var uiActions   = new UiActionQueue();

var outputManager = new OutputRuntimeManager(save, Log, LogError);

var routine = new Routine(
    save,
    paramStore,
    oscReceiver,
    uiActions,
    recorder: recorder,
    scriptInput: scriptInput,
    sendOutputsAsync: outputManager.SendAsync,
    emergencyStopAsync: outputManager.EmergencyStopAsync,
    loopRateResolver: save.GetRecommendedLoopRate);
routine.OnLog += Log;

async Task RunOnLoopAsync(Action action)
{
    var tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    uiActions.Enqueue(() =>
    {
        try
        {
            action();
            tcs.SetResult();
        }
        catch (Exception ex)
        {
            tcs.SetException(ex);
        }
    });
    await tcs.Task;
}

Task<bool> ConnectTCodeAsync()
{
    return outputManager.ConnectPrimaryAsync(OutputDeviceType.TCodeSerial);
}

Task DisconnectTCodeAsync()
{
    return outputManager.DisconnectPrimaryAsync(OutputDeviceType.TCodeSerial);
}

Task<bool> ConnectTCodeUdpAsync()
{
    return outputManager.ConnectPrimaryAsync(OutputDeviceType.TCodeUdp);
}

Task DisconnectTCodeUdpAsync()
{
    return outputManager.DisconnectPrimaryAsync(OutputDeviceType.TCodeUdp);
}

Task<bool> ConnectTCodeTcpAsync()
{
    return outputManager.ConnectPrimaryAsync(OutputDeviceType.TCodeTcp);
}

Task DisconnectTCodeTcpAsync()
{
    return outputManager.DisconnectPrimaryAsync(OutputDeviceType.TCodeTcp);
}

async Task<bool> ConnectIntifaceAsync()
{
    return await outputManager.ConnectPrimaryAsync(OutputDeviceType.Intiface);
}

async Task DisconnectIntifaceAsync()
{
    await outputManager.DisconnectPrimaryAsync(OutputDeviceType.Intiface);
}

Task<bool> ConnectOutputAsync(string outputId) => outputManager.ConnectAsync(outputId);

Task DisconnectOutputAsync(string outputId) => outputManager.DisconnectAsync(outputId);

object BuildOverviewSnapshot()
{
    var cmd = routine.LastCommand;
    var scriptSnapshot = scriptInput.GetSnapshot();
    var serialOutput = save.GetPrimaryOutput(OutputDeviceType.TCodeSerial);
    var udpOutput = save.GetPrimaryOutput(OutputDeviceType.TCodeUdp);
    var tcpOutput = save.GetPrimaryOutput(OutputDeviceType.TCodeTcp);
    var intifaceOutput = save.GetPrimaryOutput(OutputDeviceType.Intiface);
    var oscPreview = paramStore.Snapshot()
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
    var devices = outputManager.GetDevices(intifaceOutput?.Id).Select(device => new
    {
        name = device.Name,
        index = device.Index,
        positionFeatures = device.GetFeaturesWithOutput(OutputType.Position).Count(),
        vibrateFeatures = device.GetFeaturesWithOutput(OutputType.Vibrate).Count(),
    }).ToArray();
    var outputs = outputManager.BuildOverview();

    return new
    {
        loop = new
        {
            routine.IsRunning,
            routine.IsEmergency,
            routine.ManualOverrideEnabled,
            inputMode = routine.CurrentInputMode,
            command = cmd,
            manualCommand = routine.ManualOverrideCommand,
        },
        input = new
        {
            mode = routine.CurrentInputMode.ToString().ToLowerInvariant(),
            script = scriptSnapshot,
        },
        osc = new
        {
            save.Osc.ReceiverHost,
            save.Osc.ReceiverPort,
            preview = oscPreview,
        },
        tcode = new
        {
            connected = outputManager.IsConnected(serialOutput?.Id),
            config = save.TCode,
        },
        udpTCode = new
        {
            connected = outputManager.IsConnected(udpOutput?.Id),
            config = save.UdpTCode,
        },
        tcpTCode = new
        {
            connected = outputManager.IsConnected(tcpOutput?.Id),
            config = save.TcpTCode,
        },
        intiface = new
        {
            connected = outputManager.IsConnected(intifaceOutput?.Id),
            config = save.Intiface,
            devices,
        },
        outputs,
        recording = new
        {
            recorder.IsActive,
            recorder.FrameCount,
        },
        signals = save.Signals.Select((signal, index) =>
        {
            var hasLatest = paramStore.TryGetLatest(signal.OscPath, out var matchedPath, out var entry);
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
                description = descriptions.TryGetValue(name, out var desc) ? desc : null,
            })
            .ToArray<object>();
    }
    catch (Exception ex)
    {
        LogError($"[Meta] Failed to enumerate serial ports: {ex.Message}");
        return Array.Empty<object>();
    }
}

static Dictionary<string, string> ReadSerialPortDescriptions()
{
    var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    try
    {
        // Primary: Win32_SerialPort gives friendly names for real COM ports
        using var searcher = new ManagementObjectSearcher(
            "SELECT Name FROM Win32_SerialPort");

        foreach (var obj in searcher.Get())
        {
            var name = obj["Name"]?.ToString();
            if (string.IsNullOrWhiteSpace(name)) continue;

            var comMatch = System.Text.RegularExpressions.Regex.Match(name, @"\((COM\d+)\)$");
            if (!comMatch.Success) continue;

            var comPort = comMatch.Groups[1].Value;
            var description = name[..(name.LastIndexOf('('))].Trim();
            if (!result.ContainsKey(comPort))
                result[comPort] = description;
        }
    }
    catch { }

    try
    {
        // Secondary: Win32_PnPEntity catches USB virtual COM ports (OSR6 etc.)
        using var pnpSearcher = new ManagementObjectSearcher(
            "SELECT Name FROM Win32_PnPEntity WHERE Name LIKE '%(COM%'");

        foreach (var obj in pnpSearcher.Get())
        {
            var name = obj["Name"]?.ToString();
            if (string.IsNullOrWhiteSpace(name)) continue;

            var comMatch = System.Text.RegularExpressions.Regex.Match(name, @"\((COM\d+)\)$");
            if (!comMatch.Success) continue;

            var comPort = comMatch.Groups[1].Value;
            if (result.ContainsKey(comPort)) continue; // Win32_SerialPort name is better

            var description = name[..(name.LastIndexOf('('))].Trim();
            result[comPort] = description;
        }
    }
    catch { }

    // Final fallback: registry COM port list
    if (result.Count == 0)
        return ReadSerialPortDescriptionsFromRegistry();

    return result;
}

static Dictionary<string, string> ReadSerialPortDescriptionsFromRegistry()
{
    var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    try
    {
        using var key = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DEVICEMAP\SERIALCOMM");
        if (key is null) return result;

        foreach (var valueName in key.GetValueNames())
        {
            var portName = key.GetValue(valueName) as string;
            if (string.IsNullOrWhiteSpace(portName)) continue;
            result[portName] = portName;
        }
    }
    catch
    {
        // Best effort
    }

    return result;
}

static bool ReadBoolOrDefault(string? raw, bool fallback) =>
    bool.TryParse(raw, out var parsed) ? parsed : fallback;

static double ReadDoubleOrDefault(string? raw, double fallback) =>
    double.TryParse(raw, out var parsed) ? parsed : fallback;

static string FormatOscPreviewValue(OscValue value) =>
    value.Type switch
    {
        OscValueType.Float => value.Float.ToString("0.###"),
        OscValueType.Int => value.Int.ToString(),
        OscValueType.Bool => value.Bool ? "true" : "false",
        _ => "0",
    };

app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        var path = ctx.Context.Request.Path.Value ?? string.Empty;
        if (path.EndsWith(".html", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith("/app.js", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith("/styles.css", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
            ctx.Context.Response.Headers.Pragma = "no-cache";
            ctx.Context.Response.Headers.Expires = "0";
        }
    },
});
app.UseWebSockets();

app.MapGet("/api/meta/serial-ports", () => Results.Ok(BuildSerialPortList()));
app.MapGet("/api/config", () => Results.Ok(save));
app.MapPut("/api/config", async (SaveFile incoming) =>
{
    var previousOscHost = save.Osc.ReceiverHost;
    var previousOscPort = save.Osc.ReceiverPort;

    try
    {
        await RunOnLoopAsync(() =>
        {
            save.CopyFrom(incoming);
            routine.RebuildProcessors();
        });

        if (!string.Equals(previousOscHost, save.Osc.ReceiverHost, StringComparison.OrdinalIgnoreCase)
            || previousOscPort != save.Osc.ReceiverPort)
        {
            try
            {
                oscReceiver.Reconfigure(save.Osc.ReceiverHost, save.Osc.ReceiverPort);
                Log($"[OSC] Listening on {save.Osc.ReceiverHost}:{save.Osc.ReceiverPort}");
            }
            catch
            {
                save.Osc.ReceiverHost = previousOscHost;
                save.Osc.ReceiverPort = previousOscPort;
                oscReceiver.Reconfigure(previousOscHost, previousOscPort);
                throw;
            }
        }

        await outputManager.ReloadAsync();
        await outputManager.ConnectEnabledAsync();
        save.Save();
        Log("[Config] Updated from WebUI.");
        return Results.Ok(save);
    }
    catch (Exception ex)
    {
        LogError($"[Config] Update failed: {ex.Message}");
        return Results.BadRequest(new { ok = false, error = ex.Message });
    }
});
app.MapGet("/api/state/overview", () => Results.Ok(BuildOverviewSnapshot()));
app.MapGet("/api/state/logs", () => Results.Ok(logBuffer.Snapshot()));
app.MapPost("/api/control/loop/emergency-stop", () =>
{
    routine.EmergencyStop();
    return Results.Ok(new { ok = true, routine.IsEmergency });
});
app.MapPost("/api/control/loop/clear-emergency", () =>
{
    routine.ClearEmergency();
    return Results.Ok(new { ok = true, routine.IsEmergency });
});

app.MapPut("/api/input/mode", (InputModeRequest request) =>
{
    if (!Enum.TryParse<InputMode>(request.Mode, ignoreCase: true, out var mode))
        return Results.BadRequest(new { ok = false, error = $"Unknown input mode: {request.Mode}" });

    routine.SetInputMode(mode);
    return Results.Ok(new { ok = true, mode = routine.CurrentInputMode.ToString().ToLowerInvariant() });
});

app.MapPut("/api/input/manual", (ManualInputRequest request) =>
{
    var cmd = new DeviceCommand
    {
        L0 = Math.Clamp(request.L0, 0f, 1f),
        R0 = Math.Clamp(request.R0, 0f, 1f),
        R1 = Math.Clamp(request.R1, 0f, 1f),
        R2 = Math.Clamp(request.R2, 0f, 1f),
        L1 = Math.Clamp(request.L1, 0f, 1f),
        L2 = Math.Clamp(request.L2, 0f, 1f),
        Vibrate = Math.Clamp(request.Vibrate, 0f, 1f),
        GateOpen = request.GateOpen,
    };

    if (request.Enabled)
    {
        routine.SetManualOverride(cmd);
        routine.SetInputMode(InputMode.Manual);
    }
    else
    {
        routine.ClearManualOverride();
    }

    return Results.Ok(new
    {
        ok = true,
        inputMode = routine.CurrentInputMode.ToString().ToLowerInvariant(),
        command = routine.ManualOverrideCommand,
    });
});

app.MapDelete("/api/input/manual", () =>
{
    routine.ClearManualOverride();
    return Results.Ok(new
    {
        ok = true,
        inputMode = routine.CurrentInputMode.ToString().ToLowerInvariant(),
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
        scriptInput.Load(file.FileName, stream);
        scriptInput.Configure(loop: loop, speed: speed);
        routine.SetInputMode(InputMode.Script);
        Log($"[ScriptInput] Loaded: {file.FileName}");

        return Results.Ok(new
        {
            ok = true,
            inputMode = routine.CurrentInputMode.ToString().ToLowerInvariant(),
            script = scriptInput.GetSnapshot(),
        });
    }
    catch (Exception ex)
    {
        LogError($"[ScriptInput] Load failed: {ex.Message}");
        return Results.BadRequest(new { ok = false, error = ex.Message });
    }
});

app.MapPost("/api/input/script/play", (ScriptPlaybackRequest request) =>
{
    try
    {
        var snapshot = scriptInput.Play(request.Restart, request.Loop, request.Speed);
        routine.SetInputMode(InputMode.Script);
        Log($"[ScriptInput] Playback started: {snapshot.FileName}");
        return Results.Ok(new
        {
            ok = true,
            inputMode = routine.CurrentInputMode.ToString().ToLowerInvariant(),
            script = snapshot,
        });
    }
    catch (Exception ex)
    {
        LogError($"[ScriptInput] Play failed: {ex.Message}");
        return Results.BadRequest(new { ok = false, error = ex.Message });
    }
});

app.MapPost("/api/input/script/pause", () =>
{
    var snapshot = scriptInput.Pause();
    Log("[ScriptInput] Playback paused.");
    return Results.Ok(new { ok = true, script = snapshot });
});

app.MapPost("/api/input/script/stop", () =>
{
    var snapshot = scriptInput.Stop();
    Log("[ScriptInput] Playback stopped.");
    return Results.Ok(new { ok = true, script = snapshot });
});

app.MapPost("/api/control/intiface/connect", async () =>
{
    var ok = await ConnectIntifaceAsync();
    var primary = save.GetPrimaryOutput(OutputDeviceType.Intiface);
    var message = ok
        ? "Intiface connected."
        : save.Intiface.ManageEngineProcess
            ? "Intiface connection failed. Ensure intiface-engine.exe exists locally or disable engine management."
            : "Intiface connection failed. Check the configured WebSocket address and whether Intiface Central is running.";
    return Results.Ok(new { ok, connected = outputManager.IsConnected(primary?.Id), message });
});
app.MapPost("/api/control/intiface/disconnect", async () =>
{
    await DisconnectIntifaceAsync();
    var primary = save.GetPrimaryOutput(OutputDeviceType.Intiface);
    return Results.Ok(new { ok = true, connected = outputManager.IsConnected(primary?.Id), message = "Intiface disconnected." });
});
app.MapPost("/api/control/intiface/scan-start", async () =>
{
    await outputManager.StartPrimaryScanAsync(OutputDeviceType.Intiface);
    return Results.Ok(new { ok = true });
});
app.MapPost("/api/control/intiface/scan-stop", async () =>
{
    await outputManager.StopPrimaryScanAsync(OutputDeviceType.Intiface);
    return Results.Ok(new { ok = true });
});

app.MapPost("/api/control/output/{outputId}/connect", async (string outputId) =>
{
    var output = save.FindOutput(outputId);
    if (output is null)
        return Results.NotFound(new { ok = false, error = "输出不存在。" });

    var ok = await ConnectOutputAsync(outputId);
    return Results.Ok(new
    {
        ok,
        connected = outputManager.IsConnected(outputId),
        outputId,
        type = output.Type,
        message = ok ? $"{output.Name} 已连接。" : $"{output.Name} 连接失败。",
    });
});

app.MapPost("/api/control/output/{outputId}/disconnect", async (string outputId) =>
{
    var output = save.FindOutput(outputId);
    if (output is null)
        return Results.NotFound(new { ok = false, error = "输出不存在。" });

    await DisconnectOutputAsync(outputId);
    return Results.Ok(new
    {
        ok = true,
        connected = outputManager.IsConnected(outputId),
        outputId,
        type = output.Type,
        message = $"{output.Name} 已断开。",
    });
});

app.MapPost("/api/control/output/{outputId}/scan-start", async (string outputId) =>
{
    var output = save.FindOutput(outputId);
    if (output is null)
        return Results.NotFound(new { ok = false, error = "输出不存在。" });
    if (output.Type != OutputDeviceType.Intiface)
        return Results.BadRequest(new { ok = false, error = "只有 Intiface 输出支持扫描。" });

    await outputManager.StartScanAsync(outputId);
    return Results.Ok(new { ok = true, outputId });
});

app.MapPost("/api/control/output/{outputId}/scan-stop", async (string outputId) =>
{
    var output = save.FindOutput(outputId);
    if (output is null)
        return Results.NotFound(new { ok = false, error = "输出不存在。" });
    if (output.Type != OutputDeviceType.Intiface)
        return Results.BadRequest(new { ok = false, error = "只有 Intiface 输出支持扫描。" });

    await outputManager.StopScanAsync(outputId);
    return Results.Ok(new { ok = true, outputId });
});

app.MapPost("/api/control/tcode/connect", async () =>
{
    var ok = await ConnectTCodeAsync();
    var primary = save.GetPrimaryOutput(OutputDeviceType.TCodeSerial);
    var message = ok
        ? $"TCode connected: {save.TCode.ComPort}"
        : "TCode connection failed. Check the COM port, driver, and whether another app is already using the device.";
    return Results.Ok(new { ok, connected = outputManager.IsConnected(primary?.Id), message });
});
app.MapPost("/api/control/tcode/disconnect", async () =>
{
    await DisconnectTCodeAsync();
    var primary = save.GetPrimaryOutput(OutputDeviceType.TCodeSerial);
    return Results.Ok(new { ok = true, connected = outputManager.IsConnected(primary?.Id), message = "TCode disconnected." });
});

app.MapPost("/api/control/udp/connect", async () =>
{
    var ok = await ConnectTCodeUdpAsync();
    var primary = save.GetPrimaryOutput(OutputDeviceType.TCodeUdp);
    var message = ok
        ? $"UDP connected: {save.UdpTCode.Host}:{save.UdpTCode.Port}"
        : "UDP connection failed. Check host/port and whether target accepts TCode over UDP.";
    return Results.Ok(new { ok, connected = outputManager.IsConnected(primary?.Id), message });
});
app.MapPost("/api/control/udp/disconnect", async () =>
{
    await DisconnectTCodeUdpAsync();
    var primary = save.GetPrimaryOutput(OutputDeviceType.TCodeUdp);
    return Results.Ok(new { ok = true, connected = outputManager.IsConnected(primary?.Id), message = "UDP disconnected." });
});

app.MapPost("/api/control/tcp/connect", async () =>
{
    var ok = await ConnectTCodeTcpAsync();
    var primary = save.GetPrimaryOutput(OutputDeviceType.TCodeTcp);
    var message = ok
        ? $"TCP connected: {save.TcpTCode.Host}:{save.TcpTCode.Port}"
        : "TCP connection failed. Check host/port and whether target accepts TCode over TCP.";
    return Results.Ok(new { ok, connected = outputManager.IsConnected(primary?.Id), message });
});
app.MapPost("/api/control/tcp/disconnect", async () =>
{
    await DisconnectTCodeTcpAsync();
    var primary = save.GetPrimaryOutput(OutputDeviceType.TCodeTcp);
    return Results.Ok(new { ok = true, connected = outputManager.IsConnected(primary?.Id), message = "TCP disconnected." });
});

app.Map("/api/ws", async context =>
{
    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    using var socket = await context.WebSockets.AcceptWebSocketAsync();

    while (!context.RequestAborted.IsCancellationRequested && socket.State == WebSocketState.Open)
    {
        var snapshotJson = JsonSerializer.Serialize(new
        {
            type = "state",
            data = BuildOverviewSnapshot(),
            logs = logBuffer.Snapshot(50),
        }, wsJsonOptions);

        var bytes = Encoding.UTF8.GetBytes(snapshotJson);
        await socket.SendAsync(bytes, WebSocketMessageType.Text, true, context.RequestAborted);

        await Task.Delay(TimeSpan.FromMilliseconds(250), context.RequestAborted);
    }

    if (socket.State == WebSocketState.Open)
        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
});

app.Lifetime.ApplicationStopping.Register(() =>
{
    Log("[Sensa] Shutting down…");
    recorder.Stop();
    outputManager.DisposeAsync().AsTask().GetAwaiter().GetResult();
    oscReceiver.Stop();
    oscReceiver.Dispose();
    routine.Dispose();
    save.Save();
});

oscReceiver.Start();
Log($"[OSC] Listening on {save.Osc.ReceiverHost}:{save.Osc.ReceiverPort}");

await outputManager.ConnectEnabledAsync();

routine.Start();
Log($"[WebUI] Available at {uiUrl}");

if (save.WebUi.AutoOpenBrowser)
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

await routine.StopAsync();
routine.Dispose();
oscReceiver.Stop();
oscReceiver.Dispose();
await outputManager.DisposeAsync();
save.Save();

public sealed record InputModeRequest(string Mode);

public sealed record ManualInputRequest(
    bool Enabled,
    float L0,
    float R0,
    float R1,
    float R2,
    float L1,
    float L2,
    float Vibrate,
    bool GateOpen);

public sealed record ScriptPlaybackRequest(
    bool Restart,
    bool? Loop,
    double? Speed);
