# Three integration routes and WebUI visual review

[简体中文](ui-visual-review.md) | **English**

Date: 2026-10-19. This iteration retains the TDesign palette, 14/22 typography and 32 px regular controls, removes synthetic QuickStart from user routes, and organizes real workflows around OGB/SPS, fixed anchors and Shader capture. Coding agents assessed source and CI images against [V1–V6](ui-quality.en.md). There was no participant questionnaire, aggregate beauty score or user-preference study. This replaces the previous 64-image review.

## Evidence

- Before: `992b234abf4c5850df35a74f3aaa31a6ced6e31a`, with 64 baselines.
- Generation source: `c4ab8d26725c2e6c81de5ab65f6a0913af92d02f`; `e2e-baselines` / `e2e-report` from [successful candidate 39180559599](https://github.com/SeaLoong/Sensa/actions/runs/39180559599).
- Accepted: 70 PNGs, 35 each at 1280×900 and 390×844. All 70 initial diagnostic images were individually reviewed. Later sets were compared byte for byte, with changed images and complete root viewports reassessed. The initial failing candidate was not accepted.
- Images are fixed at `02ca80302b14ad96c292c501c55847f7a6085ffa`. Compared with the previous set, 51 images are byte-identical, 13 changed and six were added. Two old QuickStart gate images were renamed for the actual gate flow; existing state coverage was retained.
- The report also retains 25 quality viewports, 21 node records, eight fixed/Shader root status and calibration viewports, four text-containment records and four protocol-simulation statements. Evidence was captured after checks; these are not atomic snapshots.

## Findings and reassessment

| Criterion | Change | Observed result |
| --- | --- | --- |
| V1 Hierarchy | Three actual routes in Help; folded OGB activation settings; short root badges with wrapping reasons | Routes, receiver state and device permission are distinguishable; long diagnostics fit the tested workspace |
| V2 Typography and numbers | Units stay together in XYZ, residual and calibration values; Shader shows “—” without a fit | Local-unit labels stay intact; direct XYZ does not imply a measured zero residual |
| V3 Grouping and spacing | Fixed and Shader roots share selection, projections and endpoint calibration; detailed limits stay in guides | Reviewed expanded layouts are consistent, with secondary guidance below primary actions |
| V4 Colour and meaning | Retained brand blue, functional colours and explicit state text | Valid/waiting, disabled input, experimental permission and emergency stop have text |
| V5 Alignment and detail | Narrow calibration columns wrap text; values and buttons fit independently; actual text bounds are asserted | Complete 0.050/0.150 local-unit values fit without overlapping buttons; changed images passed review |
| V6 Languages and narrow layouts | Routes, OGB heartbeat and root calibration remain bilingual; main content scrolls independently | Reviewed Chinese/English desktop and narrow states are complete; all four main-focus samples show the full outline |

The initial 50 executions yielded 48 passes and two mobile root failures from horizontal overflow. Long explanations inside non-wrapping badges and values escaping a fixed calibration column caused them. Both were corrected before full success. Subsequent review found split units, a misleading zero Shader residual and column drift from hidden timestamps. Each was fixed and reassessed. Times now have a fixed 24-hour shape and monospaced digits. Four varied time strings must keep actual column boundaries within 0.1 px; live text is restored before capture. No functional content was hidden, geometry assertions weakened or retries added to accept the images.

## Before and after

| State | Before | Current |
| --- | --- | --- |
| Desktop control | [Before](https://github.com/SeaLoong/Sensa/blob/992b234abf4c5850df35a74f3aaa31a6ced6e31a/tests/e2e/__screenshots__/desktop/control-page.png) | [Current](https://github.com/SeaLoong/Sensa/blob/02ca80302b14ad96c292c501c55847f7a6085ffa/tests/e2e/__screenshots__/desktop/control-page.png) |
| Narrow English Help | [Before](https://github.com/SeaLoong/Sensa/blob/992b234abf4c5850df35a74f3aaa31a6ced6e31a/tests/e2e/__screenshots__/mobile/english-help.png) | [Current](https://github.com/SeaLoong/Sensa/blob/02ca80302b14ad96c292c501c55847f7a6085ffa/tests/e2e/__screenshots__/mobile/english-help.png) |
| Fixed root coordinates | New capture | [Desktop](https://github.com/SeaLoong/Sensa/blob/02ca80302b14ad96c292c501c55847f7a6085ffa/tests/e2e/__screenshots__/desktop/fixed-root-position.png) |
| Shader root coordinates | New capture | [Narrow](https://github.com/SeaLoong/Sensa/blob/02ca80302b14ad96c292c501c55847f7a6085ffa/tests/e2e/__screenshots__/mobile/shader-root-position.png) |

Bounded root images omit complete producer selection, status or calibration. Eight raw viewports and text-containment evidence cover those samples together. Normal scroll clipping does not prove all page content is simultaneously visible.

## Interaction and functional correctness

All 50 final executions passed, with no skips, flaky retries or run errors. Four axe groups covered 40 states with zero violations in the selected rule subset. Four behaviour groups each completed 16 checks, plus four checks that auditing never enables input. Missing checks, fatal errors and run errors were empty. The 320 CSS px reflow, keyboard, native-dialog and browse-without-permission contracts continue to pass.

New root flows use independent protocol simulations: four known ranges or seven Shader fields pass through calibration, saving and experimental permission to a midpoint mock output; clearing Valid stops it. Attachments explicitly say `fixtureOnly=true` and `realUnityOrGpuCapture=false`. They do not execute a Unity producer or real screen capture. An isolated OGB target verifies true activation, final false on leaving OSC, and no further true over the five-second heartbeat period; device input remains disabled.

Unit contracts separately cover OGB depth, touch Close gates, modern priority/legacy fallback, source isolation and expiry. Unity EditMode checks authoring and native components, and reproduced and fixed overlapping activation/deactivation near the scale limit; it is not a real Contacts/OSC session. Effects and limits are in [usage routes](usage-scenarios.en.md), [OGB compatibility](ogb-compatibility.en.md), [positioning](positioning.en.md) and [Shader research](shader-capture-research.en.md).

## Automated checks and evidence limits

All **56 incomplete node occurrences** remain recorded, including repeated states: 32 label findings (18 toast-close symbols, 14 pin symbols) and 24 contrast findings (14 pins, three dialog titles, three emergency-background calculations, two clipped sources, one timestamp and one toast overlap). Desktop OGB settings audits include same-page pins/toasts; those states cannot be described as having no incomplete findings.

Reviewed narrow titles and emergency controls have separation, and the main-focus outlines have four visible sides. Raw images do show temporary notifications covering some secondary fields/table content near the bottom. Notifications are dismissible; that limitation remains. Offscreen or header-obscured pins/source nodes cannot be judged from that frame; the full parameter view only adds visible-area evidence. Manual readability does not clear pending automated findings.

Root-flow screenshots are Chinese; English root states were not individually captured. Calibrated root states have no dedicated axe scan; flow, screenshots and actual text bounds are their main evidence. Zero violations across 40 states cannot be extrapolated to them or the entire UI. Complete horizontal tables, screen readers/voice, real 400% zoom, physical phones/coarse pointers, system high contrast and other browsers remain unassessed. These simulations do not prove real VRChat uploads, SPS producers, desktop/HMD code blocks, coordinate accuracy or hardware motion. This is not complete WCAG or user-aesthetics certification.

Ordinary main CI must compare the actual commit with updates disabled before an automatic prerelease. A generation candidate cannot replace that comparison. [Verification workflow](e2e.en.md)
