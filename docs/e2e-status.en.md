# Browser verification record

[简体中文](e2e-status.md) | **English**

This page retains inspected runs; read each commit's [Actions](https://github.com/SeaLoong/Sensa/actions) for current progress. See [development and releases](development.en.md) and [E2E maintenance](e2e.en.md) for the workflow.

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
