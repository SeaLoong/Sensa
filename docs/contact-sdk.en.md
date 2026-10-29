# Contact direct tracking (SDK Beta)

[简体中文](contact-sdk.md) | **English**

Use Contact direct tracking to measure the selected Avatar root in metres and its relative contact-point velocity in m/s. Add a dedicated spherical Sender/Receiver pair, inspect the advanced Proximity fields, then calibrate the chosen metric. The setup below uses **VRChat Avatars SDK 3.10.6-beta.3**; the advanced interface from Beta.2 is also supported.

The Editor source and runtime assembly from the official [3.10.6-beta.3 release](https://github.com/vrchat/packages/releases/tag/3.10.6-beta.3) have been inspected; [3.10.6-beta.2](https://github.com/vrchat/packages/releases/tag/3.10.6-beta.2) remains the original protocol reference. This guide explains the SDK interface, Sensa's published fields and client setup. See the [verification record](e2e-status.en.md) for executed checks.

## Build a dedicated root measurement

1. Install the matching Base and Avatars beta packages through your VRChat project tools, then install Sensa's Unity package.
2. In **Automatic SPS Setup**, explicitly select **Contact direct tracking (SDK Beta)** as the root tracking method, or add **Contact direct tracking (SDK Beta)** (`SensaContactRootProbe`) directly.
3. Set Target to a bone/empty-object Transform, SPS Socket/Plug, Sensa Component or native Contact within your Avatar. Instances default to `Root`; give multiple points distinct names. An empty collision channel is derived from the instance name. Transform, Sensa and native Contact targets work directly.
4. Build the Avatar. The shared NDMF plugin reads author settings before MA, creates a tiny spherical Sender following the selected root and a Proximity Receiver at the Avatar origin, with zero shape offsets and Avatar-aligned axes. The Receiver accepts only Self on that dedicated channel.
5. In the actual client, select the target in its generated menu when applicable. Inspect `Sensa/Contact/<id>/…` from one OSC source, then calibrate in the root panel before enabling spatial input.

Author scripts implement `IEditorOnly` and are removed after generation; hosts and native measurement components remain. See the [Unity build guide](unity-build.en.md) for timing, prefab selection and official pipeline sources.

The authored Receiver radius is 2 Avatar-root local units and the marker radius is 0.001. The published `Radius` is the current **world radius in metres**, updated with `ScaleFactor`. The scale guard disables measurement and clears `Sample` before the Receiver exceeds the 3 m SDK radius limit. Supported Avatar root scaling is positive and uniform.

## Read position and velocity in the correct frame

Sensa enables the Bool switch provided by the installed SDK: **`advancedParameters` in Beta.3 or `advancedProximityParameters` in Beta.2**. The Beta.3 switch defaults to false and is marked `NotKeyable`; Sensa enables it during the build. Beta.3 supports advanced reports for any Receiver type. Sensa uses a Proximity Receiver, where `_ProximitySpeed` describes the rate of change of proximity. With base parameter `Proximity`, both versions provide `Proximity_SenderType`, `Proximity_SenderLocalPositionX/Y/Z`, `Proximity_SenderVelocityX/Y/Z`, `Proximity_SenderVelocityMagnitude` and `Proximity_ProximitySpeed`.

The [official VRChat Contacts guide](https://creators.vrchat.com/common-components/contacts/) describes Receiver detection modes: Constant reports whether a matching target entered the detection region, while Proximity reports a continuous 0–1 approach value. The advanced position/velocity fields here follow the measurement implementation in the official packages listed below. Sensa adds `Radius` and `Sample` for coverage and activity checks. The explorer's [“OSC parameter meanings and sources”](parameter-geometry.html#parameter-reference) section and workbench parameter details provide measurement definitions, linkage uses and sources for individual fields.

| What you want to know | Parameters | How to read them |
| --- | --- | --- |
| Where the target is | `Proximity_SenderLocalPositionX/Y/Z` | Left/right, up/down and forward/back displacement from the Receiver origin, in metres; calibrate movement along a chosen axis |
| How fast it moves and in which direction | `Proximity_SenderVelocityX/Y/Z`, `Proximity_SenderVelocityMagnitude` | Relative velocity near the contact point, in m/s; components retain direction, while magnitude supports movement-strength mapping |
| How proximity changes | `Proximity`, `Proximity_ProximitySpeed` | Proximity is 0–1; its change rate uses proximity units/s. Use them to inspect approach and withdrawal inside the detection range |

Sensa Contact tracking uses twelve public fields, so existing position, velocity and preset configurations carry over. The [OSC parameter dictionary](osc-parameters.en.md) lists the supported fields; Beta.3's additional native reports are explained below.

The SDK also writes a `_CollisionTag_<tag>` Bool for each collision tag. The component declares this state in FX for its dedicated tag and clears it while inactive. The [dictionary](osc-parameters.en.md) lists the twelve-field public OSC contract.

Position describes the **Sender shape midpoint relative to the Receiver shape midpoint**, rotated into Receiver shape axes. The runtime applies inverse shape rotation without dividing by transform scale or Receiver radius. A sphere's midpoint is its center; a capsule uses its shape midpoint. Sensa's dedicated zero-offset Receiver therefore establishes **AvatarRootMeters**: origin at the Avatar root, axes following its rotation, and physical metre units. SPS four-anchor tracking and Shader capture continue to use **AvatarRootLocal**, whose units follow the authored Avatar scale.

```text
position = inverse(receiverShapeRotation)
           × (senderShapeMidpoint - receiverShapeMidpoint)
```

Velocity is the Sender's velocity relative to the Receiver, evaluated near the contact point, including angular-motion terms, and rotated into Receiver axes. Its units are **m/s**. This quantity can differ from the time derivative of the reported midpoint coordinates as shapes rotate. `Proximity_SenderVelocityMagnitude` is its nonnegative magnitude. `Proximity_ProximitySpeed` is the signed rate of Proximity change, in **proximity units per second**; an exit can produce a brief value as Proximity returns to zero.

Negative position components are ordinary coordinates. A stationary Sender can have zero velocity while its position remains valid. A single dedicated point supplies position and velocity. Use Tracking Frame to measure Origin, Forward and Right together when a reference direction should follow a bone.

### Additional SDK Beta.3 reports

The [official 3.10.6 release notes](https://vrc-beta-docs.netlify.app/releases/release-3-10-6) explain the expanded reports. With Advanced Parameters enabled, the SDK can append these suffixes to the Receiver's base parameter name:

| Suffix | Meaning and units | How to read it |
| --- | --- | --- |
| `_PointSeparation` | World-space distance between the **nearest inner points** of the Sender and Receiver, in metres | Measures the closest approach of the two Contact shapes; Sensa root `Distance` instead derives the distance to the Avatar origin from XYZ, with its own reference |
| `_SenderLossyScaleX/Y/Z` | Three components of the associated Sender Transform's `lossyScale`, unitless | Reads world scale including parent transforms, useful when inspecting how signal shapes change with scale |

“Nearest inner points” follows the SDK's shape definition and depends on the Sender and Receiver geometry. Choose XYZ or Sensa `Distance` for position mapping; calibrate native `_PointSeparation` against the actual Contact shapes.

The Beta.3 runtime assembly also shows that no selected Sender reports scale `(1,1,1)` and PointSeparation `-1`. With a selected Sender, PointSeparation values ≤0.001 m are reported as zero. Check `_SenderType` before interpreting these additional values. To use these optional reports, declare the corresponding Float parameters in the Animator and configure their OSC visibility. Sensa generates its existing twelve public fields; its tracking presets use the position and velocity fields above.

## Follow a bone with a Contact shape and reference plane

A native Contact uses `rootTransform` as its reference, or the component's Transform when none is assigned. Local `position` and `rotation` define the shape. When a sphere is offset from the bone origin, bone rotation moves its centre along an arc; a centred sphere keeps the same outline as it rotates. One sphere's proximity is useful for distance, while several points with a known layout reveal direction. [Official Contacts](https://creators.vrchat.com/common-components/contacts/) · [Field definitions](https://github.com/vrchat-community/creator-docs/blob/f437f5081c4476aaf443b507a7ec4a9d21e0e63b/Docs/docs/common-components/contacts/index.md)

Sensa **Tracking Frame** creates three independent Contact tracking instances: Origin, Forward and Right. With Contact direct tracking selected, it generates 6 Contacts and 36 public fields, all positions in AvatarRootMeters. The desktop uses Forward−Origin as the current depth direction, then calculates a target's depth and lateral offset. Changes in marker positions reveal bone rotation; configure the reference offset and orientation in Unity. [Create a following plane](unity-build.en.md#create-a-plane-that-follows-a-bone) · [Calculation examples](computed-signals.en.md#combine-root-coordinates)

## Keep one target and check activity

For a Proximity Receiver, the verified runtime selects the matching Sender with the greatest **strictly positive Proximity**. In Beta.3, when two Senders both have Proximity 1, the lower PointSeparation wins, as described in the official release notes above. Sender type is 0 for no selected Sender, 1 for your own Avatar, 2 for another Avatar and 3 for a world Sender. Sensa's root route accepts type 1. Dedicated channels with one Sender per authoring component keep the measurement tied to the selected own root.

The native report has no timestamp, sequence number or stable Sender identifier. Sensa adds `Sample`, cycling through n/32 (n=1…32) at a nominal 50 ms interval, and `Radius`. `Sample=0` means disabled/invalid. The desktop requires all twelve fields from the same source and instance, finite values, positive Proximity, Self type and a positive supported Radius. Its position bound follows Radius with a small numeric tolerance. A changed Sample expires after **1000 ms**, or a shorter positive configured input timeout. Repeated identical Sample values do not extend activity.

When no Sender is selected, the SDK writes type 0 and zero position/velocity. Sensa stops the related motion when contact, complete fields, activity or bounds become invalid. Sample checks producer activity; SDK field delivery and Sender identity are checked through the dedicated setup and client acceptance. The [dictionary](osc-parameters.en.md) lists all twelve public fields.

## Map body movement into device targets

The `contact-position` and `contact-speed` [presets](presets.en.md) provide starting mappings; replace `Root` with the actual instance and calibrate their ranges. Use **X, Y, Z or Distance** to map a calibrated direction or distance from the Avatar origin. For subtle local movement, capture the desired start and end along one axis: for example, map a small forward/back root displacement to a limited depth range. Existing OGB depth signals remain useful for their authored depth trends; Contact coordinates let you select a specific movement axis.

Use **VelocityX, VelocityY, VelocityZ or Speed** to map movement strength, or **ProximitySpeed** for approach/withdrawal intensity inside the Receiver. A Touch/Close signal can provide a separate region condition when motion should apply only inside a selected detection area. Capture suitable endpoints, inspect the preview, save the mapping, then enable experimental spatial input and the actual OSC input. Calibration, curves, output limits, activation and invalidity stops follow the existing spatial flow.

Position and speed provide different controls: a stationary root holds its position-based target while its velocity-based target can return to the calibrated zero-speed level. Check direction, response and stopping in the actual client, then use a small output range to verify the device response. [Workbench guide](guide.en.md) · [Positioning](positioning.en.md)

## Package evidence and related SDK features

The official release assets and SHA-256 digests below support reproducibility. Beta.3 is the interface compatibility version inspected in this update; Beta.2 remains the original protocol reference:

| Package | SHA-256 |
| --- | --- |
| [com.vrchat.base-3.10.6-beta.3.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.3/com.vrchat.base-3.10.6-beta.3.zip) | `5c2e392d0cb56545731a1990952f237421a2ef56d2bc3b0929bd14f28fa31d14` |
| [com.vrchat.avatars-3.10.6-beta.3.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.3/com.vrchat.avatars-3.10.6-beta.3.zip) | `e5e901e7953cbd8b1e1c998b7a6c83fe419012736135d4bf4a53b7e1eb8cebb9` |
| [com.vrchat.base-3.10.6-beta.2.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.base-3.10.6-beta.2.zip) | `7c6d17be89b1ffad2da8dc52eb3cdd477533f4f7957359d24351807b6aa64ff2` |
| [com.vrchat.avatars-3.10.6-beta.2.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.avatars-3.10.6-beta.2.zip) | `22d5fbe409de4e9640a6772c5156bce1a64d1eb59a392a29d7094a786379b332` |

In Beta.3, `Editor/VRCSDK/SDK3A/AvatarDynamicsSetup.cs:88–104` binds reports through `advancedParameters`, including the added scale and PointSeparation suffixes. In the Beta.3 Base runtime assembly, `ContactReceiver.SetAdvancedParameters` confirms their defaults and the 0.001 m separation threshold. The original position and velocity reference comes from Beta.2's version of that file at `88–113` and `Runtime/VRCSDK/Plugins/VRC.Dynamics.dll`. In that assembly, the methods `ContactReceiver.SetAdvancedProximityParameters`, `ShapeData.GetPointInLocalSpace`, `ContactManager.CalcRelativeVelocity` and the Proximity selection job establish selection, frame, units and velocity behavior described above. These package checks support the protocol reference; the [verification record](e2e-status.en.md) records Sensa's executed checks separately.

Beta.3 advanced parameters and material reports support any Receiver type; `_ProximitySpeed` remains specific to Proximity. The SDK also has material/shader reporting, with up to eight Sender entries and four renderers. That is a separate SDK output path. Sensa's Contact route uses Animator/OSC parameters; material reporting is available for future work. Existing Sensa Shader capture keeps its screen-code transport.

[Integration routes](usage-scenarios.en.md) · [OSC dictionary](osc-parameters.en.md) · [Unity package](../unity/top.sealoong.sensa/README.md)
