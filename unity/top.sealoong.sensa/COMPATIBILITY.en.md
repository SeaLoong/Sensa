# Dependencies, scale and observability

[简体中文](COMPATIBILITY.md) | **English**

Sensa SPS supports only the current four fixed anchors, dedicated local root marker and five-field contract. It estimates the selected root in AvatarRootLocal, without compatibility with any older Sensa SPS data or arbitrary remote Avatar, world-position or GPU-mesh tracking.

## Dependencies and interoperability

Use an Avatars project with dependencies from `package.json`. Configure VRCFury SPS targets first. Unsupported upstream geometry APIs fail explicitly, without guessing positions or changing VRCFury source. External OGB paths and Touch/Depth capabilities remain interoperable and separate from this contract. [OGB research](https://github.com/SeaLoong/Sensa/blob/main/docs/ogb-compatibility.en.md)

Contacts write actual FX Animator parameters, not necessarily Expression Parameters. RawP exists only in FX; measurement fields P0–P3 and Sample enter local, unsynced public Expression Parameters. Exclusive also exposes the unsynced, unsaved menu-control Int `Sensa/Select/<group>`, default 0 (Off), with 1…N selecting ordered targets; OSC may export it. Dedicated does not generate this automatic selector. Actual OSC export still depends on client configuration. [Contacts](https://creators.vrchat.com/common-components/contacts/), [OSC parameters](https://docs.vrchat.com/docs/osc-avatar-parameters)

## Capability boundaries

| Input | Provides | Does not provide |
| --- | --- | --- |
| Sensa SPS four P values + changing Sample | Selected local root XYZ/Distance in AvatarRootLocal | World motion, tip, orientation, twist, GPU surface or atomic frames |
| Independent Root/Tip/Side Pose | Straight-pose experiment in a known paired frame | Exclusion of mixed senders or a complete GPU curve |
| OGB NewRoot/NewTip | Root-centered sphere length/radial estimate | Two independent endpoints or unique direction |
| Native PB Stretch/IsGrabbed | Stretch intensity and grab gate | XYZ/orientation |
| Shader root capture | Root coding from an independent producer | Proof of real rendering from passing Contact tests |

Four known noncoplanar anchors and true distances to one point determine local XYZ. Common rigid movement leaves distances unchanged, so Avatar world translation/rotation cannot be recovered. Coordinates use Avatar-root units, not meters under arbitrary scaling; display bounds do not guarantee common sphere coverage.

## Radius and scale

Receiver radius is 2.5 and sender radius 0.001. With unsaturated samples and common uniform scale, `p=1-(d-r)/R`, hence `d=(1-p)R+r`: the common scale cancels. Nonuniform scale or SDK radius clamping breaks that model.

VRChat caps world radius at 3 m after scaling. Builds reject nonpositive, nonuniform or oversized Avatar-root scale, root ScaleConstraint and root-scale animation. Internal FX IsLocal/ScaleFactor/selection guards permit activity within approximately 2.999 m and clear Sample/ranges on invalidity. The marker follows position/rotation without inheriting bone scale.

Keep current geometry without guessing new radii or filters from unmeasured noise. Smaller R reduces position error for a given proximity error but shrinks coverage; wider anchors improve conditioning away from the center but shrink common coverage. Low residual does not guarantee accuracy. Position filtering must not delay Sample=0, expiry or gate stops.

## Sample and failure behavior

`Sensa/SPS/<id>` exposes only P0–P3 and Sample. Zero means the producer is not permitted; active n/32 values (n=1…32) still require geometric validation. Steps are approximately 50 ms, cycling in 1.6 s. Desktop liveness follows content changes to Sample with a 1250-ms cap. Missing/nonfinite fields, invalid counts, saturation, inconsistent fits and expiry cannot drive output.

No Others group or shared moving root array is generated. Unique tags and Self filtering reduce target mixing without authenticating owners. Publishing Sample last does not create an atomic OSC packet: timing, loss, duplication and reordering can still mix data. Explicit experimental permission remains necessary.

Point/Handle/Pose remain independent experiments with oldest-contributing-channel age; Sample does not validate them. Older Sensa SPS configurations are not converted: rebuild the Avatar and save new mappings.

## Acceptance limits

Unit/EditMode verifies generated coordinates, writable internal parameters, public fields, menus, scale guards and budgets. It does not establish uploaded-client OSC, VR grabbing, GPU/HMD, remote Avatar or hardware behavior. World Udon truth and synthetic image replay are not automatically real Avatar capture evidence.

[Installation](README.en.md) · [Automation](AUTOMATION.en.md) · [Separate shader acceptance](GPU-TRACKING.en.md) · [Positioning](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.en.md)
