# Three actual integration routes

[简体中文](usage-scenarios.md) | **English**

SPS haptics uses OGB parameters; Socket and Plug are two sides of the same system. Sensa offers existing-parameter intake, fixed-anchor positioning and encoded-image capture. The [parameter and radius reference](osc-parameters.en.md) explains fields, units and activation ranges. Synthetic steps remain internal regression fixtures, not user routes.

| Route | Requirements | Data and effect | Current limits |
| --- | --- | --- | --- |
| OGB / SPS | An avatar actually publishing haptics parameters | Modern Root/Tip or legacy proximity drives depth; touch drives vibration | Radial/proximity estimates, not exact XYZ or axial insertion depth |
| Sensa SPS | A buildable PC avatar with an explicitly selected Socket/Plug root | Fixed P0–P3 plus a dedicated marker reconstruct AvatarRootLocal coordinates for axis calibration | Own roots only; coverage, scale and non-atomic OSC constraints |
| Shader capture | A generated encoder and an actually capturable desktop grid | Root coordinates → ID/CRC/frame grid → selected-region decoding → calibration | PC experiment; hidden layers need not be desktop-visible; client/HMD acceptance remains open |

These routes produce device commands, not device-position feedback. Outputs use TCode serial/UDP/TCP or Intiface features; a connected service does not prove physical execution.

## 1. OGB / SPS: existing parameters

Apply OSC input mode, confirm the listener and actual source, and observe `OGB/Orf/...`, `OGB/Pen/...` or independent `VFH/Zone/Touch/...` paths.

- Explicitly enable the OGB activation heartbeat in receiver settings. Its target is **VRChat's receiver**, commonly `127.0.0.1:9000`; Sensa listens on 9001 by default. It sends true every five seconds and attempts false on leaving OSC/stopping. It defaults off, grants no device permission and has no UDP acknowledgment.
- OGB / SPS depth prefers modern pairs from one source, full instance and Self/Others party. Missing companions or unlearned length yield zero. Both modern values zero/absent permit legacy fallback. Plug values are not universally inverted.
- OGB / SPS vibration uses Touch/Frot with required Close gates. Independent VFH Touch Zones are direct and need no invented Close.
- Pin the actual object/source, verify range and direction, save, then activate input. Avatar/mapping changes and reactivation clear learned modern length.
- NewTip is a root-centered length sphere, not a tip marker. Offset, rotation, multiple Senders and runtime scaling constrain estimates; names cannot establish real coordinates.

Official OGB v1 already had Root/Tip and legacy fallback. Application-version labels cannot reliably divide single/paired detectors. [Full fields and generator radii](ogb-compatibility.en.md) · [Three presets](presets.en.md)

## 2. Sensa SPS: four fixed anchors

Add **Sensa → Fixed SPS Root Probe** and select an actual Socket/Plug, Sensa Component or supported native Contact root. A dedicated radius-0.001 marker follows that root; four radius-2.5 receivers remain under the avatar root.

| Anchor | AvatarRootLocal |
| --- | --- |
| P0 | (-0.5, 0.5, -0.5) |
| P1 | (0.5, 0.5, 0.5) |
| P2 | (0.5, 1.5, -0.5) |
| P3 | (-0.5, 1.5, 0.5) |

The per-object measurement paths are:

```text
Sensa/SPS/<object>/P0
Sensa/SPS/<object>/P1
Sensa/SPS/<object>/P2
Sensa/SPS/<object>/P3
Sensa/SPS/<object>/Sample
```

P0–P3 are proximities, not XYZ. Unsaturated centre distance is `d=2.5×(1−p)+0.001`. Sample=0 means inactive/invalid; active states cycle 1/32…1 every 50 ms, combining validity and liveness. Repeating a counter value does not renew it. Profile, Scale, Valid, Heartbeat and Self/Others path layers are removed, with no old eight-range or version-path aliases.

1. Pin the target/source in the parameter page and open the root panel.
2. Select X/Y/Z/distance, capture actual 0%/100% endpoints, preview, replace the draft and save.
3. Explicitly permit experimental spatial input, then activate. Sample=0, freezing/expiry, missing samples or inconsistent geometry blocks and stops input.

Unity and desktop share geometry; ScaleFactor/IsLocal guard validity inside FX. RawP is FX-only rather than a public expression parameter. Optional local menu Int controls at `Sensa/Select/<group>` are outside these five measurement fields and may still be exported by OSC. Only dedicated roots on the local avatar are measured; Automatic SPS Setup retains Dedicated/Exclusive policies.

Radii use authored local units. The valid volume is the intersection of four spheres, with an SDK world-radius cap of 3 m. Authoring/runtime scale guards disable before clamping; nonuniform or custom animated root scale is rejected. One point supplies no orientation, tip, surface or exact insertion ratio, and Sample proves no atomic Contact frame. [Positioning and coverage](positioning.en.md) · [Installation](../unity/top.sealoong.sensa/README.en.md) · [Design evidence](fixed-anchor-research.en.md)

## 3. Shader: root encoding and explicit region capture

Add **Sensa → Shader Root Capture (Experimental)**, select the actual Socket/Plug root and assign a nonzero producer ID. The builder generates a native skinned point, one None-eye Camera and encoding Shader, initially off in a local menu. No custom avatar readback C# runs.

1. Enable the code in the actual client and confirm a visible desktop grid.
2. Explicitly select physical-pixel bounds and producer ID. Check decode-only first, then save registration and explicitly choose the OSC port.
3. The bridge checks black/white thresholds, CRC, ID, coordinate mode and advancing frames. Freezing, old frames or wrong regions send only Valid=0; recovery requires two advancing frames.
4. Native packets use `Sensa/Shader/<nonzero-ID>`, ordered `Frame, X, Y, Z, Valid` inside one bundle, with Valid=1 committed last. Invalidity sends Valid=0 alone.
5. Calibrate in the same root panel and explicitly permit experimental spatial input.

The path already identifies the producer, so OSC Producer/Profile are removed. Binary identity, coordinate-mode bit, CRC and frame counter remain. Desktop validates five consecutive same-source fields, bounds and changing-Frame age; the bridge owns modulo-forward/recovery checks. Diagnostic grids use `Sensa/Diagnostics/Shader/0`, transport-preview only, with no coordinate mapping.

Shader uses no Contact trigger radius. Its fixed encoding cube is X/Z=[−1.5,1.5], Y=[−0.5,2.5], in avatar-root local units. The 16-bit quantization step is about 0.00004578, not real accuracy. One camera and once-per-point CRC remove redundant rendering work; actual client performance was not benchmarked.

Mirror layers, VR hidden layers, HMD composition and desktop mirrors are different surfaces. Confirm the selected region is actually capturable. [Setup/commands](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) · [Implementation research](shader-capture-research.en.md)

## Base inputs and auxiliary tools

- **Manual:** Twelve-axis targets establish connection/direction/range; continuous mode follows edits, without automatic oscillation.
- **funscript:** One L0 timeline with speed, looping, A–B and seeking; no audiovisual synchronization.
- **Native PB:** Actual Stretch + IsGrabbed provides scalar control. Replace MyPB with the real prefix; it supplies no XYZ.
- **L0 recording:** Records pre-dispatch commands, holds the last value through stop and confirms before clearing a re-recording; no multi-axis, gate events, video clock or device feedback.
- **OSC Hub/OSCQuery:** Forwarding, discovery, subscription or polling; packet frequency does not prove sensor changes.
- **Independent Point/Handle/three-marker Pose experiments:** Retain their own measurement models, with no compatibility role in the new SPS contract; they cannot replace producer acceptance.

## Verification limits

Isolated contracts cover geometry, fields, sources and lifecycles; Unity EditMode covers authoring/native components; CI browser/mock-wire checks cover interaction to simulated output. Actual uploads, Contacts/OSC, desktop/HMD grids, coordinate accuracy and hardware motion require separate acceptance. [Feature reference](features.en.md) · [Visual review](ui-visual-review.en.md)
