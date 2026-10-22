# SPS authoring and generated parameters

[简体中文](AUTOMATION.md) | **English**

[Install and choose language](README.md). Automatic SPS Setup reads supported Socket/Plug authoring geometry without changing SPS. Root tracking defaults to SPS four-anchor tracking; Contact direct tracking (SDK Beta) is an explicit alternative. These routes and separate Shader capture share one NDMF generation entry point; see the [Unity build guide](https://github.com/SeaLoong/Sensa/blob/main/docs/unity-build.en.md) for timing.

## Targets and scope

Discover All finds supported VRCFury authors; Selected Targets narrows the set and Excluded Targets takes priority. Give every automatic group a unique name and assign a target to one group only. Inspect targets and Contact cost before building. Root-only measurement validates root geometry; tip, paired Plug-marker and grab-handle features additionally validate Plug length.

| Capability | Generated scope |
| --- | --- |
| SPS four-anchor tracking | Four fixed receivers and one dedicated sender per target |
| Contact direct tracking (SDK Beta) | One dedicated Sender/Receiver pair per root; native XYZ and velocity |
| Paired Socket tracking | Independent Root/Tip/Side Pose receiver arrays |
| Paired Plug markers | Three reference markers, without GPU deformation |
| Local Plug tip tracking | Local point relative to an explicitly selected reference Socket |
| Plug PB handles | Independent grabbable handle, Stretch and grab gate |

Exclusive enables one measured target per group, initially Off; Dedicated enables simultaneous measurement. Selection reduces active objects, not the registered Contact budget. Optional capabilities and other plugins count too. Unknown policies fail the build.

For one target use `SensaSpsRootProbe.prefab` or **GameObject → Sensa → SPS four-anchor tracking**. For the SDK route, use `SensaContactRootProbe.prefab` or **GameObject → Sensa → Contact direct tracking (SDK Beta)**. Both accept an Avatar bone/empty-object Transform, SPS, Sensa Component or native Contact as Target. The adapter reads the selected root frame. Instances default to `Root`; give duplicates unique instance names. An empty Collision Channel derives a stable channel from that name, or you can enter a manual override.

Separate Shader capture uses `SensaShaderCapture.prefab` or **GameObject → Sensa → Shader Root Capture (Experimental)**. It accepts the same Target types and has its own Producer ID and desktop rectangle. [Shader setup](GPU-TRACKING.en.md)

## Contact direct tracking (SDK Beta)

Choose the root tracking method in Automatic SPS Setup. SPS four-anchor tracking remains the default on stable SDK installations. Contact direct tracking requires an SDK with `advancedProximityParameters` (verified against 3.10.6-beta.2); selecting it on an older SDK fails with an installation/alternative instruction.

`Runtime/SensaContactProtocol.cs` defines `Sensa/Contact/<id>`. One 2-unit Proximity Receiver sits at the Avatar root with zero shape offset and root-aligned axes; a separate 0.001-unit Sender follows the selected root. Existing SPS Contacts are unchanged. The SDK writes ten native reports: `Proximity`, Int `Proximity_SenderType`, `Proximity_SenderLocalPositionX/Y/Z`, `Proximity_SenderVelocityX/Y/Z`, `Proximity_SenderVelocityMagnitude` and `Proximity_ProximitySpeed`. Other public fields are Float. The SDK also writes `Proximity_CollisionTag_<tag>` for the dedicated collision tag. Sensa declares this Bool in FX and clears it while inactive; it stays outside the twelve public Expression Parameter declarations. Client OSC visibility is checked separately.

XYZ uses `AvatarRootMeters`: Avatar-root origin and rotation axes, in metres without dividing by authored root scale. Velocity is SDK relative collision-point velocity in m/s; ProximitySpeed is change of normalized proximity per second. A single point has no orientation. `Radius` reports the actual world receiver radius, including authored scale and ScaleFactor. `Sample` cycles n/32 every approximately 50 ms; both controls reset to zero when inactive. The clock proves producer activity, not an atomic SDK frame or Sender authentication. Desktop activity expires after at most 1000 ms; unchanged coordinates may be cached while Sample advances. Presence and SenderType are checked separately, so zero position/velocity can be valid stationary data.

The same IsLocal, scale and selection guards apply. Contact direct tracking counts two Contacts per target; SPS four-anchor tracking counts five. All native report parameters and both controls are local, unsynced and unsaved. Both methods use the desktop spatial permission, calibration and input activation controls. [SDK semantics and limits](https://github.com/SeaLoong/Sensa/blob/main/docs/contact-sdk.en.md).

The package includes EditMode contracts for feature detection, generated parameters, placement, scale guards and selection resets. Positive SDK build contracts require the beta API and skip when it is absent. These contracts have not been executed in a stable or beta Unity Editor for this change; package metadata checks and SDK assembly inspection do not establish Unity-client or hardware acceptance.

## SPS four-anchor tracking geometry and five measurement fields

`Runtime/SensaFixedAnchorProtocol.cs` is shared with the desktop solver.

| Point | AvatarRootLocal |
| --- | --- |
| P0 | (−0.35, 0.65, −0.35) |
| P1 | (0.35, 0.65, 0.35) |
| P2 | (0.35, 1.35, −0.35) |
| P3 | (−0.35, 1.35, 0.35) |

Receiver radius is 2, marker radius 0.001. Anchors and marker share the Avatar-root scale; ParentConstraint follows the selected root's position/rotation without inheriting target-bone scale. Only the dedicated Self tag is received.

| Public suffix under `Sensa/SPS/<id>` | Meaning |
| --- | --- |
| `P0` … `P3` | Four Float Proximity values, not XYZ |
| `Sample` | 0 invalid; n/32 (n=1…32) active publication counter |

About every 50 ms, FX copies four internal RawP values then publishes Sample. The 32-step cycle lasts 1.6 seconds. RawP is not registered in Expression Parameters; FX-only does not guarantee privacy or absence from client OSC exports.

## Control parameters and language

Exclusive separately registers local, unsynced, unsaved Int `Sensa/Select/<group>`: default 0 is Off, 1…N selects ordered targets, out-of-range returns Off. It may appear in OSC but is a **menu control**, not a measurement. Dedicated has no automatic selector. No selector enables desktop input or connects devices.

Sensa's language preference changes Inspector/help/error text and generated menu captions. User names, parameter names, enum values and menu slots remain unchanged. Generated Avatar menu text is fixed at authoring/build time; it does not follow each client's language.

## Basic component and supplementary signals

`SensaComponent` generates basic OGB Contacts on the build copy. Receiver shapes bind to Depth Axis, while Plug markers bind to Root Bone/Tip Bone, so the shapes follow bone movement. Socket range and Contact sizes use the selected axis's local units, equal to metres at axis scale one.

Supplementary Contact signals accept 1–16 collision tags matching their Sender; the default is `TPS_Pen_Penetrating`. Existing-parameter signals reference the original parameter and retain its type. Generated Contact/PhysBone parameters receive both expression declarations and writable FX declarations.

Supplementary Raycast measures along the origin's local +Z axis with a range configured in metres. It exposes three native fields: `_Distance` (metres), `_Hit` (Bool) and `_Ratio` (0–1). Map `_Hit` as the hit condition, then use normalized or physical distance. [Paths, units and miss behavior](https://github.com/SeaLoong/Sensa/blob/main/docs/osc-parameters.en.md#supplementary-raycast-signals-hit-and-distance)

The build first checks that bones, PhysBones, Raycast references and other targets belong to the Avatar. Unchecked authors have their scripts removed without generation. Enabled settings on inactive objects are processed; runtime activation follows each generated rig and its menu rules. Hosts, native components and reference Transforms remain after generation.

## Validation and stops

Both root routes require positive uniform root scale and check root ScaleConstraint and known root-scale animation. IsLocal, ScaleFactor and selection guards disable Contacts and clear the route's public values while inactive, before the Receiver exceeds approximately 2.999 world metres.

SPS four-anchor tracking desktop reconstruction needs four complete, unsaturated, consistent values and a legal changing Sample. Unchanged P values may remain cached. Sample content-change age has a 1250-ms protocol cap; a positive input timeout can be stricter. Resending an unchanged Sample cannot renew activity. Publication order is not atomic OSC delivery or Sender authentication.

Contact direct tracking requires all twelve fields from the same source and instance, positive Proximity, SenderType=1, supported Radius/position bounds and Sample change age at most 1000 ms. Valid contact can report zero coordinates and zero velocity; contact loss or invalid/frozen activity stops the related motion.

For either route, capture two endpoints, replace the mapping draft, inspect and save it; separately allow experimental spatial input and activate input. Missing, invalid or expired observations stop motion. Rebuild older Sensa SPS Avatars and mappings against the current SPS four-anchor tracking contract. Independent Point/Handle/Pose keep their own oldest-channel rules.

[Limits](COMPATIBILITY.en.md) · [Native shader route](GPU-TRACKING.en.md)
