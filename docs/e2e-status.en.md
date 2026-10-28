# Verification record

**English** | [简体中文](e2e-status.md)

This page records completed checks for pinned source, without treating historical results as acceptance of later changes. Earlier failures, fixes and original scopes remain in the [immutable history](https://github.com/SeaLoong/Sensa/blob/0bf1a8e95ff5f191dec03603c28fb983e3b69ad1/docs/e2e-status.en.md). See [main-branch CI runs](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml?query=branch%3Amain) for current-source results, and [development and releases](development.en.md) / [E2E maintenance](e2e.en.md) for workflow operation.

## Archived acceptance: 0bf1a8e9 (2026-10-29)

The pinned source is [`0bf1a8e95ff5f191dec03603c28fb983e3b69ad1`](https://github.com/SeaLoong/Sensa/commit/0bf1a8e95ff5f191dec03603c28fb983e3b69ad1). [Main CI 40768992258, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/40768992258/attempts/1) completed units, the full ordinary browser comparison, six native builds and isolated smoke, Unity packaging and preview publication in order.

| Scope | Actual result for this pinned source |
| --- | --- |
| Web units | **240/240 passed**, zero failures/skips |
| .NET units | **1081/1081 passed**, every TRX execution independently checked, zero failures/skips |
| Python/scripts | **389/389 passed**, zero failures/skips |
| Full ordinary E2E | **144/144 passed**, 72 desktop and 72 narrow executions including 28 protocol executions; zero failures, skips, not-run, interruptions, flaky cases or retries |
| Native builds/smoke | All **six** Windows/Linux/macOS x64/ARM64 platforms passed; Unity packaging also completed |
| Windows formats | Portable, single-file and installed applications passed on both architectures, including install/reinstall/uninstall and configuration/recording retention |
| Real Windows dependencies | Both architectures imported eight WinRT/Bleak namespaces and completed the `01f40064` buffer round trip without enumerating adapters, creating a GATT service or advertising |
| Published files | Actual bytes of all **12 files** in [development preview #210](https://github.com/SeaLoong/Sensa/releases/tag/preview-210-1-0bf1a8e9) match official SHA-256 and `SHA256SUMS.txt`; six BUILD-INFO objects, 54 bridge-tool copies and 169 Unity source files match the pinned build/source, allowing only the planned Unity version rewrite |

The ordinary report records `suite=all`, `mode=comparison`, `selectionComplete=true` and `snapshotsCompared=true`, with successful command and comparison-verification steps. Raw results independently confirm 144 unique executions with one attempt each. A successful screenshot candidate, filtered site checks or 116-case results from older source cannot replace this complete comparison.

## Protocol, input/output and stop checks

That revision covers Buttplug v3/v4, TCode TCP/UDP/serial, Intiface WSDM, JSON HTTP/WebSocket and vendor-compatible inputs, together with vendor realtime/script outputs, explicit Intiface actuator mapping and optional serial/BLE bridges. [Operation and limits](protocol-inputs.en.md)

Unit/integration checks use real loopback HTTP/WebSocket, isolated PTYs, mock serial/BLE/WinRT and injected clocks. They cover single-source control ownership, atomic command batches, independent axis duration, arrival-plus-grace leases, disconnect/invalid TCode, stop barriers, configuration rollback, script cancellation and shutdown. A binding's invalid-source `StopValue` is tested separately from whole-device stop: for a position axis it is a fallback target that may move the device; input disable, output disable and emergency stop use the whole-device stop path.

Browser protocol checks cover website/player commands reaching mock TCode, competing control sessions, combined calculations, bilingual configuration, rotation-device mappings and stop/emergency cancellation of blocked script preparation without late resumption. Both Contact attachments completed loss/freeze/stop assertions, explicitly keeping 0.210 m/s during screenshots and sending 10 distinct velocities later while Sample was frozen. Actual SDK clients, websites, vendor clouds and hardware require separate acceptance.

## Image review and documentation site

[Full candidate 40756483229, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/40756483229/attempts/1) pinned `aea5ef3f` and passed 144/144; candidate mode does not compare images. The exported patch, raw-image commit `30a8dd6d` and all 172 PNG digests matched. Thirteen new originals were opened individually; ten reused byte-identical originals opened in this task, and 149 reused matching hashes from the previous per-file review. The 38 documentation images use that candidate, with four byte changes. [Per-file review receipt](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json)

The complete ordinary main comparison actually used these reviewed images; its eight site originals remain byte-identical to the reviewed candidate. The Contact fixture fixes only the screenshot phase, retaining the later activity-freeze and stop assertions. No screenshot threshold was relaxed, safety assertion removed or retry added.

[Pages 40768992056](https://github.com/SeaLoong/Sensa/actions/runs/40768992056) pinned the same `0bf1a8e9`, successfully building, comparing and deploying: **14/14 passed**, 96 routes and 149 assets. Build/online manifest sources agree, and the actual bytes/digests of all 38 documentation images and nine selected HTML/JS/CSS resources match. Its report records `suite=site`, `selectionComplete=false` and `snapshotsCompared=true`; this establishes the deployed site, not full application coverage.

[Capture provenance and review](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md) · [Running screenshots](screenshots.en.md)

## Static analysis and scanning boundaries

[CodeQL 40768992078](https://github.com/SeaLoong/Sensa/actions/runs/40768992078) uploaded and processed all four languages for the same source. The C# manual build independently matched **240/240** Git-tracked source files, with call-target and known-type metrics both **100%**, zero low-quality diagnostics and the original 85% threshold retained. Full SARIF identities and raw data flows match reviewed main `aea5ef3f`.

Successful scanning does not establish GitHub alert closure or the current counts/settings of inaccessible panels. Scanner configuration, test coverage and audit thresholds retain their requirements; specific dispositions depend on their individual records and evidence. [Scanning configuration and migration](development.en.md#maintaining-scanners-and-workflow-dependencies)

## Unity and physical-device scope

The retained lab record pins Avatar SDK/Base **3.10.6-beta.3**, MA **1.18.7**, NDMF **1.14.8** and VRCFury **1.1434.0**; World pins SDK/Base **3.10.5** without Avatar SDK. World remains a local repository with no remote or pushes. The vrc-get 1.9.3 upstream digest, repeated package-file digests and managed lab files were checked individually; see the immutable history for details.

The latest retained isolated Unity Editor 2022.3.22f1 EditMode attempt exited with **“No valid Unity Editor license found”** / `License is not active (com.unity.editor.headless)`: **zero executed, 17 Tracking Frame source cases not run**, with no NUnit XML. This proves that attempt's blocker, not current license status or successful later imports. Real Unity import, NDMF builds, World PlayMode, Shader GPU capture, VRChat/HMD, Bluetooth and other hardware have not been accepted.

CodeQL compilation against real Unity/SDK references, package structure, mock processes and browser checks each verify their own scope. Downloadable packages, importable dependencies and simulated stop checks do not replace physical-device travel, direction, latency and stopping acceptance. Subsequent source needs its own Source-pinned [CI run](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml) and artifacts.
