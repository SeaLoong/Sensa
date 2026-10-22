# First run

[简体中文](quick-start.md) | **English**

First check that the device moves and stops as expected over a small range, then attach VRChat or a motion script. To explore the parameters first, open the [standalone explorer](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) directly in your browser.

## 1. Start

Download your operating system/CPU archive from [Releases](https://github.com/SeaLoong/Sensa/releases), extract it, run Sensa and open `http://127.0.0.1:5086`. Configuration defaults to `config.json` beside the program; `SENSA_CONFIG_PATH` selects another file. For initial testing, use `SENSA_CONFIG_PATH` to select a separate file and avoid reusing previously saved device addresses.

The UI detects language from URL, saved choice and system preferences, with a manual switch. [Language rules](languages.en.md)

## 2. Add an output

Use “Control” to add an output: the device or service that will receive Sensa commands.

| Type | Check |
| --- | --- |
| TCode serial | Correct port, 115200/8N1, no other process holding it |
| TCode UDP/TCP | Actual host, port and transport; UDP has no execution acknowledgement |
| Intiface | Start an existing Central, then enter its service address; new outputs do not manage an engine |
| Intiface vibration | V0 by default; choose V1/V2, or explicitly L0 to convert depth into intensity |

For a TCode output, first edit its axis profile in Settings: reduce travel and speed, and reverse direction if needed. Select that profile when saving the output. Intiface range/speed limits and stop controls come from your device or Central; check those settings, then test with small manual targets.

Check the destination and configuration before enabling the output and connecting. Displayed values are recently sent targets; observe the device itself to check whether it reached them.

## 3. Check manual direction and stop

Select “Manual”, click “Apply input mode”, then “Enable input”. Send one small target and check the direction. Continuous sending repeats the target you set; edit the target to change position. Try emergency stop: it should close input immediately. After clearing it, enable input again when ready.

An already active input may send its current valid target immediately after connection, so check the input state before connecting. Configuration changes, mode changes and script replacement disable input; enable it again when ready.

## 4. Attach one input

- **OSC:** apply OSC, check the default `127.0.0.1:9001` listener and actual source, then inspect real parameter addresses. Choose one of the [five templates](presets.en.md), check the input range and conditions that permit motion (gates), then save and enable input. OGB may require the explicit enable heartbeat in receiver settings: heartbeats go to VRChat, normally on 9000; Sensa receives parameters on 9001.
- **Script:** load a valid funscript and inspect its L0 timeline, speed and loop. Apply Script, activate input and play. Pause stops automatic frames; explicit seek/step can still send a target while Script input is active. Stop resets the playback cursor to the beginning. Use emergency stop when you need to stop the device.
- **Contact direct tracking (SDK Beta):** install the supported beta SDK and build a dedicated own-root Sender/Receiver using the [Contact setup](contact-sdk.en.md). Inspect `Sensa/Contact/<id>/…`; calibrate X/Y/Z/Distance for local movement, or velocity/Speed/ProximitySpeed for movement strength. Save, allow experimental spatial input and enable OSC input.
- **Experimental root:** follow the [route guide](usage-scenarios.en.md) to configure Avatar measurement components or the desktop code reader. Confirm the correct object and valid coordinates in the panel. Record the motion start and end, map them to 0% and 100% output, and save. Then allow experimental spatial input and enable input.

Parameters have different meanings: OGB usually reports proximity or estimated depth; four-anchor tracking and Shader report a selected root in three dimensions relative to the Avatar. Contact direct tracking reports metre-based position plus relative velocity. [Positioning](positioning.en.md)

## 5. Keep a reviewable result

Use L0 recording to capture depth targets. Read other axes and device state in their panels and logs. Stopping recording preserves the last-value duration. Exporting an active recording stops recording and leaves input in its current state. Restart requires confirmation, and cancel preserves the old buffer.

On failure, disable input and inspect actual mode, source, mapping, gates and logs in order. Resolve the cause before resuming. [Full guide](guide.en.md) · [Features](features.en.md) · [Home](../README.md)
