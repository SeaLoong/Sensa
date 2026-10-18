# Sensa

[简体中文](README.md) | **English**

[![main CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml?query=branch%3Amain)

Convert Manual, VRChat OSC or funscript input into Intiface/TCode targets. The browser workbench has **Control, OSC and Settings**, with details expanded when needed.

[Download previews](https://github.com/SeaLoong/Sensa/releases) · [Quick start](docs/quick-start.en.md) · [User guide](docs/guide.en.md) · [Five mapping presets](docs/presets.en.md)

## Start

1. Download the desktop archive for your system/CPU and extract everything to a writable directory.
2. Run `Sensa.exe` on Windows or `./Sensa` on Linux/macOS. No separate .NET installation is needed.
3. Open **http://127.0.0.1:5086**, keeping input disabled initially.
4. Configure outputs and axis limits, select/apply the input mode, inspect targets and then enable input.

| System | Platform in filename |
| --- | --- |
| Windows Intel/AMD, ARM | `win-x64.zip`, `win-arm64.zip` |
| Linux Intel/AMD, ARM64 | `linux-x64.tar.gz`, `linux-arm64.tar.gz` |
| macOS Intel, Apple silicon | `osx-x64.tar.gz`, `osx-arm64.tar.gz` |

macOS previews are unsigned command-line programs. ZIP files starting with `top.sealoong.sensa-` contain separately installed Unity assets.

## Current capabilities

- Twelve-axis manual control; funscript playback/looping/seeking; L0 recording/export.
- OSC discovery, FT prefix filtering, five simplified presets, custom mappings, OSCQuery and Hub.
- Multiple outputs, independent axis profiles, target previews, explicit input permission and emergency stop.
- Chinese/English and narrow-screen layout.
- Unity QuickStart reception, native PB scalars and advanced experiments.

Target previews are not mechanical feedback. Four/eight-receiver Contact positioning cannot drive output by default. It provides a conditional reference-local estimate without proving Sender identity, shared frames, world position or GPU surfaces. [Positioning principles and redesign](docs/positioning.en.md)

Existing native SPS parameters normally need no Sensa Unity package. See [Presets](docs/presets.en.md) for modern Socket radial estimation, Plug proximity and their limits. A first reception test can use QuickStart World Receiver without SPS, cameras or Python.

## Documentation

[Features and source index](docs/features.en.md) · [Architecture](docs/architecture.en.md) · [Development/CI](docs/development.en.md) · [Screenshot review](docs/e2e.en.md) · [Languages](docs/languages.en.md)

[Unity installation](unity/top.sealoong.sensa/README.en.md) · [Lab workflow](docs/lab-workflow.en.md) · [Avatar tools](tools/unity-avatar-lab/README.en.md) · [World tools](tools/unity-world-lab/README.en.md)

Product previews require necessary checks, full E2E comparison and platform verification for the same candidate. Main continues unfinished verification. Retain the ten newest published prereleases while preserving stable releases, drafts and Git tags. Preview features may change; client, Unity and hardware acceptance depend on actual reports.
