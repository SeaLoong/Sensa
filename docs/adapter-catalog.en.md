# Adapter catalog and package roadmap

[简体中文](adapter-catalog.md) | **English**

This is a developer catalog for reusing Sensa components and planning community packages. Package names below are working names, not published packages or reserved npm scopes. Current desktop releases still use the .NET service; the shared TypeScript core and browser adapters are the first migration slice. [Host architecture](adr/0011-shared-core-and-capability-adapters.md)

## How to choose an implementation

Use an existing library for its established protocol, platform or rendering capability. Add a narrow adapter for Sensa's ownership and lifecycle. Implement a small protocol layer when a verified format or application requirement needs it. The catalog records the concrete reason for each choice; it does not assume that an ecosystem lacks libraries.

| Category | Current approach | Extraction direction |
| --- | --- | --- |
| Existing library | Use the maintained dependency and retain its license notices | Keep it a dependency; contribute improvements upstream |
| Wrapper / improvement | Preserve the library or system API, add bounded delivery and ownership | Publish the portable adapter separately if another consumer needs it |
| Sensa implementation | Pure typed engine, codecs and lifecycle primitives | Extract a small package with a stable public API and shared fixtures |

## Existing libraries we use

| Library / API | Responsibility in this repository | Platform |
| --- | --- | --- |
| React / React DOM | Workbench components and rendering | Browser; server rendering in isolated tests |
| esbuild | Bundle the same WebSensa sources and dependency notices | Node build tool; targets Chrome 110, Firefox 115 and Safari 16 |
| Three.js | Parameter-explorer 3D scene | Browser WebGL; the explorer also has SVG views |
| qrcode-generator | Pairing QR encoding | JavaScript; used by the desktop WebUI |
| Mermaid tiny | Local documentation flowcharts | Browser documentation asset |
| `ws` | Real WebSocket peers in Node test fixtures | Node test infrastructure, not a shipped Node service |
| Buttplug NuGet 5.0.1 | Desktop wire-v4 messages, client and feature model | Current .NET desktop host |
| Bleak / Bless / PyWinRT | OS BLE central/peripheral bindings for bridge tools | Python; backend selected by OS and role |

Web Serial, Web Bluetooth and Web MIDI adapters use the browser's APIs directly. They do not need a JavaScript library to implement the OS Bluetooth stack. Node/Electron system adapters will use their own platform bindings behind the same engine port.

## Verified reuse candidates

The device review checked exact-version registry metadata and the linked Buttplug READMEs on **2026-10-30**. They are evaluation candidates, not dependencies added by this catalog.

| Candidate | Published scope and license | Where it can help |
| --- | --- | --- |
| [`buttplug` 5.0.2](https://www.npmjs.com/package/buttplug/v/5.0.2) | Official BSD-3-Clause wire-v3 reference; its README recommends the community client below | Broader v3 client reuse and shared protocol fixtures |
| [`@zendrex/buttplug.js` 0.5.0](https://www.npmjs.com/package/@zendrex/buttplug.js/v/0.5.0) | MIT, typed wire-v4 client with a `zod: ^4.4.3` schema dependency, metadata ranges and WS/WASM paths | Preferred v4/WASM adapter evaluation, including its optional `buttplug-wasm-blob` device runtime |
| [`serialport` 13.0.0](https://www.npmjs.com/package/serialport/v/13.0.0) | MIT Node serial bindings, Node >=20 | Future Node/Electron serial host adapter |
| [`webbluetooth` 7.1.0](https://www.npmjs.com/package/webbluetooth/v/7.1.0) | MIT Node implementation of Web Bluetooth interfaces | Evaluate Node central access behind the browser-like adapter port |

A compatible library can replace Sensa's small protocol client while retaining endpoint ownership, cancellation and stop-barrier contracts around it. Compare the actual current API, platform packaging and fixtures before choosing. A Node implementation of a browser-shaped API does not add peripheral advertising to ordinary browser pages.

## Wrappers and improvements

### Bounded desktop Buttplug transport

Current code: `src/Outputs/Intiface/IntifaceWebSocketConnector.cs`, `IntifaceConnection.cs` and `IntifacePositionFeatures.cs`. The connector retains upstream Buttplug parsing/correlation and adds complete-message aggregation, strict UTF-8, a 1 MiB message bound, JSON-depth checks, serialized writes and cleanup after failed/cancelled connections.

The verified upstream point is Buttplug C# commit [`ec8e6ff`](https://github.com/buttplugio/buttplug-csharp/tree/ec8e6ff175e33dd75778cc91c485ec1a24353915), distributed as NuGet 5.0.1. Its connector reads fixed 2048-byte receive chunks as messages; Sensa's regression reproduces large/fragmented device-list and split-UTF-8 failures. The default percentage builder also needs advertised-minimum handling in Sensa's feature mapping. These are concrete version-specific findings, not a claim that all current upstream releases have those defects.

Tests: `IntifaceWebSocketTransportContracts.cs`, `IntifaceFeatureRoutingContracts.cs`, `IntifaceInitializationContracts.cs`, `tests/e2e/intiface-fragmented.spec.js`. The minimal framing/range reproductions are good upstream contributions. A future JavaScript package should reuse the protocol fixtures rather than ship a copy of this C# connector.

### Browser device ownership

Candidate: **`@sensa/browser-devices`**. Current adapter code is `src/websensa/transports.ts` and `src/websensa/device-codecs.ts`. It adds one owner per serial port, one owner per Intiface device and one owner per MIDI port/channel/controller mapping, along with deadlines and cleanup for late native completions.

The browser supplies device discovery, permissions and writes. The adapter supplies the application's resource-sharing policy. This is a lifecycle requirement, not evidence that Web Serial/MIDI/Bluetooth APIs are missing. Injected interfaces let unit tests model close, timeout and ownership races without opening a device.

Tests: `tests/web/websensa-transports.test.mjs`, `websensa-device-codecs.test.mjs` and `tests/e2e/websensa-bluetooth.spec.js`. Browser permission prompts belong in the browser host; Node/Electron adapters should expose equivalent engine operations through their native bindings.

### Native BLE bridge

Candidate: **`sensa-protocol-bridge`** as an independent Python tool. Current code: `tools/protocol-bridge/bridge.py`; pinned dependency sets are beside it. Bleak provides central output, Bless provides Linux/macOS peripheral input, and a WinRT backend provides Windows peripheral input. pyserial provides serial I/O.

Five profiles share the bridge's TCP/TCode integration: LOOB, Thrust Sync, Svakom V1, Lovense single-vibration and Youou VX001. Lovense currently provides output commands; the other documented input profiles can advertise their implemented GATT command interface. A browser page itself supplies central access rather than peripheral advertising, which is the concrete reason this native bridge remains useful.

Tests: `tests/scripts/test_protocol_bridge.py`, `test_protocol_bridge_windows.py`, `tests/e2e/protocol-bridge.spec.js` and `websensa-bluetooth.spec.js`. Protocol encoding improvements can be shared with Buttplug upstream; OS binding fixes belong to Bleak/Bless/PyWinRT when their API is responsible.

## Sensa components suitable for extraction

### Shared engine and funscript

Candidates: **`@sensa/core`** and, if consumers need it independently, **`@sensa/funscript`**. Public entry: `src/core/index.ts`; implementation: `engine.ts`, `funscript.ts` and `types.ts`.

The core owns normalized axis frames, manual/script/explorer source state, the script clock, recording and independent output lanes. The parser/sampler covers inverted scripts, duplicate timestamps, nonzero initial targets, interpolation and duration. Clocks, scheduling and `OutputTransport` are injected; the pure core imports neither a browser device API nor Electron.

Tests: `tests/web/websensa-controller.test.mjs`, `websensa-interop-vectors.test.mjs`, the shared `tests/fixtures/funscript-interop.json` and desktop `FunscriptInteropContracts.cs`. Keep the fixture shared through migration so direction, endpoints and timing have one contract.

### Browser Buttplug client

Candidate: **`@sensa/buttplug-client`**. Current implementation: `IntifacePeer` and connection acquisition in `src/websensa/transports.ts`. It negotiates wire v3, correlates responses, maintains Ping, refreshes device features and shares one socket across different device owners. One device output can group its mapped feature commands.

The browser already delivers complete WebSocket messages; this adapter bounds parsed messages, batches and outgoing backpressure. It does not reimplement native WebSocket fragmentation. The [official Buttplug JavaScript client](https://github.com/buttplugio/buttplug-js) remains a reuse candidate for broader protocol coverage. Compare its current API and packaging before extracting Sensa's smaller client; the present implementation was built around the verified v3 subset and Sensa's ownership/stop contracts.

Tests: `tests/web/websensa-transports.test.mjs`, `tests/e2e/websensa.spec.js` and `websensa-desktop-interop.spec.js`. A new package should separate pure message/schema handling from the injected WebSocket implementation.

### TCode framing and connections

Candidate: **`@sensa/tcode`**. The shared encoder is exported through `src/core/index.ts` from `funscript.ts`; browser serial/WebSocket adapters live in `src/websensa/transports.ts`. Current desktop input framing and parsing are in `src/Input/Protocols/TCodeProtocol.cs`, `TCodeInputService.cs` and `TCodeWebSocketInput.cs`.

The encoder preserves selected axes, fractional TCode values and arrival duration. Web Serial writes complete text frames; a TCode WebSocket endpoint has one whole-frame owner. The shared HTTP listener can host several endpoint paths on one TCP port. WSDM's binary hardware framing remains a separate transport contract.

Tests: `tests/web/websensa-controller.test.mjs`, `websensa-transports.test.mjs`, desktop protocol contracts, `tests/e2e/protocol-multiplex.spec.js` and `websensa-desktop-interop.spec.js`. Extract the byte/text codec first; keep serial-port selection and socket creation in host adapters.

### BLE codec metadata

Candidate: **`@sensa/ble-codecs`**. Pure implementation: `src/core/protocols/ble.ts`; browser driver: `src/websensa/device-codecs.ts`; Python reference implementation: `tools/protocol-bridge/bridge.py`.

| Profile | Command model | Shared evidence |
| --- | --- | --- |
| LOOB | Four-byte position/duration | Public FapTap connector |
| Thrust Sync | Three-byte position/duration | Public FapTap connector |
| Svakom V1 | Six-byte single-vibration command | Buttplug encoder and Emma/Phoenix Neo/Ella profile |
| Lovense single | `Vibrate:0;`–`Vibrate:20;`, supported GATT families | Buttplug Lovense command and GATT configuration |
| Youou VX001 | Seventeen-byte sequence/XOR frame, continuous intensity 0–247 | Buttplug Youou encoder and VX001 profile |

The Buttplug sources are fixed at [`179b0d9`](https://github.com/buttplugio/buttplug/tree/179b0d9306f519912c10bdddd111686622b7f63a). [Bridge documentation](../tools/protocol-bridge/README.md#sources-and-verification) links the individual encoders/configurations. These are independent implementations of documented packet behavior; they do not copy the Rust device runtime.

Tests: `tests/web/websensa-device-codecs.test.mjs` compares 35 boundary vectors across all five profiles against the actual imported Python bridge codec, alongside lifecycle units and mock-GATT browser E2E. Keep packet vectors, units, rounding, sequence ownership and stop operations in the portable package. GATT discovery, permissions and connection cleanup stay in the platform driver.

### Queues, connection pools and stop barriers

Candidate: **`@sensa/transport-lifecycle`**. Current output lanes are in `src/core/engine.ts`; endpoint pools and browser ownership are in `src/websensa/transports.ts`; desktop-tab sharing is in `src/web/shared-realtime.js` and `elected-realtime.js`.

These are three distinct reuse levels: several output lanes can use an endpoint's device-aware connection, several protocol routes can share a listener port, and several desktop browser tabs can share a backend session. A package should expose those scopes explicitly. Latest-value coalescing, ordered commands, terminal frames and stop barriers belong to the lane contract; protocol/device ownership belongs to the adapter using the pool.

Tests: `tests/web/websensa-controller.test.mjs`, `websensa-transports.test.mjs`, `shared-realtime.test.mjs` and the corresponding browser multiplex/shared-session cases. Keep this package DOM-free; wrap SharedWorker/Web Locks/BroadcastChannel separately.

### Capability inventory

Candidate: **`@sensa/capabilities`**. Current code: `src/websensa/capabilities.ts`. It checks callable WebSocket/fetch and device methods, secure-context requirements and actual registered host factories. The inventory is inspectable without connecting or requesting permission; a boolean flag by itself does not register a native adapter.

Tests: `tests/web/websensa-capabilities.test.mjs` and WebSensa's UI/browser flows. Keep capability detection independent of UI text and host names so Node's real WebSocket/fetch and a future Electron bridge can supply their own adapters.

## Local-service capabilities still being migrated

| Capability | Current implementation | Node/Electron work |
| --- | --- | --- |
| OSC packets, UDP reception and forwarding | `src/Input/Osc/`, `src/Outputs/Adapters/OscSignalOutputCodec.cs` | Select or adapt a JS codec, then add UDP host adapters and parity fixtures |
| VRChat/OGB/SPS interpretation and tracking | `src/Runtime/`, OSC source classes and Unity protocol sources | Port source/frame/unit semantics through shared tests |
| Protocol input listeners and path multiplexing | `src/Input/Protocols/`, .NET Kestrel/TCP/UDP | Add local-service listener adapters; retain route/session behavior |
| Configuration, process ownership and startup | `src/Hosting/` and `src/Configuration/` | Implement Node service persistence/IPC and an Electron shell |
| Native MIDI/serial/device APIs | Desktop adapters and Python bridge | Evaluate platform bindings per OS behind typed ports |

There is not yet a complete Node or Electron desktop host. These rows are migration tasks, not advertised JavaScript implementations. [OSC contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OscContracts.cs), [source selection](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OscSourceSelectionContracts.cs), [protocol contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/ProtocolMultiplexContracts.cs) and the existing Actions workflows provide behavior to retain.

## Contribution and extraction order

1. Offer the pinned Buttplug C# framing/range regression upstream with a small reproduction and a targeted fix. Check the current upstream version before filing a duplicate.
2. Stabilize the core/funscript and pure TCode/BLE codec APIs. These have the fewest host dependencies and the strongest shared-vector seams.
3. Separate browser device adapters from injected WebSocket/native bindings. Keep ownership and late-completion tests with them.
4. Migrate OSC/local listeners and the desktop shell through the core ports. Prefer existing maintained platform libraries where their capabilities match.
5. Publish packages only after API, license, packaging and cross-host checks below are complete.

## Requirements before publishing a package

- Define the public exports, frame units, capability discovery, error model and cancellation/stop/dispose order. Keep browser or native globals outside the pure entry.
- Generate declarations under TypeScript strict checking. Test both a direct Node import and the browser bundle from the packed package.
- Preserve the current behavioral fixtures and add platform-specific tests for the extracted adapter. Record mock, real peer and hardware results separately.
- Use semantic versions for the published API; version wire protocols independently. The current repository's in-place development changes do not create a published compatibility promise.
- Confirm package/scope availability and ownership before selecting the final name. Review licenses for code actually included in the package and retain all required notices.
- Sensa-authored code uses MIT. Buttplug C#/Rust sources use BSD-3-Clause; React, Three.js, ws, esbuild, Bleak, Bless and PyWinRT have their own notices, while TypeScript uses Apache-2.0. Copied or bundled upstream material retains its original terms.
- Check `npm pack` contents, imports, declarations, source maps and license files in a clean consumer project. Keep the compiler, tests and browser permissions separate from runtime protocol dependencies.

[Development and compatibility](development.en.md) · [Shared-core decision](adr/0011-shared-core-and-capability-adapters.md)
