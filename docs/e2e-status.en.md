# Verification records

[简体中文](e2e-status.md) | **English**

Results below belong to the named commits. Open [current CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml), [Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml) and [CodeQL](https://github.com/SeaLoong/Sensa/actions/workflows/codeql.yml) for later source. [How checks run](development.en.md) · [Browser test workflow](e2e.en.md)

## Accepted snapshot: b225ee3a

Source [`b225ee3a7074a3a1e6a6c81d5e2bf8da824f10de`](https://github.com/SeaLoong/Sensa/commit/b225ee3a7074a3a1e6a6c81d5e2bf8da824f10de), [CI #213](https://github.com/SeaLoong/Sensa/actions/runs/40783839713), attempt 1:

| Check | Actual result |
| --- | --- |
| Web / .NET / Python | **252 / 1207 / 401 passed** |
| Full ordinary browser comparison | **176/176 passed**, 88 per viewport, zero retries, failures, skipped or unexecuted cases |
| Pages | [20/20 passed and deployed](https://github.com/SeaLoong/Sensa/actions/runs/40783839496); 98 routes, 154 assets and 55 selected online files matched |
| Native packages | Windows, Linux and macOS, each x64/ARM64: isolated TCode smoke passed |
| Windows formats | Portable, single file, installed app, reinstall/uninstall and user-data retention passed on both architectures |
| WinRT | Both architectures imported 8 namespaces and passed native-buffer byte roundtrip; no adapter/GATT operation |
| Publication | All 12 [preview #213](https://github.com/SeaLoong/Sensa/releases/tag/preview-213-1-b225ee3a) downloads matched official SHA-256 and SHA256SUMS; 54 bridge-tool source copies and 169 Unity files matched the build plan |
| CodeQL | [Four languages uploaded and processed](https://github.com/SeaLoong/Sensa/actions/runs/40783839791); all 249 tracked C# files covered, two quality metrics 100%, none-mode 0 |

The ordinary browser run checked every selected case and compared the reviewed baselines with updates disabled. The eight current site originals and eight rendered-diagram originals were opened individually. The deployed diagrams were also tested for keyboard scrolling, source fallback and rejected active content.

## Coverage of the automated suites

| Suite | What it checks |
| --- | --- |
| Unit / contracts | Injected clocks, real loopback HTTP/WebSocket, isolated PTY streams and mock serial/BLE/WinRT |
| Protocol inputs | Schema negotiation, independent source sessions, atomic channel batches, durations, task lifetime and stop order |
| Browser workflows | Configuration, control, recording, script playback, shared tabs and simulated device transport |
| Site | Bilingual navigation, direct downloads, offline assets, responsive layout, gallery and diagram behavior |
| Native package smoke | Actual platform binaries with temporary configurations and simulated network targets |
| Source analysis | Real application/Unity-reference compilation, source coverage and scanner evidence |

The Contact cases include contact loss and frozen activity, with a fixed 0.210 m/s screenshot sample followed by ten distinct velocities while Sample remains frozen. Device and protocol regressions include large/fragmented Intiface messages, script loop selection, nonzero script starts, finite task timing and Python bridge roundtrips.

## Images and review

[Baseline review](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json) records the source and hashes of 172 baseline images. Current ordinary comparisons use those reviewed images. The 38 published documentation images retain their original capture bytes and catalog provenance. New visual changes use candidate capture, original-image review and a subsequent ordinary comparison. [Review procedure](e2e.en.md)

## Environment-specific checks

Actual websites, vendor cloud services, physical OSR/BLE devices, Unity clients and VRChat/HMD operation are checked in their corresponding environments. The latest recorded Unity Editor 2022.3.22f1 attempt stopped at license validation with **zero tests executed**; 17 Tracking Frame source cases were not run and no NUnit XML was produced. Compilation and package structure results remain useful for their own scope.

Scanner execution and SARIF results are recorded separately from GitHub alert dispositions. In the accepted b225 snapshot, four uploads completed, but no remote alerts were closed or risks accepted in that round; current panel counts and alert state require their own access and review.

## Earlier accepted snapshot

[`0bf1a8e9`](https://github.com/SeaLoong/Sensa/commit/0bf1a8e95ff5f191dec03603c28fb983e3b69ad1) passed [144/144 ordinary browser cases](https://github.com/SeaLoong/Sensa/actions/runs/40768992258), six-platform checks and [preview #210](https://github.com/SeaLoong/Sensa/releases/tag/preview-210-1-0bf1a8e9) publication. Its [Pages run](https://github.com/SeaLoong/Sensa/actions/runs/40768992056) passed 14/14 site checks. These historical runs remain available for comparing later changes.
