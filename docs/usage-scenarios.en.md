# Choose an integration route

[简体中文](usage-scenarios.md) | **English**

Choose based on the data you actually have, then configure the output. SPS is an Avatar deformation/interaction system whose external haptics use OGB parameters. Sensa SPS is a separately generated fixed-root measurement, not the same protocol.

| Route | Prerequisite | Result |
| --- | --- | --- |
| Existing OGB / SPS | Use haptics parameters already exposed by an Avatar | Radial depth estimate or touch intensity |
| Sensa SPS | Build your own Avatar and select its actual Socket/Plug root | Your root's AvatarRootLocal XYZ |
| Shader capture | Build a PC native encoder and actually see its block in a desktop surface | Root XYZ from an explicit ROI |

All three produce command targets, not device feedback. Manual/script input can establish direction and range first. The [standalone explorer](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) compares models without devices.

## Existing OGB / SPS

1. Apply OSC, check listener/source and inspect real `OGB/Orf/…`, `OGB/Pen/…` or `VFH/Zone/Touch/…` paths.
2. If OGB_ENABLED is required, explicitly enable its heartbeat and configure the **VRChat receive port**, commonly 9000. Sensa listens on 9001 by default; these are different destinations.
3. Choose “OGB / SPS · Depth” or “Vibration”, fix object/source, check range, direction and Close gates, save, then activate input.

Modern Socket uses Root/Tip from the same source, full instance and Self/Others category. It learns length from unsaturated samples; incomplete pairs or unknown length yield zero. Legacy proximity is considered only when modern values are absent or both zero. Plug uses the raw value. Touch and Plug Frot require their actual Close gates; Socket Frot and standalone Touch Zones follow their own rules.

NewTip is a **root-centered length sphere**, not a tip coordinate. Rotation, lateral offset, multiple Senders, scale and asynchronous channels limit the result. OGB v1 already had modern and legacy branches; software age does not identify geometry. [Presets](presets.en.md) · [External generators and radii](ogb-compatibility.en.md)

## Sensa SPS fixed anchors

Use **Fixed SPS Root Probe** or **Automatic SPS Setup**, selecting a supported actual root. Four radius-2.5 Receivers stay under the Avatar root; a dedicated radius-.001 Sender follows the selected root center:

`P0=(-.5,.5,-.5)`, `P1=(.5,.5,.5)`, `P2=(.5,1.5,-.5)`, `P3=(-.5,1.5,.5)`.

Only `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}` are public measurements. P values are proximity, not coordinates. Sample=0 is invalid; activity cycles through n/32 (n=1…32), nominally every 50 ms. Repeating a value does not refresh it. Default change age is 1000 ms, capped at 1250 ms. Optional menu selectors are extra controls, outside those five measurements.

Fix the object in the root panel, choose X/Y/Z or distance from origin, capture endpoints, inspect preview, replace the draft and save. Then explicitly allow experimental spatial input and activate input. Missing/frozen samples, inconsistent geometry or failed scale guards block and stop.

Units belong to the Avatar root and equal world meters only at unit scale. The four-ball intersection and saturation constrain coverage. One root supplies no orientation, world motion, tip or GPU surface. [Positioning/stopping](positioning.en.md) · [Unity installation](../unity/top.sealoong.sensa/README.md) · [Derivation](fixed-anchor-research.en.md)

## Shader root encoding and region capture

Use **Shader Root Capture (Experimental)** with an actual root and nonzero producer ID. The build generates a native skinned point, one None-eye Camera and Shader. Its local menu starts Off; there is no custom post-upload C# reader.

1. Enable encoding in the actual client and confirm that a desktop surface visibly contains it.
2. Select a physical-pixel ROI and producer ID, check decode-only first, then register and explicitly choose the OSC destination.
3. The bridge checks ID, coordinate flags, CRC and modulo-65536 forward frames. Default freezing is 350 ms; startup/recovery requires two advancing frames.
4. A valid bundle sends `Sensa/Shader/<id>/{Frame,X,Y,Z,Valid}` in order, with Valid=1 last. Invalidity sends only Valid=0.
5. Calibrate/save in the root panel, then grant experimental and input permissions separately.

The desktop also checks same-source contiguous fields, coordinate bounds and at most 500 ms of Frame change age. Public Producer/Profile were removed; binary ID, coordinate flag, CRC and Frame remain. Diagnostic ID0 uses `Sensa/Diagnostics/Shader/0` and creates no motion root.

The cube is X/Z=[−1.5,1.5], Y=[−.5,2.5], not a Contact radius. A 16-bit quantization step is not measured accuracy. This captures the CPU root Transform, not final SPS deformation. Hidden layers, mirrors, HMD and desktop compositing are different surfaces and require actual acceptance. [Commands](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) · [Implementation/sources](shader-capture-research.en.md)

## Other inputs and tools

Twelve-axis manual input and single-L0 funscripts need no Contact solve. Native PB uses actual Stretch/IsGrabbed prefixes for scalar control; L0 recording captures pre-distribution targets. OSCQuery/Hub discover and forward without establishing position semantics.

Independent Point/Handle/Pose and lab QuickStart/synthetic Shader fixtures remain internal tools, not compatibility layers or accuracy evidence for these routes. [Lab workflow](lab-workflow.en.md)

Isolated contracts, EditMode and CI mock wires prove their respective boundaries. Real uploads, Contacts/OSC, desktop/HMD capture, accuracy and mechanical behavior need separate acceptance. [Features](features.en.md)
