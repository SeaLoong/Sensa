# Browser verification and screenshot baselines

[简体中文](e2e.md) | **English**

Browser E2E, screenshots and full-process smoke run only in GitHub Actions. Locally plan affected static/units with `scripts/verify.py --plan`, execute and reuse receipts. Never forge CI environment.

## Three browser boundaries

| Suite | Runs for real | Dependencies/limits |
| --- | --- | --- |
| Sensa application | Service, HTTP/WS and UI | Loopback OSC, TCode UDP/TCP, Linux PTY, Buttplug WS and OSCQuery mocks; not hardware/VRChat |
| Standalone explorer | File HTML, six local assets, SVG/software WebGL2 | No Sensa/network/devices; not native GPU capture |
| Documentation site | Built Pages artifact and isolated static server | Navigation/language/mobile layout/public explorer; no product chain |

Application integration also checks bundled explorer links/assets. The fourth workflow owns site checks independently of stable Unity. VPM reflects verified stable history, not fabricated development releases. [Development/gates](development.en.md)

## Meaningful behavior assertions

Application cases check UI and mock wires together: browse/apply mode, permission, manual/script pause/seek, recording/restart, output configuration, FT prefixes, three templates, saved mappings/conflicts, profiles, sources, gates and invalidity stops. Synthetic steps are an independent scalar fixture, not a built-in QuickStart template.

Fixed SPS/Shader cases send explicitly simulated protocols to check default blocking, opt-in, endpoint calibration, persistence and invalidity. They prove neither Unity Contacts nor real capture. OGB heartbeat checks enable/revoke and no renewed enable across a five-second stop interval while device input stays closed.

Locale cases cover URL/saved/full ordered browser preferences/English fallback, denied storage, persistence and preserved drafts/explorer state. Golden language is explicit, separate from environment negotiation. [Language contract](languages.en.md)

Explorer cases independently inspect SVG radii/capsules, values, keyboard, aligned sliders and 320 reflow. WebGL checks actual non-background pixels, object matrices/geometry/colors/reference surfaces, camera-data separation, XZ/XY ray-plane drag/locked axes/step/clamp/cancel, dimension updates and resource cleanup. It also checks default/reset framing, label clearance/leaders and constructor/context-loss fallback. The report defines exact YZ/numeric coverage; a control's presence is not an executed flow.

## Environment and failures

Desktop 1280×900 and narrow 390×844 use locked Playwright Linux, fonts, locale and timezone; 320 is a separate reflow check. A narrow viewport is not a phone, and PTY is not a Windows driver. [Config](https://github.com/SeaLoong/Sensa/blob/main/playwright.config.js) · [Tests](https://github.com/SeaLoong/Sensa/tree/main/tests/e2e)

On failure, download `e2e-report` and inspect expected/actual/diff, trace, service logs, mock-wire and last observations. Fix behavior in implementation. Update baselines only for reviewed intentional changes, without weakened assertions, automatic retries or resends hiding failures.

## Generate and accept candidates

Normal comparisons cannot update images; missing baselines fail. Prereleases require normal full comparison of the candidate SHA. For intentional visual changes, remotely dispatch:

```shell
gh workflow run e2e.yml --ref <branch> -f update_snapshots=true
```

Wait for required behavior, download `e2e-baselines`, then review full/local images by locale/viewport. Partial images from failures are diagnostic only; downloading is not acceptance. Record commit, run, image, concrete findings/fixes and limits before copying reviewed files into `tests/e2e/__screenshots__/`. Commit with implementation and run normal comparison. Candidate generation publishes nothing and never writes back to Git.

Mask only unstable times/runtime addresses, not targets, gates or errors. Split long content by real sections/scroll positions; do not infer unseen content. Byte-identical images may inherit recorded reviews; changed images require inspection.

## Interpret evidence honestly

Use [V1–V6](ui-quality.en.md) for hierarchy, typography, grouping, color, alignment and bilingual integrity. Equal screenshots establish regression stability, not an aesthetic survey. [Review history](ui-visual-review.en.md) records fixed evidence.

The axe subset, keyboard/dialog focus, targets, reflow and geometry in `quality.spec.js` are automatically detectable baselines. Preserve violations, incomplete, versions, URLs/locales/viewports and unexecuted items under `artifacts/e2e/ui-quality/` and the report. Zero violations neither certifies full WCAG nor replaces visual, screen-reader or touch acceptance.

Read actual pass/skip/retry/image counts from each Actions report. Unity uploads, actual Contacts/OSC, HMD/desktop encoding and physical stops are outside this suite.
