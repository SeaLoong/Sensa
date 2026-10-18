# Dependencies and observability limits

[简体中文](COMPATIBILITY.md) | **English**

Default root tracking now uses a fixed Avatar-root frame, dedicated small marker and four Self ranges. Given the known geometry and a valid producer, it estimates **the selected root point in AvatarRootLocal**. It does not track arbitrary remote Avatars, world position or GPU meshes. Desktop experimental spatial input remains disabled by default.

## Dependencies and upstream interoperability

Use a VCC/ALCOM Avatars project and its pinned Unity, VRChat SDK, Modular Avatar and NDMF versions; precise dependencies are in `package.json`. SPS authoring targets separately require VRCFury. Extraction does not install missing dependencies. Generated Contact/PB parameters must exist in the actual FX Animator; expression-parameter names alone are insufficient.

PC Avatars are the primary target. Working SPS deformation does not prove OGB Haptics activation or required parameters. Existing OGB data can use desktop mappings without this package. Modern Socket pairs, legacy proximity and Plug signals have distinct capabilities, and OGB_ENABLED has separate prerequisites. [OGB compatibility research](https://github.com/SeaLoong/Sensa/blob/main/docs/ogb-compatibility.en.md), [VRCFury SPS](https://vrcfury.com/sps/).

Fixed-root authoring resolves a CPU root centre through upstream authoring geometry or an explicit native Contact Root Transform. Unsupported geometry APIs fail explicitly; placement is never guessed from names. It does not modify VRCFury source or reverse Shader deformation. TPS/DPS/SPS version names alone cannot establish support for every Avatar or Quest setup.

## Information and capability

| Available information | Possible result | Still missing |
| --- | --- | --- |
| New fixed four anchors + dedicated Self root + Profile/Valid/Scale/Heartbeat | Selected root XYZ/Distance in a fixed Avatar-root frame | World motion, tip, orientation, roll, GPU surface and atomic frames |
| Fixed-root Others diagnostics | Inspect reception; Valid always remains zero | Unique remote identity and output permission |
| Legacy moving eight-range SharedRoot | Candidate sphere-centre diagnostics relative to a moving frame | Fixed coordinates, motion mapping and common Sender identity |
| Root/Tip/Side | Straight-pose experiment assuming trusted simultaneous points | Exclusion of mixed Senders, GPU curves and true roll |
| OGB NewRoot/NewTip | Concentric-sphere length/radial estimate | Two independent endpoints or unique orientation |
| Native PB Stretch/IsGrabbed | Stretch intensity and grab gate | XYZ or orientation |

Four fixed anchors locate one point **within a known reference frame**. Whole-Avatar rigid movement also moves that frame, so relative ranges cannot recover world translation or rotation. AvatarRootLocal uses local units, matching world metres only when authored root scale and ScaleFactor are both one. The ±1.5 display bounds do not guarantee the whole volume lies inside the four Receivers' common valid region.

## Geometry, scale and identity

Four true ranges to one point from known noncoplanar anchors uniquely determine relative XYZ. The new receivers do not follow the Socket or combine multiple remote standard roots. A dedicated-channel Self marker, fixed frame and known 0.001 radius replace that ambiguity. Defaults cost five Contacts per target. Authoring checks duplicate channels/instances and the final budget.

Receiver radius is 2.5 Avatar-root local units. Root scale must be positive and uniform. Runtime guarding keeps world radius below approximately 2.999 m, within VRChat's 3 m limit. Excessive ScaleFactor disables Contacts and clears Valid/ranges. Known root-scale animation or Avatar-root ScaleConstraint is rejected, because ScaleFactor does not describe arbitrary custom root scaling. [VRChat Contacts](https://creators.vrchat.com/common-components/contacts/).

A dedicated Self channel reduces ordinary multi-Sender mixing but still depends on correct authoring and generated components. Each Proximity Receiver selects its own nearest Sender. Enabling Others or reusing channels means four or eight samples cannot prove common identity. Legacy eight-range standard roots without the new Profile do not become fixed-root coordinates. SharedRootArray remains legacy diagnostics.

## Heartbeat and failure behavior

Profile=1, Valid, Scale and Heartbeat are directly under `Sensa/SpsRoot/v1/<instance>/Self/`; the four ranges are `Root/A0..A3`. Missing configuration/ranges, saturation, wrong Profile, invalid scale permission or an expired heartbeat block a mappable root. Others Valid is zero. Desktop requires one unique valid Self point and explicit experimental permission.

The producer copies Raw ranges and advances a 32-step i/31 Heartbeat approximately every 0.05 seconds (wrapping every 1.6 seconds), allowing static values to remain cached. Desktop heartbeat age defaults to one second, with a protocol maximum of 1.25 seconds. **This is not batched coordinates or frameId**: it cannot establish that every UDP range arrived, remained ordered or was sampled at the same physical moment. Ordinary Point/Handle/Pose still use oldest-channel age, without this dedicated-producer heartbeat relaxation.

Low residual and endpoint calibration establish model consistency and mapping only. A stronger reliable path still needs a trusted producer, explicit target/reference/calibration, batched XYZ, frameId, valid and liveness checks. The current fixed Contact protocol does not provide that path.

## Validation boundary

Static checks, synthetic reconstruction and Unity EditMode can check imports, generated geometry, parameters, menus, scale guards and budgets. They do not replace uploaded-client OSC, real VR grabbing, mixed Avatars, GPU/HMD or user-hardware acceptance. Leave device input disarmed while observing real parameters and diagnostics, then validate within explicit device limits. Report the Avatar, scale, client and actual data.

Shader capture is a separate path: passing Contact reconstruction cannot establish rendered or exported Shader correctness. Follow the [Shader guide](GPU-TRACKING.en.md) independently.

[Installation](README.en.md) · [Automation and paths](AUTOMATION.en.md) · [Positioning](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.en.md)
