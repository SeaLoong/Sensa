# Root positioning: fixed geometry, coordinates and validity

[简体中文](positioning.md) | **English**

Sensa SPS measures the **selected Socket/Plug root center in AvatarRootLocal**. A dedicated marker follows the resolved authoring position; four receivers stay under the Avatar root. Raw OGB proximity, three-marker experiments and this dedicated protocol are distinct inputs. [Three real routes](usage-scenarios.en.md)

## Recovering a point from four ranges

True distances from four known noncoplanar anchors to **one point** determine relative XYZ. The tetrahedron has center `c=(0,1,0)` and half-span `h=.5`:

| Index | Fixed anchor aᵢ |
| --- | --- |
| A0 | (-0.5, 0.5, -0.5) |
| A1 | (0.5, 0.5, 0.5) |
| A2 | (0.5, 1.5, -0.5) |
| A3 | (-0.5, 1.5, 0.5) |

For unsaturated proximity `pᵢ`, receiver radius `R=2.5` and dedicated sender radius `r=.001`, center range is `dᵢ=R(1-pᵢ)+r`. With `bᵢ=aᵢ-c`:

```text
q = -Σ(bᵢ × dᵢ²) / (8h²)
position = c + q
residual = sqrt(Σ(|position-aᵢ|-dᵢ)² / 4)
```

Unity and desktop directly share [SensaFixedAnchorProtocol](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs), avoiding independently drifting geometry settings. Acceptance also requires unsaturated samples, common coverage, local bounds and the residual threshold. The .01 fit threshold is not an accuracy guarantee. [Desktop solver](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedAnchorReconstruction.cs)

## Coverage, scale and units

- Coverage is the intersection of four radius-2.5 spheres. The ±1.5 local boundary limits reconstruction/display; it is not a completely covered cube.
- VRChat caps scaled Contact world radius at 3 m. Authoring rejects initial excess/nonuniform scale. FX checks actual `ScaleFactor` and authored root scale, disabling Contacts, clearing samples and setting Valid false before clamping. [Official Contacts](https://creators.vrchat.com/common-components/contacts/)
- Under uniform, unclamped common scale, the factor cancels in proximity ratios. Results are authored Avatar-root local units, not world meters or device centimeters. Global Avatar translation/rotation is not recoverable.
- The UI labels new roots and Shader coordinates as local units. Real endpoint calibration maps them to output; raw local Z is not unconditional mechanical travel.

## Dedicated root producer

Each target has an independent collision channel, checked for another local sender at build time. The small sphere sits in the Avatar-root bank and follows the selected root through ParentConstraint, avoiding inherited target-bone scaling of its known radius. Generic TPS tags and ordinary 1 cm SPS spheres do not impersonate the dedicated marker.

Dedicated/Exclusive automatic authoring creates fixed groups for both Sockets and Plugs. A default Self group uses five Contacts; remote diagnostics add four receivers. Others always have Valid false because peers, scales and shared channels can mix. An ordinary older Avatar does not automatically produce this protocol.

```text
Sensa/SpsRoot/v1/<id>/Self/Root/A0 ... A3
Sensa/SpsRoot/v1/<id>/Self/Profile = 1
Sensa/SpsRoot/v1/<id>/Self/Valid
Sensa/SpsRoot/v1/<id>/Self/Scale
Sensa/SpsRoot/v1/<id>/Self/Heartbeat
```

Metadata belongs at Self level; only A0–A3/RawA0–RawA3 are under Root. Old eight-range root data without the new profile is invalid rather than guessed into compatible coordinates.

## Stationary values, time and stopping

Every .05 s, FX copies four internal RawA parameters to public A values, then writes metadata. Heartbeat is a 32-step normalized counter with a 1.6 s cycle, longer than its 1250 ms maximum age, reducing binary-counter sampling aliasing. Desktop uses **content-change time**: rereading or forwarding an unchanged heartbeat never renews it.

Stationary ranges can be cached under dedicated-producer validity and liveness. This avoids unavoidable delta-only expiry while retaining limits around lost range updates or independently frozen sensors. Animation liveness is not Contact frame coherence, and ordinary Avatar OSC does not guarantee an atomic four-range commit. A 30 ms coalescing window reduces transitional mixtures without turning low residual into identity authentication.

Older Point/Handle/Pose still use the oldest contributing update, normally one second. Fixed roots use changing heartbeats; Shader roots use changing Frame content. A positive input timeout can be stricter. Experimental permission, one target/source, a valid profile and input permission are all required. Emergency stop has separate latching semantics.

## Shader root coordinates

Native components encode current AvatarRootLocal XYZ, producer ID, coordinate profile, Frame and CRC. The desktop bridge reads an explicit region; no custom Avatar C# runs. It validates identity, RGB/CRC, progressing frames and recovery before sending an ordered seven-field OSC bundle.

Desktop intake requires Profile 1, a matching nonzero ID, bounded coordinates, consecutive fields within one source and a Frame changed within 500 ms. Source-local ordering avoids false stops caused by other sources; it is not cryptographic identity. Profile 0 model/synthetic diagnostics are preview only. Actual multi-Avatar rendering isolation and ID collisions still need client acceptance. [Shader guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md)

## Remaining observability limits

One root gives no tip, orientation, roll, deformed surface or exact insertion fraction. Unconstrained ordinary Contact senders can produce low-residual ghosts; more receivers cannot replace identity. Fixed anchors remove the moving-anchor layout error and dedicated Self markers narrow the target model, without making every old SPS/world scene a reliable global tracker.

[Research and counterexamples](fixed-anchor-research.en.md) retain SDK evidence and actual authoring-test scope. EditMode/shader import, isolated model contracts and simulated CI outputs do not replace upload, actual Contacts/OSC, desktop/HMD composition, ground-truth error or hardware acceptance.
