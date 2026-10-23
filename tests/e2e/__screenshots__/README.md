# Screenshot review / 截图审阅

The tracked application baselines currently contain **149 PNGs** from the previous interface. The current redesign candidate has **164 application PNGs** and eight separate site-review originals. New application baselines await the corrected candidate, individual review and a full ordinary comparison with updates disabled.

当前应用基线保留此前界面的 **149 张 PNG**。新版候选包含 **164 张应用图片**和八张独立的站点审阅原图；修正后的候选经逐张审阅和关闭更新的完整普通比较后，再接受新基线。

## Current candidate / 当前候选

- [Actions 40028896056, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/40028896056/attempts/1), pinned source `b23451a7e67627c2ea4ac4c8fdb5cc436e8ab640`.
- **116/116 passed**, all other outcomes zero; `suite=all`, `mode=candidate`, `runner=passed`, command successful, `selectionComplete=true`, `snapshotsCompared=false`.
- [PR #25](https://github.com/SeaLoong/Sensa/pull/25), raw image head `d59f94453d38e93a113ef10fcedecd30d51492ac`.
- All **172 raw PNGs** match the export manifest's SHA-256 values. Of these, **63 fresh originals were individually opened** and **109 reused observations only with identical SHA-256**. Review reads the original Actions captures without resizing or altering stored files.

上述运行完整通过，全部原图摘要与导出清单一致。63 张新字节图片逐张打开，109 张仅在摘要相同时复用既有逐图观察；审阅读取未经修改的 Actions 原图。

## Findings / 审阅结果

Twelve parameter diagrams need wording corrections: SPS four-anchor tracking uses **root-local units**, while Contact reports **metres** and the diagram uses authored scale 1. Their introductory radius/marker text omitted these conditions. This affects the two-language, two-viewport SPS four-anchor views and Contact 2D/3D views. Corrected source is being recaptured; these images are not accepted as baselines.

12 张参数图解需要补清单位：SPS 四点定位使用根局部单位，Contact 位置采用米，图示采用作者缩放 1。首句半径与标记尺寸遗漏了相关条件，涉及两语言、两视口的四点图以及 Contact 2D／3D 图。修正后重新采集，这些图片尚未接受为基线。

Other reviewed visible regions show no blocking layout issue. Eight new spatial crops show the XYZ position and plane-normal input groups in both languages/viewports. QR diagrams show three finders, a monochrome data region and white quiet/movement margins; explanations distinguish recoverable data damage from finder visibility and frame expiry.

其余已审可见区域未发现布局阻断；八张新空间计算图展示两语言、两视口的 XYZ 位置与平面朝向输入组。QR 图解的三个角标、黑白数据区与白色留白完整，恢复说明区分数据损坏、定位图案可辨性与帧时效。

## Scope and history / 范围与历史

Captures use Chromium in `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844, plus 320 CSS px reflow assertions. Tests use isolated simulated transports. Unity GPU, VRChat/HMD and physical devices require their respective environment checks.

图片来自上述固定浏览器环境；隔离模拟传输覆盖页面行为。Unity GPU、VRChat／HMD 和实际硬件按各自环境验收。

[Previous accepted review / 上轮接受记录](https://github.com/SeaLoong/Sensa/blob/a3da64aaa9dc606c053188931afec1a8a9925420/tests/e2e/__screenshots__/README.md) · [Current results / 当前验证](../../../docs/e2e-status.en.md) · [中文记录](../../../docs/e2e-status.md)
