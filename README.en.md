# Sensa

[简体中文](README.md) | **English**

[![main CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml?query=branch%3Amain)

Convert Manual, VRChat OSC or funscript input into Intiface/TCode targets. The browser workbench has **Control, OSC and Settings**, with details expanded when needed.

[Download previews](https://github.com/SeaLoong/Sensa/releases) · [Quick start](docs/quick-start.en.md) · [User guide](docs/guide.en.md) · [Three mapping presets](docs/presets.en.md) · [Interactive parameter diagram](docs/parameter-geometry.html?lang=en-US)

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
- OSC discovery, FT prefix filtering, three simplified presets, custom mappings, OSCQuery and Hub.
- Multiple outputs, independent axis profiles, target previews, explicit input permission and emergency stop.
- Chinese/English and narrow-screen layout.
- OGB/SPS signal recognition, four fixed anchors for root coordinates, native shader root capture and PB scalars.

Target previews are not mechanical feedback. Start with automatic OGB/SPS depth or vibration presets when native parameters exist. If required, explicitly enable the `OGB_ENABLED` heartbeat to VRChat; its status is not a UDP acknowledgment. [Compatibility and paths](docs/ogb-compatibility.en.md)

For root coordinates, Unity authors can generate four anchors fixed in the avatar-root frame or a native shader capture rig for a selected Socket/Plug. An explicit screen-region Python bridge publishes shader coordinates. Both use two-point calibration in Experimental diagnostics and require explicit experimental permission. They do not measure world position, complete pose or the SPS curve surface. Sensa SPS accepts only unversioned P0–P3/Sample; Shader uses five ordered fields with separate diagnostics. [Parameter/radius reference](docs/osc-parameters.en.md). [Positioning](docs/positioning.en.md) · [Shader capture](unity/top.sealoong.sensa/GPU-TRACKING.en.md)

## Documentation

[Features and source index](docs/features.en.md) · [Architecture](docs/architecture.en.md) · [Development/CI](docs/development.en.md) · [Screenshot review](docs/e2e.en.md) · [Languages](docs/languages.en.md)

[Unity installation](unity/top.sealoong.sensa/README.en.md) · [Lab workflow](docs/lab-workflow.en.md) · [Avatar tools](tools/unity-avatar-lab/README.en.md) · [World tools](tools/unity-world-lab/README.en.md)

Product previews require necessary checks, full E2E comparison and platform verification for the same candidate. Main continues unfinished verification. Retain the ten newest published prereleases while preserving stable releases, drafts and Git tags. Preview features may change; client, Unity and hardware acceptance depend on actual reports.
