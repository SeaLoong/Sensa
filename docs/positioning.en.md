# Root positioning: coverage and coordinate meaning

[简体中文](positioning.md) | **English**

Tracking turns a selected Avatar root into position, velocity or orientation readings. Choose the route matching your Avatar and environment, inspect its coordinate frame and unit, then calibrate the metric used by an output. The setup can follow SPS Socket/Plug roots, a bone or Transform, or a Sensa/native Contact root.

Choose a route below, inspect coordinates, then calibrate them into device motion. See [integration routes](usage-scenarios.en.md) for setup or try the [interactive explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) first.

| Route | What you obtain | What invalidates it |
| --- | --- | --- |
| Contact direct tracking (SDK Beta) | Selected root in AvatarRootMeters, with relative contact-point velocity | Leaving the dedicated Receiver, invalid complete fields or stopped activity |
| SPS four-anchor tracking | Your selected root in AvatarRootLocal coordinates | Leaving the common receiver coverage, saturated proximity, stopped sampling or inconsistent geometry |
| Shader capture | Root coordinates read from a screen code, also AvatarRootLocal | Out-of-range coordinates, failed code alignment/checks or frozen images |
| Independent Point/Handle/Pose | Experimental position/orientation in its own reference frame | Expired participating parameters or unmet pairing/grab/geometry conditions |
| SPS2 · PenOthersNewRoot / PenOthersNewTip; SPS1 · PenOthers / PenOthersClose | Depth trends and presence, useful for depth-linked motion | Missing pairs, unmet length-learning conditions or a closed Close gate |

[View the three tracking panels in use](screenshots.en.md#position-measurements).

## Contact direct tracking: position and velocity from one Receiver

Sensa supports SDK **3.10.6-beta.3** advanced Contact reports and the Proximity interface from Beta.2. Sensa uses one tiny spherical Sender following the selected own root and one spherical Receiver at the Avatar root with zero offsets and aligned axes. A unique channel and Self-only selection identify the intended target. Explicit Sensa/native Contact roots can be used independently of VRCFury. [Beta setup and package evidence](contact-sdk.en.md)

The SDK reports the Sender shape midpoint relative to the Receiver shape midpoint, rotated into Receiver axes, in physical metres. With this setup the frame is **AvatarRootMeters**. Its radius-based coverage is centered at the Avatar origin; the authored Receiver radius is 2 local units and `Radius` publishes the current world radius. Avatar scaling changes the physical displacement and Radius together, and a guard stops measurement before the 3 m Contact radius limit.

`Proximity_SenderVelocityX/Y/Z` and `Proximity_SenderVelocityMagnitude` report relative velocity near the contact point in m/s, including angular terms. `Proximity_ProximitySpeed` measures Proximity change per second. Midpoint coordinates and contact-point velocity can behave differently during rotation. Negative coordinates and stationary zero velocity are valid. One point supplies position and velocity; Tracking Frame adds three markers for a reference direction that follows bone movement.

Each instance publishes twelve fields under `Sensa/Contact/<id>/`. Native report fields are accompanied by Sensa's `Radius` and changing `Sample`. Sample cycles through n/32, n=1…32, nominally every 50 ms; its change age is at most 1000 ms, shortened by a smaller positive input timeout. The desktop requires the complete same-source instance, positive Proximity, type 1 (own Avatar), finite values and supported radius/position bounds. Contact loss, Sample=0, frozen activity or invalid values stop the related motion. [Field dictionary](osc-parameters.en.md)

## SPS four-anchor tracking: all four receivers must measure the target

Sensa places four fixed measurement anchors, P0–P3, under the Avatar root in a regular tetrahedron. A very small dedicated marker follows your selected SPS Socket/Plug root. Each receiver measures a distance to that marker; the desktop calculates its position from those four distances. Explicit bone/marker Transforms, Sensa and native Contact targets use the same SPS root protocol.

The default receiver radius is **2 Avatar-root local units**, with approximately **0.99 local units** between anchors. With root world scale 1, one local unit equals one metre. Unity and desktop share fixed geometry so every range is reconstructed using the same dimensions.

### Receiver radius, anchor spacing and usable coverage

The **receiver radius** describes how far each sphere extends from its center. **Anchor offsets** describe where the four centers are placed. Together they determine the green region’s size and shape.

| Current dimension | Value | Meaning |
| --- | --- | --- |
| Receiver radius R | 2 local units | Distance from one anchor to its receiver boundary |
| Anchor axis offset h | ±0.35 local units | X/Y/Z offsets from the layout center |
| Anchor-to-center distance √3h | About 0.606 local units | How far one anchor is from the center |
| Distance between any two anchors, 2√2h | About 0.990 local units | Spacing between two receiver centers |

A position can be reconstructed when the target enters the common region of all four receivers. The box shows accepted coordinate bounds, while green shows measurable positions within them. Independent Point/Handle/Pose use the same radius of 2 and offsets of ±0.35 in the selected reference object’s local units, with that object defining the origin. These lengths equal world metres directly when its cumulative world scale is one. Opening offsets in calculations and mappings retain local units.

### Positions of the current four anchors

| Anchor | Coordinates relative to Avatar root |
| --- | --- |
| P0 | (−0.35, 0.65, −0.35) |
| P1 | (0.35, 0.65, 0.35) |
| P2 | (0.35, 1.35, −0.35) |
| P3 | (−0.35, 1.35, 0.35) |

**Coverage is the intersection of all four spheres**, excluding receiver boundaries and small saturated regions near the anchors. A centered region with a radius of approximately 1.393 Avatar-root local units lies within the outer detection bounds around (0,1,0), but still excludes the small saturation holes near anchors. Unity and web coverage displays explain this spatial limit; sampling, scale and consistency checks must also pass.

Using a radius of 2 local units with closer anchors balances coverage, numeric noise amplification and Avatar-scaling headroom. A radius of 1 local unit substantially shrinks common coverage; making anchor spacing arbitrarily small weakens reconstruction away from the center. These defaults follow the geometry model; known positions in the client can be used to measure actual accuracy. [Derivation and tradeoffs](fixed-anchor-research.en.md)

### How distances become a position

For readers checking the algorithm: receiver radius R=2, marker radius r=.001, center c=(0,1,0), tetrahedral half-span h=.35. Outside saturation, proximity p and center distance d obey:

```text
p = clamp(1 - max(0,d-r)/R, 0, 1)
d = R(1-p)+r
q = -Σ((aᵢ-c)dᵢ²)/(8h²)
position = c+q
```

Omitting r confuses marker-surface and center distance. Reception requires strict .001<p<.999, four-distance RMS residual≤.01, and coordinate bounds X/Z=[−2,2], Y=[−1,3]. Residual checks agreement between the calculated position and the four ranges. Actual error is measured against known positions. [Shared definition](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs) · [Desktop solver](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedAnchorReconstruction.cs)

## Why can a stationary position stay valid while stopped sampling expires?

Each object sends `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`. P0–P3 are proximity values. `Sample` is a counter showing that the measurement components continue publishing: zero means disabled/invalid; active values cycle through n/32, n=1…32, approximately every 50 ms.

Unchanged P values are normal for a stationary root; **Sample must continue changing**. The desktop defaults to a 1000-ms change interval. Positive `InputTimeoutMs` can change it, with a decoder cap of 1250 ms. Receiving the same Sample again does not renew validity. Missing fields, illegal/zero counters, freezing, expiry or failed geometry invalidate the position.

Desktop uses changing Sample values to check continued publication, together with all four distances and geometric consistency. Each instance supplies the complete five-field set above.

Avatar menus may also expose `Sensa/Select/<group>`: 0 is Off and 1…N select targets. It chooses the measurement target in the Avatar menu. Desktop input is enabled separately in the workbench.

## What does Avatar scaling change?

Shared translation and rotation preserve relative distances; shared uniform scale cancels in the range ratio. Nonuniform scale or SDK radius clamping breaks that relationship. Builds therefore reject nonpositive/nonuniform root scale, root ScaleConstraint and known root-scale animation. The dedicated marker does not inherit target-bone scale.

The SDK world Contact radius cap is 3 m. Internal FX disables measurement and clears values before `2×authorScale×ScaleFactor` exceeds approximately 2.999 m. This keeps receivers within their supported scaling range. [Official Contacts](https://creators.vrchat.com/common-components/contacts/)

## Shader: coordinates, axes and screen capture

Shader capture draws the configured measurement origin, its +X/+Z axes and Avatar world scale as a monochrome block for the desktop bridge. Position and rotation offsets adjust this origin and orientation. Position ranges are **X/Z=[−2,2], Y=[−1,3]**, in Avatar-root local units. `AvatarScale` expresses world metres per local unit. The root panel displays position, both axes and scale from each valid packet.

The tile uses **QR Code v4-H**: a 33×33-module symbol plus 8 white modules per side, making **49×49 modules** and requiring at least **196×196 physical pixels**. The reader first finds three corner markers, then restores some obscured or misread data. A complete checked packet and an advancing image are required before values reach tracking calculations. Masking keeps the pattern readable; Reed–Solomon correction restores data within the bounds described in the [encoding design](shader-capture-research.en.md). The border includes the standard four-module quiet zone and four extra modules for movement. Re-select the full tile after resizing.

`Frame` checks image progression, with default freezing at 350 ms. Startup and recovery need two new advancing frames. Valid OSC sends **Frame → X/Y/Z → RightX/Y/Z → ForwardX/Y/Z → AvatarScale → Valid=1** consecutively; invalidation sends only Valid=0. Desktop allows Frame change age up to 500 ms, shortened by a stricter positive input timeout.

Right/Forward retain the configured measurement frame’s X/Z-axis directions and lengths. Use a tracking measurement (SensaPoint) in **Flow** for angles, magnitudes and orientation relationships. Independent Y-axis scale needs another measurement. Measure actual end-to-end latency and position error in the client. [Capture setup](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) · [Encoding](shader-capture-research.en.md) · [Parameters](osc-parameters.en.md)

Object ID is in `Sensa/Shader/<id>/`. Internal `Sensa/Diagnostics/Shader/0` keeps a separate five-field diagnostic format for pattern and transport checks.

## Measure depth and offset from a following plane

Tracking Frame and Shader following planes measure **relative movement between a target and reference on your own Avatar**. Add a Unity **Tracking Frame** when movement should be relative to the current orientation of a chest bone, hand or SPS root. It places Forward and Right markers along +Z and +X from a central Origin; all three follow the chosen reference's movement and rotation. Adjust the centre and orientation through local position/rotation offsets. The Scene XY plane and +Z arrow show the measurement direction. [Setup steps](unity-build.en.md#create-a-plane-that-follows-a-bone)

The desktop obtains direction from measured positions: Forward−Origin is positive depth, and Right−Origin is right. Select another measured target P to obtain:

| Reading | Meaning |
| --- | --- |
| Plane depth | Distance from the plane along positive depth is positive, and the opposite direction is negative |
| Offset within plane | Distance from the centre to the target projected onto the plane, always zero or positive |
| Distance between points | Straight-line distance from the target to the plane origin |
| Direction angle | Angle between the target's measured direction and a plane direction |

A centred sphere keeps its outline as a bone rotates; an offset sphere's centre moves with that rotation. Tracking Frame uses separated markers to observe orientation, while Shader measures two axes directly. A single sphere's proximity-derived distance remains useful for approach feedback.

Tracking Frame uses either SPS four-anchor or Contact direct tracking. Origin publishes under `Sensa/SPS/<name>_Origin/…` or `Sensa/Contact/<name>_Origin/…`; the other points use `_Forward` and `_Right`. SPS uses 15 Contacts and 15 public fields in AvatarRootLocal. Contact uses 6 Contacts and 36 public fields in AvatarRootMeters. Default marker spacing is 0.2 authored Avatar-root units and follows Avatar scale. A constraint makes the measured frame follow the reference's position and rotation.

In Flow, expand Spatial calculation presets → Follow a moving plane, select target P and the matching Origin, then review the generated differences, depth and offset before saving and connecting outputs. Target and plane markers share one coordinate frame, and the points used by the current calculation need valid coverage. Each point retains its own Sample validity. Calculations use the oldest contributing sample time; assess direction error from multi-point updates during fast movement in the client. Independent Point/Pose use a separate ReferenceLocal frame for direct measurement within the chosen local reference. [Spatial calculations and units](computed-signals.en.md#combine-root-coordinates)

## Interaction between Avatars: paired three-marker pose

Use **SensaPoseSocket + SensaPosePlug** for interaction between two Avatars, with the receiving Socket's local frame as their shared reference. As the Socket moves or rotates with the body, depth, offset and angles remain relative to that reference. The other Avatar's Root/Tip/Side markers provide the measured geometry; existing OGB/SPS proximity parameters remain useful for depth trends and touch feedback.

1. In each Unity project, create a profile through **Assets → Create → Sensa → Pose Pair Profile**. Set the same `channel`, such as `Pair01`, on both sides. Enable `receiveOthers` on the receiving side. Each channel corresponds to one Plug entering the measurement area at a time.
2. On the receiving Avatar, choose **GameObject → Sensa → Spatial Pose Socket** under the bone it should follow. Assign the Profile and a unique instance name. Place its origin at the opening, with **+Z pointing inward** and XY defining the opening plane. Keep the object and its parents within the supported uniform-scale setup.
3. On the sending Avatar, choose **GameObject → Sensa → Spatial Pose Plug** and assign a Profile with the same channel. Assign Root, Tip and Side markers from that Avatar to `rootMarker`, `tipMarker` and `sideMarker`. Root and Tip define the main axis; place Side away from the axis to establish twist.
4. After building and using both Avatars in VRChat, enable VRChat OSC on the receiving side, fix its source in Sensa and inspect **Three-point pose (experimental)**. A complete instance path is `Sensa/Pose/v1/Main/Others/**`. Root, Tip and Side each supply A0–A7, totaling 24 readings. Check inward motion, lateral offset and twist against the actual movement.
5. Choose Generate depth draft or Generate six-axis draft, review the replacement mapping drafts and save. Alternatively, select **Three-point pose metric (SensaPose)** in a calculation or output and enter the same instance path. Calibrate, allow experimental spatial input, then enable the current input.

| Available metric | Meaning |
| --- | --- |
| `Depth` | Insertion fraction from 0 to 1, for normalized depth linkage |
| `OffsetX`/`OffsetY` | Lateral offset where the main axis intersects the opening plane, in Socket-local units |
| `Yaw`/`Pitch`/`Roll` | Yaw, pitch and twist relative to the Socket, in degrees |

All six metrics can drive motion when the 24 readings are complete and fresh, marker geometry is valid and engagement conditions hold. Engagement requires a unique axis intersection with the opening plane, tilt of at most 65° from +Z, an intersection within 0.04 Socket-local units of the centre, and Tip on the +Z side. Root–Tip spacing supports 0.02–0.5 local units, with Side at least 0.005 local units off the axis. These values equal metres when cumulative reference scale is one.

Pose checks freshness using the oldest of all 24 readings. `Depth` retains its normalized fraction, while the earlier `PlaneDepth` retains position-length units; choose calculation and output ranges accordingly. [Paired generation options](../unity/top.sealoong.sensa/AUTOMATION.en.md#targets-and-scope) · [Marker layout](lab-interaction.en.md#pointpose-layouts-and-sps-four-anchor-tracking)

## What does “Simulate a valid sample” mean on the web page?

When checked, the explorer displays readings for a valid sample. Clearing it shows the source reporting invalid data, so you can see how a measurement changes when samples stop. Configure actual device linkage by selecting an input, saving mappings and enabling input in the workbench.

## From coordinates to motion

1. Fix the object and source in the root panel. Check valid coordinates and expected movement direction.
2. Select X/Y/Z or distance from the Avatar origin. For Contact direct tracking, also choose VelocityX/Y/Z, Speed or ProximitySpeed to control movement strength. Capture the desired motion start and end as 0% and 100%.
3. Inspect the preview, replace the mapping draft and save. Saving disables input.
4. Allow experimental spatial input, then enable actual OSC input.

Calibrated axes suit subtle local depth trends; a separate touch/Close condition can confirm contact when needed. Speed metrics suit movement strength. Invalid coordinates or activity stop the corresponding motion. Independent Point/Handle/Pose interpret coordinates relative to their own reference objects and check the oldest participating sample; Handle also checks grab conditions. Three markers with a defined layout can provide local orientation.

After configuration, check coordinate direction, response time and invalidity stops in the client, then verify device motion with a small travel range. See the [browser verification record](e2e-status.en.md) for automated-check scope and outcomes. [Parameter dictionary](osc-parameters.en.md) · [Workbench guide](guide.en.md)

## Use tracking results in computations

Add a computed signal in Flow, choose Tracking measurement (SensaPoint) as an input, enter the target instance path and select a metric. The solved result can participate in a weighted average, difference or magnitude calculation. SPS four-anchor tracking reconstructs coordinates first; the computation receives those valid coordinates. Give each target its own complete instance path.

For example, when roots A and B share an Avatar-root frame, choose Distance between points and select each point’s XYZ to obtain their gap directly. For depth or offset within a plane, also choose an origin and normal, or two axes that define the plane. SPS four-anchor tracking and Shader distances use authored AvatarRootLocal units; Contact distances use AvatarRootMeters in metres. Use the same reference object, axis directions and units, then calibrate the final result to the motion range. Tracking validity and Sample/Frame age carry through to the computed result; invalid active computations stop motion. [Computed-signal examples](computed-signals.en.md)
