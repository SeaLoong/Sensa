# Sensa

[简体中文](README.zh-CN.md) · [Documentation](https://sealoong.github.io/Sensa/) · [Parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) · [Downloads](https://github.com/SeaLoong/Sensa/releases)

[![CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)

**Turn virtual interactions and funscript timelines into device targets.** Sensa is a local desktop service with a browser workbench, TCode serial/UDP/TCP outputs and Intiface/Buttplug support.

## Start with a small, explicit control loop

1. Download the archive for Windows, Linux or macOS, x64 or ARM64, and extract it.
2. Run Sensa and open **http://127.0.0.1:5086**. New sessions start with input and outputs disabled.
3. Add an output, check its destination, **enable that output** and connect. For Intiface, start Central separately.
4. Apply **Manual**, enable input and send a small target to check direction/range. Disable input before preparing OSC or a funscript; apply that mode and enable input again when ready.

Keep emergency stop within reach. Clearing it does not resume input. Configuration saves, mode changes and script replacement require input to be enabled again. Displayed positions are **commands, not hardware feedback**.

[First run](docs/quick-start.en.md) · [Workbench guide](docs/guide.en.md) · [All features](docs/features.en.md)

## Choose the data you actually have

| Route | What it provides | Main limitation |
| --- | --- | --- |
| **Existing OGB / SPS** | Modern Root/Tip radial estimates, legacy proximity and touch intensity | External interoperability; not XYZ or universally accurate insertion depth |
| **Sensa SPS** | Four fixed anchors P0–P3 and a dedicated marker reconstruct a selected root in Avatar-root coordinates | Own Avatar only; experimental coverage, scale and sampling constraints |
| **Shader capture** | A native root encoder, explicit desktop region and checked image bridge supply root coordinates | PC experiment; real VRChat/HMD capture remains unverified |

Sensa SPS uses five measurement fields, `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`. Four known, non-coplanar distances can locate one point; arbitrary four proximity values cannot establish target identity or a shared frame. Shader capture uses `Sensa/Shader/<id>/{Frame,X,Y,Z,Valid}`; it samples a root Transform, not the final deformed mesh. Both require explicit experimental permission and calibrated mapping.

[Route selection](docs/usage-scenarios.en.md) · [OSC dictionary](docs/osc-parameters.en.md) · [Positioning and limits](docs/positioning.en.md) · [OGB compatibility](docs/ogb-compatibility.en.md)

## Explore before connecting

The [standalone parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) needs no running Sensa or device. Ten simulated scenes show receivers, senders, Socket/Plug reference surfaces, fixed anchors and Shader encoding. Rotate the 3D view, drag a target on a chosen plane, or use precise sliders and SVG projections.

The release also includes `docs/parameter-geometry.html` and its local assets for offline use. Browser language is detected automatically; an explicit choice is saved. Use [?lang=en-US](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) or [?lang=zh-CN](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN) to choose a language directly.

## Unity and releases

The [Unity authoring package](unity/top.sealoong.sensa/README.md) generates permitted native Avatar components during builds. It does not run arbitrary Avatar C# after upload. Avatar and World labs are optional development tools requiring your own licensed resources.

Desktop previews and a Unity ZIP are available in [Releases](https://github.com/SeaLoong/Sensa/releases). **VPM lists stable Unity packages only**, preserving verified historical versions and archives. GitHub having no current stable release does not erase that history. The site reports unavailable only when no verified package exists; previews/current development are not stable VPM releases.

The [documentation site](https://sealoong.github.io/Sensa/) publishes independently from main; it does not wait for a stable Unity release. [Language behavior](docs/languages.en.md)

## Development and evidence

See [architecture](docs/architecture.en.md), [verification workflow](docs/development.en.md) and [visual review](docs/ui-visual-review.en.md). Plan local checks with `python -X utf8 scripts/verify.py --plan`, then run `scripts/verify.py`. Browser E2E, screenshots, process smoke and World PlayMode run in Actions; device tests use mock transports.

Automated geometry, authoring and mock-wire checks do not establish real VRChat Contacts, client capture, HMD visibility, positioning accuracy or physical device behavior.

[MIT license](LICENSE) · [Terminology](GLOSSARY.md)
