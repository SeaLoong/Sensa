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

Contact direct-tracking cases simulate metre positions and relative velocity using the SDK's native field names. They check position/speed endpoint calibration, Depth/V0 mappings, stopping on sender type 0, and stopping when Sample freezes despite changing velocity. Explorer checks cover twelve alphabetically ordered parameters, bilingual meanings, single-sphere coverage, negative coordinates, valid zero position/velocity and SDK versus Sensa activity fields. Site cases open both the new explorer scene and the [Contact SDK guide](contact-sdk.en.md).

Shader cases use twelve-field simulated packets to check position, Right/Forward and AvatarScale readings, endpoint calibration for all seven added metrics and clearing invalid values. The explorer checks the 49×49 QR monochrome grid, finder patterns, white margin, Reed–Solomon correction and CRC32. Windows builds additionally replay synthetic native PNGs through the bridge, OSC and actual service, checking erasure recovery, valid observations and freezing. Actual GPU pixels have separate Unity graphics contracts.

Signal-pipeline cases use Chinese and English controls to create manual/OSC weighted calculations, hysteresis and temporal smoothing, then inspect Float/Int/Bool types, ranges and stop values in actual UDP messages. Session cases check raw and converted values and invalid intervals in JSON Lines/CSV, verify downloaded file contents, then replay raw values to OSC with pause and seeking. Complete-plan cases cover export, import preview, preserved axis profiles and disabled inputs/outputs after application. Malformed names or output rows must show an import-panel error, preserve configuration and activation, and allow a subsequent valid import. [Signal pipeline](signal-pipeline.en.md)

Pages cases check the homepage's three-step introduction, input–computation–output flow, downloads and help links, including the locale path of every first-run link. Full-page captures of the homepage and first-run guide cover both languages and viewports, producing eight images for individual review. Successful site behavior and accessibility checks gate deployment of the same built artifact.

Funscript recording cases check the default format, separate L0/R0 tracks, converted 0–100 positions and integer milliseconds, segmentation after invalidity and offsets on the original timeline. They download and inspect each completed file, load it into signal replay and the script player, then check actual OSC output, pause stop values and disabled input after loading.

Shared-session cases use SharedWorker and BroadcastChannel/Web Locks separately, opening twenty same-origin pages and inspecting backend connection counts, request correlation and state across pages. They close some pages, including the connection owner, and check the remaining pages stay usable. They also check connection release after all pages close, preserved current values on reopening and at-most-once control delivery. Isolated lifecycle unit tests check page-cache suspension and restoration.

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

The workflow pins latest `main` at its start and runs the full application and site suite against that source. After every case passes, the review PR includes application baseline candidates and eight site captures. Its image links point to the exact candidate commit and open directly on GitHub. Each capture records the source, Actions run and attempt, with the site build manifest and image hashes checked during export.

Site captures live under `tests/e2e/__review__/site/{desktop,mobile}/`: `home-en-US.png`, `home-zh-CN.png`, `guide-en-US.png` and `guide-zh-CN.png`. Review them for layout, wording and readability. Application baselines live under `tests/e2e/__screenshots__/` and receive normal screenshot comparison in CI. Ordinary CI and Pages retain site captures as report attachments; only the manual Update E2E candidate export updates the eight repository images.

The repository Actions secret `SENSA_PAT` pushes the candidate branch and creates its review PR. The PR event automatically starts normal CI. [Workflow secrets](development.en.md#which-secrets-do-workflows-use)

Optional `agent` mode additionally uses the `OPENAI_API_KEY` repository Actions secret. The agent maintains tests under `tests/e2e/`, then candidates are captured.

Inspect application actual/expected/diff, the eight site captures, test edits and run results in the PR by language and viewport. Accept intentional visual changes while retaining necessary behavior assertions. Candidate capture and normal comparison are recorded separately. Merge the PR after normal comparison and review succeed.

For report artifacts alone, run `e2e.yml` manually with `update_snapshots=true` and download `e2e-baselines` and `e2e-report`. Partial screenshots from failed tasks help diagnose the failure.

## Manual and real-environment boundaries

Use [V1–V6](ui-quality.en.md) for hierarchy, type, grouping, color, alignment and bilingual completeness. Axe and keyboard checks cover automatically detectable requirements, with incomplete and unexecuted items retained in reports. Review remaining accessibility requirements manually. Historical acceptance is recorded in the [visual review archive](ui-visual-review.en.md).

Unity uploads, actual Contacts/OSC, HMD/desktop encoding and physical stops receive separate acceptance checks. Reports identify browser, mock-transport and real-environment results separately.
