# Sensa Unity assets

[简体中文](README.md) | **English**

This package generates native Avatar Contacts, Animator parameters and constraints at build time. Default SPS root tracking uses **four anchors fixed in Avatar-root coordinates and a dedicated small marker for the selected Socket/Plug**. It measures a root point, not an actual tip, orientation or GPU-deformed surface. Desktop spatial input remains disabled by default.

Existing OGB/SPS parameters normally need no package installation: start with desktop OGB depth or vibration mappings. [OGB compatibility](https://github.com/SeaLoong/Sensa/blob/main/docs/ogb-compatibility.en.md)

## Installation and minimal setup

1. Install VRChat Avatars SDK, Modular Avatar and NDMF in a VCC/ALCOM **Avatars** project, using its pinned Unity version.
2. Extract the Sensa Unity ZIP. Select `package.json` with Package Manager → Add package from disk, or place it in `Packages/top.sealoong.sensa`. Extraction does not install missing VPM dependencies.
3. For existing SPS Sockets/Plugs, add **Sensa → Automatic SPS Setup** to the Avatar root and inspect Discover All or Selected/Excluded Targets. New components default to Exclusive; the in-game selection starts Off.
4. For one explicit object, add **Sensa → Fixed SPS Root Probe**, select Target and keep instance names and Collision Channels unique. Change channels after duplicating an author.
5. Run preflight, upload privately and wear the updated Avatar. Leave device input disarmed while checking actual OSC parameters and diagnostics.

Do not install into a Worlds project. SPS requires separately configured VRCFury; SPS and paid models are not bundled. NDMF removes authoring C# after generation; arbitrary scripts do not run on the Avatar.

## Choose a capability

| Need | Recommendation |
| --- | --- |
| Existing OGB/SPS depth or touch intensity | Unified desktop OGB mappings; no Unity package needed |
| Simple grab/stretch control | Native PB `_Stretch`+`_IsGrabbed`; replace MyPB with the real prefix |
| Selected Socket/Plug root displacement relative to the Avatar | Default fixed-four-anchor Self root, with explicit desktop experimental permission |
| Custom bone/PB point relative to a reference | Local Bone or PB Probe; experimental Point/Handle |
| Three-point straight pose or legacy shared root array | Advanced research; no replacement for target identity or synchronization |
| Shader position data | Separate capture path; see [Shader guide](GPU-TRACKING.en.md) |

QuickStart receivers and the test world remain hidden development/lab fixtures, rather than the recommended first user input.

## What the four fixed anchors measure

Four Receivers remain fixed relative to the Avatar root, around local `(0,1,0)`, with a 0.5 half-span and 2.5 radius. The target-specific Sender radius is 0.001. The marker follows the explicit target root while receivers do not move with that target. Each default object costs **4 Receivers + 1 Sender**. Custom tags and Self filtering avoid directly mixing standard roots from other Avatars.

Coordinates are `AvatarRootLocal`: translating or rotating the whole Avatar also moves the reference frame, so world motion remains unobservable. Units are Avatar-root local units, matching world metres only when authored root scale and ScaleFactor are both one. Display/mapping bounds are ±1.5 per axis around the centre; valid coverage additionally requires all four spheres, unsaturated samples and a consistent fit. The entire cube is not guaranteed measurable.

The scale guard requires `2.5 × authored root scale × ScaleFactor < approximately 2.999 m`. Unsupported runtime scale disables measurement and clears values. Nonpositive/nonuniform Avatar-root scale, root ScaleConstraint and known root-scale animation are rejected at build time. Runtime ScaleFactor does not describe arbitrary custom scale animation.

## Observe and map on desktop

Apply OSC input mode and leave input disarmed. Open **OSC → Experimental diagnostics → Local points and roots**. Confirm the selected source, unique instance, Profile=1, Valid=1, supported scale and continuing heartbeat. Two-endpoint calibration can create X/Y/Z/Distance drafts for this Self root point. Saving never activates input.

`osc.allowExperimentalSpatialInput` defaults to false. Explicit permission still requires valid samples. The fixed-root producer heartbeat permits unchanged distances to remain cached, without proving atomic sampling or lossless UDP. Older Point/Handle/Pose inputs still use the oldest contributing channel, with a default one-second limit. SharedRoot and Others root coordinates cannot drive output.

Four true ranges from known noncoplanar anchors can determine relative XYZ for one point. A fixed frame and dedicated Self marker reduce ordinary Contact ambiguity, but do not provide trusted batched coordinates with frameId. Low residual alone does not establish suitability for user hardware. See [Positioning principles](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.en.md).

[Automation and paths](AUTOMATION.en.md) · [Compatibility](COMPATIBILITY.en.md) · [Shader guide](GPU-TRACKING.en.md)
