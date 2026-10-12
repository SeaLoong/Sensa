# Sensa Unity world laboratory

This is a device-free PC Worlds test harness. Open `Generated/SensaLab.unity`.

- Enter Play Mode / ClientSim to animate the root marker, calculate actual SDK Contact proximity, and run Udon GPU readback with CRC validation.
- The left small cube pauses motion; the right cube toggles the desktop-output experiment. Desktop output is OFF by default.
- The third cube toggles the camera-only prototype. Read `CAMERA-PROTOTYPE.md` before trying it; do not enable both output experiments together.
- GPU readback is deliberately throttled to every six Update frames. The board reports decoded age and maximum callback lag; these are local Udon diagnostics, not external capture latency.
- The local bone/PB station shows a grabbable sphere, native PhysBone state, target coordinates and eight native Contact samples. The automated run verifies its readout; actual player grabbing remains a client test.
- The SPS2 Plug/Socket station uses installed VRCFury authoring components and is baked by its normal world build/play hook. Legacy compatibility remains enabled.
- The paired three-marker sender can stimulate a compatible test avatar, but a world is not a substitute for uploading and wearing that avatar.
- The visible telemetry panel is deliberately visible for inspection. The separate desktop-output prefab is the experiment for a non-stereo fixed viewport, not a proven invisible avatar bridge.

Use `Tools > Sensa Lab > Run editor GPU validation` to write `Validation/editor-results.json`, `telemetry.png`, `camera-output.png`, and `world-preview.png` in the project root. It executes GPU rendering, packet CRC checks, camera rotations, SDK proximity calculations, and the optional SPS adapter's shader compilation/invalid-source checks. These are not HMD tests.

`Tools > Sensa > SPS GPU Model Probe (Experimental)` opens the model readback window. Select the baked Resolver and surface material after SPS has baked. It reads an unblended model centerline, not final mesh geometry.

`Tools > Sensa Lab > Run Play Mode validation (straight)` and `(offset and tilted)` bake a temporary scene and run a 12-second ClientSim check with real Udon readback and real SPS GPU sampling. Reports are in `Validation/` and `Validation/offset/`. The harness temporarily disables VRCFury's second Play Mode rebuild after explicitly baking, and restores the previous preference on exit. Use these menu entries for reproducible SPS tests; the original authoring scene remains unchanged. `Generated/BakedPlayValidation.unity` is a disposable preview referencing VRCFury temporary assets; rebuild it through the menu, not as a standalone permanent scene.

The world project is a separate, local-only Git repository. No remote is configured. Library/Temp/Logs/Builds are excluded. Installed package sources are recorded locally for reproducibility. Optional packages under `DisabledPackages~` are preserved but not loaded: their Harmony versions conflicted with SDK/UdonSharp during initial generation.

Source of truth: `F:/Code/Sensa/tools/unity-world-lab` and the shared Sensa GPU probe/protocol. Sync with `python -X utf8 scripts/install-world-lab.py "D:/VRChatProjects/Sensa Test World"`. The installer refuses to overwrite locally modified owned source files; generated scene assets are not overwritten by the sync. The scene generator also refuses to overwrite an existing scene.

Still requiring client validation: HMD visibility, avatar camera behavior, remote interactions, capture latency, minimized/occluded windows, Spout, and device calibration. No real device outputs are enabled by this harness.
