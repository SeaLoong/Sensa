# First run

[简体中文](quick-start.md) | **English**

Start with a manual slider recorded as funscript to learn saving, activation and live results. Then choose OSC or script input, or send the result to a device or application. [Full signal-flow guide](signal-pipeline.en.md)

## 1. Start

Open [Downloads](https://github.com/SeaLoong/Sensa/releases/latest) for the latest stable release, then choose a release asset using the formats below. Development previews and older builds are listed separately in [release history](https://github.com/SeaLoong/Sensa/releases). Every build includes the required .NET runtime.

| System and format | Architecture | Example filename | Start |
| --- | --- | --- | --- |
| Windows installer (recommended) | x64/ARM64 | `Sensa-version-win-x64-Setup.exe` | Launch after installation or from the Start menu to open the workbench automatically; uninstall through system settings |
| Windows single file | x64/ARM64 | `Sensa-version-win-x64-SingleFile.exe` | Put the EXE in a writable directory and run it; configuration stays beside it |
| Windows portable | x64/ARM64 | `Sensa-version-win-x64.zip` | Fully extract to a writable directory, then run `Sensa.exe` |
| Linux portable | x64/ARM64 | `Sensa-version-linux-x64.tar.gz` | Fully extract, then run `./Sensa` from that directory |
| macOS portable | x64/ARM64 | `Sensa-version-osx-arm64.tar.gz` | Fully extract, then run `./Sensa` from that directory |

Every system offers **x64/ARM64**. Intel/AMD computers generally use x64; Apple Silicon and Windows ARM devices use ARM64. Preview filenames also contain a build number and commit identifier, with the same startup steps.

Open **http://127.0.0.1:5086** in your browser after starting Sensa. Input and outputs start disabled on the first run.

The installer defaults to `%LOCALAPPDATA%\Programs\Sensa`; upgrades and uninstall preserve user data in `config.json` and `recordings`. Installer and portable packages include offline documentation and the Shader capture bridge. The single-file build embeds the workbench and [offline parameter explorer](http://127.0.0.1:5086/docs/parameter-geometry.html); obtain the separate Python capture bridge from the portable archive or repository.

The interface chooses a language automatically, with a manual switch available. [Language preferences](languages.en.md)

![Manual controls in Sensa](screenshots/desktop/english-manual.png)

English interface · [Narrow layout](screenshots/mobile/english-manual.png) · [More running examples](screenshots.en.md)

## 2. Add an output

Open Flow, choose Add output, select Recording and keep its default **Funscript** format.

1. Open Input-to-output bindings and choose Manual → L0 as the source.
2. Set track name `L0` and both input/output ranges to **0–1**.
3. Save output, enable it and confirm its connection status.

A binding describes how one input reaches a destination. The input range gives the reading's endpoints; the output range gives the values expected by the destination.

You can also choose your intended destination directly:

| Destination | What to prepare |
| --- | --- |
| TCode device | Serial port, or UDP/TCP host and port; first set direction, a small travel range and speed in Settings → Axis profiles |
| Intiface device | Start Central, then choose its address and device; check range and stopping settings in Central/the device |
| OSC application or VRChat parameter | Receiver IP, port, parameter address and type; use the VRChat write-back shortcut for its usual endpoint |
| DG-LAB | DG-LAB 4 APP, relay address, paired device and channel limits |
| MIDI or network application | System MIDI port, or HTTP/WebSocket/MQTT service address |

See [output setup](signal-pipeline.en.md#add-outputs-and-bindings) for individual fields. TCode serial defaults to 115200/8N1; Intiface connects to a separately running Central.

## 3. Enable input and inspect results

In Control, choose Manual, Apply input mode and enable input. Adjust L0 and send once, then inspect the binding's raw and converted values. Repeated adjustments create a changing trajectory.

Disable input to complete the recording segment, then download it or load it into the script player. Loading leaves playback paused. When ready, apply Script, enable input and play.

For a motion device, use small targets to check direction, travel and stopping. Emergency stop stops outputs and disables input; enable input again when ready after clearing the stop. Saving configuration, changing input mode or replacing a script also disables input.

An active input sends its current valid target to newly connected outputs, so check the header state before connecting.

## 4. Choose sources and add computation

| Input you need | Operation |
| --- | --- |
| OSC parameters | Apply OSC or Combined; check reception/source in OSC, find actual parameters, then choose or create a mapping |
| Funscript | Load a script, apply Script, enable input and play; adjust speed, looping and playback position |
| Website/player protocol | Add a source in Settings → Protocol inputs and save its listener; [connect the upstream client](protocol-inputs.en.md), then apply Protocol or Combined and separately enable input |
| Several source kinds together | Configure calculations and output bindings, then apply Combined in Control |
| Avatar root position or velocity | Install measurement components using the [setup guide](usage-scenarios.en.md), then inspect, calibrate and allow experimental spatial input |

VRChat commonly sends parameters to Sensa on **9001**. Sensa's write-back or OGB heartbeat commonly targets VRChat on **9000**. Inspect actual parameters and their [meanings](osc-parameters.en.md) in OSC before choosing a [preset](presets.en.md) or calculation.

For weighting, smoothing or triggers, choose Add computed signal in Flow. Spatial calculation presets provide point distance, plane depth, offset within a plane and direction angles. If you have set up a following plane in Unity, its template creates the calculation drafts. After saving, several output bindings can use the results with separate ranges. [Calculation examples](computed-signals.en.md) · [Multiple outputs](signal-pipeline.en.md#one-result-several-outputs)

## 5. Save recordings and complete plans

Completed funscript segments can be downloaded, loaded into the script player or used in calculations through Recording replay. Choose JSON Lines/CSV when analysing raw signals. [Recording and replay](signal-pipeline.en.md#record-and-inspect)

Expand Save and load a complete plan in Flow to export calculations, mappings, axis profiles and outputs together. Review an import before applying it, then enable the outputs you need.

Configuration defaults to `config.json` beside the program; `SENSA_CONFIG_PATH` selects another file. For troubleshooting, start with the active input mode, source, connection and logs. [Workbench guide](guide.en.md) · [Feature overview](features.en.md) · [Home](../README.md)
