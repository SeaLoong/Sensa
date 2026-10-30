# OGB interoperability and detection geometry

[简体中文](ogb-compatibility.md) | **English**

OGB/SPS parameters describe approach, entry and touch. Use their geometry and naming rules to choose readings, calibrate a depth or intensity, and connect it to a Sensa output. This reference covers Socket, Plug and independent touch-zone signals with links to the upstream definitions.

Find the actual source and complete path in the parameter list, then choose the [depth or vibration template](presets.en.md). **SPS2 · PenOthersNewRoot / PenOthersNewTip** pairs two readings to estimate a depth trend; **SPS1 · PenOthers / PenOthersClose** combines its depth signal with an effective nearby region. Keep pairs within one source, instance and Self/Others category, and enable the Avatar’s OGB_ENABLED heartbeat when needed.

**External OGB paths retain upstream names.** Sensa SPS four-anchor tracking and Shader parameters have their own [dictionary](osc-parameters.en.md). The [online explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) shows the detection spheres and capsules, with gray profiles to explain relative Socket/Plug placement.

Research is pinned to VRCFury `6bd33f4cb453df816c943a335e47f64e6a37e188`, OGB v2.1.30 `643aedd493ba21b0c0859ce6e57708fe408ee9c0`, and OGB v1.0.0 `262164576721f12958409638851808aa662b87c7`. Version 1.0.0 already reads `PenOthersNewRoot`/`PenOthersNewTip` and `PenOthers`. The explorer’s SPS1/SPS2 labels identify parameter geometry; use the paths actually published by the Avatar. [Old consumer](https://github.com/OscToys/OscGoesBrrr/blob/262164576721f12958409638851808aa662b87c7/src/main/GameDevice.ts#L68-L151)

The explorer was checked against **VRCFury 1.1434.0**. Its `BakeHapticSocketsService.cs`, `VRCFuryHapticSocketBaker.cs` and `VRCFuryHapticPlugBaker.cs` match the pinned commit above.

The Node [OscServices](https://github.com/SeaLoong/Sensa/blob/main/src/node/inputs/osc-services.ts) receives OSC/OSCQuery and tracks sources. The shared [RuntimeEngine](https://github.com/SeaLoong/Sensa/blob/main/src/core/runtime/runtime.ts) interprets OgbDepth/OgbTouch and routes the result through the same output coordinator. Source identity keeps paired readings attached to one instance; geometry and units follow the upstream definitions below.

## Starting dimensions in the explorer

Each parameter uses its upstream generation rule. Plug length, width and the automatic Socket touch region come from Avatar dimensions. The explorer provides an explicit example of those dimensions; adjust the sliders to match your Avatar.

| Scene | VRCFury generation rule | Explorer starting value |
| --- | --- | --- |
| SPS2 · NewRoot / NewTip | Both receiver radii are 1 m; the Plug-root marker radius is 0.01 m | 1 m / 0.01 m |
| SPS1 · PenOthers and Socket Touch | Receiver radius D follows region length; automatic length is 5% of Avatar view height, with Close radius D/2.5 | Example view height 1.60 m → D=0.08 m, Close=0.032 m |
| Plug-side depth, touch and rubbing | Generated from actual Plug length L and radius W | Example L=0.20 m, W=0.03 m |
| Socket-root marker | Radius 0.001 m | 0.001 m |
| Independent Touch Zone | Default radius 0.10 local units, following object scale | 0.10 m at scale 1 |

Sensa **SPS four-anchor tracking** and **Contact direct tracking** create their own Contacts: receiver radius 2 in authored local units and target marker radius 0.001, corresponding to 2 m and 1 mm at authored scale 1. They use `Sensa/SPS/…` and `Sensa/Contact/…`; see [position tracking](positioning.en.md) for their geometry. Native `OGB/…` parameters retain the VRCFury dimensions above.

## Radius and values first

Paths omit `/avatar/parameters/`. Orf means Socket; Pen means Plug. Their root centres are the origins, with +Z pointing forward in the author's frame. Self/Others filter matching targets on this Avatar or other Avatars.

| Symbol | Meaning here |
| --- | --- |
| L | Plug world length at generation |
| W | Plug world radius at generation |
| e | `min(W, 0.08 m)`, Plug touch expansion |
| D | Socket touch-zone depth |
| R, r | Actual Receiver and spherical Sender radii |
| H | Complete capsule height, including both hemispheres |

Proximity is a continuous 0–1 value, usually increasing as a target approaches the detection center. Constant reports presence in the effective nearby region: one inside, zero after leaving. Each Proximity Receiver independently selects the matching Sender with the greatest strictly positive Proximity. [SDK Beta.3](https://vrc-beta-docs.netlify.app/releases/release-3-10-6) resolves two values of 1 by choosing the smaller separation between nearest inner points. A spherical receiver measures the nearest Sender surface to its centre. For two spheres:

```text
p = clamp(1 - max(0, |senderCenter - receiverCenter| - r) / R, 0, 1)
Contact begins at approximately R + r centre distance.
The value saturates when the Sender contains the Receiver centre.
```

Detection distance depends on both receiver and target signal shape. For a 10 cm receiver, add the target sphere’s radius to obtain the initial center distance. Capsules and body targets use their nearest surface. VRChat limits scaled radii to 3 m and width/height/depth to 6 m. [Official Contacts behavior](https://creators.vrchat.com/common-components/contacts/)

## Socket: `OGB/Orf/<id>`

VRCFury generates this set through OGB Haptics; SpsForAll automatic supplementation has its own branch. `PenOthersNewRoot`/`PenOthersNewTip` and their Self pairs provide SPS2. Enabling the touch zone also generates the Touch, SPS1 and Frot parameters below.

| Leaf parameter | Type and detected object | Receiver geometry | Sensa interpretation |
| --- | --- | --- | --- |
| FrotOthers | Proximity; another Socket root tag | Center +0.05·Z, sphere R=0.1 m; needs touch zone | Approach/brushing intensity, read directly by OgbTouch |
| PenOthers | Proximity; TPS_Pen_Penetrating | Center -D·Z, sphere R=D; needs touch zone | SPS1 depth trend |
| PenOthersClose | Constant; same Plug tag | Center -D/2·Z, capsule R=D/2.5, H=D; needs touch zone | 1 when a target enters the Socket’s effective nearby region |
| PenOthersNewRoot | Proximity; another Avatar’s Plug root Sender | Root center, sphere R=1 m | SPS2 root proximity paired with NewTip for depth conversion |
| PenOthersNewTip | Proximity; another Avatar’s Plug length Sender | Root center, sphere R=1 m | SPS2 length-sphere proximity paired with NewRoot for length estimation |
| PenSelfNewRoot | Proximity; own Plug root Sender | Root center, sphere R=1 m | Corresponding SPS2 pair for Self |
| PenSelfNewTip | Proximity; own Plug length Sender | Root center, sphere R=1 m | Corresponding SPS2 length companion for Self |
| TouchOthers | Proximity; others’ Head/Hand/Foot/Finger | Center -D·Z, sphere R=D; needs touch zone | Touch intensity with TouchOthersClose |
| TouchOthersClose | Constant; corresponding body tags | Center -D/2·Z, capsule R=D/2.5, H=D; needs touch zone | 1 when a target enters the corresponding touch region |
| TouchSelf | Proximity; own Hand/Finger/Foot | Center -D·Z, sphere R=D; needs touch zone | Touch intensity with TouchSelfClose |
| TouchSelfClose | Constant; corresponding body tags | Center -D/2·Z, capsule R=D/2.5, H=D; needs touch zone | 1 when an own target enters the corresponding touch region |

D follows authored `length`. The component defaults to zero; an enabled touch zone then uses 5% of Avatar view height. A positive length is used directly in metre mode, or multiplied by object world Z scale in local-unit mode. A valid touch zone generates the corresponding parameters above; scale conversion is described below. [Component default](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Runtime/Component/VRCFuryHapticSocket.cs#L31-L34), [Socket generator](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L174-L273), [D calculation](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs#L303-L318)

Official OGB still consumes legacy Orf/PenSelf, but this modern generator does not create it. Calibrate historical sources using their actual paths and authored geometry. The table lists the current generator’s supported Socket leaves.

## Plug: `OGB/Pen/<id>`

| Leaf parameter | Type and detected object | Receiver geometry | Sensa interpretation |
| --- | --- | --- | --- |
| FrotOthers | Proximity; another Plug envelope tag | Root center, sphere R=L | Close/brushing intensity with FrotOthersClose |
| FrotOthersClose | Constant; another Plug envelope tag | Center L/2·Z, capsule R=W+0.08 m, H=L | 1 when a matching target enters the effective nearby region |
| PenOthers | Proximity; another Avatar’s Socket root tag | Root center, sphere R=L | Depth trend, using the original OgbDepth value |
| PenSelf | Proximity; own Socket root tag | Root center, sphere R=L | Corresponding depth trend for Self |
| TouchOthers | Proximity; others’ Hand/Finger/Foot | Root center, sphere R=L+e | Touch intensity with TouchOthersClose |
| TouchOthersClose | Constant; same tags | Center L/2·Z, capsule R=W+e, H=L+2e | 1 when a matching target enters the touch region |
| TouchSelf | Proximity; own Hand/Finger/Foot | Root center, sphere R=L+e | Touch intensity with TouchSelfClose |
| TouchSelfClose | Constant; same tags | Center L/2·Z, capsule R=W+e, H=L+2e | 1 when an own target enters the touch region |

Plug TouchOthers detects Hand/Finger/Foot. Socket TouchOthers includes Head in addition to those body tags. [Plug generator](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L175-L256), [tag definitions](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/HapticUtils.cs#L13-L35)

Plug depth uses `PenOthers` or `PenSelf`, mapped with its original value and intended direction. Touch and Frot use the corresponding Close conditions in the table.

## Sender geometry defines the other object's size

Senders define the target shape seen by a receiver. Common generated objects are:

| Generated object | Sender shape and tag | Purpose |
| --- | --- | --- |
| Plug Root | Root-centred sphere r=0.01 m; TPS_Pen_Root | SPS2 PenOthersNewRoot/PenSelfNewRoot |
| Plug Length | Root-centred sphere r=L; TPS_Pen_Penetrating | SPS2 NewTip and SPS1 PenOthers observe a root-centered length sphere |
| Plug WidthHelper | Root-centred sphere r=max(0.01 m,L-2W); TPS_Pen_Width | Upstream internal width aid |
| Plug Envelope | Centre L/2·Z; capsule R=W, H=L; TPS_Pen_Close | Plug frottage/independent touch zones |
| Socket Root | Root-centred sphere r=0.001 m; includes TPS_Orf_Root | Plug PenSelf/PenOthers and Socket FrotOthers |
| Socket Front | +0.01·Z, sphere r=0.001 m; TPS_Orf_Norm etc. | Upstream direction aid |

For example, Plug/PenOthers starts producing values at approximately L+0.001 m center distance. SPS1 Socket `PenOthers` observes the root-centered Length sphere r=L (TPS_Pen_Penetrating). SPS2 `PenOthersNewRoot` observes the r=0.01 root sphere, while `PenOthersNewTip` observes the r=L length sphere. Their shared center makes readings depend mainly on root-center distance. Approach aligned with the Socket is readily understood as a depth trend; for sideways movement or tilt, use the illustration and calibrate actual endpoints. [Plug Senders](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs#L60-L108), [Socket Senders](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs#L37-L83)

## Other real parameters and unsupported names

| Parameter | Actual meaning | Current Sensa behavior |
| --- | --- | --- |
| OGB_ENABLED | Avatar input bool enabling local Orf/Pen Haptics | Explicit fixed-destination control; true every five seconds |
| VFH/Version/10 | Current generator capability-marker path | Inspect supported capabilities in the parameter list |
| Legacy `OGB/Pen/<id>/Version/8`, `OGB/Orf/<id>/Version/9`, `VFH/Version/9` | Historical capability markers still recognized by official OGB | Identifies historical-source capabilities |
| `VFH/Zone/Touch/<id>/Self`, `VFH/Zone/Touch/<id>/Others` | Independent SPS Touch Zone proximity | Direct 0–1 OgbTouch reading, without Close |
| `TPS_Internal/Orf/<id>/Depth_In`, `TPS_Internal/Pen/<id>/RootRoot` | Official OGB's native TPS branch | Outside automatic OgbDepth paths; requires explicit direct mapping |
| Custom Angle/Depth/Trigger etc. | Meaning is defined by the actual sender | Configure explicit mappings such as Direct using sender documentation |

An independent Touch Zone is a sphere centred at its authored object. Its radius defaults to 0.1 local units with worldScale=false, so world radius follows object scale. It accepts body and Plug-envelope tags without the Orf/Pen Close gate, and does not register with the OGB_ENABLED gate above. Official OGB bridge and Sensa OgbTouch both read this namespace. Sensa reads each zone intensity separately by complete instance, source and Self/Others category. [Zone generator](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Feature/VRCFuryHapticTouchReceiverBuilder.cs#L21-L49), [default radius](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Runtime/Component/VRCFuryHapticTouchReceiver.cs#L4-L7), [OGB path parser](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/bridge.ts#L39-L67)

Version 10 is an upstream capability marker. Sensa recognizes supported features from paths, while motion intensity comes from actual Pen, Touch or Frot readings. [Marker generation](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticVersionsService.cs#L16-L29), [OGB capability recognition](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/main.ts#L108-L120)

## World scale and the Socket estimate

A worldScale=true request divides the position vector, radius and height by the same **build-time** worldScale.x scalar. False retains authored local values. D’s local length separately uses Z scale. Inspect generated dimensions when using nonuniform scaling. Plug/Socket WorldSpace also uses ScaleConstraint to preserve world scale; OGB Receivers live under OneSpace. Runtime scaling also affects actual world radii. [Receiver conversion](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/HapticContactsService.cs#L49-L66), [Sender conversion](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/HapticSenderFactory.cs#L24-L40), [WorldSpace constraint](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Utils/ConstraintUtils.cs#L9-L25)

For concentric Receivers with common radius R, actual Plug root radius r and unsaturated observations:

```text
L ≈ R × (pTip - pRoot) + r
d ≈ R × (1 - pRoot) + r
Radial fraction q = clamp(1 - d / L, 0, 1)
```

Sensa uses the generator model R=1 and r=0.01, giving the +0.01 correction. Runtime scaling or custom dimensions make this conversion approximate, with actual R/r determined from authored geometry. Root saturation at one means d≤r, so readings stay constant within that small region. Calibrate your desired start and end positions using the actual object. [Estimator](https://github.com/SeaLoong/Sensa/blob/main/src/core/runtime/motion.ts)

Only complete finite 0–1 pairs with a usable unsaturated length observation support the subsequent radial fraction. Starting inside with unknown length returns zero: leave and re-enter first. Lateral offset, multiple Plugs, saturation and asynchronous per-parameter updates affect results. Keeping the same object and source throughout calibration helps produce stable, interpretable changes.

## Dedicated Contact direct tracking (SDK Beta)

Sensa also supports SDK 3.10.6-beta.3 and Beta.2 advanced Proximity reports for native Sender midpoint position and relative contact-point velocity through advanced Proximity parameters. Sensa uses a separate `Sensa/Contact/<id>/…` instance with one unique-channel own-root Sender and one Avatar-root Receiver. Position is in physical metres (AvatarRootMeters), velocity in m/s; movement strength can be calibrated with VelocityX/Y/Z, Speed or ProximitySpeed. SPS four-anchor tracking keeps `Sensa/SPS/<id>/P0…P3+Sample`, and existing OGB paths and the depth/touch models above keep their published meanings.

Choose this route when authoring your own root measurement. Explicit Sensa/native Contact roots work independently of VRCFury. For body linkage, a calibrated position axis can follow subtle depth trends and a Touch/Close condition can confirm contact. [Beta setup, source evidence and field semantics](contact-sdk.en.md) · [Dictionary](osc-parameters.en.md)

## Sensa's compact entry points and prerequisites

Choose OgbDepth for depth and OgbTouch for touch. OgbDepth prioritizes **SPS2 · PenOthersNewRoot / PenOthersNewTip**. Missing pairs or unknown length yield zero; absent or both-zero channels permit the same instance’s **SPS1 · PenOthers / PenOthersClose** depth signal. OgbTouch pairs required Close values by source/full parent/feature, returning zero if absent. Explicit Direct mappings retain access to raw values. [Consumer selection](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts#L63-L149), [Sensa address interpretation](https://github.com/SeaLoong/Sensa/blob/main/src/core/runtime/resolver.ts)

Modern VRCFury replaces instance-name slashes with underscores. Sensa also preserves custom nested parent paths. Companion values remain isolated by source/instance/Self-or-Others. Reactivation, Avatar changes and mapping rebuilds discard learned length. Timeouts follow the currently selected signal.

Orf/Pen Haptics require enabled authoring options, client OSC and OGB_ENABLED. Sensa's osc.ogbControl defaults off and targets only explicit unicast IP/localhost and UDP ports, never inferred source ports. In OSC or Combined mode with reception running, it sends true every five seconds, attempting false to the previous destination when disabled/leaving/exiting normally. Observe whether the Avatar begins publishing readings, then save the mapping and enable device input. [Upstream gating](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/OgbEnabledService.cs#L16-L41), [official heartbeat](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/OscConnection.ts#L21-L68)

Inspect raw values, choose depth or vibration, then calibrate the actual object. The same vibration template reads independent Zones through `VFH/Zone/Touch/<complete-id>/Self` or `.../Others`. Check direction, response and Close conditions in the client, then verify device motion with a small travel range.

Upstream projects follow their respective licenses. The [OGB license](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/LICENSE) and [VRCFury license](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/LICENSE.md) remain applicable.
