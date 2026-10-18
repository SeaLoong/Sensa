# What positioning can measure

[简体中文](positioning.md) | **English**

Contact positioning is currently an **experimental estimate in a reference-local frame**. It cannot drive outputs by default. More receivers or a small fit residual do not turn ordinary VRChat Proximity values into a reliable position sensor.

## Are four distances enough?

Four known, noncoplanar anchors are enough to locate a point in relative XYZ **if every distance measures the same point at the same instant**, with correct calibration and units. The count itself is not the problem.

For anchors `c0..c3`, target `x`, and distances `d0..d3`:

```text
|x - ci|² = di²
2(ci - c0) · x = |ci|² - |c0|² - (di² - d0²), i = 1..3
```

Subtracting equations gives three linear equations. They have a unique XYZ solution when the anchor differences span three dimensions. Coplanar or nearly coplanar anchors and large noise introduce ambiguity or instability. A sphere center still supplies no orientation; pose requires a trusted direction or several identifiable markers.

Moving or rotating the anchors and target together preserves every distance. Your local readings may therefore remain unchanged while you move with the reference bone; they cannot independently recover world movement.

## What does the current code do?

Unity builders generate a tetrahedral array for Point/Handle, an eight-receiver array for Root, and an eight-receiver array for each Pose Root/Tip/Side marker. Their inputs are proximity values, not XYZ.

For a known spherical Sender, receiver radius `R`, Sender radius `r`, and unsaturated proximity `p`, the implementation converts to center distance using `d = R × (1 - p) + r`, then fits a local position. Standard Root radius is fitted as an unknown. Pose uses three fitted points to estimate a straight axis, an aperture-plane intersection and orientation. It does not measure the deformed mesh surface. [Geometry](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/PoseReconstruction.cs), [point observations](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SpsPositionTracking.cs), [Unity protocol constants](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaPoseProtocol.cs)

Observations explicitly report `Experimental=true` and `CoordinateFrame=ReferenceLocal`. Units are reference-local meters, not unconditional world meters. Correct dimensions, positive uniform scaling and generated parameters remain prerequisites.

## Why is it still unreliable?

| Missing guarantee | Consequence |
| --- | --- |
| One Sender | Each receiver selects its nearest matching Contact; different receivers can select different targets |
| One frame | Avatar OSC parameters update separately; the range protocol has no frameId or complete sample batch |
| Correct geometry | Different shapes, radii or scale invalidate the center-distance model |
| Full measurement range | Saturation at 0/1 loses distance information; four nonzero values are insufficient |
| World reference | Relative distances cannot reveal a common rigid transform; a bone reference is not a world frame |
| Actual surface | Reference bones can differ from the SPS Shader's deformed curve |

VRChat defines Proximity using the nearest point on a Sender, selecting the closest Contact when several match. Avatar receivers write Animator parameters; ordinary parameter output carries no target identity. [Official Contacts documentation](https://creators.vrchat.com/common-components/contacts/)

The repository's `NearestOfSeveralSendersCanProduceAZeroResidualGhost` regression supplies four- and eight-receiver counterexamples: different Senders produce ranges that exactly fit a nonexistent sphere center, with zero residual. Place each Sender at twice its corresponding anchor position: a receiver at aᵢ selects a Sender at 2aᵢ, giving range |aᵢ|, identical to a single sphere at the origin. With the current ±6 cm anchors, real Senders are about 20.8 cm from the empty origin reconstructed by the fit. A successful fit only shows consistency with the model. Eight-receiver redundancy proves neither identity nor a shared frame. [Counterexamples and freshness contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/SpatialContracts.cs)

## How does this version handle it?

- `osc.allowExperimentalSpatialInput=false` by default. Existing SensaPoint/SensaPose mappings cannot bypass it. No positioning preset is recommended by default.
- Observations, residuals and advanced experimental calibration remain available. Experimental output additionally requires complete, fresh geometry, the correct source and valid gates. Root/SharedRoot remain diagnostic-only.
- Freshness uses the **oldest contributing channel timestamp**, including grab state for Handle. The default spatial limit is 1000 ms; a positive `inputTimeoutMs` overrides it. Refreshing one channel cannot renew the others.
- Expired, missing or invalid samples, or disabled experimental input, block spatial output. The runtime does not substitute an old scalar to disguise invalid positioning. The experimental switch is not a reliability certification.
- Delta-only VRChat OSC may omit unchanged values. An apparently stationary estimate can therefore expire; an infinite timeout or fabricated timestamps would not prove freshness.

[Runtime](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs) and [configuration](https://github.com/SeaLoong/Sensa/blob/main/src/Configuration/AppConfig.cs) enforce these gates.

For ordinary control, prefer clear scalar inputs: Manual, funscript, native PB Stretch/IsGrabbed, or an SPS radial estimate whose limitations you accept. PB Stretch is a PhysBone scalar, not XYZ. [Presets](presets.en.md)

## What would a reliable redesign require?

Start with a trusted producer rather than adding more unidentified ranges. A proposed contract would require:

1. One calibrated producer supplying XYZ in a single batch, with explicit meter units, coordinate frame, target/reference identity and calibration identity.
2. A monotonic `frameId`, validity and verifiable freshness per batch. Position, state and identity must be received atomically; reject reordered, partial and old frames.
3. For six-axis input, a calibrated direction/quaternion or several identifiable markers from the same frame.
4. Defined stop behavior on expiry, producer disconnect, calibration changes and out-of-range data, followed by error measurements against recorded real trajectories.

These are future implementation requirements. No such general producer protocol currently exists. Avatars cannot run arbitrary desktop C#, and world Udon access cannot be assumed available to an avatar. Existing Shader tools inspect editor model snapshots or image transport; they do not establish a reliable general-purpose, real-time VRChat SPS surface-tracking chain. [Shader experiment boundaries](../unity/top.sealoong.sensa/GPU-TRACKING.en.md)

[User guide](guide.en.md) · [Feature reference](features.en.md)
