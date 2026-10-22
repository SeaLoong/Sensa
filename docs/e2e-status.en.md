# Browser verification record

[简体中文](e2e-status.md) | **English**

This page retains inspected runs; read each commit's [Actions](https://github.com/SeaLoong/Sensa/actions) for current progress. See [development and releases](development.en.md) and [E2E maintenance](e2e.en.md) for the workflow.

## Contact SDK adaptation

On 2026-10-22, isolated local checks passed: **126 Web**, **434 backend** and **228 Python** tests, plus Unity package metadata checks and a **76-page documentation build**. New browser cases cover Contact metre-position/speed calibration, Depth/V0 mappings, contact-loss/activity-freeze stops and the bilingual explorer. [Feature and SDK evidence](contact-sdk.en.md)

| Commit | Scope | Run | Inspected outcome |
| --- | --- | --- | --- |
| `23a638a` | Documentation site E2E and deployment | [39789193609](https://github.com/SeaLoong/Sensa/actions/runs/39789193609) | All 8 cases passed, every other outcome zero; new Contact explorer/guide entry checked, deployment succeeded |
| `23a638a` | Full normal E2E comparison | [39789193521](https://github.com/SeaLoong/Sensa/actions/runs/39789193521) | 80 total: 6 passed, 3 failed, 71 unrun; every other outcome zero. Units passed; screenshot baseline differences stopped downstream builds/publication |
| `23a638a` | Manual candidate capture | [39789208758](https://github.com/SeaLoong/Sensa/actions/runs/39789208758) | 80 total: 40 passed, 3 failed, 37 unrun; every other outcome zero. Units passed; failures prevented candidate export and PR creation |

Normal comparison first reported three baseline changes: help grew from 560×582 to 560×642 (13,255 differing pixels), and new `contact-root-position.png`/`contact-root-speed.png` have no baseline yet. The subsequent 71 unrun cases remain pending checks.

Candidate capture identified two test configuration updates: desktop/mobile speed cases used an L0-only UDP profile, and now use the existing vibration-only Intiface peer to check V0; English preset expectations increase from 3 to 5 and check both new names. Full candidate capture and normal comparison will run again on the corrected commit.

## Image inspection and acceptance scope

The currently accepted screenshot provenance remains in the [review record](https://github.com/SeaLoong/Sensa/blob/c9662166cf115d5e123ef3b47dcd8bb317be1cc5/tests/e2e/__screenshots__/README.md). This update adds a Contact scene and position/speed diagnostics. Changed candidate images receive individual inspection, followed by a full normal comparison and a record update.

Browser cases use isolated configuration and mock transports. Actual Beta SDK Unity/VRChat, OSC behavior, real GPU capture, physical touchscreens and device interactions receive separate acceptance checks. Unity EditMode contracts are written; Unity Editor execution remains pending. Accessibility details remain in each run's report.

Earlier four-anchor/Shader 74-case comparisons, six native build/smoke checks and automatic publication are retained at a [fixed historical revision](https://github.com/SeaLoong/Sensa/blob/3821bc876b0e5d9bbc16c515e83754a18c555841/docs/e2e-status.en.md). Earlier visual review remains in the [archive](ui-visual-review.en.md).

## Later records

After a run finishes, verify its commit, link, suite and screenshot mode, then record passed, failed, skipped, unrun, flaky and interrupted counts from `summary.json`/`summary.md` or the `Browser result` annotation. Image acceptance records both actual inspection scope and a normal comparison result.
