# OGB parameters, detection geometry and Sensa support

[简体中文](ogb-compatibility.md) | **English**

OGB is an application and an external haptics parameter convention. SPS supplies Avatar deformation/interactions; these are not one position protocol. This page distinguishes generated parameters, consumer behavior and Sensa support. **External OGB paths are not renamed by Sensa's own P0–P3 naming or removal of path version segments**. See [Positioning](positioning.en.md) for Sensa's own scheme.

Research is pinned to VRCFury `6bd33f4cb453df816c943a335e47f64e6a37e188`, OGB v2.1.30 `643aedd493ba21b0c0859ce6e57708fe408ee9c0`, and OGB v1.0.0 `262164576721f12958409638851808aa662b87c7`. Version 1.0.0 already reads Root/Tip and legacy proximity: “old OGB has one trigger” is not a reliable version distinction. [Old consumer](https://github.com/OscToys/OscGoesBrrr/blob/262164576721f12958409638851808aa662b87c7/src/main/GameDevice.ts#L68-L151)

## Radius and values first

Paths omit `/avatar/parameters/`. Orf means Socket; Pen means Plug. Their root centres are the origins, with +Z pointing forward in the author's frame. Self/Others select this or other Avatars, rather than one person's identity.

| Symbol | Meaning here |
| --- | --- |
| L | Plug world length at generation |
| W | Plug world radius at generation |
| e | `min(W, 0.08 m)`, Plug touch expansion |
| D | Socket touch-zone depth, not the other Plug's length |
| R, r | Actual Receiver and spherical Sender radii |
| H | Complete capsule height, including both hemispheres |

Proximity is a continuous 0–1 float. Constant sets one while contact exists and zero after it leaves; neither should be confused with an OnEnter pulse. Each VRChat Receiver independently chooses the nearest matching Sender. A spherical receiver measures the nearest Sender surface to its centre. For two spheres:

```text
p = clamp(1 - max(0, |senderCenter - receiverCenter| - r) / R, 0, 1)
Contact begins at approximately R + r centre distance.
The value saturates when the Sender contains the Receiver centre.
```

A 10 cm Receiver therefore does not imply a 10 cm centre-to-centre trigger distance: Senders have size too. Capsules/body Senders require nearest-surface distance, not an assumed root sphere. VRChat limits scaled radii to 3 m and width/height/depth to 6 m. [Official Contacts behavior](https://creators.vrchat.com/common-components/contacts/)

## Socket: `OGB/Orf/<id>`

Modern VRCFury generates these with OGB Haptics enabled and outside SpsForAll automatic supplementation. Touch-zone-dependent parameters do not exist when that zone is disabled. The four modern Root/Tip channels do not depend on that option.

| Leaf parameter | Type and detected object | Receiver geometry | Sensa interpretation |
| --- | --- | --- | --- |
| PenSelfNewRoot / PenOthersNewRoot | Proximity; corresponding Plug root Sender | Root centre, sphere R=1 m | Modern OgbDepth pair |
| PenSelfNewTip / PenOthersNewTip | Proximity; corresponding Plug length Sender | Root centre, sphere R=1 m | Companion value, not a separate mapping |
| TouchSelf | Proximity; own Hand/Finger/Foot | Centre -D·Z, sphere R=D; needs touch zone | OgbTouch, gated by TouchSelfClose |
| TouchOthers | Proximity; others' Head/Hand/Foot/Finger | Same | OgbTouch, gated by TouchOthersClose |
| TouchSelfClose / TouchOthersClose | Constant; corresponding body tags | Centre -D/2·Z, capsule R=D/2.5, H=D; needs touch zone | Corresponding touch gate |
| PenOthers | Proximity; TPS_Pen_Penetrating | Centre -D·Z, sphere R=D; needs touch zone | Legacy OgbDepth fallback |
| PenOthersClose | Constant; same Plug tag | Centre -D/2·Z, capsule R=D/2.5, H=D; needs touch zone | Constrains legacy PenOthers when present |
| FrotOthers | Proximity; another Socket root tag | Centre +0.05·Z, sphere R=0.1 m; needs touch zone | Direct OgbTouch value |

D uses authored length in metres, or length multiplied by object world Z scale in local units. Nonpositive length falls back to 5% of Avatar view height; no usable zone means no zone parameters. These are generation request values; scale conversion is described below. [Socket generator](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L174-L273), [D calculation](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs#L303-L318)

Official OGB still consumes legacy Orf/PenSelf, but this modern generator does not create it. Its historical author's geometry cannot be inferred from current PenOthers generation. Modern Orf has no PenSelfClose, FrotOthersClose or standard Angle/AngleX/AngleY/AngleZ parameters.

## Plug: `OGB/Pen/<id>`

| Leaf parameter | Type and detected object | Receiver geometry | Sensa interpretation |
| --- | --- | --- | --- |
| PenSelf / PenOthers | Proximity; corresponding Socket root tag | Root centre, sphere R=L | Original OgbDepth value; no default inversion |
| TouchSelf / TouchOthers | Proximity; corresponding Hand/Finger/Foot | Root centre, sphere R=L+e | OgbTouch with matching Close |
| TouchSelfClose / TouchOthersClose | Constant; same tags | Centre L/2·Z, capsule R=W+e, H=L+2e | Touch gate |
| FrotOthers | Proximity; another Plug envelope tag | Root centre, sphere R=L | OgbTouch with FrotOthersClose |
| FrotOthersClose | Constant; another Plug envelope tag | Centre L/2·Z, capsule R=W+0.08 m, H=L | Frottage gate |

Plug TouchOthers retains this generator's SelfContacts tag set; it is not identical to Socket BodyContacts. The sets are Hand/Finger/Foot, and the same set plus Head respectively. [Plug generator](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L175-L256), [tag definitions](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/HapticUtils.cs#L13-L35)

This group has no PenSelfNewRoot/NewTip, PenOthersNewRoot/NewTip or PenSelfClose/PenOthersClose. Socket leaf families cannot be automatically transferred to Plugs.

## Sender geometry defines the other object's size

These are detection volumes, not additional OSC position outputs:

| Generated object | Sender shape and tag | Purpose |
| --- | --- | --- |
| Plug Root | Root-centred sphere r=0.01 m; TPS_Pen_Root | Modern Socket NewRoot |
| Plug Length | Root-centred sphere r=L; TPS_Pen_Penetrating | Modern NewTip/legacy PenOthers; **not a tip point** |
| Plug WidthHelper | Root-centred sphere r=max(0.01 m,L-2W); TPS_Pen_Width | Internal width aid, not directly read by OGB depth mapping |
| Plug Envelope | Centre L/2·Z; capsule R=W, H=L; TPS_Pen_Close | Plug frottage/independent touch zones |
| Socket Root | Root-centred sphere r=0.001 m; includes TPS_Orf_Root | Plug PenSelf/PenOthers and Socket FrotOthers |
| Socket Front | +0.01·Z, sphere r=0.001 m; TPS_Orf_Norm etc. | Upstream direction aid, without an OGB Angle output |

For example, Plug/PenOthers starts contact at approximately L+0.001 m centre distance, rather than exactly L. Modern NewRoot/NewTip observe concentric spheres: rotating their axis does not change centre distance, so they cannot determine angle, tip or roll. [Plug Senders](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs#L60-L108), [Socket Senders](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs#L37-L83)

## Other real parameters and unsupported names

| Parameter | Actual meaning | Current Sensa behavior |
| --- | --- | --- |
| OGB_ENABLED | Avatar input bool enabling local Orf/Pen Haptics | Explicit fixed-destination control; true every five seconds |
| VFH/Version/10 | Current generator capability-marker path, not distance | Browsable; does not drive an axis |
| Legacy `OGB/Pen/<id>/Version/8`, `OGB/Orf/<id>/Version/9`, `VFH/Version/9` | Historical capability markers still recognized by official OGB | Not used to guess geometry or activate output |
| `VFH/Zone/Touch/<id>/Self`, `VFH/Zone/Touch/<id>/Others` | Independent SPS Touch Zone proximity | Direct 0–1 OgbTouch reading, without Close |
| `TPS_Internal/Orf/<id>/Depth_In`, `TPS_Internal/Pen/<id>/RootRoot` | Official OGB's native TPS branch | Outside automatic OgbDepth paths; requires explicit direct mapping |
| Custom Angle/Depth/Trigger etc. | Names alone establish no type, direction or units | No guessed aliases or claim of official standard status |

An independent Touch Zone is a sphere centred at its authored object. Its radius defaults to 0.1 local units with worldScale=false, so world radius follows object scale. It accepts body and Plug-envelope tags without the Orf/Pen Close gate, and does not register with the OGB_ENABLED gate above. Official OGB bridge and Sensa OgbTouch both read this namespace. Sensa keeps full instance/source/Self-or-Others identity, without inventing Close. [Zone generator](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Feature/VRCFuryHapticTouchReceiverBuilder.cs#L21-L49), [default radius](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Runtime/Component/VRCFuryHapticTouchReceiver.cs#L4-L7), [OGB path parser](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/bridge.ts#L39-L67)

Version 10 is an upstream constant, not a new protocol version proposed here. Capability detection follows paths and actual data; a marker's current bool is not proximity. [Marker generation](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticVersionsService.cs#L16-L29), [OGB capability recognition](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/main.ts#L108-L120)

## World scale and the Socket estimate

A worldScale=true request divides the position vector, radius and height by the same **build-time** worldScale.x scalar. False retains authored local values. D's local length separately uses Z scale; these single-axis conversions do not establish correctness under nonuniform scaling. Plug/Socket WorldSpace also uses ScaleConstraint to preserve world scale; OGB Receivers live under OneSpace. The option name alone does not establish a fixed 1 m radius after every runtime scaling operation. [Receiver conversion](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/HapticContactsService.cs#L49-L66), [Sender conversion](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/HapticSenderFactory.cs#L24-L40), [WorldSpace constraint](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Utils/ConstraintUtils.cs#L9-L25)

For concentric Receivers with common radius R, actual Plug root radius r and unsaturated observations:

```text
L ≈ R × (pTip - pRoot) + r
d ≈ R × (1 - pRoot) + r
Radial fraction q = clamp(1 - d / L, 0, 1)
```

Sensa currently assumes R=1 and r=0.01, giving its +0.01 correction. This models known generator geometry; it does not read measured metric length. Runtime scaling or custom authors changing those radii makes the correction approximate. These OGB channels carry no actual R/r metadata. Root saturation at one only establishes d≤r; the remaining distance is unobservable, so the default radial result need not reach exactly one. Calibrate the actual object. [Estimator](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SpsDepthEstimator.cs)

Only complete finite 0–1 pairs with a usable unsaturated length observation support the subsequent radial fraction. Starting inside with unknown length returns zero: leave and re-enter first. Lateral offset, multiple Plugs, saturation and asynchronous per-parameter updates affect results. An OSC source key is not Contact Sender identity; low residual or changing values do not prove a shared frame.

## Sensa's compact entry points and prerequisites

One OgbDepth mapping and one OgbTouch mapping suffice; separate presets for each leaf are unnecessary. Positive modern activity takes priority, with zero for missing pairs/unknown length. Missing/zero modern channels permit same-instance legacy PenSelf/PenOthers. OgbTouch pairs required Close values by source/full parent/feature, returning zero if absent. Explicit Direct mappings retain access to raw values. [Consumer selection](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts#L63-L149), [Sensa address interpretation](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/OgbDepthAddress.cs)

Modern VRCFury replaces instance-name slashes with underscores. Sensa preserves custom nested parents without calling that an upstream default. Companion values remain isolated by source/instance/Self-or-Others. Reactivation, Avatar changes and mapping rebuilds discard learned length. Timeouts follow the selected signal; suppressed legacy or Close values cannot renew its age alone.

Orf/Pen Haptics require enabled authoring options, client OSC and OGB_ENABLED. Sensa's osc.ogbControl defaults off and targets only explicit unicast IP/localhost and UDP ports, never inferred source ports. In OSC mode with reception running, it sends true every five seconds, attempting false to the previous destination when disabled/leaving/exiting normally. It is independent of device-input permission; UDP success is not Avatar acknowledgement. [Upstream gating](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/OgbEnabledService.cs#L16-L41), [official heartbeat](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/OscConnection.ts#L21-L68)

Inspect raw values before selecting depth/vibration and calibrating the actual object. Do not add Angle/position leaves without producer evidence. Independent Zones extend the existing touch preset, without adding presets. Only explicit `VFH/Zone/Touch/<complete-id>/Self` or `.../Others` leaves are interpreted; Version and arbitrary VFH paths are not touch. Source review and project contracts do not replace real Avatar uploads, runtime scaling, mixed Avatars, GPU/HMD or hardware acceptance.

This page explains interoperability without bundling/modifying upstream code. The [OGB license](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/LICENSE) and [VRCFury license](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/LICENSE.md) remain applicable.
