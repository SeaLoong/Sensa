# Dependencies and observability limits

[简体中文](COMPATIBILITY.md) | **English**

Sensa Contact arrays are experimental estimators, not general remote tracking. Desktop spatial input is disabled by default. Standard Root/SharedRoot remain diagnostic-only. [Positioning analysis](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.en.md)

## Dependencies

Use a VCC/ALCOM Avatars project with its pinned Unity, VRChat SDK, Modular Avatar and NDMF versions; exact declarations are in `package.json`. SPS separately requires configured VRCFury. Copying a package does not install missing VPM dependencies. Generated Contact/PB parameters must exist in the actual Animator; expression-parameter declarations alone are insufficient.

PC avatars are the primary target. Working SPS deformation does not prove required Root Contacts exist. Version names cannot guarantee all old TPS/DPS/SPS or Quest setups are measurable. Interaction permission, enabled Senders and actual OSC parameters are prerequisites; inspect received values rather than deformation alone. [VRCFury SPS](https://vrcfury.com/sps/)

## Available information determines capability

| Information | Possible interpretation | Not guaranteed |
| --- | --- | --- |
| Standard small Root sphere | Candidate root-center fit under a sphere model | One person, real tip, orientation, roll or accurate insertion |
| Root/Tip/Side markers | Straight pose assuming three trusted simultaneous points | Excluding mixed Senders or measuring GPU curve surfaces |
| OGB NewRoot/NewTip | Concentric-sphere length/radial estimate | Two independent endpoints or unique direction |
| Proximity scalar/old lights | Generator-specific scalar meaning | General single-sided XYZ |
| Native PB Stretch/IsGrabbed | Stretch scalar with grab gate | Position/orientation |

Modern VRCFury's NewTip length sphere remains root-centered. Rotating the axis does not change concentric-sphere distances; more receivers cannot restore missing orientation. See actual [Preset paths](https://github.com/SeaLoong/Sensa/blob/main/docs/presets.en.md), without obsolete body-location/angle/inversion templates.

## Contact array conditions

Correct dimensions, a reference frame, positive uniform scale, unique names and a budget including other plugins are required. Saturation, missing ranges, incorrect radius or mixed sources invalidate fits. Even zero residual can describe a multi-Sender ghost. Official Proximity selects the closest matching Contact per receiver without a common target identity. [VRChat Contacts](https://creators.vrchat.com/common-components/contacts/)

Root typically has eight ranges, Point/Handle four, and Pose three groups of eight. True same-point ranges from four noncoplanar anchors suffice for relative XYZ. Measurement semantics and synchronization are the current shortfall; eight receivers cannot replace an identity protocol. Output uses oldest-channel freshness with a default one-second limit. Unchanged delta-only OSC may expire.

## Research direction

A reliable redesign starts with a trusted producer supplying batched XYZ, explicit target/reference/calibration identity, frameId, valid and liveness checks. This is not implemented. Capsule fitting or short-baseline Root/Front reconstruction still faces degeneracy, noise, roll ambiguity and mixed targets; these are not supported features. Shader model snapshots remain a separate experiment without a general real-time client surface-tracking chain.

Synthetic/editor build checks do not substitute for uploaded VRChat, real VR grabbing, GPU/HMD or hardware acceptance. Record data without devices first and report the actual environment's results.

[Installation](README.en.md) · [Automation](AUTOMATION.en.md) · [Shader experiments](GPU-TRACKING.en.md)
