# First run

[简体中文](quick-start.md) | **English**

First check that the device moves and stops as expected over a small range, then attach VRChat or a motion script. To explore the parameters first, open the [standalone explorer](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US); it requires neither a device nor a running Sensa.

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

Save, enable that output and connect. In “Settings”, reduce the axis travel range and speed first, and reverse direction if needed. Displayed values are recently sent targets; observe the device itself to check whether it reached them.

## 3. Check manual direction and stop

Select “Manual”, click “Apply input mode”, then “Enable input”. Send one small target and check the direction. Continuous sending follows your target edits rather than oscillating automatically. Try emergency stop: it should close input immediately. Clearing it still requires you to enable input again.

Connecting does not activate input, but an already active input may send its current valid target immediately after connection. Configuration changes, mode changes and script replacement disarm input.

## 4. Attach one input

- **OSC:** apply OSC, check the default `127.0.0.1:9001` listener and actual source, then inspect real parameter addresses. Choose one of the [three templates](presets.en.md), check the input range and conditions that permit motion (gates), then save and enable input. OGB may require the explicit enable heartbeat in receiver settings; its destination is normally VRChat on 9000, not Sensa on 9001.
- **Script:** load a valid funscript and inspect its L0 timeline, speed and loop. Apply Script, activate input and play. Pause stops automatic frames, but explicit seek/step can still send a target while Script input is active. Stop resets the cursor, not the mechanism.
- **Experimental root:** follow the [route guide](usage-scenarios.en.md) to configure Avatar measurement components or the desktop code reader. Confirm the correct object and valid coordinates in the panel. Record the motion start and end, map them to 0% and 100% output, and save. Then allow experimental spatial input and enable input.

Parameters have different meanings: OGB usually reports proximity or estimated depth; Sensa SPS and Shader report a selected root in three dimensions relative to the Avatar. [Positioning](positioning.en.md)

## 5. Keep a reviewable result

Use L0 recording when needed. Stop preserves the last-value duration; exporting an active recording stops recording but does not disable input. Restart requires confirmation, and cancel preserves the old buffer. Recording excludes other axes, gate/stop events and hardware feedback.

On failure, disable input and inspect actual mode, source, mapping, gates and logs. Repeated reconnects or resends can hide the cause. [Full guide](guide.en.md) · [Features](features.en.md) · [Home](../README.md)
