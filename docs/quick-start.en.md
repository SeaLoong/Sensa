# First run

[简体中文](quick-start.md) | **English**

Verify one small-range command path before attaching live data. To understand the geometry first, open the [standalone explorer](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US); it requires neither a device nor a running Sensa.

## 1. Start

Download your operating system/CPU archive from [Releases](https://github.com/SeaLoong/Sensa/releases), extract it, run Sensa and open `http://127.0.0.1:5086`. Configuration defaults to `config.json` beside the program; `SENSA_CONFIG_PATH` selects another file. Use isolated configuration for initial testing instead of reusing real-device destinations.

The UI detects language from URL, saved choice and system preferences, with a manual switch. [Language rules](languages.en.md)

## 2. Add an output

Use “Control” to add an output:

| Type | Check |
| --- | --- |
| TCode serial | Correct port, 115200/8N1, no other process holding it |
| TCode UDP/TCP | Actual host, port and transport; UDP has no execution acknowledgement |
| Intiface | Start an existing Central, then enter its service address; new outputs do not manage an engine |
| Intiface vibration | V0 by default; choose V1/V2, or explicitly L0 to convert depth into intensity |

After saving, explicitly enable that output and connect. Output values are recently sent commands, not device positions. Use “Settings” for axis range, limits, inversion and speed; start with a very small safe range.

## 3. Check manual direction and stop

Apply “Manual”, explicitly enable input and send one small target. Continuous sending follows edits; it does not oscillate automatically. Check that emergency stop closes input. Clearing it requires a separate reactivation and does not resume motion.

Connecting does not activate input, but an already active input may send its current valid target immediately after connection. Configuration changes, mode changes and script replacement disarm input.

## 4. Attach one input

- **OSC:** apply OSC, check the default `127.0.0.1:9001` listener and actual source, then inspect real parameter addresses. Choose one of the [three templates](presets.en.md), check ranges/gates, save and activate input. OGB may require the explicit enable heartbeat in receiver settings; its destination is normally VRChat on 9000, not Sensa on 9001.
- **Script:** load a valid funscript and inspect its L0 timeline, speed and loop. Apply Script, activate input and play. Pause stops automatic frames, but explicit seek/step can still send a target while Script input is active. Stop resets the cursor, not the mechanism.
- **Experimental root:** follow the [route guide](usage-scenarios.en.md), establish the producer, verify object/source/validity, capture two endpoints and save the mapping. Then separately allow experimental spatial input and activate input.

A familiar parameter name does not establish accurate position. Modern OGB estimates a radial ratio; fixed SPS and Shader provide Avatar-root-local positions. [Positioning](positioning.en.md)

## 5. Keep a reviewable result

Use L0 recording when needed. Stop preserves the last-value duration; exporting an active recording stops recording but does not disable input. Restart requires confirmation, and cancel preserves the old buffer. Recording excludes other axes, gate/stop events and hardware feedback.

On failure, disable input and inspect actual mode, source, mapping, gates and logs. Repeated reconnects or resends can hide the cause. [Full guide](guide.en.md) · [Features](features.en.md) · [Home](../README.md)
