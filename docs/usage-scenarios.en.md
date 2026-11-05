# Choose a setup for your task

[简体中文](usage-scenarios.md) | **English**

Sensa connects **VRChat/SPS/OGB interactions**, **funscript playback** or **manual controls** to OSR/TCode, Intiface and other interactive devices. [Connect your first output](quick-start.en.md) before choosing an input below.

## Play a funscript or control manually

For a file, open **Control → Script**, choose the script, apply the mode and turn on **Input enabled**, then press **Play**. For a slider, choose **Manual**, apply the mode, enable input and adjust L0. [Browser and player steps](websensa.en.md)

## VRChat parameters and tracking

Use the desktop edition for live VRChat OSC. If your Avatar already has SPS/OGB, start with its public contact parameters below. You can use these without adding Sensa's custom tracking components.

## Existing OGB / SPS

1. Enable OSC in VRChat. In Sensa, open **Control → OSC** and **Apply input mode**, then inspect received parameters in **OSC**. Sensa commonly receives on **9001**; check the actual listener address.
2. If needed, open **OGB parameter activation** in OSC settings, enable **Enable OGB parameters in VRChat** and save. The VRChat receive port is commonly **9000**.
3. Under mappings, choose **OGB / SPS · Depth** for L0 or **OGB / SPS · Vibration** for V0. Click **Replace draft**, select the intended object/source, check the preview and calibrate range/direction. Click **Save mappings**.
4. Confirm the output is enabled. Turn on **Input enabled**, then try a small interaction and watch the response.

SPS2/SPS3 public Root/Tip readings are paired to estimate a depth trend. Separate the objects, then approach in the intended direction so learning can collect samples. SPS1 uses its depth and nearby-region readings. [Preset steps](presets.en.md) · [SPS3 channels](sps3.en.md) · [OGB parameter meanings and limits](ogb-compatibility.en.md)

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

[Workbench map](guide.en.md) · [Feature reference](features.en.md)
