# Sensa Unity package

**English** | [简体中文](README.zh-CN.md)

Build-time authoring for VRChat Avatars: native Contacts, constraints, FX parameters and optional root-code rendering. Existing OGB/SPS parameters can use desktop mappings without installing this package.

[Interactive parameter diagrams](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) show the geometry and parameter prefixes. They are independent offline simulations, without OSC or devices. An offline copy is available at `docs/parameter-geometry.html` in the repository and desktop distribution.

## Install and choose a language

1. Use a VCC/ALCOM **Avatars** project with the Unity version and VPM dependencies required by `package.json`. Install official VRCFury separately when using its SPS authors.
2. Extract the Unity ZIP, then use Package Manager → **Add package from disk** and select `package.json`. This does not install missing VPM dependencies.
3. Sensa Inspectors and **Preferences → Sensa** offer Automatic, English and 简体中文. Explicit choice persists for the editor user. Automatic prefers the actual Editor UI language, falls back to the OS if that API is unavailable, maps Chinese variants to Simplified Chinese and otherwise uses English.
4. Editor menu registration paths and serialized/OSC identifiers remain stable English IDs. Avatar Expression Menu labels use the author's language **at build time**; they do not translate separately for each wearer.

The historical VPM index may offer an older package. Development previews do not update that stable index; check the installed version before applying this guide. The ZIP contains no VRCFury, paid model, Worlds SDK or runtime Udon. Authoring components are removed during building. Install the separate lab sources only in their matching project type.

## Select a measurement route

| Route | Setup | Meaning |
| --- | --- | --- |
| Existing OGB | Configure existing SPS/OGB and desktop mappings | Scalar Touch or radial depth estimate; [external interoperability](https://github.com/SeaLoong/Sensa/blob/main/docs/ogb-compatibility.en.md) |
| Fixed SPS root | Add **Sensa → Automatic SPS Setup**, or **Fixed SPS Root Probe** and explicitly assign Target | Your selected root in AvatarRootLocal; not a tip, orientation or world position |
| Native root code | Add **Shader Root Capture (Experimental)** | Separate [camera/desktop bridge](GPU-TRACKING.en.md), without Contact triangulation |
| Independent Point/Handle/Pose | Select local landmarks or matching paired markers | Separate experiments with their own protocols and freshness rules |

New automatic setups use Exclusive, initially Off. Dedicated permits simultaneous measurements. Target selection, native SPS activation, desktop input activation and device connection are separate controls.

## What does fixed SPS generate?

`Sensa/SPS/<id>/P0` through `P3` are four Proximity values; `Sample` is 0 when invalid and advances through n/32 (n=1…32) while active. Four known noncoplanar anchors reconstruct a local point. They share center (0,1,0), half-span 0.35, receiver radius 2 and dedicated marker radius 0.001. Only Self is generated, at five Contacts per target.

Check the green common-coverage slices in Unity Scene: a point must be inside all four receivers to be positioned. Small orange regions indicate saturation blind spots near anchors. Shader instead shows its full encoding box and has no Contact radius.

When geometry or generated components change, rebuild the Avatar and use the desktop app with the matching shared protocol. Replace the generated components as a complete set.

Coordinates use Avatar-root local units. Common world movement leaves them unchanged. Uniform scale is required; build checks and internal ScaleFactor guards enforce the world-radius limit. The display box is not guaranteed Contact coverage. [Geometry, public/control parameters and stops](AUTOMATION.en.md)

## Inspect before allowing motion

Apply OSC mode in Sensa and open **OSC → Experimental diagnostics → Local points and roots**. Pin the actual instance/source, inspect changing Sample and valid coordinates, capture two endpoints, then inspect and save the mapping draft. Experimental permission defaults off and is separate from input activation.

Sample changes indicate publication activity, not atomic Contact frames, owner identity or measured accuracy. Missing/invalid/expired observations stop motion. Old Sensa SPS paths are unsupported: rebuild the Avatar and mappings.

Unit/EditMode and mock transport checks are not uploaded-client, VR grabbing, desktop/HMD capture or hardware acceptance. QuickStart remains a hidden synthetic lab fixture, not the recommended product route.

[Automation](AUTOMATION.en.md) · [Dependencies and limits](COMPATIBILITY.en.md) · [Shader capture](GPU-TRACKING.en.md)
