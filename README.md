# Sensa

[简体中文](README.zh-CN.md) · [Documentation](https://sealoong.github.io/Sensa/) · [Parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) · [Downloads](https://github.com/SeaLoong/Sensa/releases)

[![CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)

**Connect inputs, compute reusable signals and send results to devices or applications.** Sensa runs on your computer with a browser workbench. Outputs include TCode serial/UDP/TCP, Intiface/Buttplug, OSC parameters, DG-LAB, MIDI CC, network services and recording files. VRChat interactions and funscript remain ready-to-use input workflows.

## First use: check direction and travel

1. Download the archive for Windows, Linux or macOS, x64 or ARM64, and extract it.
2. Run Sensa and open **http://127.0.0.1:5086**. New sessions start with input and outputs disabled.
3. Add an output, check its destination, **enable that output** and connect. For Intiface, start Central separately.
4. Apply **Manual**, enable input and send a small target to check direction/range. Disable input before preparing OSC or a funscript; apply that mode and enable input again when ready.

Keep emergency stop within reach. After clearing it, saving configuration, changing modes or replacing a script, enable input again when ready. Displayed positions are **command targets**; check the device itself to confirm its movement.

[First run](docs/quick-start.en.md) · [Workbench guide](docs/guide.en.md) · [All features](docs/features.en.md)

## Which integration should I use?

| Route | What it provides | Main limitation |
| --- | --- | --- |
| **Existing OGB / SPS** | Read the proximity, touch and depth-related parameters your Avatar already provides | Use the Avatar's existing parameters; check which SPS1 or SPS2 signals it sends |
| **SPS four-anchor tracking** | Add measurement components to your Avatar and locate an SPS Socket/Plug root relative to it | Requires rebuilding your own Avatar; the target must stay inside the detectable region |
| **[Contact direct tracking (SDK Beta)](docs/contact-sdk.en.md)** | Read the selected root’s position and relative velocity through one dedicated Receiver | Requires the beta SDK and rebuilding your own Avatar; target stays inside Receiver coverage |
| **Shader capture** | Draw root coordinates as a black-and-white code block and read them from the desktop | PC experiment; the full block must be visible, and real VRChat/headset behavior remains unverified |

A “root” is the starting point you select in Unity, such as an SPS Socket/Plug, bone/empty-object Transform, Sensa or native Contact root. Its position relative to the Avatar changes when that point moves within the Avatar; walking or turning the entire Avatar leaves it unchanged. Explicit Transform, Sensa and native Contact targets use the same SPS root protocol. With SPS four-anchor tracking, Contact direct tracking or Shader capture, inspect coordinates and calibrate their range before enabling experimental spatial input. The [positioning guide](docs/positioning.en.md) explains the measurements and limits. Contact direct tracking uses SDK 3.10.6-beta.2 and physical metre units; its velocity values can control movement strength after calibration. Real-client/OSC beta acceptance awaits validation.

[Route selection](docs/usage-scenarios.en.md) · [OSC dictionary](docs/osc-parameters.en.md) · [Positioning and limits](docs/positioning.en.md) · [OGB compatibility](docs/ogb-compatibility.en.md)

## Combine inputs before mapping motion

Create a **computed signal** in Pipeline to combine parameters with a weighted average, difference, ratio or magnitude, then use the result in axis mappings or output bindings. Inputs can also use solved positions from SPS four-anchor tracking, Contact or Shader, and Contact velocity metrics. Several destinations can reuse one intermediate result.

For example, blend two touch intensities at a 1:3 ratio or calculate root separation from XYZ differences. Output bindings reuse the result with their own destination, type, range and update rate. Choose an OSC parameter output to write an Avatar feedback parameter, a DG-LAB output for a channel task, or Recording for funscript tracks. Combined input lets manual, OSC, script and feedback sources participate together. [Inputs, computation and outputs](docs/signal-pipeline.en.md) · [Calculations and examples](docs/computed-signals.en.md)

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
