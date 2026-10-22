# Architecture and behavior contracts

[简体中文](architecture.md) | **English**

The backend turns one actual input into twelve-axis targets and distributes them through output configurations. The browser owns intentions and drafts; the backend owns permission, stopping, validity and save transactions. This page describes boundaries; see the [guide](guide.en.md) for operation and [glossary](../GLOSSARY.md) for terms.

## One command boundary

```mermaid
flowchart LR
  Browser --> HTTP[HTTP / WebSocket adapter]
  HTTP --> App[SensaApplication]
  App --> Config[ConfigurationUpdate]
  App --> Runtime[MotionRuntime]
  OSC[OSC / OSCQuery] --> Store[OscParameterStore]
  Store --> Runtime
  Script[FunscriptPlayer] --> Runtime
  Runtime --> Record[MotionRecorder]
  Runtime --> Output[IMotionOutput / OutputCoordinator]
  Output --> Devices[TCode / Intiface]
```

| Module | Rules it owns |
| --- | --- |
| [SensaApplication](https://github.com/SeaLoong/Sensa/blob/main/src/Application/SensaApplication.cs) | Shared command dispatch, mode/script/recording/connection operations |
| [ConfigurationUpdate](https://github.com/SeaLoong/Sensa/blob/main/src/Application/ConfigurationUpdate.cs) | Serialized validation, disarm, stop, reconnect and persistence; configuration/connection rollback |
| [MotionRuntime](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs) | Actual mode, permission, gates, fusion, freshness, request generations and stop |
| [IMotionOutput](https://github.com/SeaLoong/Sensa/blob/main/src/Motion/IMotionOutput.cs) | Send/stop seam replaceable by isolated tests |
| [OutputCoordinator](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/OutputCoordinator.cs) | Output types, profiles and transport lifecycle without exposing protocols to runtime |
| [OscParameterStore](https://github.com/SeaLoong/Sensa/blob/main/src/Input/Osc/OscModels.cs) | Sources, values, receive/change timestamps, sequences and Avatar lifecycle |

UDP and OSCQuery share Avatar-change cleanup, resetting caches/learning and stopping OSC. Unconsumed bundles preserve structure, order and timetags for forwarding. Input interpretation is not atomic timetag-based frame scheduling.

## Permission and stopping invariants

| Event | Required behavior |
| --- | --- |
| Browse navigation/input tabs | Keep actual mode and permission unchanged |
| Change mode, replace script, save configuration | Disarm/stop first; invalidate old pending requests |
| Emergency stop/clear | Latch stop; clearing does not reactivate |
| Pause/stop/unload script | Stop automatic frames/UDP refresh; explicitly permitted seek/step may still send |
| Gate/spatial invalidity | Stop without falling back to stale same-axis values |
| Startup | Do not restore input, enabled outputs, scripts or motion |

Connection grants no permission, but an already active input may send its valid current target to a new connection. Recording precedes distribution. Command telemetry, recordings and UDP sends do not establish mechanical execution.

## Signal and spatial validity

Ordinary scalar processing matches paths/source/role, then calibrates, inverts, curves, fuses and gates. OgbDepth/OgbTouch interpret external parameters without renaming their protocol. Spatial input has a separate default-off experimental permission.

| Family | Coordinate/freshness rules |
| --- | --- |
| Legacy Point/Handle/Pose | ReferenceLocal; oldest participating channel, including Handle grab; default 1000 ms or positive timeout |
| Contact direct tracking (SDK Beta) | AvatarRootMeters; one dedicated Self Sender/Receiver, complete twelve-field report, positive Proximity and supported Radius; Sample change age at most 1000 ms |
| Four-anchor tracking | AvatarRootLocal; known P0–P3 geometry, unsaturated inputs and residual checks; stationary P may cache, changing Sample defaults to 1000 ms, capped at 1250 ms |
| Native Shader | AvatarRootLocal; same-source contiguous Frame/X/Y/Z/Valid with Valid last; Frame change age at most 500 ms; bridge separately owns monotonicity/freeze/two-frame recovery |

A dedicated marker and unique channel keep each root measurement tied to its intended own target. Four-anchor distances locate one point in authored AvatarRootLocal units; Contact reports midpoint position and contact-point velocity in physical metre-based AvatarRootMeters. Contact position and velocity metrics share SensaPoint calibration, activation and invalidity stops. Its native report has no clock, sequence or stable Sender ID; Sensa Sample checks producer activity. [SDK contract and evidence](contact-sdk.en.md). [Positioning](positioning.en.md) and the [dictionary](osc-parameters.en.md) define protocols, equations and stop conditions.

## Unity authoring and tracking generation

Nine Unity authoring components store settings and implement SDK `IEditorOnly`. In NDMF Generating before MA's work in the same phase, `SensaPlugin` reads settings and creates Contacts, constraints and temporary animator/parameter/menu inputs for MA merging. `BuildContext.GetState` records completion per build; source scenes and authoring prefabs remain editable.

Four-anchor tracking, Contact direct tracking and Shader capture share this entry point while retaining their protocols. All three root prefabs accept an explicit Avatar Transform, SPS, Sensa Component or native Contact target. Root frames are read before removing any Sensa author component they reference. Native measurement components and reference Transforms remain in the uploaded result.

A read-only SDK checkpoint diagnoses remaining authors after the audited Fury processing and before default SDK cleanup. NDMF Optimizing separately checks author cleanup and Contact count at that point. See the [Unity build guide](unity-build.en.md) for phases, component/object EditorOnly behavior and official version evidence.

## Browser modules

React retains native controls, dialogs and semantic labels. TDesign styling requires neither MUI nor the TDesign React runtime. The header carries actual state/permission while content scrolls separately. Drafts differ from saved configuration.

| File | Responsibility |
| --- | --- |
| [configuration.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/configuration.js) | Normalize drafts, output references, conflicts and saves |
| [input-workflows.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/input-workflows.js) | Manual/script intentions and timecodes |
| [realtime-session.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/realtime-session.js) | Same-origin session, correlation, timeout, disconnect rejection/reconnect without replay |
| [osc-workspace.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/osc-workspace.js) / [osc-preview.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/osc-preview.js) | Preset drafts, matching, filters, preview and calibration |
| [i18n.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/i18n.js) | URL/preference/environment locale, document routing and text |
| [diagnostics.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/diagnostics.js) | Log/state filtering |

The standalone explorer uses local classic scripts, a pure model and bundled Three.js, with no application session/device dependency. Pages statically publishes Markdown and the same six explorer assets, outside the motion runtime.

## Verification seams

TimeProvider injects time. Isolated tests use virtual clocks, loopback ports and mock transports. Installers preflight managed files before writing and retain user changes; shared smoke tooling owns process cleanup.

CI requires units, full E2E and isolated native smoke before publication; browser/process checks use mock transports. World PlayMode and real-client checks are separate work. See [development and releases](development.en.md). EditMode, metadata and browser mocks do not prove uploaded-client or hardware behavior.
