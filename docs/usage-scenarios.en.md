# Usage scenarios: choose a route, complete it and verify it

[简体中文](usage-scenarios.md) | **English**

This guide answers “What do I have, and which route should I use?” rather than listing the API again. Its research baseline is [04f6f488](https://github.com/SeaLoong/Sensa/tree/04f6f488d77e3f562ba313352395c6913dc4e662); external sources were checked on 2026-10-19. Later corrections, including recording end times, follow the current implementation and contracts. See the [user guide](guide.en.md) for controls and the [feature reference](features.en.md) for fields.

**A sent target is not a measured device position.** Verification has three layers: local contracts cover algorithms and lifecycles; CI browsers and mock wire cover the UI through simulated transports; your Avatar, VRChat client, firmware and mechanical behavior each require separate acceptance. [Runtime](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs), [output coordinator](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/OutputCoordinator.cs), [E2E rules](e2e.en.md)

## Choose a route

| Available setup or goal | Preferred route | Result | Main boundary |
| --- | --- | --- | --- |
| Check connection, direction and travel | Manual → TCode or Intiface | Send a deliberate target, or follow adjustments | No VRChat required; “Send continuously” does not generate back-and-forth movement |
| Existing `.funscript` or motion JSON | Script → L0 | Interpolated playback, speed, loops, A–B, seeking and stepping | No video/audio synchronization; not a twelve-axis script player |
| Verify world → own Avatar → Sensa | QuickStart | Five Depth levels and an Active gate | Requires your test Avatar and world; no public world address is provided |
| Own Avatar exposes native PhysBone parameters | Stretch + IsGrabbed → scalar mapping | Stretch controls L0; release closes the gate | No position reconstruction; not bone XYZ |
| Modern SPS Socket with NewRoot/NewTip | SPS Socket radial estimate | Normalized radial proportion after length learning | Requires generated Haptics; not accurate axial insertion depth |
| Modern SPS Plug with PenOthers | Plug proximity → scalar mapping | A larger target as proximity increases; direction can be calibrated | Root proximity is not tip position; no default inversion |
| Convert contact/friction into vibration | TouchOthers/FrotOthers → V0 | Contact intensity drives a vibration axis | Intiface defaults to V0; depth-to-vibration requires explicit L0 selection |
| Only legacy TPS/DPS visuals | Inspect parameters, then upgrade/generate Haptics or use an existing scalar | Integration is possible when an interpretable parameter exists | Shader compatibility does not imply OGB parameters; no universal legacy path template |
| Any numeric parameter with a known meaning | Custom Direct mapping | Calibration, curves, inversion, gates and multiple-input fusion | Fix the instance/source; unknown numbers are not automatically distances |
| Research local points or poses | Contact spatial experiment | Candidate ReferenceLocal positions, poses and residuals | Output is disabled by default; common-Sender/shared-frame guarantees are absent |
| Research curved SPS models | GPU Model Probe or image bridge | Editor model snapshots and encoded-transport diagnostics | No general complete production route from real SPS in an uploaded Avatar to desktop |
| Retain motion or distribute it to another application | L0 command recording or OSC Hub | Export motion files or forward the selected source | Recording is not device feedback; Hub is not another device-motion input |

See the [preset reference](presets.en.md) for the five built-in presets and paths. Complex experiments should not be prerequisites for an initial device connection test.

## A common starting point

1. Add an output under Control, or leave outputs empty while inspecting software behavior. For TCode, choose an axis profile that matches the firmware and actual calibration. Connecting does not activate input.
2. Selecting an input tab only browses it. Explicitly apply the input mode; importing a script switches to Script and closes input.
3. Check the actual source, saved mappings, direction and gates before enabling input. Recheck permission after saving configuration, changing modes or replacing a script.
4. Separately establish what was received, what target is prepared, whether transmission succeeded, and what the device physically did. The first two graphical previews cannot prove the last.

Disabling input sends a stop. Emergency stop also latches; clearing it never resumes motion automatically. Stop does not mean homing or removing hardware power. The common command entry and runtime enforce these rules independently of disabled button styling. [Command entry](https://github.com/SeaLoong/Sensa/blob/main/src/Application/SensaApplication.cs), [activation contract](adr/0001-control-and-input-activation.md), [input lifecycle tests](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/input-safety.spec.js)

## Choose an output

| Output | Prerequisites and operation | Command behavior | Limits and evidence |
| --- | --- | --- | --- |
| TCode serial | Firmware understands TCode; select the actual port, 115200/8N1, save and enable | Encode axes through the selected profile; query D0/D1/D2 device information | Device information is not position feedback; a mock serial peer does not verify real drivers, power, firmware or travel |
| TCode UDP | Correct destination host/port and network firmware | Send axis commands and stop over UDP | Local “Connected” does not prove a remote device exists; no remote receipt acknowledgment |
| TCode TCP | A remote TCP service is running | Stream axis commands and stop | D-command readback is not implemented; connection does not prove mechanical execution |
| Intiface/Buttplug | Start Central first, enter its actual WebSocket address and leave engine management off; then scan | Send commands for advertised Position, HwPositionWithDuration and Vibrate features; stop uses the server’s stop capability | No bundled engine or complete twelve-axis/per-device routing; an output iterates over its connected devices |

TCode applies travel mapping, limits, inversion and speed through each output’s axis profile. The existence of a configuration field does not prove Intiface uses the same TCode encoding rules. [TCode encoder](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/TCode/TCodeEncoder.cs), [Intiface implementation](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/Intiface/IntifaceOutputClient.cs), [output contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OutputContracts.cs)

**Intiface has an explicit vibration source.** Each output’s `vibrationAxis` defaults to V0 and can select V1, V2 or L0. Vibration-only devices and devices with both position and vibration use the same selection; capability discovery no longer silently changes the input axis. Touch→V0 and manual V0 use the default. To turn funscript/depth into vibration, explicitly select L0. Any transition from nonzero vibration to zero sends zero, even below the ordinary change threshold. Position features still use `Clamp01(1−L0)`; do not assume TCode direction settings or physical scales apply to them. [Routing](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/Intiface/IntifaceOutputClient.cs), [feature contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/IntifaceContracts.cs)

New outputs default to `ManageEngineProcess=false` and connect to a Central service you already run. Existing explicit true settings are retained. Enable management only when an external engine is installed and you want Sensa to manage its process; the option does not mean the distribution includes an engine. [Connection prerequisites](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/OutputCoordinator.cs), [configuration normalization](https://github.com/SeaLoong/Sensa/blob/main/src/Configuration/AppConfig.cs)

The external protocol selects commands according to device capabilities. Central discovers and connects hardware; Sensa is its client. [Official Intiface quick start](https://intiface.com/docs/intiface-central/quickstart/), [Buttplug devices and features](https://buttplug.io/docs/dev-guide/architecture/client-device-in-depth/)

## Route 1: establish a manual command baseline

**Prerequisites:** Access to Sensa; an output and calibrated range if testing hardware. No Avatar, SPS or Unity dependency.

1. Apply Manual and inspect L0/L1/L2 targets. Expand rotation, vibration and auxiliary axes when needed.
2. Enable input, then Send once. Check logical values, each output target and physical direction.
3. Select Send continuously and adjust sliders. Sensa coalesces adjustment events; it does not generate oscillation.
4. Expand Send settings to change duration/speed; disable input when finished.

**Result:** Manual input provides twelve-axis targets. TCode then applies each output’s profile: the test L0 400–600 profile maps a logical midpoint to about 500. This is a numeric range, not hardware calibration. Intiface uses only its implemented axes/features.

**Verified:** CI operates native sliders/number fields, checks UDP, TCP, pseudo-serial and Intiface mock commands, and verifies that emergency stop does not resume old motion. **Not verified:** Your device’s direction, travel time or stopping capability. [Manual implementation](https://github.com/SeaLoong/Sensa/blob/main/src/web/app.js), [motion contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/MotionContracts.cs), [workflow regression](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/flows.spec.js)

## Route 2: play an existing funscript

**Prerequisites:** Valid `actions` with time in milliseconds and position from 0–100. Sensa organizes valid actions and rejects empty or unusable content.

1. Browse Script and choose a file. Import switches the actual mode to Script and leaves input closed.
2. Inspect the timeline, speed and loop range. Seek to the intended start with input off, then explicitly enable it.
3. Play, pause, replay or use Seek and A–B for an exact segment. Shortcuts apply only in appropriate non-form locations.
4. Recheck permission after replacing a file; unload ends the current script.

**Result:** Timeline interpolation produces L0, with 0.1–4× speed and whole-script/A–B loops. Pausing stops automatic output, but explicit seeking/keyframe stepping can send targets while input remains enabled. Stop resets the script cursor; it does not mean the device moves to its midpoint.

**Limits:** No video player or media-clock synchronization. Other custom file fields do not constitute a multi-axis motion protocol. Long-script timing still depends on application, network and device capabilities.

**Verified:** Controlled-clock interpolation/boundary/loop contracts, plus import/play/pause/step/unload browser-to-mock-wire regression. **Not verified:** Third-party player synchronization or physical tracking error. [Player](https://github.com/SeaLoong/Sensa/blob/main/src/Input/Script/FunscriptPlayer.cs), [script contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/ScriptContracts.cs), [workflow regression](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/flows.spec.js)

## Route 3: verify your VRChat route with QuickStart

**Prerequisites:** Your uploadable PC Humanoid Avatar, Avatars SDK/NDMF dependencies and a test world. No ready-made public world address is supplied. An ordinary SPS Avatar does not automatically include the QuickStart Receiver.

1. Add Quick Start World Receiver using [first-time setup](quick-start.en.md), upload the Avatar and wear it.
2. Enable OSC/Contacts in VRChat. Apply OSC mode in Sensa and listen on the default `127.0.0.1:9001`.
3. Replace the draft with Link test and save, keeping only Depth + Active. Check actual values under Parameters.
4. At your own “00 START HERE” station, test the five levels and STOP. Verify without outputs first, then connect a calibrated device.
5. Disable input when finished. Replace old mappings when changing routes so the QuickStart Active gate does not remain.

**Result:** Receive approximately 0/.25/.5/.75/1 on `Sensa/QuickStart/Depth`, plus Active. Active=0 closes the gate. TOUCH brings your own right-hand bone origin near the test object. The world’s Expected display is a prediction; actual OSC is evidence of the route.

**Limits:** This is neither an SPS installer nor an accurate position tracker. Automatic station-exit/timeout completion still depends on the client emitting Active=0. Build & Test supports OSC, but VRChat does not save the same automatic configuration file as for a published Avatar; missing configuration JSON does not prove that all parameters are absent.

**Verified:** Generator/protocol contracts and simulated five-level OSC/gate-stop regression. **Not verified:** This user’s uploaded Avatar, real client Contacts or hardware. [QuickStart authoring](https://github.com/SeaLoong/Sensa/blob/main/tools/unity-avatar-lab/Editor/QuickStartAvatar.cs), [world station](https://github.com/SeaLoong/Sensa/blob/main/tools/unity-world-lab/Runtime/QuickStartStation.cs), [VRChat OSC overview](https://docs.vrchat.com/docs/osc-overview), [Avatar parameters](https://docs.vrchat.com/docs/osc-avatar-parameters)

## Route 4: native PB Stretch without spatial reconstruction

**Prerequisites:** Your Avatar’s PhysBone allows grabbing/stretching and has a Parameter prefix. Actual Animator/OSC parameters include `<prefix>_Stretch` and `<prefix>_IsGrabbed`. Stretch is a 0–1 scalar relative to maximum stretch, not a position in centimeters. [Official PhysBone parameters](https://creators.vrchat.com/common-components/physbones/)

1. Apply OSC and confirm the real prefix and source in Parameters.
2. Copy PB · Stretch and replace both test paths with the actual Stretch/IsGrabbed paths.
3. Map Stretch through Direct→Depth and IsGrabbed through GateEnable.
4. Set Stretch input minimum/maximum using the relaxed and intended stretched readings, then check output travel and inversion.
5. Save and enable input. Inspect commands while grabbing/stretching; release should close the gate.

**Result:** A stretch scalar controls L0. Four Receivers and experimental spatial input permission are unnecessary.

**Do not confuse two kinds of calibration.** This route calibrates one scalar’s input range. Collecting endpoints in centimeters under Experimental diagnostics to generate a SensaPoint mapping belongs to Point/Handle below; it does not add reliable XYZ to native Stretch.

**Verified:** Official parameter definitions, the current preset, mapping and gate contracts. **Not verified:** This Avatar’s PB declarations/OSC output, grab permissions or client behavior. [Preset data](https://github.com/SeaLoong/Sensa/blob/main/src/web/data/osc-presets.json), [signal pipeline](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SignalPipeline.cs), [preset contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/PresetContracts.cs)

## Route 5: SPS, OGB and legacy TPS parameters

First inspect **what your own side actually outputs**, then choose a path. SPS2 deformation can work without Contacts; legacy TPS/DPS visual compatibility also does not guarantee OGB Haptics parameters. The inspected VRCFury generator creates these Receivers only for desktop builds when Haptics generation conditions are met. Touch/Frot additionally depend on the relevant regions being generated. [Official SPS documentation](https://vrcfury.com/sps/), [Socket generation conditions and paths](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L151-L274)

| Available local data | Route | Command result and what it cannot establish |
| --- | --- | --- |
| `OGB/Orf/<id>/PenOthersNewRoot` and the same instance’s NewTip | Copy the Socket radial preset; preferably fix a concrete id; approach from outside so the length sphere is initially unsaturated, then test | Paired NewRoot/NewTip learn length and yield a radial proportion; NewTip is still a concentric root length sphere, not a tip marker |
| `OGB/Pen/<id>/PenOthers` | Copy Plug proximity and calibrate the actual zero/upper bound | Direct root-proximity mapping without default inversion; not accurate insertion depth |
| TouchOthers/FrotOthers | Copy the touch preset; confirm V0 and the actual output’s vibration routing | Contact intensity becomes vibration, without position/orientation |
| Only corresponding Self parameters | Copy a user preset and replace paths with actual Self paths | An Others template does not automatically become Self; test according to your interaction permissions |
| Only legacy TPS/DPS or aliases from older Sensa authoring | Add an existing path with a known meaning from Parameters; upgrade/regenerate Haptics when needed | Do not reuse removed body-part/angle templates; adding aliases cannot create missing observations |

The sequence remains: confirm parameters → replace draft → inspect range/gates → save → select the control source → enable input. Do not retain QuickStart Active in a configuration that only produces SPS.

**Limits:** Radial distance changes with lateral offset and tilt. Multiple matching Senders, different parameter update times and target changes affect estimation. Wildcards help discover parameters; fixed instances support interpretable everyday control. One inspected upstream snapshot does not guarantee all future plugin versions.

**Verified:** Pinned upstream generator source, project path/direction contracts and simulated NewRoot/NewTip estimation regression. **Not verified:** Your installed version’s build output, both sides’ interactions, Shader/Contact permissions or true insertion geometry. [Plug source](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L176-L242), [estimator](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SpsDepthEstimator.cs), [preset contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/PresetContracts.cs)

## Route 6: custom scalars, sources and forwarding to applications

**Prerequisites:** Known parameter meaning, units, zero and range. By default VRChat sends to 9001 and receives on 9000; Sensa HTTP 5086 is separate. Avatar parameters generally transmit changes, so silence while stationary is not automatically disconnection. [VRChat OSC](https://docs.vrchat.com/docs/osc-overview), [parameter output rules](https://docs.vrchat.com/docs/osc-avatar-parameters)

1. Apply OSC, confirm listening/source, then find the value in Parameters and inspect its meaning before mapping.
2. Use real bounds, inversion and curves to obtain the intended axis. Local simulation helps isolate mapping problems; turn it off afterward to inspect actual parameters.
3. Select the control source with Use source. Browse source only filters the list. FT parameters are hidden by the FT/v2 namespace prefixes by default and can be shown explicitly. Freezing the list does not stop input or devices.
4. Save mappings. Every GateEnable input must be valid; multiple inputs on one axis use the defined fusion rather than simple addition.
5. Configure Hub targets if another application needs the same source, then check that application’s parameters. Avoid forwarding the receiver back to itself.

**Result:** Segment wildcard `*`, cross-segment `**` and aliases are supported. Calibrated/curved values produce axis targets. Hub forwards the selected source by event or fixed rate. OSCQuery supports directory discovery/subscriptions and optional polling fallback.

**Limits:** A visible OSCQuery directory does not prove valid live values. Hub forwarding is not motion input. Without a fixed source, different senders must not be casually combined into one control object. Ordinary scalar timeout is off by default; enabling it for a change-only source stops stationary input. A fixed forwarding rate cannot manufacture freshness in the upstream sensor.

**Verified:** Source selection, parameter browsing, FT prefixes, gates, timeout and Hub contracts/mock regression. **Not verified:** External application ports, network blocking or every plugin’s OSCQuery implementation. [OSC input](https://github.com/SeaLoong/Sensa/tree/main/src/Input/Osc), [OSC contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OscContracts.cs), [parameter and Hub workflows](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/flows.spec.js)

## Route 7: bounded Contact Point/Handle/Pose experiments

**Prerequisites:** You can rebuild your Avatar, with correct generated parameters, dimensions, positive uniform scale and reference bones, and accept the observability limits. Everyday PB Stretch does not need this route.

1. Generate Point/Handle or explicitly paired Root/Tip/Side using Unity authoring components. Before upload, check actual Animator parameters and Contact budgets.
2. Apply OSC. Under Experimental diagnostics, first inspect only the data, residuals, blocked reasons and sample age.
3. For Point/Handle, confirm grab/interaction gates and collect the intended 0%/100% endpoints. Inspect the draft, replace and save.
4. Explicitly allow experimental spatial input only when testing motion, then re-enable input. Root/SharedRoot remain diagnostic only.
5. Stop the experiment on missing channels, stale data, invalid gates or ambiguous targets. Extending timeout indefinitely does not establish reliability.

**Result:** Tetrahedral/multipoint proximity values fit ReferenceLocal coordinates; Pose derives straight-line orientation. The default oldest contributing sample limit is one second, overridden by a positive input timeout. A fresh packet on one channel cannot renew other stale coordinates.

**Limits:** True ranges from one point to four known noncoplanar anchors determine relative XYZ. Current Proximity lacks proof of common Sender/shared frame, and both four/eight-channel arrays can produce zero-residual ghosts. These relative distances also cannot recover whole-rig rigid motion, world position or a GPU-deformed surface. [Official Contacts](https://creators.vrchat.com/common-components/contacts/)

**Verified:** Geometry, ghost counterexamples, oldest-channel freshness and default blocking contracts, plus simulated Point/Handle calibration regression. **Not verified:** Real-client error, target identity, frame synchronization, headset or hardware positioning loops. See [positioning analysis](positioning.en.md) for the argument and future trusted batched-XYZ requirements; no general production protocol implements them yet. [Spatial contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/SpatialContracts.cs), [position observations](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SpsPositionTracking.cs)

## Route 8: verify GPU, Avatar and World routes separately

| Route | Currently executable path | Result and boundary |
| --- | --- | --- |
| Avatar build-time components | NDMF generates native Contacts/PB/Animator, followed by upload | Arbitrary desktop C# does not run inside the uploaded Avatar |
| World QuickStart/interaction stations | Native objects and Udon in your world cooperate with the Avatar Receiver | World displays or Udon truth do not automatically become Avatar OSC |
| Editor SPS GPU Model Probe | Select the actual rendering camera and matching Resolver/surface, inspect pinned dependencies, then export snapshots/PNG | Reads the model centerline/entry, not the final mesh; source-texture freshness and multiple cameras remain limited |
| Uploadable camera-only test rig | Render synthetic encoded tiles and decode externally | Proves encoded transport only, not that tiles came from real SPS |
| External image bridge | Existing PNG or an explicitly authorized desktop region → CRC/frame-order/freeze checks → explicit local OSC | No complete real-SPS producer inside an uploaded Avatar; bridge success does not establish practical surface tracking |

For existing snapshots:

```shell
python -X utf8 scripts/analyze-gpu-capture.py <capture.json>
python -X utf8 scripts/shader-osc-bridge.py --image <telemetry.png>
```

The first command analyzes the model only. The second decodes only by default and requires Pillow. OSC is sent only with an explicit `--port`; `--watch` enables continuous observation. The bridge checks advancing frames and emits Valid, but CRC/tile frame numbers do not prove the underlying SPS texture is a fresh frame. Do not connect motion based on one successful decode of a static PNG.

VRChat AsyncGPUReadback is a World Udon capability. An editor readback script cannot simply be attached to an uploaded Avatar, and GPU readback does not itself grant arbitrary UDP transmission. [Official AsyncGPUReadback](https://creators.vrchat.com/worlds/udon/vrc-graphics/asyncgpureadback/)

**Verified:** Offline geometry and encoding/CRC/frame-order contracts exist, along with controlled Unity experiment records. **Not verified:** The complete in-game real-SPS→desktop→device route for this build, PCVR headset visibility, cross-camera synchronization or surface ground truth. Accept stages independently; do not extrapolate World/Editor results to Avatars. [Experimental setup and existing evidence](../unity/top.sealoong.sensa/GPU-TRACKING.md), [bridge source](https://github.com/SeaLoong/Sensa/blob/main/scripts/shader-osc-bridge.py), [World capabilities](../tools/unity-world-lab/CAPABILITIES.md)

## Additional route: record, then replay

**Prerequisites:** One working input route, and an understanding that recording captures runtime L0 before output dispatch, not multiple axes, device position or acknowledged commands.

1. Start recording, then generate targets through the chosen route. Restarting starts a new recording rather than appending to an old file.
2. While active, Stop and export ends recording and downloads it; when stopped, export directly. Inspect timing and the final value by loading the file through the script route.
3. Stop holds the final value through the actual stop time. Empty recordings produce no actions, no extra endpoint is added within the same millisecond, and repeated stop does not extend duration.
4. Recording ends at 100000 frames. A later stop does not artificially extend a capture that has already ended.

**Result and limits:** Export produces simplified L0 actions, without hardware feedback, other axes, input/gate/stop events or a video clock. A final held value can retain its duration before stop even when motion is paused or no new target arrives. Stopping output or emergency stop does not automatically stop recording; inspect recording status.

**Verified:** Controlled-clock tests cover final-value holding through stop time, same-millisecond behavior, empty recording, capacity and repeated stop; browser regression checks the downloaded action data. **Not verified:** Reconstructing actual mechanical motion from the exported file. [Recorder](https://github.com/SeaLoong/Sensa/blob/main/src/Recording/MotionRecorder.cs), [lifecycle contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/RecordingLifecycleContracts.cs), [recording contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/RecordingContracts.cs)

## Diagnose at the correct acceptance layer

| Symptom | Check first | Do not conclude |
| --- | --- | --- |
| World Expected changes but parameters do not | New Avatar, Receiver, OSC/Contacts and the correct listening port | A successful world scene means the Avatar emitted data |
| Parameters exist but the target does not change | Saved mappings, actual mode, control source, gates, input permission and experimental blocking | A frozen graph means receiving stopped |
| Target changes but nothing is transmitted | Output activation, connection, duplicate-target conflicts, errors and device capabilities | A preview proves successful transmission |
| Commands were sent but hardware is stationary or reversed | Firmware protocol, power, actual range, inversion and the real destination | An open network socket proves execution |
| Input stops while stationary | Ordinary timeout/spatial oldest-channel age, and whether the source only sends changes | A longer timeout supplies shared-frame or identity guarantees |
| Intiface vibration does not follow the intended parameter | Selected V0/V1/V2/L0, corresponding mapping and the Vibrate feature | Vibration capability automatically identifies the intended source |

Explicit matching of inputs to device capabilities, understandable end-to-end blocked reasons and recording lifecycle are more useful improvements than more positioning templates without observation guarantees. Bind automated software evidence to a specific commit. Keep real Avatar, client and hardware behavior marked unverified until it has been separately checked.
