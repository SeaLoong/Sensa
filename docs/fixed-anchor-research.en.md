# SPS four-anchor tracking: evidence and tradeoffs

[简体中文](fixed-anchor-research.md) | **English**

This research asks why four distances locate a root, why the receiver radius is 2 m with anchor offsets of ±0.35 m along each axis, and what the producer actually proves about sampling. The implementation uses a fixed Avatar-root frame, a selected dedicated marker and `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`. It does not infer a point from arbitrary proximity values.

Use [routes](usage-scenarios.en.md) for setup, [positioning](positioning.en.md) for reception gates and the [dictionary](osc-parameters.en.md) for fields. This page retains pinned sources, derivations and unmeasured assumptions rather than presenting model analysis as client accuracy.

## Primary evidence

The [Contact reference](https://creators.vrchat.com/common-components/contacts/) describes closest-point proximity, nearest-sender aggregation and a 3-m post-scaling radius cap. It does not publish the linear equation. We inspected installed SDK 3.10.5 ContactManager/CollisionScene; the inspection copy matches the package VRC.Dynamics.dll SHA-256:

`672093e0c2a52a035979f1ff66478389949f42ffcf7daba5edd8b8da718629a3`

For two spheres, the implementation implies:

```text
p = 1-clamp(max(0,d-r)/R,0,1)
d = R(1-p)+r    # only outside saturation
```

Sender radius must be known; a length sphere is not a point. Root placement follows author-local geometry from pinned VRCFury [Socket](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs)/[Plug bakers](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs). Sensa adds its own radius-0.001 sphere and unique tag rather than reusing senders with different purposes.

## Four-point algebra

[SensaFixedAnchorProtocol.cs](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs) defines center c=(0,1,0), h=0.35 and P0–P3:

```text
(-.35,.65,-.35), (.35,.65,.35), (.35,1.35,-.35), (-.35,1.35,.35)
```

Three anchor differences from P0 have nonzero determinant 0.686. Squared-distance differences produce three independent equations:

```text
2(aᵢ-a₀)·position = |aᵢ|²-|a₀|²+d₀²-dᵢ²
```

Tetrahedral symmetry also gives `q=-Σ((aᵢ-c)dᵢ²)/(8h²)`, with position c+q. All center distances equal √3×0.35≈0.606218; at R=2 and r=.001, ideal proximity is approximately 0.697391109. The solver checks four-sphere residuals, coverage and bounds; saturated endpoints cannot be inverted as exact ranges.

Common rigid movement preserves distances. Common uniform scale cancels in `(s*d-s*r)/(s*R)`, yielding AvatarRootLocal rather than world coordinates. Nonuniform scale or the SDK 3-m clamp breaks that cancellation.

## Why use R=2 and h=0.35?

R is the radius of one receiver sphere; h is an anchor's offset from the layout center along each coordinate axis. These are independent dimensions. Current R=2 m and h=0.35 m give an anchor-to-center distance of √3h≈0.606 m and anchor-to-anchor distance of 2√2h≈0.990 m. The [dimension guide](positioning.en.md) distinguishes these distances from usable coverage.

Four anchors form a noncoplanar layout. At a fixed receiver radius, bringing them closer increases common coverage while affecting conditioning away from the center. The selected 2 m radius balances coverage and SDK scaling headroom. The implementation keeps one shared geometry; arbitrary author-only radius changes would make desktop decoding incorrect.

For a marker radius r=.001 and strict .001<p<.999, valid center distance lies between .003 and 1.999. The common region is the intersection of those four distance shells, clipped by the ±2 coordinate box. Its outer bounds contain a centered ball of radius `1.999−√3×.35≈1.392782`; small saturated holes near anchors remain excluded. This describes spatial coverage, not a guarantee that sampling and scale checks pass.

| Receiver radius, same h=.35 | Centered outer-bound radius | Approximate uniform scale headroom at authored scale 1 |
| --- | --- | --- |
| 1 m | 0.394 m | 2.999× |
| 2 m, selected | 1.393 m | 1.4995× |

The 1-m value illustrates the tradeoff, rather than an exposed protocol preset. Compared with that 1-m example, the 2-m choice gives much more common coverage. It is not a mathematically proven optimum for every Avatar or movement path.

Let range Jacobian rows be `Jᵢ=(position-aᵢ)/dᵢ`. At the center, `JᵀJ=(4/3)I`, so the 2-norm condition number is 1. Assuming independent equal-variance proximity noise σp, first-order center propagation gives per-axis standard deviation `sqrt(3)Rσp/2`, approximately `1.732σp` at current R=2. This is a model estimate rather than measured precision. Closer anchors can worsen conditioning away from the center, so client measurements should include intended trajectories rather than only the center.

The 0.01 residual threshold detects inconsistency, rather than bounding actual error. Four constraints lack enough redundancy to reliably identify every bad channel or authenticate a sender. No filter is added: invalid Sample, expiry and gating must stop immediately, without smoothing their effect.

## Five-field production chain

RawP exists only in the actual FX Animator, absent from MA Expression Parameters. Public P0–P3/Sample are local unsynced Floats. Contacts can write Animator parameters, while client OSC configuration determines export; “internal” is not a privacy guarantee. [OSC parameters](https://docs.vrchat.com/docs/osc-avatar-parameters)

Every approximately 50 ms, active states copy four P values before setting `Sample=n/32` (n=1…32). Binary floats represent these values exactly. Zero is reserved for disabled/rejected states; a 1.6-s cycle exceeds the 1250-ms liveness window, reducing binary-counter aliasing. Desktop uses content-change time, so repeated identical counters cannot renew freshness while unchanged P values can remain cached. The counter proves neither atomicity, physical Contact freshness nor lossless UDP.

Builds reject nonpositive/nonuniform root scale, root ScaleConstraint and known root-scale animation. Internal FX IsLocal/ScaleFactor/selection guards keep `2*authoredRootScale*ScaleFactor` within approximately 2.999 m, disabling Contacts and clearing values on invalidity. The dedicated marker follows the selected center without inheriting bone scale. No shared moving array or remote-data upgrade route remains.

Five fields do not describe the Avatar's entire Expression Parameter count. Automatic Exclusive separately exposes menu control `Sensa/Select/<group>`: an unsynced, unsaved local Int with explicit default 0, where 0 is Off and 1…N select ordered targets. Out-of-range values stay or return Off. OSC may export this control according to configuration; it is not a measurement. Dedicated does not generate that automatic selector. Independent shader authoring also uses the 0/1 control `Sensa/Select/ShaderCapture_<id>`.

## Scope of existing evidence

Earlier Unity nographics EditMode runs checked authoring, P0–P3/Sample, internal RawP versus final Expression Parameters, NDMF, geometry, scale/selection guards, unknown-policy rejection and independent experiment regressions. Reports such as ignored `artifacts/verification/sps-five-fields-editmode.xml` belong to those original revisions and may not exist in a new checkout. They do not validate the current 2 m geometry. Current CI runs units, E2E and native mock checks; arrange Editor inspection and real-client measurement separately after changing Unity builders. Isolated checks cover their own math/contracts, and successful shader import is not GPU pixel output. Read exact counts/versions in each actual report and associated commit.

Generator contracts also check retained .meta identity, prefab author type and explicit Target. AvatarLab uses Exclusive/Dedicated while independent experiments retain their labels; tool dead-code/docs cleanup is not complete scene acceptance.

These checks do not establish uploaded Contact error distributions, sampling timing, constraints/FX, actual OSC, GPU/HMD or hardware behavior. Future measurements should retain root trajectories, scale, packet ages/loss and error, without substituting low residual for measured accuracy. [Verification](development.en.md)
