# Four fixed SPS points: derivation, tradeoffs and evidence

[简体中文](fixed-anchor-research.md) | **English**

Sensa SPS uses a fixed Avatar-root frame, four known anchors and one explicitly selected dedicated root marker. Its per-object public measurement contract is `Sensa/SPS/<id>/P0…P3` plus `Sample`, without version segments, redundant metadata, remote groups or old-data compatibility. Independent Point/Handle/Pose experiments are separate models.

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

[SensaFixedAnchorProtocol.cs](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs) defines center c=(0,1,0), h=0.5 and P0–P3:

```text
(-.5,.5,-.5), (.5,.5,.5), (.5,1.5,-.5), (-.5,1.5,.5)
```

Three anchor differences from P0 have nonzero determinant 2. Squared-distance differences produce three independent equations:

```text
2(aᵢ-a₀)·position = |aᵢ|²-|a₀|²+d₀²-dᵢ²
```

Tetrahedral symmetry also gives `q=-Σ((aᵢ-c)dᵢ²)/(8h²)`, with position c+q. All center distances equal sqrt(0.75); at R=2.5 and r=.001, ideal proximity is approximately 0.653989838. The solver checks four-sphere residuals, coverage and bounds; saturated endpoints cannot be inverted as exact ranges.

Common rigid movement preserves distances. Common uniform scale cancels in `(s*d-s*r)/(s*R)`, yielding AvatarRootLocal rather than world coordinates. Nonuniform scale or the SDK 3-m clamp breaks that cancellation.

## Why retain R=2.5 and h=0.5

This is model analysis, not measured client accuracy. Let range Jacobian rows be `Jᵢ=(position-aᵢ)/dᵢ`. At the center, `JᵀJ=(4/3)I`, giving 2-norm condition number 1. Assuming independent equal-variance proximity noise σp, first-order propagation through the current closed-form solver gives per-axis standard deviation `sqrt(3)Rσp/2`. Larger R amplifies the same numeric noise rather than necessarily improving precision.

| Z offset 1.5 from center | Farthest range | Range Jacobian condition number |
| --- | --- | --- |
| h=0.5 | 2.121320 | 3.741657 |
| h=0.75 | 2.487469 | 2.516611 |

Wider anchors improve conditioning at this off-center point but nearly consume R=2.5 coverage. R=2.0 reduces numeric noise amplification yet cannot cover that point with h=0.5. Moving R toward 3 reduces Avatar-scaling headroom. Without measured root trajectories, noise and scale distributions, none is demonstrably better overall; keep current geometry.

Usable volume is the unsaturated four-sphere intersection, not the whole ±1.5 per-axis cube. A marker too near an anchor also saturates and is rejected. The 0.01 residual threshold detects inconsistency rather than bounding position error. Four constraints lack sufficient redundancy to reliably identify an arbitrary bad channel or authenticate senders.

No filter is added. Future measurements should separate jitter, conditioning and latency, filtering position only after validation. Sample=0, expiry and gates must stop immediately rather than being smoothed.

## Five-field production chain

RawP exists only in the actual FX Animator, absent from MA Expression Parameters. Public P0–P3/Sample are local unsynced Floats. Contacts can write Animator parameters, while client OSC configuration determines export; “internal” is not a privacy guarantee. [OSC parameters](https://docs.vrchat.com/docs/osc-avatar-parameters)

Every approximately 50 ms, active states copy four P values before setting `Sample=n/32` (n=1…32). Binary floats represent these values exactly. Zero is reserved for disabled/rejected states; a 1.6-s cycle exceeds the 1250-ms liveness window, reducing binary-counter aliasing. Desktop uses content-change time, so repeated identical counters cannot renew freshness while unchanged P values can remain cached. The counter proves neither atomicity, physical Contact freshness nor lossless UDP.

Builds reject nonpositive/nonuniform root scale, root ScaleConstraint and known root-scale animation. Internal FX IsLocal/ScaleFactor/selection guards keep `2.5*authoredRootScale*ScaleFactor` within approximately 2.999 m, disabling Contacts and clearing values on invalidity. The dedicated marker follows the selected center without inheriting bone scale. No shared moving array or remote-data upgrade route remains.

Five fields do not describe the Avatar's entire Expression Parameter count. Automatic Exclusive separately exposes menu control `Sensa/Select/<group>`: an unsynced, unsaved local Int with explicit default 0, where 0 is Off and 1…N select ordered targets. Out-of-range values stay or return Off. OSC may export this control according to configuration; it is not a measurement. Dedicated does not generate that automatic selector. Independent shader authoring also uses the 0/1 control `Sensa/Select/ShaderCapture_<id>`.

## Current evidence and limits

The frozen package passed **65/65 tests, zero failures/skips**, in real Unity 2022.3.22f1 nographics EditMode, reported at ignored `artifacts/verification/sps-five-fields-editmode.xml`. Coverage includes P0–P3/Sample, writable RawP absent from final Expression Parameters, NDMF, geometry, scale boundaries, selection, unknown-policy rejection, independent Point/Pose and native shader authoring. Generated shaders imported without compilation errors; actual GPU output was not verified.

An isolated generator test checks retained .meta identity, the current prefab author and explicit Target. AvatarLab variants are Exclusive/Dedicated; independent experiment labels remain unchanged. Subsequent tool dead-branch/documentation cleanup received editing/static checks only, not complete AvatarLab-project or scene acceptance.

No local E2E, full-process smoke, screenshots, PlayMode or device tests ran. Actual Contact precision, sampling order, uploaded constraints/FX, OSC, GPU/HMD and hardware require separate acceptance. [Positioning contract](positioning.en.md)
