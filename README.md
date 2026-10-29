# Sensa

[简体中文](README.zh-CN.md) · [Open WebSensa](https://sealoong.github.io/Sensa/websensa/) · [Download](https://github.com/SeaLoong/Sensa/releases/latest) · [Documentation](https://sealoong.github.io/Sensa/) · [Parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html)

[![CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)
[![E2E](https://github.com/SeaLoong/Sensa/actions/workflows/e2e.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/e2e.yml)
[![Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml)
[![Release](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml)

**One workbench for manual controls, scripts and live signals.**

Move a slider, play a funscript or read a live parameter. Shape the result, then send it to several devices and applications together. Sensa keeps each connection, range and destination visible in the same workbench.

## Choose how to run

| | WebSensa | Sensa Desktop |
| --- | --- | --- |
| Start | [Open in your browser](https://sealoong.github.io/Sensa/websensa/) | [Download and launch](https://github.com/SeaLoong/Sensa/releases/latest) |
| Sources | Manual controls, funscript and parameter-explorer input | Manual, scripts, OSC, tracking, device protocols, feedback and recording replay |
| Connections | Browser WebSocket, HTTP, serial, Bluetooth and MIDI where available | Serial, UDP/TCP, Intiface, device APIs, OSC, DG-LAB, MIDI, HTTP/WebSocket and MQTT |
| Use it for | Quick device control, script playback and portable setups | Application routing, multiple input sources, recording and VRChat/Unity |

Both editions share the same control layout and source-to-output workflow. [WebSensa guide](docs/websensa.en.md) · [Desktop first run](docs/quick-start.en.md)

![Combined input in Sensa](docs/screenshots/desktop/combined-input-en-US.png)

[Narrow layout](docs/screenshots/mobile/combined-input-en-US.png) · [More running examples](docs/screenshots.en.md)

## Build the flow you need

| Goal | Start here |
| --- | --- |
| Control a device immediately or play a script | [WebSensa](docs/websensa.en.md) |
| Route a website/player to OSR or another output | [Protocol inputs and device bridges](docs/protocol-inputs.en.md) |
| Blend values, smooth a response or add a trigger | [Computed signals](docs/computed-signals.en.md) |
| Send one result to several devices or applications | [Multiple output bindings](docs/signal-pipeline.en.md#one-result-several-outputs) |
| Record an interaction and play it again | [Recording and replay](docs/signal-pipeline.en.md#record-and-inspect) |
| Use VRChat parameters or Avatar position | [Choose a setup](docs/usage-scenarios.en.md) |

A flow can connect a source directly to an output. Add a computation when you want blending, a curve, smoothing, geometry or a timed effect. One result can feed many outputs, each using its own range and update schedule.

## Start the desktop workbench

1. [Download](https://github.com/SeaLoong/Sensa/releases/latest) the latest stable release. Windows offers installers, a single EXE and portable ZIPs; Linux/macOS offer portable archives. Choose x64 or ARM64 for your computer. [All formats](docs/quick-start.en.md#1-start)
2. Launch Sensa. The workbench opens in your browser. The console shows its current address.
3. Add an output, choose a source, save and connect. Enable input, then move a slider or play a script.

Several browser tabs share the desktop connection. Reopening the same configuration reuses its running instance; separate named instances keep independent configurations and ports. [Startup and instances](docs/quick-start.en.md#run-several-instances)

## Connect devices and applications

| Destination | Connection |
| --- | --- |
| TCode / OSR / SR6 | Serial, UDP or TCP with per-axis profiles |
| Intiface / Buttplug devices | Central device discovery and advertised feature mappings |
| Handy / Lovense / Autoblow / VacuGlide | Device APIs and supported realtime or synchronized-script controls |
| Bluetooth / virtual serial devices | [Protocol bridge tools](tools/protocol-bridge/README.md) |
| VRChat / OSC applications | OSC parameters, discovery and forwarding |
| DG-LAB | DG-LAB 4 APP pairing, intensity and waveform tasks |
| MIDI / automation / custom services | MIDI CC, HTTP JSON, WebSocket JSON and MQTT |
| Files | Funscript tracks, JSON Lines and CSV |

Sensa can also receive the device controls produced by another application. A typical route is **website → Sensa virtual Buttplug device → TCode → OSR**. Shared HTTP ports use separate paths for independent input routes. [Protocol examples](docs/protocol-inputs.en.md)

## Explore, record and reuse

The [parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) lets you move targets, compare readings and understand detection regions. The same explorer ships inside the desktop application for offline use.

Recording outputs turn selected signals into reusable funscript tracks. Load a completed track into the player, replay it as a computation source or export the entire interaction as a plan. [Signal-flow guide](docs/signal-pipeline.en.md)

For your own Avatar, the [Unity package](unity/top.sealoong.sensa/README.md) provides SPS four-anchor tracking, Contact direct tracking (SDK Beta), Shader capture and following reference planes. [Setup choices](docs/usage-scenarios.en.md) · [Tracking and calibration](docs/positioning.en.md)

## Documentation and development

[Workbench guide](docs/guide.en.md) · [Feature reference](docs/features.en.md) · [OSC dictionary](docs/osc-parameters.en.md) · [Languages](docs/languages.en.md) · [Development and releases](docs/development.en.md) · [Verification record](docs/e2e-status.en.md)

[Development previews](https://github.com/SeaLoong/Sensa/releases) contain current main builds. Stable Unity packages are available through the VPM repository for VCC/ALCOM. Successful main checks publish a preview and update the site; the Release workflow publishes stable versions.

[MIT license](LICENSE) · [Terminology](GLOSSARY.md)
