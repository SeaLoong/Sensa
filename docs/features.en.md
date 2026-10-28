# Feature reference

[简体中文](features.md) | **English**

Sensa brings input, computation and output into one workbench for realtime device interaction, application control and trajectory recording. This overview describes what you can build. Follow [First run](quick-start.en.md) or the [workbench guide](guide.en.md) for operation.

## Flows you can build

| Goal | Setup |
| --- | --- |
| Combine readings, smoothing and conditions | OSC, tracking, manual, scripts, protocol or feedback → [computed signal](computed-signals.en.md) |
| Send one result to several destinations | A result → [multiple output bindings](signal-pipeline.en.md#one-result-several-outputs), with separate ranges |
| Route a website/player's commands to your device | [Protocol input and virtual device](protocol-inputs.en.md) → TCode/Intiface/device API output |
| Save a playable, editable trajectory | Source → [Funscript recording](signal-pipeline.en.md#record-and-inspect) → download or replay |
| Reuse an interaction | [Export a plan](signal-pipeline.en.md#save-and-reuse-a-complete-plan) with calculations, mappings, profiles and outputs |
| Open several workbench pages | Same-origin pages automatically [share a realtime connection](signal-pipeline.en.md#pages-and-shared-connections), with independent drafts |

## Browser workbench

| Page | What you can do |
| --- | --- |
| **Control** | Apply an input mode, adjust manual axes, play scripts, manage outputs and record L0 |
| **OSC** | Receive/browse parameters, read explanations, choose sources, map axes, discover and forward |
| **Flow** | Create calculations, connect outputs, replay recordings and save/load complete plans |
| **Settings** | Manage axis ranges, direction, speed, motion settings, protocol inputs and logs |

The header keeps input mode, activation and emergency stop visible. English and Chinese can be switched while retaining drafts. OSC parameters support search, categories, pins, frozen previews and pagination at up to 100 items per page; details explain values and official sources. [Workbench guide](guide.en.md)

The [standalone parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) provides eleven adjustable scenes for parameters, detection regions and tracking. It ships for offline use, with 3D and SVG views.

## Runtime and inputs

| Input mode | Capabilities |
| --- | --- |
| **Manual** | Twelve axes, send once or follow edits, profile-based or explicit duration/speed |
| **Script** | Interpolated funscript, 0.1–4× speed, loops, A–B, time and keyframe navigation |
| **OSC** | Float/Int/Bool parameters, presets/custom mappings and source selection |
| **Protocol** | Buttplug v2/v3/v4, TCode TCP/UDP/serial, WSDM, JSON and vendor compatibility subsets; position/duration, intensity and rotation speed remain distinct |
| **Combined** | Manual, scripts, OSC, protocol, tracking, feedback, replay and calculations together in output bindings |

Input activation controls delivery. Enable input when ready after saving configuration, changing modes/scripts or clearing emergency stop. Pausing a script stops automatic sending; explicit seek/step can still send a selected target while Script input is enabled.

Ordinary OSC receive timeout defaults off for change-only parameters. A positive timeout triggers emergency stop when relevant data expires. Tracking applies its own sampling and validity checks. [Activation and stopping](guide.en.md#prepare-apply-the-input-mode-then-enable-input)

## Signal interpretation and network tools

**Computed signals** offer weighted averages, sums, differences, ratios, min/max and magnitude. Spatial operations measure point distance, plane depth, offset within a plane, direction angles and angles to a plane. Define a plane using its normal or two axes; the following-plane template connects Unity markers that follow a bone. Add smoothing, dead zones, hysteresis, delays, rates, peak hold, edges, pulses, cooldown, duration and sine/envelope generation. Several mappings and outputs can reference one saved result. [Examples and conditions](computed-signals.en.md)

**Axis mappings** provide calibration, inversion, curves, output ranges and motion roles. Five built-in templates cover OGB depth/vibration, Contact position/speed and PhysBone. Paths support exact matches, whole-segment `*`, cross-segment `**` and aliases. [Presets](presets.en.md)

**OGB/SPS** reads existing depth and touch parameters. SPS2 pairs an object's Root/Tip readings to estimate depth; SPS1 uses PenOthers with its Close condition. Calibrate ranges for the actual object. [Parameter meanings](osc-parameters.en.md) · [OGB compatibility](ogb-compatibility.en.md)

**Network tools** include OSCQuery discovery, subscriptions/polling, local receiver advertisement and multi-destination UDP Hub forwarding. Enable OGB heartbeat with an explicit VRChat destination when the Avatar needs it to publish parameters.

## Outputs, profiles and recording

| Output | Configuration focus |
| --- | --- |
| **TCode serial/UDP/TCP** | Connection and axis profile: twelve axes, direction, range, speed, locking and motion settings |
| **Intiface/Buttplug** | Connect Central and scan; default position/vibration plus explicit mappings to advertised rotation and other capabilities |
| **Handy/Lovense/Autoblow/VacuGlide** | Explicit API endpoint/device identity, using supported position, intensity/speed or synchronized scripts; [subsets and limits](protocol-inputs.en.md#vendor-compatible-input-and-physical-device-output) |
| **OSC parameter** | Address, type and range, with a VRChat write-back shortcut |
| **DG-LAB** | DG-LAB 4 APP pairing, device/channel, user limits and intensity/waveform tasks |
| **MIDI CC** | System output port, channel/controller and values from 0 to 127 |
| **HTTP JSON/WebSocket JSON/MQTT** | Receiving service, field/topic and value type |
| **Recording** | Funscript by default, plus JSON Lines/CSV signal diagnostics |

Outputs have independent activation and connections. Each binding selects its own source, range and sending mode. On source invalidity, a binding uses its configured stop value; for a position axis this is a fallback target and may cause movement. Stopping a directly routed protocol source conservatively stops motion outputs and may affect other axes; emergency stop covers every output. [Full output setup](signal-pipeline.en.md#add-outputs-and-bindings)

Recording outputs save each binding's valid segments as separate funscripts for download, player loading or signal replay. JSON Lines/CSV retain raw values, converted values and invalid intervals. Quick L0 recording saves current main-axis targets, up to 100000 frames, with optional export simplification. [Recording and replay](signal-pipeline.en.md#record-and-inspect)

## Unity and spatial experiments

| Route | Measurement and preparation |
| --- | --- |
| **SPS four-anchor tracking** | Three-dimensional root position relative to the Avatar; add components to your Avatar and check common coverage |
| **Contact direct tracking (SDK Beta)** | Metre-based position and relative velocity; requires supported advanced SDK Proximity features |
| **Shader capture** | Root position, Right/Forward axes and AvatarScale; requires a rendered PC block and desktop decoder |
| **Following plane** | Tracking Frame Origin/Forward/Right follow a bone’s movement and rotation, for target depth and off-centre distance |
| **Independent Point/Handle/Pose** | Reference-relative position or pose for measurement-model experiments |

Shader capture uses QR tiles with Reed–Solomon correction to recover some wrong or missing data, followed by complete-packet and advancing-frame checks. Choose Tracking measurement (SensaPoint) in calculations, axis mappings or outputs to use coordinates, supported velocity or Shader axis/scale metrics. [Choose a route](usage-scenarios.en.md) · [Fields, units and calibration](positioning.en.md)

Unity authoring components generate native Contacts, animation and parameters during builds. Automatic SPS Setup selects targets and a root route; explicit Transform, Sensa/native Contact targets have dedicated authoring options. Check actual client/graphics behavior with the versions used. [Unity installation](../unity/top.sealoong.sensa/README.md) · [Build process](unity-build.en.md)

## Configuration, access and API

Settings live in `config.json` beside the program; `SENSA_CONFIG_PATH` selects another path. Complete-plan imports show a review before application, after which you enable the required outputs.

The workbench defaults to local access. Wildcard listen addresses `0.0.0.0`/`::` are separate from browser destinations: automatic browser opening uses `127.0.0.1`/`[::1]`, explicit LAN IPs remain unchanged and IPv6 URLs use brackets. LAN use still requires `SENSA_ACCESS_TOKEN` and a trusted network; see [architecture](architecture.en.md) for connection/access conditions. HTTP and WebSocket expose configuration, input, script, recording and output controls for custom tools.

[Development and releases](development.en.md) explains checks and builds; the [verification record](e2e-status.en.md) distinguishes automated checks, image inspection and actual results by commit.
