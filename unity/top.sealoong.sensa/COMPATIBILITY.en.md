# Dependencies and one-sided SPS tracking

[简体中文](COMPATIBILITY.md) | **English**

One-sided root probing is implemented. Capsule-axis reconstruction and remote Socket-normal reconstruction remain research directions. Editor/NDMF and synthetic tests do not certify uploaded multiplayer accuracy.

## Requirements

| Area | Requirement |
| --- | --- |
| Project | VCC/ALCOM Avatars project and its supported Unity 2022.3 editor; do not switch to Unity 6 simply because it is newer |
| Packages | Avatars SDK, Modular Avatar, NDMF; manifest minimums 3.7.0 / 1.10.0 / 1.5.0 are dependency floors, not per-version test claims |
| Generation | Keep those dependencies for NDMF upload generation; baked copies may still contain MA parameter components |
| SPS visuals/automatic targets | Separately install/configure VRCFury SPS; Sensa does not ship the deformation shader |
| Desktop | Sensa supporting these paths, VRChat OSC enabled; source builds use the pinned .NET 10 SDK and Node |
| Hardware | Correct transport/firmware; Intiface Central installed separately if used; no device is needed for diagnostics |
| Other avatar | Matching standard Sender exists, is active and interaction is allowed; no Sensa desktop/shared OSC required |

The component API was checked against SDK 3.10.5. Use VCC to resolve compatible packages; copying files does not install all dependencies. Gesture Manager is optional. Probes target PC avatars; the checked VRCFury Sender factory only creates Contacts for Desktop, so Android/Quest parity is not promised.

## Information limits

| Other side provides | Local setup | Observable | Not observable |
| --- | --- | --- | --- |
| TPS_Pen_Root sphere | SensaSpsRootProbe | Root-relative XYZ diagnostics | Real tip, axis, roll, insertion ratio |
| Sensa Root/Tip/Side markers | SensaPoseSocket, same channel | Straight-reference pose | Final GPU mesh or reliable player identity |
| Old length sphere / OGB scalar | Existing preset | Approximate proximity/normalized length | Unique 3D position and orientation |
| Only DPS lights / no Contact / interactions disabled | No adequate Contact source | No reliable Contact observation | Universal one-sided tracking |

“SPS2” or visible deformation does not prove required Contacts exist. SPS2 deformation itself does not require Contacts, and old avatars do not necessarily provide Root tags. Inspect the actual components.

## Install a standard root probe

1. Place `Prefabs/SensaSpsRootProbe.prefab`, or use **GameObject → Sensa → Single-sided SPS Root Probe**.
2. Align the origin with the reference Socket and +Z inward. Use positive uniform scale through the parent chain. Measurements are local meters: at scale 2, local 1 cm is world 2 cm.
3. Default Others creates eight local Proximity receivers. Copy the profile before changing Self/Others; both creates 16. Standard Root does not filter players by Pair Channel.
4. Use a unique instanceName and leave Contact budget for other plugins.
5. Upload, enable OSC/interactions and inspect `Sensa/SpsRoot/v1/<instance>/<Self|Others>/Root/A0..A7`.
6. In Spatial diagnostics, all eight samples must be valid. Missing/saturated values, inconsistent fit or radius at the upper bound are rejected. No stroke-mapping button is provided for this diagnostic.

Cube corners are ±6 cm with 35 cm receiver radius, nominal position limit about 24 local cm and fitted radius 0–2 cm. Saturation can invalidate closer positions. No parameters means not received yet; all zero may mean out of range, disabled interaction, absent Sender or inactive setup.

Several same-tag Senders can mix across receivers. Low residual is not identity proof. Keep one target in range. Change-only OSC silence is not disconnection evidence.

## Why NewTip is not the actual tip

At the previously inspected VRCFury source revision `d048773de971881fb14c5f3b468e59ba2406a2dd`:

- TPS_Pen_Penetrating is a root-centered sphere with radius equal to length.
- TPS_Pen_Width is concentric with radius max(0.01, length − 2×radius).
- TPS_Pen_Root is a roughly 1 cm root sphere.
- TPS_Pen_Close is an axial envelope capsule.

NewRoot/NewTip receiver names therefore do not denote two spatial endpoints. Rotating concentric spheres leaves all distance observations unchanged. More receivers can locate their center but cannot invent direction. The length sphere also saturates nearby probes and cannot be treated as a second small marker.

## Research directions, not implemented capabilities

Root plus Close-capsule sampling could constrain an axis, but needs separate tests for invisible endcaps, side-only contact, spherical degeneracy, scale and mixed targets. Axial roll remains unobservable. Low RMS alone does not prove a unique solution.

Two remote Socket markers TPS_Orf_Root/TPS_Orf_Norm, about 1 cm apart, could estimate a normal. The short baseline magnifies noise and does not reveal roll. This needs dedicated quality gates and local length calibration.

Assuming a known length and manual alignment could produce a rough estimate, but fails under tilt. It is not enabled automatically. These schemes observe Contacts/bones, not shader-deformed surfaces. Avatars cannot run arbitrary C# or read another player's private OSC to fill in missing information.

References: [Contacts](https://creators.vrchat.com/common-components/contacts/), [SPS](https://vrcfury.com/sps/), [Plug baker](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs), [Socket baker](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs), [GPU route](GPU-TRACKING.en.md).
