# Sensa

[简体中文](README.md) | **English**

[![main CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml?query=branch%3Amain)

Turn VRChat OSC parameters or motion scripts into Intiface / TCode device commands. Configure and preview everything in your browser.

[Download a development preview](https://github.com/SeaLoong/Sensa/releases) · **[First OSR setup](docs/quick-start.en.md)** · **[Avatar / world / software workflow](docs/lab-workflow.en.md)** · [User guide](docs/guide.en.md) · [Choose a preset](docs/presets.en.md)

New to OSR? Verify signals using your avatar and the test world before connecting hardware. The QuickStart component configures itself without SPS, manual placement, cameras or Python. Your device still needs compatible TCode firmware and hardware calibration.

## Get started

1. Download the archive for your operating system and processor; extract it to a writable directory.
2. Windows: run `Sensa.exe`. Linux/macOS: run `./Sensa` from the extracted directory. Keep the whole directory; no separate .NET installation is needed.
3. Open **http://127.0.0.1:5086**.
4. Choose **English** or **简体中文** in the top bar. The first visit follows your browser's supported language; your choice is remembered in this browser.
5. Add an output, limit its stroke and speed, then choose Manual, OSC or Script.
6. Check previews and calibration before enabling input.

Output cards show the last sent targets, not measured mechanical positions. Disable input or use **Stop outputs** whenever needed.

## Which download?

| Computer | Platform in filename |
| --- | --- |
| Windows, Intel / AMD | `win-x64.zip` |
| Windows, ARM | `win-arm64.zip` |
| Linux, Intel / AMD | `linux-x64.tar.gz` |
| Linux, ARM64 | `linux-arm64.tar.gz` |
| Mac, Intel | `osx-x64.tar.gz` |
| Mac, Apple silicon | `osx-arm64.tar.gz` |

Main commits publish previews only after all checks, including E2E screenshot comparisons, pass. Features may still change. macOS previews are unsigned command-line applications. The ZIP starting with `top.sealoong.sensa-` contains Unity assets, not the desktop application.

## Find what you need

- **Devices, OSC, calibration and troubleshooting:** [User guide](docs/guide.en.md)
- **Mapping presets:** [Preset guide](docs/presets.en.md)
- **Extra avatar tracking or a PB handle:** [Unity installation](unity/top.sealoong.sensa/README.en.md)
- **Try the test world:** [World guide](tools/unity-world-lab/README.en.md)
- **Build from source / CI:** [Development](docs/development.en.md)
- **Language support and translations:** [Languages](docs/languages.en.md)

Ordinary SPS mapping does not require Sensa's Unity package. Install it for additional measurement features. The WebUI **Help** dialog also contains step-by-step instructions.
