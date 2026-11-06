# Choose a setup for your task

[简体中文](usage-scenarios.md) | **English**

Choose what should drive your device: **VRChat/SPS/OGB interactions**, **funscript playback**, **manual controls**, or another application's commands. [Guided setup](quick-start.en.md) connects your first output and prepares the input. [Devices and connections](devices.en.md) explains OSR/TCode and Intiface choices.

## Play a funscript or control manually

Choose the matching scene in **Guided setup**, or use its shortcut. For a file, open **Control → Script**, choose the script, apply the mode and turn on **Input enabled**, then press **Play**. For a slider, choose **Manual** and use the axis matching your device. L0 is the main position stroke; a default Intiface vibrator uses V0. [Browser, source-axis and player steps](websensa.en.md#manual-controls-and-scripts)

## VRChat parameters and tracking

Use the desktop edition for live VRChat OSC. If your Avatar already has SPS/OGB, start with its public contact parameters below. You can use these without adding Sensa's custom tracking components.

## Existing OGB / SPS

1. Enable OSC in VRChat. Choose the **VRChat / SPS control** scene, or open **OSC** to inspect received parameters. Sensa commonly receives on **9001**; check the actual listener address.
2. If needed, open **OGB parameter activation** in OSC settings, enable **Enable OGB parameters in VRChat** and save. The VRChat receive port is commonly **9000**.
3. Open **Scene presets → VRChat / OSC mappings**. Choose **OGB / SPS · Depth** for L0 or **OGB / SPS · Vibration** for V0. **Append to mapping draft** keeps the current mappings; **Replace mapping draft** replaces them. In **OSC → Map**, select the intended object/source, check the preview and calibrate range/direction. Click **Save changes**.
4. Apply **OSC** as the input mode if needed. Check your enabled output and finish the guide if using it. Turn on **Input enabled**, then try a small interaction and watch the response.

SPS2/SPS3 public Root/Tip readings are paired to estimate a depth trend. Separate the objects, then approach in the intended direction so learning can collect samples. SPS1 uses its depth and nearby-region readings. The selected preset describes its required channels; the [SPS3 guide](sps3.en.md) covers public-channel setup. [Preset steps](presets.en.md) · [OGB parameter meanings and limits](ogb-compatibility.en.md)

## Contact direct tracking (SDK Beta)

For Avatar authors who need metre-based root position and relative velocity. This requires a supported advanced Proximity SDK and a Sensa Contact component. [Contact setup](contact-sdk.en.md) · [Calibration](positioning.en.md)

## SPS four-anchor tracking

For Avatar authors who need an SPS Socket/Plug root's position relative to the Avatar. Add the Unity tracking component, inspect the common detection region and calibrate in Sensa. [Unity setup](../unity/top.sealoong.sensa/README.md) · [Position, scale and sample conditions](positioning.en.md)

## Shader root encoding and region capture

An experimental PC route that reads an encoded block from the Avatar's rendered image to measure root position, axes and scale. [Capture setup](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) · [Technical reference](shader-capture-research.en.md)

## Follow body movement with a reference plane

Measure movement relative to a changing body direction, such as a palm or chest. This needs tracking markers and a following reference plane. [Unity setup](unity-build.en.md#create-a-plane-that-follows-a-bone) · [Calculation example](computed-signals.en.md#follow-an-avatars-movement-with-a-plane)

For these spatial routes, inspect valid readings, calibrate and enable experimental spatial input before enabling current input. The [parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) explains the geometry visually.

## Other inputs and tools

- Website/player → OSR: [protocol inputs and bridges](protocol-inputs.en.md).
- Several inputs, smoothing or several outputs: [signal flows](signal-pipeline.en.md).
- Save an interaction as funscript: [recording and replay](signal-pipeline.en.md#record-and-inspect).
- PhysBone, OSC discovery or custom mappings: [presets](presets.en.md) and [OSC dictionary](osc-parameters.en.md).

[All guides](start.en.md) · [Workbench map](guide.en.md) · [Feature reference](features.en.md)
