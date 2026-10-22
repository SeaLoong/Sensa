# OSC parameter dictionary

[简体中文](osc-parameters.md) | **English**

First identify whether a parameter describes position, proximity or movement strength, then calibrate the mapping with your intended start and end movements. This page explains each field's meaning, units, direction and common linkage uses. See [integration routes](usage-scenarios.en.md) and the [workbench guide](guide.en.md) for setup. Paths omit `/avatar/parameters/`, are case sensitive, and use a real instance name in place of `<id>`.

## Explore the values

The [public explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) selects language automatically and has direct [English](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) and [Chinese](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN) links. Application parameter details open the bundled page. Keep its adjacent assets to open extracted `docs/parameter-geometry.html` offline.

Choose parameters, then drag the orange target to see how approach, entry and contact regions change their readings. All eleven scenes have 3D, planar views and precise sliders. Blue shows receiver coverage, orange the target's signal shape, and gray profiles show the relative Socket/Plug arrangement. The orange handle is enlarged for dragging. SPS four-anchor tracking colors connect each measurement sphere to its label and parameter row.

The [“OSC parameter meanings and sources”](parameter-geometry.html#parameter-reference) section below the controls explains every field in the selected group. Expand an actual parameter name to read what it measures, its range and units, linkage suggestions, and its official or project source. In the workbench, open **OSC → Parameters** and select a parameter name to read the same explanations in “Parameter meaning.” Confirm its complete path before adding a mapping draft.

Distances use complete XYZ coordinates. XZ projects space onto a plane; the green SPS four-anchor tracking region additionally shows measurable positions at the selected Y height. “Usable value” applies Close or validity conditions, helping you choose values for a mapping. Configure actual linkage through the [workbench guide](guide.en.md).

Parameters appear in dictionary order, with a shorter shared prefix first: `PenOthers` precedes `PenOthersClose`. A prefix's `*` represents an instance name: `Sensa/SPS/Example/P0` has full address `/avatar/parameters/Sensa/SPS/Example/P0`. Shader IDs use the decimal form below.

Three.js/[OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) ship with the assets; unavailable [WebGL2](https://threejs.org/docs/pages/WebGLRenderer.html) falls back to SVG. The MIT notice is `assets/parameter-geometry-3d.LICENSE.txt`. [Explorer operation](guide.en.md)

## Where the explanations come from

“Measurement definition” explains how a value is produced; “Linkage use” helps you choose a mapping. The page labels the following sources and paraphrases official explanations in plain language:

| Source | What it defines | References |
| --- | --- | --- |
| Official VRChat sources | Contact detection, native SDK position/velocity reports and Raycast hit/distance | [Official Contacts guide](https://creators.vrchat.com/common-components/contacts/), [official beta package for advanced Proximity](https://github.com/vrchat/packages/releases/tag/3.10.6-beta.2), [Raycast parameters](https://creators.vrchat.com/avatars/avatar-components/raycast/#raycast-parameters) |
| VRCFury/OGB implementation | Generated `PenOthers`, `NewRoot`, `NewTip`, `Touch`, `Frot` and `Close` names, detection shapes and pairing | [Pinned Socket generator](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L174-L273), [pinned Plug generator](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L175-L256), [OGB interoperability](ogb-compatibility.en.md) |
| Sensa protocol and application guidance | Four-anchor reconstruction, `Sample`/`Radius`, Shader `Frame`/`Valid`, and converting readings into motion targets | [Positioning and units](positioning.en.md), [Contact route](contact-sdk.en.md), [computed signals](computed-signals.en.md) |

The general Contacts guide explains detection behavior. The official beta package above establishes the specific advanced Proximity suffixes, coordinate frame and velocity meaning used here. The [Contact guide](contact-sdk.en.md) retains the relevant methods and package hashes for verification.

## Choose the information you need

| Parameter family | Information provided | Typical use |
| --- | --- | --- |
| `OGB/Orf/<id>/…`, `OGB/Pen/<id>/…` | Socket/Plug depth trends, touch intensity and presence | Depth or vibration linkage |
| `VFH/Zone/Touch/<id>/Others` / `Self` | Approach intensity inside a selected touch zone | Zone-based touch linkage |
| `Sensa/<id>/Aux<index>/<role>_…` | Raycast hit state, normalized distance and distance in metres | Hit conditions and surface-distance linkage |
| `Sensa/Contact/<id>/Proximity…`, `Radius`, `Sample` | Selected root position in metres and relative velocity in m/s | Calibrated local movement or movement strength |
| `Sensa/SPS/<id>/P0…P3`, `Sample` | Selected root's three-dimensional position relative to the Avatar | Mapping left/right, up/down or forward/back movement |
| `Sensa/Shader/<id>/Frame`, `Valid`, `X`, `Y`, `Z` | Root-relative coordinates decoded from a screen block | Obtaining three-dimensional position through image encoding |
| `Sensa/Diagnostics/Shader/0/…` | Pattern, capture and OSC transport diagnostics | Checking the capture chain |

SPS four-anchor tracking Unity components and desktop share the five fields and fixed geometry below. External OGB parameters come from the Avatar's generator; inspect complete paths in the parameter list.

To combine parameters, create a [computed signal](computed-signals.en.md) for a weighted average, difference, ratio or magnitude, then map its result to an axis. Tracking computations select solved coordinate or velocity metrics directly, retaining each input's source and validity conditions.

## OGB and VRCFury parameters

`Orf` means Socket and `Pen` means Plug. `Self` filters matching targets on your own Avatar; `Others` filters matching targets on other Avatars. Sensa pairs by OSC source, complete instance path and category. **SPS2 · PenOthersNewRoot / PenOthersNewTip** and **SPS1 · PenOthers / PenOthersClose** identify the explorer's two parameter geometries.

| Parameter/path | Reading meaning | Sensa behavior |
| --- | --- | --- |
| `FrotOthers` | Approach intensity as two matching shapes move close, meet or brush past | Plug uses `FrotOthersClose`; Socket reads the value directly |
| `FrotOthersClose` | Whether a matching target enters the Plug's effective nearby region: 0 away, 1 nearby | An additional condition for Plug Frot |
| Orf/Pen `PenOthers` / `PenSelf` | Continuous 0–1 proximity. The Socket SPS1 value follows an entering-depth trend; the Plug value changes as the Socket entrance approaches its root | Calibrate your intended shallow and deep endpoints; Socket uses it when the SPS2 pair is absent or both values are zero, while Plug reads it directly |
| Orf `PenOthersClose` | Whether a matching target enters the Socket's effective nearby region: 0 away, 1 nearby | When published, gates SPS1 depth; single-value sources retain their own path behavior |
| Orf `PenOthersNewRoot` / `PenSelfNewRoot` | SPS2 proximity from the small Plug-root sphere to the Socket Receiver, from 0 to 1 | Pairs with the same instance's `NewTip` for length estimation and depth conversion |
| Orf `PenOthersNewTip` / `PenSelfNewTip` | SPS2 proximity from a sphere centered on the Plug root whose radius equals Plug length, from 0 to 1 | Unsaturated pairs estimate length, then yield a depth trend |
| `TouchOthers` / `TouchSelf` | Continuous 0–1 intensity as a body or matching target approaches the touch region | Used with its corresponding `Touch…Close` |
| `TouchOthersClose` / `TouchSelfClose` | Whether a matching target enters that touch region: 0 away, 1 nearby | Close=1 admits Touch intensity; Close=0 yields zero |
| `VFH/Zone/Touch/<complete-id>/Others` / `Self` | Continuous proximity in a chosen zone, usually increasing toward its center | OgbTouch reads 0–1 directly |
| `VFH/Version/…`, historical OGB Version paths | Upstream capability flags | Identifying supported parameter features |
| `OGB_ENABLED` | Tells the Avatar that the receiving service is running | Sends true to the configured destination every five seconds and attempts false when stopped; off by default |

Depth readings follow distances between detection shapes. Movement aligned with the Socket corresponds most directly to entering depth; sideways movement, tilt and authored dimensions also affect readings. Calibrate your intended start and end positions when mapping. `Close=1` means a matching target entered that Contact's effective region, making it useful as a condition for motion. Authored shapes determine how that region relates to the body's visible outline. SPS2 OgbDepth uses Receiver radius R=1 and root-sphere radius r=0.01; the explorer shows how its two values work together.

Use the parameters actually exposed by your Avatar. The [OGB tables](ogb-compatibility.en.md) give complete generated paths, shapes and dimensions, based on the [pinned generator](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs) and [official OGB consumer](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts).

## Supplementary Raycast signals: hit and distance

Choose Raycast in `SensaComponent` supplementary signals to measure surface distance from an origin along its local **+Z** axis. An empty origin uses the component's own object. Configure a positive maximum range up to 1000 metres. This feature requires **VRChat SDK 3.10.3+**. Sensa explicitly disables `ApplyTransformScale`, keeping the range in metres.

The prefix is `Sensa/<id>/Aux<index>/<role>`: `<index>` is the supplementary signal's zero-based index, and `<role>` is its Inspector role identifier, such as `Vibrate` or `GateEnable`. The role distinguishes parameter names; choose the desired control use in the desktop mapping. For example, the first `Vibrate` signal on instance `Body` exposes:

| Path | Type and meaning | Use |
| --- | --- | --- |
| `Sensa/Body/Aux0/Vibrate_Distance` | Float; world distance from origin to hit point, in metres | Calibrate the desired physical-distance range |
| `Sensa/Body/Aux0/Vibrate_Hit` | Bool; true when the ray currently hits | Use as a `GateEnable` condition to consume distance while hit |
| `Sensa/Body/Aux0/Vibrate_Ratio` | Float; hit distance normalized between zero and maximum range, 0–1 | 0 is the origin and 1 is the range end; invert when mapping approach intensity |

With a 0.3 m range and a hit 0.1 m away, `_Distance` is approximately 0.1 and `_Ratio` approximately 1/3. Check `_Hit` before reading distance: the generated component uses the SDK's default `DoNothing` miss behavior. On a miss, `_Hit=false` and both distances retain their latest hit values, initially zero before the first hit.

These are the native `VRCRaycast` report fields. The [official Raycast parameter reference](https://creators.vrchat.com/avatars/avatar-components/raycast/#raycast-parameters) explains hit state, distance ratio, world distance and the available miss behaviors. Sensa declares local, unsynced Expression Parameters and matching FX types for all three. The APIs and bindings were also checked in the minimum supported version, 3.10.3. [Unity configuration](../unity/top.sealoong.sensa/AUTOMATION.en.md) · [Official SDK 3.10.3 package](https://github.com/vrchat/packages/releases/download/3.10.3/com.vrchat.avatars-3.10.3.zip)

## Contact direct tracking (SDK Beta): twelve public fields

Use a dedicated spherical Sender on the selected own root and one Proximity Receiver at the Avatar root with zero offsets and aligned axes. The Receiver has `advancedProximityParameters=true`, a unique collision channel and Self enabled. This route requires SDK 3.10.6-beta.2 or a later SDK with the same feature. Its coordinate frame is **AvatarRootMeters**: Avatar-root origin and rotated axes, in physical metres. [Setup and verified SDK evidence](contact-sdk.en.md)

All paths start with `Sensa/Contact/<id>/`; `<id>` occupies one path segment. The table follows dictionary order, with the shorter shared prefix first. `Proximity_SenderType` is Int; the other eleven fields are Floats.

| Leaf | What it tells you | Linkage use |
| --- | --- | --- |
| `Proximity` | Selected-target proximity, 0–1; usually increases as the target's signal shape approaches the Receiver center | Inspect entry into the detection range; Sensa root measurement uses positive values |
| `Proximity_ProximitySpeed` | How much proximity changes per second; positive means an increasing reading and negative a decreasing reading, in proximity units/s | Distinguish approach and withdrawal strength; calibrate the intended direction. Exit can produce a transient |
| `Proximity_SenderLocalPositionX` | Sender shape midpoint displacement from Receiver shape midpoint, X in metres | Map left/right displacement under Sensa's Avatar-root reference to one axis; signed values retain direction |
| `Proximity_SenderLocalPositionY` | The same position's Y component, in metres | Control motion with up/down displacement and calibrate the desired lower and upper endpoints |
| `Proximity_SenderLocalPositionZ` | The same position's Z component, in metres | Control forward/back movement or entering depth, calibrated to the intended shallow and deep endpoints |
| `Proximity_SenderType` | SDK-selected target category: 0 none, 1 own Avatar, 2 other Avatar, 3 world Sender | Identify the selected target category; Sensa's dedicated root route uses 1 |
| `Proximity_SenderVelocityMagnitude` | Relative speed near the contact point, in m/s, always ≥0; zero can describe rest | Map movement speed to vibration or another intensity, with rest at the calibrated zero-speed level |
| `Proximity_SenderVelocityX` | Relative contact-point velocity along Receiver X, in m/s, including angular-motion effects | Control the direction or strength of left/right movement; signs represent positive/negative axis motion |
| `Proximity_SenderVelocityY` | The same velocity's Y component, in m/s | Control the direction or strength of up/down movement |
| `Proximity_SenderVelocityZ` | The same velocity's Z component, in m/s | Control the direction or strength of back-and-forth movement |
| `Radius` | Sensa Receiver's current world radius, in metres, `0 < Radius ≤ 3`, updated with ScaleFactor | Inspect coverage and the measurement boundary after scaling |
| `Sample` | Sensa producer-activity counter; cycles through n/32 (n=1…32), with 0 disabled/invalid | Check continued measurement updates alongside complete-field validity |

For example, changing Z from 0.05 m to 0.15 m means 0.10 m of movement along the Receiver's Z axis; calibrate those endpoints to your desired motion range. A relative speed of 0.4 m/s describes movement speed at that moment. A Proximity change rate of 0.4/s describes proximity increasing by 0.4 per second. Choose position, velocity or proximity-change mapping according to these meanings.

The SDK selects the matching Sender with greatest strictly positive Proximity. It rotates midpoint displacement by inverse Receiver shape rotation, retaining metres without scale/radius normalization. The reported velocity is relative velocity near the contact point, including angular terms. Rotating shapes can make it differ from the derivative of midpoint position. No selected Sender writes type 0 and zero XYZ/velocity. The SDK supplies no timestamp, sequence or stable Sender ID.

The desktop requires all twelve fields from one source and complete instance, Self type, positive Proximity, finite values, position within the Radius bound plus a small numeric tolerance and supported Radius. Sample advances nominally every 50 ms. Its ChangedAt age is capped at **1000 ms**, shortened by a smaller positive InputTimeoutMs; unchanged repeats do not renew it. Loss of contact, incomplete values, invalid Radius/coordinates or frozen/disabled activity stops the related spatial motion.

Contact direct tracking maps through SensaPoint using **X/Y/Z/Distance** or **VelocityX/VelocityY/VelocityZ/Speed/ProximitySpeed**. Endpoint calibration, curves, output limits, spatial activation and stopping use the existing flow. SPS four-anchor tracking `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}` and its authored-unit AvatarRootLocal frame retain their existing definition. [Positioning](positioning.en.md) · [Workbench](guide.en.md)

## SPS four-anchor tracking: four proximities and one activity sample

The producer places one dedicated spherical Sender at the explicitly selected Socket/Plug root center. Four spherical Receivers stay fixed in avatar-root coordinates and accept only their own dedicated collision channel. Each instance uses five Contacts to track the selected Transform root center. [Producer](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaFixedRootBuilder.cs)

### Five public measurement parameters

All values are Floats. Each `<id>` occupies one path segment; instance names and dedicated collision channels must be unique within the avatar.

| Full path | Meaning | Valid range |
| --- | --- | --- |
| `Sensa/SPS/<id>/P0` | Proximity from anchor P0 to the root-marker surface | Finite and strictly `0.001 < p < 0.999` |
| `Sensa/SPS/<id>/P1` | The equivalent observation at anchor P1 | Same |
| `Sensa/SPS/<id>/P2` | The equivalent observation at anchor P2 | Same |
| `Sensa/SPS/<id>/P3` | The equivalent observation at anchor P3 | Same |
| `Sensa/SPS/<id>/Sample` | Counter for this instance’s current validity and sampling activity | 0 means invalid; active values are exactly `n/32`, integer n=1…32 |

Each FX sampling state targets 0.05 seconds: copy RawP0–RawP3 into P0–P3, then write Sample. Sample cycles from 1/32 through 1, targeting a 1.6-second cycle. Animation, Contact and OSC scheduling affect the update rhythm. Stationary roots reuse their latest P values while a changing Sample checks continued sampling. [Shared constants](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs), [receiver checks](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedRootTracking.cs)

Sample lifetime uses **ChangedAt, when its value last changed**, with a **1000 ms default in normal operation**. Runtime uses a positive configured InputTimeoutMs or falls back to 1000 ms; the decoder then caps that value at 1250 ms. A smaller setting is stricter, while a setting above 1250 ms cannot extend the cap. Repeated receipt of the same Sample updates receipt time without extending that lifetime. Missing parameters, Sample=0, a non-n/32 value, freezing, timeout or a failed fit invalidate the coordinates. [Runtime lifetime selection](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs#L76)

### Choose the measurement target from the menu

Alongside each object's five measurement Floats, Automatic's Exclusive strategy generates `Sensa/Select/<group>`, an Int defaulting to 0=Off, with 1…N selecting objects in Targets order. Dedicated has no such group selector. MA registers this Expression parameter with `localOnly=true` and `saved=false`. It starts from its default on loading, with visibility determined by VRChat OSC configuration. [Selector implementation](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaSelectionAnimator.cs), [MA parameter rules](https://modular-avatar.nadena.dev/docs/reference/parameters), [VRChat OSC configuration](https://docs.vrchat.com/docs/osc-avatar-parameters)

### Fixed geometry, distance and coverage

Coordinates and radii use **avatar-root local units**: center c=(0,1,0), half-span h=0.35, Receiver radius R=2 and marker radius r=0.001.

| Anchor | Local coordinate |
| --- | --- |
| P0 | (-0.35, 0.65, -0.35) |
| P1 | (0.35, 0.65, 0.35) |
| P2 | (0.35, 1.35, -0.35) |
| P3 | (-0.35, 1.35, 0.35) |

For a spherical Sender and Receiver, the unsaturated proximity model and inverse are:

```text
p = clamp(1 - max(0, d - r) / R, 0, 1)
d = R × (1 - p) + r
```

Here d is anchor-center to marker-center distance. The r correction accounts for Proximity measuring the Sender surface nearest the Receiver center. True distances to four known noncoplanar anchors uniquely determine this local XYZ. The implementation also requires RMS distance residual≤0.01 and X/Z=[-2,2], Y=[-1,3]. Residual measures agreement between the four distances and the calculated position. [VRChat Contact definition](https://creators.vrchat.com/common-components/contacts/), [reconstruction](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedAnchorReconstruction.cs)

Usable space is the **intersection of four spherical coverage regions**, excluding saturation and boundary bands. A sphere centered at c with radius approximately `2 - √3×0.35 ≈ 1.394` provides an inscribed reference; proximity thresholds, saturation holes and numerical boundaries further define valid positions. The p<0.999 ceiling requires d>0.003, excluding approximately **0.003 local units** around each anchor (3 mm in a local metre scale). The p>0.001 floor requires d<1.999. World dimensions follow the Avatar root scale.

### Scaling, sampling and menu controls

Let s_author be the authored uniform avatar-root world scale and ScaleFactor the VRChat scaling factor. Receiver world radius is `2 × s_author × ScaleFactor`. Contacts have a 3 m radius limit after scaling; the producer reserves 0.001 m and uses:

```text
maxScale = (3 - 0.001) / (2 × s_author)
```

Beyond the gate, it disables Contacts, clears public samples and writes Sample=0. Builds reject unsupported nonuniform avatar-root scale, a root ScaleConstraint and root scale animation. Target bones may scale; the dedicated marker follows the root center without inheriting that target scale into its known sphere radius. One local unit equals one world metre only when s_author=1 and ScaleFactor=1. [Gate implementation](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaFixedRootBuilder.cs), [VRChat scaled limits](https://creators.vrchat.com/common-components/contacts/)

RawP0–RawP3 serve internal FX sampling. ScaleFactor and IsLocal support scaling checks and local execution; `Sensa/Select/<group>` supports menu selection. Public root-position measurements are P0–P3 and Sample, with geometry and frame supplied by their shared definition.

Dedicated channels and AllowSelf select this Avatar’s root marker. Readings retain their Avatar-relative meaning as the whole Avatar walks or turns. See [positioning](positioning.en.md) for timing and error checks.

## Shader: direct root coordinates and transport activity

Native avatar components encode the selected CPU root center into a pattern. The desktop bridge decodes only the explicitly selected region and Producer ID before sending OSC. Its coordinate cube is X/Z=[-2,2], Y=[-1,3], again in avatar-root local coordinates. [Encoder](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/Shaders/SensaRootTelemetry.shader), [bridge](https://github.com/SeaLoong/Sensa/blob/main/scripts/shader-osc-bridge.py)

### Five public measurement parameters

`<id>` is the explicitly selected Producer ID, decimal 1…65535 without leading zeros; for example, `Sensa/Shader/7/X`. These five measurement fields are sent as OSC Floats by the desktop bridge.

A separate Shader menu control is `Sensa/Select/ShaderCapture_<ID>`: an Int defaulting to 0=Off, with 1 enabling the native capture rig; for example, `Sensa/Select/ShaderCapture_42`. This is also an MA-registered Expression parameter with `localOnly=true` and `saved=false`, potentially visible according to OSC configuration. Internal `Sensa/Internal/ShaderCapture_<ID>/Selected` is FX Int state memory, default 0, written locally as 0/1 by a Driver and not registered as an Expression parameter. [Build entry point](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaShaderCaptureBuilder.cs), [selection state machine](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaSelectionAnimator.cs)

| Leaf | Meaning and validity |
| --- | --- |
| `Frame` | Integer 0…65535, generated nominally in 60 Hz time steps with 16-bit wraparound, approximately every 18.2 minutes |
| `Valid` | 1 commits this valid packet; 0 invalidates the root coordinates immediately |
| `X` | Finite local root-center X in [-2,2] |
| `Y` | Finite local root-center Y in [-1,3] |
| `Z` | Finite local root-center Z in [-2,2] |

Valid packets send **Frame → X → Y → Z → Valid=1**, committing Valid last. Invalidation sends only Valid=0, without republishing old XYZ. Desktop requires five consecutive fields under the same complete Producer path from the same OSC source. Each source is assembled independently; another message from the same source restarts the wait for all five fields. Frame's ChangedAt lifetime is capped at 500 ms, shortened by a smaller positive configured timeout. Continuously resending an unchanged Frame still expires. [Desktop receiver](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/ShaderRootTracking.cs)

The bridge checks the pattern, binary ID/flags, CRC and forward modulo-65536 frame progression. Reversed/large jumps, changed XYZ under the same Frame, identity changes and freezing invalidate it. Startup or recovery must establish two forward samples; the bridge's default freeze threshold is 350 ms. Normal wraparound progresses forward; a producer reset to an old sequence may require explicitly restarting the bridge. Consecutive fields and CRC check packet structure and data integrity.

### Quantization, reduced fields and necessary binary metadata

Each axis spans 4 local units and uses unsigned 16-bit quantization. Its step is `4/65535 ≈ 6.10×10⁻⁵` local units. Ideal rounding gives a per-axis half-step bound of approximately `3.05×10⁻⁵`, or `5.29×10⁻⁵` for the three-axis quantization norm. These values describe digital quantization error. Actual error also depends on frame calculations, rendering/compositing, capture and latency, and can be measured against known positions. Shader [HLSL `round`](https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/dx-graphics-hlsl-round) rounds halfway cases to the nearest even integer. The diagram follows the same rounding rule.

The OSC path carries the object ID, while `Sensa/Shader` fixes the coordinate frame and range. The binary pattern retains object ID, valid/native-frame flags, CRC and Frame for pairing, identifying coordinate type, checking data and detecting image progression.

## Diagnostics and position-related information

`Sensa/Diagnostics/Shader/0/Frame|X|Y|Z|Valid` uses five fields with diagnostic XYZ in [-1,1]. Use it to check pattern generation, region capture and OSC transport. ID=0 stays in the diagnostic namespace; native root positions use object IDs 1…65535. [Diagnostic handling](https://github.com/SeaLoong/Sensa/blob/main/scripts/shader-osc-bridge.py)

| Concept | Information and use |
| --- | --- |
| Root position | Three coordinates describing the selected root center relative to the Avatar |
| Pose/orientation | Rotation calculated from independent direction information or multiple points with a known layout |
| World position | Scene position obtained with a world reference and coordinate transform |
| Final deformed surface | Surface points sampled according to the specific deformation algorithm |
| Device position/intensity | Motion targets produced through mapping, with actual response checked through the device's feedback |

Independent Point/Handle/Pose experiments use their own reference objects and complete field sets. To start spatial linkage, allow experimental spatial input, choose the source and mapping, then activate the current input. See [positioning](positioning.en.md) and the [Shader research record](shader-capture-research.en.md) for operating conditions and real-client verification methods.
