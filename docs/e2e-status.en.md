# Browser verification record

[简体中文](e2e-status.md) | **English**

This records observed runs; it is not a live dashboard. Check [Actions](https://github.com/SeaLoong/Sensa/actions) for the run attached to the current commit. Updated test source, passing unit tests and a successful documentation deployment do not replace an application browser comparison.

## Confirmed outcomes

| Commit | Scope | Run | Observed outcome |
| --- | --- | --- | --- |
| `6aa31cb` | Application interfaces and browser comparison | [39677023629](https://github.com/SeaLoong/Sensa/actions/runs/39677023629) | Failed overall; the complete failing cases, counts and images have not been read, so not all causes are confirmed |
| `6aa31cb` | Documentation build and browser navigation | [39677023513](https://github.com/SeaLoong/Sensa/actions/runs/39677023513) | Succeeded overall; this does not validate application screenshots or real devices |
| `c713db3` | Application interfaces and browser comparison | [39669246139](https://github.com/SeaLoong/Sensa/actions/runs/39669246139) | Failed overall; a later documentation success cannot replace it |

The application logs and images require additional GitHub report access under the current access conditions; the environment proxy also still blocks `api.github.com`. This record therefore does not attribute every failure to screenshot changes or invent unavailable counts. Source defects such as outdated title assertions can be corrected independently; a new commit still needs its own executed result.

## Keeping evidence current

Each run produces a summary containing the commit, suite, screenshot mode, viewports, passed/failed/expected-failure/skipped/unrun/interrupted/flaky outcomes and failure details. Read the run's Job summary and retained report artifacts. Candidate image generation and normal comparison are recorded separately. A normal comparison receipt requires the current commit, the full suite, comparison mode and successful completion of every required case.

When updating this table, include the commit and run link. Record counts only after obtaining the report, and record image review only after inspecting actual/expected/diff images. Preserve unexecuted scope after failure or interruption; historical image acceptance cannot replace a current comparison.

See [execution and baseline workflow](e2e.en.md) and the [archived visual review](ui-visual-review.en.md). Unity, VRChat, real capture and physical devices require separate validation.
