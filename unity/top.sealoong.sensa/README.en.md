# Sensa Unity assets

[简体中文](README.md) | **English**

Add local position measurements, paired pose tracking or grabbable PB handles to an avatar. Existing SPS OSC mapping alone does not require this package.

## Install

1. Open a VCC/ALCOM **Avatars** project, not a Worlds project.
2. Install VRChat Avatars SDK, Modular Avatar and NDMF. For automatic SPS setup, also install VRCFury and make the original SPS work first.
3. Extract the Sensa Unity ZIP. In Package Manager choose **Add package from disk** and select its `package.json`, or the equivalent file in this repository.
4. For the first avatar → OSC → Sensa test, add **Sensa → Quick Start World Receiver** at the avatar root and re-upload. No SPS/manual placement required. Follow [First OSR setup](https://github.com/SeaLoong/Sensa/blob/main/docs/quick-start.en.md).
5. Add **Sensa → Automatic SPS Setup** only for additional SPS measurements. Its default Root capability is diagnostic, not accurate stroke output.

See [Compatibility](COMPATIBILITY.en.md) for dependencies and validation limits. Follow VCC's editor requirements rather than choosing an arbitrary newer Unity version.

## Choose capabilities

| Goal | Setup |
| --- | --- |
| Observe ordinary SPS Plug root | Select your Socket; Socket Root Tracking, diagnostic only |
| Select one of several Sockets | Exclusive; SharedRootArray reduces registered root receivers |
| Grab a handle for displacement | Select Plug; Create Plug Grab Handles |
| Track your Plug relative to your Socket | Local Plug Tip Tracking and Local Reference Socket |
| Paired reference pose | Paired Socket Tracking + matching Paired Plug Markers, same Pair Channel |

Discover All scans the avatar. For selected targets only, disable it and fill Selected Targets; Excluded Targets wins. Use the inspector's target/position/Contact-cost check before building.

Native components are generated at upload/NDMF build. No individual probe placement is needed. The Sensa selection menu starts Off and remains independent of the native SPS menu.

## Observe in Sensa

Enable VRChat OSC, apply OSC mode in Sensa and keep input off initially. **Spatial diagnostics** shows instance, source and validity. Local point/PB supports **Range calibration** with two endpoints; root XYZ is not full stroke.

Without SPS, use **Local Bone or PB Probe** with a local Target and Reference, or Create Grab Handle. Give each probe a unique instance name and keep positive uniform scale throughout its measurement hierarchy.

Inspector labels/help are bilingual; original field/component names remain visible for matching documentation. OSC paths and serialized field names do not change with language.

[Advanced setup and geometry](AUTOMATION.en.md) · [Shader experiment boundaries](GPU-TRACKING.en.md)
