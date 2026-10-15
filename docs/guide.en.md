# Sensa user guide

[简体中文](guide.md) | **English**

Start with [First OSR setup](quick-start.en.md) for a new device, or the [three-part workflow](lab-workflow.en.md) for the FullFlow avatar and test world.

## Start and connect outputs

Keep the entire extracted directory. Run `Sensa.exe` on Windows, or `./Sensa` in a terminal on Linux/macOS. If extraction loses executable permissions, restore them for the Sensa file. macOS previews are not signed/notarized; follow your system's launch controls or build from source.

Open `http://127.0.0.1:5086`. Keep **Input enabled** off during setup. The top-bar language selector switches between English and Simplified Chinese without reloading, discarding drafts or changing the running input. It does not translate your names or OSC paths.

| Output | Required configuration |
| --- | --- |
| TCode Serial | Device port, such as COM3, /dev/ttyUSB0 or /dev/cu.*; account needs permission to access it |
| TCode UDP / TCP | Receiver host and port |
| Intiface | Running Intiface Central WebSocket URL; disable engine management when using Central |

Sensa does not bundle the Intiface engine. Each TCode output can have its own axis profile. Set stroke, direction and speed limits before testing. Connecting alone does not initiate motion, but an already active input and open gates can send commands as soon as the connection is available.

## Select an input

- **Manual:** adjust sliders and click **Update position**. **Continuous updates** sends slider changes when input is enabled.
- **OSC:** receive VRChat or other OSC sources.
- **Script:** load a funscript, check playback range, speed and looping, then play.

Tabs change the view only. **Apply input mode** changes the running mode. With input off, you can observe and edit without normal motion output.

## Receive VRChat OSC

1. Enable OSC in VRChat. Enable OSC receiving in Sensa and save.
2. Default OSC listener: `127.0.0.1:9001` UDP. Match the sender's destination; this is separate from WebUI HTTP port 5086.
3. Apply OSC mode and check **Parameters and mappings**. FT parameters are hidden by default; use **Show FT** when needed.
4. Pin **Active source** when several sources exist.
5. Choose a [preset](presets.en.md). Importing creates a draft; inspect it and click **Save and apply mappings**.

For ordinary SPS choose the matching Socket, Plug or touch preset. Add the [Unity package](../unity/top.sealoong.sensa/README.en.md) only when you need additional tracking.

OSCQuery can discover readable parameters and subscribe through LISTEN. Polling fallback is optional when LISTEN is unavailable. The OSC Hub forwards selected-source data to configured UDP targets; it rejects duplicate targets and loops back into its own listener.

## Calibrate

The OSC workspace separates **Parameters and mappings**, **Spatial diagnostics** and **Range calibration**.

For a local point/PB, select X, Y, Z or Distance. Capture the desired 0% and 100% positions. Keep PB grabbed during capture. For example, Z=10 cm at 0% and Z=5 cm at 100% gives 50% at 7.5 cm, with inversion applied automatically.

**Replace with calibration** replaces the complete mapping draft and removes old gates. Check the target axis and ranges, then save. Saving disables input; re-enable it only after checking received values.

Template ranges are not calibration. Samples cannot mix objects, sources or axes; invalid positions and spans below 1 mm are rejected. Standard and shared SPS roots are diagnostic positions, not complete stroke measurements.

## Interpret output and stop

Output cards show each output's last sent target after its own mapping: TCode 0–999 or Intiface percentages. They do not prove the device reached that position; UDP has no remote acknowledgement.

Input off, closed gates or invalid precise tracking request a stop. Clearing emergency stop does not automatically re-enable input. Stopping does not necessarily center or power off hardware.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No OSC values | VRChat OSC, listener/port conflicts, source filters |
| Values but no motion | Output enabled/connected, applied input mode, input switch, saved mappings, gates and tracking validity |
| Reversed direction | Calibration endpoints and axis inversion; avoid accidentally inverting twice |
| Different targets on different outputs | Their independent remap, lock and clamp settings |
| Invalid coordinates | Missing/saturated samples, range, nonuniform scale or mixed Senders |
| Stops while stationary | Stream timeout: change-only OSC may not repeat; keep timeout off by default |
| Port has no friendly name | Select its device path and check OS permissions |

When timeout is enabled, gate updates do not keep stale motion samples alive. Root/Tip updates refresh their own pair; changing to a shorter SPS target requires relearning length from an unsaturated position. Invalid pairs clear learned length.

## Mobile / LAN access

The UI supports narrow screens. Local access is the default. For another device, configure the WebUI host as `0.0.0.0` as needed and set `SENSA_ACCESS_TOKEN` before launch. Open the computer's LAN address on port 5086; HTTP Basic username can be anything and the password is the token. Plain HTTP is not encrypted; do not expose it directly to the Internet.

Settings normally live in `config.json` beside the program; `SENSA_CONFIG_PATH` overrides the location. Preserve your configuration when updating. Language is a browser preference, separate from device configuration.

[Home](../README.en.md)
