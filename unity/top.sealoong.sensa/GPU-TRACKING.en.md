# SPS shader root capture and model diagnostics

[简体中文](GPU-TRACKING.md) | **English**

To read the root you select in Unity, **native root capture** draws its position as a black-and-white code on your desktop. A Python bridge reads that code and sends coordinates to Sensa. This is an experimental PC route; follow the steps below before enabling device input.

**SPS GPU Model Probe** is a separate Unity Editor research tool for examining deformation models. Its screenshots and synthetic PNG replays do not establish real in-client tracking.

See the [research record](https://github.com/SeaLoong/Sensa/blob/main/docs/shader-capture-research.en.md) for primary sources and protocol decisions. Neither path provides final visible mesh geometry, authenticated player identity or a direct device stroke.

[Package installation and language](README.md) · [Interactive geometry](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US)

Inspector, help and error text follow Sensa's Editor language preference. Menu registration paths stay stable English IDs. Avatar menu captions use the author's build-time language, without a runtime client-language script.

## Native root path

Selected bone/marker/SPS root → black-and-white coordinate code → selected desktop capture region → Python bridge → Sensa OSC.

The generated camera requests no stereo-eye output (`None`); whether the code is visible on the desktop and absent from the headset still needs checking in the actual client.

The authoring component `SensaShaderCapture` implements `IEditorOnly`. The shared NDMF generator resolves Target position/rotation before MA merging, creates one native camera, a single-point skinned renderer and an encoder material, then removes the author script while retaining native render components. Target accepts this Avatar’s Transform, SPS, Sensa Component or native Contact. [Build phases and official evidence](https://github.com/SeaLoong/Sensa/blob/main/docs/unity-build.en.md)

### Setup

1. Install the [package dependencies](COMPATIBILITY.en.md). Install official VRCFury for SPS author targets; bones/Transforms, Sensa and native Contacts work directly. Use PC Built-in rendering and a geometry-shader-capable graphics backend. Android and Metal are excluded. Inspect capture results first.
2. Create **GameObject → Sensa → Shader Root Capture (Experimental)**, or add `SensaShaderCapture.prefab`. Set `Target` to the desired bone/empty-object Transform, SPS, Sensa Component or native Contact. Position comes from that explicit root frame.
3. Assign a unique `Producer Id` from 1–65535, such as 42, and pin the same ID in the bridge. This is a local protocol identifier, not a VRChat account identity.
4. `Desktop Viewport` is a normalized screen rectangle, initially (0,0,0.25,0.15). Find the complete code block in the actual client, then determine its desktop pixel ROI. Do not pass these normalized values to Python.
5. Build normally or use NDMF’s processed preview. The build references the packaged `Runtime/Shaders/SensaRootTelemetry.shader`; build serialization handles temporary meshes and materials. After updating the package, desktop app and bridge, rebuild and check capture registration. Existing `Sps Target` object references remain readable; confirm the explicit component in `Target` when updating the settings.
6. Explicitly select the generated **Sensa ShaderCapture_42** root-code item. Its caption follows the author's chosen language. It starts **Off**, and only the local wearer can activate the rig. Off stops the rig.
7. Check desktop code visibility and unwanted pixels in both VR eyes separately. None-eye cameras express Unity eye targeting; actual VRChat composition still needs validation. An arbitrary hidden render layer is not a guaranteed desktop capture channel.

Multiple producers use distinct camera/material signatures. The bridge must still pin a producer. A visually similar mirror, photo or third-party-camera image is insufficient.

### Coordinates

Native capture uses `AvatarRootLocal`, center (0,1,0), half-range 2 per axis. X/Z range [−2,2], Y [−1,3]. Values are avatar-root local units, directly equal to meters only when both authored and runtime root scales are one. World translation/turning is not local root movement; global world position is not supplied. Nonfinite/out-of-range samples clear validity.

### Capture registration

Run from the main Sensa repository using Python with Pillow installed. Replace `LEFT TOP WIDTH HEIGHT` below with the complete code block's **physical-pixel** bounds. The native 20×12-module block needs at least 80×48 physical pixels. Select its nominal full size, including all border modules. Negative origins support additional monitors. Small translation is tolerated within this region; do not enlarge it arbitrarily or expect automatic scale detection.

```shell
python -X utf8 scripts/shader-osc-bridge.py --region LEFT TOP WIDTH HEIGHT --producer-id 42 --save-registration capture.json
```

This decodes and saves an explicit ROI/ID/profile without sending OSC. On failure, correct the ROI, window size/scaling or presentation and retry. A saved registration establishes one valid decode, not position accuracy or PCVR acceptance. The registration fixes the coordinate profile; do not edit it to reuse another frame definition.

Then explicitly forward to the actual Sensa OSC receiver port:

```shell
python -X utf8 scripts/shader-osc-bridge.py --registration capture.json --watch --port 9001 --duration 300
```

Alternatively specify `--region ... --producer-id 42 --watch --port ...`. Omitting the port decodes only. The bridge does not choose a screen, inject into the game, read process memory, connect devices or activate Sensa input. Recheck/register the ROI after window movement, resolution or display-scaling changes.

Inspect `Sensa/Shader/42/{Frame,X,Y,Z,Valid}`. ID is in the path and AvatarRootLocal is fixed: no redundant Producer/Profile, path version segment or old alias. Synthetic/editor model PNGs use only `Sensa/Diagnostics/Shader/0`, without mappable root observations. Configure the experimental spatial-input permission and two-point calibration through Sensa; explicitly allow input only after checking coordinates, direction and stopping. There is no automatic OGB fallback.

### Why do some modules stay unchanged?

The outer two-module band is a fixed alignment pattern, similar in purpose to a QR code's positioning marks. The central 16×8 modules hold changing payload bits. A valid edge can use either of its two complementary pattern lines, and at least three of the four edges must match. This tolerates one damaged edge while keeping the data area strictly checked.

The bridge searches at most one module left/right and up/down within the selected region. It does not correct scale, rotation or perspective. Every payload module must pass the monochrome test and the whole payload must pass CRC; damaged data bits are rejected rather than guessed. Registration must match the current AvatarRootLocal center (0,1,0) and half-range 2 on each axis. Re-register after changing window size, display scale or encoder configuration.

These marks help alignment, not time synchronization. They cannot remove rendering/capture delay. A delayed but changing image can still decode; measure end-to-end latency separately. `Frame` detects duplicates and freezing as described below. Internal diagnostic PNG/lab codes remain a separate 16×8 format with a 64×32 minimum; they do not produce a motion root.

### Freshness and recovery

- Validate grid layout, RGB monochrome thresholds, CRC, producer and coordinate profile. A diagnostic packet reusing the pinned ID is rejected.
- Initially require two progressing sequences. Duplicate images do not refresh freshness; changed coordinates on one sequence, reorder, invalid source or identity changes close Valid.
- Default freeze timeout is 0.35 seconds; `--timeout` accepts explicit 0.05–5-second values. Recovery needs two new progressing frames. The old good frame cannot reopen the gate; a producer reset may require a deliberate bridge restart.
- One valid bundle sends Frame, X, Y, Z, Valid in order; final Valid=1 commits it. Invalid/shutdown bundles contain only Valid=0 on the same prefix, without stale XYZ or invented frames.
- The desktop also requires consecutive same-source receipt sequences for the five fields, and checks Frame content-change age up to 500 ms (or a stricter positive input timeout). Forwarding an identical Frame does not refresh it. Modulo-16-bit progression/recovery is enforced by the bridge; the desktop's static snapshot is not an independent historical anti-replay mechanism.
- Sequence is a render encoder clock, not a final-mesh/animation solve timestamp. CRC neither authenticates a player nor proves source model textures are current.

## Editor SPS model probe

This research path is not an uploaded model producer. It reads SPS2 `_VFGridFinal`, calls the installed `sps_deform_walk_chain` and reports an **unblended centerline**, length, entry and `firstSegmentStrength`, rather than the final mesh surface.

1. Install official VRCFury SPS2. Dependency hashes target source commit `d048773de971881fb14c5f3b468e59ba2406a2dd`. Use PC Built-in rendering, a non-XR/non-stereo camera, ARGBFloat and AsyncGPUReadback.
2. Render the baked Resolver and surface through normal SPS build preview/Play Mode. Open **Tools → Sensa → SPS GPU Model Probe (Experimental)** and select its Camera, BakedSpsPlug Resolver Renderer and matching Surface Renderer.
3. **Check dependencies and capture next frame** validates normalized include SHA256 and reads material/MaterialPropertyBlock identities. Unknown dependencies, mismatched identity, shader errors or ten seconds without camera rendering stop capture. No VRCFury implementation is downloaded/bundled.
4. Generated files under `Assets/SensaGpuDiagnostics` are editor diagnostics. Inspect 33 points and export `sensa.sps-gpu-model.v1` JSON. Continuous PNG export belongs to this editor reader, not the native avatar producer.

SPS player shader IDs are animated at runtime; baked material values may be zero. Global textures can retain old frames. Magic/identity checks or a new encoder clock do not establish model freshness. Knowing a Socket root does not identify its active Plug; old TPS/DPS does not automatically supply an SPS2 Resolver.

Offline analysis uses the standard library without desktop capture or OSC:

```shell
python -X utf8 scripts/analyze-gpu-capture.py capture.json
python -X utf8 scripts/analyze-gpu-capture.py capture.json --aperture-radius 0.04 --min-incidence-degrees 10
```

Outputs include sampled arc length, material/arc fraction after entry, plane offset, sampled chord direction and incidence. It rejects partial blend, collapsed segments, reversed/multiple/tangent crossings and explicit aperture violations. `usable` describes diagnostic analysis conditions, not device readiness. The 16/32-segment arc difference is not an error bound; a circular opening/centerline model omits thickness and final vertex effects.

## Verification scope

Codec/registration/freshness contracts cover five-field order and diagnostic isolation. Unity EditMode contracts cover one-camera configuration, shader import/compilation, persistent bounds, local skinning geometry and multiple-producer bindings. Use the receipt for the actual checked revision rather than a historical test count. Nographics shader import is not proof of real GPU pixel output, local desktop capture, PlayMode, avatar upload, VR clients or hardware.

Client acceptance must record actual code output, known-motion error, resize/occlusion/minimization, HDR/postprocessing/antialiasing, low frame rate, desktop latency, HMD visibility and SDK/optimizer retention. Internal diagnostic PNG CI replay establishes separate-namespace transport/freeze recovery while input stays disarmed. Simulated native OSC is not actual GPU capture.
