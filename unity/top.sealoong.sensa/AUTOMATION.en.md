# SPS authoring and generated parameters

[简体中文](AUTOMATION.md) | **English**

[Install and choose language](README.md). Automatic SPS Setup reads supported Socket/Plug authoring geometry without changing SPS. Root tracking defaults to Four-anchor tracking; Contact direct tracking (SDK Beta) is an explicit alternative.

## Targets and scope

Discover All finds supported VRCFury authors; Selected Targets narrows the set and Excluded Targets takes priority. Give every automatic group a unique name and assign a target to one group only. Inspect targets and Contact cost before building.

| Capability | Generated scope |
| --- | --- |
| Four-anchor tracking | Four fixed receivers and one dedicated sender per target |
| Contact direct tracking (SDK Beta) | One dedicated Sender/Receiver pair per root; native XYZ and velocity |
| Paired Socket tracking | Independent Root/Tip/Side Pose receiver arrays |
| Paired Plug markers | Three reference markers, without GPU deformation |
| Local Plug tip tracking | Local point relative to an explicitly selected reference Socket |
| Plug PB handles | Independent grabbable handle, Stretch and grab gate |

Exclusive enables one measured target per group, initially Off; Dedicated enables simultaneous measurement. Selection reduces active objects, not the registered Contact budget. Optional capabilities and other plugins count too. Unknown policies fail the build.

For one target use `SensaSpsRootProbe.prefab` or **GameObject → Sensa → Four-anchor tracking**. For the SDK route, use `SensaContactRootProbe.prefab` or **GameObject → Sensa → Contact direct tracking (SDK Beta)**. Target deliberately starts empty. Select the actual SPS/Sensa/native Contact root; duplicated instances need unique names and collision channels. Explicit Sensa/native Contact targets work without VRCFury. The adapter reads the CPU root frame, not its GPU surface.

## Contact direct tracking (SDK Beta)

Choose the root tracking method in Automatic SPS Setup. Four-anchor tracking remains the default on stable SDK installations. Contact direct tracking requires an SDK with `advancedProximityParameters` (verified against 3.10.6-beta.2); selecting it on an older SDK fails with an installation/alternative instruction.

`Runtime/SensaContactProtocol.cs` defines `Sensa/Contact/<id>`. One 2-unit Proximity Receiver sits at the Avatar root with zero shape offset and root-aligned axes; a separate 0.001-unit Sender follows the selected root. Existing SPS Contacts are unchanged. The SDK writes ten native reports: `Proximity`, Int `Proximity_SenderType`, `Proximity_SenderLocalPositionX/Y/Z`, `Proximity_SenderVelocityX/Y/Z`, `Proximity_SenderVelocityMagnitude` and `Proximity_ProximitySpeed`. Other public fields are Float. The SDK also writes `Proximity_CollisionTag_<tag>` for the dedicated collision tag. Sensa declares this Bool in FX and clears it while inactive; it stays outside the twelve public Expression Parameter declarations. Client OSC visibility is checked separately.

XYZ uses `AvatarRootMeters`: Avatar-root origin and rotation axes, in metres without dividing by authored root scale. Velocity is SDK relative collision-point velocity in m/s; ProximitySpeed is change of normalized proximity per second. A single point has no orientation. `Radius` reports the actual world receiver radius, including authored scale and ScaleFactor. `Sample` cycles n/32 every approximately 50 ms; both controls reset to zero when inactive. The clock proves producer activity, not an atomic SDK frame or Sender authentication. Desktop activity expires after at most 1000 ms; unchanged coordinates may be cached while Sample advances. Presence and SenderType are checked separately, so zero position/velocity can be valid stationary data.

The same IsLocal, scale and selection guards apply. Contact direct tracking counts two Contacts per target; Four-anchor tracking counts five. All native report parameters and both controls are local, unsynced and unsaved. Both methods use the desktop spatial permission, calibration and input activation controls. [SDK semantics and limits](../../docs/contact-sdk.en.md).

The package includes EditMode contracts for feature detection, generated parameters, placement, scale guards and selection resets. Positive SDK build contracts require the beta API and skip when it is absent. These contracts have not been executed in a stable or beta Unity Editor for this change; package metadata checks and SDK assembly inspection do not establish Unity-client or hardware acceptance.

## Four-anchor geometry and five measurement fields

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

## Validation and stops

Both root routes require positive uniform root scale and check root ScaleConstraint and known root-scale animation. IsLocal, ScaleFactor and selection guards disable Contacts and clear the route's public values while inactive, before the Receiver exceeds approximately 2.999 world metres.

Four-anchor desktop reconstruction needs four complete, unsaturated, consistent values and a legal changing Sample. Unchanged P values may remain cached. Sample content-change age has a 1250-ms protocol cap; a positive input timeout can be stricter. Resending an unchanged Sample cannot renew activity. Publication order is not atomic OSC delivery or Sender authentication.

Contact direct tracking requires all twelve fields from the same source and instance, positive Proximity, SenderType=1, supported Radius/position bounds and Sample change age at most 1000 ms. Valid contact can report zero coordinates and zero velocity; contact loss or invalid/frozen activity stops the related motion.

For either route, capture two endpoints, replace the mapping draft, inspect and save it; separately allow experimental spatial input and activate input. Missing, invalid or expired observations stop motion. Rebuild older Sensa SPS Avatars and mappings against the current four-anchor contract. Independent Point/Handle/Pose keep their own oldest-channel rules.

[Limits](COMPATIBILITY.en.md) · [Native shader route](GPU-TRACKING.en.md)
