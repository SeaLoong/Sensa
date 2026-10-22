# Browser verification record

[简体中文](e2e-status.md) | **English**

This page retains inspected runs; read each commit's [Actions](https://github.com/SeaLoong/Sensa/actions) for current progress. See [development and releases](development.en.md) and [E2E maintenance](e2e.en.md) for the workflow.

## Computed signals

On 2026-10-23 (Beijing time), this change adds multi-input calculations, reusable intermediate results and mapping controls. Current isolated local checks passed: **134 Web**, **237 Python**, **497 .NET** tests and a build of **84 documentation routes**. Regression checks cover path-prefix caching, wildcard refresh and zero-segment matching; tracked-input labels also update when switching language. Three-point opening offsets in calculations and mappings are labeled in reference-local units. [Feature and operation](computed-signals.en.md)

| Commit | Scope | Run | Inspected outcome |
| --- | --- | --- | --- |
| `9e700cf` | Full candidate capture | [39837678118, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39837678118/attempts/1) | **88 total: 2 passed, 3 failed, 83 unrun**; expected failures, flaky, skipped and interrupted all zero; complete selection, candidate mode, `snapshotsCompared=false` |
| `9e700cf` | Documentation site checks and deployment | [39837667830](https://github.com/SeaLoong/Sensa/actions/runs/39837667830) | **8/8 passed**, every other outcome zero; site-only selection, `selectionComplete=false`, `snapshotsCompared=true`, automatic deployment succeeded |
| `9dc7de2` | Full candidate capture | [39838949791, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39838949791/attempts/1) | **88/88 passed**, every other outcome zero; `selectionComplete=true`, `snapshotsCompared=false`, images exported to PR #18 |
| `9dc7de2` | Normal comparison, incomplete | [39838933199](https://github.com/SeaLoong/Sensa/actions/runs/39838933199) | **88 total: 8 passed, 3 failed, 77 unrun**; every other outcome zero; complete selection, `snapshotsCompared=true`; two new baselines missing and the existing mappings-page image changed |
| `9dc7de2` | Documentation site checks and deployment | [39838933002, attempt 2](https://github.com/SeaLoong/Sensa/actions/runs/39838933002/attempts/2) | **8/8 passed**, every other outcome zero; site-only selection, `selectionComplete=false`, `snapshotsCompared=true`, automatic deployment succeeded |
| `36c09a1` | Complete normal comparison | [39841973847](https://github.com/SeaLoong/Sensa/actions/runs/39841973847) | **88/88 passed**, every other outcome zero; `selectionComplete=true`, `snapshotsCompared=true`, image updates disabled |
| `e4ab679` | Complete main comparison | [39844928808](https://github.com/SeaLoong/Sensa/actions/runs/39844928808) | **88 total: 87 passed, 1 failed**, every other outcome zero; complete selection and normal screenshot comparison; a Contact speed case timed out waiting for a boolean state, preventing publication |
| `e4ab679` | Documentation site checks and deployment | [39844928814](https://github.com/SeaLoong/Sensa/actions/runs/39844928814) | **8/8 passed**, every other outcome zero; site-only selection, `selectionComplete=false`, `snapshotsCompared=true`, automatic deployment succeeded |

The initial candidate and site runs pin source `9e700cfebb9436a2cd99fbd25d0c50d9c06150a1`. Candidate failures came from new E2E locators searching `input[list]` by the textbox role, leaving Chinese/English weighted-average and SPS path assertions unable to find their fields. Locators now use field labels while preserving the behavior assertions. The second candidate, earlier normal comparison and that site run pin `9dc7de27645fb484fa52711656bf31b05ff3f84a`. Pages attempt 1 reached its ten-minute dependency-install limit before browser cases ran; attempt 2 deployed successfully using the same commit.

Main run `39844928808` pinned `e4ab6795c07bcc47b26facd27b5410e0733d5ff5` and executed all 88 cases. Its sole failure was a boolean-state wait in the existing Contact speed case; the original annotation omitted the assertion location. Review then identified a possible save race: GET can expose the new mappings while the browser is still completing its save, yet the experimental-settings button allowed another save. Configuration buttons now share the busy condition, and the Contact case waits for browser save completion. Initialization checks expose the full observation, and failure summaries retain the actual assertion location and stack. The failed run remains recorded; the corrected source requires its own complete run.

PR #18's original image commit `ea15168fd5c238e9fc894d09cac4454ef5d37f66` proposed **19 new/changed candidates**, all individually opened by coding assistants. The selected set contains **14 images**: 12 computation editor, input and settings images across Chinese/English and desktop/narrow layouts, plus two mappings-page images. Five unrelated changes retain their original bytes: 36 edge pixels in desktop English help, live speed changing from 0.25 to 0.20 m/s in narrow Contact position (198 pixels), and 4/2/1-pixel variation in three parameter diagrams. The set now contains **134 PNGs**, 67 in each viewport; the 14 selected images split seven per viewport, while **120 PNGs** retain their existing bytes.

V1–V6 inspection found the new controls readable, with no new blocking or major visual issue. English counts still display `1 mappings` (existing) and `1 calculations` (new); long content scrolls normally. Filtered head `7644507` also includes locale-label refresh `5c32f38` and zero-segment glob compatibility `b176897`. Complete normal comparison pinned `36c09a18f649bd0dc61cf1222160254e3ef2d0a2`, whose Git tree exactly matches PR head `d2044c669eab1506dc92aaaf157dece3734c2327`. Baselines are accepted after individual inspection and this complete normal comparison. [Individual inspection record](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md)

## SPS four-anchor tracking naming

On 2026-10-23 (Beijing time), public names are standardized as “SPS 四点定位” and “SPS four-anchor tracking” across application help, root types, the parameter explorer, Unity menus and bilingual documentation.

Isolated local checks passed: **126 Web** and **237 Python** tests, Unity package metadata and an **80-page documentation build**. New installer tests use fake APT to check source selection, retries and failure exits.

| Commit | Scope | Run | Inspected outcome |
| --- | --- | --- | --- |
| `dcdb7fa` | Full candidate capture | [39821880631, attempt 2](https://github.com/SeaLoong/Sensa/actions/runs/39821880631/attempts/2) | **80/80 passed**, every other outcome zero; complete selection, candidate mode, images exported to PR #17 |
| `12dab3f` | Filtered full normal comparison | [39825612644, attempt 2](https://github.com/SeaLoong/Sensa/actions/runs/39825612644/attempts/2) | **80/80 passed**, every other outcome zero; complete selection, normal screenshot comparison, `snapshotsCompared=true` |
| `dcdb7fa` | Documentation site checks and deployment | [39821827672](https://github.com/SeaLoong/Sensa/actions/runs/39821827672) | **8/8 passed**, every other outcome zero; new names and bilingual build guide checked, automatic deployment succeeded |

PR #17's original image commit `a5e3173` proposed 47 changed candidates; coding assistants individually opened all 47. The selected set contains **44 intentional text changes**: 40 parameter diagrams and four help dialogs, 22 desktop and 22 narrow-layout images. Three Contact images with only live-speed or edge-antialias variation retain their original baselines; **78 PNGs** keep their existing bytes. New names, Socket/Plug root explanations, units, long parameter names and controls remain readable, with no new blocking or major visual issue. [Inspection scope and existing details](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md)

Filtered image commit `6787b0f20cdc44e5bbc08b7054cccb7c810ca563` has the same Git tree as comparison source `12dab3f00fbb05f6e97b34b3f3d1a5864ab48d55`. Baselines are accepted after individual inspection and full normal comparison, with image updates disabled, `selectionComplete=true` and `snapshotsCompared=true`. The first candidate, initial main comparison and first PR comparison reached the five-minute dependency-install limit before browser cases ran; each retry pins its own unchanged commit. The shared installer now refreshes only the required Ubuntu indexes with two bounded attempts; see [development and releases](development.en.md) for the budgets.

## Unity authoring components and build pipeline

On 2026-10-23 (Beijing time), isolated local checks passed: **126 Web** and **230 Python** tests, Unity package metadata and an **80-page documentation build**; **46 C# files** passed C# 9 syntax parsing. Parsing checks syntax only; Unity Editor compilation, EditMode execution and client acceptance remain pending. [Implementation, setup and official evidence](unity-build.en.md)

Site E2E now checks both build-guide entries, language switching, build timing and official reference links, with guide screenshots for both languages attached to the run report. This change retains the 122 reviewed comparison baselines.

| Commit | Scope | Run | Inspected outcome |
| --- | --- | --- | --- |
| `d7246c1` | Full normal comparison and six native builds | [39817899186](https://github.com/SeaLoong/Sensa/actions/runs/39817899186) | **80/80 passed**, every other outcome zero; complete selection and normal screenshot comparison; all six native builds/isolated smoke checks, Windows Shader bridge replay and Unity packaging passed |
| `d7246c1` | Documentation site checks and deployment | [39817899027](https://github.com/SeaLoong/Sensa/actions/runs/39817899027) | **8/8 passed**, every other outcome zero; bilingual build guide, official reference entries and narrow layouts checked, automatic deployment succeeded |

The full comparison disables image updates, with `selectionComplete=true` and `snapshotsCompared=true`. The separate site-only selection contains 8 cases. The first [Pages run 39817289697](https://github.com/SeaLoong/Sensa/actions/runs/39817289697) on `46db6f8` had **6/8 passed and 2 failed**, every other outcome zero: the new assertion searched for a full path while the correct generated link was relative. It now locates the visible name and verifies the destination after clicking. The superseded full run [39817289668](https://github.com/SeaLoong/Sensa/actions/runs/39817289668) was intentionally cancelled after pushing the fix; its browser result does not count as complete acceptance.

## Contact SDK adaptation

On 2026-10-22, isolated local checks passed: **126 Web**, **434 backend** and **228 Python** tests, plus Unity package metadata checks and a **76-page documentation build**. [Feature and official SDK evidence](contact-sdk.en.md)

| Commit | Scope | Run | Inspected outcome |
| --- | --- | --- | --- |
| `8e77ba4` | Full candidate capture | [39792231646](https://github.com/SeaLoong/Sensa/actions/runs/39792231646) | **80/80 passed**, every other outcome zero; complete selection, candidate mode, image export and PR #16 creation succeeded |
| `1d46aa9` | Full normal comparison and six native builds | [39794320594](https://github.com/SeaLoong/Sensa/actions/runs/39794320594/attempts/2) | **80/80 passed**, every other outcome zero; attempt 2 completed full normal comparison, with all six native builds/smoke checks, Windows Shader bridge replay and Unity packaging passed |
| `8e77ba4` | Documentation site checks and deployment | [39792230278](https://github.com/SeaLoong/Sensa/actions/runs/39792230278) | **8/8 passed**, every other outcome zero; Contact explorer/guide entries checked, automatic deployment succeeded |

Full application cases cover Contact metre-position calibration, stationary zero velocity, speed calibration, actual mock Depth/V0 transport output, and stops after contact loss or a frozen activity counter. Explorer cases check all twelve fields, ordering, independent position/velocity controls, boundaries and Sample invalidity, alongside SPS four-anchor/Shader regressions. The separate site-only selection contains 8 cases.

## Contact SDK image inspection

Image commit `9166f82` contains **122 PNGs**. Coding assistants individually opened and reviewed **56 new/changed images**: 28 desktop and 28 narrow-layout images, covering 48 bilingual parameter diagrams and 8 application images. The remaining 66 PNGs retain their bytes. No blocking or major visual issue was found; desktop velocity-unit wrapping is recorded as a layout detail. [Image provenance and review](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md)

Normal comparison uses PR merge commit `1d46aa95e8512912fd97333b368bcf717aaf675e`, whose Git tree matches image commit `9166f82e4142bc38748bb9bb7dd70bd2383e7f5e` exactly. Image updates were disabled, `selectionComplete=true` and `snapshotsCompared=true`; baselines passed individual inspection and full comparison. Attempt 1 reached its 25-minute limit during dependency installation before browser cases ran; attempt 2 passed on the same commit. See [development and releases](development.en.md) for the current installation policy.

## Acceptance scope

Browser cases use isolated configuration and mock transports. Actual Beta SDK Unity/VRChat, OSC publishing, real GPU capture, physical touchscreens and device interactions receive separate acceptance checks. Unity EditMode contracts are written; Unity Editor execution remains pending. Accessibility details remain in each run's report.

Initial failures and fixes are retained in a [fixed record](https://github.com/SeaLoong/Sensa/blob/3eb67db15cbf36c31e69ada8bafa3a46d9d6f02c/docs/e2e-status.en.md): speed tests now use the vibration-only peer, English expectations check five presets, and new images receive this capture/review cycle. Earlier 74-case checks and publication remain at a [historical revision](https://github.com/SeaLoong/Sensa/blob/3821bc876b0e5d9bbc16c515e83754a18c555841/docs/e2e-status.en.md); earlier visual review remains in the [archive](ui-visual-review.en.md).

## Later records

After a run finishes, verify its commit, link, suite and screenshot mode, then record passed, failed, skipped, unrun, flaky and interrupted counts from `summary.json`/`summary.md` or the `Browser result` annotation. Image acceptance records both actual inspection scope and a normal comparison result.
