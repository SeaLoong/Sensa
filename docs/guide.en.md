# Workbench guide

[简体中文](guide.md) | **English**

The workbench has three areas: Control, OSC and Settings. The header shows connection, actual input mode, input permission and emergency stop. Content scrolls separately; stop is also available inside dialogs. Components are native controls with Sensa's TDesign styling. Start with [First run](quick-start.en.md).

## Browsing, applying and activating

Browsing Manual/OSC/Script selects what you edit. “Apply input mode” changes the actual mode; “Enable input” grants a separate permission. Readiness lists missing steps without activating input. With no output, add one directly; help routes only navigate and never issue control.

Saving configuration, changing actual mode or replacing a script disarms and stops first. Emergency stop is latched; clearing does not resume. Output connection and enablement are independent; an already active valid input may send after a new connection. Browser reconnects do not replay unfinished requests.

## Control

### Manual and script

Manual initially shows L0/L1/L2. Rotation, vibration and auxiliary axes are expandable, giving twelve axes in total. Edit a number/slider and send once, or allow continuous following of edits. “Send settings” selects the axis configuration, explicit duration I (ms), or speed S. The default value is a speed limit, not a duration. Clearing overrides does not center the device.

Loading a funscript reveals its clock, density and transport. It supports 0.1–4× speed, looping, A–B, timecodes and keyframe navigation. Pause preserves the cursor; Stop resets it; unload clears the file. Explicit seek/step can still send while Script input is active and paused. There is no media synchronization or mechanical homing.

### Outputs

Each row presents identity, target and actions. Edit, enable, connect or disconnect; expand diagnostics when needed.

- TCode serial uses 115200/8N1, port discovery and device information requests. UDP/TCP require an explicit address and port.
- Intiface defaults to an external Central. Engine port applies only to explicit managed mode; the engine is not bundled. Scan, stop scanning and inspect device features.
- Vibration defaults to V0, with V1/V2 or explicit L0 available. Position features use their own supported commands; vibration-only devices do not need position features. Zero V0 does not fall back to nonzero L0.
- Axis profiles set TCode range, direction, limits and motion. Displayed positions/timestamps are command telemetry, not execution feedback.

### L0 recording

Record pre-distribution L0 commands, independently of hardware feedback. Stop preserves the final hold duration; recording ends automatically at 100000 frames. Exporting while active stops recording, but stopping recording does not disable input. Restart confirms clearing the old buffer; cancel preserves it.

Export produces funscript actions and can simplify the curve. It excludes other axes, input permission, gate/stop events, media clocks and device confirmation, so it is not a complete safety event log.

## OSC

### Parameters and sources

Apply OSC and check reception before inspecting parameters. Browsing a source differs from “Use source”; only the latter changes the actual signal source. Search, categories, freeze and pinning narrow the list. “Show FT parameters” recognizes only FT/v2 root prefixes; mapped and pinned values remain visible, without guessing blendshape names.

Details explain leaves, current values and mapping uses; the explorer link opens the local offline page. A present parameter is neither a mapping nor permission to move. Avatar/source lifecycle changes clear old values and learned lengths and stop OSC input.

### Mappings

The top toolbar groups presets, replace/append, save and restore. There are only [three built-ins](presets.en.md): depth, vibration and native PB. Custom presets remain available.

Each row selects path, role and inversion; advanced fields set input range, curve and output interval. Full-segment `*`, cross-segment `**` and semicolon/newline aliases are supported. Local single-row simulation checks transforms, not actual reception. A successful save clears the draft's unsaved indicator and disarms input.

GateEnable adds a gate; DepthOverride can replace ordinary depth. See [Features](features.en.md) for fusion rules. Remove unwanted template gates instead of leaving an internal fixture's Active requirement on production data.

### Reception, discovery and forwarding

Expand receiver/forwarding settings for listener, source, timeout, OSCQuery and Hub.

- Ordinary OSC timeout defaults to 0/off for change-only senders; a positive timeout latches emergency stop when relevant data expires.
- OSCQuery supports parameter trees/HOST_INFO, LISTEN subscriptions, optional polling and advertising the local receiver.
- Hub forwards to multiple UDP targets on events or at a fixed rate, preserving unconsumed raw bundle structure. Counts are not execution acknowledgements.
- OGB enable heartbeat defaults off and requires an explicit VRChat destination, commonly port 9000. It sends true every five seconds while actual OSC reception runs and attempts false on stopping; it grants no device permission.

### Experimental diagnostics and calibration

Spatial permission defaults off. SPS/Shader root panels show object, source, local coordinates, validity and reasons. Legacy Point/Handle/Pose experiments retain separate models and must not be mixed.

Fix an object, select X/Y/Z or distance from origin, capture the 0%/100% endpoints, inspect preview, replace the draft and save. Then separately allow experimental spatial input and activate the current input. Invalidity stops without falling back to old scalar data on that axis. These are local coordinates, not device/world/final-mesh positions. [Positioning conditions](positioning.en.md)

## Settings and help

Axis profiles support adding, choosing a default, copying/editing and removing. The sole default cannot be deleted directly; references are repaired by policy. Each axis has range, remapping, maximum speed, inversion, locked/ignored modes and None/Interval/Speed/Ramp settings. Logs can be filtered by severity; keep raw diagnostics for investigation.

Help links to [routes](usage-scenarios.en.md), the [parameter dictionary](osc-parameters.en.md) and installation. UI and explorer language follow [automatic detection and explicit choice](languages.en.md); switching preserves drafts.

## Explorer boundaries

The [online version](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) is standalone; releases also include `docs/parameter-geometry.html`. All ten scenes have 3D, XZ and isometric SVG. Dragging the 3D target changes only the selected plane's axes; background drag rotates. Camera reset preserves parameters. Sliders remain available and WebGL failure falls back to SVG.

Gray surfaces are reference profiles; the orange interaction marker is not the actual Sender radius. “Model gate” excludes Sensa runtime length learning, mapping and device output. Explorer images and mocks do not establish real-client or hardware acceptance. [Evidence](ui-visual-review.en.md) · [Home](../README.md)
