# Browser verification record

[简体中文](e2e-status.md) | **English**

This page retains inspected runs; read each commit's [Actions](https://github.com/SeaLoong/Sensa/actions) for current progress. See [development and releases](development.en.md) and [E2E maintenance](e2e.en.md) for the workflow.

## Contact SDK adaptation

On 2026-10-22, isolated local checks passed: **126 Web**, **434 backend** and **228 Python** tests, plus Unity package metadata checks and a **76-page documentation build**. [Feature and official SDK evidence](contact-sdk.en.md)

| Commit | Scope | Run | Inspected outcome |
| --- | --- | --- | --- |
| `8e77ba4` | Full candidate capture | [39792231646](https://github.com/SeaLoong/Sensa/actions/runs/39792231646) | **80/80 passed**, every other outcome zero; complete selection, candidate mode, image export and PR #16 creation succeeded |
| `1d46aa9` | Full normal comparison and six native builds | [39794320594](https://github.com/SeaLoong/Sensa/actions/runs/39794320594/attempts/2) | **80/80 passed**, every other outcome zero; attempt 2 completed full normal comparison, with all six native builds/smoke checks, Windows Shader bridge replay and Unity packaging passed |
| `8e77ba4` | Documentation site checks and deployment | [39792230278](https://github.com/SeaLoong/Sensa/actions/runs/39792230278) | **8/8 passed**, every other outcome zero; Contact explorer/guide entries checked, automatic deployment succeeded |

Full application cases cover Contact metre-position calibration, stationary zero velocity, speed calibration, actual mock Depth/V0 transport output, and stops after contact loss or a frozen activity counter. Explorer cases check all twelve fields, ordering, independent position/velocity controls, boundaries and Sample invalidity, alongside four-anchor/Shader regressions. The separate site-only selection contains 8 cases.

## Image inspection

Image commit `9166f82` contains **122 PNGs**. Coding assistants individually opened and reviewed **56 new/changed images**: 28 desktop and 28 narrow-layout images, covering 48 bilingual parameter diagrams and 8 application images. The remaining 66 PNGs retain their bytes. No blocking or major visual issue was found; desktop velocity-unit wrapping is recorded as a layout detail. [Image provenance and review](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md)

Normal comparison uses PR merge commit `1d46aa95e8512912fd97333b368bcf717aaf675e`, whose Git tree matches image commit `9166f82e4142bc38748bb9bb7dd70bd2383e7f5e` exactly. Image updates were disabled, `selectionComplete=true` and `snapshotsCompared=true`; baselines passed individual inspection and full comparison. Attempt 1 reached its 25-minute limit during dependency installation before browser cases ran; attempt 2 passed on the same commit. Subsequent browser/candidate workflows give installation a five-minute budget, 30-second network timeout and two retries.

## Acceptance scope

Browser cases use isolated configuration and mock transports. Actual Beta SDK Unity/VRChat, OSC publishing, real GPU capture, physical touchscreens and device interactions receive separate acceptance checks. Unity EditMode contracts are written; Unity Editor execution remains pending. Accessibility details remain in each run's report.

Initial failures and fixes are retained in a [fixed record](https://github.com/SeaLoong/Sensa/blob/3eb67db15cbf36c31e69ada8bafa3a46d9d6f02c/docs/e2e-status.en.md): speed tests now use the vibration-only peer, English expectations check five presets, and new images receive this capture/review cycle. Earlier 74-case checks and publication remain at a [historical revision](https://github.com/SeaLoong/Sensa/blob/3821bc876b0e5d9bbc16c515e83754a18c555841/docs/e2e-status.en.md); earlier visual review remains in the [archive](ui-visual-review.en.md).

## Later records

After a run finishes, verify its commit, link, suite and screenshot mode, then record passed, failed, skipped, unrun, flaky and interrupted counts from `summary.json`/`summary.md` or the `Browser result` annotation. Image acceptance records both actual inspection scope and a normal comparison result.
