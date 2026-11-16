# Verification record

[简体中文](e2e-status.md) | **English**

This page records the current workbench redesign. Previous layouts, counts and conclusions remain in the [fixed historical record](https://github.com/SeaLoong/Sensa/blob/8eff42a03462566a61e37c97737fede0e973c59b/docs/e2e-status.en.md). Each result belongs to its own source and Actions run.

## Separate workspaces, presets and spotlight guidance

Candidate source [`a0122057`](https://github.com/SeaLoong/Sensa/commit/a012205759b1b60f50fb4f736a26e90aac344e6b), [full candidate run](https://github.com/SeaLoong/Sensa/actions/runs/43941133222/attempts/1), attempt 1.

| Check | Current evidence |
| --- | --- |
| Web / runtime / scripts and docs units | Candidate source `a0122057` passed **501 / 1607 / 455 tests** in [CI](https://github.com/SeaLoong/Sensa/actions/runs/43940440695) |
| Full browser candidate | Running **310 cases** across desktop and narrow viewports; no completed result yet |
| Screenshot and guide review | Application baselines and public gallery refreshed from individually reviewed candidate images; latest spotlight/site captures pending |
| Ordinary full comparison | Runs separately after image review and commit; candidate generation is not comparison acceptance |

The previous follow-up candidate passed 308/310; two mobile cases exposed guide content squeezed by a tall transform grid. The latest source highlights one actionable preset and reserves readable guide space.

This change separates Input, Mapping & transforms, Axis profiles and Outputs. OSC reception and protocol inputs live under Input; mappings and calculations share draft save/restore; Outputs contains connections, routing and recording. The six-step guide highlights actual controls against a dimmed page, supports direct interaction, Escape/resume and suspension while an editor is open. Presets include six OSC mappings, four transforms and six device profiles.

Per-image decisions, hashes and source identities are recorded in the [image receipt](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json). The [visual review](ui-visual-review.en.md) describes observed scope. Consult [current CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml) for the final source's ordinary comparison, native builds, isolated smoke checks and preview publication.

## Dependencies and scope

CodeQL, Electron and Mermaid updates are integrated. Playwright 1.65.0 repeatedly crashes Firefox during axe analysis, so 1.64.1 and the existing accessibility checks are retained; see [PR #60](https://github.com/SeaLoong/Sensa/pull/60).

Automated suites use loopback services, temporary configuration and simulated transports to exercise inputs, calculations, mappings, scripts, recording, protocols, stop ordering, languages and narrow layouts. Mock wire packets, WebGL and successful builds do not accept physical devices, Unity/VRChat clients, HMD capture or mechanical stopping.

[Development and checks](development.en.md) · [Browser verification](e2e.en.md) · [Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml) · [CodeQL](https://github.com/SeaLoong/Sensa/actions/workflows/codeql.yml)
