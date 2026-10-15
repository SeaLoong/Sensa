# WebUI E2E and screenshot testing

[简体中文](e2e.md) | **English**

E2E runs only in the pinned Playwright Linux container in GitHub Actions. Never start browser tests locally or connect real hardware. `npm run e2e:ci` rejects non-Actions environments.

Tests start the real backend and WebUI with a temporary configuration. They operate UI controls rather than mocking Sensa's HTTP/WS API. External systems use loopback mocks: OSC UDP, TCode UDP/TCP, Linux PTY serial with D0/D1/D2, Buttplug v4 WebSocket, OSCQuery HTTP and OSC Hub receivers.

Screenshots and actual outgoing protocol assertions must both pass. Screenshots alone cannot prove a command or stop was sent. Desktop is 1280×900; narrow layout is 390×844, not a physical-phone test. Chinese full workflows and English localization workflows run in both layouts.

## Normal changes

1. Run local static/unit checks, commit and push.
2. Inspect **Validate and preview → e2e / browser**. Failed, canceled or skipped E2E blocks platform builds and prerelease publication. Desktop/Unity tag releases also require E2E.
3. Download `e2e-report`: inspect expected/actual/diff, failure images, traces, service logs and `mock-wire.json`.
4. Fix behavior/layout defects. Generate new baselines only for intentional reviewed UI changes.

## Candidate baselines

In **WebUI E2E and screenshots → Run workflow**, choose the branch and enable `update_snapshots`. Local commands below dispatch remotely:

```shell
npm run e2e:request
npm run e2e:baselines
gh workflow run e2e.yml --ref <branch> -f update_snapshots=true
```

The candidate run still enforces functional assertions. It neither publishes releases nor commits files. Only after the entire run succeeds, download `e2e-baselines`, inspect every image, copy approved desktop/mobile files into `tests/e2e/__screenshots__/`, commit and push. Then require a normal comparison run to pass.

Normal comparison uses `updateSnapshots: none`; missing baselines fail too. Never copy partial output from a failed run simply to make CI green.

Browser/container versions, viewport, language and timezone are fixed. Masks cover only timestamps and runtime serial endpoints, not targets, gates, errors or calibration values. Oversized panels are scrolled and captured as `*-part-N.png` viewports; smaller panels/dialogs are captured directly. Move the pointer away and wait for tooltips/snackbars before capture.

## Regression matrix

Nine core scenarios plus three English scenarios per viewport give **24 tests**. No retries; after three failures the remaining tests stop and are not considered passed.

| Flow | Assertions |
| --- | --- |
| Manual/recording | Four mock transports, slider targets, funscript export, emergency stop, no automatic resume |
| QuickStart/FT | Five UDP steps, TCP/UDP limits, FT hiding/showing, Active gate stop |
| PB calibration | Four samples, endpoints, old-gate replacement, save disables input, reload, release stop |
| Native SPS | Root/Tip length learning, radial offset and output targets |
| Funscript | Upload, loop, play/pause, keyframe step and unload |
| Paired Pose | 24 samples, spatial view, mapping and lost-marker stop |
| Configuration/help | Preset search, output rename/add/remove, duplicate endpoint refusal, axis profile save |
| OSCQuery/Hub | HTTP directory, UI polling fallback, real UDP forwarding, stopping polling |
| Session/input off | Missing cookie and cross-origin refusal; disabled input sends no motion |
| English switch | Browser default, persisted override, unsaved slider survives, switch sends no control requests |
| English calibration | Localized diagnostics, PB capture, mock target and release stop |
| English help/script | Preset search, matching-language documentation links and narrow-screen screenshots |

Windows COM drivers, real Bluetooth/mechanical devices, Unity/VRChat/HMD, OSCQuery LISTEN, every curve/axis combination and hard network failures are outside this matrix. Unit and platform smoke checks complement it; add meaningful behavioral coverage when new features or failures warrant it.
