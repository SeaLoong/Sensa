# Screenshot review / 截图审阅

The tracked baselines now contain **164 application PNGs**, with **eight site-review originals** under `tests/e2e/__review__/site/`. All 172 originals were individually reviewed after recovery into the new environment; no missing historical review receipts were reused. Per-image SHA-256 and observations are retained in [baseline-review.json](../baseline-review.json).

当前基线包含 **164 张应用 PNG**，另有 **8 张站点审阅原图**位于 `tests/e2e/__review__/site/`。恢复到新环境后重新逐张审阅了全部 172 张原图，未复用缺失的历史审阅凭据；逐图 SHA-256 与观察记录保存在 [baseline-review.json](../baseline-review.json)。

## Candidate and comparison / 候选与普通比较

- [Candidate 40035585736, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/40035585736/attempts/1) pins source `5d60f782313c9d6291bf9a32fa68394b63a1136e`: **116/116 passed**, all other outcomes zero; `suite=all`, `mode=candidate`, `runner=passed`, command successful, `selectionComplete=true`, `snapshotsCompared=false`.
- [PR #26](https://github.com/SeaLoong/Sensa/pull/26) contains raw image commit `a53b8e18cf1a3da710f368b3ae5a32c6cd71204d`. The patch, export manifest and all **172 image SHA-256 values** were verified together.
- [Full ordinary comparison 40037674549, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/40037674549/attempts/1) tested merge snapshot `b0c08cb02e1352b9ad0cfcc7e279e71cad6f7fdc`, whose parents are main `d3bcf1701ee114271cafa285cb382532e851ccaf` and the candidate commit above: **116/116 passed**, all other outcomes zero; `suite=all`, `mode=comparison`, `runner=passed`, command successful, `selectionComplete=true`, `snapshotsCompared=true`.

候选完整通过，导出补丁、清单与全部图片摘要一致。普通比较使用 main `d3bcf17` 与候选的合并快照，关闭截图更新后完整 **116/116 通过**，验证了当前应用代码与这套基线的组合。图片审阅与普通比较均已完成；后续代码改动仍需对应提交的检查。

## Findings / 审阅结果

The corrected SPS four-anchor introductions explicitly use **root-local units** and explain the metre equivalence at authored scale 1. Contact introductions specify **metres** and the illustrated scale. The previous twelve wording concerns are resolved in these captures. Spatial crops show the XYZ position and plane-normal input groups in both languages/viewports. QR diagrams show three finders, monochrome data and white quiet/movement margins; text distinguishes recoverable data damage from finder visibility and frame expiry.

修正后的 SPS 四点定位首句明确使用**根局部单位**，并说明作者缩放为 1 时对应米；Contact 首句明确采用**米**与图示缩放条件。此前 12 张图片的措辞问题已在本次原图中修正。空间计算图片展示两语言、两视口的 XYZ 位置和平面朝向分组；QR 图解保留三个角标、黑白数据与白色留白，说明区分数据恢复、角标可辨性和帧时效。

## Scope and history / 范围与历史

Captures use Chromium in `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844, plus 320 CSS px reflow assertions. Tests use isolated simulated transports. Visual review and browser comparison do not establish Unity GPU, VRChat/HMD or physical-device acceptance.

图片来自上述固定浏览器环境，页面行为使用隔离模拟传输。视觉审阅与浏览器比较不代表 Unity GPU、VRChat／HMD 或实际硬件验收。

[Previous review / 上轮审阅记录](https://github.com/SeaLoong/Sensa/blob/d3bcf1701ee114271cafa285cb382532e851ccaf/tests/e2e/__screenshots__/README.md) · [Current results / 当前验证](../../../docs/e2e-status.en.md) · [中文记录](../../../docs/e2e-status.md)
