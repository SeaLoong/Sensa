# WebUI visual aesthetics and quality review

[简体中文](ui-quality.md) | **English**

This guide centers on **visual aesthetics and communication**: coherent composition, color harmony, density, spacing and considered details that help people recognize what matters. Accessibility and control correctness are essential baselines, not substitutes for judging beauty.

Primary sources were checked on 2026-10-19. VisAWI supplies aesthetic constructs; official Carbon/Fluent principles help translate them into six human-review criteria. The project produces no composite aesthetic score and has no participant questionnaire results.

## Roles of the references

| Reference | Use in this project | Unsupported conclusion |
| --- | --- | --- |
| [VisAWI author's site](https://meinald.de/forschung/visawi/) and original research | Organize observations about simplicity, variety, color and craftsmanship | An official questionnaire score without participants |
| [Carbon layout](https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/overview), [typography](https://www.carbondesignsystem.com/building-blocks/foundations/typography/style-strategies), [Fluent layout](https://fluent2.microsoft.design/layout) and [color](https://fluent2.microsoft.design/color) | Operational guidance for hierarchy, grouping, rhythm, alignment and color roles | Universal aesthetic certification from choosing tokens |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Accessible-operation baseline and related automatic rule subset | Full AA conformance or beauty from an automated pass |
| [NNG heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) | Supporting checks of state comprehension and error recovery | Replacing aesthetic judgment with functional correctness |
| [HEART](https://research.google.com/pubs/archive/36299.pdf), [Web Vitals](https://web.dev/articles/vitals) | Future user-research and performance references | Satisfaction or field percentiles inferred from CI without user data |

## What VisAWI helps us observe

Moshagen and Thielsch developed VisAWI as a validated questionnaire of **perceived visual aesthetics**. The full instrument has 18 items. Four-item VisAWI-S measures overall visual aesthetics; it is not four independently reliable subscales. [Author's site](https://meinald.de/forschung/visawi/), [2013 accepted manuscript](https://www.uni-muenster.de/OWMS/uploads/drafts_thielsch/pdf/moshagen_thielsch_2013.pdf)

| Construct | Sensa observation lens |
| --- | --- |
| Simplicity | Balance, clear composition and order, beyond counting removed elements |
| Diversity | Deliberate variation distinguishing states, actions and data, without decorative accumulation |
| Colourfulness | Harmony between color choices, placement and combinations |
| Craftsmanship | A coherent impression created by carefully resolved layout, typography and component details |

These are project interpretations, not questionnaire items, translations or scoring instructions. Validation of the original instrument does not validate this local-console rubric. Without participants, do not report VisAWI means, apply research cutoffs or claim users prefer the revision. A future formal study must use the authors' instrument/method and attribution. This repository reproduces no questionnaire items and does not label its custom checklist a psychometrically validated instrument.

## From principles to design decisions

- **Order and rhythm:** Carbon uses a shared grid, alignment lines and sizing relationships. Fluent explains grouping through proximity and whitespace. Sensa uses tighter within-group spacing and wider between-group separation, with sections rather than repeated card outlines communicating hierarchy. [Carbon Grid](https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/overview), [Fluent Layout](https://fluent2.microsoft.design/layout)
- **Console typography:** Carbon distinguishes task-dense products from editorial experiences. Sensa assigns roles to headings, actions, live numbers, units and explanations, combining size, weight and position instead of making every label equally small. [Carbon Typography](https://www.carbondesignsystem.com/building-blocks/foundations/typography/style-strategies)
- **Limited colors with roles:** Fluent separates neutrals, brand emphasis and semantic feedback. Sensa uses neutral surfaces, restrained emphasis for selection/actions, and danger colors for significant controls/errors rather than decoration. [Fluent Color](https://fluent2.microsoft.design/color)
- **Numbers and details matter:** Changing digit lengths should not displace units or nearby controls; related inputs, buttons, icons and edges need visible consistency. This is a project rule, not a universal pixel recipe from the references.

Do not mechanically copy Carbon's 8 px or Fluent's 4 px system, or judge beauty from framework colors alone. Start with the console's information priorities and implement coherent sizing relationships.

## Flat workbench constraints

Use a white plane and dividers to organize content. Main navigation sits in the header; the header and content share page edges. Output identity, target and actions occupy corresponding columns, details span the row, and narrow screens stack them in the same information order.

Common controls share a height. A slider has one editable number with an adjacent unit; equal-width endpoint inputs have labels above them. The script view presents import first and reveals full controls after loading. Infrequent disclosures stay compact and do not displace neighboring first-row controls. Boundaries identify controls and separate groups; outer sections use no rounded cards or decorative shadows.

The project separates **visual size from hit area**. Fine-pointer defaults use 32 px common inputs/buttons, 28 px standalone slider regions and 36 px navigation, with 14 px body, 13 px control text and 12 px labels. Label rows are 20 px, field gaps 6 px and group gaps 12 px. Numeric inputs start at 68 px and grow with finite value length. Ports/rates use short columns while addresses and paths receive remaining space.

Checkboxes paint an 18 px square inside a 24 px native input hit area. Switches paint a 32×20 px track inside a 36×24 px input. Coarse-pointer actions, fields and complete toggle labels retain at least 44 px; forced-color mode falls back to native painting. These are project size roles, not a universal beauty score or complete accessibility proof.

These constraints reflect the current product direction. Reassess V1–V6 against actual images. Automated geometry can find alignment, overlap and containment issues; it cannot judge overall beauty.

## Six human visual criteria

Record each item as **meets / issue / not assessed**, with the commit, locale, viewport and screenshot region. This is a custom Sensa rubric without an aggregate score.

| Item | Observable “meets” anchors | Typical “issue” anchors | Required evidence |
| --- | --- | --- | --- |
| V1 Hierarchy/attention | Actual state, main task and secondary configuration have a clear visual order; primary action stands out and stop is recognizable | Equally loud headings, badges, cards and buttons; empty-state copy dominates; stop disappears | Full Control viewport, normal/emergency states, OSC mappings |
| V2 Typography/numbers | Consistent heading/body/support roles; stable live numbers with nearby units; recognizable long paths | Uniform tiny text, jumping units, inconsistent baselines, too many weights or explanations louder than values | Manual/output targets, script time, long OSC paths |
| V3 Grouping/spacing/rhythm | Related content is close, groups are separated, form rhythm is consistent, whitespace creates focus | Related items split apart, unrelated items crowded, nested borders or wasted empty regions | Expanded mapping/settings, output list, dialogs |
| V4 Color/meaning | Harmonious neutral layers, restrained emphasis, consistent state colors and noncolor cues | Strong color everywhere, decorative danger colors, washed-out content or competing accents | Rest/selected/disabled/error/emergency states |
| V5 Alignment/finish | Shared edges/baselines; fields, icons, numbers and actions align; coherent borders/radii/padding | Misaligned controls, arbitrary widths, off-center icons, inconsistent borders or local fixes breaking other views | Cross-page components, field/slider rows, dialog footers |
| V6 Bilingual/narrow completeness | Both languages retain hierarchy/rhythm; natural wrapping, stable action order and coherent narrow composition | Clipped English, awkward Chinese wraps, squeezed buttons, page-wide table overflow or shrinking without reflow | Chinese/English × desktop/narrow, long names and expanded states |

“Meets” applies only to inspected states, not every page or user. Sample empty/loading/error/hover/focus states too; a single home-page screenshot is insufficient.

Severity is unweighted: **blocking** obscures or misrepresents a primary state/action; **major** materially damages hierarchy, grouping or reading; **detail** is a local inconsistency. Retain impacts and reasons for unresolved findings; success elsewhere does not cancel them.

## How to reassess

1. Fix commit/task state and compare CI images with matching locale, viewport and data. Record run/artifact/image identities so content differences are not mistaken for design improvements.
2. Review the composition against V1–V6, then inspect text, numbers, edges and states. Describe locations and evidence rather than merely “more modern.”
3. Tie each finding to a layout/type/spacing/color-role change and inspect the next candidate. Previously unassessed items do not inherit a pass.
4. Separately check accessible-operation and critical-task evidence before accepting intentional screenshot baselines. Baseline maintenance is not an aesthetic vote.

Review template:

```text
Commit / CI run / artifact:
Locale / viewport / state / image:
Criterion V1–V6:
Outcome: meets / issue / not assessed
Screenshot region and observation:
Severity: blocking / major / detail (if an issue)
Corresponding change:
Reassessment evidence, outcome and remaining limits:
```

The [visual review record](ui-visual-review.en.md) holds this iteration's concrete findings, before/after images and reassessment. This guide does not prefill conclusions about unseen images. Browser execution and automatic screenshots run only in GitHub Actions. [Screenshot/baseline rules](e2e.en.md)

## Accessibility and control: supporting baselines

Keep automatic evidence separate from aesthetic conclusions:

- [quality.spec.js](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/quality.spec.js) uses [ui-quality.js](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/ui-quality.js) for WCAG-related tag subsets and keyboard/dialog/reflow/selected-target checks. Those axe 4.14.0 tags do not cover all AA criteria; selecting WCAG 2.2 does not establish comprehensive focus-obscuring detection. Zero violations is a project gate; incomplete results still require review. [WAI tool limits](https://www.w3.org/WAI/test-evaluate/tools/selecting/)
- Contrast references are 4.5:1 for ordinary text, 3:1 for large text, and 3:1 for essential nontext control information. AA's 24×24 CSS px target minimum has exceptions; 44 px is not its universal minimum. [Text](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [nontext](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [targets](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- A 320 CSS px viewport tests reflow, not actual 400% browser zoom. Assistive technology, real zoom, focus occlusion and announcements still need human evidence. [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), [dialog APG](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- Runtime/mock-wire contracts check that browsing/editing sends no unintended movement, mode/script changes require permission, and pause/emergency stops invalidate old frames. Screenshots do not prove mechanical stopping.

Automatic reports explicitly cover the accessibility/behavior floor, without evaluating visual beauty. They use `artifacts/e2e/ui-quality/<project>-<locale>-<kind>-retry<n>.json` and `.md`, attached to Playwright results. They retain versions, tags, URL/locale/viewport, full violation/incomplete nodes and behavior checks. Unexecuted and undetected are different; scans cannot populate V1–V6 automatically.

## Unmeasured user/performance metrics

[HEART](https://research.google.com/pubs/archive/36299.pdf) maps goals to signals and metrics. Without participants, satisfaction, adoption, retention and human task-success rates remain unmeasured. Passing robotic tasks proves only those engineering scenarios.

[Core Web Vitals](https://web.dev/articles/vitals) references are LCP≤2.5 s, INP≤200 ms and CLS≤0.1 at the 75th percentile of field visits. No telemetry, external analytics or performance budget is added in this iteration. Loopback CI cannot supply field percentiles, and INP is not hardware stop latency. These metrics do not score the aesthetic rubric.

[User guide](guide.en.md) · [Feature reference](features.en.md) · [Architecture](architecture.en.md)
