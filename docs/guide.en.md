# Workbench guide

[简体中文](guide.md) | **English**

Sensa groups daily work into **Control**, **OSC**, **Flow** and **Settings**. The header shows the current input mode, input activation and emergency stop. Desktop navigation sits on the left and moves below the header in narrow windows. [First run](quick-start.en.md) · [WebSensa](websensa.en.md)

| You want to | Open |
| --- | --- |
| Move axes or play a funscript | Control |
| Read parameters, calibrate or forward OSC | OSC |
| Add calculations, outputs and recordings | Flow |
| Set axes, protocol listeners and logs | Settings |
| Control from the browser without launching Sensa | [WebSensa](https://sealoong.github.io/Sensa/websensa/) |

## Prepare, apply the input mode, then enable input

Choose sources, prepare the outputs and save. In Control, apply **Manual**, **OSC**, **Script**, **Protocol** or **Combined**, then enable input. Adding a protocol source makes the Protocol tab available.

Each output has its own connection and enabled state. A connected output receives the current valid target while input is active. Saving configuration, changing the applied mode or loading a different script switches input off; enable it when the new setup is ready. Emergency stop stops all outputs and stays active until cleared.

## Control

### Manual and script

Manual shows L0/L1/L2 first; expand rotation, vibration and auxiliary controls for all twelve axes. Adjust a slider/value and choose **Send once**, or enable **Live updates**. Send settings use the selected axis profile or an explicit duration/speed.

Load a funscript to see its curve and playback cursor. Playback offers **0.1–4×**, looping, A–B, timecodes and keyframe navigation. Pause retains the cursor and target. Seeking to the beginning uses the file's first target; Stop resets time and the player target to zero. With Script input enabled, seeking/stepping can send the selected target while paused.

### Combined input

Use Combined when several source kinds should contribute. For example, a touch reading sets strength, a manual slider scales it and a script supplies rhythm. Create their calculation in Flow, save it and choose the result in output bindings. [Worked example](signal-pipeline.en.md#one-result-several-outputs)

### Outputs

Add an output, choose its type and enter its connection. In **Input-to-output bindings**, select the source, target and ranges. Save, connect and enable the output. Its diagnostics show raw values, converted values and recent commands.

| Output | Main settings |
| --- | --- |
| TCode | Serial/UDP/TCP endpoint and axis profile |
| Intiface | Central address, device and feature mapping |
| Handy/Lovense/Autoblow/VacuGlide | Device API connection and supported controls/scripts |
| OSC | Destination IP/port, path and value type |
| DG-LAB | Relay, APP pairing, device, channel and limit |
| MIDI / HTTP / WebSocket / MQTT | Port or endpoint, address/controller/topic and value range |
| Recording | Source, track name and file format |

Configure physical direction and travel in the TCode axis profile. Intiface scans Central for the device's feature list; explicit feature mappings connect rotation and other features to selected source axes. [Connection reference](protocol-inputs.en.md) · [Binding setup](signal-pipeline.en.md#add-outputs-and-bindings)

### Receive a website's serial or Bluetooth commands

For an editable Intiface endpoint, use Sensa's Buttplug virtual-device input. For a serial or Bluetooth source, use the [protocol bridge tools](../tools/protocol-bridge/README.md) to feed Sensa's TCode input. The same flow can then send the controls to OSR or another destination.

Several web protocols can share one listener port with distinct paths. Independent sources retain their own channels and sessions. [Shared-port and bridge examples](protocol-inputs.en.md)

### L0 recording

The quick L0 recorder captures the current main-axis trajectory. Finish and export a single-axis funscript, optionally simplifying its curve. The panel retains the final hold and reports its 100000-frame limit. Restarting asks before replacing the existing recording.

### Recording outputs

Use a Recording output to choose a specific source, save several tracks or record alongside a device. Funscript tracks use converted 0–1 values. Each valid segment becomes a file for download, playback or calculation replay. JSON Lines/CSV retain diagnostic samples. [Recording and replay](signal-pipeline.en.md#record-and-inspect)

## OSC

### Parameters and sources

Apply OSC or Combined, then inspect incoming values. **Browse source** filters the list; **Use source** selects the runtime source. Search, categories and pins work across the complete catalog, with up to 100 rows per page.

Open a parameter for its meaning, type, unit and sample time. **Freeze preview** holds the displayed samples while reception continues; use the header to control output separately. FT parameters can be hidden while mapped and pinned parameters remain visible.

### Where should I look when something does not work?

| Observation | Inspect |
| --- | --- |
| Parameter missing | Search/category/source filters, OSC mode and sender destination |
| Parameter changes but a mapping has no reading | Use source, complete path, saved configuration and mapping status |
| Values appear frozen | Continue preview, reception state and sample time |
| Connected output sends nothing | Applied input mode, activation, source validity and destination range |

Keep the complete path and original error text when reporting a problem. [Parameter dictionary](osc-parameters.en.md)

### Turn an input into motion (mapping)

Choose a [preset](presets.en.md) or create a mapping. Select the source/path and target role, capture the input endpoints, choose a curve and save. Parameter suggestions filter as you type. Paths support exact matches, `*` for one segment, `**` across segments and semicolon/newline aliases.

The mapping preview shows the converted value. Gate roles add conditions such as a touch region or enabled state. [Calibration and roles](computed-signals.en.md)

### Combine inputs first (computed signals)

In Flow, add a computation and its inputs. Readings 0.2 and 0.8 with weights 1 and 3 produce **0.65**. Add smoothing, then send that result to vibration and an Avatar effect.

Spatial presets accept XYZ groups for distance, plane depth/offset and direction angles. The following-plane template connects a measured target with Tracking Frame markers. Save once, then reuse the result in several bindings. [Operations and examples](computed-signals.en.md)

### Reception, discovery and forwarding

- **Reception:** listening address, port, source and optional timeout.
- **OSCQuery:** discover endpoints, subscribe/poll parameters and advertise Sensa's receiver.
- **Hub:** forward incoming messages to several UDP destinations, on events or periodically.
- **OGB heartbeat:** send the publication heartbeat to VRChat's receiver, commonly port 9000.

A positive receive timeout stops on expired relevant input; its default 0 accommodates applications that send only on changes.

### Control from root position: inspect, then calibrate

Install a [tracking route](usage-scenarios.en.md), select the target and inspect its coordinates, unit and sample age. Capture the intended start as **0%**, then the end as **100%**. Save the resulting mapping and enable spatial input.

SPS four-anchor/Shader use Avatar-root local coordinates. Contact direct tracking uses Avatar-root metres and velocity in m/s. Calibrate each selected metric in its own unit. [Tracking reference](positioning.en.md)

## Flow

Flow keeps computations, outputs and complete plans together. A direct binding needs no computation. Add a named result when several destinations should reuse processed values.

**Save and load a complete plan** exports calculations, mappings, axis profiles and outputs. Import previews the affected counts before replacing them. Recording replay can feed saved files back into the graph. [Signal-flow guide](signal-pipeline.en.md)

## Settings and help

Axis profiles hold range, inversion, speed, locking and motion settings. Copy a profile for another device and choose it on that output. Protocol inputs configure network/serial listeners and their channels. Logs can be filtered by level.

Same-origin desktop tabs share one realtime connection and keep independent drafts. Startup detects an already open workbench; named instances provide independent configurations and ports. [Instances](quick-start.en.md#run-several-instances)

## Explore approach, contact and position

Open the [parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) from Help or from the desktop's offline documentation. Choose a scene, move the target and compare parameter readings with the geometry. Use the axis sliders for exact values and the view controls for 3D/XZ/isometric presentation.

SPS2 Root/Tip and SPS1 PenOthers/Close explain depth-related readings; Touch, Frot and zone scenes explain intensity. The dictionary supplies the full parameter definitions. [OSC reference](osc-parameters.en.md) · [Home](../README.md)
