# Visual review: workspaces and spotlight setup

[简体中文](ui-visual-review.md) | **English**

This is the current review of the workspace redesign. The superseded parameter-explorer review is available at a [fixed historical commit](https://github.com/SeaLoong/Sensa/blob/8eff42a03462566a61e37c97737fede0e973c59b/docs/ui-visual-review.en.md).

## Source and decisions

[Candidate run 43941133222](https://github.com/SeaLoong/Sensa/actions/runs/43941133222/attempts/1), source [`a0122057`](https://github.com/SeaLoong/Sensa/commit/a012205759b1b60f50fb4f736a26e90aac344e6b), passed 310/310 browser cases. Candidate generation does not establish ordinary screenshot-comparison acceptance; the final PR/main source must pass the independent [CI comparison](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml).

The [image receipt](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json) records all 164 application baselines, 12 spotlight attachments and eight site originals. 76 application baselines changed; each accepted image has an individual observation or an exact-byte match to an already inspected original, with the original run recorded. Unchanged images retain fixed historical evidence. Tiny geometry raster differences retain their existing baselines. The 38 public catalog mirrors are bound to per-case capture hashes in the [catalog receipt](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/catalog-capture-review.json).

## Observations

| Criterion | Observed result |
| --- | --- |
| V1 Hierarchy | Input, Mapping & transforms, Axis profiles and Outputs have distinct destinations. Mapping/calculation tabs share one Save/Restore row; duplicate headings were removed. |
| V2 Type and numbers | Values and units remain grouped; bilingual labels wrap at narrow widths. Panel crops establish only the visible fields. |
| V3 Grouping | OSC reception stays with Input; mappings and calculations stay together; output connections and recording have their own page. Preset groups expand on demand. |
| V4 Color and state | Neutral surfaces retain blue primary actions and textual status. Spotlight masks darken the surrounding page and outline the interactive target; emergency stop stays in the guide. |
| V5 Alignment | Desktop forms align on shared edges; narrow layouts stack fields and wrap action groups. Recording export remains visible when controls wrap. |
| V6 Bilingual and narrow | Chinese and English input/mapping/axis tour originals were inspected at desktop and 390px widths. The compact guide puts current instructions first; step navigation is collapsed by default. |

Image review found duplicated mapping headings and an English mobile axis-guide card whose six-step navigation hid the instructions. The headings were consolidated; guide navigation moved below the body into **Jump to step**. A further mobile review found the expanded transform grid squeezing the guide body; the guide now highlights one actionable preset and reserves readable space. E2E checks visible body space, an unobscured Next action and hit-testing of the highlighted control.

| Representative | Desktop | Narrow |
| --- | --- | --- |
| Input spotlight | [Chinese](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/desktop/input-zh-CN.png) | [English](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/mobile/input-en-US.png) |
| Mapping spotlight | [English](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/desktop/mapping-en-US.png) | [Chinese](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/mobile/mapping-zh-CN.png) |
| Axis spotlight | [Chinese](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/desktop/axes-zh-CN.png) | [English](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/mobile/axes-en-US.png) |

## Scope and remaining limits

The eight site originals verify bilingual home/guide composition and have checked source records, build manifests and image hashes. All eight were opened from [ordinary run 43942444086](https://github.com/SeaLoong/Sensa/actions/runs/43942444086), source `6fac7c4c`, after the catalog refresh. The current embedded gallery and five-step first-run article fit both layouts. The same run passed all 310 ordinary comparison cases; later documentation changes retain the CI gate. [Screenshot gallery](screenshots.en.md)

The full browser suite covers workspace routing, draft preservation, presets, Escape/resume, editor suspension and recording after page changes. Automated accessibility evidence retains incomplete findings; this review does not claim complete WCAG conformance, screen-reader coverage, physical-phone testing or actual 400% zoom. The desktop English input guide keeps its secondary Open input settings action partly below the scrollable content fold; primary navigation and stop remain visible. Offscreen fields and closed disclosures are not established by viewport images. There is no aesthetic questionnaire or user-preference study.

Mock transports, browser WebGL and isolated smoke do not establish real hardware, Unity/VRChat or HMD behavior. Historical spatial-graphics acceptance remains scoped to its original source. [Verification record](e2e-status.en.md) · [Review criteria](ui-quality.en.md)
