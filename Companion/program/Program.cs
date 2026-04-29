using Sensa.Config;
using Sensa.Core;
using Sensa.ApplicationLoop;
using Sensa.TransmitIntiface;
using Sensa.TransmitTCode;
using Sensa.ServiceRecording;
using Sensa.UiActions;
using Sensa.UiImGui;

// ═══════════════════════════════════════════════════════════════════════
//  Sensa Companion – entry point
//  Composition root: load config, wire all services, start UI + loop.
// ═══════════════════════════════════════════════════════════════════════

Console.Title = "Sensa";
Console.WriteLine("Sensa v0.1.0 starting…");

// ── Load config ──────────────────────────────────────────────────────
var save = SaveFile.Load();

// ── Core services ────────────────────────────────────────────────────
var paramStore  = new ParameterStore();
var oscReceiver = new OscReceiver(paramStore, port: save.Osc.ReceiverPort);

// ── Optional transmitters ────────────────────────────────────────────
TCodeSerial? tcode = null;
if (!string.IsNullOrWhiteSpace(save.TCode.ComPort))
{
    tcode = new TCodeSerial(save.TCode);
    try   { tcode.Connect(); Console.WriteLine($"[TCode] Connected: {save.TCode.ComPort}"); }
    catch (Exception ex) { Console.Error.WriteLine($"[TCode] Failed to connect: {ex.Message}"); tcode = null; }
}

IntifaceTransmitter? intiface = null;
IntifaceEngineHost?  intifaceHost = null;

if (save.Intiface.Enabled)
{
    if (save.Intiface.ManageEngineProcess)
    {
        intifaceHost = new IntifaceEngineHost(save.Intiface.Port);
        intifaceHost.Start();
        // Give the engine a moment to start before we connect
        await Task.Delay(1500);
    }

    intiface = new IntifaceTransmitter(save.Intiface);
    intiface.OnLog += Console.WriteLine;
    try   { await intiface.ConnectAsync(); }
    catch (Exception ex) { Console.Error.WriteLine($"[Intiface] Failed: {ex.Message}"); intiface = null; }
}

// ── Recording ────────────────────────────────────────────────────────
var recorder = new RecordingBuffer();

// ── UI ↔ Loop bridge ─────────────────────────────────────────────────
var uiActions = new UiActionQueue();

// ── Main routine ─────────────────────────────────────────────────────
var routine = new Routine(save, paramStore, oscReceiver, uiActions,
                          intiface, tcode, recorder);

// ── Start OSC receiver ───────────────────────────────────────────────
oscReceiver.Start();
Console.WriteLine($"[OSC] Listening on UDP :{save.Osc.ReceiverPort}");

// ── Start main loop ──────────────────────────────────────────────────
routine.Start();

// ── UI (runs on the calling/main thread) ────────────────────────────
var ui = new UiMainApplication(save, paramStore, routine, uiActions, recorder);
try
{
    ui.Run();
}
finally
{
    // ── Shutdown sequence ────────────────────────────────────────────
    Console.WriteLine("[Sensa] Shutting down…");

    await routine.StopAsync();
    routine.Dispose();

    oscReceiver.Stop();
    oscReceiver.Dispose();

    tcode?.Park();
    tcode?.Dispose();

    if (intiface != null) await intiface.DisposeAsync();
    intifaceHost?.Dispose();

    ui.Dispose();

    // Persist any config changes made during the session
    save.Save();
    Console.WriteLine("[Sensa] Goodbye.");
}
