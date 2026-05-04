using System.Diagnostics;
using System.IO.Ports;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Json;
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
var oscReceiver = new OscReceiver(paramStore, port: save.Osc.ReceiverPort);
var recorder    = new RecordingBuffer();
var uiActions   = new UiActionQueue();

var tcode = new TCodeSerial(save.TCode);
var tcodeUdp = new TCodeUdp(save.TCode, save.UdpTCode);
var tcodeTcp = new TCodeTcp(save.TCode, save.TcpTCode);
IntifaceEngineHost? intifaceHost = null;
var intiface = new IntifaceTransmitter(save.Intiface);

intiface.OnLog += Log;

var routine = new Routine(save, paramStore, oscReceiver, uiActions, intiface, tcode, tcodeUdp, tcodeTcp, recorder);
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
    if (string.IsNullOrWhiteSpace(save.TCode.ComPort)) return Task.FromResult(false);
    try
    {
        tcode.Connect();
        Log($"[TCode] Connected: {save.TCode.ComPort}");
        return Task.FromResult(true);
    }
    catch (Exception ex)
    {
        LogError($"[TCode] Failed to connect: {ex.Message}");
        return Task.FromResult(false);
    }
}

Task DisconnectTCodeAsync()
{
    tcode.Disconnect();
    Log("[TCode] Disconnected.");
    return Task.CompletedTask;
}

Task<bool> ConnectTCodeUdpAsync()
{
    try
    {
        tcodeUdp.Connect();
        Log($"[TCode/UDP] Connected: {save.UdpTCode.Host}:{save.UdpTCode.Port}");
        return Task.FromResult(true);
    }
    catch (Exception ex)
    {
        LogError($"[TCode/UDP] Failed to connect: {ex.Message}");
        return Task.FromResult(false);
    }
}

Task DisconnectTCodeUdpAsync()
{
    tcodeUdp.Disconnect();
    Log("[TCode/UDP] Disconnected.");
    return Task.CompletedTask;
}

Task<bool> ConnectTCodeTcpAsync()
{
    try
    {
        tcodeTcp.Connect();
        Log($"[TCode/TCP] Connected: {save.TcpTCode.Host}:{save.TcpTCode.Port}");
        return Task.FromResult(true);
    }
    catch (Exception ex)
    {
        LogError($"[TCode/TCP] Failed to connect: {ex.Message}");
        return Task.FromResult(false);
    }
}

Task DisconnectTCodeTcpAsync()
{
    tcodeTcp.Disconnect();
    Log("[TCode/TCP] Disconnected.");
    return Task.CompletedTask;
}

async Task<bool> ConnectIntifaceAsync()
{
    try
    {
        if (save.Intiface.ManageEngineProcess)
        {
            if (intifaceHost?.IsRunning != true)
            {
                intifaceHost?.Dispose();
                intifaceHost = new IntifaceEngineHost(save.Intiface.Port);
                if (!intifaceHost.Start())
                {
                    Log("[Intiface] Skipping connection attempt because embedded engine is unavailable.");
                    return false;
                }
                await Task.Delay(1500);
            }
        }

        if (!intiface.IsConnected)
            await intiface.ConnectAsync();
        return intiface.IsConnected;
    }
    catch (Exception ex)
    {
        LogError($"[Intiface] Failed: {ex.Message}");
        return false;
    }
}

async Task DisconnectIntifaceAsync()
{
    await intiface.DisconnectAsync();
    intifaceHost?.Dispose();
    intifaceHost = null;
}

object BuildOverviewSnapshot()
{
    var cmd = routine.LastCommand;
    var paramCount = paramStore.AllPaths.Count();
    var devices = intiface.Devices.Select(device => new
    {
        name = device.Name,
        index = device.Index,
        positionFeatures = device.GetFeaturesWithOutput(Buttplug.Core.Messages.OutputType.Position).Count(),
        vibrateFeatures = device.GetFeaturesWithOutput(Buttplug.Core.Messages.OutputType.Vibrate).Count(),
    }).ToArray();

    return new
    {
        service = new
        {
            title = save.WebUi.Title,
            url = uiUrl,
            time = DateTimeOffset.Now,
        },
        loop = new
        {
            routine.IsRunning,
            routine.IsEmergency,
            routine.CurrentBpm,
            routine.ManualOverrideEnabled,
            command = cmd,
            manualCommand = routine.ManualOverrideCommand,
        },
        osc = new
        {
            save.Osc.ReceiverPort,
            parameterCount = paramCount,
        },
        tcode = new
        {
            connected = tcode.IsConnected,
            config = save.TCode,
        },
        udpTCode = new
        {
            connected = tcodeUdp.IsConnected,
            config = save.UdpTCode,
        },
        tcpTCode = new
        {
            connected = tcodeTcp.IsConnected,
            config = save.TcpTCode,
        },
        intiface = new
        {
            connected = intiface.IsConnected,
            config = save.Intiface,
            devices,
        },
        recording = new
        {
            recorder.IsActive,
            recorder.FrameCount,
        },
        signals = save.Signals.Select((signal, index) => new
        {
            index,
            signal,
            latest = paramStore.TryGet(signal.OscPath, out var entry)
                ? new { value = entry.Value.AsFloat(), entry.TimestampMs, type = entry.Value.Type.ToString() }
                : null,
        }).ToArray(),
    };
}

object BuildMeta()
{
    return new
    {
        name = "Sensa",
        mode = "web-service",
        webUi = new { save.WebUi.Host, save.WebUi.Port, save.WebUi.AutoOpenBrowser, save.WebUi.Title, url = uiUrl },
        enums = new
        {
            signalRoles = Enum.GetNames<SignalRole>(),
            curveTypes = Enum.GetNames<CurveType>(),
            idleBehaviors = Enum.GetNames<IdleBehavior>(),
        },
        endpoints = new[]
        {
            "/api/meta",
            "/api/meta/serial-ports",
            "/api/config",
            "/api/state/overview",
            "/api/state/parameters",
            "/api/state/logs",
            "/api/control/loop/start",
            "/api/control/loop/stop",
            "/api/control/loop/emergency-stop",
            "/api/control/loop/clear-emergency",
            "/api/control/intiface/connect",
            "/api/control/intiface/disconnect",
            "/api/control/tcode/connect",
            "/api/control/tcode/disconnect",
            "/api/control/udp/connect",
            "/api/control/udp/disconnect",
            "/api/control/tcp/connect",
            "/api/control/tcp/disconnect",
            "/api/control/recording/start",
            "/api/control/recording/stop",
            "/api/control/recording/export",
            "/api/manual-test",
            "/api/ws",
        },
    };
}

string[] BuildSerialPortList()
{
    try
    {
        return SerialPort.GetPortNames()
            .Where(static name => !string.IsNullOrWhiteSpace(name))
            .OrderBy(static name => name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
    catch (Exception ex)
    {
        LogError($"[Meta] Failed to enumerate serial ports: {ex.Message}");
        return Array.Empty<string>();
    }
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseWebSockets();

app.MapGet("/api/meta", () => Results.Ok(BuildMeta()));
app.MapGet("/api/meta/serial-ports", () => Results.Ok(BuildSerialPortList()));
app.MapGet("/api/config", () => Results.Ok(save));
app.MapPost("/api/config/save", () =>
{
    save.Save();
    Log("[Config] Saved.");
    return Results.Ok(new { ok = true });
});
app.MapPut("/api/config", async (SaveFile incoming) =>
{
    await RunOnLoopAsync(() =>
    {
        save.CopyFrom(incoming);
        routine.RebuildProcessors();
    });
    save.Save();
    Log("[Config] Updated from WebUI.");
    return Results.Ok(save);
});

app.MapGet("/api/state/overview", () => Results.Ok(BuildOverviewSnapshot()));
app.MapGet("/api/state/parameters", () =>
{
    var data = paramStore.AllPaths
        .OrderBy(path => path)
        .Select(path =>
        {
            paramStore.TryGet(path, out var entry);
            return new
            {
                path,
                value = entry.Value.AsFloat(),
                type = entry.Value.Type.ToString(),
                timestampMs = entry.TimestampMs,
            };
        });
    return Results.Ok(data);
});
app.MapGet("/api/state/logs", () => Results.Ok(logBuffer.Snapshot()));
app.MapGet("/api/state/recording/data", () => Results.Ok(recorder.TakeSnapshot().Select(f => new { ms = f.Ms, l0 = f.L0 })));

app.MapPost("/api/control/loop/start", () =>
{
    routine.Start();
    return Results.Ok(new { ok = true, routine.IsRunning });
});
app.MapPost("/api/control/loop/stop", async () =>
{
    await routine.StopAsync();
    return Results.Ok(new { ok = true, routine.IsRunning });
});
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

app.MapPost("/api/control/intiface/connect", async () =>
{
    var ok = await ConnectIntifaceAsync();
    var message = ok
        ? "Intiface connected."
        : save.Intiface.ManageEngineProcess
            ? "Intiface connection failed. Ensure intiface-engine.exe exists locally or disable engine management."
            : "Intiface connection failed. Check the configured WebSocket address and whether Intiface Central is running.";
    return Results.Ok(new { ok, connected = intiface.IsConnected, message });
});
app.MapPost("/api/control/intiface/disconnect", async () =>
{
    await DisconnectIntifaceAsync();
    return Results.Ok(new { ok = true, connected = intiface.IsConnected, message = "Intiface disconnected." });
});
app.MapPost("/api/control/intiface/scan-start", async () =>
{
    await intiface.StartScanAsync();
    return Results.Ok(new { ok = true });
});
app.MapPost("/api/control/intiface/scan-stop", async () =>
{
    await intiface.StopScanAsync();
    return Results.Ok(new { ok = true });
});

app.MapPost("/api/control/tcode/connect", async () =>
{
    var ok = await ConnectTCodeAsync();
    var message = ok
        ? $"TCode connected: {save.TCode.ComPort}"
        : "TCode connection failed. Check the COM port, driver, and whether another app is already using the device.";
    return Results.Ok(new { ok, connected = tcode.IsConnected, message });
});
app.MapPost("/api/control/tcode/disconnect", async () =>
{
    await DisconnectTCodeAsync();
    return Results.Ok(new { ok = true, connected = tcode.IsConnected, message = "TCode disconnected." });
});
app.MapPost("/api/control/tcode/park", () =>
{
    tcode.Park();
    tcodeUdp.Park();
    tcodeTcp.Park();
    return Results.Ok(new { ok = true });
});

app.MapPost("/api/control/udp/connect", async () =>
{
    var ok = await ConnectTCodeUdpAsync();
    var message = ok
        ? $"UDP connected: {save.UdpTCode.Host}:{save.UdpTCode.Port}"
        : "UDP connection failed. Check host/port and whether target accepts TCode over UDP.";
    return Results.Ok(new { ok, connected = tcodeUdp.IsConnected, message });
});
app.MapPost("/api/control/udp/disconnect", async () =>
{
    await DisconnectTCodeUdpAsync();
    return Results.Ok(new { ok = true, connected = tcodeUdp.IsConnected, message = "UDP disconnected." });
});

app.MapPost("/api/control/tcp/connect", async () =>
{
    var ok = await ConnectTCodeTcpAsync();
    var message = ok
        ? $"TCP connected: {save.TcpTCode.Host}:{save.TcpTCode.Port}"
        : "TCP connection failed. Check host/port and whether target accepts TCode over TCP.";
    return Results.Ok(new { ok, connected = tcodeTcp.IsConnected, message });
});
app.MapPost("/api/control/tcp/disconnect", async () =>
{
    await DisconnectTCodeTcpAsync();
    return Results.Ok(new { ok = true, connected = tcodeTcp.IsConnected, message = "TCP disconnected." });
});

app.MapPost("/api/control/recording/start", () =>
{
    recorder.Start();
    Log("[Recording] Started.");
    return Results.Ok(new { ok = true, recorder.IsActive, recorder.FrameCount });
});
app.MapPost("/api/control/recording/stop", () =>
{
    recorder.Stop();
    Log("[Recording] Stopped.");
    return Results.Ok(new { ok = true, recorder.IsActive, recorder.FrameCount });
});
app.MapPost("/api/control/recording/export", () =>
{
    var path = FunscriptExporter.Export(recorder);
    if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        return Results.BadRequest(new { ok = false, error = "No recording data available." });
    return Results.Ok(new { ok = true, path });
});

app.MapPut("/api/manual-test", (ManualTestRequest request) =>
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
        routine.SetManualOverride(cmd);
    else
        routine.ClearManualOverride();

    return Results.Ok(new { ok = true, routine.ManualOverrideEnabled, command = routine.ManualOverrideCommand });
});
app.MapDelete("/api/manual-test", () =>
{
    routine.ClearManualOverride();
    return Results.Ok(new { ok = true, routine.ManualOverrideEnabled });
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
    tcode.Park();
    tcode.Dispose();
    tcodeUdp.Park();
    tcodeUdp.Dispose();
    tcodeTcp.Park();
    tcodeTcp.Dispose();
    oscReceiver.Stop();
    oscReceiver.Dispose();
    routine.Dispose();
    intifaceHost?.Dispose();
    save.Save();
});

oscReceiver.Start();
Log($"[OSC] Listening on UDP :{save.Osc.ReceiverPort}");

if (save.TCode.Enabled && !string.IsNullOrWhiteSpace(save.TCode.ComPort))
    await ConnectTCodeAsync();

if (save.UdpTCode.Enabled)
    await ConnectTCodeUdpAsync();

if (save.TcpTCode.Enabled)
    await ConnectTCodeTcpAsync();

if (save.Intiface.Enabled)
    await ConnectIntifaceAsync();

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
tcode.Park();
tcode.Dispose();
tcodeUdp.Park();
tcodeUdp.Dispose();
tcodeTcp.Park();
tcodeTcp.Dispose();
await intiface.DisposeAsync();
intifaceHost?.Dispose();
save.Save();

public sealed record ManualTestRequest(
    bool Enabled,
    float L0,
    float R0,
    float R1,
    float R2,
    float L1,
    float L2,
    float Vibrate,
    bool GateOpen);
