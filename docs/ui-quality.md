# 视觉与交互质量评审

**简体中文** | [English](ui-quality.en.md)

桌面 Sensa 和 WebSensa 共用浅色表面、简洁蓝色控件与熟悉的页面结构。当前状态和主要操作持续可见，详细设置按需展开。本页说明布局、可读性、交互与图片审阅标准。

## 参考体系如何使用

| 参考 | 用于检查什么 |
| --- | --- |
| [VisAWI 作者资料](https://meinald.de/forschung/visawi/) | 简洁秩序、适度变化、配色与精工感 |
| [Carbon 网格](https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/overview)／[字体](https://www.carbondesignsystem.com/building-blocks/foundations/typography/style-strategies) | 共用对齐线、清楚的字级与适合密集任务的节奏 |
| [Fluent 布局](https://fluent2.microsoft.design/layout)／[色彩](https://fluent2.microsoft.design/color) | 组内紧凑、组间留白，以及中性、强调、状态色的分工 |
| [TDesign 固定来源](https://github.com/Tencent/tdesign-common/tree/d9734f64af0e863f70e7f2c839a15278ca3d6867/style/web) | Sensa 原生组件采用的尺寸、状态与视觉语言 |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/)／[NNG](https://www.nngroup.com/articles/ten-usability-heuristics/) | 可访问操作、状态理解与错误恢复 |

VisAWI 全版是经研究验证的 18 项用户感知问卷，VisAWI-S 用四项评估整体美感，其结果作为一个整体解释。需要用户感知数据时，按[作者接受稿](https://www.uni-muenster.de/OWMS/uploads/drafts_thielsch/pdf/moshagen_thielsch_2013.pdf)的方法另行开展真实用户研究。本页的 V1–V6 用于工程观察与图片复评，记录具体画面和问题。

以上资料核验于 **2026-10-19**，采用新版本时重新核对。简洁体现为清楚的组织与取舍，适度变化体现为有目的的层级、节奏和配色。

## 当前设计约束

工作台采用浅灰页面、单层白工作面、扁平输出／映射行和 **24 px** 主要分区。顶栏与独立滚动正文共用边缘；主导航和 OSC 子导航用线型页签，输入方式用分段选择。当前模式和输入启用状态常驻显示，设置按需展开，停止入口保持可见。

正文与常用控件为 **14/22 px**，辅助文字 **12/20 px**；小／中／大控件为 **24／32／40 px**，默认 **32 px**。组件圆角 **3 px**、dialog **9 px**，品牌色 **#0052d9**。文本和必要控件边界采用足够对比的色阶，装饰线保持轻，危险色对应需要注意的实际状态。取值依据[官方主题](https://github.com/Tencent/tdesign-common/tree/d9734f64af0e863f70e7f2c839a15278ca3d6867/style/web/theme)和[中后台布局](https://github.com/Tencent/tdesign/blob/522dcfd95b1ec5077a4d7c3fc5ff2bd1bd6cc3d0/docs/design/offices_zh-CN.md)，并结合 Sensa 的任务布局调整。

数字和单位成组显示，字段按内容长度在有限范围内扩宽。数字框从 **80 px** 起，端口／频率使用短列，地址／路径获得更多空间。复选框保留 **24 px** 命中区域，视觉框较小；粗指针下常用操作和整体标签至少 **44 px**，强制配色时使用原生回退。触屏命中和强制配色效果在对应环境中复评。

## V1–V6 人工准则

每项记录“符合、问题、未评估”，附提交、语言、视口和图片来源。结论逐项保留，方便定位问题及复评。

| 准则 | 观察重点 |
| --- | --- |
| V1 层级 | 当前状态、主任务、次要设置有清楚顺序，主动作与停止容易辨认，空态简洁 |
| V2 字体与数字 | 字级角色明确，字重适度，数字变化时布局稳定，单位完整且贴近数值 |
| V3 分组与节奏 | 相关内容靠近，组间分隔清楚，表单连贯，框线和留白服务于阅读 |
| V4 色彩 | 中性色层次协调，强调色集中，状态同时具有文字或图标提示，对比充足 |
| V5 对齐细节 | 共用边缘和基线，字段宽度适合内容，图标居中，边框与内距一致 |
| V6 双语窄屏 | 中英层级稳定，换行自然，操作顺序完整，宽表格在自身区域内滚动 |

检查控制页、映射、输出、展开设置、dialog、长路径／名称、错误／急停、空／加载状态与键盘焦点。空间图另核对原点、轴、单位、检测半径和拖动标记。标签放在杯口或端头旁侧，偏移时通过引线关联真实点；四锚点颜色贯穿图形与读数。默认、复位和窄屏视角应完整显示目标，主动放大可裁切。拖动目标改变所选平面中的位置，旋转改变相机；同时检查失效状态和 SVG 回退。

问题分为阻断（主要状态或操作受遮挡、误导）、主要（阅读或层级明显受损）和细节（局部不一致）。每个待修项保留影响、原因与处理进度。

## 评审过程

1. 记录提交、图片来源、语言、视口和状态，关联可用的构建运行或附件。使用相同数据与状态进行前后比较。
2. 先看完整构图，再看文字、数字、间距、边缘和状态，写出具体位置与观察。
3. 将问题对应到具体设计修改，查看修改后的实际图片。字节相同的图片可沿用已有记录，变化图片逐一复评。
4. 分别核对行为与可访问性，记录复评结论和待检查范围。

```text
提交 / 构建运行（如有） / 图片来源：
语言 / 视口 / 状态：
V1–V6 与结论：
具体区域、观察、严重度：
修改与复评证据：
剩余未评估内容：
```

浏览器与截图在 Actions 执行。普通图片比较用于发现变化，视觉复评用于判断变化是否改善任务体验，两者都记录图片来源与对应提交。[浏览器验证与基线](e2e.md)

## 可访问性检查

按实际页面检查文字对比、控件名称、键盘操作、焦点、重排和状态播报。CI 的 [quality.spec.js](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/quality.spec.js) 与 [ui-quality.js](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/ui-quality.js) 将 axe 版本、URL／语言／视口和完整 violations／incomplete 输出保留在 `e2e-report`。自动规则覆盖所选状态，完整评估还包括人工操作与辅助技术检查。[WAI 评估工具](https://www.w3.org/WAI/test-evaluate/tools/selecting/)

- 常规文字参考 **4.5:1**，大字 **3:1**，必要非文字信息 **3:1**。[文字](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)／[控件](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- WCAG AA 的目标尺寸参考为 **24×24 CSS px**，按规范检查适用例外；项目对粗指针操作采用 **44 px** 设计目标。[目标尺寸](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- 检查 **320 CSS px** 重排，并分别验证实际 **400% 缩放**、焦点可见性、读屏与状态播报。[Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)／[Focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)／[Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- 输入启用、旧帧取消和停止由后端／mock wire 断言检查，机械停止在实际设备上验证。对 incomplete 项保留记录并安排复核。

## 用户研究与现场指标

当前记录包含工程检查与图片复评；[HEART](https://research.google.com/pubs/archive/36299.pdf)中的满意度、采纳、留存和任务成功率待真实用户研究采集。[Web Vitals](https://web.dev/articles/vitals)的 **LCP≤2.5s、INP≤200ms、CLS≤.1** 用于现场第 **75 百分位**；CI 回环结果按自身运行环境记录，设备停止延迟单独测量。

记录按机器检查、用户问卷、视觉复评和实际设备验证分别整理，便于了解每项结论的来源与适用场景。[使用指南](guide.md)
