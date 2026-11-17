# Visual review: contextual setup and logs

[简体中文](ui-visual-review.md) | **English**

[Candidate 44107180755](https://github.com/SeaLoong/Sensa/actions/runs/44107180755), source `bf35742613299174758666392fcbb2e09888abf5`, passed 314/314 browser cases. [Previous review](https://github.com/SeaLoong/Sensa/blob/579074a2fed50bef2901f81abdaa522c49d2d50d/docs/ui-visual-review.en.md) remains fixed history.

The [receipt](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json) covers 164 baselines, 16 tour attachments and eight site originals. This session opened every accepted changed original: 21 application baselines plus all 24 tour/site captures. The other 143 baselines retain exact-byte prior approvals, including six tiny unrelated raster differences that were not accepted. The [catalog receipt](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/catalog-capture-review.json) binds all 38 gallery files to current passing cases.

| Area | Observed result |
| --- | --- |
| Presets | The redundant Scene presets action is gone from input/help/mapping pages. OSC templates remain beside draft actions; calculation templates and device-motion templates live in their respective sections. |
| Guide | Seven steps give numbered, context-specific instructions. Navigation and the real input/template/profile/log target are highlighted simultaneously. |
| Narrow layout | At 390×844, cards avoid the highlighted controls. Long instructions scroll above fixed Back/Next and emergency controls. The English selected Diagnostics tab wraps onto two lines within its highlight. |
| Logs | The diagnostics spotlight shows an expanded log section with filtering guidance. E2E also checks collapse and automatic expansion on re-entry. |
| Site | Both languages and widths have complete home sections, guide article and footer. Seven-step, keyboard and logs instructions render correctly. Embedded Chinese gallery images are still from the previous receipt in these candidate captures; final CI must verify refreshed mirrors. |

[Input](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/mobile/input-en-US.png) · [Mapping](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/desktop/mapping-en-US.png) · [Axis profiles](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/mobile/axes-zh-CN.png) · [Diagnostics](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/desktop/diagnostics-zh-CN.png)

Candidate capture does not establish screenshot-comparison acceptance. The later readability fallback and focus fix require the ordinary full CI gate on final source. Viewport images do not establish offscreen fields or closed disclosures. This review does not claim complete WCAG compliance, screen-reader/physical-phone/400% zoom testing, user-preference research, real hardware or Unity/VRChat acceptance. [Verification record](e2e-status.en.md) · [Review criteria](ui-quality.en.md)
