# Sensa

[简体中文](README.zh-CN.md) · [Open WebSensa](https://sealoong.github.io/Sensa/websensa/) · [Download](https://github.com/SeaLoong/Sensa/releases/latest) · [Documentation](https://sealoong.github.io/Sensa/) · [Parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html)

[![CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)
[![E2E](https://github.com/SeaLoong/Sensa/actions/workflows/e2e.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/e2e.yml)
[![Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml)
[![Release](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml)

**One workbench for manual controls, scripts and live signals.**

Move a slider, play a funscript or read a live parameter. Shape the result, then send it to several devices and applications together. Sensa keeps each connection, range and destination visible in the same workbench.

## Choose how to run

| | WebSensa | Node.js CLI | Electron |
| --- | --- | --- | --- |
| Start | [Open in your browser](https://sealoong.github.io/Sensa/websensa/) | Run Sensa and open its browser workbench | Run Sensa Desktop with its embedded workbench |
| Sources | Manual controls, funscript, computations, recording replay and parameter explorer | Manual, scripts, OSC, tracking, device protocols, feedback and recording replay | Same local service and sources as the CLI |
| Connections | Browser WebSocket, HTTP, serial, Bluetooth and MIDI where available | Serial, UDP/TCP, Intiface, device APIs, OSC, DG-LAB, MIDI, HTTP/WebSocket and MQTT | Same device and network adapters as the CLI |
| Use it for | Quick control, script playback and portable setups | Application routing, background service and independent instances | A desktop window around the local service |

All three run the same TypeScript core and React workbench. Electron starts the packaged Node CLI as its service; WebSensa runs the same application inside the page with browser adapters. [Architecture](docs/architecture.en.md) · [WebSensa guide](docs/websensa.en.md) · [Local first run](docs/quick-start.en.md)

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

1. [Download](https://github.com/SeaLoong/Sensa/releases/latest) the latest stable release; current Node.js/Electron builds first appear in [development previews](https://github.com/SeaLoong/Sensa/releases). Choose an Electron Desktop archive for an embedded window or a CLI package for your browser/background service. Windows CLI also offers installers and a single EXE. Choose x64 or ARM64. [All formats](docs/quick-start.en.md#1-start)
2. Launch Sensa. The CLI opens the workbench in your browser and reports its current address; Electron opens it in its own window.
3. Add an output, choose a source, save and connect. Enable input, then move a slider or play a script.

Several browser tabs share the local service connection. Reopening the same configuration reuses its running instance; separate named instances keep independent configurations and ports. [Startup and instances](docs/quick-start.en.md#run-several-instances)

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

[Development previews](https://github.com/SeaLoong/Sensa/releases) contain current main builds, including the Node.js/Electron migration. The Download button always opens the latest stable release. Existing configuration files can be read by the new runtime; saves use the canonical camelCase format. Stable Unity packages remain C# and are available through the VPM repository for VCC/ALCOM. Successful main checks publish a preview and update the site; the Release workflow publishes stable versions.

[MIT license](LICENSE) · [Terminology](GLOSSARY.md)
