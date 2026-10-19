# User guide

[简体中文](guide.md) | **English**

Open `http://127.0.0.1:5086`. The interface has three destinations: **Control, OSC and Settings**. The top bar always shows the actual mode, input activation, emergency stop, language and help. See [Quick start](quick-start.en.md) for a first device test and [Usage scenarios](usage-scenarios.en.md) to compare prerequisites, effects and limits.

Open the [interactive parameter diagram](parameter-geometry.html?lang=en-US) offline from the extracted desktop archive to explore parameter geometry without connecting devices.

## Control

1. Disable input first. Add a Serial, UDP, TCP or Intiface output, enter its destination and select an axis profile.
2. Browse Manual, OSC or Script; browsing does not change the actual mode. Apply appears when the selection differs from the actual mode; click it to switch. Readiness explains current blockers. Shortcuts only browse or focus configuration, without connecting or activating input.
3. Inspect targets, range and direction, then enable input. A mode change, replacement script or saved configuration requires reactivation.

| Input | Operations |
| --- | --- |
| Manual | Adjust the primary axes, then choose Send once; continuous sending follows adjustments without automatic oscillation. Disabling cancels following and clears the override; in Manual mode it also deactivates input and stops output. Ramp and speed are under Send settings; other axes have a separate disclosure |
| OSC | Save mappings and select a source on the OSC page, then enable input in Control |
| Script | Choose a funscript first; loading reveals the timeline, speed, looping/A–B, playback, pause, stop, seeking and action stepping |

Pause stops automatic output. Explicit seek/step can still send targets while Script input remains enabled. Stop resets the playback cursor, not the hardware position. Unloading or replacing a file does not resume movement automatically.

Outputs can be enabled, connected, configured and removed independently. TCode outputs select an axis profile; serial device information and Intiface scanning are expandable. Intiface defaults to an existing Central service: start it, scan for devices and enter its WebSocket address. Managed mode requires a separately installed engine. Vibration defaults to V0, with V1/V2 available; only explicit L0 selection converts depth into intensity. Devices need not support both position and vibration. Serial uses 115200, 8N1; firmware and device permissions must match.

Expand Record L0 targets inside Input. It records commands before dispatch and exports funscript, preserving the final value until the actual stop time and ending automatically at 100000 frames. Exporting during recording stops recording. Recording again requires confirmation before clearing the old buffer; cancel to export first. Stopping recording does not deactivate input or stop devices. Neither recordings nor output previews prove measured hardware motion or successful transmission.

Disabling input stops output. Emergency stop stays latched; clearing it still requires reactivation. Stop does not guarantee centering or remove hardware power.

## OSC

| Tab | Purpose |
| --- | --- |
| Mappings | Three built-in presets, custom presets, path/axis/inversion; expand a mapping for range, curve, interpretation and simulation |
| Parameters | Search, browse sources, filter categories, freeze, pin, inspect meanings and add mappings |
| Experimental diagnostics | Inspect Point/Handle/Root/Pose local estimates and failure reasons; experimental permission and two-endpoint calibration |

Replacing/appending presets creates drafts; the save toolbar below presets shows their state. Fill or remove blank paths before saving. Restore discards unsaved drafts. Saving outputs/axis profiles preserves mapping and receiver drafts, and saving mappings preserves unsaved receiver settings. Reloading the page still initializes from saved configuration. Patterns support whole-segment `*`, cross-segment `**`, and semicolon/newline aliases. Prefer a specific instance. **Use source** controls the input source; browsing a source only filters the list.

FT is hidden by `FT/` and `v2/` namespace prefixes after stripping a full `/avatar/parameters/` prefix. Mapped and pinned entries remain visible; Show FT reveals everything. Shape names such as JawOpen are no longer guessed. Freezing the list does not pause reception or output.

Expand reception/forwarding settings below any OSC tab:

- **Listener:** UDP `127.0.0.1:9001` by default. Listening requires actual OSC mode and an enabled receiver; it is unrelated to HTTP 5086.
- **OSCQuery:** remote directory, live subscriptions and optional polling fallback; local receiver advertisement assists discovery.
- **Hub:** forwards the selected source to several UDP destinations, event-driven or merged at a fixed rate. Check destinations and avoid loops.
- **Input timeout:** off by default for ordinary scalars because VRChat may send only changes. When enabled, an outage latches emergency stop. Updating gates does not renew motion data.

See [Presets](presets.en.md) and the [parameter/radius dictionary](osc-parameters.en.md) for exact paths and meanings. Native PB Stretch needs no position reconstruction. Spatial input is disabled by default; complete samples and low residuals still do not prove reliable positioning. [Positioning](positioning.en.md) explains freshness and coordinate limits for each producer.

### Three SPS workflows

1. **Existing OGB/SPS parameters:** choose OGB / SPS · Depth or Vibration, identify the actual object in Parameters, then pin paths and calibrate. Depth recognizes modern Root/Tip pairs or legacy proximity; Touch/Frot checks required same-object Close gates; independent VFH Touch Zones are direct. Modern VRCFury may require `OGB_ENABLED`. Expand OGB parameter activation, enter the explicit VRChat control IP/port and save. The default receiver port 9001 differs from VRChat's usual control port 9000. Five-second enable heartbeats and the final false describe sends, not acknowledgment or device-input activation. [Compatibility](ogb-compatibility.en.md)
2. **Four fixed anchors for a root:** select targets in Unity Automatic SPS Setup; Exclusive starts Off, while Dedicated permits simultaneous targets. Each local root publishes only `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`. Sample=0 disables it; active counters advance 1/32…1. Anchors stay under the avatar root while a radius-0.001 sender follows the selected Socket/Plug root; radius-2.5 receivers and internal scale guards define coverage. Choose the target/source in Experimental diagnostics → local points/roots, capture two positions, Replace draft, inspect and save. No old Sensa SPS layout is decoded.
3. **Native shader root capture:** add Shader Root Capture, select the SPS target and producerId, then explicitly activate its generated menu after upload. Follow the [GPU/shader guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) to register an actual pixel region and matching producerId, then send the Python bridge to Sensa's receiver port. Check validity, advancing frames and AvatarRootLocal source before calibrating in the same root panel. Freeze, identity changes or timeout invalidate the data. The native skinned point follows the selected CPU root; it is not an SPS deformation curve or final surface.

The latter two produce experimental spatial mappings and require saving Allow experimental spatial input. Keep device input disabled while checking previews, then test within calibrated axis limits. The QuickStart step bench is an internal synthetic fixture, not the product SPS positioning entry point.

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
| Stops while stationary | Input timeout; legacy Point/Handle use oldest-channel age, fixed roots use producer heartbeat and shader input uses frame freshness |
| Preview changes but hardware does not | Preview is not feedback; check transport, firmware, power and device calibration |

## Configuration and access from another device

Configuration defaults to `config.json` beside the program. `SENSA_CONFIG_PATH` selects another location. Preserve configuration when updating; release packages do not contain your device settings.

Access is local by default. For LAN control, bind the WebUI to an appropriate interface and set `SENSA_ACCESS_TOKEN` before startup. Use that token as the Basic password with any username, or use Bearer authentication. Plain HTTP is unencrypted; do not expose it directly to the internet. Language is remembered in the current browser; switching it preserves drafts and runtime state.

[Home](../README.en.md) · [Feature reference](features.en.md) · [WebUI visual aesthetics standards](ui-quality.en.md) · [Unity assets](../unity/top.sealoong.sensa/README.en.md)
