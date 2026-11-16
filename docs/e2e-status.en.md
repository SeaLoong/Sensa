# Verification record

[简体中文](e2e-status.md) | **English**

This page describes the current workspace redesign. Superseded layouts, counts and conclusions remain in the [fixed historical record](https://github.com/SeaLoong/Sensa/blob/8eff42a03462566a61e37c97737fede0e973c59b/docs/e2e-status.en.md).

## Separate workspaces, presets and spotlight setup

Full candidate source [`a0122057`](https://github.com/SeaLoong/Sensa/commit/a012205759b1b60f50fb4f736a26e90aac344e6b), [Actions run](https://github.com/SeaLoong/Sensa/actions/runs/43941133222/attempts/1), attempt 1. The subsequent keyboard-root fix `84bc6f45` passed ordinary CI run 43942444086: its tested merge `6fac7c4c` has the same source tree as the PR head.

| Check | Evidence |
| --- | --- |
| Web / runtime / scripts and documentation | [CI on the final guide implementation](https://github.com/SeaLoong/Sensa/actions/runs/43942444086): **501 / 1607 / 455 passed** |
| Full browser candidate | **310/310 passed**, desktop and mobile; zero failures, skips, flaky, unrun or interrupted cases |
| Chromium / Firefox / WebKit compatibility | **8/8 passed** in the candidate run |
| Image review | 76 changed application baselines reviewed individually; exact-byte images reuse recorded observations; insignificant geometry raster differences retain their existing baselines |
| Independent ordinary comparison | [Run 43942444086](https://github.com/SeaLoong/Sensa/actions/runs/43942444086): **310/310 passed**, `selectionComplete=true`, `snapshotsCompared=true`; subsequent commits retain the same CI gate |

Input, Mapping & transforms, Axis profiles and Outputs now have separate pages. OSC reception and protocol sources live in Input; mappings and calculations share draft Save/Restore; Outputs owns connections, routing and recording. Six-step setup highlights interactive controls, dims surrounding areas, saves progress on Escape and suspends while an editor is open. The compact guide prioritizes current instructions and folds away Jump to step. A transform step focuses one actionable preset; Tab/Shift+Tab includes the highlighted button itself. Presets include six OSC templates, four transforms and six axis profiles.

[Image receipt](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json) records individual source runs, hashes and decisions, including any observations reused from earlier diagnostic runs. [Visual review](ui-visual-review.en.md) records actual scope and limitations. Native builds, isolated smoke and previews depend on the ordinary full comparison for their pinned commit.

## Dependencies and scope

CodeQL, Electron and Mermaid updates are included. Playwright 1.65.0 repeatedly crashed Firefox during axe analysis, so 1.64.1 and the existing accessibility checks are retained; see [PR #60](https://github.com/SeaLoong/Sensa/pull/60).

The suites use loopback services, temporary configuration and mock transports. Browser/WebGL, simulated wire packets and build success do not establish real hardware, Unity/VRChat, HMD or mechanical-stop acceptance.

[Development](development.en.md) · [Browser verification](e2e.en.md) · [Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml) · [CodeQL](https://github.com/SeaLoong/Sensa/actions/workflows/codeql.yml)
