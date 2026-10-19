# OSC parameter dictionary

[简体中文](osc-parameters.md) | **English**

This page explains the public parameters, validity conditions and measurement limits. See the [guide](guide.en.md) for operation, [OGB compatibility](ogb-compatibility.en.md) for the complete upstream parameter tables, and [positioning](positioning.en.md) for the model. Paths below omit the common `/avatar/parameters/` prefix. Names are case sensitive; `<id>` identifies an instance.

Use the [interactive parameter diagram](parameter-geometry.html?lang=en-US) to adjust geometry and compare parameter changes with measurement limits. Open it offline from the extracted desktop archive; it demonstrates the model.

In Sensa, select “Interactive parameter guide” in a parameter's details, or extract a desktop archive and open `docs/parameter-geometry.html`, keeping the adjacent `docs/assets/` folder. GitHub displays HTML source rather than hosting the interactive page.

- Grey outlines identify Socket/Plug references, blue indicates Receivers, and orange indicates Senders. Select a parameter row to highlight its detection shapes; the object outlines do not affect calculations.
- Drag the orange root or adjust XYZ, length and radius to compare raw proximity with Close gating. XZ drawings still calculate full XYZ distances; the 3D projection helps distinguish four noncoplanar anchors.
- In SPS, change Sample and its age to distinguish a geometric fit from valid sampling. Shader shows range, quantization and a 16×8 bit grid; invalid readings offer no valid coordinates. The diagrams connect to no OSC stream, GPU capture or device.

## Choose the information you need

| Parameter family | Information provided | Information it cannot establish |
| --- | --- | --- |
| `OGB/Orf/<id>/…`, `OGB/Pen/<id>/…` | External Socket/Plug proximity, touch, close gates and a radial ratio estimate | Arbitrary XYZ, reliable insertion depth or the other person's identity |
| `VFH/Zone/Touch/<id>/Self` / `Others` | Proximity intensity of an independent touch zone | Root position or insertion depth |
| `Sensa/SPS/<id>/P0…P3`, `Sample` | Estimated position of a dedicated spherical root marker in avatar-root coordinates | World position, orientation or the final GPU-deformed surface |
| `Sensa/Shader/<id>/Frame`, `X`, `Y`, `Z`, `Valid` | Avatar-root position decoded from native root telemetry by the desktop bridge | Contact distance, the final GPU-deformed surface or device feedback |
| `Sensa/Diagnostics/Shader/0/…` | Shader pattern, capture and OSC transport diagnostics | A valid root position available for motion mapping |

Sensa's SPS has exactly the contract below: no `v1` path segment and no compatibility with old A0–A3, shared eight-point arrays, or the former Profile/Scale/Valid/Heartbeat/Self/Others structure. Update the Unity producer and desktop together. External OGB paths and capability versions remain defined by upstream; this simplification does not rename them.

## OGB and VRCFury parameters

Orf means Socket; Pen means Plug. `Self` and `Others` are Contact filters, not player authentication. Sensa pairs by OSC source, complete instance parent path and category, without combining different sources or instances. The [OGB tables](ogb-compatibility.en.md) list the complete generated parameters, sphere/capsule centers and radii, legacy consumer paths and Sensa support.

| Parameter/path | Meaning and Sensa behavior |
| --- | --- |
| Orf `PenSelfNewRoot` / `PenOthersNewRoot` | Proximity of the Plug root sphere inside a concentric Receiver; one half of modern radial estimation |
| Orf `PenSelfNewTip` / `PenOthersNewTip` | Proximity of a larger sphere at the same root center, used to estimate Plug length; Tip does not mean a tip position coordinate |
| Orf/Pen `PenSelf` / `PenOthers` | Legacy single proximity. OgbDepth considers a same-instance fallback only when the modern pair is absent or both zero; Orf uses `PenOthersClose` as a gate when published, retaining old single-value compatibility when absent |
| `TouchSelf` / `TouchOthers` and their `…Close` | Touch is 0–1 proximity; Close is a Constant gate. OgbTouch returns zero without a required Close |
| `FrotOthers` | Rubbing proximity; Pen requires `FrotOthersClose`, Orf does not |
| `VFH/Zone/Touch/<complete-id>/Self` / `Others` | Independent Zone; OgbTouch reads 0–1 directly without requiring or inventing Close |
| `VFH/Version/…`, historical OGB Version paths | Upstream capability flags, not proximity or position; never interpreted as touch intensity |
| `OGB_ENABLED` | An outbound Boolean heartbeat users can explicitly enable in Sensa; its fixed destination is off by default. Sends true every five seconds while OSC mode is listening and attempts false on exit. It does not activate device input |

Modern VRCFury does not generate every legacy combination above. Do not invent Pen NewRoot/NewTip or AngleX/Y/Z by naming pattern. Sensa's modern OgbDepth model assumes Receiver radius R=1 and root-sphere radius r=0.01 to estimate a radial ratio, rather than directly measuring axial insertion. Authored geometry, runtime scaling, mixed Senders and saturation affect the result. Touch spheres/capsules do not share one fixed “trigger radius.” [Pinned generator](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs), [official OGB consumer](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts)

## Sensa SPS: four proximities and one activity sample

The producer places one dedicated spherical Sender at the explicitly selected Socket/Plug root center. Four spherical Receivers stay fixed in avatar-root coordinates and accept only their own dedicated collision channel. Each instance uses five Contacts. This measures the CPU Transform root center, not the final SPS-deformed mesh. [Producer](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaFixedRootBuilder.cs)

### Five public measurement parameters

All values are Floats. Each `<id>` occupies one path segment; instance names and dedicated collision channels must be unique within the avatar.

| Full path | Meaning | Valid range |
| --- | --- | --- |
| `Sensa/SPS/<id>/P0` | Proximity from anchor P0 to the root-marker surface | Finite and strictly `0.001 < p < 0.999` |
| `Sensa/SPS/<id>/P1` | The equivalent observation at anchor P1 | Same |
| `Sensa/SPS/<id>/P2` | The equivalent observation at anchor P2 | Same |
| `Sensa/SPS/<id>/P3` | The equivalent observation at anchor P3 | Same |
| `Sensa/SPS/<id>/Sample` | Combined current validity/activity counter for this instance; not a coordinate | 0 means invalid; active values are exactly `n/32`, integer n=1…32 |

Each FX sampling state targets 0.05 seconds: copy RawP0–RawP3 into P0–P3, then write Sample. Sample cycles from 1/32 through 1, targeting a 1.6-second cycle. Animation, Contact updates and OSC delivery can be delayed or lost; this does not guarantee exactly 20 Hz or an atomic same-frame snapshot. Stationary P values may be cached, but Sample must change. [Shared constants](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs), [receiver checks](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedRootTracking.cs)

Sample lifetime uses **ChangedAt, when its value last changed**, with a **1000 ms default in normal operation**. Runtime uses a positive configured InputTimeoutMs or falls back to 1000 ms; the decoder then caps that value at 1250 ms. A smaller setting is stricter, while a setting above 1250 ms cannot extend the cap. Repeated receipt of the same Sample updates receipt time without extending that lifetime. Missing parameters, Sample=0, a non-n/32 value, freezing, timeout or a failed fit invalidate the coordinates. [Runtime lifetime selection](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs#L76)

### Menu controls are separate from measurements

Five Floats per object does not mean five parameters for the whole avatar. Automatic's Exclusive strategy also generates `Sensa/Select/<group>`, an Int defaulting to 0=Off, with 1…N selecting objects in Targets order. Dedicated has no such group selector. MA registers this as an Expression parameter with `localOnly=true` and `saved=false`: no network synchronization or persistence across reloads. It may still be visible according to VRChat OSC configuration; “local” does not mean “never sent over OSC.” [Selector implementation](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaSelectionAnimator.cs), [MA parameter rules](https://modular-avatar.nadena.dev/docs/reference/parameters), [VRChat OSC configuration](https://docs.vrchat.com/docs/osc-avatar-parameters)

### Fixed geometry, distance and coverage

Coordinates and radii use **avatar-root local units**: center c=(0,1,0), half-span h=0.5, Receiver radius R=2.5 and marker radius r=0.001.

| Anchor | Local coordinate |
| --- | --- |
| P0 | (-0.5, 0.5, -0.5) |
| P1 | (0.5, 0.5, 0.5) |
| P2 | (0.5, 1.5, -0.5) |
| P3 | (-0.5, 1.5, 0.5) |

For a spherical Sender and Receiver, the unsaturated proximity model and inverse are:

```text
p = clamp(1 - max(0, d - r) / R, 0, 1)
d = R × (1 - p) + r
```

Here d is anchor-center to marker-center distance. The r correction accounts for Proximity measuring the Sender surface nearest the Receiver center. True distances to four known noncoplanar anchors uniquely determine this local XYZ. The implementation also requires RMS distance residual≤0.01 and X/Z=[-1.5,1.5], Y=[-0.5,2.5]. A small residual demonstrates consistency with this model, not accuracy or identity. [VRChat Contact definition](https://creators.vrchat.com/common-components/contacts/), [reconstruction](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedAnchorReconstruction.cs)

Usable space is the **intersection of four spherical coverage regions**, excluding saturation and boundary bands, rather than the entire display cube. A sphere centered at c with radius approximately `2.5 - √3×0.5 ≈ 1.63` gives a conservative common-coverage scale; the p thresholds further constrain actual validity. The p<0.999 ceiling requires d>0.0035, excluding approximately **0.0035 local units** around each anchor (3.5 mm in a local metre scale). The p>0.001 floor requires d<2.4985. These local distances are not fixed world-metre distances for every avatar.

### Scaling, sampling and menu control boundaries

Let s_author be the authored uniform avatar-root world scale and ScaleFactor the VRChat scaling factor. Receiver world radius is `2.5 × s_author × ScaleFactor`. Contacts have a 3 m radius limit after scaling; the producer reserves 0.001 m and uses:

```text
maxScale = (3 - 0.001) / (2.5 × s_author)
```

Beyond the gate, it disables Contacts, clears public samples and writes Sample=0. Builds reject unsupported nonuniform avatar-root scale, a root ScaleConstraint and root scale animation. Target bones may scale; the dedicated marker follows the root center without inheriting that target scale into its known sphere radius. One local unit equals one world metre only when s_author=1 and ScaleFactor=1. [Gate implementation](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaFixedRootBuilder.cs), [VRChat scaled limits](https://creators.vrchat.com/common-components/contacts/)

RawP0–RawP3 are internal FX sampling parameters, not registered public Expression parameters. ScaleFactor and IsLocal are built-ins used for scaling and local-execution gates. The `Sensa/Select/<group>` menu control above may be exported according to OSC configuration; it is not FX-only, and its internal state memory serves a different role. None of these are additional root-position measurements. The public namespace fixes geometry and frame, while Sample covers invalidity and activity, so Profile, Scale, Valid, Heartbeat and Self/Others are no longer exported separately or repeated every frame. Internal FX names are outside the public contract; this does not promise that a client can never expose them.

Dedicated channels and AllowSelf narrow the model. They do not prove every P belongs to one Contact frame or authenticate against deliberately colliding tags. Common rigid world movement does not change these local coordinates. Other networked avatars and GPU surfaces are outside this measurement contract.

## Shader: direct root coordinates and transport activity

Native avatar components encode the selected CPU root center into a pattern. The desktop bridge decodes only the explicitly selected region and Producer ID before sending OSC. **It uses no Contacts and has no trigger radius.** Its encoding cube is X/Z=[-1.5,1.5], Y=[-0.5,2.5], again in avatar-root local coordinates. [Encoder](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaRootTelemetry.shader.txt), [bridge](https://github.com/SeaLoong/Sensa/blob/main/scripts/shader-osc-bridge.py)

### Five public measurement parameters

`<id>` is the explicitly selected Producer ID, decimal 1…65535 without leading zeros; for example, `Sensa/Shader/7/X`. These five measurement fields are sent as OSC Floats by the desktop bridge; they are not five Expression parameters declared inside the avatar.

A separate Shader menu control is `Sensa/Select/ShaderCapture_<ID>`: an Int defaulting to 0=Off, with 1 enabling the native capture rig; for example, `Sensa/Select/ShaderCapture_42`. This is also an MA-registered Expression parameter with `localOnly=true` and `saved=false`, potentially visible according to OSC configuration. Internal `Sensa/Internal/ShaderCapture_<ID>/Selected` is FX Int state memory, default 0, written locally as 0/1 by a Driver and not registered as an Expression parameter. [Build entry point](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaShaderCaptureBuilder.cs), [selection state machine](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaSelectionAnimator.cs)

| Leaf | Meaning and validity |
| --- | --- |
| `Frame` | Integer 0…65535, generated nominally in 60 Hz time steps with 16-bit wraparound, approximately every 18.2 minutes |
| `X` | Finite local root-center X in [-1.5,1.5] |
| `Y` | Finite local root-center Y in [-0.5,2.5] |
| `Z` | Finite local root-center Z in [-1.5,1.5] |
| `Valid` | 1 commits this valid packet; 0 invalidates the root coordinates immediately |

Valid packets send **Frame → X → Y → Z → Valid=1**, committing Valid last. Invalidation sends only Valid=0, without republishing old XYZ. Desktop requires five consecutive fields under the same complete Producer path from the same OSC source. Other sources do not interrupt this source's sequence; interleaved messages from this source cannot impersonate a complete coordinate packet. Frame's ChangedAt lifetime is capped at 500 ms, shortened by a smaller positive configured timeout. Continuously resending an unchanged Frame still expires. [Desktop receiver](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/ShaderRootTracking.cs)

The bridge checks the pattern, binary ID/flags, CRC and forward modulo-65536 frame progression. Reversed/large jumps, changed XYZ under the same Frame, identity changes and freezing invalidate it. Startup or recovery must establish two forward samples; the bridge's default freeze threshold is 350 ms. Normal wraparound progresses forward; a producer reset to an old sequence may require explicitly restarting the bridge. Consecutive fields and CRC check transport; they do not establish atomic UDP transactions, real user identity or measurement accuracy.

### Quantization, reduced fields and necessary binary metadata

Each axis spans 3 local units and uses unsigned 16-bit quantization. Its step is `3/65535 ≈ 4.58×10⁻⁵` local units. Ideal rounding gives a per-axis half-step bound of approximately `2.29×10⁻⁵`, or `3.96×10⁻⁵` for the three-axis quantization norm. These are encoding bounds, **not a promise of actual positioning accuracy**. Skinning/frame calculations, rendering/compositing, capture and latency require their own verification. Shader [HLSL `round`](https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/dx-graphics-hlsl-round) rounds halfway cases to the nearest even integer. The diagram follows that rule without emulating every GPU single-precision intermediate.

OSC no longer repeats Producer or Profile: the path already carries Producer, while `Sensa/Shader` fixes AvatarRootLocal and its range. The binary pattern retains Producer ID, valid/native-frame flags, CRC and Frame to distinguish the payload before assigning a path and reject damage or freezing. Its binary encoding marker is not an OSC path version. IDs are explicit pairing values, not avatar-owner authentication. There is no redundant PositionXYZ parameter, default filter or separate “detection radius” option.

## Diagnostics, points, orientation and devices

`Sensa/Diagnostics/Shader/0/Frame|X|Y|Z|Valid` uses the same five-field transport layout with diagnostic encoding and normalized diagnostic XYZ in [-1,1]. ID=0 is not a native Producer. This namespace **produces no mappable root coordinates and does not participate in automatic spatial mapping**. An explicit Direct mapping can read raw scalars without making them positions. Valid=1 only indicates a live diagnostic transport; it cannot turn a synthetic pattern into an actual avatar-root position. [Diagnostic separation](https://github.com/SeaLoong/Sensa/blob/main/scripts/shader-osc-bridge.py)

| Concept | Required information and limit |
| --- | --- |
| One point/root center | Three coordinates; both schemes on this page provide only this |
| Pose/orientation | An independent direction or multiple geometrically meaningful points; one root XYZ cannot establish rotation |
| World position | A trusted world reference and its transform; AvatarRootLocal excludes common world translation/rotation |
| Final GPU surface | Sampling tied to the specific deformation algorithm and target surface; this root capture does not implement it |
| Device position/intensity | These values can become motion targets through explicit mapping; they cannot replace device sensor feedback |

Separate experimental Point/Handle/Pose inputs are not interchangeable with these namespaces; similarly named points cannot fill missing SPS fields. Spatial motion still requires explicit experimental-spatial permission, the selected source and mapping, and activation of the current input. Seeing parameters does not authorize device movement. See [positioning](positioning.en.md) and the [Shader research record](shader-capture-research.en.md) for operating conditions and unverified real-client, multi-avatar, GPU and hardware behavior.
