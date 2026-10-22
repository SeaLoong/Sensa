# Shader capture: native roots to desktop regions

[简体中文](shader-capture-research.md) | **English**

This page records native root capture design and client acceptance scope. The current chain is **selected root frame → native skinned point → one-Camera block → explicit ROI decode → OSC**, reporting the selected root's position. Explicit targets within the Avatar include SPS Sockets/Plugs, bone/empty-object Transforms, Sensa Components and native Contacts. Desktop visibility, headset output and end-to-end latency are checked in the actual client.

Upstream Shader evidence was checked on 2026-10-19, with source revisions pinned below; the current Sensa structure was updated on 2026-10-23. See the [GPU guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) for commands and [dictionary](osc-parameters.en.md) for reception. This page preserves design reasoning and acceptance gaps.

## Primary-source findings and decisions

| Question | Evidence | Sensa decision |
| --- | --- | --- |
| Can avatar readback C# run after upload? | The [component allowlist](https://creators.vrchat.com/avatars/whitelisted-avatar-components/whitelisted-avatar-components/) includes cameras/skinned renderers, but excludes arbitrary custom scripts. | An IEditorOnly author generates native components through NDMF, then is removed. |
| Can an avatar retain cameras? | The same source allows the wearer's own cameras; remote cameras depend on friendship/Show Avatar conditions. | Local-only selection, initially Off; no dependency on the other avatar retaining a camera. |
| Android support? | [Android limitations](https://creators.vrchat.com/platforms/android/quest-content-limitations/) disable avatar cameras and restrict avatar shaders. | Reject Android author builds. This is a PC Built-in geometry-shader path; Metal is excluded. |
| Does a hidden layer provide capture? | [VRChat layers](https://creators.vrchat.com/worlds/layers/) make MirrorReflection mirror-only. World layer definitions do not establish uploaded-avatar layer retention. | Require an actual desktop code block. Occlusion, minimization and layer changes need client checks. |
| Does None-eye output guarantee desktop visibility? | Unity documents [stereoTargetEye](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/Camera-stereoTargetEye.html), [None](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/StereoTargetEyeMask.None.html) and [targetTexture](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/Camera-targetTexture.html). | Request None-eye cameras, but verify VRChat desktop composition and HMD visibility separately. |
| How are mirrors/photos excluded? | [Shader globals](https://creators.vrchat.com/worlds/udon/vrc-graphics/vrchat-shader-globals/) expose modes, not unique identities for arbitrary avatar cameras. | Reject mirror/photo modes and use distinct orthographic far-plane signatures. These are routing guards, not authenticated identities. |

## Why native roots precede automatic model capture

Inspected VRCFury commit: `d048773de971881fb14c5f3b468e59ba2406a2dd`.

The [SPS cell layout](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/SPS/common/sps_cell_layout.cginc) contains target/player shader IDs, position, orientation and scale, without a source-geometry frame sequence. A new encoder clock cannot prove that an old global texture was refreshed.

[SpsPlayerIdService](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/Editor-Avatars/Service/SpsPlayerIdService.cs) generates and animates player material IDs at runtime; [SpsConfigurer](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/SpsConfigurer.cs) binds materials/Resolvers. Copying baked shared-material IDs is insufficient.

The adapter's `ReadRoot` resolves the explicitly selected root frame. SPS Sockets/Plugs use their authored root geometry; bone/empty-object Transforms, Sensa Components and native Contacts use their own root definitions. A native single-bone sample follows that frame, while installed VRCFury handles SPS deformation. The existing EditorWindow probe samples the installed SPS unblended centerline. Native root capture, editor model capture and synthetic PNG fixtures establish different things.

A future model producer must solve runtime identity binding, source freshness/render ordering, XR arrays and the distinction between model and final mesh. Rewrapping stale geometry with an advancing transport sequence is insufficient.

## Native structure

Create **GameObject → Sensa → Shader Root Capture (Experimental)** or add `SensaShaderCapture.prefab`, then set `Target`, a nonzero `producerId` and normalized desktop viewport on `SensaShaderCapture`. The shared `SensaPlugin` reads these settings at NDMF **Generating → BeforePlugin("nadena.dev.modular-avatar")** and calls the Shader generator to create:

1. A root marker under the resolved source, applying `ReadRoot` local position/rotation.
2. An identity-transform SkinnedMeshRenderer under the avatar root, with one vertex fully bound to the marker. Native skinning yields AvatarRootLocal values without mixing world meters and root scale.
3. One None-eye orthographic camera emitting the NDC code directly into its configured viewport, without a RenderTexture, Quad, second camera or display shader.
4. A local-only `Sensa ShaderCapture_<ID>` expression menu, initially Off. **Root position code／根点位置编码** activates the rig, with the caption chosen in the build-time Editor language.

Bounds use serialized `m_AABB` / `m_DirtyAABB`, rather than relying only on a transient Renderer.localBounds override; skin matrices recalculate per render. See the [Unity inspector source](https://github.com/Unity-Technologies/UnityCsReference/blob/2022.3/Editor/Mono/Inspector/SkinnedMeshRendererEditor.cs).

Generated native components perform measurement and image output after upload. The `IEditorOnly` author script is removed after generation on the build copy. The encoder directly references the packaged `Runtime/Shaders/SensaRootTelemetry.shader`; NDMF saves referenced temporary meshes and materials, while MA merges animation, parameters and menus. See the [Unity build guide](unity-build.en.md) for phases and official evidence.

## Coordinate and packet contract

Shared `SensaFixedAnchorProtocol`: `AvatarRootLocal`, center (0,1,0), half-range 2 per axis. X/Z range [−2,2], Y [−1,3]. Units are avatar-root local units; they equal meters directly only when authored and runtime root scales are one. Nonfinite/out-of-range samples clear validity rather than pretending a clamped position is real.

The native monochrome code uses 20 columns × 12 rows. A two-module border surrounds the 16-column × 8-row payload, which represents 16 bytes:

| Bytes | Meaning |
| --- | --- |
| 0–2 | SN magic and internal format 1 |
| 3 | bit0 valid; bit1 AvatarRootLocal; native valid flags=3 |
| 4–5 | Little-endian 16-bit render encoder sequence, approximately 60 Hz |
| 6–11 | 16-bit X/Y/Z, decoded as center + normalized × 2 |
| 12–13 | Nonzero 16-bit producer ID, not account identity |
| 14–15 | CRC-CCITT of the first 14 bytes, initial value 0xffff |

Geometry builds the 16-byte payload and CRC once per skinned point, passing a nointerpolation uint4 to the fragment stage, which only reads the appropriate bit. This removes repeated per-pixel CRC work without claiming a measured client performance gain.

The quantization step is 4/65535≈0.00006104 local units, with at most half-step rounding error per axis; this is not total position error. Half-range 2 is a fixed coordinate boundary, not a Contact receiver radius or another configurable radius. SN internal format 1 identifies binary layout, rather than an OSC path version or development compatibility branch.

Fixed border cells intentionally do not change with position. The four edges carry asymmetric, complementary line patterns. An edge may match either of its two lines, with a bounded one-module error; at least three edges must match. Edge-cell sampling allows a 6-of-9 monochrome majority, while payload cells require all nine samples to agree. The explicit ROI must be at least 80×48 physical pixels. Translation search is bounded to one module per axis within that region. No scale/rotation/perspective recovery is claimed.

This adds redundancy to the alignment marks rather than error correction to position data. A damaged payload or mixed-frame payload must pass the unchanged CRC-CCITT or be rejected; like all finite CRCs, it has a nonzero collision probability. One damaged edge is tolerated; two missing edges or any missing payload are rejected. Fixed locators cannot remove render/capture latency. A changing but delayed frame can decode, so actual end-to-end delay still requires measurement. The separate diagnostic 16×8 format remains unchanged and cannot masquerade as native capture.

The sequence demonstrates advancing encoded rendering, not final mesh or animation/global-texture synchronization. Chroma/CRC checks detect corruption, not authenticated ownership.

## Explicit desktop registration and OSC

See the [package guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md). Capture never selects a screen automatically. Screen-to-OSC requires a pinned producer ID. Registration also fixes the coordinate profile/center/range. A diagnostic packet reusing the same ID is rejected.

One valid OSC bundle sends `Sensa/Shader/<nonzero-ID>/{Frame,X,Y,Z,Valid}` strictly in that order, with Valid=1 as the final commit field. Invalidation sends only Valid=0 on the same prefix, without stale XYZ or an invented Frame. ID is already in the path and AvatarRootLocal is fixed, so redundant Producer/Profile parameters and the path version segment are removed without old aliases.

Frame detects freezes/duplicate images, XYZ carries the measurement and Valid immediately reports invalidity. Binary producer ID remains necessary to verify the ROI source. Native ID0 is invalid. Synthetic/editor model diagnostics use only `Sensa/Diagnostics/Shader/0/{Frame,X,Y,Z,Valid}` and do not produce root observations.

The desktop requires five consecutive same-source fields and a maximum 500 ms Frame content-change age. Repeated identical frames do not refresh that age. Modulo-16-bit progression, changed payload under one frame and two-frame recovery belong to the bridge; static Observe does not claim an additional historical anti-replay state.

Saving registration establishes only that a valid native packet was decoded in the chosen ROI. It does not establish accuracy or VR visibility. The bridge requires two progressing frames. CRC/source/profile failure, changed coordinates on a duplicate sequence, reorder, freeze, timeout or shutdown closes Valid. Replaying the old good frame does not restore it; two new progressing frames are required. Producer reset may require a deliberate bridge restart rather than automatic retargeting.

## Evidence and remaining acceptance

Isolated Python contracts cover codec/CRC/RGB, shared coordinates, ID/frame locking, ordered five fields, native/diagnostic isolation, freeze/recovery, registration, Windows atomic replacement and pre-capture CLI rejection. They read no desktop and operate no user devices.

Unity EditMode checks default Off, one-camera direct output, shader import, persistent bounds, skinned coordinates and multiple-producer binding. The ignored report is `artifacts/verification/sps-five-fields-editmode.xml`; nographics import/generation is not actual GPU rendering. Exact counts belong to the original report.

Separate acceptance remains for SDK upload retention, NDMF/VRCFury optimization, native pixels, PC/PCVR composition, HMD visibility, resize/occlusion/minimization, HDR/postprocessing/low frame rates, latency and reference-position error. Default bridge freeze is 350 ms, earlier than the desktop's 500 ms rejection limit; the latter is not actual bridge validity.

Keep experimental opt-in until measured. Do not promise reliable world localization, final-mesh tracking or measured client performance gains. [Positioning](positioning.en.md) · [Verification](development.en.md)
