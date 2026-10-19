# Sensa Unity assets

[简体中文](README.md) | **English**

The package generates native Avatar Contacts, FX parameters and constraints at build time. Sensa SPS measures your explicitly selected Socket/Plug root using four anchors fixed in the Avatar-root frame. Each target has five measurement Floats: **P0, P1, P2, P3 and Sample**. It does not measure world motion, complete pose or GPU-deformed surfaces.

Existing OGB/SPS parameters can use desktop OGB mappings without this package. [OGB compatibility](https://github.com/SeaLoong/Sensa/blob/main/docs/ogb-compatibility.en.md)

## Installation and setup

1. Use a VCC/ALCOM Avatars project with the VRChat SDK, Modular Avatar and NDMF required by the manifest, and its specified Unity version.
2. Extract the Unity ZIP and select `package.json` through Package Manager → Add package from disk. Manual extraction does not install missing VPM dependencies.
3. For configured VRCFury SPS targets, add **Sensa → Automatic SPS Setup** at the Avatar root and inspect target/exclusion lists. New components default to Exclusive, initially Off; Dedicated permits simultaneous measurement.
4. Alternatively add **Sensa → Fixed SPS Root Probe** or use `SensaSpsRootProbe.prefab`, explicitly assigning Target. Instance names and Collision Channels must be unique; change both after duplication.
5. Preflight, privately upload and wear the new Avatar. Keep device input disabled while inspecting actual OSC and diagnostics.

Do not install into Worlds projects. VRCFury, SPS and paid models are not included. Authoring scripts are removed after building; runtime uses permitted native Avatar components.

## Data and geometry

The only data prefix is `Sensa/SPS/<id>`, without a version segment, Self/Others or old-path aliases. P0–P3 are Proximity values, not XYZ or insertion proportion; Sensa reconstructs the root using known geometry. Sample=0 is invalid. Active values advance through 1/32, 2/32…1 approximately every 50 ms, cycling in 1.6 seconds. Four RawP values are FX-only and are not registered in Expression Parameters; actual client OSC export still needs acceptance.

Anchors have center (0,1,0), half-span 0.5, receiver radius 2.5 and marker radius 0.001. Each target uses four receivers and one dedicated sender, with local Self reception only. The marker follows root position/rotation without inheriting target-bone scale.

AvatarRootLocal uses local units, equal to world meters only when authored-root scale and ScaleFactor both equal 1. The ±1.5 per-axis bounds also require common sphere coverage, unsaturated ranges and a consistent fit. Runtime radius stays below approximately `2.5 × authoredRootScale × ScaleFactor ≤ 2.999 m`. Nonuniform root scale, root ScaleConstraint and root-scale animation fail the build. Invalid internal guards or an Off selection reset Sample to zero.

The five fields describe each object's measurements. Automatic Exclusive also exposes the local, unsynced, unsaved menu Int `Sensa/Select/<group>`, default 0 (Off), with 1…N selecting targets. OSC may export this control; it is not a measurement field. Dedicated does not generate this automatic selector, and menu selection does not enable desktop input or connect devices.

## Desktop workflow

Apply OSC mode and open **OSC → Experimental diagnostics → Local points and roots**. Select one target/source and check four P values and a changing Sample. Capture two endpoints, inspect the mapping draft and save. Spatial input defaults off: separately save experimental permission before activating input within device limits.

Unchanged P values can remain cached, but resending the same Sample does not renew freshness. Protocol liveness is capped at 1250 ms; desktop timeout may be stricter. Sample is not an atomic OSC batch or proof of simultaneous Contacts, lossless delivery or authenticated identity. No older Sensa SPS data is compatible; rebuild the Avatar and mappings.

## Other capabilities and acceptance

Point/Handle remain independent local-bone/PB experiments; Pose remains a paired Root/Tip/Side straight-pose experiment. Their protocols and oldest-channel age checks do not become Sensa SPS. Native PB Stretch/IsGrabbed can map directly. Shader capture is a [separate pipeline](GPU-TRACKING.en.md).

QuickStart is a hidden synthetic lab fixture. Unit/EditMode tests verify generation, not uploaded-client OSC, VR grabbing, GPU/HMD or hardware behavior.

[Automation and paths](AUTOMATION.en.md) · [Dependencies and limits](COMPATIBILITY.en.md) · [Positioning](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.en.md)
