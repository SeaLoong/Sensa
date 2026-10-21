# Choose an integration route

[简体中文](usage-scenarios.md) | **English**

If you cannot edit the Avatar, use the OGB parameters it already provides. If you can rebuild your own Avatar and need three-dimensional root position, choose Sensa SPS or experimental Shader capture. SPS itself provides Avatar deformation/interactions; Sensa SPS adds this project's own measurement components.

| Route | Prerequisite | Result |
| --- | --- | --- |
| Existing OGB / SPS | Use haptics parameters already exposed by an Avatar | Radial depth estimate or touch intensity |
| Sensa SPS | Build your own Avatar and select its actual Socket/Plug root | Your root's left/right, up/down and forward/back position relative to the Avatar |
| Shader capture | Build a PC native encoder and actually see its block in a desktop surface | Root XYZ from an explicit ROI |

All three produce command targets, not device feedback. Manual/script input can establish direction and range first. The [standalone explorer](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) compares models without devices.

## Existing OGB / SPS

1. Apply OSC, check listener/source and inspect real `OGB/Orf/…`, `OGB/Pen/…` or `VFH/Zone/Touch/…` paths.
2. If OGB_ENABLED is required, explicitly enable its heartbeat and configure the **VRChat receive port**, commonly 9000. Sensa listens on 9001 by default; these are different destinations.
3. Choose “OGB / SPS · Depth” or “Vibration”, fix object/source, check range, direction and Close gates, save, then activate input.

Modern Socket uses Root/Tip from the same source, full instance and Self/Others category. It learns length from unsaturated samples; incomplete pairs or unknown length yield zero. Legacy proximity is considered only when modern values are absent or both zero. Plug uses the raw value. Touch and Plug Frot require their actual Close gates; Socket Frot and standalone Touch Zones follow their own rules.

NewTip is a **root-centered length sphere**, not a tip coordinate. Rotation, lateral offset, multiple Senders, scale and asynchronous channels limit the result. OGB v1 already had modern and legacy branches; software age does not identify geometry. [Presets](presets.en.md) · [External generators and radii](ogb-compatibility.en.md)

## Sensa SPS fixed anchors

Add **Fixed SPS Root Probe** or **Automatic SPS Setup** in Unity and explicitly select the supported Socket/Plug root. Four 2-m receivers stay under the Avatar root; a small 0.001-m marker follows that selected root. Anchor spacing is approximately 0.99 m:

`P0=(-.35,.65,-.35)`, `P1=(.35,.65,.35)`, `P2=(.35,1.35,-.35)`, `P3=(-.35,1.35,.35)`.

Inspect the green common detection region in Unity or the explorer before placing the target. All four receivers must measure it; the entire coordinate box is not detectable.

The five measurements are `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`. P values are proximity, not coordinates. Sample=0 is invalid; activity cycles through n/32 (n=1…32), nominally every 50 ms. Repeating a value does not refresh it. Default change age is 1000 ms, capped at 1250 ms. Optional menu selectors are extra controls, outside those five measurements.

Fix the object in the root panel, choose X/Y/Z or distance from origin, capture endpoints, inspect preview, replace the draft and save. Then explicitly allow experimental spatial input and activate input. Missing/frozen samples, inconsistent geometry or failed scale guards block and stop.

After updating from the older geometry, rebuild the Avatar and replace its previous generated measurement components before using the updated desktop app. Mixed geometry cannot be decoded correctly.

Units belong to the Avatar root and equal world meters only at unit scale. The four-ball intersection and saturation constrain coverage. One root supplies no orientation, world motion, tip or GPU surface. [Positioning/stopping](positioning.en.md) · [Unity installation](../unity/top.sealoong.sensa/README.md) · [Derivation](fixed-anchor-research.en.md)

## Shader root encoding and region capture

Use **Shader Root Capture (Experimental)** with an actual root and nonzero producer ID. The build generates a native skinned point, one None-eye Camera and Shader. Its local menu starts Off; there is no custom post-upload C# reader.

1. Enable encoding in the actual client and confirm that a desktop surface visibly contains it.
2. Select the full code block's physical-pixel capture region (ROI), at least 80×48, and the same object ID. Check decode-only first, then register and explicitly choose the OSC destination.
3. The native block uses 20×12 modules: fixed edge locators surround the 16×8 data area. One damaged edge and small translation can be tolerated; payload CRC, object ID, coordinate flags and forward-frame checks still apply. Default freezing is 350 ms; startup/recovery requires two advancing frames.
4. A valid bundle sends `Sensa/Shader/<id>/{Frame,X,Y,Z,Valid}` in order, with Valid=1 last. Invalidity sends only Valid=0.
5. Calibrate/save in the root panel, then grant experimental and input permissions separately.

The desktop also checks same-source contiguous fields, coordinate bounds and at most 500 ms of Frame change age. Public Producer/Profile were removed; binary ID, coordinate flag, CRC and Frame remain. Diagnostic ID0 uses `Sensa/Diagnostics/Shader/0` and creates no motion root.

Update the Avatar encoder and bridge together, then recreate the capture registration: old half-range-1.5 registrations are rejected. Edge locators improve alignment, not rendering delay or source freshness.

The cube is X/Z=[−2,2], Y=[−1,3], not a Contact radius. A 16-bit quantization step is not measured accuracy. This captures the CPU root Transform, not final SPS deformation. Hidden layers, mirrors, HMD and desktop compositing are different surfaces and require actual acceptance. [Commands](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) · [Implementation/sources](shader-capture-research.en.md)

## Other inputs and tools

Twelve-axis manual input and single-L0 funscripts need no Contact solve. Native PB uses actual Stretch/IsGrabbed prefixes for scalar control; L0 recording captures pre-distribution targets. OSCQuery/Hub discover and forward without establishing position semantics.

Independent Point/Handle/Pose and lab QuickStart/synthetic Shader fixtures remain internal tools, not compatibility layers or accuracy evidence for these routes. [Lab workflow](lab-workflow.en.md)

Isolated contracts, EditMode and CI mock wires prove their respective boundaries. Real uploads, Contacts/OSC, desktop/HMD capture, accuracy and mechanical behavior need separate acceptance. [Features](features.en.md)
