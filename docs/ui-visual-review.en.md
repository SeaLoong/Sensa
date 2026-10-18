# WebUI visual review record

[简体中文](ui-visual-review.md) | **English**

Date: 2026-10-19. A code assistant inspected existing CI images and checked source against [visual criteria V1–V6](ui-quality.en.md). This is a review of specified views, not participant research or a finding about user preference. There is no VisAWI score.

## Evidence and scope

- Before: 52 committed baselines at `11894004aceb16ae2e48bdca25203a5d84f25d41`.
- After: `27567f9f159a8e0fd78d161e73a1141dbb963e43`; `e2e-baselines` and `e2e-report` from [candidate CI 39149689652](https://github.com/SeaLoong/Sensa/actions/runs/39149689652).
- Accepted: 56 PNGs, 28 each at 1280×900 and 390×844. They cover Chinese/English, Control/OSC/Settings, targets/stops, scripts, calibration, help and configuration dialogs.
- The original candidate's 52 images were compared with their predecessors, then all 19 changed/new final images were reassessed. The other 37 are byte-identical. Script controls and options are captured separately to avoid unpainted tails in long regions.
- Automated reports also retain 320 CSS px reflow evidence and unmasked viewport images, bounds, styles and scroll information for incomplete nodes. These samples follow axe analysis and are not atomic snapshots.

## Findings, changes and reassessment

| Criterion | Finding and change | Observed evidence and result |
| --- | --- | --- |
| V1 Hierarchy and attention | Manual sending followed infrequent settings. Send now follows the three primary axes, with ramp/speed disclosed separately. Parameter values now follow paths, before sources | `control-page`, `manual-ready`, `english-manual`, `osc-parameters`: clear task order; paths and values appear first on narrow screens. Meets the observed criteria |
| V2 Typography and numbers | Titles, supporting text and primary values competed at similar weights. Strengthen headings, L0 and output targets; stabilize numerals and units, show duration in ms and rounded negative zero as 0.0 | Manual/output, paused scripts, endpoint calibration and Pose distinguish values and units without observed clipping. Meets the observed criteria |
| V3 Grouping and spacing | Two infrequent disclosures were spread apart. Group them closely and retain consistent relationships between fields, sections and footers | Control, expanded mappings, Hub, Settings and dialogs show tighter groups with separation between them. Meets the observed criteria |
| V4 Color and meaning | Pale text, focus and necessary control boundaries were weak. Increase their contrast while keeping decorative borders light. Neutralize disabled actions; use blue for actions/selection and red for stopping/danger | Normal/disabled/conflict/stopped views and the English script empty state use consistent roles. The empty timeline message no longer inherits group opacity. Meets the observed criteria |
| V5 Alignment and craft | English calibration button lengths displaced endpoint values. Use stable label/value/action columns, allowing buttons another row on small screens | `pb-calibration`, `english-calibration`: endpoint values align and long English buttons wrap naturally. Fields, sliders and dialog footers remain coherent. Meets the observed criteria |
| V6 Bilingual narrow layouts | Long script captures omitted options that still existed in the UI. This was missing evidence; split controls and options | `english-script`/`english-script-options` and `script-paused-keyframe`/`script-options` are complete without gray tails. Visible bilingual dialogs show no horizontal overflow. Disclosure interiors and unseen right-hand table columns are not fully assessed |

These conclusions apply to the listed states. No blocking or major visual finding remains in the reviewed views; that is not approval of every state, browser or user's preferences.

## Before and after

| State | Before | After |
| --- | --- | --- |
| Narrow English manual | [Previous](https://github.com/SeaLoong/Sensa/blob/11894004aceb16ae2e48bdca25203a5d84f25d41/tests/e2e/__screenshots__/mobile/english-manual.png) | [Current](../tests/e2e/__screenshots__/mobile/english-manual.png) |
| Narrow parameter table | [Previous](https://github.com/SeaLoong/Sensa/blob/11894004aceb16ae2e48bdca25203a5d84f25d41/tests/e2e/__screenshots__/mobile/osc-parameters.png) | [Current](../tests/e2e/__screenshots__/mobile/osc-parameters.png) |
| English calibration | [Previous](https://github.com/SeaLoong/Sensa/blob/11894004aceb16ae2e48bdca25203a5d84f25d41/tests/e2e/__screenshots__/mobile/english-calibration.png) | [Current](../tests/e2e/__screenshots__/mobile/english-calibration.png) |
| English script | [Previous](https://github.com/SeaLoong/Sensa/blob/11894004aceb16ae2e48bdca25203a5d84f25d41/tests/e2e/__screenshots__/mobile/english-script.png) | [Controls](../tests/e2e/__screenshots__/mobile/english-script.png) · [Options](../tests/e2e/__screenshots__/mobile/english-script-options.png) |

Current images evolve with baseline maintenance. The commit and artifacts above fix this review's source.

## Automated floor and manual judgment

All 40 candidate executions passed, with no skips, flaky retries or run errors. Four audits covered 32 states with zero violations in the selected rule subset. Four behavior cases completed 13 checks each, plus four checks that auditing never enables input. Full incomplete results remain in reports; this is not an all-accessibility pass.

The first run exposed reverse Tab containment in dialogs; the fix's boundary focus JSON shows focus remains inside. Emergency stop/clear preserve drafts, clearing never resumes input, and Escape cancels and restores trigger focus. Another run exposed missing explicit OSC setup in the test; receiver preparation was fixed without relaxing assertions. Partial captures from failed jobs were not accepted as baselines.

Review ×/☆ by their functions and appearance rather than adding literal symbols to accessible names to satisfy string matching. This follows [W3C's symbolic-label explanation](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html#symbolic-text-characters). A `nonBmp` result or an obscured background is not a measured zero contrast ratio. Observed notification text is readable on its dark background. Right-hand timestamps and some English source IP cells are clipped at the current horizontal position; their scrolled presentation remains unassessed. Final attachments contain 73 incomplete node occurrences across repeated states: 40 symbolic names, 16 star-contrast reviews, 5 overlapping notification backgrounds, 8 clipped timestamps and 4 clipped English sources. These are neither a beauty score nor an all-pass claim.

Ordinary main CI must still compare every current-commit image with updates disabled. A generation run cannot provide the comparison SHA required by previews. [Baseline provenance and limits](../tests/e2e/__screenshots__/README.md)

## Remaining limits

No participant VisAWI survey, complete screen-reader/voice-input evaluation, every hover/focus position, actual 400% zoom, physical phone or other browser-engine assessment was performed. Dialog evidence emphasizes UDP and the visible first axis, not every device detail or all twelve axes. These images do not verify Unity/VRChat or hardware behavior.

Future changes should retain the screenshot region, finding, rationale and reassessment under V1–V6. Unassessed states never inherit approval.
