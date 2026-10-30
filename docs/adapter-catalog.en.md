# Adapter catalog and package roadmap

[简体中文](adapter-catalog.md) | **English**

This catalog helps developers reuse Sensa components and plan community packages. The Node CLI, Electron and WebSensa share one TypeScript application, output coordinator and React workbench. Unity authoring/build packages remain C#. The eight TypeScript package names and one Python tool name below are candidates, with no published packages or reserved scopes. [Host architecture](adr/0011-shared-core-and-capability-adapters.md)

## Current implementation and source entries

| Entry | Responsibility |
| --- | --- |
| [`src/core/index.ts`](https://github.com/SeaLoong/Sensa/blob/main/src/core/index.ts) | Public source entry for `RuntimeEngine`, `ApplicationFacade`, `OutputCoordinator`, configuration, signals, tracking, scripts and recording |
| [`src/core/outputs/index.ts`](https://github.com/SeaLoong/Sensa/blob/main/src/core/outputs/index.ts) | Pure shared output coordination, codecs, feature routing, lifecycle and recording/replay |
| [`src/node/index.ts`](https://github.com/SeaLoong/Sensa/blob/main/src/node/index.ts) | `startSensa` local service, instances and launch options |
| [`src/node/inputs/index.ts`](https://github.com/SeaLoong/Sensa/blob/main/src/node/inputs/index.ts) | Protocol listeners, OSC/OSCQuery, discovery, sources and external-control sessions |
| [`src/node/outputs/index.ts`](https://github.com/SeaLoong/Sensa/blob/main/src/node/outputs/index.ts) | Node output factory, native ports and device APIs |
| [`src/websensa/browser-runtime.ts`](https://github.com/SeaLoong/Sensa/blob/main/src/websensa/browser-runtime.ts) | Browser-local host injecting storage/browser adapters and mounting the same Workbench |

The Node output factory registers **20 output types**; its capability inventory reports which are available:

| Group | Configuration types |
| --- | --- |
| TCode (4) | `TCodeSerial`, `TCodeUdp`, `TCodeTcp`, `TCodeWebSocket` |
| Devices/vendors (6) | `Intiface`, `Dglab`, `Handy`, `Autoblow`, `VacuGlide`, `Lovense` |
| Signals/files (6) | `OscParameter`, `HttpJson`, `WebSocketJson`, `Mqtt`, `Midi`, `Recording` |
| Bridges/interconnection (4) | `Bluetooth`, `BleBridge`, `SensaHttp`, `SensaWebSocket` |

Local inputs register **12 types**: `Buttplug`, `TCodeTcp`, `TCodeUdp`, `TCodeSerial`, `TCodeWebSocket`, `IntifaceDevice`, `JsonHttp`, `JsonWebSocket`, `LovenseHttp`, `HandyHttp`, `AutoblowHttp`, `VacuGlideHttp`. Separate OSC/OSCQuery services receive parameters. HTTP/WebSocket inputs share ports with longest complete-path routing. Browsers use the same core and their available transport subset. [Protocol inputs](protocol-inputs.en.md)

## Reused libraries and platform APIs

| Library/API | Repository role | Platform and license |
| --- | --- | --- |
| React/React DOM | Shared workbench components and rendering | Browser/Electron; MIT |
| esbuild | Browser, Node and Electron builds | Build tool; MIT |
| Three.js | Parameter explorer's 3D scene alongside SVG | Browser WebGL; MIT |
| qrcode-generator | Pairing QR codes | JavaScript; MIT |
| Mermaid tiny | Locally distributed documentation diagrams | Browser; MIT |
| `ws` | Production Node clients/listeners and test peers | Node; MIT |
| `bonjour-service` | OSCQuery mDNS publication, discovery and cleanup | Node; MIT |
| `proper-lockfile` | Configuration ownership and recovery | Node; MIT |
| `serialport` 13.0.0 | N-API serial binding | Node 24; MIT |
| `@julusian/midi` 3.8.1 | N-API MIDI port access | Node 24; MIT |
| Web Serial/Bluetooth/MIDI | Browser device discovery, selection and I/O | Provided by browser and OS |
| Bleak/Bless/PyWinRT/pyserial | Python BLE central/peripheral and serial bridges | Select by OS/role; retain each dependency's license |

`src/node/native-packages.ts` loads native serial/MIDI packages. SEA builds embed their dependencies, verify them and extract them to a private directory. Electron uses the same Node service rather than loading another binding in its renderer. Python bridge tools accompany portable archives, CLI installers and Electron; users prepare their interpreter and required dependencies. [Development and packaging](development.en.md)

## Further reuse candidates

The following metadata was checked on **2026-10-30**; these are not added runtime dependencies:

| Candidate | Verified scope | Useful evaluation |
| --- | --- | --- |
| [`buttplug` 5.0.2](https://www.npmjs.com/package/buttplug/v/5.0.2) | Official BSD-3-Clause wire-v3 reference | v3 clients and shared protocol fixtures |
| [`@zendrex/buttplug.js` 0.5.0](https://www.npmjs.com/package/@zendrex/buttplug.js/v/0.5.0) | MIT, typed wire-v4, `zod: ^4.4.3`, WS/WASM paths | v4/WASM adapters and optional device runtime |
| [`webbluetooth` 7.1.0](https://www.npmjs.com/package/webbluetooth/v/7.1.0) | MIT, Node Web Bluetooth-shaped interface | Node central access |

A suitable library can replace a small protocol implementation while retaining connection ownership, advertised ranges, cancellation and stop barriers. Compare actual APIs, packages and protocol fixtures when choosing it.

## Eight TypeScript package candidates

### Shared application core: `@sensa/core`

`src/core/runtime`, `src/core/outputs` and `src/core/protocols` are exported through `src/core/index.ts`. `RuntimeEngine` owns modes, input activation, mapping, computation, tracking, scripts and motion. `ApplicationFacade` owns commands/snapshots, while the pure `OutputCoordinator` owns connections and binding evaluation. Hosts inject time, storage, delivery and device factories.

Evidence: `tests/runtime/domain-configuration.test.ts`, `domain-runtime.test.ts`, `domain-parity.test.ts`, `tracking.test.ts`, `tests/node/output-coordinator.test.ts` and browser-local host tests. Preserve complete application behavior when extracting the package.

### Funscript: `@sensa/funscript`

`src/core/funscript.ts` parses/samples scripts, `src/core/runtime/script.ts` owns time, speed, loops, seeking and natural completion, and `src/core/outputs/recording.ts` handles track segments/replay. Parsing and timing can be reused independently of devices or windows.

Evidence: shared `tests/fixtures/funscript-interop.json`, `tests/web/websensa-interop-vectors.test.mjs` and domain script contracts. Natural completion retains the final value and input activation; explicit stop remains a separate operation.

### Buttplug: `@sensa/buttplug-client`

`src/node/outputs/intiface.ts` implements the Node wire-v4 client, request correlation, Ping, device/feature metadata, advertised ranges and device ownership pool. Browser `IntifacePeer` in `src/websensa/transports.ts` uses wire v3. Pure virtual-device v2/v3/v4 sessions live in `src/core/protocols/buttplug-input.ts`.

Node WebSocket transport owns complete messages, UTF-8, the 1 MiB bound and failure cleanup; protocol parsing and device mapping keep their own responsibilities. Evidence: `tests/node/output-intiface.test.ts`, `input-codecs.test.ts`, `input-transports.test.ts`, `tests/web/websensa-transports.test.mjs` and Intiface E2E. Extract injectable sockets and shared fixtures first.

### TCode: `@sensa/tcode`

Pure input parsing/framing lives in `src/core/protocols/tcode-input.ts`; output encoding lives in `src/core/outputs/codecs.ts`. Node adapters own serial, UDP, TCP, WebSocket and WSDM; browser adapters own Web Serial/WebSocket. Encoding preserves axes, ranges, arrival timing and speed from known positions.

Evidence: `tests/node/input-codecs.test.ts`, `input-transports.test.ts`, `input-websocket-epoch.test.ts`, `output-codecs.test.ts`, `output-io.test.ts` and protocol-multiplex E2E. Keep text/byte protocols separate from port creation.

### BLE codecs: `@sensa/ble-codecs`

Pure implementation lives in `src/core/protocols/ble.ts`, browser drivers in `src/websensa/device-codecs.ts`, and the Python reference in `tools/protocol-bridge/bridge.py`.

| Profile | Command model | Basis |
| --- | --- | --- |
| LOOB | Four-byte position/duration | Public FapTap connector |
| Thrust Sync | Three-byte position/duration | Public FapTap connector |
| Svakom V1 | Six-byte single-vibration command | Buttplug Emma/Phoenix Neo/Ella configuration |
| Lovense single vibration | `Vibrate:0;`–`Vibrate:20;` | Buttplug Lovense commands and GATT configuration |
| Youou VX001 | Seventeen-byte sequence/XOR frame, intensity 0–247 | Buttplug Youou/VX001 configuration |

Buttplug evidence is pinned to [`179b0d9`](https://github.com/buttplugio/buttplug/tree/179b0d9306f519912c10bdddd111686622b7f63a); the [bridge guide](../tools/protocol-bridge/README.md#sources-and-verification) provides codec links. `tests/web/websensa-device-codecs.test.mjs` compares 35 TypeScript/Python vectors across five profiles. Mock-GATT E2E checks browser delivery; hardware outcomes are recorded separately.

### Browser devices: `@sensa/browser-devices`

`src/websensa/transports.ts`, `device-codecs.ts` and `browser-outputs.ts` wrap browser APIs with device selection, single-owner access, MIDI mapping ownership, delivery deadlines and late-operation cleanup. `createBrowserOutputFactory` injects them into the shared output coordinator.

Evidence: `tests/web/websensa-transports.test.mjs`, `websensa-device-codecs.test.mjs`, browser-host units and Bluetooth E2E. Device permission remains attached to user connection actions; public interfaces accept injected test peers.

### Lifecycle: `@sensa/transport-lifecycle`

`src/core/outputs/lifecycle.ts` supplies bounded `OutputLane` queues and stop-generation barriers; `coordinator.ts` owns state/event delivery and closure. Node Intiface/MIDI pools and browser connection pools retain device ownership. HTTP input-port multiplexing and cross-tab session sharing remain separate layers.

Evidence: `tests/node/output-coordinator.test.ts`, `output-intiface.test.ts`, `output-io.test.ts`, `tests/web/shared-realtime.test.mjs` and multiplex E2E. Keep the pure package free of DOM dependencies; wrap SharedWorker/Web Locks/BroadcastChannel externally.

### Capabilities: `@sensa/capabilities`

Browser entry `src/websensa/capabilities.ts` and Node entry `src/node/outputs/capabilities.ts` inspect callable APIs, real native exports and bridge dependencies without opening devices. The UI uses their inventories to offer available choices.

Evidence: `tests/web/websensa-capabilities.test.mjs`, Node output/bridge tests and cross-browser E2E. Keep capability detection separate from UI text and platform names; adapters execute actual connections.

## Python tooling and historical upstream contributions

The standalone **`sensa-protocol-bridge`** candidate is unpublished. Bleak provides central output, Bless Linux/macOS peripheral input, native PyWinRT Windows peripheral input, and pyserial serial access. Five BLE profiles share TCP/TCode bridging. Lovense currently provides output commands; the other documented input profiles expose implemented GATT command interfaces. `tests/scripts/test_protocol_bridge*.py` and `tests/node/output-bridge.test.ts` cover codecs, process ownership and cleanup.

Historical C# upstream-improvement evidence remains pinned to Sensa [`941febb`](https://github.com/SeaLoong/Sensa/tree/941febb7b760cab37000d3bf54e7ccf756201b22): [connector](https://github.com/SeaLoong/Sensa/blob/941febb7b760cab37000d3bf54e7ccf756201b22/src/Outputs/Intiface/IntifaceWebSocketConnector.cs), [fragmentation reproduction](https://github.com/SeaLoong/Sensa/blob/941febb7b760cab37000d3bf54e7ccf756201b22/tests/Sensa.Tests/Contracts/IntifaceWebSocketTransportContracts.cs) and [range contracts](https://github.com/SeaLoong/Sensa/blob/941febb7b760cab37000d3bf54e7ccf756201b22/tests/Sensa.Tests/Contracts/IntifaceFeatureRoutingContracts.cs). Fixed Buttplug C# [`ec8e6ff`](https://github.com/buttplugio/buttplug-csharp/tree/ec8e6ff175e33dd75778cc91c485ec1a24353915)/NuGet 5.0.1 handling of 2048-byte receive blocks and percentage ranges was reproduced with large device lists, fragmentation, split UTF-8 characters and advertised minima. Recheck current upstream before contributing to avoid duplicate reports. These links document historical reproductions; the current host uses the TypeScript implementations above.

## Extraction order and publication requirements

1. Stabilize core/funscript and pure TCode/BLE APIs with cross-host fixtures.
2. Separate codecs, device ownership and system bindings, retaining cancellation, late-operation and stop regressions.
3. Check minimal reproductions against pinned upstream versions and contribute suitable fixes upstream first.
4. Define exports, units, capabilities, errors and release ordering; verify `npm pack`, declarations, source maps, Node import and browser builds in clean consumer projects.
5. Confirm names/scopes, semantic versions and license ownership before publication; version wire protocols separately.

Sensa code uses MIT. Preserve upstream terms/notices, including TypeScript Apache-2.0 and Buttplug BSD-3-Clause. Distributions retain real dependency licenses in `THIRD-PARTY-NOTICES.txt`. Record mock, real-protocol-peer, operating-system and hardware verification scopes separately.

[Development and compatibility](development.en.md) · [Shared-core decision](adr/0011-shared-core-and-capability-adapters.md)
