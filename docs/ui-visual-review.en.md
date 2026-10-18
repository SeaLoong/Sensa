# TDesign WebUI workflow and visual review

[简体中文](ui-visual-review.md) | **English**

Date: 2026-10-19. This iteration keeps the TDesign palette, 14/22 typography and 32 px regular controls, improving entry points and action hierarchy. It replaces the previous component restyling assessment. Coding agents reviewed source and real CI images against [V1–V6](ui-quality.en.md); there was no participant questionnaire, aggregate beauty score or user-preference study.

## Evidence

- Before: `04f6f488d77e3f562ba313352395c6913dc4e662`, with 60 baselines.
- Generation source: `b1e1cf9e649a96b43f65be55ae7db4043cb7719d`; `e2e-baselines` and `e2e-report` from [successful candidate 39171343844](https://github.com/SeaLoong/Sensa/actions/runs/39171343844).
- Accepted: 64 PNGs, 32 each at 1280×900 and 390×844. All 60 images from diagnostic run 39170374413 were individually reviewed; 59 are byte-identical to the final set. The changed desktop mapping image and four new recording images were reviewed separately. Compared with the previous set, 34 changed and four were added; none were removed.
- Images are fixed at `0b9956f424c9af088ce2ad07d10f7f7953249a32`. The failed run was not accepted; a later candidate containing the known test-locator error was cancelled.
- The final report also retains 23 unmasked diagnostic viewports and 19 node records. This iteration reassessed all four main-focus views and the new Intiface review viewport. These samples were collected after analysis and are not atomic snapshots.

## Findings and reassessment

| Criterion | Change | Observed result |
| --- | --- | --- |
| V1 Hierarchy | One control status explains the current blocker and next step; Apply is absent for the current mode; script play/stop and stepping are grouped | Running mode, browsed tab and input permission are distinct in the observed states |
| V2 Type and proportion | Retain TDesign type, control dimensions and numeric-field/slider proportions | Numbers, units, states and main actions remain complete in both languages |
| V3 Grouping and spacing | Recording becomes an input disclosure; help offers manual, script and OSC entry points; longer explanations are optional | Main flows are shorter; recording and restart confirmation have clear boundaries, reviewed on desktop and narrow layouts |
| V4 Color and state | Retain brand blue and functional colors with explicit preparation, disarmed, gate and emergency text | State does not depend on color alone; incomplete contrast findings retain manual decisions and limits |
| V5 Alignment and detail | Put mapping count, draft state, restore and save together near the top; group script actions; let status headings wrap | Key actions are discoverable near the top; columns and dialog edges remain stable, with no new major alignment issue observed |
| V6 Languages and narrow layout | Translate new workflow, help, connection, vibration and recording text; retain wrapping and touch styles | Observed bilingual layouts are complete; the tight English manual crop requires separate viewport focus evidence |

These conclusions apply only to the named views. No new blocking or major visual issue was found. Initial viewport images do not prove every long dialog, horizontal table, output variant or closed disclosure.

## Before and after

| State | Before | Current |
| --- | --- | --- |
| Desktop control | [Before](https://github.com/SeaLoong/Sensa/blob/04f6f488d77e3f562ba313352395c6913dc4e662/tests/e2e/__screenshots__/desktop/control-page.png) | [Current](https://github.com/SeaLoong/Sensa/blob/0b9956f424c9af088ce2ad07d10f7f7953249a32/tests/e2e/__screenshots__/desktop/control-page.png) |
| Narrow help | [Before](https://github.com/SeaLoong/Sensa/blob/04f6f488d77e3f562ba313352395c6913dc4e662/tests/e2e/__screenshots__/mobile/english-help.png) | [Current](https://github.com/SeaLoong/Sensa/blob/0b9956f424c9af088ce2ad07d10f7f7953249a32/tests/e2e/__screenshots__/mobile/english-help.png) |
| Desktop mappings | [Before](https://github.com/SeaLoong/Sensa/blob/04f6f488d77e3f562ba313352395c6913dc4e662/tests/e2e/__screenshots__/desktop/osc-mappings-page.png) | [Current](https://github.com/SeaLoong/Sensa/blob/0b9956f424c9af088ce2ad07d10f7f7953249a32/tests/e2e/__screenshots__/desktop/osc-mappings-page.png) |
| Narrow recording restart | New capture | [Current](https://github.com/SeaLoong/Sensa/blob/0b9956f424c9af088ce2ad07d10f7f7953249a32/tests/e2e/__screenshots__/mobile/recording-restart.png) |

## Interaction and functional correctness

All 44 executions passed with zero skips, flaky retries or run errors. Four axe groups cover 36 states, including the new Intiface settings state, with zero detected violations in the selected rule subset. Four behavior groups complete 16 checks each, plus four checks that auditing never enables input. Missing checks and run errors are empty. All 20 checks at 320 CSS px pass; keyboard, native-dialog and browse-without-activation boundaries remain.

New regressions verify that unrelated saves preserve mapping/receiver drafts; cancelling restart retains recorded frames while confirmation clears them; stopping/exporting follows recording state; disabling manual input sends stops and never replays the old target on UDP refresh; OGB Touch uses V0 on a vibration-only mock, and explicitly choosing L0 reconnects the client with the new source. No-output configurations remain usable for preview; an Intiface service connection is not presented as available hardware.

The first run found a native datalist field incorrectly selected as a textbox, and a connected Intiface client retaining its old vibration route after saving. Both were fixed without weakening assertions or adding E2E retries. Isolated unit contracts separately cover target lifetimes, last-action-wins duplicate script timestamps and recording the final held duration. See [usage options](usage-scenarios.en.md) for effects and limits.

## Automated findings and unassessed scope

The report retains **53 incomplete node occurrences**, including repeats: 28 notification/pin names and 25 contrast findings. The latter comprise 12 pin stars, three dialog titles, three emergency backgrounds, four clipped sources, two clipped timestamps and one overlapping notice. Only two occurrences are new relative to the previous 51: the narrow English Intiface title and emergency background. In the inspected image the text is unobscured; post-analysis node bounds leave a gap between title and emergency action, with readable colors. All four main-focus viewport images show complete rings; tight element crops are not full focus-paint evidence.

Unassessed scope includes all right-scrolled table content, screen readers/voice control, actual 400% zoom, physical phones/coarse pointers, system high contrast and other browsers. Recording restart has functional and visual coverage but no separate named axe state; shared Modal keyboard checks do not certify every assistive-technology behavior of that dialog. Unity/VRChat, a real SPS producer and hardware behavior are not proven by this iteration's mocks or screenshots. This is not a complete WCAG conformance claim.

Ordinary main CI must compare the actual commit with updates disabled before automatic prerelease; a generation candidate cannot replace that comparison. [Verification workflow](e2e.en.md)
