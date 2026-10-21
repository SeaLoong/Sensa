# Visual and interaction quality review

[简体中文](ui-quality.md) | **English**

Sensa aims for a clear, light, carefully finished control workbench whose actual state, main actions and secondary settings are easy to recognize. Aesthetics, usability, accessibility and control correctness need distinct evidence. This page defines the method; [historical reviews](ui-visual-review.en.md) describe inspected images.

## How references are used

| Reference | Role here | No implied claim |
| --- | --- | --- |
| [VisAWI authors](https://meinald.de/forschung/visawi/) | Simplicity/order, restrained diversity, color and craftsmanship | No participants means no questionnaire score/preference result |
| [Carbon grid](https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/overview)/[type](https://www.carbondesignsystem.com/building-blocks/foundations/typography/style-strategies) | Keylines, hierarchy and productive rhythm | Tokens are not aesthetic certification |
| [Fluent layout](https://fluent2.microsoft.design/layout)/[color](https://fluent2.microsoft.design/color) | Proximity/grouping and neutral/accent/status roles | Do not mechanically copy another product |
| [Pinned TDesign](https://github.com/Tencent/tdesign-common/tree/d9734f64af0e863f70e7f2c839a15278ca3d6867/style/web) | Current component sizes, states and visual language | Native components are not a complete TDesign React implementation |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/)/[NNG](https://www.nngroup.com/articles/ten-usability-heuristics/) | Accessible operation, status and recovery | Automatic rules prove neither full AA nor beauty |

VisAWI is a validated 18-item perceived-aesthetics questionnaire. Four-item VisAWI-S measures overall aesthetics, not four reliable subscales. The [accepted manuscript](https://www.uni-muenster.de/OWMS/uploads/drafts_thielsch/pdf/moshagen_thielsch_2013.pdf) does not validate Sensa's custom rubric. We reproduce no items, invent no participant means, and do not equate simplicity with deletion or diversity with more colors.

Sources were checked on 2026-10-19; adopting later versions needs review. A real user study may follow the authors' method separately, never substituting engineering CI for participants.

## Current design constraints

The workbench uses light gray surroundings, single-level white surfaces, flat output/mapping rows and 24 px major gaps. Header and independently scrolling content share edges. Main/OSC navigation uses line tabs; input uses segmented selection. Actual mode/permission stay visible; browsing/applying differ. Advanced settings collapse without hiding stop.

Body/ordinary controls use 14/22 px; captions 12/20. Small/medium/large controls are 24/32/40 px, default 32. Components use 3 px radii, dialogs 9 px, brand #0052d9. Necessary boundaries/text use sufficient contrast while decorative dividers stay light. Danger color has meaning. [Official theme](https://github.com/Tencent/tdesign-common/tree/d9734f64af0e863f70e7f2c839a15278ca3d6867/style/web/theme) and [office layout](https://github.com/Tencent/tdesign/blob/522dcfd95b1ec5077a4d7c3fc5ff2bd1bd6cc3d0/docs/design/offices_zh-CN.md) inform these local choices.

Values/units stay grouped; finite character-based expansion is bounded. Number fields start at 80 px; ports/rates use short columns, addresses/paths receive space. Checkbox hitboxes remain 24 px with smaller glyphs; coarse-pointer actions/whole labels are at least 44 px, with native forced-color fallback. CSS declarations alone establish no real touch/high-contrast acceptance.

## V1–V6 manual rubric

Record only pass/problem/not assessed per criterion, with commit, language, viewport and image. Do not aggregate a weighted score.

| Criterion | Observable pass | Counterexample |
| --- | --- | --- |
| V1 Hierarchy | Actual state/main task/secondary options have an order; main action and stop stand out | Cards/tags/hints compete, empty state overwhelms task |
| V2 Type/numbers | Clear roles, stable numerals, complete nearby units | All tiny text, excessive weight, values displace neighbors |
| V3 Grouping/rhythm | Related content close, groups separated, consistent forms/purposeful space | Nested frames, wasted space or unrelated crowding |
| V4 Color | Coherent neutrals, restrained accent, meaning beyond color | Decorative danger, low contrast, competing accents |
| V5 Alignment/details | Shared keylines/baselines and grouped controls/numbers | Arbitrary widths, off-center icons, inconsistent edges/padding |
| V6 Bilingual/narrow | Stable hierarchy and natural wraps with complete action order | Split Chinese words, clipped English, page-wide tables |

Inspect Control, mappings, outputs, expanded settings, dialogs, long names/paths, errors/stops, empty/loading and keyboard focus, not only the homepage. Spatial graphics also need origins, axes, units and a distinction between physical radii and hit markers. Labels must not cover openings/tips; displaced labels remain traceable. Anchor colors match readings. Default/reset/narrow framing fits; deliberate zoom may crop. Target drag changes its plane; orbit changes only the camera. Invalidity and SVG fallback require their own evidence.

Severity is blocking (main state/action obscured or misleading), major (substantial reading/hierarchy harm), or detail (local inconsistency). Retain unresolved impact/reasons; other passes do not cancel a problem.

## Review process

1. Fix the commit, image source, language, viewport and state; retain build runs/artifacts when available. Compare equivalent data rather than treating content changes as design improvements.
2. Inspect full composition, then text, numerals, gaps, edges and states. Describe observations rather than “modern”.
3. Map issues to concrete design changes and inspect actual new images. Recorded byte-identical images may inherit review; changed images need inspection.
4. Check behavior/accessibility separately and record the manual reassessment plus unassessed scope.

```text
Commit / build run (if any) / image source:
Language / viewport / state:
V1–V6 and result:
Region, observation and severity:
Change and re-review evidence:
Remaining unassessed content:
```

Browsers and screenshots run in Actions. Visual review still requires inspecting actual images and retaining their source. Passing normal comparison does not mean every design issue was assessed. [Browser verification and baselines](e2e.en.md)

## Accessibility checks

Inspect actual text contrast, control names, keyboard operation, focus, reflow and state announcements. CI [quality.spec.js](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/quality.spec.js) and [ui-quality.js](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/ui-quality.js) retain axe version, URL/locale/viewport and complete violations/incomplete output in `e2e-report`. Selected states cannot establish full AA. [WAI limits](https://www.w3.org/WAI/test-evaluate/tools/selecting/)

- Ordinary text uses 4.5:1, large text 3:1 and necessary non-text information 3:1 as references. [Text](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)/[controls](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- AA 24×24 CSS px targets have exceptions; the project's coarse-pointer 44 px is an additional goal, not a universal AA minimum. [Targets](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- 320 reflow is not real 400% zoom. Focus obstruction, screen readers and announcements need manual evidence. [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)/[focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)/[dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- Permission, cancelled old frames and stopping need backend/mock-wire assertions. Images do not prove physical stops. Zero automatic violations does not clear incomplete.

## Data we do not have

[HEART](https://research.google.com/pubs/archive/36299.pdf) satisfaction/adoption/retention/task-success measures require real users; none are available here. [Web Vitals](https://web.dev/articles/vitals) LCP≤2.5s, INP≤200ms and CLS≤.1 refer to field 75th percentiles, not loopback CI. INP is not device stop latency.

This work adds no telemetry, external analytics or invented performance/aesthetic budgets. Machine tasks, questionnaires, manual image judgments and device acceptance are reported separately. [Guide](guide.en.md)
