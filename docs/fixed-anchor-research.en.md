# SPS four-anchor tracking: evidence and tradeoffs

[简体中文](fixed-anchor-research.md) | **English**

Four fixed anchor distances locate a root in Avatar-local coordinates. This reference explains the equations, receiver coverage and sampling model behind SPS four-anchor tracking, including the current radius 2 and ±0.35 anchor offsets. Use the coverage model to choose placement, then calibrate the resulting position in Sensa.

Use [routes](usage-scenarios.en.md) for setup, [positioning](positioning.en.md) for reception conditions and the [dictionary](osc-parameters.en.md) for fields. This page records pinned sources, mathematical derivations and assumptions awaiting measurement. Client accuracy needs known-trajectory measurements recorded separately.

## Primary evidence

The [Contact reference](https://creators.vrchat.com/common-components/contacts/) describes closest-point proximity, nearest-sender aggregation and a 3-m post-scaling radius cap. It does not publish the linear equation. We inspected installed SDK 3.10.5 ContactManager/CollisionScene; the inspection copy matches the package VRC.Dynamics.dll SHA-256:

`672093e0c2a52a035979f1ff66478389949f42ffcf7daba5edd8b8da718629a3`

For two spheres, the implementation implies:

```text
p = 1-clamp(max(0,d-r)/R,0,1)
d = R(1-p)+r    # only outside saturation
```

Inversion requires a known spherical Sender radius, which is added back to the recovered distance. Root placement follows author-local geometry from pinned VRCFury [Socket](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs)/[Plug bakers](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs). Sensa adds a dedicated radius-0.001 sphere with a unique tag so the sending geometry matches the reconstruction formula.

## Four-point algebra

[SensaFixedAnchorProtocol.cs](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs) defines center c=(0,1,0), h=0.35 and P0–P3:

```text
(-.35,.65,-.35), (.35,.65,.35), (.35,1.35,-.35), (-.35,1.35,.35)
```

Three anchor differences from P0 have nonzero determinant 0.686. Squared-distance differences produce three independent equations:

```text
2(aᵢ-a₀)·position = |aᵢ|²-|a₀|²+d₀²-dᵢ²
```

Tetrahedral symmetry also gives `q=-Σ((aᵢ-c)dᵢ²)/(8h²)`, with position c+q. All center distances equal √3×0.35≈0.606218; at R=2 and r=.001, ideal proximity is approximately 0.697391109. The solver checks four-sphere residuals, coverage and bounds. Saturated endpoints represent ranges of distances, so reconstruction accepts only the unsaturated interval.

Common rigid movement preserves distances. Common uniform scale cancels in `(s*d-s*r)/(s*R)`, yielding AvatarRootLocal coordinates. This relationship requires equal scaling along all axes and a Receiver radius within the SDK's 3-m world-radius limit.

## Why use R=2 and h=0.35?

R is the radius of one receiver sphere; h is an anchor's offset from the layout center along each coordinate axis. These are independent dimensions. Current R=2 and h=0.35 give an anchor-to-center distance of √3h≈0.606 and anchor-to-anchor distance of 2√2h≈0.990, all in Avatar-root authored units. At root scale one, these distances correspond to metres. The [dimension guide](positioning.en.md) explains how these dimensions relate to usable coverage.

Four anchors form a noncoplanar layout. At a fixed receiver radius, bringing them closer increases common coverage and affects conditioning away from the center. The selected radius of 2 balances coverage and SDK scaling headroom. Authoring and desktop processing share one geometry; dimension changes require matching generation and reconstruction rules.

For a marker radius r=.001 and strict .001<p<.999, valid center distance lies between .003 and 1.999. The common region is the intersection of those four distance shells, clipped by the ±2 coordinate box. Its outer bounds contain a centered ball of radius `1.999−√3×.35≈1.392782`, with small saturated holes near anchors excluded. This describes spatial coverage; accepting a sample also requires sampling activity and scale checks.

| Receiver radius, same h=.35, authored units | Centered outer-bound radius, authored units | Approximate uniform scale headroom at authored scale 1 |
| --- | --- | --- |
| 1, comparison | 0.394 | 2.999× |
| 2, selected | 1.393 | 1.4995× |

The radius-1 example illustrates the tradeoff. The shared protocol currently fixes the radius at 2, providing greater common coverage. Suitability for a particular Avatar and movement path still needs measurement.

Let range Jacobian rows be `Jᵢ=(position-aᵢ)/dᵢ`. At the center, `JᵀJ=(4/3)I`, so the 2-norm condition number is 1. Assuming independent proximity noise with standard deviation σp on each channel, first-order center propagation gives per-axis standard deviation `sqrt(3)Rσp/2`, approximately `1.732σp` in Avatar-root authored units at current R=2. This is a model estimate under the stated noise assumptions; measured precision needs a separate record. Closer anchors can worsen conditioning away from the center, so client measurements should cover intended trajectories.

The 0.01 residual threshold checks consistency between the four ranges and the reconstruction model. Actual error bounds need known-trajectory measurements. Existing redundancy supports residual checks; identifying a particular faulty channel and authenticating a sender require additional information. The current solver processes samples directly and stops immediately on invalid Sample, expiry or a closed gate, using the original invalidation time.

## Five-field production chain

RawP uses FX-only internal declarations. The root measurement's MA Expression Parameters declare public P0–P3/Sample as local unsynced Floats. Contacts can write Animator parameters; client OSC configuration determines the exported values, which can be checked individually in the client. [OSC parameters](https://docs.vrchat.com/docs/osc-avatar-parameters)

Every approximately 50 ms, active states copy four P values before setting `Sample=n/32` (n=1…32). Binary floats represent these values exactly. Zero is reserved for disabled/rejected states; a 1.6-s cycle exceeds the 1250-ms liveness window, reducing binary-counter aliasing. Desktop uses content-change time: stationary P values may cache, and an identical Sample retains its original change time. Sample reflects continued producer Animator activity. Contact refresh, four-channel synchronization and UDP loss need separate client checks.

Builds require positive uniform root scale and check ScaleConstraints and known scale animation targeting the Avatar root. Internal FX IsLocal/ScaleFactor/selection guards keep `2*authoredRootScale*ScaleFactor` within approximately 2.999 m, disabling Contacts and clearing values on invalidity. The dedicated marker follows the selected center, with its size determined by Avatar-root scale. Each root uses its own fixed measurement group and reconstructs the configured own target.

Five fields describe each SPS root's measurement output. Automatic Exclusive separately exposes menu control `Sensa/Select/<group>`: an unsynced, unsaved local Int with explicit default 0, where 0 is Off and 1…N select ordered targets. Out-of-range values stay or return Off. This parameter selects the measurement target and may be exported over OSC according to configuration. Dedicated creates a separate measurement group for each target and omits this automatic selector. Independent shader authoring uses the 0/1 control `Sensa/Select/ShaderCapture_<id>`.

## Scope of existing evidence

Earlier Unity nographics EditMode runs checked authoring, P0–P3/Sample, internal RawP versus final Expression Parameters, NDMF, geometry, scale/selection guards, unknown-policy rejection and independent experiment regressions. Reports such as ignored `artifacts/verification/sps-five-fields-editmode.xml` belong to those original revisions and may not exist in a new checkout; cite them with their original report and commit. The current radius-2 geometry and builder changes still need the corresponding Unity Editor checks and real-client measurements. Current CI units, E2E and native mock checks cover their respective math, contracts and simulated transport; GPU pixel output needs separate verification. Read exact counts/versions in each actual report and associated commit.

Generator contracts also check retained .meta identity, prefab author type and explicit Target. AvatarLab uses Exclusive/Dedicated while independent experiments retain their labels. After tool or documentation changes, run scene acceptance against the actual generated objects.

Client and hardware measurements remain pending for uploaded Contact error distributions, sampling timing, constraints/FX, actual OSC, GPU/HMD and device behavior. Save root trajectories, scale, packet ages/loss, model residuals and actual error against known trajectories so consistency and positioning accuracy can be assessed separately. [Verification](development.en.md)
