# Visual and interaction quality review

[简体中文](ui-quality.md) | **English**

The workbench uses a light surface, compact blue controls and familiar page structure across desktop Sensa and WebSensa. Current state and primary actions stay visible while detailed settings expand in place. This guide defines layout, readability, interaction and image-review criteria.

## How references are used

| Reference | What to inspect |
| --- | --- |
| [VisAWI authors](https://meinald.de/forschung/visawi/) | Simplicity/order, restrained diversity, color and craftsmanship |
| [Carbon grid](https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/overview)/[type](https://www.carbondesignsystem.com/building-blocks/foundations/typography/style-strategies) | Shared keylines, clear type hierarchy and rhythm suited to dense tasks |
| [Fluent layout](https://fluent2.microsoft.design/layout)/[color](https://fluent2.microsoft.design/color) | Close grouping, space between groups and neutral/accent/status roles |
| [Pinned TDesign](https://github.com/Tencent/tdesign-common/tree/d9734f64af0e863f70e7f2c839a15278ca3d6867/style/web) | Dimensions, states and visual language adopted by Sensa’s native components |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/)/[NNG](https://www.nngroup.com/articles/ten-usability-heuristics/) | Accessible operation, status comprehension and error recovery |

VisAWI is a validated 18-item perceived-aesthetics questionnaire. Four-item VisAWI-S evaluates overall aesthetics, interpreted as one overall result. Collect user-perception data through a separate study following the [accepted manuscript](https://www.uni-muenster.de/OWMS/uploads/drafts_thielsch/pdf/moshagen_thielsch_2013.pdf). The V1–V6 criteria below support engineering observation and image review, with concrete screens and findings recorded.

Sources were checked on **2026-10-19** and are reviewed again when adopting later versions. Simplicity comes from clear organization and deliberate choices; restrained diversity comes from purposeful hierarchy, rhythm and color.

## Current design constraints

The workbench uses light-gray surroundings, single-level white surfaces, flat output/mapping rows and **24 px** major gaps. The header and independently scrolling content share edges. Main/OSC navigation uses line tabs, with segmented selection for input modes. Current mode and input activation remain visible; settings expand as needed, with stop always available.

Body text and ordinary controls use **14/22 px**, captions **12/20 px**. Small/medium/large controls are **24/32/40 px**, defaulting to **32 px**. Component radii are **3 px**, dialogs **9 px**, and the brand color **#0052d9**. Text and essential control boundaries use sufficient contrast, decorative dividers stay light, and danger colors indicate actual states needing attention. The [official theme](https://github.com/Tencent/tdesign-common/tree/d9734f64af0e863f70e7f2c839a15278ca3d6867/style/web/theme) and [office layout](https://github.com/Tencent/tdesign/blob/522dcfd95b1ec5077a4d7c3fc5ff2bd1bd6cc3d0/docs/design/offices_zh-CN.md) inform these choices, adapted to Sensa’s tasks.

Values and units stay grouped, with bounded field expansion based on content length. Number fields start at **80 px**; ports/rates use short columns, while addresses/paths receive more space. Checkbox hitboxes remain **24 px** with smaller glyphs. Coarse-pointer actions and whole labels are at least **44 px**, with native forced-color fallback. Review touch targeting and forced-color appearance in their corresponding environments.

## V1–V6 manual rubric

Record pass/problem/not assessed per criterion, together with commit, language, viewport and image source. Keep individual findings so issues can be located and reviewed again.

| Criterion | Observation focus |
| --- | --- |
| V1 Hierarchy | Current state, main task and secondary settings have a clear order; main actions and stop stand out; empty states stay concise |
| V2 Type/numbers | Clear type roles, restrained weights, stable numeric layout and complete nearby units |
| V3 Grouping/rhythm | Related content stays close, groups are separated, forms remain coherent, and borders/space support reading |
| V4 Color | Coherent neutrals, focused accents, text or icons supporting state color, and sufficient contrast |
| V5 Alignment/details | Shared keylines/baselines, content-appropriate field widths, centered icons and consistent borders/padding |
| V6 Bilingual/narrow | Stable hierarchy, natural wrapping, complete action order and wide tables scrolling within their own regions |

Inspect Control, mappings, outputs, expanded settings, dialogs, long names/paths, errors/stops, empty/loading states and keyboard focus. Spatial graphics also need origins, axes, units, detection radii and drag markers. Place labels beside openings/tips and connect displaced labels to their actual points. Anchor colors stay consistent between graphics and readings. Default/reset/narrow views fit their targets; deliberate zoom may crop. Target dragging moves within the selected plane, while orbit changes the camera. Check invalid states and SVG fallback as well.

Classify issues as blocking (main state/action obscured or misleading), major (substantial reading/hierarchy harm), or detail (local inconsistency). Retain each pending issue’s impact, cause and progress.

## Review process

1. Record commit, image source, language, viewport and state, linking available build runs or artifacts. Compare equivalent data and states.
2. Inspect full composition, then text, numerals, gaps, edges and states. Describe the specific location and observation.
3. Connect findings to concrete design changes and inspect actual new images. Byte-identical images may retain their recorded review; inspect each changed image again.
4. Check behavior and accessibility separately, recording reassessment and remaining scope.

```text
Commit / build run (if any) / image source:
Language / viewport / state:
V1–V6 and result:
Region, observation and severity:
Change and re-review evidence:
Remaining unassessed content:
```

Browsers and screenshots run in Actions. Normal image comparison detects changes; visual review judges how those changes affect the task. Both retain image source and corresponding commit. [Browser verification and baselines](e2e.en.md)

## Accessibility checks

Inspect text contrast, control names, keyboard operation, focus, reflow and state announcements on actual pages. CI [quality.spec.js](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/quality.spec.js) and [ui-quality.js](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/ui-quality.js) retain axe version, URL/locale/viewport and complete violations/incomplete output in `e2e-report`. Automated rules cover selected states; complete evaluation also includes manual operation and assistive-technology checks. [WAI evaluation tools](https://www.w3.org/WAI/test-evaluate/tools/selecting/)

- Use **4.5:1** for ordinary text, **3:1** for large text and **3:1** for essential non-text information. [Text](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)/[controls](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- WCAG AA target-size guidance is **24×24 CSS px**, with applicable exceptions checked against the standard. The project adopts **44 px** as its coarse-pointer design goal. [Targets](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- Check **320 CSS px** reflow, then separately verify actual **400% zoom**, focus visibility, screen readers and announcements. [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)/[focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)/[dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- Backend/mock-wire assertions check input activation, old-frame cancellation and stopping. Verify mechanical stopping on actual devices. Retain incomplete findings for follow-up review.

## User research and field metrics

Current records cover engineering checks and image reviews. [HEART](https://research.google.com/pubs/archive/36299.pdf) satisfaction, adoption, retention and task success await collection through real-user research. [Web Vitals](https://web.dev/articles/vitals) **LCP≤2.5s, INP≤200ms and CLS≤.1** apply to field **75th percentiles**. Record loopback CI in its own environment, and measure device stop latency separately.

Organize machine checks, user questionnaires, visual reviews and actual-device verification separately, so each conclusion has a clear source and scope. [Guide](guide.en.md)
