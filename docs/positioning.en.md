# Sensa SPS roots: four P values and Sample

[简体中文](positioning.md) | **English**

Sensa SPS measures your selected Socket/Plug root in **AvatarRootLocal**. Four fixed receivers and a dedicated sphere share Avatar-root scale. Coordinates are not world motion, device feedback or GPU-deformed surfaces. Only the current five-field contract is accepted, without reading, converting or falling back to older Sensa SPS data. [Usage scenarios](usage-scenarios.en.md)

## Per-object measurement contract

```text
Sensa/SPS/<id>/P0
Sensa/SPS/<id>/P1
Sensa/SPS/<id>/P2
Sensa/SPS/<id>/P3
Sensa/SPS/<id>/Sample
```

P0–P3 are Float Proximity values. Sample=0 means disabled or rejected by internal guards. Active n/32 values (n=1…32) advance approximately every 0.05 seconds, cycling in 1.6 seconds. Activity alone does not validate geometry: four finite, unsaturated ranges must also pass bounds and fit checks.

Contacts write internal RawP values. At each FX state entry, four P values are copied before Sample is set. RawP is FX-only, absent from Modular Avatar Expression Parameters. NDMF contracts verify writable Contact parameters while exporting only five measurement fields. This is not a client OSC privacy guarantee. [Authoring](../unity/top.sealoong.sensa/AUTOMATION.en.md)

## Menu controls are not measurements

“Five fields” limits each object's measurement contract, not the Avatar's entire Expression Parameter list. Automatic Exclusive separately registers `Sensa/Select/<group>`: an unsynced, unsaved local Int with explicit default 0. Zero is Off; 1…N select ordered targets; out-of-range values stay or return Off. It is a menu control and may be exported through OSC according to client configuration. Dedicated does not generate this automatic selector. Independent shader authoring also has the 0/1 control `Sensa/Select/ShaderCapture_<id>`. Menu selection does not enable desktop input or connect devices.

## Recovering one point from four ranges

Shared geometry lives in [SensaFixedAnchorProtocol](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs), centered on c=(0,1,0), with h=0.5:

| Point | Fixed anchor aᵢ |
| --- | --- |
| P0 | (-0.5, 0.5, -0.5) |
| P1 | (0.5, 0.5, 0.5) |
| P2 | (0.5, 1.5, -0.5) |
| P3 | (-0.5, 1.5, 0.5) |

For known receiver radius R=2.5 and dedicated sender radius r=0.001, outside saturation:

```text
dᵢ = R(1-pᵢ) + r
bᵢ = aᵢ-c
q = -Σ(bᵢ × dᵢ²)/(8h²)
position = c+q
residual = sqrt(Σ(|position-aᵢ|-dᵢ)²/4)
```

Four known noncoplanar anchors and distances to one known-radius marker determine XYZ. Zero/full proximity provides bounds or containment, not ordinary distances. The 0.01 residual threshold checks model consistency, not accuracy. [Solver](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedAnchorReconstruction.cs)

## Coverage, scale and retaining the current radius

Coverage is the four-sphere intersection, further restricted by saturation and numeric bounds. The ±1.5 per-axis display/solver bounds do not guarantee the whole cube. At offset (0,0,1.5) from the center, the farthest range is approximately 2.121: R=2.5 covers it, while R=2.0 cannot.

Smaller R improves distance error for a given proximity error but shrinks coverage. Wider anchors improve conditioning away from the center but also shrink common coverage. The range Jacobian has condition number 1 at the center. At that Z offset, h=0.5 gives approximately 3.742; h=0.75 improves it to 2.517 but increases the farthest range to 2.487, nearly exhausting R=2.5. Keep R=2.5, h=0.5 and r=0.001 without claiming a local tradeoff is a global optimum. [Derivation](fixed-anchor-research.en.md)

Before clamping, common uniform scale s cancels:

```text
p = 1-(s*d-s*r)/(s*R) = 1-(d-r)/R
```

Coordinates therefore use authored-root units, equal to world meters only at s=1. VRChat caps world radius at 3 m. Builds reject nonpositive/nonuniform root scale, root ScaleConstraint and root-scale animation; internal ScaleFactor guards keep supported radius within approximately 2.999 m. Invalid guards disable Contacts and clear P/Sample. Removing public Scale does not remove that validation. [Contacts reference](https://creators.vrchat.com/common-components/contacts/)

## Target, time and stopping

Each target has its own collision channel and local sphere, accepted only from yourself. ParentConstraint follows the explicit center without inheriting target-bone scale. Dedicated permits independent simultaneous observations; Exclusive selects one target and starts Off. There is no remote receiver group or shared moving root array.

Desktop groups one source and instance, checking legal Sample **content-change time**. Unchanged P values can remain cached; resending an unchanged Sample does not renew freshness. Protocol age is capped at 1250 ms; a positive input timeout can be stricter. Missing fields, Sample=0, expiry, saturation or inconsistent geometry block/stop output. Experimental permission and input activation remain separate actions.

Writing Sample last is not atomic OSC delivery. Timing, loss and reordering can mix samples, and the counter does not certify physical Contact freshness. Independent Point/Handle/Pose experiments retain oldest-contributing-channel age rather than this caching rule.

No unmeasured jitter filter is added. A future position filter should validate raw samples first, measure error/latency separately, and stop immediately on Sample=0, expiry or gates. Invalidity must not be smoothed away.

## Independent shader roots

The shader path encodes the selected CPU root in AvatarRootLocal. `Sensa/Shader/<id>` exposes Frame, X, Y, Z and Valid; producer identity remains in the encoded pixels/address. An explicit-region bridge verifies RGB/CRC, identity, frame progress and recovery before sending one bundle in that order. Desktop requires consecutive same-source fields and a changing Frame within 500 ms. Fit residual shows “—”: this route performs no four-sphere distance fit.

Synthetic/model images use a separate non-mappable diagnostic namespace. CRC and producer IDs do not authenticate owners. Camera visibility, mixed Avatars and desktop/HMD composition require actual client acceptance. [Shader guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md)

## Limits of one point

A root supplies no tip, orientation, twist, precise insertion proportion or final mesh. Common Avatar translation/rotation leaves relative distances unchanged. Dedicated markers reduce ambiguity without authenticating identity. Two-endpoint calibration defines mappings, not missing observations.

Unit, EditMode and CI protocol simulations have distinct scopes and do not replace uploaded-client Contacts/OSC, GPU or hardware acceptance. [Research evidence](fixed-anchor-research.en.md) · [Feature reference](features.en.md)
