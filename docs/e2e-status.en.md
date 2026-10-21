# Browser verification record

[简体中文](e2e-status.md) | **English**

This records browser runs that were actually inspected; it is not a live dashboard. Current CI requires units and a full normal E2E comparison before building/publishing, with separate site E2E for documentation. Read the current commit's [Actions](https://github.com/SeaLoong/Sensa/actions) status and the [development/release guide](development.en.md).

## Recorded runs

These entries were last checked on 2026-10-22 at 07:13 China Standard Time (UTC+8). Their results apply to those commits, not to a new commit's checks.

| Commit | Scope | Run | Outcome observed at the time |
| --- | --- | --- | --- |
| `6a9941f` | Full normal application browser comparison | [39691447010](https://github.com/SeaLoong/Sensa/actions/runs/39691447010) | 74 total: 11 passed, 3 failed, 60 not run; every other outcome was zero. The same three old screenshot-baseline differences below remain; builds and publication did not run |
| `6a9941f` | Documentation site E2E and automatic deployment | [39691446947](https://github.com/SeaLoong/Sensa/actions/runs/39691446947) | All 8 cases passed, with every other outcome zero. Site build and deployment succeeded |
| `b3fc2db` | Full normal application browser comparison | [39690646114](https://github.com/SeaLoong/Sensa/actions/runs/39690646114) | 74 total: 11 passed, 3 failed, 60 not run; expected failures, flaky, skipped and interrupted were all zero. Failures are the three old screenshot-baseline differences below. Unrun cases are not passes; publication was blocked |
| `b3fc2db` | Documentation site E2E and automatic deployment | [39690646060](https://github.com/SeaLoong/Sensa/actions/runs/39690646060) | All 8 cases passed, with every other outcome zero. Site build and deployment succeeded, confirming the narrow-screen table fixture correction |
| `b3fc2db` | Manual E2E candidate capture | [39690660505](https://github.com/SeaLoong/Sensa/actions/runs/39690660505) | 74 total: 72 passed, 2 failed, every other outcome zero with no unrun cases. Both desktop and narrow-screen offline Three.js geometry cases expected `1.8` but received `1.88`. The proposal was not exported, no maintenance branch or PR was created, and no images were accepted |
| `6356a89` | Documentation site E2E | [39690227009](https://github.com/SeaLoong/Sensa/actions/runs/39690227009) | 6/8 passed, 2 failed, no skipped or unrun cases. The narrow-screen fixture incorrectly assumed the development guide's two-column table would overflow. Using the positioning guide's genuinely wide table fixed it, as confirmed by the later `b3fc2db` run |
| [`330ba6e`](https://github.com/SeaLoong/Sensa/commit/330ba6e6e58b431c038e80db1a692f89fb9c8f1c) | Application interfaces and full browser comparison | [39680217981](https://github.com/SeaLoong/Sensa/actions/runs/39680217981) | Interface checks succeeded; browser job failed with the three screenshot failures below; complete counts and unexecuted scope were not read |
| [`330ba6e`](https://github.com/SeaLoong/Sensa/commit/330ba6e6e58b431c038e80db1a692f89fb9c8f1c) | Documentation build, browser navigation and deployment | [39680217958](https://github.com/SeaLoong/Sensa/actions/runs/39680217958) | Succeeded overall; exact case counts were not read |
| `6aa31cb` | Application interfaces and browser comparison | [39677023629](https://github.com/SeaLoong/Sensa/actions/runs/39677023629) | Failed overall; complete failing cases, counts and images were not obtained, so not all causes were confirmed |
| `6aa31cb` | Documentation build and browser navigation | [39677023513](https://github.com/SeaLoong/Sensa/actions/runs/39677023513) | Succeeded overall; this did not validate application screenshots or real devices |
| `c713db3` | Application interfaces and browser comparison | [39669246139](https://github.com/SeaLoong/Sensa/actions/runs/39669246139) | Failed overall |

## Located differences without image acceptance

Latest source: [public annotations for the 6a9941f browser job](https://github.com/SeaLoong/Sensa/actions/runs/39691447010/job/119538579292). The differences match those previously reported for `b3fc2db` and `330ba6e`. These are assertion reports, not accepted baselines.

| Desktop image | Result reported at the time |
| --- | --- |
| `english-help.png` | Baseline 560×622, actual 560×662; 12,061 pixels differed |
| `paired-pose.png` | 1,123 pixels differed |
| `help-workflow.png` | Baseline 560×492, actual 560×562; 13,084 pixels differed |

Unexecuted cases are not inferred to have passed, and historical image reviews do not establish results for another commit. See the [visual review archive](ui-visual-review.en.md) for the original review scope.

## How should later outcomes be recorded?

After checks/E2E finish, verify the commit, run link, suite and screenshot mode, then record actual passed/failed/skipped/unrun/interrupted scope from `summary.json`/`summary.md` or the corresponding `Browser result` annotation. Fill counts only after reading the report and record image acceptance only after inspecting actual/expected/diff. Maintenance candidate PRs and normal comparison results remain separate; generated candidates are not passes. [Execution and maintenance](e2e.en.md)
