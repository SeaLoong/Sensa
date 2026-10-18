# Three real integration routes

[简体中文](usage-scenarios.md) | **English**

SPS is an Avatar interaction system whose haptics use OGB names. Socket and Plug are two sides of that parameter family. Sensa separates existing parameter intake, fixed-anchor measurement and image capture. Synthetic steps remain internal regression fixtures, not installation or control routes.

| Route | Prerequisites | Data and effect | Current boundary |
| --- | --- | --- | --- |
| OGB / SPS | The Avatar actually emits OGB parameters | Detect modern Root/Tip or legacy proximity; map touch to vibration | Radial/proximity intensity, not accurate XYZ or arbitrary-angle insertion depth |
| Sensa SPS | Your own buildable PC Avatar and an explicitly selected Socket/Plug root | Four fixed anchors plus a dedicated marker recover AvatarRootLocal coordinates for calibration | Self by default; Others diagnostic only; scale, common coverage and non-atomic OSC limits |
| Shader capture | Native encoding components and an actually visible desktop region | Root coordinates → ID/CRC/frame grid → explicit capture → calibration | PC experiment; hidden layers are not guaranteed capturable; client/pixel accuracy unverified |

All routes produce device commands, not position feedback. Outputs are TCode serial/UDP/TCP or supported Intiface features; a local connection state is not proof of mechanical execution.

## 1. OGB / SPS: use existing parameters

An existing OGB Avatar does not need another invented set of SPS parameters. Apply OSC, confirm the listening port and source, and inspect actual `OGB/Orf/...` or `OGB/Pen/...` paths.

- Explicitly enable `OGB_ENABLED` under receiving/forwarding settings if required. The default is off. Enter VRChat's actual receive IP/port, commonly `127.0.0.1:9000`, while Sensa normally listens on 9001. Heartbeats send true every five seconds only during OSC reception and false when stopped. They grant no device input permission and receive no UDP acknowledgement.
- The depth template uses `OgbDepth`. Positive modern channels at the same source, full instance and Self/Others party select pairing. A missing companion or unlearned length yields zero. Only absent/zero modern channels permit legacy PenOthers fallback. Plug is not universally inverted.
- The vibration template uses `OgbTouch`. Touch and Plug Frot require the same object's Close gate; Socket Frot is direct. Output is V0, also the Intiface default.
- Constrain the actual instance, inspect direction/range, save, then arm. Discovery wildcards must not combine objects or sources.
- Modern Socket length learning starts during an outside approach. Avatar/mapping/activation changes clear old length. Offset, tilt and multiple Senders affect radial estimation.

“One detector in every old version” is not a valid universal split: official OGB v1 already supported both capabilities. Detect the producer's actual parameters. [Capability matrix and pinned upstream sources](ogb-compatibility.en.md) · [Three templates](presets.en.md)

## 2. Sensa SPS: measure the selected root

Install the Unity package on your own Avatar and add **Sensa → Fixed SPS Root Probe**. Select a supported Socket/Plug, Sensa Component or native Contact root explicitly. A dedicated small sphere follows that root center; four receivers stay under the Avatar root rather than moving with the target or Socket. Dedicated/Exclusive Automatic SPS Setup uses the same builder.

Both sides share one geometry definition:

| Anchor | AvatarRootLocal |
| --- | --- |
| A0 | (-0.5, 0.5, -0.5) |
| A1 | (0.5, 0.5, 0.5) |
| A2 | (0.5, 1.5, -0.5) |
| A3 | (-0.5, 1.5, 0.5) |

Receiver radius is 2.5 and marker radius .001 in authored local units. Coverage is the intersection of four spheres, not an unlimited region around every Avatar. The SDK caps world radius at 3 m; build/runtime scale guards stop measurements before clamping, and nonuniform scale is rejected.

```text
Sensa/SpsRoot/v1/<instance>/Self/Root/A0 ... A3
Sensa/SpsRoot/v1/<instance>/Self/{Profile,Valid,Scale,Heartbeat}
```

1. Confirm all four ranges and metadata, then choose the exact target/source in the root panel.
2. Select X/Y/Z/distance, capture real 0% and 100% endpoints, preview, replace the draft and save.
3. Explicitly allow experimental spatial input before arming. Invalidity, frozen heartbeat, expiry or ambiguous targets blocks and stops output.
4. The shared profile defines anchors and marker size. An ordinary TPS root sphere cannot replace the dedicated small marker.

Self building rejects another local Sender on the dedicated channel. Others can still mix peers, so they remain diagnostic with Valid false. Periodic copies and a 32-step heartbeat improve stationary values and sampling aliasing without proving atomic OSC or lossless delivery. One root gives no orientation, tip, surface or exact insertion proportion. [Geometry, scale and age](positioning.en.md) · [Installation](../unity/top.sealoong.sensa/README.en.md) · [Research evidence](fixed-anchor-research.en.md)

## 3. Shader: native root encoding and explicit capture

Add **Sensa → Shader Root Capture (Experimental)**, select an actual SPS Socket/Plug and pin a nonzero producer ID. The builder generates native SkinnedMeshRenderer, camera, RenderTexture, encoding/display shaders and a local menu. No custom desktop C# runs on the uploaded Avatar. Editor Model Probe remains separate diagnostics.

1. Enable the default-off encoded display in the actual client and locate a genuinely visible desktop grid.
2. Specify the physical-pixel region and producer ID. Decode without OSC first, then save registration and explicitly supply the destination port. See the [Shader guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) for commands.
3. The bridge checks RGB thresholds, CRC, identity, coordinate profile and progressing frames. Freezes, old frames, wrong regions and errors send Valid=0; recovery requires progressing frames.
4. Sensa accepts the complete native `Sensa/Shader/v1/<ID>/...` packet, uses the same endpoint calibration panel and requires experimental spatial permission.

Valid packet order is Valid, Frame, X, Y, Z, Producer, Profile. Desktop intake checks complete receipt ordering, Profile 1, matching ID, bounds and content age. Repeating the same Frame does not renew it. Old Profile 0 diagnostic grids provide preview only, never usable coordinates.

Native coordinates share AvatarRootLocal with fixed anchors; they are not the deformed SPS tip or mesh. Mirror-only layers, hidden VR layers, HMD composition and desktop mirrors are different images. Observe and register the actual grid rather than inferring capture from layer names. [Official-source investigation](shader-capture-research.en.md)

## Basic inputs and supporting tools

- **Manual:** Twelve-axis targets for connection/direction/range checks. Continuous mode follows edits, not automatic reciprocation.
- **Funscript:** One L0 timeline with speed, loops, A–B and seeking; no audio/video synchronization.
- **Native PB:** Actual Stretch/IsGrabbed scalar control needs no anchors and supplies no XYZ. Replace the template's MyPB prefix.
- **L0 recording:** Pre-dispatch commands with the final held duration; restart clears only after confirmation. No extra axes, gate/stop events, video clock or device feedback.
- **OSC Hub/OSCQuery:** Forwarding, discovery/subscription or polling. Repeated forwarding is not changing sensor content.
- **Older three-point/SharedRoot experiments:** Retained for lab verification, not prerequisites or production-positioning evidence for these routes.

## Verification boundaries

Isolated local contracts verify models, identity boundaries and lifecycle. Unity EditMode verifies author generation, native components and shader import. CI browser/mock-wire checks exercise UI through simulated outputs. Actual SDK upload, VRChat Contacts/OSC, desktop/HMD grids, coordinate accuracy and hardware motion each require separate acceptance. See [features](features.en.md) and [visual review](ui-visual-review.en.md).
