# Archived visual review: draggable parameter explorer

[简体中文](ui-visual-review.md) | **English**

This is a **2026-10-21 review tied to fixed source and images**, not a live main-branch dashboard. It records findings and acceptance for ten-scene 3D, actual target dragging, label clearance and leaders. Later automatic-language/site work needs its own CI evidence and cannot inherit this page as an executed result.

Coding agents inspected actual CI images using [V1–V6](ui-quality.en.md), retaining TDesign colors/flat layout. There was no questionnaire, aggregate aesthetic score or preference study. The earlier 98-image review remains at a [fixed commit](https://github.com/SeaLoong/Sensa/blob/9ffca1ea6361aad4ca9d7b53e8b96a1e86038142/docs/ui-visual-review.en.md).

## Evidence and scope

- Generation source: `7096282a24cc2c68e363d70accd56cd3ac0fd6ee`; `e2e-report` / `e2e-baselines` from [successful candidate 39467342379](https://github.com/SeaLoong/Sensa/actions/runs/39467342379).
- All 58 executions passed on retry 0, with zero skips, flaky retries, failures or run errors. Accepted **110 PNGs**, 55 each at 1280×900 and 390×844. The original 70 application images are byte-identical.
- The 40 parameter images cover modern Socket, legacy Socket, Plug Touch, Sensa SPS and Shader × two languages × XZ/orbit × two viewports. Every initial image was inspected; later sets inherit byte-identical evidence and reassess changes. Four English isometric SVG diagnostics were also inspected; they are attachments rather than goldens.
- Current images are fixed at `da2ca1e779fe73054440d6d97f550a2222c6e49a`. Earlier diagnostic candidates were not accepted. Final orbit representatives reset target parameters and explicitly select XZ movement. Generation uses `updateSnapshots=all`, not ordinary-comparison proof for the final commit.
- Browsers and captures run only in Actions. Local-file guide cases share a software WebGL2 worker pool; application cases retain their original browser configuration. The guide has no OSC, network or device connection.

## Findings and reassessment

| Criterion | Change | Observed result |
| --- | --- | --- |
| V1 Hierarchy and meaning | Retain figure/readout/control order; highlight prefixes such as `Sensa/SPS/*` | Replace * with the actual instance, then append the leaf; button titles retain full address examples rather than implying a literal asterisk |
| V2 Typography and numbers | 12 px screen-sized 3D labels, tabular values, opaque light backgrounds with coloured outlines for active anchors | P0–P3 remain distinct; actual selected-text colour ratios exceed 4.79 for every anchor, without implying site-wide compliance |
| V3 Grouping and interaction | Scenario, projection, drag plane and reset form one group; camera controls form another | Target dragging changes coordinates; background dragging orbits; both selectors and reset fit one row at 390 px |
| V4 Colour and identity | P0 blue, P1 teal, P2 purple, P3 rose across spheres, markers, dimensions, row swatches and coordinate notes | Parameter/anchor identities agree; names and status text remain independently readable; ordinary Senders stay orange |
| V5 Shapes and annotations | Hollow revolved Socket profile and tapered round-tip Plug; reserve actual projected body bounds and link displaced labels with fine leaders | Modern Socket rim and gray Plug are unobscured; Tip leaders point to the real Plug endpoint rather than suggesting the adjacent Socket |
| V6 Languages and narrow layouts | Bilingual representatives and automated 320 px reflow; retain aligned controls, complete prefixes and values | No new major clipping or label collision in reviewed images; Shader cube and SPS anchors/readings remain complete |

Initial 3D tags covered the small Socket opening and part of the Plug. Actual Lathe bounding-box projection first moved text clear of the bodies. Review then found the modern English Tip tag about 63 px from its endpoint, with the Socket between them: moving text alone left an ambiguous association. The final change adds leaders and reference dots only for displaced body root/tip annotations, preserving scale, measurements and layout. Small OGB objects share a true scale with large Receiver spheres; camera zoom reveals detail. The legacy default Plug already enters the Socket, so that pose cannot prove the entire inner wall is visible.

| Representative view | Desktop | Narrow |
| --- | --- | --- |
| Socket/Plug 3D | [English](https://github.com/SeaLoong/Sensa/blob/da2ca1e779fe73054440d6d97f550a2222c6e49a/tests/e2e/__screenshots__/desktop/parameter-geometry-socket-modern-orbit-en-US.png) | [Chinese](https://github.com/SeaLoong/Sensa/blob/da2ca1e779fe73054440d6d97f550a2222c6e49a/tests/e2e/__screenshots__/mobile/parameter-geometry-socket-modern-orbit-zh-CN.png) |
| Four anchors in 3D | [English](https://github.com/SeaLoong/Sensa/blob/da2ca1e779fe73054440d6d97f550a2222c6e49a/tests/e2e/__screenshots__/desktop/parameter-geometry-sensa-sps-orbit-en-US.png) | [Chinese](https://github.com/SeaLoong/Sensa/blob/da2ca1e779fe73054440d6d97f550a2222c6e49a/tests/e2e/__screenshots__/mobile/parameter-geometry-sensa-sps-orbit-zh-CN.png) |
| Plug Touch | [Chinese](https://github.com/SeaLoong/Sensa/blob/da2ca1e779fe73054440d6d97f550a2222c6e49a/tests/e2e/__screenshots__/desktop/parameter-geometry-plug-touch-orbit-zh-CN.png) | [English](https://github.com/SeaLoong/Sensa/blob/da2ca1e779fe73054440d6d97f550a2222c6e49a/tests/e2e/__screenshots__/mobile/parameter-geometry-plug-touch-orbit-en-US.png) |

## Interaction and engineering evidence

Actual mouse gestures cover XZ and XY: independent ray/plane reconstruction and DOM steps/bounds yield (0.19,1,0.29), (0.33,1.11,0.29), and a clamped sample (1.8,1.19,0.29). Real targets, Senders and four proximity readings agree, while the locked axis and camera remain unchanged. Background dragging, keyboard, wheel, buttons and reset still control the camera. Escape and scene changes end capture without continuing the old gesture. YZ has an independent matrix round-trip check, without a separate real-mouse flow.

Real WebGL2 pixels are nonempty with zero GL errors. Sphere/capsule/box geometry, Lathe surfaces, material colours and matrices match all ten scene models, including L/W/D changes. References do not affect Contact calculations; the strict capsule BBox ratio 5.5 at precision 4 still passes. Label clearance independently projects actual matrices against DOM bounds. Leader checks read real SVG/CTM coordinates to verify origins, corresponding label edges, direction and visibility, without trusting an implementation success flag.

Geometry and texture counts remain stable across three cycles, with one live instance and none after exit/context loss. Missing/lost WebGL2 falls back to SVG with working sliders/readings. Both renderings cover ten scenes × two languages at 320 px: document width remains 320 and same-row sliders do not drift. Default/narrow SPS/Shader corners satisfy |NDC|≤0.9. SVG body text is about 11 px, axes about 10 px, and 3D HTML labels 12 px.

Existing application quality reports cover 40 axe states with zero detected violations in the selected subset; 64 behaviour checks and four checks that auditing never enables input pass. All **56 incomplete node occurrences** remain recorded, including repeated states: 32 label and 24 contrast findings, with unchanged target fingerprints. Anchor colour checks do not clear those pending findings.

## Limits

Manual findings cover only the five representative scenes in bilingual XZ/orbit and four English isometric diagnostics. The other five scenes have automated geometry/reflow coverage rather than complete per-state visual review. Automated 320 px reflow is not real 400% zoom or a physical phone. Arbitrary camera angles, intentional deep zoom, every invalid frame, screen readers, system high contrast and other browsers remain incompletely assessed. Zoom may crop; labels use a bounded fallback when space is insufficient.

The guide scrolls normally; the application scrolls below a persistent header. Images do not prove offscreen columns, closed content or every field. Dismissible application notifications can briefly obscure secondary bottom content. Existing root workflows were not individually captured in English, and calibration has no dedicated axe state. The 40 application scans do not cover the standalone guide or establish full WCAG compliance.

Gray bodies are shared profile illustrations, not imported Avatar meshes. Root coordinates are not orientation/world position, and encoding resolution is not measured accuracy. No real Unity producer, VRChat Contacts/OSC session, desktop/HMD encoding capture, real-time GPU decoding or user hardware ran. Browser WebGL and simulated packets do not establish those behaviours. See [parameters](osc-parameters.en.md), [OGB compatibility](ogb-compatibility.en.md) and [positioning](positioning.en.md).

Historical acceptance cannot replace normal comparison of a new commit. Later main runs keep updates disabled and compare all images required by the current implementation; read the actual count in that report. Guide changes follow impact planning and do not trigger native builds or previews without outstanding product work. [Verification workflow](e2e.en.md)
