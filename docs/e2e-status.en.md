# Browser verification record

[简体中文](e2e-status.md) | **English**

This records browser runs that were actually inspected; it is not a live dashboard. Current CI requires units and a full normal E2E comparison before building/publishing, with separate site E2E for documentation. Read the current commit's [Actions](https://github.com/SeaLoong/Sensa/actions) status and the [development/release guide](development.en.md).

## Recorded runs

These entries were last checked on 2026-10-22 at 05:42 China Standard Time (UTC+8). Their results apply to those commits, not to a new commit's checks.

| Commit | Scope | Run | Outcome observed at the time |
| --- | --- | --- | --- |
| [`330ba6e`](https://github.com/SeaLoong/Sensa/commit/330ba6e6e58b431c038e80db1a692f89fb9c8f1c) | Application interfaces and full browser comparison | [39680217981](https://github.com/SeaLoong/Sensa/actions/runs/39680217981) | Interface checks succeeded; browser job failed with the three screenshot failures below; complete counts and unexecuted scope were not read |
| [`330ba6e`](https://github.com/SeaLoong/Sensa/commit/330ba6e6e58b431c038e80db1a692f89fb9c8f1c) | Documentation build, browser navigation and deployment | [39680217958](https://github.com/SeaLoong/Sensa/actions/runs/39680217958) | Succeeded overall; exact case counts were not read |
| `6aa31cb` | Application interfaces and browser comparison | [39677023629](https://github.com/SeaLoong/Sensa/actions/runs/39677023629) | Failed overall; complete failing cases, counts and images were not obtained, so not all causes were confirmed |
| `6aa31cb` | Documentation build and browser navigation | [39677023513](https://github.com/SeaLoong/Sensa/actions/runs/39677023513) | Succeeded overall; this did not validate application screenshots or real devices |
| `c713db3` | Application interfaces and browser comparison | [39669246139](https://github.com/SeaLoong/Sensa/actions/runs/39669246139) | Failed overall |

## Located differences without image acceptance

Source: [public annotations for the 330ba6e browser job](https://github.com/SeaLoong/Sensa/actions/runs/39680217981/job/119500577764). These were assertion reports, not accepted baselines.

| Desktop image | Result reported at the time |
| --- | --- |
| `english-help.png` | Baseline 560×622, actual 560×662; 12,061 pixels differed |
| `paired-pose.png` | 1,123 pixels differed |
| `help-workflow.png` | Baseline 560×492, actual 560×562; 13,084 pixels differed |

Unexecuted cases are not inferred to have passed, and historical image reviews do not establish results for another commit. See the [visual review archive](ui-visual-review.en.md) for the original review scope.

## How should later outcomes be recorded?

After checks/E2E finish, verify the commit, run link, suite and screenshot mode, then record actual passed/failed/skipped/unrun/interrupted scope from `summary.json`/`summary.md`. Fill counts only after reading the report and record image acceptance only after inspecting actual/expected/diff. Maintenance candidate PRs and normal comparison results remain separate; generated candidates are not passes. [Execution and maintenance](e2e.en.md)
