# Choose a mapping preset

[简体中文](presets.md) | **English**

All 29 built-in presets create drafts. They do not connect devices, enable input or replace calibration. Wildcards help discovery; restrict production mappings to one instance and source.

- First OSR test: **Start · Test world → My avatar**, with Quick Start World Receiver and START HERE.
- Existing SPS: choose Socket/Plug and Self/Others. NewRoot/NewTip estimate radial depth; they cannot correct every offset.
- Local point: choose Z, XYZ or Distance; preferably generate the single-axis draft from real calibration samples.
- PB handle: grab state is already gated internally. Release invalidates it; do not add a nonexistent Gate parameter.
- Paired Pose: both sides need matching three-point markers and Pair Channel.
- Auxiliary input: prefer individual vibration, gate, override or direction presets. The combined preset contains GateEnable; remove it if your avatar does not generate that role.

| Preset | Stable ID | Rules |
| --- | --- | --- |
| Start · Test world → My avatar | `sensa-quick-start` | 2 |
| Sensa Pose · Geometric depth | `sensa-pose-depth` | 1 |
| Sensa Pose · Six axes (calibrate) | `sensa-pose-full` | 6 |
| Sensa local point · Z displacement (calibrate) | `sensa-point-z` | 1 |
| Sensa local point · XYZ position (calibrate) | `sensa-point-xyz` | 3 |
| Sensa local point · Distance from origin (calibrate) | `sensa-point-distance` | 1 |
| Sensa PB handle · Z displacement (calibrate) | `sensa-handle-z` | 1 |
| Sensa PB handle · XYZ position (calibrate) | `sensa-handle-xyz` | 3 |
| Sensa PB handle · Distance from origin (calibrate) | `sensa-handle-distance` | 1 |
| Sensa · Auxiliary vibration | `sensa-aux-vibration` | 1 |
| Sensa · Auxiliary gate | `sensa-aux-gate` | 1 |
| Sensa · Auxiliary depth override | `sensa-aux-override` | 1 |
| Sensa · Auxiliary direction | `sensa-aux-angles` | 2 |
| VRCFury SPS · Socket new depth · Others only | `sps-socket-depth-others` | 1 |
| VRCFury SPS · Socket new depth · Self only | `sps-socket-depth-self` | 1 |
| VRCFury SPS · Plug depth · Others only | `sps-plug-depth-others` | 1 |
| VRCFury SPS · Plug depth · Self only | `sps-plug-depth-self` | 1 |
| VRCFury SPS · Socket new depth | `sps-socket-depth` | 2 |
| VRCFury SPS · Plug depth | `sps-plug-depth` | 1 |
| OGB Socket · Depth + orientation | `ogb-socket-full` | 5 |
| OGB Plug · Depth (others / self) | `ogb-plug-full` | 2 |
| OGB Plug · Others only | `ogb-plug-others` | 1 |
| OGB Plug · Self only | `ogb-plug-self` | 1 |
| OSR-VRChat · Receiving (Pussy) | `osr-inserted-pussy` | 1 |
| OSR-VRChat · Receiving (Ass) | `osr-inserted-ass` | 1 |
| VRCFury SPS · Touch and friction | `sps-touch` | 1 |
| Sensa · Combined auxiliary signals (trim as needed) | `sensa-aux` | 5 |
| Experiment · Native PB stretch (no Contacts) | `sensa-lab-pb-stretch` | 2 |
| Experiment · Shader image bridge Z (calibrate) | `sensa-lab-shader-z` | 2 |

## What each preset measures

### Start · Test world → My avatar

Use with Quick Start World Receiver on your avatar and START HERE in the world. No SPS, camera or Python needed. Steps expect 0/25/50/75/100%; Active is the gate, Stop closes it. Tests the chain, not SPS depth.

### Sensa Pose · Geometric depth

Three paired markers / 24 receivers. Computes insertion ratio from the axis intersection with the opening plane. Invalid or missing tracking stops output without OGB fallback.

### Sensa Pose · Six axes (calibrate)

Depth, yaw, pitch, twist and opening X/Y offset from the same object. X/Y map to L2/L1. Check axis orientation and inversion against hardware.

### Sensa local point · Z displacement (calibrate)

Four-receiver local measurement in reference-local meters. Template ranges need calibration. Select one instance and source; all three axes must use that instance. Does not measure remote bones or shader deformation.

### Sensa local point · XYZ position (calibrate)

Four-receiver local measurement in reference-local meters. Template ranges need calibration. Select one instance and source; all three axes must use that instance. Does not measure remote bones or shader deformation.

### Sensa local point · Distance from origin (calibrate)

Four-receiver local measurement in reference-local meters. Template ranges need calibration. Select one instance and source; all three axes must use that instance. Does not measure remote bones or shader deformation.

### Sensa PB handle · Z displacement (calibrate)

Four-receiver local measurement in reference-local meters. Calibrate the template range and select one instance/source for all axes. PB is valid only while grabbed; releasing stops output.

### Sensa PB handle · XYZ position (calibrate)

Four-receiver local measurement in reference-local meters. Calibrate the template range and select one instance/source for all axes. PB is valid only while grabbed; releasing stops output.

### Sensa PB handle · Distance from origin (calibrate)

Four-receiver local measurement in reference-local meters. Calibrate the template range and select one instance/source for all axes. PB is valid only while grabbed; releasing stops output.

### Sensa · Auxiliary vibration

Matches the corresponding auxiliary role configured in Unity. Replace Existing Parameter with its actual path. This is a scalar input; do not use it for Root/SharedRoot distance samples.

### Sensa · Auxiliary gate

Matches the configured auxiliary role. Replace Existing Parameter with its actual path. Missing or inactive gate values stop output; use as an additional rule for other inputs.

### Sensa · Auxiliary depth override

Matches the corresponding auxiliary role configured in Unity. Replace Existing Parameter with its actual path. This is a scalar input; do not use it for Root/SharedRoot distance samples.

### Sensa · Auxiliary direction

Scalar inputs from AngleX/AngleY auxiliary roles. These do not automatically reconstruct full rotation; calibrate for your output device.

### VRCFury SPS · Socket new depth · Others only

Pairs NewRoot/NewTip from the same source and socket to estimate radial depth. NewTip is a root-centered length sphere, not the real tip; lateral/angle errors remain. Approach from outside once to learn length; stays zero until calibrated. Requires VRCFury Haptics/OGB.

### VRCFury SPS · Socket new depth · Self only

Pairs NewRoot/NewTip from the same source and socket to estimate radial depth. NewTip is a root-centered length sphere, not the real tip; lateral/angle errors remain. Approach from outside once to learn length; stays zero until calibrated. Requires VRCFury Haptics/OGB.

### VRCFury SPS · Plug depth · Others only

VRCFury root receiver: higher PenOthers/PenSelf means deeper, without default inversion. For older Sensa tip receivers, use the legacy OGB Plug preset and calibrate.

### VRCFury SPS · Plug depth · Self only

VRCFury root receiver: higher PenOthers/PenSelf means deeper, without default inversion. For older Sensa tip receivers, use the legacy OGB Plug preset and calibrate.

### VRCFury SPS · Socket new depth

Pairs NewRoot/NewTip from the same source and socket to estimate radial depth. NewTip is a root-centered length sphere, not the real tip; lateral/angle errors remain. Approach from outside once to learn length; stays zero until calibrated. Requires VRCFury Haptics/OGB.

### VRCFury SPS · Plug depth

VRCFury root receiver: higher PenOthers/PenSelf means deeper, without default inversion. For older Sensa tip receivers, use the legacy OGB Plug preset and calibrate.

### OGB Socket · Depth + orientation

Wildcard matches OGB sockets. Depth uses the full range; left/right and up/down orientation map to 0–500 / 500–999 segments.

### OGB Plug · Depth (others / self)

Standard Plug depth maps both PenOthers (other avatars) and PenSelf (self). Depth is inverted automatically.

### OGB Plug · Others only

Maps only PenOthers (depth into other avatars), excluding self.

### OGB Plug · Self only

Maps only PenSelf (self depth). Enable generateSelfParam on the Sensa component.

### OSR-VRChat · Receiving (Pussy)

OGB/Orf/Pussy/PenOthers depth, single Depth axis. Based on OSR-VRChat.

### OSR-VRChat · Receiving (Ass)

OGB/Orf/Ass/PenOthers depth, single Depth axis. Based on OSR-VRChat.

### VRCFury SPS · Touch and friction

Maps TouchSelf/TouchOthers/FrotOthers to V0 vibration. Close is a contact switch; NewRoot/NewTip are distance signals, not generic depth aliases.

### Sensa · Combined auxiliary signals (trim as needed)

Includes vibration, gate, depth override and direction. Keep only roles actually generated in Unity; absent GateEnable stops output. Prefer the individual presets.

### Experiment · Native PB stretch (no Contacts)

Reads native PhysBone stretch with IsGrabbed as the gate. No XYZ tracking; releasing should stop. Test path Sensa/Lab/PB; calibrate before real use.

### Experiment · Shader image bridge Z (calibrate)

Diagnostic Z bridge template: 0–0.2 m maps to 0–100%; 0.12 m previews 60%, not 40% SPS insertion depth. Valid closes on frozen frames or CRC failures.


XYZ templates map Z→L0, X→L2 and Y→L1. Check hardware orientation rather than treating those defaults as calibration. Point/PB uses reference-local meters; Pose angles use degrees; ordinary scalar signals usually use 0–1.

NewRoot and NewTip must both have appeared for the same source/socket. With stream timeout enabled, either member updates that pair's age; other sockets, sources and gates cannot refresh it. If both stop updating, timeout stops input, including stationary change-only OSC. Timeout is therefore off by default. Pairing by path/source cannot establish player identity or prove both values came from one physical Sender.

Root/SharedRoot raw samples are diagnostic only and must not be mapped directly to motion. Shader Z is also a displacement experiment, not a generic SPS depth signal.

[User guide](guide.en.md)
