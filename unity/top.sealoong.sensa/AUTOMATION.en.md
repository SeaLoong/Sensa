# SPS authoring and generated parameters

[简体中文](AUTOMATION.md) | **English**

[Install and choose language](README.md). Automatic SPS Setup reads supported Socket/Plug authoring geometry without changing SPS. It supports only the current `Sensa/SPS/<id>` contract.

## Targets and scope

Discover All finds supported VRCFury authors; Selected Targets narrows the set and Excluded Targets takes priority. Give every automatic group a unique name and assign a target to one group only. Inspect targets and Contact cost before building.

| Capability | Generated scope |
| --- | --- |
| Fixed SPS root tracking | Four fixed receivers and one dedicated sender per target |
| Paired Socket tracking | Independent Root/Tip/Side Pose receiver arrays |
| Paired Plug markers | Three reference markers, without GPU deformation |
| Local Plug tip tracking | Local point relative to an explicitly selected reference Socket |
| Plug PB handles | Independent grabbable handle, Stretch and grab gate |

Exclusive enables one measured target per group, initially Off; Dedicated enables simultaneous measurement. Selection reduces active objects, not the registered Contact budget. Optional capabilities and other plugins count too. Unknown policies fail the build.

For one target use `SensaSpsRootProbe.prefab` or **GameObject → Sensa → Fixed-anchor SPS Root Probe**. Target deliberately starts empty. Select the actual SPS/Sensa/native Contact root; duplicated instances need unique names and collision channels. The adapter reads the CPU root frame, not its GPU surface.

## Geometry and five measurement fields

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

Nonpositive/nonuniform root scale, root ScaleConstraint and known root-scale animation fail the build. IsLocal, ScaleFactor and selection guards disable Contacts and clear P/Sample when invalid, before the receiver exceeds approximately 2.999 world meters.

Desktop reconstruction needs four complete, unsaturated, consistent values and a legal changing Sample. Unchanged P values may remain cached. Sample content-change age has a 1250-ms protocol cap; a positive input timeout can be stricter. Resending an unchanged Sample cannot renew activity. Publication order is not atomic OSC delivery or Sender authentication.

Capture two endpoints, replace the mapping draft, inspect and save it; separately allow experimental spatial input and activate input. Zero/invalid/expired observations stop motion. Older Sensa SPS data is unsupported. Independent Point/Handle/Pose keep their own oldest-channel rules.

[Limits](COMPATIBILITY.en.md) · [Native shader route](GPU-TRACKING.en.md)
