# Contact direct tracking

[简体中文](contact-sdk.md) | **English**

Contact direct tracking measures the selected Avatar root position in metres and relative contact-point velocity. **Advanced Parameters are a released VRChat SDK feature**: as of 2026-11-20 the latest stable release is [3.10.6](https://github.com/vrchat/packages/releases/tag/3.10.6), published 2026-10-30; [3.11.0-beta.1](https://github.com/vrchat/packages/releases/tag/3.11.0-beta.1) is a prerelease.

The Sensa builder now configures the stable SDK’s advanced-parameter flags and retains the historical [beta.3](https://github.com/vrchat/packages/releases/tag/3.10.6-beta.3) and [beta.2](https://github.com/vrchat/packages/releases/tag/3.10.6-beta.2) Bool interfaces. The package and component checks below are distinct from an end-to-end Avatar build, OSC delivery or an actual client test. See the [verification record](e2e-status.en.md).

## Build a dedicated root measurement

1. Install matching VRChat Base and Avatars SDK 3.10.6 packages through your VRChat project tools, then install the Sensa Unity package. Beta packages are not required for this route.
2. In **Automatic SPS Setup**, explicitly select **Contact direct tracking** as the root tracking method, or add **Contact direct tracking** (`SensaContactRootProbe`) directly.
3. Set Target to a bone/empty-object Transform, SPS Socket/Plug, Sensa Component or native Contact within your Avatar. Instances default to `Root`; give multiple points distinct names. An empty collision channel is derived from the instance name. Transform, Sensa and native Contact targets work directly.
4. Build the Avatar. The shared NDMF plugin reads author settings before MA, creates a tiny spherical Sender following the selected root and a Proximity Receiver at the Avatar origin, with zero shape offsets and Avatar-aligned axes. The Receiver accepts only Self on that dedicated channel.
5. In the actual client, select the target in its generated menu when applicable. Inspect `Sensa/Contact/<id>/…` from one OSC source, then calibrate in the root panel before enabling spatial input.

Author scripts implement `IEditorOnly` and are removed after generation; hosts and native measurement components remain. See the [Unity build guide](unity-build.en.md) for timing, prefab selection and official pipeline sources.

The authored Receiver radius is 2 Avatar-root local units and the marker radius is 0.001. The published `Radius` is the current **world radius in metres**, updated with `ScaleFactor`. The scale guard disables measurement and clears `Sample` before the Receiver exceeds the 3 m SDK radius limit. Supported Avatar root scaling is positive and uniform.

## Read position and velocity in the correct frame

Stable 3.10.6 uses the `advancedParameters` flags enum, not a Bool (see the [release history](https://github.com/vrchat-community/creator-docs/blob/16fb16cfb4541fddcf35884e811ce8db16ff6493/Docs/releases/release-3.10.6.md)). The Sensa builder selects `SenderType`, `SenderLocalPosition`, `SenderVelocity`, `ProximitySpeed` and `CollisionTags` (`0x8000002B`); the tag is FX-only. It does **not** request `SenderLossyScale` or `PointSeparation` for this probe. The historical Bool paths remain `advancedParameters` on Beta.3 and `advancedProximityParameters` on Beta.2. Advanced reports work on any Receiver type; only a Proximity Receiver generates `_ProximitySpeed`.

The [official VRChat Contacts guide](https://creators.vrchat.com/common-components/contacts/) describes Receiver detection modes: Constant reports whether a matching target entered the detection region, while Proximity reports a continuous 0–1 approach value. The advanced position/velocity fields here follow the measurement implementation in the official packages listed below. Sensa adds `Radius` and `Sample` for coverage and activity checks. The explorer's [“OSC parameter meanings and sources”](parameter-geometry.html#parameter-reference) section and workbench parameter details provide measurement definitions, linkage uses and sources for individual fields.

| What you want to know | Parameters | How to read them |
| --- | --- | --- |
| Where the target is | `Proximity_SenderLocalPositionX/Y/Z` | Left/right, up/down and forward/back displacement from the Receiver origin, in metres; calibrate movement along a chosen axis |
| How fast it moves and in which direction | `Proximity_SenderVelocityX/Y/Z`, `Proximity_SenderVelocityMagnitude` | Relative velocity near the contact point, in m/s; components retain direction, while magnitude supports movement-strength mapping |
| How proximity changes | `Proximity`, `Proximity_ProximitySpeed` | Proximity is 0–1; its change rate uses proximity units/s. Use them to inspect approach and withdrawal inside the detection range |

Sensa Contact tracking uses twelve public fields, so existing position, velocity and preset configurations carry over. The [OSC parameter dictionary](osc-parameters.en.md) lists the supported fields; additional native reports are explained below.

Selecting **Collision Tags** generates a `_CollisionTag_<tag>` Bool for each configured Receiver tag; it is true when that tag matches. Sensa declares its dedicated tag in FX; it is not an extra public tracking field.

Position describes the **Sender shape midpoint relative to the Receiver shape midpoint**, rotated into Receiver shape axes. The runtime applies inverse shape rotation without dividing by transform scale or Receiver radius. A sphere's midpoint is its center; a capsule uses its shape midpoint. Sensa's dedicated zero-offset Receiver therefore establishes **AvatarRootMeters**: origin at the Avatar root, axes following its rotation, and physical metre units. SPS four-anchor tracking and Shader capture continue to use **AvatarRootLocal**, whose units follow the authored Avatar scale.

```text
position = inverse(receiverShapeRotation)
           × (senderShapeMidpoint - receiverShapeMidpoint)
```

Velocity is the Sender's velocity relative to the Receiver, evaluated near the contact point, including angular-motion terms, and rotated into Receiver axes. Its units are **m/s**. This quantity can differ from the time derivative of the reported midpoint coordinates as shapes rotate. `Proximity_SenderVelocityMagnitude` is its nonnegative magnitude. `Proximity_ProximitySpeed` is the signed rate of Proximity change, in **proximity units per second**; an exit can produce a brief value as Proximity returns to zero.

Negative position components are ordinary coordinates. A stationary Sender can have zero velocity while its position remains valid. A single dedicated point supplies position and velocity. Use Tracking Frame to measure Origin, Forward and Right together when a reference direction should follow a bone.

### Additional native Contact reports

Select the reports you need under **Advanced Parameters** on the stable Receiver. Their names are the Receiver’s custom base parameter name plus a suffix. Not every Avatar uses `Proximity` as its base name or sends these values over OSC. [Official field definitions](https://github.com/vrchat-community/creator-docs/blob/16fb16cfb4541fddcf35884e811ce8db16ff6493/Docs/docs/common-components/contacts/index.md#advanced-parameters) · [3.10.6 release notes](https://creators.vrchat.com/releases/release-3-10-6)

| Suffix | Meaning and units | How to read it |
| --- | --- | --- |
| `_PointSeparation` | World-space distance between the **nearest inner points** of the Sender and Receiver, in metres | Measures the closest approach of the two Contact shapes; Sensa root `Distance` instead derives the distance to the Avatar origin from XYZ, with its own reference |
| `_SenderLossyScaleX/Y/Z` | Three components of the associated Sender Transform's `lossyScale`, unitless | Reads world scale including parent transforms, useful when inspecting how signal shapes change with scale |

Spheres and boxes use the shape centre; capsules use the nearest point on their centre line. `_PointSeparation` is not a surface gap. With a selected Sender, the stable runtime reports distances ≤0.001 m as zero; it also zeroes `_ProximitySpeed` when its absolute value is ≤0.001 proximity units/s.

With no selected Sender, stable 3.10.6 reports scale `(1,1,1)` and PointSeparation `-1`, not measured scale or distance. Select `_SenderType` alongside a reading to distinguish a recognized contact from these defaults. Declare the matching Animator parameters with their SDK types and expose them over OSC. The twelve-field Sensa tracking contract does not change.

## Follow a bone with a Contact shape and reference plane

A native Contact uses `rootTransform` as its reference, or the component's Transform when none is assigned. Local `position` and `rotation` define the shape. When a sphere is offset from the bone origin, bone rotation moves its centre along an arc; a centred sphere keeps the same outline as it rotates. One sphere's proximity is useful for distance, while several points with a known layout reveal direction. [Official Contacts](https://creators.vrchat.com/common-components/contacts/) · [Field definitions](https://github.com/vrchat-community/creator-docs/blob/16fb16cfb4541fddcf35884e811ce8db16ff6493/Docs/docs/common-components/contacts/index.md)

Sensa **Tracking Frame** creates three independent Contact tracking instances: Origin, Forward and Right. With Contact direct tracking selected, it generates 6 Contacts and 36 public fields, all positions in AvatarRootMeters. The desktop uses Forward−Origin as the current depth direction, then calculates a target's depth and lateral offset. Changes in marker positions reveal bone rotation; configure the reference offset and orientation in Unity. [Create a following plane](unity-build.en.md#create-a-plane-that-follows-a-bone) · [Calculation examples](computed-signals.en.md#combine-root-coordinates)

## Keep one target and check activity

The official release describes advanced parameters as reporting the nearest ongoing contact. The inspected Proximity implementation selects the matching Sender with the greatest **strictly positive Proximity**. In Beta.3, when two Senders both have Proximity 1, the lower PointSeparation wins. Stable `_SenderType` identifies the owner category: 0 no contact or unrecognized owner, 1 same Avatar as the Receiver, 2 different Avatar, 3 world, 4 spawned item. It is not a unique identity. Sensa’s dedicated root channel accepts only type 1.

The native report has no timestamp, sequence number or stable Sender identifier. Sensa adds `Sample`, cycling through n/32 (n=1…32) at a nominal 50 ms interval, and `Radius`. `Sample=0` means disabled/invalid. The desktop requires all twelve fields from the same source and instance, finite values, positive Proximity, Self type and a positive supported Radius. Its position bound follows Radius with a small numeric tolerance. A changed Sample expires after **1000 ms**, or a shorter positive configured input timeout. Repeated identical Sample values do not extend activity.

When no Sender is selected, the SDK writes type 0 and zero position/velocity. Sensa stops the related motion when contact, complete fields, activity or bounds become invalid. Sample checks producer activity; SDK field delivery and Sender identity are checked through the dedicated setup and client acceptance. The [dictionary](osc-parameters.en.md) lists all twelve public fields.

## Map body movement into device targets

The `contact-position` and `contact-speed` [presets](presets.en.md) provide starting mappings; replace `Root` with the actual instance and calibrate their ranges. Use **X, Y, Z or Distance** to map a calibrated direction or distance from the Avatar origin. For subtle local movement, capture the desired start and end along one axis: for example, map a small forward/back root displacement to a limited depth range. Existing OGB depth signals remain useful for their authored depth trends; Contact coordinates let you select a specific movement axis.

Use **VelocityX, VelocityY, VelocityZ or Speed** to map movement strength, or **ProximitySpeed** for approach/withdrawal intensity inside the Receiver. A Touch/Close signal can provide a separate region condition when motion should apply only inside a selected detection area. Capture suitable endpoints, inspect the preview, save the mapping, then enable experimental spatial input and the actual OSC input. Calibration, curves, output limits, activation and invalidity stops follow the existing spatial flow.

Position and speed provide different controls: a stationary root holds its position-based target while its velocity-based target can return to the calibrated zero-speed level. Check direction, response and stopping in the actual client, then use a small output range to verify the device response. [Workbench guide](guide.en.md) · [Positioning](positioning.en.md)

## Package evidence and related SDK features

The stable Base assembly (`VRC.Dynamics.dll`, `ContactReceiver.SetAdvancedParameters` and `ResetAdvancedParameters`) confirms the defaults and thresholds above. In the stable Avatars Editor source, `AvatarDynamicsSetup.cs:88–135` checks `HasAdvancedParameter` separately for each binding. These are static package checks, not Sensa in-client tests. The earlier Beta.3 and Beta.2 packages remain the original Sensa interface and protocol evidence.

| Package | SHA-256 |
| --- | --- |
| [com.vrchat.base-3.10.6.zip](https://github.com/vrchat/packages/releases/download/3.10.6/com.vrchat.base-3.10.6.zip) | `c1f891298905e80c5b0c4bcd4f8e48303bf27ec04a0826256b7b532884c9f9c9` |
| [com.vrchat.avatars-3.10.6.zip](https://github.com/vrchat/packages/releases/download/3.10.6/com.vrchat.avatars-3.10.6.zip) | `4c9086b0726711cac03bf7bffce24118c79961b1590904f22cd5131981f2d1a4` |
| [com.vrchat.base-3.10.6-beta.3.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.3/com.vrchat.base-3.10.6-beta.3.zip) | `5c2e392d0cb56545731a1990952f237421a2ef56d2bc3b0929bd14f28fa31d14` |
| [com.vrchat.avatars-3.10.6-beta.3.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.3/com.vrchat.avatars-3.10.6-beta.3.zip) | `e5e901e7953cbd8b1e1c998b7a6c83fe419012736135d4bf4a53b7e1eb8cebb9` |
| [com.vrchat.base-3.10.6-beta.2.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.base-3.10.6-beta.2.zip) | `7c6d17be89b1ffad2da8dc52eb3cdd477533f4f7957359d24351807b6aa64ff2` |
| [com.vrchat.avatars-3.10.6-beta.2.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.avatars-3.10.6-beta.2.zip) | `22d5fbe409de4e9640a6772c5156bce1a64d1eb59a392a29d7094a786379b332` |

In Beta.3, `Editor/VRCSDK/SDK3A/AvatarDynamicsSetup.cs:88–104` binds reports through `advancedParameters`, including the added scale and PointSeparation suffixes. In the Beta.3 Base runtime assembly, `ContactReceiver.SetAdvancedParameters` confirms their defaults and the 0.001 m separation threshold. The original position and velocity reference comes from Beta.2's version of that file at `88–113` and `Runtime/VRCSDK/Plugins/VRC.Dynamics.dll`. In that assembly, the methods `ContactReceiver.SetAdvancedProximityParameters`, `ShapeData.GetPointInLocalSpace`, `ContactManager.CalcRelativeVelocity` and the Proximity selection job establish selection, frame, units and velocity behavior described above. These package checks support the protocol reference; the [verification record](e2e-status.en.md) records Sensa's executed checks separately.

Beta.3 advanced parameters and material reports support any Receiver type; `_ProximitySpeed` remains specific to Proximity. The SDK also has material/shader reporting, with up to eight Sender entries and four renderers. That is a separate SDK output path. Sensa's Contact route uses Animator/OSC parameters; material reporting is available for future work. Existing Sensa Shader capture keeps its screen-code transport.

[Integration routes](usage-scenarios.en.md) · [OSC dictionary](osc-parameters.en.md) · [Unity package](../unity/top.sealoong.sensa/README.md)
