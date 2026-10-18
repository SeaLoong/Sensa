# Sensa Unity assets

[简体中文](README.md) | **English**

This package supplies QuickStart, native auxiliary parameters and advanced Contact/Shader experiments. Existing SPS OSC normally needs no installation. **Contact position is an experimental local estimate; desktop output is blocked by default.**

## Install

1. Install VRChat Avatars SDK, Modular Avatar and NDMF in a VCC/ALCOM **Avatars** project. Use its pinned editor version.
2. Extract the Sensa Unity ZIP. Select `package.json` using Package Manager → Add package from disk, or place it in `Packages/top.sealoong.sensa`.
3. For a first reception test, add **Sensa → Quick Start World Receiver** to a Humanoid avatar root, upload privately and wear the new version. Follow [Quick start](https://github.com/SeaLoong/Sensa/blob/main/docs/quick-start.en.md) in the test world.
4. Add **Automatic SPS Setup** or manual probes only when investigating additional samples. Automatic setup is not a reliable positioning guarantee and does not generate universally accurate stroke.

Do not install into a Worlds project. SPS deformation requires separately configured VRCFury. SPS and paid models are not bundled. [Dependencies and limits](COMPATIBILITY.en.md)

## Choose a capability

| Need | Component/output |
| --- | --- |
| Test world → avatar → OSC | QuickStart Depth+Active, without SPS, cameras or Python |
| Simple PB control | Native Stretch+IsGrabbed scalars, calibrated against actual parameters |
| Experimental local point | Local Bone or PB Probe with Target/Reference; four Point/Handle ranges |
| Experimental standard root | Socket Root Tracking; eight-range SpsRoot/SharedRoot, diagnostic-only |
| Experimental paired pose | Socket array and Plug Root/Tip/Side with matching Pair Channel; no unique-Sender guarantee |
| Shader research | Selected editor Resolver snapshots or explicit image bridging, not general client surface tracking |

Automatic setup discovers all targets or uses Selected/Excluded Targets. Check names, reference frames, positive uniform scale and final Contact budget. Upload preprocessing generates native Contacts, Animator parameters, PhysBones and constraints; authoring components do not run arbitrary C# on avatars. Target menus default to off. SPS menus and Sensa measurement selection are separate.

## Observe on desktop

Apply OSC mode and leave input disabled. Open OSC → **Experimental diagnostics** for local estimates; expand local points/roots for two-endpoint calibration. Root/SharedRoot cannot create motion mappings. Point/Handle/Pose require explicit experimental permission and can still be blocked by incomplete or expired samples.

Four true ranges can determine relative position, but Proximity lacks reliable common-identity/shared-frame guarantees. Low residuals, declared parameters or extra receivers do not establish suitability for hardware tracking. Coordinates are `ReferenceLocal`, not world coordinates or SPS GPU-deformed surfaces. [Positioning principles](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.en.md)

[Automation and advanced options](AUTOMATION.en.md) · [Compatibility](COMPATIBILITY.en.md) · [Shader experiments](GPU-TRACKING.en.md)
