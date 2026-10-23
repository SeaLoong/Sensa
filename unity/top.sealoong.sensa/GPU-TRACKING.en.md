# Shader root capture and SPS model diagnostics

[简体中文](GPU-TRACKING.md) | **English**

**Shader root capture** draws the selected Unity root's position, two axes and Avatar scale as a black-and-white block. A desktop bridge reads the block into OSC parameters. Use position for spatial mappings, axes for orientation-related calculations and scale to convert root-local displacement to metres. This is a PC experiment; verify capture and calibration before enabling input.

[Package installation and language](README.md) · [Interactive explorer](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) · [Encoding and primary sources](https://github.com/SeaLoong/Sensa/blob/main/docs/shader-capture-research.en.md)

## Configure the Avatar

**Selected root → three-point skinning → monochrome block → desktop-region capture → OSC → Sensa calculations and outputs**.

`SensaShaderCapture` stores author settings and implements `IEditorOnly`. Before MA merging, NDMF resolves Target position/rotation, generates one Camera, a three-vertex SkinnedMeshRenderer and an encoder material, then removes the author script. The generated native render components sample after upload. [Build lifecycle](https://github.com/SeaLoong/Sensa/blob/main/docs/unity-build.en.md)

1. Install the [package dependencies](COMPATIBILITY.en.md), plus official VRCFury for SPS author targets. Use PC Built-in rendering with a geometry-shader-capable backend. Use another input route on Android or Metal.
2. Create **GameObject → Sensa → Shader Root Capture (Experimental)**, or add `SensaShaderCapture.prefab`. Set `Target` to a bone/empty-object Transform, SPS Socket/Plug, Sensa Component or native Contact inside this Avatar.
3. Assign a unique `Producer Id` from 1–65535, such as 42. The desktop bridge pairs the block using the same ID.
4. `Desktop Viewport` is a normalized screen rectangle, initially (0,0,0.25,0.2). The QR tile stays square and centered inside it. Find the complete tile in the client, then determine its physical-pixel desktop bounds.
5. Build normally or use NDMF's processed preview. The build references the packaged `Runtime/Shaders/SensaRootTelemetry.shader` and serializes temporary meshes/materials. Rebuild and register capture after updating the package and bridge.
6. Select the root-code item under **Sensa ShaderCapture_42**. It starts Off, is activated by the local wearer and uses the author's build-time language.
7. Check the desktop block and both VR eyes. The generated camera requests `None` eye targeting; verify actual desktop composition and headset visibility in VRChat.

Each block has its own ID, camera and material signature. Give each one a separate capture region and bridge process.

## What can you read?

| Parameter | Meaning and use |
| --- | --- |
| `X / Y / Z` | Root-center position in Avatar-root local coordinates; X/Z=[−2,2], Y=[−1,3] |
| `RightX / RightY / RightZ` | The root's local +X axis expressed in Avatar-root coordinates; vector length retains that axis's scale |
| `ForwardX / ForwardY / ForwardZ` | Its local +Z axis in the same frame; crossing Right and Forward gives the measurement-plane normal |
| `AvatarScale` | World metres per Avatar-root local unit, in (0,8] |
| `Frame` | An approximately 60 Hz encoder clock used to detect duplicates and freezing |
| `Valid` | 1 commits a complete valid packet; 0 invalidates the measurement |

Right/Forward components range from −8 to 8. One triangle supplies the skinned origin, +X and +Z points. These retain two axis directions and lengths; independent Y-axis scale needs another measurement. Moving or turning the whole Avatar preserves the root-local meaning. Multiply relative displacement by `AvatarScale` for metres. Out-of-range values, degenerate axes and unsupported world scaling invalidate the packet.

Select position, axis components or AvatarScale in the root panel for calibrated mappings. For combined calculations, choose a tracking measurement (SensaPoint) in **Flow**, use a root pattern such as `Sensa/Shader/42/**` and select its metric before binding outputs. This source retains complete-packet validation, frame freshness and input activation checks. [Parameter reference](https://github.com/SeaLoong/Sensa/blob/main/docs/osc-parameters.en.md) · [Signal pipeline](https://github.com/SeaLoong/Sensa/blob/main/docs/signal-pipeline.en.md)

## Capture and register

Use Python with Pillow installed, from the main repository. Replace `LEFT TOP WIDTH HEIGHT` with the complete tile's **physical-pixel** bounds, including its white border. The tile has **49×49 modules**, so allow at least **196×196 pixels** and four pixels per module. The reader finds its corner markers inside the selected region; a rectangular region can include surrounding blank space. Negative origins support additional monitors.

```shell
python -X utf8 scripts/shader-osc-bridge.py --region LEFT TOP WIDTH HEIGHT --producer-id 42 --save-registration capture.json
```

This checks decoding and saves the region, ID and coordinate profile. Then use the actual Sensa OSC receiver port to forward samples:

```shell
python -X utf8 scripts/shader-osc-bridge.py --registration capture.json --watch --port 9001 --duration 300
```

Omit the port to inspect decoding only. Re-register after changing window size, resolution or display scaling. The bridge reads the selected region; the Sensa workbench controls input activation.

Inspect all twelve fields under `Sensa/Shader/42/`. Valid bundles send **Frame → X/Y/Z → RightX/Y/Z → ForwardX/Y/Z → AvatarScale → Valid=1**. Valid commits last; invalidation and shutdown send Valid=0. Check measurements and stopping, calibrate mappings, then enable input.

## How do margins and redundancy help?

The tile uses **QR Code v4-H**. The reader first finds three corner markers, then restores some obscured or misread data. A complete checked packet and an advancing image are required before measurements reach tracking calculations.

The white border separates the tile from its surroundings and leaves room for small movements. Of the eight white modules per side, four form the standard QR quiet zone and four provide extra movement margin. The encoder compares eight masks to reduce long runs and improve black/white balance, keeping the pattern readable when position is unchanged or some measurements are zero.

Reed–Solomon correction interleaves measurement data and parity across the symbol. When some modules are obscured, gray or misread, the bridge attempts to reconstruct the original bytes, then checks CRC32. Recovery depends on the distribution of damaged bytes and readable finder patterns. [Data layout and recovery bounds](https://github.com/SeaLoong/Sensa/blob/main/docs/shader-capture-research.en.md)

`Frame` checks image progression. The default bridge invalidates after **350 ms** without progress. Startup and recovery need **two new advancing frames**. Payload changes under the same frame, reorder and identity changes also invalidate. The desktop additionally checks twelve consecutive fields and Frame change age up to 500 ms. Finder patterns support right-angle rotation and vertical flipping. Re-select the complete tile after resizing; measure end-to-end response time in the capture setup.

Internal diagnostic PNGs retain a separate 16×8 layout and `Sensa/Diagnostics/Shader/0/{Frame,X,Y,Z,Valid}` for codec and transport checks.

## Editor SPS model probe

The editor probe helps inspect how the SPS2 model changes. It reads `_VFGridFinal`, calls the installed `sps_deform_walk_chain` and reports an **unblended centerline**, length, entry and `firstSegmentStrength`. These measurements describe the sampled centerline; final mesh-surface inspection and use after Avatar upload need their own implementation and validation.

1. Install official VRCFury SPS2. Dependency hashes target source commit `d048773de971881fb14c5f3b468e59ba2406a2dd`. Use PC Built-in rendering, a non-XR/non-stereo camera, ARGBFloat and AsyncGPUReadback.
2. Render the baked Resolver and surface through normal SPS build preview/Play Mode. Open **Tools → Sensa → SPS GPU Model Probe (Experimental)** and select its Camera, BakedSpsPlug Resolver Renderer and matching Surface Renderer.
3. **Check dependencies and capture next frame** validates normalized include SHA256 and reads material/MaterialPropertyBlock identities. Unknown dependencies, mismatched identity, shader errors or ten seconds without camera rendering stop capture. Dependencies come from VRCFury already installed in the project.
4. Generated files under `Assets/SensaGpuDiagnostics` are editor diagnostics. Inspect 33 points and export `sensa.sps-gpu-model.v1` JSON. Continuous PNG export records this editor reader’s measurements.

SPS player shader IDs are animated at runtime, so capture needs their current values. Global textures may retain old frames; model freshness requires additional capture evidence. Associating a Socket with its active Plug requires target identity information. This probe uses the SPS2 Resolver; older TPS/DPS setups use their corresponding input routes.

Offline analysis uses the standard library without desktop capture or OSC:

```shell
python -X utf8 scripts/analyze-gpu-capture.py capture.json
python -X utf8 scripts/analyze-gpu-capture.py capture.json --aperture-radius 0.04 --min-incidence-degrees 10
```

Outputs include sampled arc length, material/arc fraction after entry, plane offset, sampled chord direction and incidence. It rejects partial blend, collapsed segments, reversed/multiple/tangent crossings and explicit aperture violations. `usable` reports whether the diagnostic analysis conditions passed. Compare 16- and 32-segment results to inspect sampling sensitivity. Actual error, thickness and final vertex effects need reference measurements beyond this circular-opening/centerline model.

## Verification scope

In a PC Built-in Unity Editor with geometry-shader support, open Test Runner → EditMode and explicitly select `UnityBox.Sensa.Tests.ShaderCapturePixelContracts`. It renders into an isolated RenderTexture and checks actual QR modules, masking, error-correction codewords, CRC32, axes and scale. These tests are marked `Explicit` and require an explicit selection with a graphics environment. Unity Editor is unavailable in this cloud environment, so the new EditMode and graphics contracts await execution.


Codec/registration/freshness contracts cover twelve-field order and diagnostic isolation. Unity EditMode contracts cover one-camera configuration, shader import/compilation, persistent bounds, local skinning geometry and multiple-producer bindings. Record each result against its checked revision. GPU pixels, local desktop capture, PlayMode, Avatar upload, VR clients and hardware are validated in their corresponding runtime environments.

Client acceptance must record actual code output, known-motion error, resize/occlusion/minimization, HDR/postprocessing/antialiasing, low frame rate, desktop latency, HMD visibility and SDK/optimizer retention. CI exercises synthetic native PNGs through the bridge and service, plus separate diagnostic transport and freeze recovery. Actual GPU capture is checked in the Unity and client stages.
