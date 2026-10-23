# Choose a setup for your task

[简体中文](usage-scenarios.md) | **English**

Choose the result you want, then its input and destination. Add computation when you need blending, smoothing, triggers or conversion.

| Goal | Suggested flow | Setup |
| --- | --- | --- |
| Check a device or application's response | Manual slider → destination | [First run](quick-start.en.md) |
| Play an existing trajectory | Funscript → device or application | [Manual and script](guide.en.md#manual-and-script) |
| Combine readings, smoothing or thresholds | Several inputs → computed signal → output | [Calculation examples](computed-signals.en.md) |
| Control a device and an Avatar effect together | One result → device and OSC parameter | [Multiple outputs](signal-pipeline.en.md#one-result-several-outputs) |
| Connect DG-LAB, MIDI or a network service | Signal → matching output | [Output setup](signal-pipeline.en.md#add-outputs-and-bindings) |
| Save an interaction for playback/editing | Selected source → Funscript recording | [Recording and replay](signal-pipeline.en.md#record-and-inspect) |

Apply Combined in Control when using several source kinds. [Save the whole plan](signal-pipeline.en.md#save-and-reuse-a-complete-plan) to retain calculations, mappings, axis profiles and outputs.

## VRChat parameters and tracking

Start with what the Avatar already provides. Existing OGB/SPS parameters connect directly; when authoring your Avatar, you can add root measurement components.

| Your situation | Choose | Measurement |
| --- | --- | --- |
| Avatar already provides OGB/SPS haptics parameters | Existing OGB/SPS | Proximity, touch and depth-related readings |
| You want SPS Socket/Plug root position | SPS four-anchor tracking | Three-dimensional position relative to the Avatar |
| Supported advanced Proximity SDK, with position and velocity needed | Contact direct tracking (SDK Beta) | Metre-based position and relative velocity |
| A PC view can show a code block, with axes and scale needed | Shader capture | Root position, X/Z axes and AvatarScale |

Use the [interactive parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) to understand parameters and valid regions first. For spatial input, inspect and calibrate before allowing experimental spatial input and activating input. Check actual client/graphics behavior with the versions used.

## Existing OGB / SPS

1. Apply OSC or Combined in Control, then check reception, source and actual parameters in OSC.
2. If the Avatar requires OGB_ENABLED, enable its heartbeat in receiver settings and enter VRChat's receive port, commonly **9000**. Sensa commonly receives parameters on **9001**.
3. Choose the OGB/SPS depth or vibration preset, fix the object/source, calibrate range and direction, save and enable input.

**SPS2 · PenOthersNewRoot / PenOthersNewTip** provides two proximity readings for the same Plug. Sensa pairs them, learns length and derives a depth trend. Move the target to provide the samples needed for learning, then inspect the result.

In **SPS1 · PenOthers / PenOthersClose**, PenOthers describes a depth trend and PenOthersClose reports entry into the Socket's effective nearby region. Touch describes touch intensity; Plug Frot describes close or brushing contact.

Alignment, sideways movement, tilt and authored dimensions affect proximity, so calibrate the actual movement endpoints. See [parameter meanings](osc-parameters.en.md), [presets](presets.en.md) and [OGB compatibility](ogb-compatibility.en.md) for pairing and validity conditions.

## Contact direct tracking (SDK Beta)

Choose this when authoring an Avatar that needs root position and movement strength. Install **SDK 3.10.6-beta.3**; Beta.2 is also supported. Select this route in Automatic SPS Setup or add `SensaContactRootProbe`.

1. Select an own SPS, Sensa or native Contact root and build the Avatar.
2. Fix the object/source in the root panel and inspect valid position and velocity.
3. Choose X/Y/Z/Distance for position, or VelocityX/Y/Z, Speed or ProximitySpeed for movement strength. Capture endpoints, inspect the preview, save and enable spatial input and current input.

Position uses metres and velocity uses m/s. ProximitySpeed is proximity change per second and needs its own calibration. This route provides single-point position and velocity; detection coverage and sampling activity determine validity. [Installation and conditions](contact-sdk.en.md) · [Calibration](positioning.en.md)

## SPS four-anchor tracking

Choose this to measure an SPS Socket/Plug root moving within the Avatar. Unity components reconstruct one root's three-dimensional position from four known anchors.

1. Add **SPS four-anchor tracking** (`SensaFixedRootProbe`) or Automatic SPS Setup and select your target root.
2. Inspect the green common detection region in Unity or the explorer and keep the intended motion within it.
3. Select the object/coordinate metric in the workbench, capture movement endpoints, check direction/range, save and enable input.

Receivers have a radius of 2 Avatar-root local units. Coordinates follow the Avatar's authored scale; interpret scaling in that frame. Explicit Transform, Sensa or native Contact targets can also use this route. See [positioning](positioning.en.md) for geometry, sampling and scale conditions, and the [Unity package](../unity/top.sealoong.sensa/README.md) for installation.

## Shader root encoding and region capture

Choose this experimental setup when a PC desktop view can retain the encoded block. Avatar rendering encodes root position, X/Z axes and Avatar scale; the desktop bridge reads the block into OSC measurements.

1. Add **Shader Root Capture (Experimental)** in Unity, select the root and set its Producer ID.
2. Enable encoding after building. Follow the [capture guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) to select the complete block and configure the matching ID.
3. Inspect decoding, choose the required Tracking measurement metric in the workbench, then calibrate, save and enable input.

QR finder patterns locate the tile, white margins buffer small shifts, and Reed–Solomon correction restores some damaged data. The rendered image, capture region and advancing frames determine availability. [Current protocol and validity](positioning.en.md) · [Implementation reference](shader-capture-research.en.md)

## Other inputs and tools

PhysBone Stretch/IsGrabbed can drive scalar controls; OSCQuery and Hub discover/forward parameters. Independent Point/Handle/Pose and Avatar/World labs provide measurement-model and integration checks. [Lab workflow](lab-workflow.en.md)

Check calculations with observable parameters or recording first, then use small device targets to confirm direction, response and stopping. [Workbench guide](guide.en.md) · [Feature overview](features.en.md)
