# Feature reference

[简体中文](features.md) | **English**

Use WebSensa for immediate browser control, or run Sensa Desktop to connect applications, tracking and the complete set of transports. Both editions can send one source to several outputs.

## Choose an edition

| Capability | WebSensa | Sensa Desktop |
| --- | --- | --- |
| Manual axes / funscript | Yes | Yes |
| Several outputs from one source | Yes | Yes, with calculations and per-binding schedules |
| Browser serial / Bluetooth / MIDI | Browser APIs and selected device profiles | System ports and bridge tools |
| WebSocket / HTTP | Direct browser connections | Desktop client/server integrations |
| OSC / UDP / TCP / MQTT | Use a compatible bridge endpoint | Native desktop transports |
| Website/player protocol input | Parameter explorer connection | Buttplug, TCode, JSON and vendor API input routes |
| Recording | Manual L0 to funscript | Multitrack funscript, JSON Lines/CSV and recording replay |
| VRChat / Unity tracking | Explore geometry in the parameter page | Live measurement, calibration and spatial calculations |

[Open WebSensa](https://sealoong.github.io/Sensa/websensa/) · [WebSensa guide](websensa.en.md) · [Download desktop](https://github.com/SeaLoong/Sensa/releases/latest)

## Browser workbench

| Page | Work |
| --- | --- |
| **Control** | Choose input mode, adjust axes, play scripts and start/stop sending |
| **OSC** (desktop) | Receive and browse parameters, inspect definitions, map axes and forward |
| **Flow** (desktop) / **Outputs** (WebSensa) | Manage destinations; desktop adds computations, recording and plans |
| **Settings** (desktop) / **Help** (WebSensa) | Device setup and connection guidance; desktop adds protocol listeners and logs |

Navigation adapts to narrow displays. The header keeps activation and emergency stop visible. Language changes preserve current drafts. [Workbench guide](guide.en.md)

## Desktop inputs

| Input mode | Capabilities |
| --- | --- |
| **Manual** | Twelve axes, send once/live edits, profile or explicit duration/speed |
| **Script** | Interpolated funscript, 0.1–4× speed, loops, A–B and keyframe/time navigation |
| **OSC** | Float/Int/Bool, source selection, presets and custom mappings |
| **Protocol** | Buttplug v2/v3/v4, TCode TCP/UDP/serial/WebSocket, WSDM, JSON and documented vendor routes |
| **Combined** | Several source kinds, tracking, feedback, recordings and computed signals together |

Saving configuration, applying another input mode or loading a script switches input off; re-enable it after preparing the next flow. [Operation](guide.en.md#prepare-apply-the-input-mode-then-enable-input)

## Computation and mapping

Computed signals offer weighted averages, sums, products, ratios, min/max, magnitude, thresholds and temporal effects. Add smoothing, dead zones, hysteresis, delays, rates, peak hold, edges, pulses, cooldown or sine/envelope generation.

Spatial operations include `PointDistance`, `PlaneDepth`, `PlaneOffset`, `PlaneDepthFromAxes`, `PlaneOffsetFromAxes`, `VectorAngle` and `PlaneAngle`. XYZ groups describe the target, reference origin and plane orientation. One saved result can feed several bindings. [Worked examples](computed-signals.en.md)

Axis mappings calibrate, invert, curve and scale readings for motion roles. Built-in presets cover OGB depth/vibration, Contact position/speed and PhysBone. Parameter paths support exact names, `*`, `**` and aliases. [Preset guide](presets.en.md)

## Devices and output transports

| Output | Capabilities |
| --- | --- |
| TCode serial/UDP/TCP | Twelve axes with direction, travel, speed and motion profiles |
| Intiface/Buttplug | Device discovery and mappings for advertised position, vibration, rotation and scalar features |
| Handy/Lovense/Autoblow/VacuGlide | Device API controls and synchronized scripts, including supported loop settings |
| Bluetooth/serial bridge | Profile-specific commands through bundled bridge tools |
| OSC | Typed parameters and a VRChat write-back shortcut |
| DG-LAB | APP/device pairing, intensity, waveforms and reported feedback |
| MIDI CC | System port, channel/controller and 0–127 values |
| HTTP JSON/WebSocket JSON/MQTT | Service endpoint or broker/topic with typed signal values |
| Recording | Funscript tracks and diagnostic JSON Lines/CSV |

Each output has an independent connection, activation and value range. Bindings choose event, change-based or fixed-rate delivery. A binding's fallback value handles source invalidity; whole-device stopping comes from input disable, output disable or emergency stop. [Outputs and bindings](signal-pipeline.en.md#add-outputs-and-bindings)

## Shared connections and instances

Desktop tabs share their realtime connection and keep independent drafts. Several protocol sources can share an HTTP port using distinct paths, while each source retains its own channels. Named desktop instances keep separate configurations and use available listening ports. [Protocol routing](protocol-inputs.en.md) · [Startup and instances](quick-start.en.md#run-several-instances)

## Recording and reusable plans

Recording outputs save each binding's valid trajectory segments as funscript tracks. Download them, load them in the player or use Recording replay as a signal source. JSON Lines/CSV retain raw and converted values with validity. Export a complete plan to reuse computations, mappings, profiles and outputs. [Recording and plans](signal-pipeline.en.md#record-and-inspect)

## Parameter explorer

The [parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) provides eleven adjustable scenes with 3D, XZ and isometric views. Search parameters by path/name, choose a reading, map its range to an axis and inspect its recent curve. Record a simulated trajectory to funscript or send the live value to WebSensa. The offline copy keeps the models and file export available without a connection.

## Unity and tracking

| Route | Measurements |
| --- | --- |
| SPS four-anchor tracking | Avatar-root local position from four distances |
| Contact direct tracking (SDK Beta) | Avatar-root metre position and relative velocity |
| Shader capture | Root position, Right/Forward axes and AvatarScale |
| Following plane | Current reference Origin/Forward/Right for depth, offset and angles |
| Point/Handle/Pose experiments | Reference-relative position and pose |

Authoring components generate native Contacts, constraints, animation and parameters during Avatar builds. [Setup choices](usage-scenarios.en.md) · [Units and calibration](positioning.en.md) · [Unity build pipeline](unity-build.en.md)

## Configuration and development

CLI distributions store `config.json` beside the program; Electron defaults to `Sensa/config.json` under the user application-data directory. Named instances have their own folders. HTTP and WebSocket APIs expose the workbench operations to custom tools. [Architecture](architecture.en.md)

[Development and releases](development.en.md) describes builds and scanner maintenance. [Verification records](e2e-status.en.md) identify the actual automated checks and environment-specific acceptance results.
