using System.Numerics;
using ImGuiNET;
using Veldrid;
using Veldrid.Sdl2;
using Veldrid.StartupUtilities;
using Sensa.Config;
using Sensa.Core;
using Sensa.ApplicationLoop;
using Sensa.UiActions;
using Sensa.ServiceRecording;

namespace Sensa.UiImGui;

/// <summary>
/// SDL2 + Veldrid + ImGui.NET main application window.
/// Runs the UI on a dedicated thread.  All mutable interactions are
/// forwarded to the main Routine via UiActionQueue.
/// </summary>
public sealed class UiMainApplication : IDisposable
{
    // Dependencies (injected via constructor)
    private readonly SaveFile           _save;
    private readonly ParameterStore     _store;
    private readonly Routine            _routine;
    private readonly RecordingBuffer?   _recorder;
    private readonly UiActionQueue      _actions;

    // Veldrid / SDL2
    private Sdl2Window?      _window;
    private GraphicsDevice?  _gd;
    private CommandList?     _cl;
    private ImGuiRenderer?   _imgui;

    private bool _running = false;

    // ── UI State ────────────────────────────────────────────────
    private int    _selectedSignal = 0;
    private bool   _showDeviceWindow = false;
    private bool   _showRecordingWindow = false;
    private string _newOscPath = "";
    private string _tcodePort  = "";

    // History buffer for the L0 sparkline (ring buffer, 200 samples)
    private float[] _l0History = new float[200];
    private int     _l0Idx = 0;

    // ── Log ─────────────────────────────────────────────────────
    private readonly Queue<string> _logLines = new();
    private const int MaxLogLines = 400;

    public UiMainApplication(
        SaveFile save, ParameterStore store, Routine routine,
        UiActionQueue actions, RecordingBuffer? recorder = null)
    {
        _save     = save;
        _store    = store;
        _routine  = routine;
        _actions  = actions;
        _recorder = recorder;
        _tcodePort = save.TCode.ComPort;

        routine.OnLog += line =>
        {
            lock (_logLines)
            {
                _logLines.Enqueue(line);
                if (_logLines.Count > MaxLogLines) _logLines.Dequeue();
            }
        };
    }

    // ───────────────────────────────────────────────────────────────────

    public void Run()
    {
        _running = true;

        VeldridStartup.CreateWindowAndGraphicsDevice(
            new WindowCreateInfo(50, 50, 1100, 720, WindowState.Normal, "Sensa"),
            new GraphicsDeviceOptions(false, null, true),
            GraphicsBackend.OpenGL,
            out _window!,
            out _gd!);

        _window.Resized += () => { _gd.MainSwapchain.Resize((uint)_window.Width, (uint)_window.Height); _imgui?.WindowResized(_window.Width, _window.Height); };

        _cl    = _gd.ResourceFactory.CreateCommandList();
        _imgui = new ImGuiRenderer(_gd, _gd.MainSwapchain.Framebuffer.OutputDescription, _window.Width, _window.Height);

        ImGui.GetIO().ConfigFlags |= ImGuiConfigFlags.DockingEnable;

        while (_running && _window.Exists)
        {
            var snapshot = _window.PumpEvents();
            if (!_window.Exists) break;

            _imgui.Update(1f / 60f, snapshot);

            RenderFrame();

            _cl.Begin();
            _cl.SetFramebuffer(_gd.MainSwapchain.Framebuffer);
            _cl.ClearColorTarget(0, new RgbaFloat(0.12f, 0.12f, 0.14f, 1f));
            _imgui.Render(_gd, _cl);
            _cl.End();
            _gd.SubmitCommands(_cl);
            _gd.SwapBuffers(_gd.MainSwapchain);
        }
    }

    public void RequestStop() => _running = false;

    // ───────────────────────────────────────────────────────────────────

    private void RenderFrame()
    {
        // Feed L0 history
        var cmd = _routine.LastCommand;
        _l0History[_l0Idx] = cmd.L0;
        _l0Idx = (_l0Idx + 1) % _l0History.Length;

        ImGui.DockSpaceOverViewport(0, ImGui.GetMainViewport(), ImGuiDockNodeFlags.PassthruCentralNode);

        DrawMenuBar();
        DrawMainPanel(cmd);
        DrawSignalPanel();
        DrawRoutingPanel();
        DrawLogPanel();

        if (_showDeviceWindow)  DrawDeviceWindow();
        if (_showRecordingWindow && _recorder != null) DrawRecordingWindow();
    }

    // ── Menu bar ──────────────────────────────────────────────────────

    private void DrawMenuBar()
    {
        if (!ImGui.BeginMainMenuBar()) return;

        if (ImGui.BeginMenu("File"))
        {
            if (ImGui.MenuItem("Save Config"))
                _actions.Enqueue(() => _save.Save());
            if (ImGui.MenuItem("Exit"))
                RequestStop();
            ImGui.EndMenu();
        }

        if (ImGui.BeginMenu("View"))
        {
            ImGui.MenuItem("Devices", null, ref _showDeviceWindow);
            ImGui.MenuItem("Recording", null, ref _showRecordingWindow);
            ImGui.EndMenu();
        }

        ImGui.EndMainMenuBar();
    }

    // ── Main status panel ─────────────────────────────────────────────

    private void DrawMainPanel(DeviceCommand cmd)
    {
        ImGui.SetNextWindowSize(new Vector2(300, 340), ImGuiCond.FirstUseEver);
        if (!ImGui.Begin("Status")) { ImGui.End(); return; }

        // Emergency stop button
        ImGui.PushStyleColor(ImGuiCol.Button, new Vector4(0.7f, 0.1f, 0.1f, 1f));
        if (ImGui.Button("EMERGENCY STOP", new Vector2(-1, 40)))
            _actions.Enqueue(() => _routine.EmergencyStop());
        ImGui.PopStyleColor();

        if (_routine.IsEmergency && ImGui.Button("Clear Emergency", new Vector2(-1, 0)))
            _actions.Enqueue(() => _routine.ClearEmergency());

        ImGui.Separator();

        ImGui.Text($"L0:  {cmd.L0:F3}   Vibrate: {cmd.Vibrate:F3}");
        ImGui.Text($"BPM: {_routine.CurrentBpm:F1}");

        var histOffset = _l0Idx;
        ImGui.PlotLines("##L0", ref _l0History[0], _l0History.Length, histOffset,
            "L0 depth", 0f, 1f, new Vector2(-1, 60));

        ImGui.Separator();

        // Connection toggles
        bool loopOn = _routine.IsRunning;
        if (ImGui.Checkbox("Loop Running", ref loopOn))
        {
            if (loopOn) _actions.Enqueue(() => _routine.Start());
            else        _actions.Enqueue(() => { _ = _routine.StopAsync(); });
        }

        ImGui.End();
    }

    // ── Signal configuration panel ────────────────────────────────────

    private void DrawSignalPanel()
    {
        ImGui.SetNextWindowSize(new Vector2(420, 380), ImGuiCond.FirstUseEver);
        if (!ImGui.Begin("Signals")) { ImGui.End(); return; }

        var signals = _save.Signals;

        // Clamp selection so a stale index after signal removal never causes an out-of-bounds read.
        if (_selectedSignal >= signals.Count)
            _selectedSignal = Math.Max(0, signals.Count - 1);

        // Sidebar list
        ImGui.BeginGroup();
        for (int i = 0; i < signals.Count; i++)
        {
            bool sel = i == _selectedSignal;
            if (ImGui.Selectable(signals[i].OscPath, sel, ImGuiSelectableFlags.None, new Vector2(160, 0)))
                _selectedSignal = i;
        }
        ImGui.Spacing();
        if (ImGui.Button("+ Add"))
        {
            ImGui.OpenPopup("AddSignal");
        }
        DrawAddSignalPopup();
        ImGui.EndGroup();

        ImGui.SameLine();
        ImGui.BeginGroup();

        if (_selectedSignal >= 0 && _selectedSignal < signals.Count)
        {
            var sig = signals[_selectedSignal];

            ImGui.Text("OSC Path:");
            ImGui.SameLine();
            ImGui.TextDisabled(sig.OscPath);

            bool invert = sig.InvertDirection;
            if (ImGui.Checkbox("Invert", ref invert))
                _actions.Enqueue(() => sig.InvertDirection = invert);

            float alpha = sig.SmoothingAlpha;
            if (ImGui.SliderFloat("Smoothing α", ref alpha, 0.01f, 1.0f))
                _actions.Enqueue(() => sig.SmoothingAlpha = alpha);

            float dz = sig.DeadZone;
            if (ImGui.SliderFloat("Dead Zone", ref dz, 0f, 0.3f))
                _actions.Enqueue(() => sig.DeadZone = dz);

            int curveIdx = (int)sig.Curve;
            string[] curveNames = ["Linear", "Ease In", "Ease Out", "S-Curve"];
            if (ImGui.Combo("Curve", ref curveIdx, curveNames, curveNames.Length))
                _actions.Enqueue(() => sig.Curve = (CurveType)curveIdx);

            int roleIdx = (int)sig.Role;
            string[] roleNames = ["Depth", "AngleX", "AngleY", "Vibrate", "Gate", "BpmDrive"];
            if (ImGui.Combo("Role", ref roleIdx, roleNames, roleNames.Length))
                _actions.Enqueue(() => sig.Role = (SignalRole)roleIdx);

            ImGui.Spacing();
            // Live value
            if (_store.TryGet(sig.OscPath, out var paramEntry))
                ImGui.Text($"Current raw: {paramEntry.Value.AsFloat():F4}");
            else
                ImGui.TextDisabled("(no data received yet)");

            ImGui.Spacing();
            if (ImGui.Button("Remove", new Vector2(80, 0)))
                _actions.Enqueue(() => { signals.Remove(sig); _routine.RebuildProcessors(); });
        }

        ImGui.EndGroup();
        ImGui.End();
    }

    private void DrawAddSignalPopup()
    {
        if (!ImGui.BeginPopup("AddSignal")) return;
        ImGui.Text("OSC path:"); ImGui.SameLine();
        ImGui.InputText("##newpath", ref _newOscPath, 256);
        if (ImGui.Button("Add") && !string.IsNullOrWhiteSpace(_newOscPath))
        {
            var path = _newOscPath;
            _actions.Enqueue(() =>
            {
                _save.Signals.Add(new SignalConfig { OscPath = path });
                _routine.RebuildProcessors();
            });
            _newOscPath = "";
            ImGui.CloseCurrentPopup();
        }
        ImGui.SameLine();
        if (ImGui.Button("Cancel")) ImGui.CloseCurrentPopup();
        ImGui.EndPopup();
    }

    // ── Routing matrix panel ──────────────────────────────────────────

    private void DrawRoutingPanel()
    {
        ImGui.SetNextWindowSize(new Vector2(360, 200), ImGuiCond.FirstUseEver);
        if (!ImGui.Begin("Device Routing")) { ImGui.End(); return; }

        foreach (var route in _save.DeviceRoutes)
        {
            ImGui.Text($"{route.DeviceName}");
            ImGui.SameLine(160);
            bool l0 = route.SendL0;
            if (ImGui.Checkbox($"L0##{route.DeviceName}", ref l0))
                _actions.Enqueue(() => route.SendL0 = l0);
            ImGui.SameLine();
            bool vib = route.SendVibrate;
            if (ImGui.Checkbox($"Vibrate##{route.DeviceName}", ref vib))
                _actions.Enqueue(() => route.SendVibrate = vib);
        }

        if (_save.DeviceRoutes.Count == 0)
            ImGui.TextDisabled("No device routes configured.");

        ImGui.End();
    }

    // ── Log panel ─────────────────────────────────────────────────────

    private void DrawLogPanel()
    {
        ImGui.SetNextWindowSize(new Vector2(700, 160), ImGuiCond.FirstUseEver);
        if (!ImGui.Begin("Log")) { ImGui.End(); return; }

        ImGui.BeginChild("logscroll", Vector2.Zero, ImGuiChildFlags.None, ImGuiWindowFlags.HorizontalScrollbar);
        lock (_logLines)
        {
            foreach (var line in _logLines)
                ImGui.TextUnformatted(line);
        }
        if (ImGui.GetScrollY() >= ImGui.GetScrollMaxY())
            ImGui.SetScrollHereY(1.0f);
        ImGui.EndChild();

        ImGui.End();
    }

    // ── Device window ─────────────────────────────────────────────────

    private void DrawDeviceWindow()
    {
        if (!ImGui.Begin("Devices", ref _showDeviceWindow)) { ImGui.End(); return; }

        ImGui.Text("TCode Serial Port:");
        ImGui.SameLine();
        ImGui.InputText("##comport", ref _tcodePort, 32);
        ImGui.SameLine();
        if (ImGui.Button("Connect##tcode"))
        {
            var port = _tcodePort;
            _actions.Enqueue(() => _save.TCode.ComPort = port);
        }

        ImGui.Separator();
        ImGui.Text("Intiface WebSocket:");
        ImGui.SameLine();
        string wsAddr = _save.Intiface.WebsocketAddress;
        if (ImGui.InputText("##wsaddr", ref wsAddr, 128))
            _actions.Enqueue(() => _save.Intiface.WebsocketAddress = wsAddr);

        ImGui.End();
    }

    // ── Recording window ──────────────────────────────────────────────

    private void DrawRecordingWindow()
    {
        if (!ImGui.Begin("Recording", ref _showRecordingWindow)) { ImGui.End(); return; }

        bool active = _recorder!.IsActive;
        string label = active ? "Stop Recording" : "Start Recording";
        if (ImGui.Button(label, new Vector2(160, 0)))
            _actions.Enqueue(() => { if (_recorder.IsActive) _recorder.Stop(); else _recorder.Start(); });

        ImGui.SameLine();
        ImGui.Text($"Frames: {_recorder.FrameCount}");

        if (!active && _recorder.FrameCount > 0)
        {
            ImGui.Spacing();
            if (ImGui.Button("Export .funscript", new Vector2(160, 0)))
                _actions.Enqueue(() => FunscriptExporter.Export(_recorder));
        }

        ImGui.End();
    }

    // ─────────────────────────────────────────────────────────────────

    public void Dispose()
    {
        _imgui?.Dispose();
        _cl?.Dispose();
        _gd?.Dispose();
    }
}
