# Root positioning: coverage and coordinate meaning

[简体中文](positioning.md) | **English**

Sensa can obtain the three-dimensional position of the **root** you select in Unity, relative to the Avatar. Select a supported SPS Socket/Plug, bone/empty-object Transform, Sensa or native Contact root. X is left/right, Y up/down and Z forward/back. Moving or turning the whole Avatar leaves that relative position stable, making local approach, lift or forward/back movement useful for device mapping.

Choose a route below, inspect coordinates, then calibrate them into device motion. See [integration routes](usage-scenarios.en.md) for setup or try the [interactive explorer](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) first.

| Route | What you obtain | What invalidates it |
| --- | --- | --- |
| Contact direct tracking (SDK Beta) | Selected root in AvatarRootMeters, with relative contact-point velocity | Leaving the dedicated Receiver, invalid complete fields or stopped activity |
| SPS four-anchor tracking | Your selected root in AvatarRootLocal coordinates | Leaving the common receiver coverage, saturated proximity, stopped sampling or inconsistent geometry |
| Shader capture | Root coordinates read from a screen code, also AvatarRootLocal | Out-of-range coordinates, failed code alignment/checks or frozen images |
| Independent Point/Handle/Pose | Experimental position/orientation in its own reference frame | Expired participating parameters or unmet pairing/grab/geometry conditions |
| SPS2 · PenOthersNewRoot / PenOthersNewTip; SPS1 · PenOthers / PenOthersClose | Depth trends and presence, useful for depth-linked motion | Missing pairs, unmet length-learning conditions or a closed Close gate |

## Contact direct tracking: position and velocity from one Receiver

SDK 3.10.6-beta.2 exposes advanced Proximity reports. Sensa uses one tiny spherical Sender following the selected own root and one spherical Receiver at the Avatar root with zero offsets and aligned axes. A unique channel and Self-only selection identify the intended target. Explicit Sensa/native Contact roots can be used independently of VRCFury. [Beta setup and package evidence](contact-sdk.en.md)

The SDK reports the Sender shape midpoint relative to the Receiver shape midpoint, rotated into Receiver axes, in physical metres. With this setup the frame is **AvatarRootMeters**. Its radius-based coverage is centered at the Avatar origin; the authored Receiver radius is 2 local units and `Radius` publishes the current world radius. Avatar scaling changes the physical displacement and Radius together, and a guard stops measurement before the 3 m Contact radius limit.

`Proximity_SenderVelocityX/Y/Z` and `Proximity_SenderVelocityMagnitude` report relative velocity near the contact point in m/s, including angular terms. `Proximity_ProximitySpeed` measures Proximity change per second. Midpoint coordinates and contact-point velocity can behave differently during rotation. Negative coordinates and stationary zero velocity are valid. One point supplies position and velocity; multi-point orientation remains a later extension.

Each instance publishes twelve fields under `Sensa/Contact/<id>/`. Native report fields are accompanied by Sensa's `Radius` and changing `Sample`. Sample cycles through n/32, n=1…32, nominally every 50 ms; its change age is at most 1000 ms, shortened by a smaller positive input timeout. The desktop requires the complete same-source instance, positive Proximity, type 1 (own Avatar), finite values and supported radius/position bounds. Contact loss, Sample=0, frozen activity or invalid values stop the related motion. [Field dictionary](osc-parameters.en.md)

## SPS four-anchor tracking: all four receivers must measure the target

Sensa places four fixed measurement anchors, P0–P3, under the Avatar root in a regular tetrahedron. A very small dedicated marker follows your selected SPS Socket/Plug root. Each receiver measures a distance to that marker; the desktop calculates its position from those four distances. Explicit bone/marker Transforms, Sensa and native Contact targets use the same SPS root protocol.

The default receiver radius is **2 m**, with approximately **0.99 m** between anchors. These are Avatar-root local units, directly equal to world meters only when authored and runtime root scales are one. Unity and desktop share fixed geometry so every range is reconstructed using the same dimensions.

### Receiver radius, anchor spacing and usable coverage

The **receiver radius** describes how far each sphere extends from its center. **Anchor offsets** describe where the four centers are placed. Together they determine the green region’s size and shape.

| Current dimension | Value | Meaning |
| --- | --- | --- |
| Receiver radius R | 2 m | Distance from one anchor to its receiver boundary |
| Anchor axis offset h | ±0.35 m | X/Y/Z offsets from the layout center |
| Anchor-to-center distance √3h | About 0.606 m | How far one anchor is from the center |
| Distance between any two anchors, 2√2h | About 0.990 m | Spacing between two receiver centers |

A position can be reconstructed when the target enters the common region of all four receivers. The box shows accepted coordinate bounds, while green shows measurable positions within them. Independent Point/Handle/Pose also use 2 m receivers and ±0.35 m offsets, with an origin defined by their selected reference object.

### Positions of the current four anchors

| Anchor | Coordinates relative to Avatar root |
| --- | --- |
| P0 | (−0.35, 0.65, −0.35) |
| P1 | (0.35, 0.65, 0.35) |
| P2 | (0.35, 1.35, −0.35) |
| P3 | (−0.35, 1.35, 0.35) |

**Coverage is the intersection of all four spheres**, excluding receiver boundaries and small saturated regions near the anchors. A centered region of approximately 1.393 m radius lies within the outer detection bounds around (0,1,0), but still excludes the small saturation holes near anchors. Unity and web coverage displays explain this spatial limit; sampling, scale and consistency checks must also pass.

Using 2 m with closer anchors balances coverage, numeric noise amplification and Avatar-scaling headroom. A 1-m radius substantially shrinks common coverage; making anchor spacing arbitrarily small weakens reconstruction away from the center. These defaults follow the geometry model; known positions in the client can be used to measure actual accuracy. [Derivation and tradeoffs](fixed-anchor-research.en.md)

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

## Shader: coordinate coverage and image recognition are separate

Shader capture draws the same root position as a black-and-white block, read by the Python desktop bridge. Its full allowed coordinate box is **X/Z=[−2,2], Y=[−1,3]**. Separately, the code must appear inside the selected screen region.

The native code uses 20×12 modules. Its central 16×8 modules contain data; a fixed two-module border helps identify orientation and alignment. Fixed modules intentionally remain unchanged as coordinates move. The bridge tolerates damage to one of the four edges and tries small translation corrections within the selected region; payload data must still pass CRC. Keep the capture region aligned with the block’s orientation and size. Damaged data is reported as invalid.

Edge markers realign the block after small image offsets. `Frame` detects duplicates/freezing: the default bridge invalidates after 350 ms without progress, and startup/recovery requires two new advancing frames. Response time also depends on client rendering, desktop composition and capture frequency. [Capture setup](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) · [Encoding design](shader-capture-research.en.md)

A valid OSC bundle sends `Sensa/Shader/<id>/{Frame,X,Y,Z,Valid}` in order, with Valid=1 committing last. Invalidity sends only Valid=0. The desktop additionally checks one source, contiguous fields, finite coordinates and Frame change age, rejecting beyond 500 ms or a stricter positive input timeout. The normal bridge already expires at 350 ms; 500 ms is an additional desktop rejection limit.

The path identifies the object and the namespace fixes AvatarRootLocal. Internal `Sensa/Diagnostics/Shader/0` checks patterns and transport.

## What does “Simulate a valid sample” mean on the web page?

When checked, the explorer displays readings for a valid sample. Clearing it shows the source reporting invalid data, so you can see how a measurement changes when samples stop. Configure actual device linkage by selecting an input, saving mappings and enabling input in the workbench.

## From coordinates to motion

1. Fix the object and source in the root panel. Check valid coordinates and expected movement direction.
2. Select X/Y/Z or distance from the Avatar origin. For Contact direct tracking, also choose VelocityX/Y/Z, Speed or ProximitySpeed to control movement strength. Capture the desired motion start and end as 0% and 100%.
3. Inspect the preview, replace the mapping draft and save. Saving disables input.
4. Allow experimental spatial input, then enable actual OSC input.

Calibrated axes suit subtle local depth trends; a separate touch/Close condition can confirm contact when needed. Speed metrics suit movement strength. Invalid coordinates or activity stop the corresponding motion. Independent Point/Handle/Pose interpret coordinates relative to their own reference objects and check the oldest participating sample; Handle also checks grab conditions. Three markers with a defined layout can provide local orientation.

After configuration, check coordinate direction, response time and invalidity stops in the client, then verify device motion with a small travel range. See the [browser verification record](e2e-status.en.md) for automated-check scope and outcomes. [Parameter dictionary](osc-parameters.en.md) · [Workbench guide](guide.en.md)
