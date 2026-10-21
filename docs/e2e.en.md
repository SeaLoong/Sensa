# Browser verification and screenshot baselines

[简体中文](e2e.md) | **English**

E2E participates in automatic CI and stable-release checks. Unit tests and a full normal browser comparison must pass before release artifacts are built and published. Application and site outcomes stay separate: successful documentation deployment does not replace an application comparison. [Development and releases](development.en.md)

## What actually runs?

| Scope | Actual execution | Limits |
| --- | --- | --- |
| Sensa application | Real service, HTTP/WebSocket, browser and loopback mock transports | No real devices or VRChat client |
| Standalone explorer | Six local assets, SVG, software WebGL2, dragging and fallback | Not a Unity producer or native GPU capture |
| Documentation site | Built artifact navigation, bilingual section links and narrow-screen scrolling | Does not replace application behavior or screenshot checks |

Large-catalog cases continuously update 4,096 simulated parameters, checking the 100-row page limit, direct navigation, full-catalog filtering, freezing and source-specific details. Other cases check actual input permission, modes, mapping saves, disconnection and invalidity stops together with mock transports. Device configuration remains isolated, never automatically activating the user's hardware.

Desktop 1280×900 and narrow 390×844 use a fixed browser environment; 320px is a separate reflow check. A narrow viewport is not a physical phone, and simulated inputs are not uploaded Avatars. [Test source](https://github.com/SeaLoong/Sensa/tree/main/tests/e2e)

## Where is the current result?

Open the Actions run's Job summary, then download application `e2e-report` or site `pages-verification`. `summary.json`/`summary.md` retain the commit, attempt, suite, screenshot mode, projects, viewports and failures. Maintain the [verification record](e2e-status.en.md) from observed results; updating test source is not an executed pass.

| Outcome | Meaning |
| --- | --- |
| `passed` / `failed` | Cases that actually passed / failed |
| `expectedFailure` / `flaky` | Expected failure / inconsistent attempts; not clean passes |
| `skipped` | Explicitly skipped |
| `notRun` / `interrupted` | Not executed / interrupted during execution |
| Runner / Command | Browser runner status / final Actions command outcome; inspect both |

Without a valid current report, the summary records not-run and zero observed cases without inventing a count for unloaded tests. Publication comparison evidence requires a normal comparison for the current commit/run with every desktop and narrow-screen case passing. Empty runs, filtering/sharding, skips, retry passes and candidate mode cannot replace it.

## What should happen after screenshot failure?

Inspect expected/actual/diff, trace, service logs and last observations first. Fix behavior/layout defects in the implementation. Intentional visual changes require image review before baseline updates. Ordinary CI cannot write baselines automatically, and missing images fail.

## How do I update E2E manually?

Run [`update-e2e.yml`](https://github.com/SeaLoong/Sensa/actions/workflows/update-e2e.yml) in Actions. Default `screenshots` mode needs no AI key. It runs the browser against current code and produces candidate images, reports and a review PR. It neither writes directly to `main` nor merges automatically.

The repository Actions secret `SENSA_PAT` pushes the candidate branch and creates its review PR. The PR event automatically starts normal CI. Candidate capture and agent steps do not receive the secret. [Secret usage and permissions](development.en.md#which-secrets-do-workflows-use)

Optional `agent` mode additionally requires an `OPENAI_API_KEY` repository Actions secret. The agent maintains tests only under `tests/e2e/`, then candidates are captured. Use the default mode without that secret; an unexecuted agent step is not a pass. An external agent can dispatch the workflow using its own authorized GitHub identity, without reading or copying an Actions secret.

Inspect actual/expected/diff, test edits and run results in the PR by language and viewport. Accept intentional visual changes while retaining necessary behavior assertions. The maintenance branch triggers normal CI; decide whether to merge after normal comparison and manual review succeed. Candidate capture publishes no product and is not normal-comparison evidence.

For report artifacts alone, `e2e.yml` still supports manual `update_snapshots=true` with `e2e-baselines` and `e2e-report` downloads. Partial screenshots from failed tasks are diagnostic, not automatic acceptance.

## Manual and real-environment boundaries

Use [V1–V6](ui-quality.en.md) for hierarchy, type, grouping, color, alignment and bilingual completeness. Axe and keyboard checks cover an automatically detectable subset; retain incomplete and unexecuted scope. Zero violations do not certify full WCAG compliance. Historical acceptance is recorded in the [visual review archive](ui-visual-review.en.md).

Unity uploads, actual Contacts/OSC, HMD/desktop encoding and physical stops still need separate acceptance. Reports identify simulated sources; browser or loopback outcomes must not be described as hardware passes.
