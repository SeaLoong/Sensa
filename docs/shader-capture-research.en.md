# Shader capture: native roots to desktop regions

[简体中文](shader-capture-research.md) | **English**

Shader capture draws measurements from a selected point on the Avatar into a QR tile. A desktop reader decodes the screen region you select (ROI), recovers position, X/Z-axis vectors and Avatar world scale, then sends them to Sensa over OSC. Explicit targets within the Avatar include SPS Sockets/Plugs, bone/empty-object Transforms, Sensa Components and native Contacts. Desktop visibility, headset output and end-to-end latency are checked in the actual client.

Upstream Shader evidence was checked on 2026-10-19, with source revisions pinned below; the current Sensa structure was updated on 2026-10-24. See the [GPU guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) for commands and [dictionary](osc-parameters.en.md) for reception. This page explains the implementation choices, data format and client validation method.

## Primary-source findings and decisions

| Question | Evidence | Sensa decision |
| --- | --- | --- |
| Which components run after upload? | The [component allowlist](https://creators.vrchat.com/avatars/whitelisted-avatar-components/whitelisted-avatar-components/) includes cameras and skinned renderers. Custom author scripts belong to the build stage. | NDMF reads the IEditorOnly author and removes it after generating native components; those components perform measurement and encoding after upload. |
| Can an avatar retain cameras? | The same source allows the wearer's own cameras; remote cameras depend on friendship/Show Avatar conditions. | Use the local wearer’s camera, enabled through a local-only menu and initially Off. |
| Android support? | [Android limitations](https://creators.vrchat.com/platforms/android/quest-content-limitations/) disable avatar cameras and restrict avatar shaders. | Reject Android author builds. This is a PC Built-in geometry-shader path; Metal is excluded. |
| How do layers affect capture? | [VRChat layers](https://creators.vrchat.com/worlds/layers/) assign MirrorReflection to mirrors; uploaded-avatar layer retention requires client confirmation. | Read the actual desktop code block and check the effects of occlusion, minimization and layer changes. |
| How are desktop and headset output checked? | Unity documents [stereoTargetEye](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/Camera-stereoTargetEye.html), [None](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/StereoTargetEyeMask.None.html) and [targetTexture](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/Camera-targetTexture.html). | Request None-eye cameras, then inspect VRChat desktop composition and both headset views to record actual visibility. |
| How are mirrors/photos excluded? | [Shader globals](https://creators.vrchat.com/worlds/udon/vrc-graphics/vrchat-shader-globals/) expose CameraMode and MirrorMode. | Exclude mirror/photo modes and select the encoding camera by its producer's orthographic far-plane signature. These conditions route the image; the selected target and registration configuration identify the intended source. |

## Root measurements and deformation models

Inspected VRCFury commit: `d048773de971881fb14c5f3b468e59ba2406a2dd`.

The [SPS cell layout](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/SPS/common/sps_cell_layout.cginc) contains target/player shader IDs, position, orientation and scale, without a source-geometry frame sequence. Model freshness needs a separate geometry timestamp or capture evidence; the encoder clock checks that tile output continues.

[SpsPlayerIdService](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/Editor-Avatars/Service/SpsPlayerIdService.cs) generates and animates player material IDs at runtime; [SpsConfigurer](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/SpsConfigurer.cs) binds materials/Resolvers. Reading that model requires tracking its runtime-generated ID.

The adapter's `ReadRoot` resolves the explicitly selected root frame. SPS Sockets/Plugs use their authored root geometry; bone/empty-object Transforms, Sensa Components and native Contacts use their own root definitions. A native three-point skinned sample follows that frame, while installed VRCFury handles SPS deformation. The existing EditorWindow probe samples the installed SPS unblended centerline. Native root capture, the editor probe and synthetic PNG fixtures check root sampling, model calculations and the codec chain respectively.

A future model producer needs runtime ID tracking, render-stage coordination, geometry timestamps and XR texture-array handling, followed by comparison with the final mesh. Separate geometry and encoding timestamps identify which model update a packet contains.

## Native structure

Create **GameObject → Sensa → Shader Root Capture (Experimental)** or add `SensaShaderCapture.prefab`, then set `Target`, a nonzero `producerId` and normalized desktop viewport on `SensaShaderCapture`. The shared `SensaPlugin` reads these settings at NDMF **Generating → BeforePlugin("nadena.dev.modular-avatar")** and calls the Shader generator to create:

1. A root marker under the resolved source, applying `ReadRoot` local position/rotation.
2. An identity-transform SkinnedMeshRenderer under the avatar root, with three vertices fully bound to the marker. Native skinning yields AvatarRootLocal values; AvatarScale supplies the conversion to world metres.
3. One None-eye orthographic camera emitting the QR tile directly into its configured viewport, keeping the tile square and centered.
4. A local-only `Sensa ShaderCapture_<ID>` expression menu, initially Off. **Root position code** activates the rig, with the caption chosen in the build-time Editor language.

Bounds persist through native serialized `m_AABB` / `m_DirtyAABB` fields; skin matrices recalculate per render. See the [Unity inspector source](https://github.com/Unity-Technologies/UnityCsReference/blob/2022.3/Editor/Mono/Inspector/SkinnedMeshRendererEditor.cs).

Generated native components perform measurement and image output after upload. The `IEditorOnly` author script is removed after generation on the build copy. The encoder directly references the packaged `Runtime/Shaders/SensaRootTelemetry.shader`; NDMF saves referenced temporary meshes and materials, while MA merges animation, parameters and menus. See the [Unity build guide](unity-build.en.md) for phases and official evidence.

## Coordinates, axes and packet contract

The generated mesh has three vertices bound to the same root: the origin, local +X at 0.1 units and local +Z at 0.1 units. One triangle supplies all three skinned positions to the geometry stage. Subtracting the origin and dividing by 0.1 produces `Right` and `Forward`. These vectors retain the root's X/Z-axis directions and lengths; their cross product gives the measurement-plane normal. Independent Y-axis scale requires another measurement. `AvatarScale` reads the encoder's uniform positive object-to-world scale, expressing world metres per Avatar-root local unit.

Position shares `SensaFixedAnchorProtocol`: `AvatarRootLocal`, center (0,1,0), half-range 2 per axis. X/Z=[−2,2], Y=[−1,3]. Moving or turning the entire Avatar preserves the local interpretation. Multiply relative displacements by `AvatarScale` to obtain metres. Nonfinite or out-of-range samples, degenerate axes and unsupported world scaling clear validity.

The native packet contains **32 bytes**, with little-endian multibyte values and internal format identifier 1:

| Bytes | Meaning |
| --- | --- |
| 0–2 | `SN` magic and internal format 1 |
| 3 | bit0 valid, bit1 AvatarRootLocal; valid native flags=3 |
| 4–5 | 16-bit encoder clock, `floor(_Time.y × 60)`, wrapping at 65536 |
| 6–11 | Unsigned 16-bit X/Y/Z; decode as `center + (value/65535×2−1)×2` |
| 12–13 | Nonzero 16-bit Producer ID pairing the selected block |
| 14–19 | Signed 16-bit `RightX/Y/Z`, decoded as `value×8/32767` |
| 20–25 | Signed 16-bit `ForwardX/Y/Z`, same encoding; −32768 is invalid and zero is exact |
| 26–27 | Unsigned 16-bit `AvatarScale`, decoded as `value×8/65535`, in (0,8] |
| 28–31 | CRC32 IEEE of the first 28 bytes |

Geometry constructs the packet and CRC once per triangle; fragments read packed bits. Quantization steps are `4/65535` for position, `8/32767` for axis components and `8/65535` for world scale. These describe digital precision; measure actual error against known positions and directions.

## Monochrome layout, movement margin and missing-data recovery

The tile uses standard **QR Code Model 2, Version 4, error correction level H**. Its 33×33-module symbol carries one 32-byte measurement packet. Each side has 8 white modules: a 4-module QR quiet zone and 4 additional modules for movement. The complete tile is **49×49 modules**, with a minimum capture region of **196×196 physical pixels**.

Three corner finder patterns, alternating timing lines and a smaller alignment pattern near the lower-right corner establish position, orientation and module spacing. Two copies of BCH-protected format information identify the correction level and mask.

Byte-mode framing, length, terminator and padding turn the 32-byte packet into 36 data codewords. The encoder uses **four blocks, each with 9 data codewords and 16 Reed–Solomon parity codewords**, then interleaves all 100 codewords using QR placement rules. A codeword is one byte. It evaluates all eight data masks for long runs, same-color 2×2 areas, finder-like patterns and black/white balance. This produces a readable texture even when measurements are stationary or near zero.

Correction handles both wrong bytes and missing bytes whose locations are known. **Each block can recover when `2e+s≤16`**, where e counts wrong bytes and s counts missing bytes. One block can therefore repair eight wrong bytes, sixteen missing bytes, or four wrong plus eight missing bytes. The location of an occlusion determines the affected blocks and codewords; enough of the locator patterns must also remain readable.

Inside the selected ROI, the desktop bridge finds the corner patterns and resamples the grid. Gray or uncertain modules mark their codewords as missing. It then performs block correction, QR format checks and whole-packet CRC32 verification. Only the current capture supplies data. Producer ID and advancing Frame checks continue to enforce pairing and freshness. If a partially mixed image corrects to the same complete packet, its duplicate Frame does not extend validity; expiry still uses the last progression time.

The margin buffers **spatial movement**: translation up to four modules inside the nominal region still preserves the standard four-module quiet zone. Decoding supports in-plane rotation, mirroring and scaling. Re-select the full tile after resizing to preserve sufficient pixels per module. Perspective distortion and end-to-end latency require measurement in the actual capture setup. Separate lab diagnostic images retain their 16×8/CRC-CCITT format.

Geometry generates the QR modules once per measurement triangle; fragments read the final black/white values. Standard QR libraries cross-check the protocol. Automated checks and actual GPU/client acceptance are recorded separately in the [verification record](e2e-status.en.md).

## Explicit desktop registration and OSC

See the [package guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md). Select the screen region to read and pair the tile using its Producer ID. Registration stores the region, ID, coordinate frame, center and range. Native measurements and lab diagnostics are validated using their respective formats.

One valid OSC bundle sends `Sensa/Shader/<nonzero-ID>/{Frame,X,Y,Z,RightX,RightY,RightZ,ForwardX,ForwardY,ForwardZ,AvatarScale,Valid}` strictly in that order, with Valid=1 as the final commit field. Invalidation sends only Valid=0 on the same prefix, without stale XYZ or an invented Frame. The path identifies the object, and its coordinate frame is fixed as AvatarRootLocal.

Frame detects freezes/duplicate images, XYZ carries the measurement and Valid immediately reports invalidity. Binary producer ID remains necessary to verify the ROI source. Native ID0 is invalid. Synthetic/editor model diagnostics use only `Sensa/Diagnostics/Shader/0/{Frame,X,Y,Z,Valid}` and do not produce root observations.

The desktop requires twelve consecutive same-source fields and a maximum 500 ms Frame content-change age. Repeated identical frames do not refresh that age. Modulo-16-bit progression, changed payload under one frame and two-frame recovery belong to the bridge; desktop Observe checks the current complete packet and its change age.

Registration saves the ROI, Producer ID and coordinate configuration of a successfully decoded packet. Starting or recovering requires two progressing frames. CRC/source/profile failure, changed payload on a duplicate sequence, reorder, freeze, timeout or shutdown sets Valid to 0. Recovery needs two new progressing frames; a producer reset may require restarting the bridge. Accuracy and VR visibility follow the client checks below.

## Evidence and remaining acceptance

Isolated Python contracts cover codec/CRC/RGB, shared coordinates, ID/frame locking, ordered twelve fields, native/diagnostic isolation, freeze/recovery, registration, Windows atomic replacement and pre-capture CLI rejection. They read no desktop and operate no user devices.

Unity EditMode contracts cover default Off, one-camera output, shader import, persistent bounds, three-point skinning and multiple producers. A separate explicit graphics test checks rendered pixels. Pixel-render contracts require a working Unity graphics environment. Record actual revisions and results in the [verification record](e2e-status.en.md).

Client acceptance covers SDK upload retention, NDMF/VRCFury optimization, native pixels, PC/PCVR composition, HMD visibility, resize/occlusion/minimization, HDR/postprocessing/low frame rates, latency and reference-position error. The bridge clears validity after 350 ms of frozen imagery by default; the desktop receiver separately imposes a 500 ms sample-age limit.

Keep this PC experiment explicitly enabled and record measured client acceptance against the checklist above. [Positioning](positioning.en.md) · [Verification](development.en.md)
