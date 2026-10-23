# Workbench guide

[简体中文](guide.md) | **English**

Complete a simple flow with [First run](quick-start.en.md), then switch between Control, OSC, Flow and Settings. Navigation sits on the left on desktop and below the header in narrower windows. Each page title and introduction explain what you can do there. The header always shows the active input mode, input activation and emergency stop.

| Task | Open |
| --- | --- |
| Adjust manual values or play a script | **Control** → Manual / Script / Combined |
| Inspect OSC parameters, meanings and sources | **OSC** → Parameters |
| Configure reception, discovery or forwarding | **OSC** → Receiver/forwarding settings |
| Add calculations and connect several outputs | **Flow** → Computed signals / Outputs |
| Record, download and replay funscript | **Flow** or **Control** → Recording output |
| Save or load an interaction | **Flow** → Save and load a complete plan |
| Set device direction, travel and motion behavior | **Settings** → Axis profiles |

## Prepare, apply the input mode, then enable input

Prepare sources, calculations and outputs, then save. In Control choose Manual, OSC, Script or Combined, select Apply input mode and enable input. Readiness lists any remaining steps.

Saving configuration, changing mode or replacing a script disables input and stops current output. Enable input when ready. Emergency stop stays active until cleared, followed by separate input activation.

Outputs have independent activation and connection states. While input is running, a newly connected, enabled output receives the current valid target. Check the header before connecting.

## Control

### Manual and script

Manual initially shows L0/L1/L2, with rotation, vibration and auxiliary axes available on expansion: twelve axes in total. Adjust a slider/value and choose Send once. Enable Live updates to have output follow further adjustments. Send settings can use the axis profile or an explicit movement duration/speed; Clear overrides restores the profile.

After loading a funscript, the timeline shows playback position and trajectory. It supports 0.1–4× speed, loops, A–B, timecodes and keyframe navigation. Pause preserves the cursor, Stop returns to the beginning and unload removes the script. With Script input enabled, explicit seek/step can send a selected position while paused.

### Combined input

Combined lets several source kinds participate in calculations and output bindings. For example, an OSC touch reading sets interaction strength, a manual slider sets overall intensity and a script provides rhythm. Save sources/calculations, apply Combined and enable input. [Example](signal-pipeline.en.md#one-result-several-outputs)

### Outputs

Choose Add output, select its type and configure the address/device inside it. Open Input-to-output bindings to choose a source, target and range. Save, enable the output and confirm its connection. Diagnostics show recent targets, raw/converted values and validity.

| Output | Common settings |
| --- | --- |
| TCode | Serial port or UDP/TCP destination, axis profile |
| Intiface | Central address, actual device and position/vibration features |
| OSC parameter | IP, port, address and Float/Int/Bool type |
| DG-LAB | Relay, APP pairing, device, channel and intensity limit |
| MIDI/network application | System MIDI port, or service and field/topic |
| Recording | Funscript track or diagnostic format, source and range |

Set TCode direction, travel and speed in its axis profile. Intiface connects to a separately running Central; vibration defaults to V0, with V1/V2 or L0 available. The OSC write-back shortcut prepares VRChat's common receiver; configure the parameter as writable on the current Avatar. [Full output operation](signal-pipeline.en.md#add-outputs-and-bindings)

### L0 recording

Quick L0 recording captures current main-axis targets. Stopping preserves the final hold; export can simplify the curve into a single-axis funscript. Recording ends at 100000 frames. Exporting an active recording completes it while retaining the current input state. Restart asks before clearing the old buffer.

### Recording outputs

Add Recording to choose a source, record several tracks or capture an interaction alongside other outputs. Funscript is the default; use an output range of 0–1. Each binding's continuous valid segment becomes a separate file. Completed files can be downloaded, loaded into the script player or replayed as signals.

JSON Lines/CSV support analysis by retaining raw values, converted values and invalid intervals. [Recording and replay](signal-pipeline.en.md#record-and-inspect)

## OSC

### Parameters and sources

Apply OSC or Combined and confirm reception before inspecting parameters. Browse source selects what the list shows; Use source selects what the runtime reads. Changing the active source disables input. Check new readings before enabling it again.

Use search, categories and pins to narrow the list. Each page shows up to 100 parameters, with paging and direct page selection. Filters search the complete catalog; value updates retain the current page. Show FT parameters controls FT/v2-prefixed values, with mapped/pinned parameters remaining visible.

Open details for meanings, types, units, sources and sample time. Freeze preview retains list/detail samples while reception and outputs continue; disable input or use emergency stop when you need output to stop. Details identify retained samples when the catalog or connection changes.

### Where should I look when something does not work?

Disable input, then check one part at a time using the visible state:

| What you see | Check first | Next step |
| --- | --- | --- |
| A parameter is missing | Clear search, inspect all categories/sources, show FT parameters if needed | Check OSC/Combined mode, running listener and sender destination port |
| Parameters change but a mapping has no reading | Compare Use source, complete path and unsaved state | Correct and save, then inspect live readings |
| The list retains old values | Look for Continue preview | Resume preview; disable input or stop when motion must stop |
| Connected with no output | Read active mode, activation and mapping/binding status | Check the reported source/range/condition, then enable input |

For an issue report, include steps, input mode, source, complete path and original error text. Describe the device's actual response for a hardware issue. Read automated results from that commit's Actions run and [verification record](e2e-status.en.md).

### Turn an input into motion (mapping)

Start from a [preset](presets.en.md), choose replace/append and save. Each row selects a source, parameter/calculation and target role. Input range sets reading endpoints, the curve shapes the response and output interval sets the destination range.

Type part of a path to filter suggestions, or enter the complete path. See the [calculation guide](computed-signals.en.md) for whole-segment `*`, cross-segment `**` and semicolon/newline aliases. Simulate a row to inspect conversion, then save and check live results.

A gate is an additional condition for motion, such as sufficient proximity. Close can define a touch region; `GateEnable` adds an allowing condition and `DepthOverride` provides a depth override. See [calculation and axis mapping](computed-signals.en.md#validity-and-sample-age) for roles and axis priority.

### Combine inputs first (computed signals)

Choose Add computed signal in Flow, enter a name/operation and add inputs. After saving, output bindings can select the calculation directly. Map to an axis creates an axis reference. OSC → Mappings edits the same calculations.

Expand Spatial calculation presets to configure XYZ as groups and measure point distance, plane depth/offset or direction angles. After setting up Unity Tracking Frame, the Follow a moving plane template creates calculation drafts from your target and reference plane; review and save them before connecting outputs.

For example, readings 0.2 and 0.8 with weights 1 and 3 produce 0.65. Smooth the result and send it to both vibration and an Avatar effect. Live results use saved configuration; the unsaved indicator clears after a successful save. [Operations and examples](computed-signals.en.md)

An invalid required input stops dependent bindings while other valid bindings continue. New valid samples may resume that binding while input remains enabled. Disable input or use emergency stop to retain a stopped state. Axis mappings apply their motion-gating rules.

### Reception, discovery and forwarding

- **Reception:** configure listener/source. Ordinary timeout defaults to 0 for change-only senders; positive relevant-data timeout triggers emergency stop.
- **OSCQuery:** discover parameters, subscribe/poll and advertise the local receiver.
- **Hub:** forward received OSC to several UDP destinations on events or at a fixed rate.
- **OGB heartbeat:** enable explicitly when needed, targeting VRChat's receiver, commonly 9000. It sends true every five seconds during OSC reception and attempts false on stopping.

### Control from root position: inspect, then calibrate

Prepare SPS four-anchor, Contact or Shader tracking using the [setup guide](usage-scenarios.en.md). The root panel shows object, source, validity and readings. Fix the object, then choose the metric to use.

Position offers X/Y/Z or Distance. Contact adds velocity/Speed in m/s and ProximitySpeed in proximity units/s. Shader adds Right/Forward axes and AvatarScale. Choose Tracking measurement (SensaPoint) to use these readings in calculations or outputs with validity checks.

Move the target to the intended start and capture 0%, then move to the end and capture 100%. Keep the same object, source and metric for both captures. Check preview direction/range, replace the mapping draft and save. Then allow experimental spatial input and enable current input.

Contact position uses metres; SPS four-anchor and Shader position use Avatar-root local units. Calibrate each metric in its own range and check device direction/stopping with small movements. [Fields, units and conditions](positioning.en.md) · [Contact setup](contact-sdk.en.md)

## Flow

Flow groups calculations, outputs and complete plans. Connect a source directly or create a calculation for several outputs to reuse. [Full guide and examples](signal-pipeline.en.md)

1. Add required calculations, configure operations/inputs and Save calculations and mappings.
2. Add outputs, choose sources, targets and ranges in their bindings, then Save output.
3. Apply the input mode in Control, enable outputs and confirm connections, then enable input.

Control and Flow manage the same outputs. Expand Save and load a complete plan to export saved calculations, mappings, axis profiles and outputs. Review import targets/counts, apply it and choose the outputs to enable. Save drafts before exporting.

Recording files can be downloaded or loaded into the script player. Recording replay makes them calculation sources again. [Recording operation](signal-pipeline.en.md#record-and-inspect)

## Settings and help

Axis profiles configure range, inversion, speed, locking and motion settings. Copy profiles for different devices, then select the matching profile for each TCode output. Filter logs by level and retain original diagnostics when investigating.

Help links to [setup choices](usage-scenarios.en.md), [parameter meanings](osc-parameters.en.md) and installation. UI/explorer language supports automatic and manual selection, retaining drafts when switched. Documents preserve matching sections where possible; wide tables/code scroll separately.

Same-origin tabs share their realtime connection when supported, with independent drafts. Other pages can continue when one closes; restored pages reattach to current state. [Sharing behavior and browser conditions](signal-pipeline.en.md#pages-and-shared-connections)

## Explore approach, contact and position

Open the [online explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) or `docs/parameter-geometry.html` in a release. Eleven scenes offer 3D, XZ and isometric SVG. Drag the target on the selected plane, drag the background to rotate, or use sliders for precise changes.

Choose **SPS2 · PenOthersNewRoot / PenOthersNewTip** or **SPS1 · PenOthers / PenOthersClose** for depth-related readings; Touch, Frot and zone scenes show touch intensity. Parameters use dictionary ordering, with shorter shared prefixes first.

Gray outlines explain placement, blue/orange shapes show detection and green marks measurable regions. Simulate a valid sample switches between valid/invalid states. Explore readings first, then inspect actual input/output in the workbench. [Home](../README.md)
