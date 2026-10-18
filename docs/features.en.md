# Feature reference

[简体中文](features.md) | **English**

This page describes current behavior and its limits, with source entry points for further inspection. For operations, use the [User guide](guide.en.md). Compare prerequisites, effects and limits in [Usage scenarios](usage-scenarios.en.md). Sensa sends motion targets; it has no mechanical position-feedback loop. Contact positioning remains an experiment disabled by default.

## Browser workbench

| Destination | Features |
| --- | --- |
| Top bar | Connection, actual input mode, activation, emergency stop/clear, Chinese/English and help |
| Control | Browse/apply Manual/OSC/Script; twelve-axis manual targets, single/continuous updates and motion settings; outputs; recording/export |
| OSC → Mappings | Three built-in presets, replace/append, custom presets, path/role/inversion, range/curve/remapping, individual simulation, save/restore |
| OSC → Parameters | Search, browse/use source, categories, freeze, pins, meanings and mapping creation |
| OSC → Experimental diagnostics | Experimental permission, Point/Handle endpoint calibration, Root/SharedRoot/Pose observations, local coordinates and failure reasons |
| Expandable OSC settings | Listener, source filter, timeout, OSCQuery, polling, receiver advertisement and Hub |
| Settings | Create/edit/default/remove axis profiles, twelve-axis details and structured log filtering |

The WebUI uses React and project-owned basic components styled after TDesign. Navigation sits above independently scrolling content. A light-gray page uses single white work surfaces and fine dividers. Input modes use segmented selection grouped with Apply. Output rows align identity, target and actions, stacking in that order on narrow screens. Sliders have one editable value, endpoint inputs use equal columns, and the player appears after a script loads. Connection, mapping and diagnostic details expand. Drafts are distinct from saved configuration. Language switching preserves drafts/runtime state; preferences stay in the current browser. Narrow screens use the same functional structure.

## Modes, permission and stopping

Manual/Osc/Script are mutually exclusive actual input modes. Browsing a page does not change mode. Actual mode changes, replacement scripts and full configuration saves disable input and stop output. Connecting an output does not enable input; an already active input with valid targets can send after connection.

Emergency stop is latched; clearing it does not resume motion. Disabled input, closed gates and invalid spatial data stop output. Script pause/stop/unload stops automatic frames and UDP refresh, while explicit seek/step may send with Script input still enabled. Stop resets the playback cursor, not hardware position. Startup does not restore input, output enablement, scripts or movement. [Runtime](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs), [application control](https://github.com/SeaLoong/Sensa/blob/main/src/Application/SensaApplication.cs)

## Inputs and signal processing

| Capability | Behavior and conditions |
| --- | --- |
| Manual | Twelve-axis targets; single/live updates, clearing override and profile-based or explicit I/S requests. Disabling disarms and stops only when Manual is the actual mode |
| OSC UDP | Float/Int/Bool scalars, nested bundles and avatar changes; standard parameter-prefix normalization |
| Source isolation | Values per source, source selection and persistent-ID preference; browsing does not select the active source |
| OSCQuery | HOST_INFO/tree, LISTEN subscription, optional polling fallback and local receiver advertisement |
| Hub | Multiple UDP targets, event-driven/fixed-rate merging, source selection and send/drop statistics; preserves unconsumed bundle structure |
| Path matching | Exact paths, whole-segment `*`, cross-segment `**`, semicolon/newline aliases; heuristic hints never create mappings |
| FT filtering | Strip the standard OSC prefix, then hide `FT/`/`v2/` namespaces; retain mapped/pinned entries, without guessing expression names |
| Scalar processing | Calibration bounds, inversion, Linear/EaseIn/EaseOut/SCurve and output ranges |
| Fusion | Prefer higher calibrated normalized input per role; break ties by strength or deviation from center; patch only axes actually present |
| Gates/override | Every GateEnable mapping requires an open value; DepthOverride can replace ordinary depth |
| Timeout | Off by default for ordinary OSC; enabled outages latch emergency stop; spatial data has a separate default freshness gate |

Roles map Depth/Surge/Sway to L0/L1/L2, Twist/AngleX/AngleY to R0/R1/R2, V0–V2 to vibration, and Auxiliary/Auxiliary1/Auxiliary2 to A0/A1/A2. A role name is not a calibrated physical direction. [Mapping/roles](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SignalMapping.cs), [calibration/fusion](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SignalPipeline.cs)

The three presets are `ogb-depth`, `ogb-touch` and `native-pb-stretch`. Depth prefers NewRoot/NewTip from the same source/instance/Self-Others party; legacy single-proximity fallback applies only without modern pairing. Incomplete or saturated modern samples are rejected without silently reusing legacy data. NewTip is a root-centered length sphere, yielding a radial proportion. Touch/Frot independently drives V0 with the same object's required Close gate. PB uses the real Stretch and IsGrabbed prefix. [Presets](presets.en.md), [OGB compatibility](ogb-compatibility.en.md), [radial estimator](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SpsDepthEstimator.cs)

Modern VRCFury may leave OGB parameters off. Explicitly configure `osc.ogbControl` in OSC settings to send `OGB_ENABLED=true` to VRChat every five seconds while OSC reception runs. Stopping or retargeting sends false to the old destination. It neither guesses incoming ports nor activates device input. Active status and last-send time do not acknowledge remote reception. [Activation service](https://github.com/SeaLoong/Sensa/blob/main/src/Input/Osc/OgbControlService.cs)

The catalog is bounded and rejects nonfinite values; expired sources are cleaned up. Avatar changes clear affected samples/learning and stop OSC input. Bundle timetags can survive forwarding, but scalar intake is not a complete scheduling engine. [OSC implementation](https://github.com/SeaLoong/Sensa/tree/main/src/Input/Osc)

## Scripts and recording

Funscript loading accepts timed position actions, skips invalid entries, keeps the last original action for each repeated timestamp before sorting, and rejects files with no valid actions. Playback interpolates L0 with 0.1–4× speed, full/A–B looping, timecode seeking, action stepping and activity bins. Injected time preserves fractional milliseconds, and final-frame delivery does not depend on when the UI reads a snapshot. [Player](https://github.com/SeaLoong/Sensa/blob/main/src/Input/Script/FunscriptPlayer.cs)

Recording buffers timestamped L0 targets, automatically ending at 100000 frames. Stopping preserves the final hold segment; simplification exports standard actions JSON. Active export stops recording; starting again requires confirmation before clearing the buffer. It records before dispatch, without other axes, input/gate/stop events or hardware acknowledgment. [Recording/export](https://github.com/SeaLoong/Sensa/blob/main/src/Recording/MotionRecorder.cs)

## Outputs and axis profiles

| Output | Behavior |
| --- | --- |
| TCode Serial | 115200, 8N1; port enumeration, Windows friendly names and D0/D1/D2 device queries |
| TCode UDP | Address/port, delta commands, necessary full refresh and stop; no remote acknowledgment |
| TCode TCP | Stream connection, delta encoding, stop and connection-error handling |
| Intiface/Buttplug | External WebSocket service, optional local engine management, scanning, feature detection and stop |

Each output has an independent name, destination and enablement. TCode outputs select shared or separate profiles: Min/Max, RemapMin/Max, MaxSpeed, Invert, Normal/Locked/Ignored, LockValue, None/Interval/Speed and RampType. Output slope/speed-unit settings affect final encoding. Ignored axes do not automatically center. [TCode encoding](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/TCode/TCodeEncoder.cs)

Intiface selects timed or raw position commands according to advertised capabilities. Vibration independently reads the selected V0/V1/V2/L0 axis, defaulting to V0; vibration-only devices need no position feature, and transitions to zero always send zero. L0 intensity conversion requires explicit selection. Limited devices are not twelve-axis controllers. New outputs default to an existing Central service; explicit managed settings remain supported. No engine is bundled. Per-output telemetry parses sent targets without proving mechanical execution. [Intiface](https://github.com/SeaLoong/Sensa/tree/main/src/Outputs/Intiface), [dispatch](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/OutputCoordinator.cs), [telemetry](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/OutputTelemetry.cs)

## Spatial experiment limits

Fixed roots use four noncoplanar AvatarRootLocal anchors, radius-2.5 receivers and a dedicated radius-0.001 sender. An explicit Socket/Plug/native Contact center and unique tag reduce target mixing. `Sensa/SpsRoot/v1/<id>/Self/Root/A0…A3` requires Profile=1, Valid, Scale and a fresh Heartbeat at the same Self level. Old eight-channel Root data without metadata remains diagnostic. Builds reject nonuniform avatar-root scale, excessive radius and custom root-scale animation; out-of-range runtime ScaleFactor disables Contacts.

The native shader root producer uses native Cameras, RenderTexture and a skinned point to publish the selected CPU root in AvatarRootLocal. The external Python bridge captures only an explicitly registered region and producerId, validating frame/CRC/validity/timeout before sending `Sensa/Shader/v1/<id>`. Root capture is not the SPS deformation curve or final visible surface. Both root producers use two-point calibration in the existing local-point panel, generating `SensaPoint` mappings still blocked by default `osc.allowExperimentalSpatialInput=false` until explicitly permitted.

Legacy Point/Handle/Pose remain reference-local experiments with oldest-channel age, including Handle grab state: one second by default or positive `inputTimeoutMs`. Fixed roots retain unchanged ranges while requiring FX heartbeat freshness of at most 1250 ms. The 32-step, 50-ms counter is neither atomic sampling nor proof of Contact freshness. Shader input separately requires advancing frames and producer metadata. None independently recovers avatar world motion or complete pose, and calibration adds no missing observability. Others and SharedRoot remain diagnostic. [Positioning](positioning.en.md), [fixed-anchor research](fixed-anchor-research.en.md)

## Unity and experiment tools

The Unity package contains build-time authoring components, not arbitrary C# running on an uploaded avatar. Dependencies are declared in the [package manifest](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/package.json). NDMF creates Contacts, PhysBones, constraints, Animator parameters and menus, then removes authoring configuration. Sensor parameters must exist in the actual FX Animator as well as local parameter configuration; registering names alone is insufficient. [Generation utilities](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaSensorUtility.cs)

| Module | Content and limitations |
| --- | --- |
| Fixed SPS roots | Automatic SPS Setup defaults to fixed four-anchor Self roots with Dedicated/Exclusive; an explicit author selects other supported roots, with scale/protocol guards |
| Traditional SensaComponent | Socket/Plug Contacts, rings and raw lateral proximity; PB/Contact/ExistingParameter and SDK-dependent Raycast auxiliary signals; distinct from modern VRCFury generation |
| Automatic SPS Setup | Discover/select existing SPS, exclusions, menu selection and Dedicated/Exclusive/SharedRootArray policies |
| Point/Handle/Pose/Root | Experimental samples, grab gates and reference frames; scale/name/parameter-conflict/Contact-budget preflight |
| GPU Model Probe | Editor snapshot of a selected Resolver's model centerline/entry data, with pinned-source checks; not final mesh or general client tracking |
| Native shader roots and image bridge | Generates native cameras/skinned point/encoding materials, initially Off; explicit region/producerId Python-to-OSC bridge invalidates freeze/errors; client visibility still needs acceptance |
| Avatar Lab | Separate capability scenes, QuickStart/FullFlow, placement/hand following, menus, SDK preprocess and local bundle validation; requires the user's licensed assets |
| World Lab | Geometry cases, PB/Contact/SPS/Shader stations, START HERE, interactive world Plug/Socket and ClientSim/PlayMode validation entry points |

Native PB stretch does not depend on Contact position reconstruction. QuickStart authors are hidden internal synthetic fixtures, not the product SPS introduction or accuracy evidence. Uploaded-client Contacts, VR grabbing, GPU/HMD behavior, avatar OSC and hardware need separate acceptance. World Udon ground truth does not automatically become avatar OSC. FullFlow synthetic Shader values only test transport. [Unity guide](../unity/top.sealoong.sensa/README.en.md), [automation](../unity/top.sealoong.sensa/AUTOMATION.en.md), [GPU experiments](../unity/top.sealoong.sensa/GPU-TRACKING.en.md), [Avatar tools](../tools/unity-avatar-lab/README.en.md), [World tools](../tools/unity-world-lab/README.en.md)

## Service, configuration and API

Configuration defaults to `config.json` beside the application; `SENSA_CONFIG_PATH` selects another location. Normalization, a unique default profile, destination conflicts and reference repair are centralized. Saves serialize disarming, stopping, applying/reconnecting and persistence, restoring configuration/connections on failure. [Configuration](https://github.com/SeaLoong/Sensa/blob/main/src/Configuration/AppConfig.cs), [transaction](https://github.com/SeaLoong/Sensa/blob/main/src/Application/ConfigurationUpdate.cs)

HTTP binds loopback by default. `GET /api/session` establishes an HttpOnly/SameSite=Strict browser cookie. LAN access requires explicit `SENSA_ACCESS_TOKEN`, accepted as Bearer or a Basic password. Origin/Host/cross-site checks prevent cross-site control. Only HTTPS encrypts transport; plain HTTP should not be exposed directly to the internet. HTTP/WS messages have size, concurrency and send-timeout limits. [Access policy](https://github.com/SeaLoong/Sensa/blob/main/src/Hosting/LocalAccessPolicy.cs), [host](https://github.com/SeaLoong/Sensa/blob/main/src/Hosting/SensaHost.cs)

| API group | Paths and operations |
| --- | --- |
| Configuration/state | GET/PUT `/api/config`; GET `/api/state/overview`, `/api/state/logs`, `/api/meta/serial-ports` |
| Input | PUT `/api/input/mode`, `active`, `manual`; DELETE `manual`; PUT `osc/source`; POST `oscquery/refresh` |
| Script | POST `/api/input/script/load`, `play`, `pause`, `stop`, `action-prev`, `action-next`; PUT `configure`, `seek`; DELETE `/api/input/script` |
| Recording | POST `/api/recording/start`, `stop`, `export` |
| Runtime | POST `/api/control/runtime/emergency-stop`, `clear-emergency` |
| Named output | POST `/api/control/output/{outputId}/connect`, `disconnect`, `scan-start`, `scan-stop`, `device-info-refresh` |
| Realtime | `/api/ws`; request `{id, method, path, body}`, response `{id, ok, data}`, plus state pushes |

HTTP uploads use multipart; WS script loading uses fileName/content. Both enter one command implementation. Legacy loop and primary-output-by-type aliases remain; multi-output clients should use outputId. Overview includes runtime, input.script, OSC sources/parameters/Query/Hub, outputs, spatial status, recording and signals. Compatibility mirror fields are not separate runtime states. [Routes](https://github.com/SeaLoong/Sensa/blob/main/src/Application/SensaApplication.cs), [request contracts](https://github.com/SeaLoong/Sensa/blob/main/src/Hosting/ApiContracts.cs)

Retained fields do not imply connected features: dynamic WebUi.Title, per-device Intiface DeviceRoutes, special backend behavior for IsOgbSocket/IsOgbPlug, boolean PreferSpeedMode encoding selection, or automatic ObservedMin/Max calibration suggestions. Follow the actual call chain.

## Engineering and source index

| Area | Entry points |
| --- | --- |
| Startup/control | [Program](https://github.com/SeaLoong/Sensa/blob/main/src/Program.cs), [Hosting](https://github.com/SeaLoong/Sensa/tree/main/src/Hosting), [Application](https://github.com/SeaLoong/Sensa/tree/main/src/Application) |
| Input/processing | [OSC](https://github.com/SeaLoong/Sensa/tree/main/src/Input/Osc), [Script](https://github.com/SeaLoong/Sensa/tree/main/src/Input/Script), [Signals](https://github.com/SeaLoong/Sensa/tree/main/src/Signals), [Runtime](https://github.com/SeaLoong/Sensa/tree/main/src/Runtime) |
| Output/recording | [Motion](https://github.com/SeaLoong/Sensa/tree/main/src/Motion), [Outputs](https://github.com/SeaLoong/Sensa/tree/main/src/Outputs), [Recording](https://github.com/SeaLoong/Sensa/tree/main/src/Recording) |
| Browser | [Web](https://github.com/SeaLoong/Sensa/tree/main/src/web), [architecture responsibilities](architecture.en.md) |
| Unity/scenes | [Unity package](https://github.com/SeaLoong/Sensa/tree/main/unity/top.sealoong.sensa), [Avatar Lab](https://github.com/SeaLoong/Sensa/tree/main/tools/unity-avatar-lab), [World Lab](https://github.com/SeaLoong/Sensa/tree/main/tools/unity-world-lab) |
| Verification/releases | [scripts](https://github.com/SeaLoong/Sensa/tree/main/scripts), [tests](https://github.com/SeaLoong/Sensa/tree/main/tests), [workflows](https://github.com/SeaLoong/Sensa/tree/main/.github/workflows) |

Desktop builds include Web resources for six platform targets; Unity ships separately. Installers preflight managed sources and preserve user edits/scenes; paid models are not distributed. Verification selects affected work and reuses successful local receipts; CI recovers unfinished product work and retains ten prereleases. Test implementations are not evidence of local, Unity, client or hardware success. Use reports for the actual commit. [Development/releases](development.en.md), [E2E and baseline review](e2e.en.md)

[Home](../README.en.md) · [Positioning](positioning.en.md) · [WebUI visual aesthetics and quality evidence](ui-quality.en.md)
