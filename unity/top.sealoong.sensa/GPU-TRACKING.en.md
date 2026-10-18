# SPS shader deformation: probes and bridge experiments

[简体中文](GPU-TRACKING.md) | **English**

Implemented: world GPU rendering/ClientSim readback, actual SPS2 model sampling, continuous editor PNG export and PNG → decoder → isolated Sensa OSC. The uploadable camera rig generates **synthetic codes only**. A complete in-client real-SPS bridge and PCVR invisibility are not established.

Contact reconstruction is also an experimental estimate, disabled for motion by default. It cannot supply missing identity, shared frames or actual mesh geometry as a fallback. See [Positioning](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.en.md).

See [lab capabilities](https://github.com/SeaLoong/Sensa/blob/main/tools/unity-world-lab/CAPABILITIES.en.md) for exact procedures and expected values.

## What is measured

SPS2's `_VFGridFinal` is a rendering-stage data texture. The inspected Plug Resolver supplies root frame, length, path points/tangents and direction. The probe calls the installed `sps_deform_walk_chain`, reporting an **unblended model centerline** and `firstSegmentStrength`. It copies `_SPS_Overrun` from the selected surface material.

This is not final visible mesh geometry: baked vertex data, blending, activation, radius changes and custom material effects may still alter it. Entry-minus-root PNG values are world-axis displacement, not direct stroke.

| Local / other side | Candidate data | Limit |
| --- | --- | --- |
| SPS2 Plug / SPS2 Socket | Local Resolver's chosen path | Other side needs no Sensa; rendering, tags/channel and valid path required |
| SPS2 Plug / old Socket | Resolver's legacy compatibility | Depends on visible legacy lights/markers and options; not universal |
| Local Socket / remote SPS2 Plug | Future remote Resolver association | Automatic discovery/identity association is not implemented |
| Local Socket / old TPS/DPS Plug | Usually no remote SPS2 Resolver | A local SPS2-reading shader cannot recover another old shader's final mesh |
| Shader blocked, culled or texture unavailable | No reliable model | Must invalidate; stale geometry must not drive output |

A shader target ID is not verified player identity. Knowing a Socket position does not identify which Plug uses it.

## Why an avatar cannot directly send GPU readback to OSC

Shader calculations do not update bones, Contacts or Animator floats. VRCAsyncGPUReadback is a **world Udon** API, not permission to run arbitrary avatar C#. Avatar OSC does not export arbitrary RenderTextures. World GPU→Udon also does not grant general UDP sending.

The EditorWindow runs only in Unity. External software cannot simply read a hidden avatar RenderTexture through an ordinary supported OSC interface.

## Editor probe setup

1. Install the [package dependencies](COMPATIBILITY.en.md) and VRCFury SPS2 from its official distribution. The adapter was inspected against source revision `d048773de971881fb14c5f3b468e59ba2406a2dd`.
2. Use PC Built-in Render Pipeline, non-XR/non-stereo Camera, ARGBFloat and AsyncGPUReadback. Keep hardware disconnected.
3. Run normal SPS build preview/Play Mode so baked Resolver and surface actually render; authoring components alone are insufficient.
4. Open **Tools → Sensa → SPS GPU Model Probe (Experimental)**. Choose the rendering camera, the BakedSpsPlug Resolver Renderer and matching Surface Renderer/material. Identity can live in global/per-material MaterialPropertyBlock, not just shared material.
5. **Check dependencies and capture next frame** verifies normalized SHA-256 of required installed includes. Unknown versions stop; do not bypass checks.
6. The tool generates `Assets/SensaGpuDiagnostics/SpsGpuProbe.shader` from the package's `.shader.txt` template. No VRCFury source is downloaded or embedded. Existing differing files are not overwritten.
7. After the selected camera renders, read a linear 36×1 float texture. Camera inactivity times out after ten seconds. Inspect 33 centerline points and export `sensa.sps-gpu-model.v1` JSON.

The diagnostic shader is for this editor experiment, not an avatar material. Removing VRCFury also requires removing the generated shader that includes it.

Addressing uses the original camera dimensions, not the small readback size. Magic/version/identity/length/direction/finite checks do **not** prove texture freshness. Global textures may retain prior frames or be affected by other cameras. Identity changes during capture are rejected. XR arrays, dynamic resolution and interleaved cameras remain unverified.

Partial firstSegmentStrength makes model and final visuals differ; even full strength does not account for every vertex effect. Resolver entry is not automatically the actual surface-contact plane.

## Offline analysis

```shell
python -X utf8 scripts/analyze-gpu-capture.py capture.json
python -X utf8 scripts/analyze-gpu-capture.py capture.json --aperture-radius 0.04 --min-incidence-degrees 10
```

This standard-library tool rejects invalid protocol, missing/nonfinite points, non-unit normals, partial blend, tangent/coplanar/reversed/multiple crossings and collapsed segments. It reports:

- `polylineLengthMeters`: 33-point polyline length; may underestimate a curved path.
- `materialFractionAfterPlane`: sampled material-coordinate fraction, not device stroke.
- `sampledArcAfterPlaneMeters` and `sampledArcFractionAfterPlane`: geometric sampled length/fraction.
- `entryPlaneOffsetMeters`, `entryTangent`, `incidenceDegrees`: crossing offset, sampled chord direction and incidence; 90° is perpendicular.
- `coarseToFineArcDifferenceMeters`: 16/32-segment sensitivity, **not an error bound**.

Explicit aperture/angle limits can reject out-of-opening or shallow crossings. Radius is world meters; this is a centerline/circular-plane model without cross-section thickness. At a polyline vertex, tangent uses the following chord, not an analytic tangent. Both sampling densities may miss smaller bends.

`usable` only describes the analysis conditions. Output always remains `diagnosticOnly`; this tool does not send OSC, alter mappings or capture your desktop.

## Image transport and timing

A candidate chain is local model shader → encoded blocks → user-selected desktop region → decoder → separate Sensa source. Exact-region/PNG decoding and diagnostic OSC are implemented; the uploadable avatar producer for **real SPS geometry** is not.

Packets use version/identity/validity/sequence/CRC/quantized coordinates. Black/white blocks are preferable to treating float RGBA as screenshot bytes. Test HDR, postprocessing, antialiasing, scale, mirrors, stereo, occlusion, minimization and low frame rate.

CRC detects some corruption, not a valid stale frame. A fresh encoder sequence can still wrap stale Resolver geometry. A fixed viewport reduces region movement during turning but cannot guarantee zero lag, hidden HMD pixels or absolute cross-camera synchronization. The camera-only prototype's editor tests do not establish these guarantees.

Use explicit capture regions; no process injection, memory reading or automatic whole-screen capture. Invalid CRC, target changes, freeze or timeout must invalidate precise input without silent OGB fallback. Compare Contact estimates, model-curve estimates and visible mesh reference separately before drawing accuracy conclusions.

References: [SPS](https://vrcfury.com/sps/), [Resolver layout](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/SPS/resolver/sps_resolver_payload.cginc), [deformation](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/SPS/deform/sps_deform_main.cginc), [world readback](https://creators.vrchat.com/worlds/udon/vrc-graphics/asyncgpureadback/), [shader fallback](https://creators.vrchat.com/avatars/shader-fallback-system/). Respect third-party licenses; only Sensa's adapter and dependency hashes are included.
