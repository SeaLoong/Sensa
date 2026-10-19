# Shader root capture: implementation and research

[简体中文](shader-capture-research.md) | **English**

Checked 2026-10-19. This change implements **SPS Socket/Plug root Transform → native skinning → shader code → explicitly selected desktop region → OSC**. It measures avatar-root local coordinates, not the final deformed mesh. The native producer is implemented; Unity builds, avatar upload and desktop/PCVR composition require separate acceptance evidence.

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

The new producer calls `ReadRoot` to resolve the installed Socket/Plug's actual authored root frame, then samples a native single-bone point following that frame. It does not copy SPS shader code or approximate deformation. The existing EditorWindow probe still samples the installed SPS unblended centerline. Native root capture, editor model capture and synthetic PNG fixtures establish different things.

A future model producer must solve runtime identity binding, source freshness/render ordering, XR arrays and the distinction between model and final mesh. Rewrapping stale geometry with an advancing transport sequence is insufficient.

## Native structure

`SensaShaderCapture` exposes a target, nonzero producer ID and normalized desktop viewport. Its separate NDMF builder creates:

1. A root marker under the resolved source, applying `ReadRoot` local position/rotation.
2. An identity-transform SkinnedMeshRenderer under the avatar root, with one vertex fully bound to the marker. Native skinning yields AvatarRootLocal values without mixing world meters and root scale.
3. One None-eye orthographic camera emitting the NDC code directly into its configured viewport, without a RenderTexture, Quad, second camera or display shader.
4. A local-only `Sensa ShaderCapture_<ID>` expression menu, initially Off. `SPS root code / SPS 根点编码` activates the rig.

Bounds use serialized `m_AABB` / `m_DirtyAABB`, rather than relying only on a transient Renderer.localBounds override; skin matrices recalculate per render. See the [Unity inspector source](https://github.com/Unity-Technologies/UnityCsReference/blob/2022.3/Editor/Mono/Inspector/SkinnedMeshRendererEditor.cs).

The uploaded measurement/output components are native; the editor builder and MA/NDMF processing do not become avatar runtime scripts. The generated root shader lives in `Assets/SensaShaderCapture`; differing existing files stop generation instead of being overwritten.

## Coordinate and packet contract

Shared `SensaFixedAnchorProtocol`: `AvatarRootLocal`, center (0,1,0), half-range 1.5 per axis. X/Z range [−1.5,1.5], Y [−0.5,2.5]. Units are avatar-root local units; they equal meters directly only when authored and runtime root scales are one. Nonfinite/out-of-range samples clear validity rather than pretending a clamped position is real.

The 16-column × 8-row monochrome grid represents 16 bytes:

| Bytes | Meaning |
| --- | --- |
| 0–2 | SN magic and internal format 1 |
| 3 | bit0 valid; bit1 AvatarRootLocal; native valid flags=3 |
| 4–5 | Little-endian 16-bit render encoder sequence, approximately 60 Hz |
| 6–11 | 16-bit X/Y/Z, decoded as center + normalized × 1.5 |
| 12–13 | Nonzero 16-bit producer ID, not account identity |
| 14–15 | CRC-CCITT of the first 14 bytes, initial value 0xffff |

Geometry builds the 16-byte payload and CRC once per skinned point, passing a nointerpolation uint4 to the fragment stage, which only reads the appropriate bit. This removes repeated per-pixel CRC work without claiming a measured client performance gain.

The quantization step is 3/65535≈0.00004578 local units, with at most half-step rounding error per axis; this is not total position error. Half-range 1.5 is a fixed coordinate boundary, not a Contact receiver radius or another configurable radius. SN internal format 1 identifies binary layout, rather than an OSC path version or development compatibility branch.

The sequence demonstrates advancing encoded rendering, not final mesh or animation/global-texture synchronization. Chroma/CRC checks detect corruption, not authenticated ownership.

## Explicit desktop registration and OSC

See the [package guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md). Capture never selects a screen automatically. Screen-to-OSC requires a pinned producer ID. Registration also fixes the coordinate profile/center/range. A diagnostic packet reusing the same ID is rejected.

One valid OSC bundle sends `Sensa/Shader/<nonzero-ID>/{Frame,X,Y,Z,Valid}` strictly in that order, with Valid=1 as the final commit field. Invalidation sends only Valid=0 on the same prefix, without stale XYZ or an invented Frame. ID is already in the path and AvatarRootLocal is fixed, so redundant Producer/Profile parameters and the path version segment are removed without old aliases.

Frame detects freezes/duplicate images, XYZ carries the measurement and Valid immediately reports invalidity. Binary producer ID remains necessary to verify the ROI source. Native ID0 is invalid. Synthetic/editor model diagnostics use only `Sensa/Diagnostics/Shader/0/{Frame,X,Y,Z,Valid}` and do not produce root observations.

The desktop requires five consecutive same-source fields and a maximum 500 ms Frame content-change age. Repeated identical frames do not refresh that age. Modulo-16-bit progression, changed payload under one frame and two-frame recovery belong to the bridge; static Observe does not claim an additional historical anti-replay state.

Saving registration establishes only that a valid native packet was decoded in the chosen ROI. It does not establish accuracy or VR visibility. The bridge requires two progressing frames. CRC/source/profile failure, changed coordinates on a duplicate sequence, reorder, freeze, timeout or shutdown closes Valid. Replaying the old good frame does not restore it; two new progressing frames are required. Producer reset may require a deliberate bridge restart rather than automatic retargeting.

## Verification boundaries

- Isolated Python contracts cover codec/CRC/RGB, invalid sources, shared coordinates, identity/frame locking, five-field order, namespace separation, freeze/recovery, Windows atomic replacement, registration and pre-capture CLI rejection, without desktop capture or user devices.
- Unity EditMode contracts cover Off state, one-camera direct output configuration, shader compilation, persistent bounds, local skinning geometry and multiple-producer bindings. This change passed 19/19 isolated Python and 65/65 unified Unity EditMode tests (including three native-capture contracts), with zero skips; XML: artifacts/verification/sps-five-fields-editmode.xml. Unity used nographics shader import/generation, not actual GPU pixel output or client acceptance.
- Separate acceptance remains necessary for SDK upload retention, NDMF/VRCFury optimization, actual native rendering, desktop/PCVR composition, HMD visibility, resize/occlusion/minimization, HDR/postprocessing/low frame rates, latency and reference-position error. Until that evidence exists, keep experimental opt-in and avoid claims of reliable world localization or final-mesh tracking.
