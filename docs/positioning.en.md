# Root positioning: coverage and coordinate meaning

[简体中文](positioning.md) | **English**

Sensa can calculate the three-dimensional position of the Socket/Plug **root** you select in Unity, relative to the Avatar. X is left/right, Y up/down and Z forward/back. Moving or turning the whole Avatar leaves that relative position unchanged. One root supplies no orientation, tip position or final deformed surface.

Choose a route below, inspect coordinates, then calibrate them into device motion. See [integration routes](usage-scenarios.en.md) for setup or try the [interactive explorer](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) first.

| Route | What you obtain | What invalidates it |
| --- | --- | --- |
| Sensa SPS | Your selected root in AvatarRootLocal coordinates | Leaving the common receiver coverage, saturated proximity, stopped sampling or inconsistent geometry |
| Shader capture | Root coordinates read from a screen code, also AvatarRootLocal | Out-of-range coordinates, failed code alignment/checks or frozen images |
| Independent Point/Handle/Pose | Experimental position/orientation in its own reference frame | Expired participating parameters or unmet pairing/grab/geometry conditions |
| Existing OGB Root/Tip | Proximity and a depth estimate | Missing pairs or unmet length-learning conditions; it does not supply XYZ |

## Sensa SPS: all four receivers must measure the target

Sensa places four fixed measurement anchors, P0–P3, under the Avatar root in a regular tetrahedron. A very small dedicated marker follows your selected root. Each receiver measures a distance to that marker; the desktop calculates its position from those four distances.

The default receiver radius is **2 m**, with approximately **0.99 m** between anchors. These are Avatar-root local units, directly equal to world meters only when authored and runtime root scales are one. Geometry is currently fixed and shared: changing only a Unity radius would make desktop reconstruction use the wrong model.

### How do 2.5 m, 0.5 m and usable coverage differ?

In the earlier description, **2.5 m was each receiver sphere's radius**. **0.5 m was each anchor's offset from the center along X, Y and Z**, which determines where the four receivers are placed. It was neither a receiver radius nor the distance between anchors.

| Dimension | Previous fixed SPS layout | Current fixed SPS layout |
| --- | --- | --- |
| Radius R of each receiver sphere | 2.5 m | 2 m |
| Anchor offset h along each coordinate axis | ±0.5 m | ±0.35 m |
| Straight-line distance from anchor to layout center, √3h | About 0.866 m | About 0.606 m |
| Straight-line distance between any two anchors, 2√2h | About 1.414 m | About 0.990 m |

For example, the previous layout's first anchor was 0.5 m left, down and behind the center. A sphere centered there extended another 2.5 m in every direction. The target still needed to be measured by all four receivers, so none of these dimensions alone describes usable coverage. The displayed coordinate box has a separate meaning: it bounds the coordinates accepted by the solver.

Independent Point/Handle/Pose previously used a different, small layout: a 0.35 m receiver radius, ±0.06 m axis offsets and an approximately 0.245 m reconstruction limit from its reference origin. That was not the old fixed SPS 2.5 m layout.

### Positions of the current four anchors

| Anchor | Coordinates relative to Avatar root |
| --- | --- |
| P0 | (−0.35, 0.65, −0.35) |
| P1 | (0.35, 0.65, 0.35) |
| P2 | (0.35, 1.35, −0.35) |
| P3 | (−0.35, 1.35, 0.35) |

**Coverage is the intersection of all four spheres**, excluding receiver boundaries and small saturated regions near the anchors. It is neither one radius-2-m sphere nor the entire displayed coordinate box. A centered region of approximately 1.393 m radius lies within the outer detection bounds around (0,1,0), but still excludes the small saturation holes near anchors. Unity and web coverage displays explain this spatial limit; sampling, scale and consistency checks must also pass.

Using 2 m with closer anchors balances coverage, numeric noise amplification and Avatar-scaling headroom. A 1-m radius substantially shrinks common coverage; making anchor spacing arbitrarily small weakens reconstruction away from the center. These are model choices, not measured precision claims. [Derivation and tradeoffs](fixed-anchor-research.en.md)

### How distances become a position

For readers checking the algorithm: receiver radius R=2, marker radius r=.001, center c=(0,1,0), tetrahedral half-span h=.35. Outside saturation, proximity p and center distance d obey:

```text
p = clamp(1 - max(0,d-r)/R, 0, 1)
d = R(1-p)+r
q = -Σ((aᵢ-c)dᵢ²)/(8h²)
position = c+q
```

Omitting r confuses marker-surface and center distance. Reception requires strict .001<p<.999, four-distance RMS residual≤.01, and coordinate bounds X/Z=[−2,2], Y=[−1,3]. Residual describes agreement between the calculated position and ranges; it is neither a position-error bound nor sender authentication. [Shared definition](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs) · [Desktop solver](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedAnchorReconstruction.cs)

## Why can a stationary position stay valid while stopped sampling expires?

Each object sends `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`. P0–P3 are proximity values. `Sample` is a counter showing that the measurement components continue publishing: zero means disabled/invalid; active values cycle through n/32, n=1…32, approximately every 50 ms.

Unchanged P values are normal for a stationary root; **Sample must continue changing**. The desktop defaults to a 1000-ms change interval. Positive `InputTimeoutMs` can change it, with a decoder cap of 1250 ms. Receiving the same Sample again does not renew validity. Missing fields, illegal/zero counters, freezing, expiry or failed geometry invalidate the position.

This counter shows continued publication. It does not establish that all four Contacts updated at one exact instant or that the underlying measurements are fresh. The public protocol accepts no old Root/SharedRoot, A0–A3 or Profile/Scale/Valid/Heartbeat aliases; independent Point/Pose values cannot fill missing fields.

Avatar menus may also expose `Sensa/Select/<group>`: 0 is Off and 1…N select targets. It is an extra menu control, outside the five measurements, and does not enable desktop input.

## What does Avatar scaling change?

Shared translation and rotation preserve relative distances; shared uniform scale cancels in the range ratio. Nonuniform scale or SDK radius clamping breaks that relationship. Builds therefore reject nonpositive/nonuniform root scale, root ScaleConstraint and known root-scale animation. The dedicated marker does not inherit target-bone scale.

The SDK world Contact radius cap is 3 m. Internal FX disables measurement and clears values before `2×authorScale×ScaleFactor` exceeds approximately 2.999 m. This guard cannot remove every client-timing risk or authenticate senders using the same tag. [Official Contacts](https://creators.vrchat.com/common-components/contacts/)

## Shader: coordinate coverage and image recognition are separate

Shader capture draws the same root position as a black-and-white block, read by the Python desktop bridge. It has no Contact trigger radius: its full allowed box is **X/Z=[−2,2], Y=[−1,3]**. Separately, the code must appear inside the selected screen region.

The native code uses 20×12 modules. Its central 16×8 modules contain data; a fixed two-module border helps identify orientation and alignment. Fixed modules intentionally remain unchanged as coordinates move. The bridge tolerates damage to one of the four edges and tries small translation corrections within the selected region; payload data must still pass CRC. It does not automatically correct rotation, perspective or scale, or repair damaged payload bits.

Edge markers reduce recognition failures caused by small image offsets; **they do not remove rendering latency**. `Frame` detects duplicates/freezing: the default bridge invalidates after 350 ms without progress, and startup/recovery requires two new advancing frames. Even advancing codes do not establish a fresh final mesh or another Shader's texture. [Capture setup](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) · [Encoding design](shader-capture-research.en.md)

A valid OSC bundle sends `Sensa/Shader/<id>/{Frame,X,Y,Z,Valid}` in order, with Valid=1 committing last. Invalidity sends only Valid=0. The desktop additionally checks one source, contiguous fields, finite coordinates and Frame change age, rejecting beyond 500 ms or a stricter positive input timeout. The normal bridge already expires at 350 ms; 500 ms is an additional desktop rejection limit.

The path identifies the object and the namespace fixes AvatarRootLocal, so repeated Producer/Profile fields are unnecessary. Internal diagnostics under `Sensa/Diagnostics/Shader/0` do not create mappable roots.

## What does “Simulate a valid sample” mean on the web page?

It only changes the explorer: checked simulates a valid sample; unchecked simulates the sender reporting invalid data. It does not upload an Avatar, grant software-publication permission, control real measurement components or enable a device. Explorer validity also excludes desktop mappings and device output.

## From coordinates to motion

1. Fix the object and source in the root panel. Check valid coordinates and expected movement direction.
2. Select X/Y/Z or distance from the Avatar origin. Capture the desired motion start and end as 0% and 100%.
3. Inspect the preview, replace the mapping draft and save. Saving disables input.
4. Allow experimental spatial input, then enable actual OSC input.

Invalidity stops without falling back to an old scalar on the same axis. Independent Point/Handle/Pose use their own reference frames and oldest participating channel timestamps; Handle also includes grab conditions. They cannot be mixed with fixed roots. Three markers can estimate local orientation but cannot observe shared world motion without an external reference.

Accuracy, latency and stopping still need real-client measurements. Unit tests, Unity EditMode and browser images prove their respective boundaries, not Avatar upload, real Contacts/OSC, desktop/headset capture or mechanical behavior. [Parameter dictionary](osc-parameters.en.md) · [Workbench guide](guide.en.md)
