# Choose a setup for your task

[简体中文](usage-scenarios.md) | **English**

Start with the result you want, then choose inputs, computation and outputs. These common flows provide direct starting points; VRChat parameters and tracking have dedicated sections below.

| Goal | Suggested flow | Setup |
| --- | --- | --- |
| Try a value or a script | Manual/script → device, application or Recording | [First run](quick-start.en.md) |
| Blend readings or add smoothing/thresholds | Several sources → computed signal → one or several outputs | [Computation and outputs](signal-pipeline.en.md#one-result-several-outputs) |
| Write an Avatar effect parameter | Signal → OSC parameter output → VRChat receiver | [OSC write-back](signal-pipeline.en.md#write-back-to-vrchat-osc) |
| Connect DG-LAB or another application | Signal → DG-LAB, MIDI, HTTP/WebSocket JSON or MQTT | [Output selection](signal-pipeline.en.md#add-outputs-and-bindings) |
| Save an editable, playable trajectory | Selected bindings → funscript tracks → download/replay | [Recording](signal-pipeline.en.md#record-and-inspect) |
| Read Avatar contact or spatial motion | OGB/SPS, Contact or Shader → calibration/computation → output | VRChat setup below |

## VRChat parameters and tracking

Existing OGB/SPS parameters provide proximity, touch and depth-related readings. When authoring your own Avatar, you can also choose SPS four-anchor tracking, Contact direct tracking or Shader capture.

| Route | Prerequisite | Result |
| --- | --- | --- |
| Existing OGB / SPS | Use haptics parameters already exposed by an Avatar | Radial depth estimate or touch intensity |
| SPS four-anchor tracking | Build your own Avatar and select its SPS Socket/Plug root | Your root's left/right, up/down and forward/back position relative to the Avatar |
| Contact direct tracking (SDK Beta) | Build your own Avatar with the supported beta SDK and a dedicated own-root channel | Root position in metres and relative velocity in m/s |
| Shader capture | Build a PC native encoder and actually see its block in a desktop surface | Root position, X/Z axes and Avatar world scale read from the selected block |

All four routes provide signals for device motion or other output bindings. Start with manual/script input to confirm device direction and travel, then connect the parameters. The [standalone explorer](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) compares models without devices.

## Existing OGB / SPS

1. Apply OSC, check listener/source and inspect real `OGB/Orf/…`, `OGB/Pen/…` or `VFH/Zone/Touch/…` paths.
2. If OGB_ENABLED is required, explicitly enable its heartbeat and configure the **VRChat receive port**, commonly 9000. Sensa listens on 9001 by default; these are different destinations.
3. Choose “OGB / SPS · Depth” or “Vibration”, fix object/source, check range, direction and Close gates, save, then activate input.

**SPS2 · PenOthersNewRoot / PenOthersNewTip**: two proximity readings describe the same Plug’s root and length sphere. Sensa pairs the same source, instance and category, learns length from unsaturated samples, then calculates a depth trend. An incomplete pair or unknown length yields zero.

**SPS1 · PenOthers / PenOthersClose**: `PenOthers` describes a depth trend; `PenOthersClose` reports whether the target enters the Socket’s effective nearby region. Sensa considers SPS1 when SPS2 is absent or both readings are zero, using Close when published. A Plug’s single value is read directly.

Approach aligned with the Socket corresponds most directly to entering depth. Sideways movement, tilt and authored dimensions also affect readings, so calibrate the intended motion start and end. `Touch` describes intensity in a touch region, and Plug `FrotOthers` describes close or brushing contact; each uses its matching Close condition. Socket Frot and standalone Touch Zones read their respective values directly. [Presets](presets.en.md) · [External generators and radii](ogb-compatibility.en.md)

## Contact direct tracking (SDK Beta)

Install SDK 3.10.6-beta.2 or a later SDK exposing advanced Proximity parameters. In **Automatic SPS Setup**, explicitly choose **Contact direct tracking (SDK Beta)** under the root tracking method; its default remains **SPS four-anchor tracking**. Alternatively, add `SensaContactRootProbe` directly. Select an actual own SPS, Sensa or native Contact root. Explicit Sensa/native roots work independently of VRCFury.

Sensa generates one tiny spherical Sender following that root and one 2-local-unit Receiver at the Avatar origin with aligned axes. Each authoring component uses a unique channel and Self-only reception. `Sensa/Contact/<id>/…` supplies twelve fields: native position/velocity/proximity reports plus Sensa Radius and Sample. Position is in AvatarRootMeters, velocity in m/s, and ProximitySpeed in proximity units/s. Radius tracks actual world scale and the 3 m limit; Sample changes nominally every 50 ms and expires within 1000 ms.

Inspect the object and source in the root panel. Calibrate **X/Y/Z/Distance** for local movement, or **VelocityX/Y/Z/Speed/ProximitySpeed** for movement strength, save, then enable spatial and OSC input. A calibrated axis can capture subtle depth trends; Touch/Close can add touch confirmation. Contact loss, invalid fields or frozen activity stops the related motion. Single-point position and velocity are supported; multi-point orientation remains a later extension. Real Unity-client/OSC beta acceptance awaits validation. [Setup, full semantics and package evidence](contact-sdk.en.md)

## SPS four-anchor tracking

Add **SPS four-anchor tracking** (`SensaFixedRootProbe`) or **Automatic SPS Setup** in Unity and explicitly select the SPS Socket/Plug root. Explicit bone/empty-object Transforms, Sensa and native Contact targets use the same SPS root protocol. Four Receivers of radius 2 avatar-root local units stay under the Avatar root; a small marker of radius 0.001 follows the selected root. Anchor spacing is approximately 0.99 local units:

`P0=(-.35,.65,-.35)`, `P1=(.35,.65,.35)`, `P2=(.35,1.35,-.35)`, `P3=(-.35,1.35,.35)`.

Inspect the green common detection region in Unity or the explorer before placing the target. The intersection of all four receiver spheres provides the spatial conditions for reconstruction.

The five measurements are `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`. P0–P3 describe proximity at the four measurement anchors. Sample=0 is invalid; activity cycles through n/32 (n=1…32), nominally every 50 ms. Repeating a value does not refresh it. Default change age is 1000 ms, capped at 1250 ms. Optional menu selectors are extra controls, outside those five measurements.

Fix the object in the root panel, choose X/Y/Z or distance from origin, capture endpoints, inspect preview, replace the draft and save. Then explicitly allow experimental spatial input and activate input. Missing or frozen samples, inconsistent geometry or failed scale checks invalidate the coordinates and stop the related motion.

Unity measurement components and desktop use the same shared geometry.

Units belong to the Avatar root and equal world meters only at unit scale. The green common region and saturation around measurement anchors define usable coverage. [Positioning/stopping](positioning.en.md) · [Unity installation](../unity/top.sealoong.sensa/README.md) · [Derivation](fixed-anchor-research.en.md)

## Shader root encoding and region capture

Add **Shader Root Capture (Experimental)** in Unity, choose a root and set its Producer ID. After building, enable encoding in the actual client and inspect the block in the desktop view.

Follow the [capture guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) to configure the complete block region and matching object ID. Inspect decoded results and validity before saving capture settings and the OSC destination. Calibrate the received root measurements as needed, then enable experimental spatial input.

The [positioning guide](positioning.en.md) and [Shader implementation reference](shader-capture-research.en.md) define the block layout, recovery, position/orientation/scale fields and validity rules. Configure capture and decoding for the current version.

## Other inputs and tools

Twelve-axis manual input and single-L0 funscripts help establish device travel. Native PB uses Stretch/IsGrabbed parameters for scalar control; L0 recording saves pre-distribution motion targets. OSC parameters, DG-LAB, network services and funscript-track recording can consume signal results through [output bindings](signal-pipeline.en.md). OSCQuery/Hub discover parameters and forward messages.

Independent Point/Handle/Pose, lab QuickStart and synthetic Shader patterns help explore measurement models and check sampling and transport. [Lab workflow](lab-workflow.en.md)

After configuration, check that parameters follow movement in the client, then verify device direction, response and stopping with a small travel range. See the [browser verification record](e2e-status.en.md) for automated outcomes. [Features](features.en.md)
