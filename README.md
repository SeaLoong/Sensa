# Sensa

[简体中文](README.zh-CN.md) · [Documentation](https://sealoong.github.io/Sensa/) · [Signal flow](docs/signal-pipeline.en.md) · [Parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) · [Downloads](https://github.com/SeaLoong/Sensa/releases)

[![CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)
[![E2E](https://github.com/SeaLoong/Sensa/actions/workflows/e2e.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/e2e.yml)
[![Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml)
[![Release](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml)

**Connect inputs, compute reusable signals and send results to devices or applications.** Sensa runs on your computer with a browser workbench. Outputs include TCode serial/UDP/TCP, Intiface/Buttplug, OSC parameters, DG-LAB, MIDI CC, network services and recording files. VRChat interactions and funscript remain ready-to-use input workflows.

## Inputs → computation → outputs

| Step | What you can use | Where to start |
| --- | --- | --- |
| **Input** | OSC parameters and tracking, manual values, funscript, device feedback or recording replay | Choose sources in **Flow**; use **Control → Combined** to work with several source kinds |
| **Computation** | Weighted averages, differences, smoothing, thresholds, delays, events and generated rhythms | Add a computed signal and save calculations and mappings |
| **Output** | Devices, application parameters, network services or funscript tracks | Add an output, then **Add binding** to choose its source, target and range |

One result can drive several outputs, each with its own range and sending schedule. For example, combine two touch readings into an intensity, then use it for vibration, Avatar glow and a recorded track. A direct source can also feed an output binding. [Set up a flow](docs/signal-pipeline.en.md) · [Calculation examples](docs/computed-signals.en.md)

The workbench can [save the complete plan](docs/signal-pipeline.en.md#save-and-reuse-a-complete-plan), including calculations, axis profiles and outputs. Same-origin tabs automatically [share their realtime connection](docs/signal-pipeline.en.md#pages-and-shared-connections) when the browser supports it; each tab keeps its own drafts.

## Choose where the result goes

| Output | Configure inside that output |
| --- | --- |
| TCode / Intiface | Serial/network connection, axis or device feature and travel settings |
| OSC parameter | IP, port, parameter address and Float/Int/Bool; a shortcut selects VRChat's OSC receiver |
| DG-LAB | DG-LAB 4 APP pairing, device, channel, intensity limit and waveform behavior |
| MIDI CC | System MIDI port, channel/controller and 0–127 range |
| HTTP JSON / WebSocket JSON / MQTT | Service or broker address and the receiving path/topic |
| Recording | Funscript track names and ranges, or JSON Lines/CSV diagnostics |

[Output setup and examples](docs/signal-pipeline.en.md#add-outputs-and-bindings)

## Start Sensa and try a flow

1. Download the archive for Windows, Linux or macOS, x64 or ARM64, and extract it.
2. Run Sensa and open **http://127.0.0.1:5086**. New sessions start with input and outputs disabled.
3. Open **Flow**, add an output and choose its source and target. Recording is a useful first destination: it saves manual values as a playable funscript track.
4. Save the setup, **enable the output** and connect it. In **Control**, apply Manual, OSC, Script or Combined, then enable input when ready.

For a motion device, first use small manual targets to check direction, travel and stopping. Intiface connects to a separately running Central. Keep emergency stop within reach; after clearing it or saving a new configuration, enable input again when ready.

[First run](docs/quick-start.en.md) · [Workbench guide](docs/guide.en.md) · [All features](docs/features.en.md)

## Record and replay funscript

Add **Recording** in Flow, keep the default Funscript format and bind a source to a track such as `L0` or `R0`. Each valid segment becomes a downloadable file. A completed track can load into Sensa's script player, or return to a calculation through Recording replay. JSON Lines/CSV preserve raw readings and validity for analysis. [Recording and playback steps](docs/signal-pipeline.en.md#record-and-inspect)

## Which integration should I use?

| Route | What it provides | Main limitation |
| --- | --- | --- |
| **Existing OGB / SPS** | Read the proximity, touch and depth-related parameters your Avatar already provides | Use the Avatar's existing parameters; check which SPS1 or SPS2 signals it sends |
| **SPS four-anchor tracking** | Add measurement components to your Avatar and locate an SPS Socket/Plug root relative to it | Requires rebuilding your own Avatar; the target must stay inside the detectable region |
| **[Contact direct tracking (SDK Beta)](docs/contact-sdk.en.md)** | Read the selected root’s position and relative velocity through one dedicated Receiver | Requires the beta SDK and rebuilding your own Avatar; target stays inside Receiver coverage |
| **Shader capture** | Read root position, X/Z axes and Avatar scale through a monochrome screen code | PC experiment; white margins and three payload copies help recover small shifts and missing data; client validation remains pending |

A “root” is the starting point you select in Unity, such as an SPS Socket/Plug, bone/empty-object Transform, Sensa or native Contact root. Its position relative to the Avatar changes when that point moves within the Avatar; walking or turning the entire Avatar leaves it unchanged. Explicit Transform, Sensa and native Contact targets use the same SPS root protocol. With SPS four-anchor tracking, Contact direct tracking or Shader capture, inspect coordinates and calibrate their range before enabling experimental spatial input. The [positioning guide](docs/positioning.en.md) explains the measurements and limits. Contact direct tracking uses SDK 3.10.6-beta.2 and physical metre units; its velocity values can control movement strength after calibration. Real-client/OSC beta acceptance awaits validation.

[Route selection](docs/usage-scenarios.en.md) · [OSC dictionary](docs/osc-parameters.en.md) · [Positioning and limits](docs/positioning.en.md) · [OGB compatibility](docs/ogb-compatibility.en.md)

## Explore before connecting

Open the [standalone parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) directly in your browser. Eleven simulated scenes show receivers, senders, Socket/Plug reference surfaces, fixed anchors, Contact direct reports and Shader encoding. Rotate the 3D view, drag a target on a chosen plane, or use precise sliders and SVG projections.

The release also includes `docs/parameter-geometry.html` and its local assets for offline use. Browser language is detected automatically; an explicit choice is saved. Use [?lang=en-US](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) or [?lang=zh-CN](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN) to choose a language directly.

## Unity and releases

Install the [Unity package](unity/top.sealoong.sensa/README.md) to add root measurement or Shader capture to your own Avatar. For existing OGB parameters, connect through the OSC settings. Avatar and World labs provide development and validation tools using your own licensed resources.

Stable releases and automatic pre-releases in [Releases](https://github.com/SeaLoong/Sensa/releases) include all six desktop builds and a Unity ZIP. **VPM offers published stable Unity packages only** for VCC/ALCOM. Download preview versions separately from Releases, and follow the instructions for the version you installed.

The [documentation site](https://sealoong.github.io/Sensa/) updates automatically from main. [Language behavior](docs/languages.en.md)

## Development and publication

Pushes to `main` run unit tests and full E2E, then build and publish a pre-release after success. For a stable release, run [release.yml](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml) in Actions: it checks/builds latest `main`, selects the next patch version by default and generates release notes. An optional version field allows an explicit new version. Documentation changes deploy automatically after site E2E, without a separate Pages action.

Publication requires the selected commit's unit tests, normal E2E comparison, native smoke checks and complete artifacts to pass. These checks use isolated configuration and mock transports; real-client and hardware behavior receive separate acceptance checks. See [development and releases](docs/development.en.md), [architecture](docs/architecture.en.md), the [browser verification record](docs/e2e-status.en.md) and [manual E2E maintenance](docs/e2e.en.md).

[MIT license](LICENSE) · [Terminology](GLOSSARY.md)
