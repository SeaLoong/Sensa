# User guide

[简体中文](guide.md) | **English**

Open `http://127.0.0.1:5086`. The interface has three destinations: **Control, OSC and Settings**. The top bar always shows the actual mode, input activation, emergency stop, language and help. See [Quick start](quick-start.en.md) for a first device test.

## Control

1. Disable input first. Add a Serial, UDP, TCP or Intiface output, enter its destination and select an axis profile.
2. Browse Manual, OSC or Script; browsing does not change the actual mode. Apply the input mode explicitly.
3. Inspect targets, range and direction, then enable input. A mode change, replacement script or saved configuration requires reactivation.

| Input | Operations |
| --- | --- |
| Manual | Adjust the primary axes, then choose Send once; continuous sending follows sliders, and disabling clears the manual override. Ramp and speed are under Send settings; other axes have a separate disclosure |
| OSC | Save mappings and select a source on the OSC page, then enable input in Control |
| Script | Load funscript; set speed, looping or A–B; play, pause, stop, seek and step between actions |

Pause stops automatic output. Explicit seek/step can still send targets while Script input remains enabled. Stop resets the playback cursor, not the hardware position. Unloading or replacing a file does not resume movement automatically.

Outputs can be enabled, connected, configured and removed independently. TCode outputs select an axis profile; serial device information and Intiface scanning are expandable. No Intiface engine is bundled. With Central, enter its WebSocket address and disable engine-process management. Serial uses 115200, 8N1; firmware and device permissions must match.

Recording captures L0 targets before dispatch and exports funscript. It is neither a measured mechanical trajectory nor proof of successful transmission. Output previews likewise show command targets.

Disabling input stops output. Emergency stop stays latched; clearing it still requires reactivation. Stop does not guarantee centering or remove hardware power.

## OSC

| Tab | Purpose |
| --- | --- |
| Mappings | Five built-in presets, custom presets, path/axis/inversion; expand a mapping for range, curve, interpretation and simulation |
| Parameters | Search, browse sources, filter categories, freeze, pin, inspect meanings and add mappings |
| Experimental diagnostics | Inspect Point/Handle/Root/Pose local estimates and failure reasons; experimental permission and two-endpoint calibration |

Replacing/appending presets creates drafts. Save to apply them; Restore discards unsaved edits. Patterns support whole-segment `*`, cross-segment `**`, and semicolon/newline aliases. Prefer a specific instance. **Use source** controls the input source; browsing a source only filters the list.

FT is hidden by `FT/` and `v2/` namespace prefixes after stripping a full `/avatar/parameters/` prefix. Mapped and pinned entries remain visible; Show FT reveals everything. Shape names such as JawOpen are no longer guessed. Freezing the list does not pause reception or output.

Expand reception/forwarding settings below any OSC tab:

- **Listener:** UDP `127.0.0.1:9001` by default. Listening requires actual OSC mode and an enabled receiver; it is unrelated to HTTP 5086.
- **OSCQuery:** remote directory, live subscriptions and optional polling fallback; local receiver advertisement assists discovery.
- **Hub:** forwards the selected source to several UDP destinations, event-driven or merged at a fixed rate. Check destinations and avoid loops.
- **Input timeout:** off by default for ordinary scalars because VRChat may send only changes. When enabled, an outage latches emergency stop. Updating gates does not renew motion data.

See [Presets](presets.en.md) for SPS paths and meanings. Spatial input is disabled by default; complete samples and low residuals still do not prove reliable positioning. See [Positioning](positioning.en.md) for explicit experimental permission, oldest-channel freshness and coordinate limits. Native PB Stretch requires no four-point reconstruction.

## Settings

Axis profiles cover L0–L2, R0–R2, V0–V2 and A0–A2. Each axis has output bounds, remapping range, speed limit, inversion, lock/ignore modes and command settings. The default profile cannot be removed; deleting another redirects its output references to the default. Follow device calibration; template values are not hardware guarantees.

Logs are expandable and filterable by category and level. Preserve the actual error, parameter path, source and last value when troubleshooting.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No OSC parameters | VRChat OSC, actual OSC mode, saved listener settings, port conflicts and source filtering |
| Parameters but no movement | Input permission, output enablement/connection, saved mappings, gates and experimental blocking |
| No SPS match | Actual generator and paths; modern VRCFury differs from older Sensa paths |
| Reversed movement | Duplicate inversion in mapping and axis profile |
| Stops while stationary | Input timeout; spatial experiments also expire each contributing channel |
| Preview changes but hardware does not | Preview is not feedback; check transport, firmware, power and device calibration |

## Configuration and access from another device

Configuration defaults to `config.json` beside the program. `SENSA_CONFIG_PATH` selects another location. Preserve configuration when updating; release packages do not contain your device settings.

Access is local by default. For LAN control, bind the WebUI to an appropriate interface and set `SENSA_ACCESS_TOKEN` before startup. Use that token as the Basic password with any username, or use Bearer authentication. Plain HTTP is unencrypted; do not expose it directly to the internet. Language is remembered in the current browser; switching it preserves drafts and runtime state.

[Home](../README.en.md) · [Feature reference](features.en.md) · [WebUI visual aesthetics standards](ui-quality.en.md) · [Unity assets](../unity/top.sealoong.sensa/README.en.md)
