# Feature reference

[简体中文](features.md) | **English**

Drive an OSR or another interactive device from VRChat/SPS, funscripts or manual controls. Start with the guided setup, use presets for common configurations, then add calculations, recordings or more outputs as needed.

[Connect your first device](quick-start.en.md) · [Devices and connections](devices.en.md) · [Browse guides](start.en.md)

## Guided setup and presets

**Start setup guide** takes you through **Choose a scene → Connect device → Prepare input → Review setup**. Save your progress and return with **Resume setup**, or reopen it through **Guided setup**. After **Finish setup**, turn on **Input enabled** when ready.

**Scene presets** prepares common VRChat/SPS mapping drafts and TCode axis profiles. Review and save a mapping draft before use. For a device-motion preset, review and save the new axis profile, then select it on the output. Choose ranges that match your actual device. A [complete plan](signal-pipeline.en.md#save-and-reuse-a-complete-plan) can reuse a whole configuration, including inputs and outputs.

[First-run steps](quick-start.en.md) · [Mapping templates](presets.en.md) · [Workbench map](guide.en.md)

## Choose an edition

- **WebSensa:** [open in a browser](https://sealoong.github.io/Sensa/websensa/) for manual control, scripts and browser-supported device connections.
- **Desktop:** download and run a desktop window with the full local service.
- **CLI:** run that service with the workbench in your browser, including background use and independent instances.

Desktop/CLI provide live VRChat OSC, UDP/TCP listeners, native connections and filesystem recordings. All editions share one workbench and signal engine. [Architecture](architecture.en.md)

## Browser workbench

Scene shortcuts give common tasks a starting point. **Control** connects outputs and runs manual/script input. **OSC** inspects and maps parameters. **Flow** adds calculations, bindings and plans. **Settings** holds axis profiles and logs. Available connections follow the host's capabilities. [Workbench map](guide.en.md) · [Browser connections](websensa.en.md)

## Desktop inputs

Manual control offers twelve axes. Funscript playback supports speed, loops, A–B and seeking. OSC adds presets and calibrated mappings. Protocol input receives controls from other players. Combined mode uses several source kinds together. [Choose an input](usage-scenarios.en.md) · [Protocol inputs](protocol-inputs.en.md)

## Computation and mapping

Blend, scale, smooth or gate readings; add timed effects or spatial calculations. One result can feed several outputs. [Calculation examples](computed-signals.en.md) · [Presets](presets.en.md)

## Devices and output transports

- **OSR / SR6 / TCode:** serial, UDP, TCP and WebSocket according to the host, with axis ranges and motion profiles.
- **Intiface / Buttplug:** discovery and mappings for advertised position, vibration, rotation and scalar features.
- **Handy, Lovense, Autoblow, VacuGlide:** supported device APIs and script controls.
- **DG-LAB, OSC, MIDI CC, HTTP/WebSocket JSON and MQTT:** device, Avatar and application connections.
- **Recording:** funscript tracks, CSV and JSON Lines.

[Choose a device connection](devices.en.md) · [Output settings and binding reference](signal-pipeline.en.md#add-outputs-and-bindings) · [Bluetooth profiles and serial bridges](../tools/protocol-bridge/README.md) · [Adapter catalog](adapter-catalog.en.md)

## Shared connections and instances

Several outputs can share a compatible connection. Desktop tabs share their realtime session; independent named instances keep separate configurations. [Routing details](protocol-inputs.en.md) · [Start another instance](quick-start.en.md#run-several-instances)

## Recording and reusable plans

Browser and desktop recording outputs can save selected signals as funscript tracks or diagnostic CSV/JSON Lines. Reuse recordings as script/replay sources, or export a complete plan with mappings, calculations, profiles and outputs. Download browser recordings before closing the page. [Recording and plans](signal-pipeline.en.md#record-and-inspect)

## Parameter explorer

Explore contact and tracking with movable targets, 3D views and live parameter curves. Export a simulated funscript or send readings to WebSensa. The same explorer ships offline. [Open the explorer](https://sealoong.github.io/Sensa/parameter-geometry.html)

## Unity and tracking

Avatar authors can add SPS four-anchor tracking, Contact direct tracking (SDK Beta), Shader capture and following reference planes. [Choose a tracking route](usage-scenarios.en.md) · [Unity package](../unity/top.sealoong.sensa/README.md) · [Units and calibration](positioning.en.md)

## Configuration and development

[Download Sensa](https://github.com/SeaLoong/Sensa/releases/latest). Every format includes the runtime; no separate Node.js installation is needed. Replace `version` below with the release version, and choose x64 or ARM64 for your computer.

| Format | Example filename | Start |
| --- | --- | --- |
| Windows Desktop | `Sensa-version-win-x64-Desktop.zip` | Extract completely; run `Sensa.exe` |
| Linux Desktop | `Sensa-version-linux-x64-Desktop.tar.gz` | Extract; run `./Sensa` |
| macOS Desktop | `Sensa-version-osx-arm64-Desktop.zip` | Extract; open `Sensa.app` |
| Windows CLI installer | `Sensa-version-win-x64-Setup.exe` | Install; launch from Start |
| Windows CLI single file | `Sensa-version-win-x64-SingleFile.exe` | Run from a writable folder |
| Windows CLI portable | `Sensa-version-win-x64.zip` | Extract completely; run `Sensa.exe` |
| Linux CLI | `Sensa-version-linux-x64.tar.gz` | Extract; run `./Sensa` |
| macOS CLI | `Sensa-version-osx-arm64.tar.gz` | Extract; run `./Sensa` |

On Ubuntu 24.04 with restricted user namespaces, run `python3 ./sensa-linux-sandbox.py install` from the extracted Desktop directory before opening Sensa. It uses sudo to register that executable path with AppArmor while keeping Chromium's sandbox enabled. Run `python3 ./sensa-linux-sandbox.py remove` before moving/deleting it, then register the new location. Other Linux setups and the CLI do not need this step.

CLI uses `config.json` beside the program; Desktop uses `Sensa/config.json` under user application data. `--config <path>` selects another file. [Configuration and APIs](architecture.en.md) · [Development and releases](development.en.md) · [Verification records](e2e-status.en.md)
