# SPS automation and the five-field contract

[简体中文](AUTOMATION.md) | **English**

Automatic SPS Setup reads existing Socket/Plug authoring geometry and generates dedicated markers and fixed anchors without changing SPS. Only the current `Sensa/SPS/<id>` contract is supported, with no old modes, shared moving array or protocol fallback.

## Targets and selection

Add **Sensa → Automatic SPS Setup** at the Avatar root. Discover All finds supported VRCFury authors; Selected Targets narrows them, with Excluded Targets taking priority. Assign each target to one automatic group.

| Capability | Base cost and meaning |
| --- | --- |
| Fixed SPS root tracking | Four receivers and one dedicated sender per Socket/Plug |
| Paired Socket Tracking | Eight receivers per Root/Tip/Side marker, an independent pose experiment |
| Paired Plug Markers | Three paired markers, not GPU tips |
| Local Plug Tip Tracking | Four-point array at a reference Socket and an undeformed-tip marker |
| Create Plug Grab Handles | Independent PB handle and grab gate |

Only Dedicated (simultaneous) and Exclusive (one selected target, initially Off) remain. Exclusive reduces active objects, not registered Contact count. Unknown serialized policies fail the build. Optional capabilities and other plugins count toward the budget. Local Plug Tip needs a reference Socket; a sole candidate can be selected automatically.

A single target can use Fixed SPS Root Probe or `SensaSpsRootProbe.prefab`. **GameObject → Sensa → Fixed-anchor SPS Root Probe** creates the same author. Target starts empty and must explicitly reference a real SPS/Sensa/native Contact root. Duplicated prefab instances need unique names/channels. ReadRoot resolves the CPU Transform center, not GPU deformation.

## Fixed geometry

`Runtime/SensaFixedAnchorProtocol.cs` is the shared source, with fixed P0–P3 ordering:

| Point | AvatarRootLocal |
| --- | --- |
| P0 | (-0.5, 0.5, -0.5) |
| P1 | (0.5, 0.5, 0.5) |
| P2 | (0.5, 1.5, -0.5) |
| P3 | (-0.5, 1.5, 0.5) |

Receiver radius is 2.5 and marker radius 0.001. Anchors stay under the Avatar root; ParentConstraint follows target position/rotation while retaining the shared uniform root scale. Only your own dedicated-tag sphere is received; no Others group is generated.

## Public data and internal FX

| Path | Meaning |
| --- | --- |
| `Sensa/SPS/<id>/P0…P3` | Four Float Proximity values, not XYZ |
| `Sensa/SPS/<id>/Sample` | 0 invalid; n/32 (n=1…32) active counter |

Active states copy four internal RawP values to P0–P3 before committing Sample approximately every 0.05 seconds, cycling in 1.6 seconds. RawP, IsLocal and ScaleFactor participate in internal FX; RawP is not registered in Expression Parameters. Exclusive separately registers the local, unsynced, unsaved Expression Parameter Int `Sensa/Select/<group>`, default 0 (Off), with 1…N selecting ordered targets and out-of-range values returning Off. Dedicated does not generate this automatic selector. It may be exported through OSC as a menu control, not as one of the five measurement fields; it does not enable desktop input or connect devices. FX-only is neither a security boundary nor a client export privacy guarantee.

Avatar-root scale must be positive and uniform. Known root-scale animation/ScaleConstraint fails the build. Internal ScaleFactor guards disable Contacts and clear P/Sample before receiver world radius exceeds approximately 2.999 m. Unselected or nonlocal states also invalidate. Removing public Scale does not remove scale validation.

## Desktop and experiment limits

Apply OSC mode and select one instance/source. Four P values must be complete, unsaturated and consistent with the model; Sample must be legal and changing. Unchanged distances can remain cached, with a 1250-ms protocol liveness cap. Resending the same Sample does not renew freshness. Zero, invalidity or expiry stops output; Sample does not prove atomic sampling or lossless delivery.

Capture two endpoints in the root panel, replace and save mappings. Experimental permission and input activation remain separate explicit actions. Old Sensa SPS paths are not converted: rebuild the Avatar and mappings after upgrading. Independent Point/Handle/Pose experiments do not use this relaxed freshness rule.

[Installation](README.en.md) · [Dependencies and limits](COMPATIBILITY.en.md) · [Independent shader capture](GPU-TRACKING.en.md)
