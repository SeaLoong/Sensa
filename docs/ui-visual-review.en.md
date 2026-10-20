# Parameter diagrams and WebUI visual review

[简体中文](ui-visual-review.md) | **English**

Date: 2026-10-21. This iteration adds offline interactive diagrams and real Three.js views for OGB, fixed P0–P3 and Shader, retaining the TDesign palette, flat layout and regular control proportions. Coding agents inspected images against [V1–V6](ui-quality.en.md). There was no participant questionnaire, aggregate beauty score or preference study. This replaces the previous current-state narrative; the existing 70 application images retain their [historical review](https://github.com/SeaLoong/Sensa/blob/33ea842f9367d63cc10f4f6a2a413f40cd8d9be9/docs/ui-visual-review.en.md) at a fixed commit.

## Evidence and acceptance scope

- Generation source: `44e63a6f561aa6eaf0d0f0555cbecfad6965e55c`; `e2e-report` / `e2e-baselines` from [successful candidate 39451877629](https://github.com/SeaLoong/Sensa/actions/runs/39451877629).
- All 58 executions passed on retry 0, with zero skips, flaky retries, failures or run errors. Accepted **98 PNGs**, 49 each at 1280×900 and 390×844. The existing 70 application images are byte-identical.
- Individually reassessed 28 additions: bilingual XZ views of modern Socket, legacy Socket, Plug Touch, Sensa SPS and Shader (20), plus bilingual SPS/Shader orbit views (8). Four English isometric SVG diagnostics were also individually inspected; they are report attachments, not goldens.
- Accepted images are fixed at `38a2dd2a29b5445ad228851958c25eff525d690b`. Failed or superseded candidates were not accepted. Generation used `updateSnapshots=all` and supplies no exact-SHA ordinary-comparison proof for publication.
- Browsers and captures ran only in Actions. Orbit cases use a separate software WebGL2 worker pool; application cases retain their existing browser configuration.

## Findings, changes and reassessment

| Criterion | Change | Observed result |
| --- | --- | --- |
| V1 Hierarchy and communication | Scenario/projection above figure and readings; geometry controls below; secondary explanations separated | Shapes precede parameter detail; raw values, model gates and actual runtime are distinguished |
| V2 Typography and numbers | SVG text follows actual screen scale; 3D uses 12 px HTML labels; tabular numbers | Axes, radii and P0–P3 are readable; Sample 0.03125 is intact; quantization error does not imply accuracy |
| V3 Grouping and spacing | One figure/readout group with narrow reflow; camera buttons grouped separately | Seven camera controls are distinct from XYZ adjustments; large SPS spheres and reference cube remain legible |
| V4 Colour and meaning | Blue Receiver, orange moving Sender/input, gray references, explicit status text | Selected rows identify shapes; validity/fallback do not rely solely on colour; Shader explicitly has no Contact radius |
| V5 Alignment and geometry | Separate axis labels from Socket outlines; correct SVG semicircle precision; align slider bottoms; fit camera to actual bounds and viewport | Strict capsule dimensions remain tested; default/reset Shader cube no longer loses its bottom corner; no major label collisions in either viewport |
| V6 Languages and narrow layouts | Individually inspect bilingual representative scenes; test actual text/control bounds and frustum at 320 px | Reviewed 390 px compositions are complete; automated reflow has no page overflow and same-row sliders have zero bottom spread |

Earlier reviews found small labels, axes crossing outlines and misaligned sliders. Each was corrected. The first real 3D Shader view clipped its bottom-front corner. Camera distance now follows actual geometry bounds and the narrower field of view; resizing preserves orbit direction and relative zoom. Final bilingual Shader views show all eight corners/twelve edges. SPS anchors, local origin, moving marker, axes and R=2.500 remain clear. Intentional user zoom may crop; complete framing is required for default composition.

| Representative view | Desktop | Narrow |
| --- | --- | --- |
| Socket Root/Tip | [Chinese](https://github.com/SeaLoong/Sensa/blob/38a2dd2a29b5445ad228851958c25eff525d690b/tests/e2e/__screenshots__/desktop/parameter-geometry-socket-modern-zh-CN.png) | [English](https://github.com/SeaLoong/Sensa/blob/38a2dd2a29b5445ad228851958c25eff525d690b/tests/e2e/__screenshots__/mobile/parameter-geometry-socket-modern-en-US.png) |
| Fixed anchors in 3D | [English](https://github.com/SeaLoong/Sensa/blob/38a2dd2a29b5445ad228851958c25eff525d690b/tests/e2e/__screenshots__/desktop/parameter-geometry-sensa-sps-orbit-en-US.png) | [Chinese](https://github.com/SeaLoong/Sensa/blob/38a2dd2a29b5445ad228851958c25eff525d690b/tests/e2e/__screenshots__/mobile/parameter-geometry-sensa-sps-orbit-zh-CN.png) |
| Shader 3D | [English](https://github.com/SeaLoong/Sensa/blob/38a2dd2a29b5445ad228851958c25eff525d690b/tests/e2e/__screenshots__/desktop/parameter-geometry-shader-orbit-en-US.png) | [Chinese](https://github.com/SeaLoong/Sensa/blob/38a2dd2a29b5445ad228851958c25eff525d690b/tests/e2e/__screenshots__/mobile/parameter-geometry-shader-orbit-zh-CN.png) |

## Functional and engineering evidence

Local-file cases check no network/WebSocket activity, full XYZ mathematics, actual SVG dimensions, mouse/keyboard interaction and independent inverse projection, invalid readings and retained state across languages. Application cases verify the localized parameter-details link without enabling input or sending device commands.

Real WebGL2 checks non-background pixels, zero GL errors, actual sphere/edge geometry and matrices. P0–P3 with R=2.5 and the dedicated Sender r=0.001 match the model. Shader has only a side-3 encoding cube centred at (0,1,0), without Sender/Receiver shapes. An independent matrix inverse checks all eight corners: maximum default |NDC| stays below 0.8345 for Shader and 0.6194 for SPS; at 320 px, below 0.7434/0.5554 respectively. All satisfy the required |NDC|≤0.9 boundary.

Pointer, keyboard, wheel and buttons change the real camera without changing parameters; reset restores position and quaternion. Geometry counts remain stable across three cycles; leaving the view or losing context leaves no live instance. Disabled WebGL2 and controlled context loss both fall back to SVG with working sliders/readings. At 320 px the two projects cover 40 SVG scene/language samples, 88 same-row slider groups and 16 3D slider groups. These are engineering assertions, not per-state manual aesthetic verdicts.

Existing application quality reports still cover 40 axe states with zero detected violations in the selected rule subset. All 64 behaviour checks and four checks that auditing never enables input passed, with no missing checks, fatal errors or run errors. All **56 incomplete node occurrences** remain recorded, including repeated states: 32 label and 24 contrast findings. Their target fingerprint is unchanged; manual readability does not clear them.

## Limits

Manual findings apply only to the 28 initial simulated views and four English isometric diagnostics. The other five scenes have automated functional/reflow coverage but no complete individual visual review. The automated 320 px check is not real 400% browser zoom. Every orbit angle, every invalid frame, system high contrast, other browsers, screen readers and physical-phone touch remain unassessed.

The application workspace scrolls below a persistent header; the standalone guide scrolls as a normal document. Images do not prove offscreen columns or closed content. Dismissible application notifications can briefly obscure secondary bottom content. Existing application root workflows were not captured state by state in English, and calibration has no dedicated axe state. The 40 application scans do not include the new standalone guide and cannot establish site-wide WCAG compliance.

Models show current geometry contracts. Pixel evidence is WebGL rendering of this local guide; the encoded grid is a calculated illustration. No real Unity producer, VRChat Contacts/OSC session, desktop/HMD encoding capture, real-time GPU decoding or user device action ran. These checks do not prove coordinate accuracy or real capture usability. See [usage routes](usage-scenarios.en.md), [parameter reference](osc-parameters.en.md), [OGB compatibility](ogb-compatibility.en.md) and [positioning](positioning.en.md).

Ordinary main CI must compare all 98 images with updates disabled at the final commit and pass the required product jobs before automatic preview publication. Candidate generation does not replace that proof. [Verification workflow](e2e.en.md)
