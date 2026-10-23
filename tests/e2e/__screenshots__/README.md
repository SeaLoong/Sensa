# Screenshot baseline review / 截图基线评审

The set contains **150 PNGs**, 75 per viewport. This round selects **10 changed images**, five per viewport; **140 existing PNGs retain their previous bytes**. Selected images preserve raw candidate bytes. [Previous accepted review](https://github.com/SeaLoong/Sensa/blob/2f53fa97fe3f9cc98632af948fdbc11f282bb184/tests/e2e/__screenshots__/README.md).

当前共 **150 张 PNG**，桌面／窄屏各 75 张。本轮选择 **10 张变化图片**，每视口 5 张；**140 张既有图片保留原字节**。所选图片均保留原始候选字节。此前接受记录见上述固定历史。

## Capture and review provenance / 采集与审阅来源

[Candidate 39993059099, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39993059099/attempts/1) pinned source `d1c9d9354be330c7aed0a860d84d973d444e57fb` and passed **104/104**, every other outcome zero; `suite=all`, `mode=candidate`, `runner=passed`, command succeeded, `selectionComplete=true`, `snapshotsCompared=false`. Raw head `53612964de4d0a86e7b1404205ad07bddc3917d8` was exported to [PR #23](https://github.com/SeaLoong/Sensa/pull/23).

Coding assistants reviewed the exported PNGs on **2026-10-24 (Beijing time)**. Of **17 changed candidates**, **11 with fresh bytes were individually opened at original detail**; six were confirmed byte-identical to individually opened images from [candidate 39989321998](https://github.com/SeaLoong/Sensa/actions/runs/39989321998), raw head `08a176db1fdd9788b85ad77ba93daa5d62f0a173`. Fresh review covers all eight revised Shader explorer images, both Contact crops and one Chinese computed-editor image. Each of those three unrelated images was also opened alongside its accepted baseline.

代码助手于上述日期审阅全部 **17 张变化候选**：**11 张新字节图片逐张以原图打开**，另外 6 张与上一轮已逐张打开的图片字节相同，复用既有观察。新审范围包含八张 Shader 图解、两张 Contact 裁剪图和一张中文计算编辑器；三张无关新变化均已与旧图逐张对照。

The previous [PR #22](https://github.com/SeaLoong/Sensa/pull/22) candidate passed 104/104 but its desktop explorers left excessive blank space beside the expanded sidebar. Those eight explorer images were rejected and recaptured after layout improvements; only byte-identical root-panel and unrelated-edge observations carry forward.

此前 PR #22 虽完整通过，但桌面图解侧栏造成大块空白，八张图解均返工重采；本次仅对字节一致的根点面板与无关边缘变化复用观察。

## Selected visible scope / 所选可见范围

| Images / 图片 | Count / 数量 | Visible scope / 可见范围 |
| --- | --- | --- |
| `parameter-geometry-shader-{zh-CN,en-US}` × desktop/narrow | 4 | Full 2D explorer: position diagram, twelve-field readings, XYZ controls, collapsed axis/interruption headers, quantization, 40×32 monochrome code, explanations and visible parameter definitions. / 完整二维图解、十二字段读数、XYZ 控件、折叠标题、量化与黑白码，以及可见参数说明。 |
| `parameter-geometry-shader-orbit-{zh-CN,en-US}` × desktop/narrow | 4 | Same visible scope with actual WebGL orbit geometry and camera controls. / 对应的真实 WebGL 旋转图示与相机控件，其余可见范围同上。 |
| `shader-root-position` × desktop/narrow | 2 | `.point-diagnostic-grid` crop only: plots plus position, Right/Forward and AvatarScale readouts. Calibration and the full form are outside the crop. / 仅图形与位置、轴向、缩放读数区域，校准与完整表单未入图。 |

The two root-panel PNGs exactly match the previous reviewed candidate. The eight explorer PNGs use the new layout: drawing/readings, adjustment controls and technical details appear consecutively. Desktop heights are 3867/3917 px (English 2D/orbit) and 3660/3731 px (Chinese); narrow heights are 5714/5922 and 5244/5434 px respectively. Collapsed interiors are outside visual acceptance; E2E separately exercises their behavior.

两张根点图与此前已审候选逐字节相同。八张图解采用新布局，图示与读数、调节控件、编码细节连续分区。折叠区内部未计入视觉验收，由行为断言分别检查。

## Unrelated variations restored / 恢复原图的无关变化

Seven images retain accepted baseline bytes. Four edge-only candidates match the previous individually reviewed candidate; the three fresh unrelated images and their baselines were opened again.

七张图片恢复旧基线；四张边缘变化复用同字节的此前逐张审阅，三张新字节无关图片均已与旧图重新打开对照。

| Image / 图片 | Actual RGB difference / 实际 RGB 变化 |
| --- | --- |
| `desktop/computed-signal-editor-zh-CN.png` | 2 pixels on the online-badge top edge, maximum channel delta 1 / 在线徽标上沿 2 像素，最大通道差值 1 |
| `desktop/contact-root-position.png` | 220 pixels; live velocity/speed 0.200→0.210 m/s / 实时速度与速率变化 |
| `desktop/english-help.png` | 36 rounded-edge pixels / 圆角边缘 36 像素 |
| `desktop/recording-restart.png` | 17 upper-left corner pixels / 左上角 17 像素 |
| `mobile/contact-root-position.png` | 198 pixels; live speed 0.250→0.200 m/s / 实时速率变化 |
| `mobile/output-conflict.png` | 9 button-edge pixels, maximum channel delta 1 / 按钮边缘 9 像素，最大通道差值 1 |
| `mobile/parameter-geometry-plug-touch-en-US.png` | 5 antialias pixels, maximum channel delta 6 / 抗锯齿边缘 5 像素，最大通道差值 6 |

## Visual observations / 视觉观察

No new blocking or major [V1–V6](../../../docs/ui-quality.en.md) issue was found in reviewed visible regions. The revised desktop layout removes the earlier large blank region and keeps XYZ controls near the drawing. Twelve-field tables, units, timeouts and Right/Forward/AvatarScale explanations remain legible at both viewports and languages. The code has sharp monochrome cells and visible white outer margins. Root-panel plots and numeric groups remain aligned.

已审可见区域未发现新增阻断或主要 [V1–V6](../../../docs/ui-quality.md) 问题。桌面图解消除了旧候选的大块空白，XYZ 控件贴近图示；两视口、两语言中的十二字段表格、单位、时效和轴向／缩放说明清楚。编码格黑白锐利、外侧白边可见，根点面板图形与读数对齐。

## Full normal comparison / 完整普通比较

Image review and filtering are complete. [Ordinary CI 39996054415, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39996054415/attempts/1) passed unit checks; both 130-second dependency-install attempts exited 124, and builds/publication were skipped. Its verified receipt reports `suite=all`, `mode=comparison`, `runner=not-run`, command skipped, `selectionComplete=false`, `snapshotsCompared=false`, with total and all outcome counters zero. Pinned merge source `3e49ec9a8c039cfa026c6b733b041fc2a770cf79` shares tree `0ca99771c3bb56d9e5d9e6f575735e9dfd0758b0` with reviewed PR head `4de1614fd66eacb69606cbaa667b56c1e3e552f0`.

[Attempt 2](https://github.com/SeaLoong/Sensa/actions/runs/39996054415/attempts/2) used that same pinned source and passed **104/104**, all other outcome counters zero: `suite=all`, `mode=comparison`, `runner=passed`, command successful, `selectionComplete=true`, `snapshotsCompared=true`. Dependencies installed on the first attempt. Individual image review and the full comparison with updates disabled are complete; **the ten new baselines are accepted**. The reviewed source also includes documentation-label corrections and native-bridge liveness assertions; platform smoke results are recorded separately.

图片审阅与筛选已完成。首次普通 CI 单元通过，依赖安装两次均超时退出 124；浏览器未执行，全部计数为 0，比较与完整选择标记均为 false。固定合并源码与已审 PR 的 Git 树一致。GitHub 恢复后，同一源码的第 2 次尝试完整普通比较 **104/104 通过**，其他计数为 0，完整选择与图片比较均为 true，图片更新关闭。**本轮 10 张新基线已接受**；原生桥存活断言的平台冒烟结果另行记录。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844, plus automated 320 CSS px reflow checks.
- Execution / 执行: browser cases and capture run in Actions; review reads raw exported PNGs. / 浏览器与图片采集在 Actions 执行，审阅读取实际导出的 PNG。
- Scope / 范围: isolated browser behavior and visible image regions. Unity GPU capture, VRChat/HMD and hardware await their own environment validation. / 本轮为隔离浏览器行为与图片可见范围，Unity GPU、VRChat／HMD 与硬件另行验收。

[Current verification / 当前验证](../../../docs/e2e-status.en.md) · [中文记录](../../../docs/e2e-status.md) · [E2E maintenance / E2E 维护](../../../docs/e2e.en.md)
