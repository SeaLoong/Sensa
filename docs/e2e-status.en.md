# Browser verification record

[简体中文](e2e-status.md) | **English**

This page retains inspected runs; read each commit's [Actions](https://github.com/SeaLoong/Sensa/actions) for current progress. See [development and releases](development.en.md) and [E2E maintenance](e2e.en.md) for the workflow.

## Signal pipeline, outputs and shared sessions

This change organizes inputs, computation and outputs into a reusable signal pipeline, adding Combined input, temporal processing, output bindings, session recording/replay and complete plans. New browser cases cover manual/OSC calculations, Float/Int/Bool in actual UDP messages, raw-reading replay from JSON Lines/CSV, axis profiles retained in plans, and cross-tab connections through SharedWorker and BroadcastChannel/Web Locks. [Operation](signal-pipeline.en.md) · [Actual coverage](e2e.en.md)

The funscript changes passed **665 .NET** and **171 Web** isolated checks; documentation built **88 routes** successfully. Four new funscript browser scenarios bring the full suite to **104 cases**, awaiting Actions results for their corresponding source.

The new baselines await inspection of the latest candidate images and a complete normal comparison. The table records installation failures, an incomplete normal comparison and candidate capture separately. Capture and comparison after the test corrections will be added when their final reports are available.

| Commit | Scope | Run | Inspected outcome |
| --- | --- | --- | --- |
| `f2b4d3d` | CI normal comparison, dependency installation incomplete | [39958639912, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39958639912/attempts/1) | Font dependency installation reached both 130-second budgets and exited **124**; browsers did not run, total/executed cases both **0**, `selectionComplete=false`, `snapshotsCompared=false` |
| `f2b4d3d` | Full-selection normal comparison, incomplete | [39958639912, attempt 2](https://github.com/SeaLoong/Sensa/actions/runs/39958639912/attempts/2) | **100 total: 5 passed, 3 failed, 92 unrun**, every other outcome zero; `selectionComplete=true`, `snapshotsCompared=true`, stopped at the three-failure limit |
| `f2b4d3d` | Candidate capture, dependency installation incomplete | [39958663771, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39958663771/attempts/1) | Browsers did not run, total/executed cases both **0**, `selectionComplete=false`, `snapshotsCompared=false` |
| `f2b4d3d` | Full-selection candidate capture, incomplete | [39958663771, attempt 2](https://github.com/SeaLoong/Sensa/actions/runs/39958663771/attempts/2) | **100 total: 27 passed, 3 failed, 70 unrun**, every other outcome zero; `selectionComplete=true`, `snapshotsCompared=false`, stopped at the three-failure limit |
| `f2b4d3d` | Site dependency installation incomplete | [39958639821, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39958639821/attempts/1) | Browser/font installation exceeded the original **10-minute** job limit; site browsers did not run, total/executed cases both **0**, `selectionComplete=false`, `snapshotsCompared=false`; deployment did not run |
| `f2b4d3d` | Site dependency installation incomplete | [39958639821, attempt 2](https://github.com/SeaLoong/Sensa/actions/runs/39958639821/attempts/2) | Browser/font installation exceeded the original **10-minute** job limit; site browsers did not run, total/executed cases both **0**, `selectionComplete=false`, `snapshotsCompared=false`; deployment did not run |
| `11a3071` | Corrected documentation checks and automatic deployment | [39962300270, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39962300270/attempts/1) | **8 total, 8 passed**, every other outcome zero; `runner=passed`, command succeeded, site-only selection, `selectionComplete=false`, `snapshotsCompared=true`; deployment succeeded |
| `11a3071` | Full-selection candidate capture, incomplete | [39962313700, attempt 2](https://github.com/SeaLoong/Sensa/actions/runs/39962313700/attempts/2) | **100 total: 78 passed, 3 failed, 19 unrun**, every other outcome zero; `runner=failed`, command failed, `selectionComplete=true`, `snapshotsCompared=false` |
| `1b77bec` | Documentation checks and automatic deployment | [39966284936, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39966284936/attempts/1) | **8 total, 8 passed**, every other outcome zero; `runner=passed`, command succeeded, site-only selection, `selectionComplete=false`, `snapshotsCompared=true`; deployment succeeded |
| `1b77bec` | Full-selection normal comparison, incomplete | [39966285080, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39966285080/attempts/1) | **100 total: 5 passed, 3 failed, 92 unrun**, every other outcome zero; `runner=failed`, command failed, `selectionComplete=true`, `snapshotsCompared=true`; native builds skipped, no publication |
| `1b77bec` | Full candidate capture | [39966319271, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39966319271/attempts/1) | **100/100 passed**, every other outcome zero; `runner=passed`, command succeeded, `selectionComplete=true`, `snapshotsCompared=false`; exported to PR #20 |

The earlier CI, candidate and two failed site-installation attempts pin source `f2b4d3dd2137df3d2079a1c1e604fb44d5c78f9d`. All three normal-comparison failures are screenshot differences from the interface update: `control-page` and the Chinese/English `computed-signal-editor` images. These changes will receive candidate-image inspection. This incomplete comparison remains recorded; a subsequent complete normal comparison with image updates disabled will validate the baselines.

The three candidate failures came from existing cases' assumptions about the interface structure: the input-safety case still checked keyboard navigation across three main tabs, and Chinese/English quality cases still located a direct output panel, now wrapped in `output-telemetry`. Corrections will cover full keyboard operation across all four tabs and check geometry against the actual container, preserving assertion strength.

The `11a3071` site and candidate runs pin source `11a30712db7efd38408798c53c50ace9911d75c8`. Installation now uses a fixed Ubuntu package source and separates system dependencies from the Chromium headless-shell download. The new installer completed within its first 130-second budget, followed by successful site comparison and deployment, validating the correction for the two earlier ten-minute installation timeouts. [CI 39962300289](https://github.com/SeaLoong/Sensa/actions/runs/39962300289) on the same source passed unit checks; its first attempt did not execute application browsers.

All three `11a3071` candidate failures occurred at `shared-session.spec.js:52`: calling `check()` on the input-activation checkbox reported that its state did not change. They affect narrow-layout SharedWorker and desktop SharedWorker/Web Locks cases. Subsequent normal comparisons and candidate captures both use a **35-minute** browser-job budget for the full 100-case suite. This partial execution and its candidate mode remain recorded; baselines still await inspection and a complete normal comparison.

The subsequent site run `39966284936`, normal comparison `39966285080` and full candidate `39966319271` pin source `1b77bec474a6af1215e1409db82d86f1513b2916`. The site-only comparison passed and deployed successfully. Application comparison dependencies installed on the first attempt. Its three failures are desktop interface-image changes: 2847 differing pixels in `control-page`, 2830 in `computed-signal-editor-zh-CN` and 2616 in `computed-signal-editor-en-US`. The failure limit left the remaining cases unrun; native builds were skipped and publication did not run.

The complete candidate exported to [PR #20](https://github.com/SeaLoong/Sensa/pull/20), with raw image commit `85171eb4df14ab7ba286d6837eda98afff08949c`. This run validates the 100-case suite before the funscript recording changes; the new format's recording and replay cases will be recorded with their corresponding source. All 36 original new/changed images were opened individually: 28 show intended changes, while eight vary only in live readings or edge pixels and are proposed to retain their earlier bytes. Plan-preview copy received further corrections. The latest funscript candidates and a complete normal comparison with image updates disabled remain pending; these baselines are not yet accepted.

## OSC parameter explanations and official sources

On 2026-10-23 (Beijing time), the explorer adds per-parameter explanations, and workbench details use the same bilingual definitions, with ranges, actual parameter types, units, interaction uses and sources. Definitions distinguish the official VRChat SDK, VRCFury/OGB and Sensa protocols. Review corrected Close/Shader Float transport types, the SPS2 length sphere, historical PenSelf, velocity units and Raycast miss behavior. [Parameter explanations and sources](osc-parameters.en.md)

Isolated local checks passed: **143 Web**, **497 .NET**, **237 Python** tests, Unity package metadata and a build of **84 documentation routes**. The complete browser suite remains 88 cases; expanded assertions cover every illustrated field, bilingual sources, workbench details, preserved expansion/focus and narrow-layout scrolling. All 55 new/changed candidates were individually opened. The selected 52 images contain 48 full-page explorer images and four detail windows; three unrelated live-reading/edge variations retain their previous baselines. The set contains 138 PNGs, with 86 existing images unchanged. No new blocking or major visual issue was found; the baselines are accepted after a complete normal comparison with image updates disabled. [Individual inspection record](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md)

| Commit | Scope | Run | Inspected outcome |
| --- | --- | --- | --- |
| `280c838` | Full candidate capture | [39853817326, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39853817326/attempts/1) | **88/88 passed**, every other outcome zero; `selectionComplete=true`, `snapshotsCompared=false`, exported to PR #19 |
| `280c838` | Initial normal comparison, incomplete | [39853785392](https://github.com/SeaLoong/Sensa/actions/runs/39853785392) | **35 passed, 3 failed, 50 unrun**, every other outcome zero; complete selection and normal image comparison; one new detail baseline missing and two intentionally changed full-page explorer images |
| `280c838` | Documentation checks and deployment | [39853785382](https://github.com/SeaLoong/Sensa/actions/runs/39853785382) | **8/8 passed**, every other outcome zero; site-only selection, `selectionComplete=false`, `snapshotsCompared=true`, deployed successfully |
| `b141d8e` | Filtered complete normal comparison | [39856717268, attempt 2](https://github.com/SeaLoong/Sensa/actions/runs/39856717268/attempts/2) | **88/88 passed**, every other outcome zero; `selectionComplete=true`, `snapshotsCompared=true`, image updates disabled |
| `b141d8e` | Six native builds and isolated smoke completed | [39856717268, attempt 3](https://github.com/SeaLoong/Sensa/actions/runs/39856717268/attempts/3) | All six native builds/isolated smoke checks, Windows Shader bridge replay and Unity packaging passed; reuses the passed full browser comparison; PR publication skipped |

Candidate, initial main comparison and site runs pin source `280c8387762e60b4ae12c97faee6de41c3e2eaf0`; raw candidate image commit is `71e1de8eeb88f1c7c4f4132e5be63495c270a2a0`. Source review also updates the PhysBone reference to its current official page.

Normal comparison pins source `b141d8e25a75f0d7c60ccf46c301d80c8ca874e4`, whose Git tree exactly matches reviewed PR #19 head `7aca23ab071c4b4bb330437c2ede19b3f9ab5bed`. Attempt 1 reached both 130-second dependency-install limits and exited 124 before browsers ran: total/executed cases were zero, `selectionComplete=false`, `snapshotsCompared=false`. Attempt 2 retried failed jobs on that unchanged commit, installed dependencies and passed the complete suite. All six builds/archives succeeded in attempt 2, but the following Windows x64 Shader replay step exited 1; API annotations provided no specific cause. Attempt 3 reran only the failed job on the same source and passed, preserving the other successful results.

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
| `a322cfa` | Corrected main comparison and six native builds | [39847830729](https://github.com/SeaLoong/Sensa/actions/runs/39847830729) | **88/88 passed**, every other outcome zero; full normal comparison, six native builds/isolated smoke checks and Unity packaging passed, development preview published |
| `a322cfa` | Corrected documentation checks and deployment | [39847830590](https://github.com/SeaLoong/Sensa/actions/runs/39847830590) | **8/8 passed**, every other outcome zero, deployed successfully |

The initial candidate and site runs pin source `9e700cfebb9436a2cd99fbd25d0c50d9c06150a1`. Candidate failures came from new E2E locators searching `input[list]` by the textbox role, leaving Chinese/English weighted-average and SPS path assertions unable to find their fields. Locators now use field labels while preserving the behavior assertions. The second candidate, earlier normal comparison and that site run pin `9dc7de27645fb484fa52711656bf31b05ff3f84a`. Pages attempt 1 reached its ten-minute dependency-install limit before browser cases ran; attempt 2 deployed successfully using the same commit.

Main run `39844928808` pinned `e4ab6795c07bcc47b26facd27b5410e0733d5ff5` and executed all 88 cases. Its sole failure was a boolean-state wait in the existing Contact speed case; the original annotation omitted the assertion location. Review then identified a possible save race: GET can expose the new mappings while the browser is still completing its save, yet the experimental-settings button allowed another save. Configuration buttons now share the busy condition, and the Contact case waits for browser save completion. Initialization checks expose the full observation, and failure summaries retain the actual assertion location and stack. The failed run remains recorded; corrected source `a322cfac23bf10a8c946e5e719ef37691a5c6a60` passed its complete comparison and published [preview-137-1-a322cfac](https://github.com/SeaLoong/Sensa/releases/tag/preview-137-1-a322cfac).

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
