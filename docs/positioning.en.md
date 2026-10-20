# Positioning: what is observable and when to stop

[简体中文](positioning.md) | **English**

Distances from four known non-coplanar anchors to **one point** determine local XYZ. Four is not inherently insufficient. Ordinary Contact values may instead lack a known common target, reference frame or sampling instant. Sensa therefore separates fixed roots, Shader and legacy paired experiments; spatial motion defaults off.

| Route | Meaning | Validity evidence |
| --- | --- | --- |
| Sensa SPS | Your selected root center in AvatarRootLocal | Dedicated marker, known anchors, consistent geometry, changing Sample |
| Shader | Encoded root center in AvatarRootLocal | Binary/ROI checks, ordered coordinate packet, changing Frame |
| Independent Point/Handle/Pose | Estimate in its own reference frame | Oldest participant and geometry/grab checks; not upgraded into fixed SPS |
| OGB Root/Tip | Radial proximity ratio | Same-instance pair/learned length, not XYZ |

One point supplies no orientation, world motion, tip or final GPU surface. Commands are not device feedback. [Routes](usage-scenarios.en.md) · [Interactive model](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US)

## Fixed SPS geometry

The Avatar root is the reference; c=(0,1,0), h=.5:

| Anchor | Coordinates |
| --- | --- |
| P0 | (-.5,.5,-.5) |
| P1 | (.5,.5,.5) |
| P2 | (.5,1.5,-.5) |
| P3 | (-.5,1.5,.5) |

Receivers have R=2.5. A dedicated r=.001 marker follows the selected actual root center. Outside saturation:

```text
p = clamp(1 - max(0,d-r)/R, 0, 1)
d = R(1-p)+r
q = -Σ((aᵢ-c)dᵢ²)/(8h²)
position = c+q
```

Omitting r confuses surface and center distance. Reception requires strict .001<p<.999, RMS distance residual≤.01, X/Z=[−1.5,1.5] and Y=[−.5,2.5]. Residual measures model consistency, not accuracy or identity. [Shared geometry](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs) · [Solver](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedAnchorReconstruction.cs)

Coverage is the four-ball intersection minus saturation/threshold boundaries, **not the whole displayed cube**. Saturation holes also exist near anchors. Increasing R amplifies the same proximity noise and reduces scale headroom rather than offering a free improvement. [Derivation/tradeoffs](fixed-anchor-research.en.md)

## Five fields and activity

Each object has only `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}` measurement Floats. RawP stays in FX. Sampling states copy P values before writing Sample. Zero is inactive/invalid; active states nominally cycle through n/32, n=1…32, every 50 ms, for a 1.6-second cycle.

Stationary P values may cache; **Sample content must change**. Repeating a value updates reception but not ChangedAt. Runtime defaults to 1000 ms; a positive InputTimeoutMs replaces this, still capped at 1250 ms by the decoder. Missing/illegal/zero/frozen/expired samples or inconsistent geometry invalidate. This is not proof of exact 20 Hz, atomic Contact frames or a physically updating sensor.

There are no old v1, Root/SharedRoot, A0–A3 or Profile/Scale/Valid/Heartbeat aliases. Independent Point/Pose cannot fill missing fields. Five measurements per object do not mean five Avatar parameters overall: Exclusive may add local Int `Sensa/Select/<group>`, default 0=Off. It is a control, potentially visible over OSC.

## Scale and reference frame

A shared rigid transform preserves distances; uniform shared scale cancels in the ratio. Local units equal world meters only when authored/runtime scales are both one. The marker does not inherit target-bone scale. Builds reject nonpositive/nonuniform root scale, root ScaleConstraint and known root scaling animation.

The SDK world Contact radius limit is 3 m. FX uses IsLocal/ScaleFactor to disable and clear before `2.5×authorScale×ScaleFactor` exceeds about 2.999 m. Guards do not eliminate all client timing risks or authenticate against matching malicious tags. [Official Contacts](https://creators.vrchat.com/common-components/contacts/)

## Shader roots

A native skinned point and one Camera encode the chosen root Transform. The cube matches fixed SPS, but there is **no Contact trigger radius**. The bridge locks an explicit ROI/nonzero ID, verifies internal format, coordinate flags, CRC and modulo-65536 forward frames. Default freeze is 350 ms; startup/recovery requires two advancing frames.

One valid OSC bundle sends `Sensa/Shader/<id>/{Frame,X,Y,Z,Valid}`, with Valid=1 last. Invalidity sends only Valid=0. Desktop checks same-source contiguous sequences, finite bounded XYZ, integer Frame and change age≤500 ms, or a shorter positive timeout. The desktop limit does not mean the normal bridge stays valid between 350 and 500 ms.

Producer is in the path and Profile is fixed by the namespace; neither repeats publicly. Binary ID/coordinate flags/CRC/Frame remain necessary. `Sensa/Diagnostics/Shader/0` creates no point. Advancing encoded pixels do not prove a fresh final mesh or another Shader's global texture. [Research](shader-capture-research.en.md) · [Setup](../unity/top.sealoong.sensa/GPU-TRACKING.en.md)

## Legacy Point/Handle/Pose

These remain experiments in ReferenceLocal and cannot be mixed with the fixed frame. All participating channels use their oldest timestamp, default 1000 ms or positive input timeout, including Handle grab. Another target's fresh data must not renew an ambiguous/selected target. Low residual still proves neither shared Sender nor atomic sampling.

Three markers can construct a local pose; without an external reference they cannot observe common world motion. Closest-Sender selection especially undermines the assumption that every channel observes one point. Interpolation/smoothing must not hide invalidity.

## From observation to output

Fix object/source, capture X/Y/Z/distance endpoints, inspect preview, replace the draft and save. Saving disarms. Then separately allow experimental spatial input and activate actual OSC. Seeing values, calibration or clearing stop grants no permission.

Invalidity stops without stale same-axis fallback. Accuracy, latency and stop behavior need real-client measurement. EditMode, simulated packets and browser images do not establish uploads, Contacts/OSC, desktop/HMD capture or mechanisms. [Dictionary](osc-parameters.en.md) · [Guide](guide.en.md)
