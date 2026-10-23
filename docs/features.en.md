# Feature reference

[简体中文](features.md) | **English**

This page summarizes implemented features and their operating conditions. Use the [guide](guide.en.md) for operation, [routes](usage-scenarios.en.md) for selection and [dictionary](osc-parameters.en.md) for protocol values. Sensa processes input signals and routes results to devices, applications and recording files. [Inputs, computation and outputs](signal-pipeline.en.md)

## Browser workbench

| Area | Capabilities |
| --- | --- |
| Persistent header | Realtime session, actual mode, input permission, emergency stop/clear, language/help |
| Control | Browse/apply input, twelve-axis manual, scripts, outputs, readiness and L0 recording |
| OSC mappings | Five built-ins/custom presets, reusable computed signals, replace/append, draft save/restore, sources/roles/curves/ranges/simulation |
| OSC parameters | Separate browse/use source, full-catalog search, at most 100 rows per page, freeze/categories/pins, FT-prefix display, meaning and add mapping |
| OSC settings | UDP receiver, source, timeout, OGB heartbeat, OSCQuery, service advertisement and Hub |
| Experimental diagnostics | Root/Point/Handle/Pose, reasons/local values, endpoint calibration and explicit permission |
| Pipeline | Multi-source computation, temporal/event processing, output bindings, session recording/replay and complete-plan import/export |
| Settings | Twelve-axis profiles, defaults/references and structured logs |

Common actions stay visible; less frequent options can be expanded. The header keeps emergency stop available while content scrolls independently, and each output row groups its name, target and actions. Advanced settings expand; unloaded scripts show only import. Drafts differ from saved configuration and survive language changes. [Languages](languages.en.md) · [Visual rules](ui-quality.en.md)

The [standalone explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) has eleven scenes with true 3D, XZ/isometric SVG, precise sliders, plane-constrained target dragging, live values and Shader bits. Choose actual parameter names to observe readings as a target approaches, enters or meets a contact region, then use those readings to choose a mapping. Bundled Three.js works offline and falls back to SVG without WebGL.

Same-origin tabs first share a realtime connection through SharedWorker, or through a tab holding Web Locks and exchanging messages over BroadcastChannel. When neither method is available, each page keeps one connection. Requests and drafts remain independent, and each page uses a reference-counted singleton. Page-cache restoration reattaches subscriptions. [Connection behavior](signal-pipeline.en.md#pages-and-shared-connections)

## Runtime and inputs

Actual mode is Manual/Osc/Script/Combined. Combined lets configured source kinds contribute together. Browsing preserves the applied mode. Mode changes, script replacement and configuration saves disarm/stop first. Emergency stop latches; clearing does not resume. Connecting grants no permission, although an already active input can send. Startup restores no motion, enabled outputs or scripts.

- **Manual:** twelve axes, once/follow edits, clear overrides, profile-based or explicit Interval(ms)/Speed. Following edits is not automatic oscillation.
- **Script:** skip invalid actions, retain the last duplicate timestamp, then sort; reject empty valid content. L0 interpolation, 0.1–4×, loops/A–B/timecodes/keyframes/density. Pause/stop/unload stops automatic frames; explicit permitted seeks may send. An injected clock retains fractional milliseconds. No media synchronization.
- **OSC:** UDP Float/Int/Bool, nested bundles, Avatar lifecycle and standard-prefix stripping. Reject non-finite values, bound catalogs and expire sources. Forwarded timetags do not imply full scheduling.
- **Combined:** bindings can use manual/script readings, OSC/tracking, device feedback, constants and reusable calculations together.

Gate/spatial invalidity stops without stale same-axis fallback. Ordinary OSC timeout defaults off; positive relevant-data expiry latches emergency stop. Spatial models have separate ages. [Runtime](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs) · [Script](https://github.com/SeaLoong/Sensa/blob/main/src/Input/Script/FunscriptPlayer.cs)

## Signal interpretation and network tools

Paths support exact matches, full-segment `*`, cross-segment `**` and semicolon/newline aliases. Sources remain isolated; Avatar changes clear values/learning and stop OSC. FT hiding only recognizes `FT/` or `v2/` after stripping the standard prefix; mapped/pinned values remain, without blendshape-name guesses.

Calibration, inversion, Linear/EaseIn/EaseOut/SCurve and output intervals precede role fusion. Same-role inputs prefer higher normalized values, breaking ties by intensity or distance from midpoint; modify only present axes. Every GateEnable must be open. DepthOverride may replace depth.

**Computed signals** combine inputs before calibration, using weighted average, average, sum, difference, product, ratio, minimum, maximum or magnitude. Inputs may be OSC parameters, solved position/velocity metrics, manual/script readings, device feedback, constants or other computed signals; several mappings and output bindings can reuse one result. Temporal operations add smoothing, thresholds, delays, rate/peak readings, events, durations and generated waveforms. The backend checks unique source, validity and oldest sample age, and supplies live results for the saved configuration. Save computations and mappings together; validity propagates to dependent bindings, with existing axis mappings retaining their motion gates. [Setup and examples](computed-signals.en.md)

| Role | Target |
| --- | --- |
| Depth/Surge/Sway | L0/L1/L2 |
| Twist/AngleX/AngleY | R0/R1/R2 |
| V0/V1/V2 | Same-name vibration |
| Auxiliary/Auxiliary1/Auxiliary2 | A0/A1/A2 |

OgbDepth prioritizes **SPS2 · PenOthersNewRoot / PenOthersNewTip**, estimating length from a same-instance pair and unsaturated samples before converting to a depth trend; incomplete learning yields zero. Missing or both-zero channels permit **SPS1 · PenOthers / PenOthersClose**, using its depth signal and published proximity condition. OgbTouch combines Touch/Plug Frot with the corresponding Close. Socket Frot and independent Zones read intensity directly. The five built-ins cover OGB depth/vibration, Contact position/speed and PB stretch. [OGB](ogb-compatibility.en.md) · [Presets](presets.en.md)

OSCQuery supports HOST_INFO/trees/LISTEN, optional polling and local receiver advertisement. Hub offers multiple UDP targets, source filtering, event/fixed-rate merging and statistics, preserving unconsumed bundle structure. OGB_ENABLED defaults off. When enabled, it sends true to the configured target every five seconds during OSC reception and attempts false on stop, maintaining Avatar parameter publication.

## Outputs, profiles and recording

TCode provides 115200/8N1 serial, friendly port names, D0/D1/D2 queries, UDP/TCP incremental encoding, required refresh and stop. Each output owns enablement, destination and a profile. Twelve axes support Min/Max, RemapMin/Max, MaxSpeed, Invert, Normal/Locked/Ignored, LockValue, None/Interval/Speed and RampType. Ignored does not mean centered.

Intiface uses Buttplug WebSocket, scanning and feature discovery. Position selects timed/raw commands by capability and transforms L0 as 1−L0. Vibration independently selects V0/V1/V2/explicit L0, defaulting to V0; tiny-to-zero changes send zero, and vibration-only devices work. New outputs use external Central; explicit managed configurations remain, but no engine is bundled. Changing a connected vibration axis rebuilds the client through the save transaction. [Outputs](https://github.com/SeaLoong/Sensa/tree/main/src/Outputs)

Output bindings add **OSC parameter**, **DG-LAB**, **HTTP JSON**, **WebSocket JSON**, **MQTT**, **MIDI CC** and **Recording** destinations. Each selects source, value conversion, target range, stop value and sending rate. OSC has a VRChat write-back preset; DG-LAB uses the 4 APP's V4 pairing/device/task protocol. Protocol adapters encode destination operations while transports own delivery and cancellation. [Output configuration](signal-pipeline.en.md)

The L0 recorder captures pre-distribution motion targets, preserves final holds, ends at 100000 frames and exports simplified funscript. Active export stops that recording; restart confirms clearing. Recording outputs separately save selected signals and results in JSON Lines or CSV, with loaded-session replay providing raw readings as signal inputs. Complete-plan import/export groups mappings, axis profiles, computations and output settings; imported outputs start disabled. [Recorder](https://github.com/SeaLoong/Sensa/blob/main/src/Recording/MotionRecorder.cs)


## Unity and spatial experiments

Spatial motion defaults blocked. SPS four-anchor tracking `P0..P3+Sample` uses dedicated root markers, AvatarRootLocal anchors and scale guards; Sample defaults to 1000 ms, capped at 1250 ms. Contact direct tracking (SDK Beta) uses one dedicated own-root Sender and one Receiver, publishes twelve `Sensa/Contact/<id>/…` fields, and provides AvatarRootMeters position plus contact-point velocity. Sample change age is at most 1000 ms; Radius follows ScaleFactor with a 3 m guard. SensaPoint supports X/Y/Z/Distance and VelocityX/Y/Z/Speed/ProximitySpeed with existing calibration and stop behavior. [Beta prerequisites and source evidence](contact-sdk.en.md). Native Shader `Frame+XYZ+Valid` uses one Camera/skinned point, an explicit ROI bridge and at most 500 ms of change age; diagnostics create no point. Independent Point/Handle/Pose use positions relative to a reference object and check the oldest participating channel. Their coordinates are relative to the Avatar or selected reference objects, ready for calibration into local movement. [Positioning](positioning.en.md)

NDMF generates permitted native components and removes authoring scripts. Automatic SPS supports Dedicated/Exclusive and an explicit root tracking method: SPS four-anchor tracking by default or Contact direct tracking with the supported beta SDK. Independent Contact authoring also supports explicit Sensa/native roots without VRCFury; single-point position/velocity is available, with multi-point orientation left for later work. Independent SPS four-anchor tracking authoring selects actual roots. SensaComponent, PB and independent Point/Handle/Pose retain their own models. GPU Model Probe provides Editor model snapshots for checking author settings. Avatar/World Labs provide capability scenes, menus/placement and SDK/ClientSim/PlayMode entry points using licensed resources. QuickStart is internal only. [Unity](../unity/top.sealoong.sensa/README.md) · [Labs](lab-workflow.en.md)

## Configuration, access and API

Configuration defaults to `config.json` beside the program, overridden by `SENSA_CONFIG_PATH`. Defaults, destination conflicts, reference repair and persistence are centralized. Saves serialize disarm/stop/reconnect and restore configuration/connections on failure.

HTTP defaults to loopback. `GET /api/session` issues an HttpOnly/SameSite=Strict cookie. LAN requires explicit `SENSA_ACCESS_TOKEN`, using Bearer or the Basic password; Origin/Host/cross-site checks apply. HTTP is unencrypted and unsuitable for direct internet exposure. Message size, concurrency and send time are bounded. [Access policy](https://github.com/SeaLoong/Sensa/blob/main/src/Hosting/LocalAccessPolicy.cs)

| API | Operations |
| --- | --- |
| Configuration/state | GET/PUT `/api/config`; GET `/api/state/overview`, `/api/state/logs`, `/api/meta/serial-ports` |
| Input | PUT `/api/input/mode`, `active`, `manual`, `osc/source`; DELETE manual; POST oscquery/refresh |
| Script | POST load/play/pause/stop/action-prev/action-next; PUT configure/seek; DELETE `/api/input/script` |
| Recording/runtime | POST `/api/recording/start\|stop\|export`, `/api/control/runtime/emergency-stop\|clear-emergency` |
| Output | POST `/api/control/output/{outputId}/connect\|disconnect\|scan-start\|scan-stop\|device-info-refresh` |
| Realtime | `/api/ws`: {id,method,path,body} requests, {id,ok,data} responses and state pushes |

Script HTTP uses multipart; WS uses fileName/content through the same command. Legacy loop/type-output aliases remain, but multi-output clients use outputId. Retained fields for dynamic WebUi.Title, Intiface DeviceRoutes, special IsOgbSocket/Plug behavior, PreferSpeedMode encoding and ObservedMin/Max suggestions **do not establish wired capabilities**. [Routes](https://github.com/SeaLoong/Sensa/blob/main/src/Application/SensaApplication.cs)

[Architecture](architecture.en.md) explains source boundaries; [development/release](development.en.md) covers checks, builds, previews, stable releases and documentation deployment. Unit checks and browser E2E run before publication. Check direction, response and stopping with the client and device used for actual linkage.
