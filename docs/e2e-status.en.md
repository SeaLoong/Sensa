# Browser verification record

[简体中文](e2e-status.md) | **English**

This records observed runs; it is not a live dashboard. Check [Actions](https://github.com/SeaLoong/Sensa/actions) for the run attached to the current commit. Updated test source, passing unit tests and a successful documentation deployment do not replace an application browser comparison.

## Confirmed outcomes

Last checked: 2026-10-21 21:42 UTC. In-progress runs are not passes.

| Commit | Scope | Run | Observed outcome |
| --- | --- | --- | --- |
| [`330ba6e`](https://github.com/SeaLoong/Sensa/commit/330ba6e6e58b431c038e80db1a692f89fb9c8f1c) | Application interfaces and full browser comparison | [39680217981](https://github.com/SeaLoong/Sensa/actions/runs/39680217981) | Interface checks succeeded; browser job failed with the three screenshot failures listed below; full counts and unexecuted scope have not been read |
| [`330ba6e`](https://github.com/SeaLoong/Sensa/commit/330ba6e6e58b431c038e80db1a692f89fb9c8f1c) | Documentation build, browser navigation and deployment | [39680217958](https://github.com/SeaLoong/Sensa/actions/runs/39680217958) | Succeeded overall, including the new bilingual section and narrow-screen scrolling checks; exact case counts have not been read |
| `6aa31cb` | Application interfaces and browser comparison | [39677023629](https://github.com/SeaLoong/Sensa/actions/runs/39677023629) | Failed overall; the complete failing cases, counts and images have not been read, so not all causes are confirmed |
| `6aa31cb` | Documentation build and browser navigation | [39677023513](https://github.com/SeaLoong/Sensa/actions/runs/39677023513) | Succeeded overall; this does not validate application screenshots or real devices |
| `c713db3` | Application interfaces and browser comparison | [39669246139](https://github.com/SeaLoong/Sensa/actions/runs/39669246139) | Failed overall; a later documentation success cannot replace it |

The current environment can read public run status but has not obtained complete logs or images: web report downloads require sign-in, and the environment proxy still blocks `api.github.com`. This record therefore does not attribute every failure to screenshot changes or invent unavailable counts. This iteration fixes the explorer's old title assertions and extends large-catalog, detail and site-navigation cases; source updates still need executed confirmation.

### Located screenshot differences

Source: [public annotations for the 330ba6e browser job](https://github.com/SeaLoong/Sensa/actions/runs/39680217981/job/119500577764). These are assertion reports, not image review findings.

| Desktop case / image | Reported result | Follow-up |
| --- | --- | --- |
| English presets, script and help / `english-help.png` | Baseline 560×622, current 560×662; 12,061 pixels differ | Inspect help copy, layout and image diff |
| Paired pose / `paired-pose.png` | 1,123 pixels differ | Inspect panel values, layout and image diff |
| Help, outputs and profiles / `help-workflow.png` | Baseline 560×492, current 560×562; 13,084 pixels differ | Inspect Chinese help copy, layout and image diff |

This iteration retains comparison thresholds and existing baselines. Download `e2e-report` to decide whether the layout needs correction or an intentional change can be accepted, then run normal comparison. Unexecuted cases remain unverified.

## Keeping evidence current

Each run produces a summary containing the commit, suite, screenshot mode, viewports, passed/failed/expected-failure/skipped/unrun/interrupted/flaky outcomes and failure details. Read the run's Job summary and retained report artifacts. Candidate image generation and normal comparison are recorded separately. A normal comparison receipt requires the current commit, the full suite, comparison mode and successful completion of every required case.

When updating this table, include the commit and run link. Record counts only after obtaining the report, and record image review only after inspecting actual/expected/diff images. Preserve unexecuted scope after failure or interruption; historical image acceptance cannot replace a current comparison.

See [execution and baseline workflow](e2e.en.md) and the [archived visual review](ui-visual-review.en.md). Unity, VRChat, real capture and physical devices require separate validation.
