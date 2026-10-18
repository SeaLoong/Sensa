# TDesign WebUI visual and interaction review

[简体中文](ui-visual-review.md) | **English**

Date: 2026-10-19. This record replaces the flat-workbench review following the user's TDesign direction. A code assistant inspected source and actual CI images against [V1–V6](ui-quality.en.md). There is no participant questionnaire, composite aesthetics score or user-preference finding.

## Evidence

- Before: `fb6e169539b054ddba2de8bb22741945f3561526`, with 60 baselines.
- Generation source: `3a21e8f7b65e057ac9a4adb89dc6c6da16e799b0`; `e2e-baselines`/`e2e-report` from [successful candidate 39165087201](https://github.com/SeaLoong/Sensa/actions/runs/39165087201).
- Accepted: 60 PNGs, 30 each at 1280×900 and 390×844. All 60 diagnostic images were individually reviewed; this successful candidate is byte-identical, with final key views reassessed. The earlier failed run was not accepted.
- Images are fixed at `611822ef91a619e1b1185b9856155ea9d7681964`. All 22 unmasked raw diagnostic viewports and 18 node records were also inspected, including four main-focus views. These samples were captured after analysis and are not atomic snapshots.

## Findings and reassessment

| Criterion | Change | Observed result |
| --- | --- | --- |
| V1 Hierarchy | Group segmented input modes with Apply; standardize filled/outline/text buttons; make Change script secondary and loaded playback primary | Control, script and configuration priorities are distinct, with emergency stop independently reachable. Meets observed criteria |
| V2 Type and proportions | Reduce common controls from 38 to 32 px; use 14/22 text, 12/20 supporting text and 400/600 weights; start numeric fields at 80 px and grow with content | Primary-axis numbers and sliders align; units, script time and output targets remain complete. Meets observed criteria |
| V3 Grouping and spacing | Light-gray page, single white work surfaces and 24 px main spacing; flat output/mapping/Hub rows and disclosures for infrequent settings | Input selection, primary actions and advanced settings form clear groups without nested cards/heavy shadows. Meets observed criteria |
| V4 Color and states | TDesign blue, neutral gray and functional scales; darker steps where necessary for boundaries, text and filled buttons; textual status remains | Normal, selected, disabled, conflict and emergency states are distinguishable. Official tokens alone do not establish beauty or legibility |
| V5 Alignment and details | Share header/content width and scrollbar gutters; unify native forms, sliders, toggles, tags, tables and dialogs; use an SVG close icon | Primary-axis, output-row, mapping, endpoint, calibration and dialog-edge checks pass. Meets observed criteria |
| V6 Bilingual narrow layouts | Natural English wrapping, short port columns and longer address fields; independent content scrolling, touch hit areas and forced-color fallback | Observed control, script, receiver/forwarder, help and dialog views are complete. Real touch and system high contrast remain unassessed |

These judgments apply to specified images; no new blocking or major visual issue was observed. Initial viewport pictures do not prove complete long dialogs, horizontally scrolling tables or closed disclosures.

## Before and after

| State | Before | TDesign |
| --- | --- | --- |
| Desktop control | [Before](https://github.com/SeaLoong/Sensa/blob/fb6e169539b054ddba2de8bb22741945f3561526/tests/e2e/__screenshots__/desktop/control-page.png) | [Current](https://github.com/SeaLoong/Sensa/blob/611822ef91a619e1b1185b9856155ea9d7681964/tests/e2e/__screenshots__/desktop/control-page.png) |
| Narrow manual | [Before](https://github.com/SeaLoong/Sensa/blob/fb6e169539b054ddba2de8bb22741945f3561526/tests/e2e/__screenshots__/mobile/english-manual.png) | [Current](https://github.com/SeaLoong/Sensa/blob/611822ef91a619e1b1185b9856155ea9d7681964/tests/e2e/__screenshots__/mobile/english-manual.png) |
| English header | [Before](https://github.com/SeaLoong/Sensa/blob/fb6e169539b054ddba2de8bb22741945f3561526/tests/e2e/__screenshots__/mobile/english-toolbar.png) | [Current](https://github.com/SeaLoong/Sensa/blob/611822ef91a619e1b1185b9856155ea9d7681964/tests/e2e/__screenshots__/mobile/english-toolbar.png) |
| Output dialog | [Before](https://github.com/SeaLoong/Sensa/blob/fb6e169539b054ddba2de8bb22741945f3561526/tests/e2e/__screenshots__/mobile/udp-settings.png) | [Current](https://github.com/SeaLoong/Sensa/blob/611822ef91a619e1b1185b9856155ea9d7681964/tests/e2e/__screenshots__/mobile/udp-settings.png) |
| Script options | [Before](https://github.com/SeaLoong/Sensa/blob/fb6e169539b054ddba2de8bb22741945f3561526/tests/e2e/__screenshots__/mobile/english-script-options.png) | [Current](https://github.com/SeaLoong/Sensa/blob/611822ef91a619e1b1185b9856155ea9d7681964/tests/e2e/__screenshots__/mobile/english-script-options.png) |

## Interaction correctness

Content scrolls independently below the header. Positioned helper descriptions belong to the workspace containing block rather than expanding document scrolling bounds. Rapid End-key scrolling followed by navigation previously let the old animation move the new page. A workspace key now replaces the scrolling container, stopping the old animation while preserving parent drafts/runtime state. Four navigation checks keep the new page at zero scroll; browsing does not change input mode or permission.

All 40 executions passed with zero skips, flaky retries or run errors. Four axe audits cover 32 states with zero detected violations in the selected rule subset. Four behavior groups complete 16 checks each, plus four checks that auditing never activates input. All 20 reflow checks at 320 CSS px pass: document height is 800, content starts below the header and has no horizontal overflow. Associated-label clicks, Space, native checkbox semantics and browser forced-color checks pass.

## Automated findings and unassessed scope

Reports retain **51 incomplete node occurrences** across states: 28 notification/pin symbol names, 12 star contrast checks, four dialog-title/emergency background computations, four source and two timestamp clipping checks, and one notification overlap. Observed symbol names are meaningful; dialogs, emergency actions and notices are clear; all four main-focus outlines have complete edges. Clipped content after horizontal table scrolling remains unassessed. This is not a complete WCAG pass.

Real screen readers/voice input, all hover/focus positions, actual 400% zoom, physical phones/coarse pointers, system high contrast, other browsers and all twelve-axis/device variants have not been reviewed comprehensively. Screenshots do not prove Unity/VRChat or physical hardware behavior.

Ordinary main CI must still compare the exact commit with baseline updates disabled before automatic prerelease publication. [Verification workflow](e2e.en.md)
