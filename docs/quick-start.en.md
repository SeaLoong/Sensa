# First run

[简体中文](quick-start.md) | **English**

Start with a simple flow to check source values and output results. Recording manual values as funscript is a useful first step; then add devices, OSC parameters or other applications. See [inputs, computation and outputs](signal-pipeline.en.md) for full setup. VRChat users can also explore measurement meanings in the [parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US).

## 1. Start

Download your operating system/CPU archive from [Releases](https://github.com/SeaLoong/Sensa/releases), extract it, run Sensa and open `http://127.0.0.1:5086`. Configuration defaults to `config.json` beside the program; `SENSA_CONFIG_PATH` selects another file. For initial testing, use `SENSA_CONFIG_PATH` to select a separate file and avoid reusing previously saved device addresses.

The UI detects language from URL, saved choice and system preferences, with a manual switch. [Language rules](languages.en.md)

## 2. Add an output

Add an output in Flow or Control: the device, application or recording file that receives Sensa results. Choose its type, then select source, target and range under its Input-to-output bindings. A simple flow can read Manual → L0 directly; select a computed signal when blending or processing is useful.

| Type | Check |
| --- | --- |
| TCode serial | Correct port, 115200/8N1, no other process holding it |
| TCode UDP/TCP | Actual host, port and transport; UDP has no execution acknowledgement |
| Intiface | Start an existing Central, then enter its service address; new outputs do not manage an engine |
| Intiface vibration | V0 by default; choose V1/V2, or explicitly L0 to convert depth into intensity |
| OSC parameter | Target IP/port, writable parameter address and Float/Int/Bool type; use the VRChat write-back option for its common endpoint |
| DG-LAB | Relay connection, DG-LAB 4 APP pairing, reported device/channel and user limit |
| MIDI CC | Available system output port, `CC/channel/controller` address and 0–127 range |
| Recording | Funscript by default; use track name `L0`, source Manual → L0 and input/output ranges of 0–1 |
| HTTP JSON/WebSocket JSON | Receiving service URL, target path and value type |
| MQTT | Broker address/port, publishing topic and selected signal bindings |

For a TCode output, first edit its axis profile in Settings: reduce travel and speed, and reverse direction if needed. Select that profile when saving the output. Intiface range/speed limits and stop controls come from your device or Central; check those settings, then test with small manual targets.

Save, enable the output and confirm its connection status. Add several outputs to use the same source or different sources. The UI shows the latest command target; for a motion device, inspect actual movement to check direction and travel.

## 3. Enable input and inspect results

In Control, select Manual, choose Apply input mode and enable input. Adjust L0 and send once, then inspect the binding's raw and converted values. A Recording output writes the values into its track; disabling input completes the segment for download or loading into the script player.

For a motion device, use small targets to check direction, travel and stopping. Continuous sending keeps sending the selected target. Emergency stop disables input; enable it again when ready after clearing the stop.

An already active input may send its current valid target immediately after connection, so check the input state before connecting. Configuration changes, mode changes and script replacement disable input; enable it again when ready.

## 4. Choose sources and add computation

- **OSC:** apply OSC, check the default `127.0.0.1:9001` listener and actual source, then inspect real parameter addresses. Choose one of the [five templates](presets.en.md), check the input range and conditions that permit motion (gates), then save and enable input. OGB may require the explicit enable heartbeat in receiver settings: heartbeats go to VRChat, normally on 9000; Sensa receives parameters on 9001.
- **Script:** load a valid funscript and inspect its L0 timeline, speed and loop. Apply Script, activate input and play. Pause stops automatic frames; explicit seek/step can still send a target while Script input is active. Stop resets the playback cursor to the beginning. Use emergency stop when you need to stop the device.
- **Contact direct tracking (SDK Beta):** install the supported beta SDK and build a dedicated own-root Sender/Receiver using the [Contact setup](contact-sdk.en.md). Inspect `Sensa/Contact/<id>/…`; calibrate X/Y/Z/Distance for local movement, or velocity/Speed/ProximitySpeed for movement strength. Save, allow experimental spatial input and enable OSC input.
- **Experimental root:** follow the [route guide](usage-scenarios.en.md) to configure Avatar measurement components or the desktop code reader. Confirm the correct object and valid coordinates in the panel. Record the motion start and end, map them to 0% and 100% output, and save. Then allow experimental spatial input and enable input.

- **Combined:** choose sources in calculations and output bindings, such as an OSC touch value multiplied by a manual intensity. Save the setup, apply Combined, then enable input. [Setup](signal-pipeline.en.md)

For weighting, smoothing or triggers, open Flow → Add computed signal, configure its operation and inputs, then Save calculations and mappings. Reference the result in each output's binding to send it to a device, OSC parameter, DG-LAB or Recording. Each output keeps its own range and destination. [One result, several outputs](signal-pipeline.en.md#one-result-several-outputs)

Parameters have different meanings: OGB usually reports proximity or estimated depth; SPS four-anchor tracking and Shader report a selected root in three dimensions relative to the Avatar. Contact direct tracking reports metre-based position plus relative velocity. [Positioning](positioning.en.md)

## 5. Save recordings and complete plans

Recording outputs save separate funscript tracks from selected bindings. Completed segments can be downloaded, loaded into the script player or used in calculations through Recording replay. Advanced diagnostics offer JSON Lines/CSV; L0 recording provides a quick export of the current main axis. [Recording and replay](signal-pipeline.en.md#record-and-inspect)

In Flow, expand Save and load a complete plan to export calculations, axis mappings, axis profiles and outputs together; inspect the import preview before applying it. Supported browsers automatically share the realtime connection across same-origin tabs, with independent drafts. [Plans and page connections](signal-pipeline.en.md#save-and-reuse-a-complete-plan)

On failure, disable input and inspect actual mode, source, mapping, gates and logs in order. Resolve the cause before resuming. [Full guide](guide.en.md) · [Features](features.en.md) · [Home](../README.md)
