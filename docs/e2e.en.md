# Browser verification and screenshot baselines

[简体中文](e2e.md) | **English**

E2E participates in automatic CI and stable-release checks. After unit tests and a full normal browser comparison pass, the workflow builds and publishes download packages. Application and documentation-site results are recorded separately. [Development and releases](development.en.md)

## What actually runs?

| Scope | Actual execution | Environment |
| --- | --- | --- |
| Sensa application | Real service, HTTP/WebSocket, browser and loopback mock transports | Independent application process and simulated inputs in Actions |
| Standalone explorer | Six local assets, SVG, software WebGL2, dragging and fallback | Browser software rendering |
| Documentation site | Built artifact navigation, bilingual section links and narrow-screen scrolling | Built static site |

Large-catalog cases continuously update 4,096 simulated parameters, checking the 100-row page limit, direct navigation, full-catalog filtering, freezing and source-specific details. Other cases check actual input permission, modes, mapping saves, disconnection and invalidity stops together with mock transports. Tests use separate device configuration.

Desktop 1280×900 and narrow 390×844 use a fixed browser environment; 320px is a separate reflow check. [Test source](https://github.com/SeaLoong/Sensa/tree/main/tests/e2e)

## Where is the current result?

Open the Actions run's Job summary, then download application `e2e-report` or site `pages-verification`. `summary.json`/`summary.md` retain the commit, attempt, suite, screenshot mode, projects, viewports and failures. The [verification record](e2e-status.en.md) is updated from observed run results.

| Outcome | Meaning |
| --- | --- |
| `passed` / `failed` | Cases that actually passed / failed |
| `expectedFailure` / `flaky` | Expected failure / inconsistent attempts; not clean passes |
| `skipped` | Explicitly skipped |
| `notRun` / `interrupted` | Not executed / interrupted during execution |
| Runner / Command | Browser runner status / final Actions command outcome; inspect both |

Publication requires a normal comparison for the current commit and run with every desktop and narrow-screen case passing. Empty runs, filtering/sharding, skips, retry passes and candidate mode do not meet this requirement. Until a valid current report is available, the summary records not-run and zero observed cases.

## What should happen after screenshot failure?

Inspect expected/actual/diff, trace, service logs and last observations first. Fix behavior/layout defects in the implementation. Review intentional visual changes before updating baselines. Ordinary CI compares existing baselines and records missing images as failures.

## How do I update E2E manually?

Run [`update-e2e.yml`](https://github.com/SeaLoong/Sensa/actions/workflows/update-e2e.yml) in Actions. Default `screenshots` mode runs the browser against current code and produces candidate images, reports and a review PR for a reviewer to merge.

The repository Actions secret `SENSA_PAT` pushes the candidate branch and creates its review PR. The PR event automatically starts normal CI. [Workflow secrets](development.en.md#which-secrets-do-workflows-use)

Optional `agent` mode additionally uses the `OPENAI_API_KEY` repository Actions secret. The agent maintains tests under `tests/e2e/`, then candidates are captured.

Inspect actual/expected/diff, test edits and run results in the PR by language and viewport. Accept intentional visual changes while retaining necessary behavior assertions. Candidate capture and normal comparison are recorded separately. Merge the PR after normal comparison and review succeed.

For report artifacts alone, run `e2e.yml` manually with `update_snapshots=true` and download `e2e-baselines` and `e2e-report`. Partial screenshots from failed tasks help diagnose the failure.

## Manual and real-environment boundaries

Use [V1–V6](ui-quality.en.md) for hierarchy, type, grouping, color, alignment and bilingual completeness. Axe and keyboard checks cover automatically detectable requirements, with incomplete and unexecuted items retained in reports. Review remaining accessibility requirements manually. Historical acceptance is recorded in the [visual review archive](ui-visual-review.en.md).

Unity uploads, actual Contacts/OSC, HMD/desktop encoding and physical stops receive separate acceptance checks. Reports identify browser, mock-transport and real-environment results separately.
