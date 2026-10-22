# Workbench guide

[简体中文](guide.md) | **English**

The workbench has three areas: Control for manual input, scripts and devices; OSC for receiving parameters and turning them into motion; and Settings for axis ranges, speed and logs. The header shows the connection, active input mode, whether input is enabled, and emergency stop. Stop remains available inside dialogs. Start with [First run](quick-start.en.md).

## Prepare, apply the input mode, then enable input

Prepare values and outputs in Manual/OSC/Script, select “Apply input mode”, then “Enable input” to start linkage. The header always shows the current mode, and readiness lists the steps still required. Use Add output to connect a device, or choose an integration route from Help.

Saving configuration, changing the active mode or importing/replacing a script disables input and stops first. Enable input again after clearing emergency stop. Outputs manage connection and enablement separately; a newly connected, enabled output receives the current valid target while input is running.

## Control

### Manual and script

Manual initially shows L0/L1/L2. Rotation, vibration and auxiliary axes are expandable, giving twelve axes in total. Edit a number/slider and send once, or allow continuous following of edits. “Send settings” selects the axis configuration, explicit duration I (ms), or speed S. The default value is a speed limit. Clear overrides restores the sending settings from the axis profile.

Loading a funscript reveals its clock, density and transport. It supports 0.1–4× speed, looping, A–B, timecodes and keyframe navigation. Pause preserves the cursor; Stop resets it; unload clears the file. With Script input enabled, explicit seek/step can send the selected target while paused.

### Outputs

Each row presents identity, target and actions. Edit, enable, connect or disconnect; expand diagnostics when needed.

- TCode serial uses 115200/8N1, port discovery and device information requests. UDP/TCP require an explicit address and port.
- Intiface defaults to a separately running Central, with device scanning and feature details. Set the engine port in managed mode when using your own managed engine.
- Vibration defaults to V0, with V1/V2 or L0 available. Intensity follows the selected axis; devices with position features use their corresponding position commands.
- Axis profiles set TCode travel range, direction, limits and motion. Positions and timestamps in output details record the latest motion targets sent.

### L0 recording

Record pre-distribution L0 motion targets. Stop preserves the final hold duration; recording ends automatically at 100000 frames. Exporting while active stops recording, but stopping recording does not disable input. Restart confirms clearing the old buffer; cancel preserves it.

Export produces single-axis funscript actions, with optional curve simplification for later playback or editing.

## OSC

### Parameters and sources

Apply OSC and check reception before inspecting parameters. Browsing a source differs from “Use source”; only the latter changes the actual signal source. Changing the actual source disables input and clears the previous source's mapping-processing state; inspect the new source before enabling input again. Use search and categories to narrow the list, then pin parameters you inspect often. “Freeze preview” pauses only the parameter list’s display updates; reception, mappings and device control continue. Disable input or use emergency stop to stop motion. “Show FT parameters” controls visibility of FT/v2-prefixed values; mapped and pinned parameters remain visible.

The parameter table shows at most 100 rows per page; use Previous/Next to continue or Page to jump directly. Search, source and category filters apply to the complete current catalog before paging. Changing a filter returns to the first page, while value updates preserve the selected page. You can find parameters beyond the current page without expanding thousands of rows at once.

Details follow updates for the same path and source and show the sample's receive time; freezing the preview also freezes the detail sample. If the parameter leaves the catalog, details retain the sample from when they opened. If the connection is not ready, they show the most recently received sample, with the corresponding status. The explorer link opens the local offline page. Create and save a mapping for the parameter, then enable input to start linkage. Avatar/source lifecycle changes clear old values and learned lengths and stop OSC input.

### Where should I look when something does not work?

Disable input first, then narrow the problem using what the UI shows. Change one of the source, path or range at a time so you can tell which change helped.

| What you see | Check first | Next step |
| --- | --- | --- |
| A parameter is missing | Clear Search parameters, select all categories/sources, and enable Show FT parameters if needed | If the list stays empty, check the actual OSC mode, running listener and the sender's destination port |
| Parameters change, but a mapping row has no matching reading | Compare Use source and the row's complete path; check whether it is still marked unsaved | Correct one setting, save the mappings and inspect the reading again; saving disarms input |
| The list keeps old values while other status changes | Look for the Continue preview button | Resume the list with that button; disable input or use emergency stop to stop device motion |
| An output is connected but does not move | Check the header's actual input mode and activation, then read Mapping checks | Confirm the source, mapped range and conditions, then enable input to start linkage |

When reporting a problem, include the steps, actual mode, selected source and complete parameter path, and preserve the original error text. Read automated outcomes from that commit's Actions run and the [browser verification record](e2e-status.en.md). Describe the device's own response separately for a hardware problem.

### Turn an input into motion (mapping)

The top toolbar groups presets, replace/append, save and restore. There are [five built-ins](presets.en.md): OGB depth/vibration, Contact position/speed and native PB. Custom presets remain available.

Each row selects its input source, then a path or computed signal, role and inversion. Advanced fields set input range, curve and output interval. Tracking sources can select solved coordinate or velocity metrics. While editing a parameter path, type part of it to filter up to 50 suggestions. You can also type a complete path or wildcard pattern manually. Suggestions open only for the field being edited. Full-segment `*`, cross-segment `**` and semicolon/newline aliases are supported. Single-row simulation previews the input range, curve and output-interval conversion. A successful save clears the draft's unsaved indicator and disarms input.

A gate is an additional condition that must allow motion, such as a target being close enough. `GateEnable` adds such a condition; `DepthOverride` can replace ordinary depth. See [Features](features.en.md) for the rules when several inputs participate. Keep conditions that match the chosen signal, such as Close for a touch region.

### Combine inputs first (computed signals)

In the Computed signals area, choose Add computed signal, enter a name and choose an operation. Add OSC parameters, tracking metrics, constant values or another computation as inputs. The workbench assigns a stable identifier. Map to an axis adds a mapping referencing the result; calibrate its range and curve, then use Save mappings to save computations and mappings together. Live calculation status uses the saved configuration; drafts keep their unsaved state.

For example, touch intensities 0.2 and 0.8 with weights 1 and 3 produce a weighted average of 0.65. To link motion to the gap between two roots, calculate X/Y/Z differences and combine them with Magnitude. Several axes can reuse one result, which retains contributing source, validity and sample age. [Operations, coordinate conditions and examples](computed-signals.en.md)

An active computation with missing or invalid inputs stops output. While input remains enabled, new valid samples can resume linkage. Disable input or use emergency stop to keep motion stopped.

### Reception, discovery and forwarding

Expand receiver/forwarding settings for listener, source, timeout, OSCQuery and Hub.

- Ordinary OSC timeout defaults to 0/off for change-only senders; a positive timeout latches emergency stop when relevant data expires.
- OSCQuery supports parameter trees/HOST_INFO, LISTEN subscriptions, optional polling and advertising the local receiver.
- Hub forwards to multiple UDP targets on events or at a fixed rate, preserving unconsumed raw bundle structure. Counts show forwarding activity.
- OGB enable heartbeat defaults off and requires an explicit VRChat destination, commonly port 9000. It sends true every five seconds while OSC reception runs and attempts false on stopping.

### Control from root position: inspect, then calibrate

SPS four-anchor tracking, Contact and Shader root panels show object, source, Avatar-relative coordinates and current measurement status. Contact direct tracking uses physical metres (AvatarRootMeters); SPS four-anchor tracking and Shader use authored Avatar-root units (AvatarRootLocal). Point/Handle/Pose experiments show measurements relative to their own reference objects. Spatial input starts off; enable it after inspection and calibration.

Fix the object you want to observe. Select left/right X, up/down Y, forward/back Z, or distance from the Avatar origin. Contact direct tracking also offers VelocityX/Y/Z and Speed in m/s, plus ProximitySpeed in proximity units/s; use these to calibrate movement strength. Move the target to the desired start and capture 0%; move it to the end and capture 100%. Inspect the preview direction and range, then replace the mapping draft and save. Then separately allow experimental spatial input and activate the current input. Invalid coordinates stop the corresponding motion. Start with a small travel range to check that local movement matches the intended device direction. [Positioning conditions](positioning.en.md)

For **Contact direct tracking (SDK Beta)**, first install the supported beta SDK and build its dedicated own-root Sender/Receiver. A calibrated position axis can follow subtle local depth movement, a touch/Close gate can confirm contact, and a velocity metric can control vibration strength. Keep the same object, source and metric for both captured endpoints. [Beta setup and field meanings](contact-sdk.en.md)

## Settings and help

Axis profiles support adding, choosing a default, copying/editing and removing. The sole default cannot be deleted directly; references are repaired by policy. Each axis has range, remapping, maximum speed, inversion, locked/ignored modes and None/Interval/Speed/Ramp settings. Logs can be filtered by severity; keep raw diagnostics for investigation.

Help links to [routes](usage-scenarios.en.md), the [parameter dictionary](osc-parameters.en.md) and installation. UI and explorer language follow [automatic detection and explicit choice](languages.en.md); switching preserves drafts.

When a document heading has a counterpart, switching language keeps that section; otherwise the new document opens at the top. Tables and code examples wider than the screen scroll horizontally. With a keyboard, Tab into the overflowing region, then use the left/right arrow keys to scroll.

## Explore approach, contact and position

The [online version](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) is standalone; releases also include `docs/parameter-geometry.html`. All eleven scenes have 3D, XZ and isometric SVG. Dragging the 3D target changes only the selected plane's axes; background drag rotates. Camera reset preserves parameters. Sliders remain available and WebGL failure falls back to SVG.

Choose **SPS2 · PenOthersNewRoot / PenOthersNewTip** or **SPS1 · PenOthers / PenOthersClose** to see how approach toward a Socket changes depth-related readings. Touch, Frot and zone scenes show their corresponding touch intensities. Dictionary ordering places a shorter shared prefix first, helping you compare readings with actual OSC paths.

Gray profiles show relative placement; blue and orange shapes show detection regions, with an enlarged orange drag handle. Green marks measurable positions. Check “Simulate a valid sample” for normal readings and clear it to see invalid samples. Explore the values before configuring, then establish a mapping and check actual linkage in the workbench. [Evidence](ui-visual-review.en.md) · [Home](../README.md)
