# Dependencies and measurement limits

[简体中文](COMPATIBILITY.md) | **English**

Use the dependencies in `package.json`; configure official VRCFury SPS separately. Unsupported geometry APIs fail explicitly without guessing placement or modifying upstream source. External OGB interoperability remains separate from Sensa's incompatible internal SPS protocol.

## What each route observes

| Input | Provides | Does not establish |
| --- | --- | --- |
| Fixed P0–P3 + changing Sample | One selected root in AvatarRootLocal | World motion, orientation, twist, tip or GPU surface |
| Paired Root/Tip/Side Pose | Straight-pose experiment in a known paired frame | Unique Sender identity or a complete curved mesh |
| OGB NewRoot/NewTip | Root-sphere length/radial estimate | Two independently measured endpoints |
| Native PB Stretch/IsGrabbed | Stretch intensity and grab gate | XYZ or orientation |
| Native shader root | Encoded root Transform, separate rendering/bridge | Successful real-client capture from Contact test results |

Four true distances to known noncoplanar anchors identify a local point. Common rigid motion leaves distances unchanged. Coordinates are local units, not arbitrary-scale world meters. The ±2 display box is not guaranteed shared sphere coverage.

## Radius and scale

With unsaturated spherical samples and common uniform scale, `p=1−(d−r)/R`, so `d=(1−p)R+r`; common scale cancels in local units. Here R=2 and r=0.001. Nonuniform scale and SDK radius clamping invalidate this model.

VRChat caps scaled world radius at 3 m. Builds reject invalid root scale and known root-scale animation/constraints; internal IsLocal/ScaleFactor/selection guards clear P/Sample on invalidity, keeping the receiver within approximately 2.999 m. Target-bone scale is not inherited by the marker.

A smaller receiver reduces coordinate error for a given proximity error but loses coverage; wider anchors improve some conditioning while reducing shared coverage. No filter or radius change is claimed as a measured accuracy improvement. Low residual is consistency, not accuracy; filtering must never delay invalidity or stop gates. [Official Contacts](https://creators.vrchat.com/common-components/contacts/)

## Parameters and lifecycle

The measurement contract is only `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`, with no old alias, moving shared array or Others branch. Float measurement fields are local and unsynced Expression Parameters. RawP stays internal FX. Exclusive additionally exposes an unsynced, unsaved Int menu selector; [full meanings](AUTOMATION.en.md).

Sample=0, invalid counter, missing/nonfinite values, saturation, inconsistent fit or expiry cannot drive motion. A changing legal counter proves publication activity only; it does not prove atomically sampled Contacts, lossless UDP or ownership. Unique tags and Self filters reduce mixing without authenticating identity.

Point/Handle/Pose keep separate protocols and oldest-contributing-channel freshness. Rebuild older Sensa SPS avatars/mappings instead of converting them.

## Language and acceptance

Editor locale selection is presentation-only and persists in user preferences, not avatar data. Stable menu registration paths, serialized field names, enum values and OSC identifiers remain English IDs. Baked Avatar menu labels use the author's build-time language, not a per-client runtime translator.

EditMode checks generated geometry, writable FX, parameters, menus, scale guards and budgets. It does not prove uploaded OSC, VR grabbing, remote avatars, desktop/HMD rendering or hardware. World Transform truth and synthetic replay are different evidence from actual Avatar capture.

[Install](README.md) · [Automation](AUTOMATION.en.md) · [Shader acceptance](GPU-TRACKING.en.md) · [Parameter diagrams](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US)
