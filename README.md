# Sensa

[简体中文](README.zh-CN.md) · [Documentation](https://sealoong.github.io/Sensa/) · [Parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) · [Downloads](https://github.com/SeaLoong/Sensa/releases)

[![CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)

**Let devices follow VRChat interactions or funscript motion scripts.** Sensa runs on your computer, with a browser interface for inputs and devices. It supports TCode serial/UDP/TCP and Intiface/Buttplug. Displayed values are the positions or intensities Sensa intends to send.

## First use: check direction and travel

1. Download the archive for Windows, Linux or macOS, x64 or ARM64, and extract it.
2. Run Sensa and open **http://127.0.0.1:5086**. New sessions start with input and outputs disabled.
3. Add an output, check its destination, **enable that output** and connect. For Intiface, start Central separately.
4. Apply **Manual**, enable input and send a small target to check direction/range. Disable input before preparing OSC or a funscript; apply that mode and enable input again when ready.

Keep emergency stop within reach. Clearing it does not resume input. Configuration saves, mode changes and script replacement require input to be enabled again. Displayed positions are **commands, not hardware feedback**.

[First run](docs/quick-start.en.md) · [Workbench guide](docs/guide.en.md) · [All features](docs/features.en.md)

## Which integration should I use?

| Route | What it provides | Main limitation |
| --- | --- | --- |
| **Existing OGB / SPS** | Read the proximity, touch and depth-related parameters your Avatar already provides | No Avatar changes; usually estimates depth rather than three-dimensional position |
| **Sensa SPS** | Add measurement components to your Avatar and calculate the selected root relative to it | Requires rebuilding your own Avatar; the target must stay inside the detectable region |
| **Shader capture** | Draw root coordinates as a black-and-white code block and read them from the desktop | PC experiment; the full block must be visible, and real VRChat/headset behavior remains unverified |

A “root” is the Socket/Plug starting point you select in Unity. Its position relative to the Avatar changes when that point moves within the Avatar; walking or turning the entire Avatar leaves it unchanged. With Sensa SPS or Shader capture, inspect coordinates and calibrate their range before enabling experimental spatial input. The [positioning guide](docs/positioning.en.md) explains the measurements and limits.

[Route selection](docs/usage-scenarios.en.md) · [OSC dictionary](docs/osc-parameters.en.md) · [Positioning and limits](docs/positioning.en.md) · [OGB compatibility](docs/ogb-compatibility.en.md)

## Explore before connecting

The [standalone parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) needs no running Sensa or device. Ten simulated scenes show receivers, senders, Socket/Plug reference surfaces, fixed anchors and Shader encoding. Rotate the 3D view, drag a target on a chosen plane, or use precise sliders and SVG projections.

The release also includes `docs/parameter-geometry.html` and its local assets for offline use. Browser language is detected automatically; an explicit choice is saved. Use [?lang=en-US](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) or [?lang=zh-CN](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN) to choose a language directly.

## Unity and releases

If you can edit your own Avatar, install the [Unity package](unity/top.sealoong.sensa/README.md) for root measurement or Shader capture. Reading existing OGB parameters does not require it. Avatar and World labs are optional development/validation tools requiring your own licensed resources.

Desktop previews and a Unity ZIP are available in [Releases](https://github.com/SeaLoong/Sensa/releases). **VPM offers published stable Unity packages only** for VCC/ALCOM. Download preview versions separately from Releases, and follow the instructions for the version you installed.

The [documentation site](https://sealoong.github.io/Sensa/) publishes independently from main; it does not wait for a stable Unity release. [Language behavior](docs/languages.en.md)

## Development and evidence

See [architecture](docs/architecture.en.md), [verification workflow](docs/development.en.md) and [visual review](docs/ui-visual-review.en.md). Plan local checks with `python -X utf8 scripts/verify.py --plan`, then run `scripts/verify.py`. Browser E2E, screenshots, process smoke and World PlayMode run in Actions; device tests use mock transports.

Automated geometry, authoring and mock-wire checks do not establish real VRChat Contacts, client capture, HMD visibility, positioning accuracy or physical device behavior.

[MIT license](LICENSE) · [Terminology](GLOSSARY.md)
