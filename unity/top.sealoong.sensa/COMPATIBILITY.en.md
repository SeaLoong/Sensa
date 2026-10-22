# Dependencies and measurement limits

[简体中文](COMPATIBILITY.md) | **English**

Use the dependencies in `package.json`, including NDMF 1.5.0+ and Modular Avatar 1.10.0+. VRCFury SPS is an optional target-authoring integration; explicitly selected bone/empty-object Transforms, Sensa or native Contact roots work independently of VRCFury. The adapter checks the selected root's supported geometry. External OGB paths retain their upstream meanings.

Author settings use one NDMF generation plugin and MA merging. Every author script implements `IEditorOnly` and is removed after processing on the build copy; hosts and native generated components remain. The SDK check reports unprocessed settings so you can enable NDMF build processing or adjust tools that insert authors later. See the [build guide](https://github.com/SeaLoong/Sensa/blob/main/docs/unity-build.en.md) for ordering and official evidence.

## What each route observes

| Input | Measurement | Reference and use |
| --- | --- | --- |
| Four-anchor tracking | One selected root in AvatarRootLocal authored units | Four fixed Receivers and one dedicated own-root Sender |
| Contact direct tracking (SDK Beta) | One selected root in AvatarRootMeters and relative contact-point velocity in m/s | One Receiver and one dedicated own-root Sender; SDK advanced Proximity parameters |
| Paired Root/Tip/Side Pose | Straight-pose experiment in a known paired frame | Paired markers with a defined layout |
| OGB NewRoot/NewTip | Root-sphere length/radial estimate | Same-instance proximity pair and calibrated depth trend |
| Native PB Stretch/IsGrabbed | Stretch intensity and grab gate | Scalar linkage from PhysBone parameters |
| Native Shader root | Encoded root Transform in AvatarRootLocal authored units | Separate renderer and desktop capture bridge |

Four-anchor tracking uses four distances to known noncoplanar anchors to locate a point. Shared translation and rotation preserve those distances; coordinates use authored Avatar-root local units. Its measurable region is the common Receiver coverage within the coordinate bounds. Contact direct tracking instead reports Sender shape midpoint displacement from a zero-offset Avatar-root Receiver, with axes following root rotation and physical metre units. A stationary root can have zero coordinates or zero velocity while contact, type and activity remain valid.

## Radius and scale

For four-anchor tracking, with unsaturated spherical samples and common uniform scale, `p=1−(d−r)/R`, so `d=(1−p)R+r`; common scale cancels in local units. Here R=2 and r=0.001. Nonuniform scale and SDK radius clamping invalidate this model.

Both root routes respect VRChat's 3 m world-radius cap. Builds require positive uniform root scale and check known root-scale animation/constraints. IsLocal, ScaleFactor and selection guards disable Contacts and clear the route's public values while inactive, keeping the Receiver within approximately 2.999 m. Contact `Radius` reports its actual world radius, including authored scale and ScaleFactor. The marker follows the selected root without inheriting target-bone scale.

For four-anchor reconstruction, a smaller receiver reduces coordinate error for a given proximity error but loses coverage; wider anchors improve some conditioning while reducing shared coverage. Assess accuracy using radius, geometry and measured error together. A low residual checks measurement consistency; filtering preserves immediate invalidity and stopping. [Official Contacts](https://creators.vrchat.com/common-components/contacts/)

## Parameters and lifecycle

Four-anchor tracking retains `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`: five local, unsynced Float Expression Parameters. RawP stays in FX. Contact direct tracking uses `Sensa/Contact/<id>/` with ten native report fields plus `Radius` and `Sample`, twelve public fields in total. `Proximity_SenderType` is Int and the other eleven are Float. The SDK-required `Proximity_CollisionTag_<tag>` Bool is declared in FX and reset while inactive; it stays outside the public Expression Parameter contract. Client OSC visibility is checked separately. Exclusive additionally exposes an unsynced, unsaved Int menu selector. [Full meanings](AUTOMATION.en.md).

Both routes require a complete same-source instance and a legal changing Sample. Four-anchor tracking additionally checks unsaturated values and a consistent fit, with a default 1000 ms Sample age and a 1250 ms cap. Contact requires positive Proximity, SenderType=1, finite values and supported Radius/position bounds; Sample age is at most 1000 ms. A shorter positive input timeout can tighten either limit. Missing, invalid or expired observations stop the related motion; zero Contact coordinates and zero velocity remain valid. Sample indicates producer activity. Dedicated tags and Self filters select the intended own root; native Contact reports have no timestamp, sequence or stable Sender ID.

Point/Handle/Pose keep separate protocols and oldest-contributing-channel freshness. Rebuild older Sensa SPS avatars/mappings instead of converting them.

## Language and acceptance

Editor locale selection is presentation-only and persists in user preferences, not avatar data. Stable menu registration paths, serialized field names, enum values and OSC identifiers remain English IDs. Baked Avatar menu labels use the author's build-time language, not a per-client runtime translator.

EditMode contracts cover generated geometry, writable FX, parameters, menus, scale guards and budgets. The new authoring-lifecycle and tracking contracts have not been executed in Unity Editor for this change. SDK package/assembly inspection and isolated tests have their own recorded scope; actual Unity/VRChat-client OSC, rendering and hardware acceptance remain separate work.

[Install](README.md) · [Automation](AUTOMATION.en.md) · [Shader acceptance](GPU-TRACKING.en.md) · [Parameter diagrams](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US)
