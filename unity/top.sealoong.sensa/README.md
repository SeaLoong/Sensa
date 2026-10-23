# Sensa Unity package

**English** | [简体中文](README.zh-CN.md)

Sensa Unity components store tracking and parameter settings. Avatar builds generate native Contacts, constraints, FX animation, parameters and menus from those settings. Avatars with existing OGB/SPS parameters can also configure mappings directly in the desktop app.

[Interactive parameter diagrams](https://sealoong.github.io/Sensa/parameter-geometry.html) show the geometry and parameter prefixes. Browse geometry and values independently, including offline. An offline copy is available at `docs/parameter-geometry.html` in the repository and desktop distribution.

## Install and choose a language

1. Use a VCC/ALCOM **Avatars** project with the Unity version and VPM dependencies required by `package.json`, including NDMF 1.5.0+ and Modular Avatar 1.10.0+. Install official VRCFury separately when using its SPS authors.
2. Extract the Unity ZIP, then use Package Manager → **Add package from disk** and select `package.json`. Use VCC/ALCOM to install the listed VPM dependencies.
3. Sensa Inspectors and **Preferences → Sensa** offer Automatic, English and 简体中文. Explicit choice persists for the editor user. Automatic prefers the actual Editor UI language, falls back to the OS if that API is unavailable, maps Chinese variants to Simplified Chinese and otherwise uses English.
4. Editor menu registration paths and serialized/OSC identifiers remain stable English IDs. Avatar Expression Menu labels use the author's language **at build time**; they do not translate separately for each wearer.

The historical VPM index may offer an older package. Development previews do not update that stable index; check the installed version before applying this guide. The ZIP contains no VRCFury, paid model, Worlds SDK or runtime Udon. The build copy receives native components, and the author scripts are removed. Install the separate lab sources only in their matching project type.

## Select a measurement route

| Route | Setup | Meaning |
| --- | --- | --- |
| Existing OGB | Configure existing SPS/OGB and desktop mappings | Scalar Touch or radial depth estimate; [external interoperability](https://github.com/SeaLoong/Sensa/blob/main/docs/ogb-compatibility.en.md) |
| SPS four-anchor tracking | Add **Sensa → Automatic SPS Setup**, or **SPS four-anchor tracking** and explicitly assign Target | Root position relative to the Avatar root, in AvatarRootLocal authored units |
| Contact direct tracking (SDK Beta) | Choose **Contact direct tracking (SDK Beta)** in automatic setup, or add its prefab and explicitly assign Target | Dedicated Sender/Receiver; root coordinates in metres and relative SDK velocity; requires advanced proximity parameters |
| Shader root capture | Add **Shader Root Capture (Experimental)** or `SensaShaderCapture.prefab`, and assign Target | AvatarRootLocal position, X/Z-axis vectors and Avatar world scale encoded into a monochrome image and read by the [desktop bridge](GPU-TRACKING.en.md) |
| Independent Point/Handle/Pose | Select local landmarks or matching paired markers | Separate experiments with their own protocols and freshness rules |

All three root prefabs accept an Avatar bone/empty-object Transform, SPS, Sensa Component or native Contact. Instances of SPS four-anchor tracking and Contact direct tracking default to `Root`; rename duplicates to unique instances, and an empty collision channel is derived from that name. Menu creation fills an unambiguous selected target; check Target before building.

New automatic setups use Exclusive, initially Off. Dedicated permits simultaneous measurements. Target selection, native SPS activation, desktop input activation and device connection are separate controls.

## How settings become a built Avatar

All nine author scripts implement `IEditorOnly`. One NDMF plugin generates Contacts and temporary animation/parameter/menu inputs in Generating before Modular Avatar, which then merges them. Generation removes the author scripts while retaining their hosts, reference Transforms and native measurement components. Keep hosts as ordinary GameObjects; reserve the `EditorOnly` object tag for purely editorial helpers removed as an entire hierarchy.

An SDK checkpoint verifies that authors were processed. If NDMF build processing is disabled or another tool inserts Sensa authors later, the build lists remaining types so you can adjust setup and ordering. See the [Unity build guide](https://github.com/SeaLoong/Sensa/blob/main/docs/unity-build.en.md) for phases, official sources and basic-component behavior.

## What does SPS four-anchor tracking generate?

`Sensa/SPS/<id>/P0` through `P3` are four Proximity values; `Sample` is 0 when invalid and advances through n/32 (n=1…32) while active. Four known noncoplanar anchors reconstruct a local point. They share center (0,1,0), half-span 0.35, receiver radius 2 and dedicated marker radius 0.001. Only Self is generated, at five Contacts per target.

Check the green common-coverage slices in Unity Scene: a point must be inside all four receivers to be positioned. Small orange regions indicate saturation blind spots near anchors. Shader instead shows its full encoding box and has no Contact radius.

When geometry or generated components change, rebuild the Avatar and use the desktop app with the matching shared protocol. Replace the generated components as a complete set.

Coordinates use Avatar-root local units. Common world movement leaves them unchanged. Uniform scale is required; build checks and internal ScaleFactor guards enforce the world-radius limit. The display box is not guaranteed Contact coverage. [Geometry, public/control parameters and stops](AUTOMATION.en.md)

## Inspect before allowing motion

Apply OSC mode in Sensa and open **OSC → Experimental diagnostics → Local points and roots**. Pin the actual instance/source, inspect changing Sample and valid coordinates, capture two endpoints, then inspect and save the mapping draft. Experimental permission defaults off and is separate from input activation.

Sample indicates ongoing publication; actual-client checks also inspect target identity, field consistency and measurement accuracy. Missing/invalid/expired observations stop motion. Old Sensa SPS paths are unsupported: rebuild the Avatar and mappings.

Unit, package and mock-transport checks record their respective scope. Unity Editor, uploaded-client behavior, VR grabbing, desktop/HMD capture and device response receive separate acceptance checks. QuickStart remains an internal synthetic lab fixture.

[Build pipeline](https://github.com/SeaLoong/Sensa/blob/main/docs/unity-build.en.md) · [Automation](AUTOMATION.en.md) · [Dependencies and limits](COMPATIBILITY.en.md) · [Shader capture](GPU-TRACKING.en.md)
