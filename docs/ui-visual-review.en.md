# WebUI flat-design visual review

[简体中文](ui-visual-review.md) | **English**

Date: 2026-10-19. This review replaces the previous record in response to the user's flat-design and alignment requirements. A code assistant inspected existing CI images and source against [V1–V6](ui-quality.en.md). There is no participant survey, composite beauty score or user-preference finding.

## Evidence

- Before: `98f749d0325f80a4c3061130eac5fcf66b3eb74a`, with 56 baselines.
- Generation source: `2e810bea36847d43a5378a0dc405078cfd2c3701`; `e2e-baselines`/`e2e-report` from [successful candidate 39158984066](https://github.com/SeaLoong/Sensa/actions/runs/39158984066).
- Accepted: 60 PNGs, 30 each at 1280×900 and 390×844. All 58 first-candidate images were compared with predecessors, then all 16 changed/new final images were reassessed. The other 44 are byte-identical.
- Images are fixed at `a69116a8777e569710d5e37a47d8e6ce4900e9a7`. All 26 final unmasked diagnostic viewports and their bounds, styles and scrolling evidence were also inspected. Samples follow axe analysis and are not atomic snapshots.

## Findings, changes and reassessment

| Criterion | Concrete change | Observed result |
| --- | --- | --- |
| V1 Hierarchy | Move main navigation into the header; replace nested output cards with identity/target/action rows and secondary enable buttons; present import first in empty scripts | Control, OSC and empty/loaded scripts have clearer task priority. Input permission and emergency stop remain. Meets observed criteria |
| V2 Type and numbers | Keep one editable value per slider, aligned with its label; place a full-width slider below and ms/× beside the value | Three equal primary axes share input/slider baselines. Editing 500 still sends target 500. Meets observed criteria |
| V3 Grouping | Use a white plane and dividers instead of outer rounded cards/shadows; separate preset management and tighten infrequent script disclosures | Expanded management preserves the first row, details span output rows, and playback settings form a distinct group. Meets observed criteria |
| V4 Color | Blue marks primary actions/selection, neutral colors ordinary configuration, red emergency/danger. Preserve control boundaries and keyboard focus | Normal, disabled, conflict and stopped states remain distinguishable without new decorative strong colors. Meets observed criteria |
| V5 Alignment | Share header/content width and gutters; standardize common control heights, put endpoint labels above equal inputs, and stabilize corresponding output columns | Primary-axis, output, mapping, endpoint and calibration geometry contracts pass. Observed dialog bodies and footers share edges. Meets criteria |
| V6 Bilingual narrow views | Group English header controls, wrap long OSC tabs, shorten help, and capture bounded script/receiver/forwarding regions | Loop, Hub and Save are complete in both languages, without the previous missing tails/header intrusion. English help step two still ends with `script.` on its own line; readable and unclipped, not a claim of perfect wrapping |

These judgments apply to specified images. No blocking or major production-interface visual problem was observed. Unseen states are not approved, and automated checks do not judge beauty.

## Before and after

| State | Before | This iteration |
| --- | --- | --- |
| Desktop Control | [Previous](https://github.com/SeaLoong/Sensa/blob/98f749d0325f80a4c3061130eac5fcf66b3eb74a/tests/e2e/__screenshots__/desktop/control-page.png) | [Flat workbench](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/desktop/control-page.png) |
| Narrow Manual | [Previous](https://github.com/SeaLoong/Sensa/blob/98f749d0325f80a4c3061130eac5fcf66b3eb74a/tests/e2e/__screenshots__/mobile/english-manual.png) | [Single editable value](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/mobile/english-manual.png) |
| Axis profile | [Previous](https://github.com/SeaLoong/Sensa/blob/98f749d0325f80a4c3061130eac5fcf66b3eb74a/tests/e2e/__screenshots__/desktop/profile-settings.png) | [Equal endpoint inputs](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/desktop/profile-settings.png) |
| Script | [Previous](https://github.com/SeaLoong/Sensa/blob/98f749d0325f80a4c3061130eac5fcf66b3eb74a/tests/e2e/__screenshots__/mobile/script-paused-keyframe.png) | [Transport](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/mobile/script-paused-keyframe.png) · [Speed/loop/options](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/mobile/script-options.png) |
| OSC settings | [Previous](https://github.com/SeaLoong/Sensa/blob/98f749d0325f80a4c3061130eac5fcf66b3eb74a/tests/e2e/__screenshots__/mobile/osc-hub.png) | [Receiving](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/mobile/osc-receiver-settings.png) · [Forwarding/Save](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/mobile/osc-hub.png) |

Functional success in the first candidate still left missing script tails and a header intrusion in Hub captures. Raw diagnostic images confirmed controls existed. Bounded regions, compact Hub host/port fields and real scrolling made final evidence complete. No styles or functional content were hidden to repair framing.

## Automated floor and remaining scope

All 40 candidate executions passed with no skips, flaky retries or run errors. Four axe audits covered 32 states with zero violations in the selected subset; four behavior cases completed 16 checks each. Existing bilingual calibration scenarios also check endpoint geometry, while the manual scenario verifies real mock transmission after numeric editing.

Reports retain 69 incomplete node occurrences across repeated states: 40 symbolic names, 16 star contrasts, 3 overlapping notification backgrounds, 8 clipped timestamps and 2 narrow-screen OSCQuery checkboxes partially behind the sticky header. Observed symbolic names are appropriate; stars and white-on-dark notifications are clear. Scrolled timestamp presentation and full hit areas in the two obscured samples remain unassessed. This is not complete WCAG approval.

No complete screen-reader/voice-input study, every focus/hover position, actual 400% zoom, physical phone, other browser engine, or every twelve-axis/device variant was assessed. Images do not verify Unity/VRChat or hardware.

Ordinary main CI must still compare the complete current commit with baseline updates disabled before automatic prerelease publication. [Verification workflow](e2e.en.md)
