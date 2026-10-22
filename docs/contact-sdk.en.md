# Contact direct tracking (SDK Beta)

[简体中文](contact-sdk.md) | **English**

Contact direct tracking reads the selected root's position and relative velocity from VRChat's advanced Proximity parameters. It uses one dedicated spherical Sender and one spherical Receiver. Choose this route when building your own Avatar with **VRChat Avatars SDK 3.10.6-beta.2**, or a later SDK exposing the same feature. Four-anchor tracking remains the default in Automatic SPS Setup.

The official [3.10.6-beta.2 release](https://github.com/vrchat/packages/releases/tag/3.10.6-beta.2) was published on **20 October 2026 at 05:50 China Standard Time (19 October, 21:50 UTC)**. This reference follows that package's Editor source and runtime assembly. Real Unity/VRChat-client parameter delivery and OSC acceptance for this beta await validation; isolated tests and CI cover their stated implementation scope.

## Build a dedicated root measurement

1. Install the matching Base and Avatars beta packages through your VRChat project tools, then install Sensa's Unity package.
2. In **Automatic SPS Setup**, explicitly select **Contact direct tracking (SDK Beta)** as the root tracking method, or add **Contact direct tracking (SDK Beta)** (`SensaContactRootProbe`) directly.
3. Select the actual SPS Socket/Plug root, Sensa component or native Contact root on your own Avatar. Give each authoring component a unique instance name and collision channel. Explicit Sensa/native Contact roots can be used independently of VRCFury.
4. Build the Avatar. Sensa creates a tiny spherical Sender following the selected root and a Proximity Receiver at the Avatar origin, with zero shape offsets and Avatar-aligned axes. The Receiver accepts only Self on that dedicated channel.
5. In the actual client, select the target in its generated menu when applicable. Inspect `Sensa/Contact/<id>/…` from one OSC source, then calibrate in the root panel before enabling spatial input.

The authored Receiver radius is 2 Avatar-root local units and the marker radius is 0.001. The published `Radius` is the current **world radius in metres**, updated with `ScaleFactor`. The scale guard disables measurement and clears `Sample` before the Receiver exceeds the 3 m SDK radius limit. Supported Avatar root scaling is positive and uniform.

## Read position and velocity in the correct frame

The SDK public switch is **`advancedProximityParameters`**, a Bool used by Proximity Receivers. If the base parameter is `Proximity`, the SDK writes `Proximity_SenderType`, `Proximity_SenderLocalPositionX/Y/Z`, `Proximity_SenderVelocityX/Y/Z`, `Proximity_SenderVelocityMagnitude` and `Proximity_ProximitySpeed`.

The SDK also writes a `_CollisionTag_<tag>` Bool for each collision tag. The component declares this state in FX for its dedicated tag and clears it while inactive. The public OSC contract contains the twelve fields listed below.

Position describes the **Sender shape midpoint relative to the Receiver shape midpoint**, rotated into Receiver shape axes. The runtime applies inverse shape rotation without dividing by transform scale or Receiver radius. A sphere's midpoint is its center; a capsule uses its shape midpoint. Sensa's dedicated zero-offset Receiver therefore establishes **AvatarRootMeters**: origin at the Avatar root, axes following its rotation, and physical metre units. Four-anchor tracking and Shader capture continue to use **AvatarRootLocal**, whose units follow the authored Avatar scale.

```text
position = inverse(receiverShapeRotation)
           × (senderShapeMidpoint - receiverShapeMidpoint)
```

Velocity is the Sender's velocity relative to the Receiver, evaluated near the contact point, including angular-motion terms, and rotated into Receiver axes. Its units are **m/s**. This quantity can differ from the time derivative of the reported midpoint coordinates as shapes rotate. `Proximity_SenderVelocityMagnitude` is its nonnegative magnitude. `Proximity_ProximitySpeed` is the signed rate of Proximity change, in **proximity units per second**; an exit can produce a brief value as Proximity returns to zero.

Negative position components are ordinary coordinates. A stationary Sender can have zero velocity while its position remains valid. A single dedicated point supplies position and velocity; orientation requires additional direction information. Multi-point orientation is a possible later extension.

## Keep one target and check activity

For a Proximity Receiver, the verified runtime selects the matching Sender with the greatest **strictly positive Proximity**. Sender type is 0 for no selected Sender, 1 for your own Avatar, 2 for another Avatar and 3 for a world Sender. Sensa's root route accepts type 1. Dedicated channels with one Sender per authoring component keep the measurement tied to the selected own root.

The native report has no timestamp, sequence number or stable Sender identifier. Sensa adds `Sample`, cycling through n/32 (n=1…32) at a nominal 50 ms interval, and `Radius`. `Sample=0` means disabled/invalid. The desktop requires all twelve fields from the same source and instance, finite values, positive Proximity, Self type and a positive supported Radius. Its position bound follows Radius with a small numeric tolerance. A changed Sample expires after **1000 ms**, or a shorter positive configured input timeout. Repeated identical Sample values do not extend activity.

When no Sender is selected, the SDK writes type 0 and zero position/velocity. Sensa stops the related motion when contact, complete fields, activity or bounds become invalid. Sample checks producer activity; SDK field delivery and Sender identity are checked through the dedicated setup and client acceptance. The [dictionary](osc-parameters.en.md) lists all twelve public fields.

## Map body movement into device targets

The `contact-position` and `contact-speed` [presets](presets.en.md) provide starting mappings; replace `Root` with the actual instance and calibrate their ranges. Use **X, Y, Z or Distance** to map a calibrated direction or distance from the Avatar origin. For subtle local movement, capture the desired start and end along one axis: for example, map a small forward/back root displacement to a limited depth range. Existing OGB depth signals remain useful for their authored depth trends; Contact coordinates let you select a specific movement axis.

Use **VelocityX, VelocityY, VelocityZ or Speed** to map movement strength, or **ProximitySpeed** for approach/withdrawal intensity inside the Receiver. A touch/Close signal can provide a separate contact condition when the intended effect needs touch confirmation. Capture suitable endpoints, inspect the preview, save the mapping, then enable experimental spatial input and the actual OSC input. Calibration, curves, output limits, activation and invalidity stops follow the existing spatial flow.

Position and speed provide different controls: a stationary root holds its position-based target while its velocity-based target can return to the calibrated zero-speed level. Check direction, response and stopping in the actual client, then use a small output range to verify the device response. [Workbench guide](guide.en.md) · [Positioning](positioning.en.md)

## Package evidence and related SDK features

The evidence is the official release assets, with SHA-256 recorded for reproducibility:

| Package | SHA-256 |
| --- | --- |
| [com.vrchat.base-3.10.6-beta.2.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.base-3.10.6-beta.2.zip) | `7c6d17be89b1ffad2da8dc52eb3cdd477533f4f7957359d24351807b6aa64ff2` |
| [com.vrchat.avatars-3.10.6-beta.2.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.avatars-3.10.6-beta.2.zip) | `22d5fbe409de4e9640a6772c5156bce1a64d1eb59a392a29d7094a786379b332` |

In the Avatars package, `Editor/VRCSDK/SDK3A/AvatarDynamicsSetup.cs:88–113` binds the generated suffixes. In the Base package runtime assembly `Runtime/VRCSDK/Plugins/VRC.Dynamics.dll`, `ContactReceiver.SetAdvancedProximityParameters`, `ShapeData.GetPointInLocalSpace`, `ContactManager.CalcRelativeVelocity` and the Proximity selection job establish selection, frame, units and velocity behavior described above. These package checks support the protocol reference; the [verification record](e2e-status.en.md) records Sensa's executed checks separately.

The beta also has material/shader reporting, with up to eight Sender entries and four renderers. That is a separate SDK output path. Sensa's Contact route uses Animator/OSC parameters; material reporting is available for future work. Existing Sensa Shader capture keeps its screen-code transport.

[Integration routes](usage-scenarios.en.md) · [OSC dictionary](osc-parameters.en.md) · [Unity package](../unity/top.sealoong.sensa/README.md)
