# 视觉与交互质量评审

**简体中文** | [English](ui-quality.en.md)

Sensa 的视觉目标是清晰、轻量、精致的控制工作台：能自然辨认实际状态、主要动作与次要配置。美观、可用性、可访问性和控制正确性各有证据，不能互相替代。本页规定怎么评，具体已看画面见[历史视觉记录](ui-visual-review.md)。

## 参考体系如何使用

| 参考 | 在这里的作用 | 不作什么承诺 |
| --- | --- | --- |
| [VisAWI 作者资料](https://meinald.de/forschung/visawi/) | 简洁秩序、适度变化、配色与精工感四个观察方向 | 无受试者就没有问卷分数或用户偏好结论 |
| [Carbon 网格](https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/overview)／[字体](https://www.carbondesignsystem.com/building-blocks/foundations/typography/style-strategies) | 关键对齐线、字级、密集任务的节奏 | token 不是审美认证 |
| [Fluent 布局](https://fluent2.microsoft.design/layout)／[色彩](https://fluent2.microsoft.design/color) | 组内紧、组间疏；中性／强调／状态色分工 | 不机械复制另一产品的页面 |
| [TDesign 固定来源](https://github.com/Tencent/tdesign-common/tree/d9734f64af0e863f70e7f2c839a15278ca3d6867/style/web) | 当前组件尺寸、状态与视觉语言 | 自建原生组件不是完整 TDesign React 实现 |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/)／[NNG](https://www.nngroup.com/articles/ten-usability-heuristics/) | 可访问底线、状态理解与错误恢复 | 自动规则不等于完整 AA 或好看 |

VisAWI 全版是经研究验证的 18 项用户感知问卷，VisAWI-S 四项短版测整体美感，不能拿来生成四个可靠分量表。[作者接受稿](https://www.uni-muenster.de/OWMS/uploads/drafts_thielsch/pdf/moshagen_thielsch_2013.pdf)中的研究结论不自动验证 Sensa 自定义 rubric。本仓库不复制题项，不伪造参与者均分，也不把“更简洁”理解为单纯删元素或“多样”理解为堆颜色。

以上资料核验于 2026-10-19；后续采用新版本需重新检查。真实用户研究可以另行按作者方法开展，但不以工程 CI 代替。

## 当前设计约束

工作台采用浅灰页面、单层白工作面、扁平输出／映射行和 24 px 主要分区。顶栏与独立滚动正文共用边缘；主导航／OSC 子导航用线型页签，输入方式用分段选择。实际模式／输入许可常驻，浏览和应用分开；低频配置折叠，但不隐藏停止入口。

正文与常用控件 14/22 px，辅助文字 12/20；小／中／大控件 24／32／40 px，默认 32。组件圆角 3 px、dialog 9 px，品牌色 #0052d9。必要控件边界与普通文本选足够对比的色阶，装饰线保持轻；危险色保留真实语义。来源是[官方主题](https://github.com/Tencent/tdesign-common/tree/d9734f64af0e863f70e7f2c839a15278ca3d6867/style/web/theme)与[中后台布局](https://github.com/Tencent/tdesign/blob/522dcfd95b1ec5077a4d7c3fc5ff2bd1bd6cc3d0/docs/design/offices_zh-CN.md)，具体值是 Sensa 的落地选择。

数字与单位成组，有限字符扩宽有上限；数字框从 80 px 起，端口／频率用短列，地址／路径用余量。默认复选框保留 24 px 命中、视觉框较小；粗指针常用操作和整体标签至少 44 px，强制配色回退原生。CSS 声明不代表真实触屏／高对比已验收。

## V1–V6 人工准则

每项只记录“符合、问题、未评估”，附提交、语言、视口与截图；不加权成总分。

| 准则 | 可观察的通过锚点 | 必看反例 |
| --- | --- | --- |
| V1 层级 | 实际状态、主任务、次配置有先后；主动作和停止易辨 | 卡片／徽标／说明同样抢眼，空态压过任务 |
| V2 字体与数字 | 字级角色清楚，数值稳定，单位完整贴近 | 全部小字、字重过多、数字挤动邻居 |
| V3 分组与节奏 | 同组靠近、异组分开，表单连贯、留白有目的 | 层层框线、大片空白或无关项挤在一起 |
| V4 色彩 | 中性层次协调，强调有限，状态不只靠颜色 | 装饰误用危险色、弱对比、强色竞争 |
| V5 对齐细节 | 共用边缘／基线，按钮、字段与数字成组 | 随意宽度、图标偏心、边框／内距不一致 |
| V6 双语窄屏 | 中英层级稳定、自然换行，动作顺序完整 | 中文单字断行、英文裁切、表格拖宽整页 |

检查控制页、映射、输出、展开设置、dialog、长路径／名称、错误／急停、空／加载与键盘焦点；不能只看首页。空间图另看原点、轴、单位、真实半径与操作标记的区别。标注不能盖杯口／端头，偏移标签应能追溯真实点；四锚点颜色跨图与读数一致。默认／复位／窄屏须完整入镜，主动放大可以裁切。拖目标改指定平面，旋转只改相机；失效和 SVG 回退也各需证据。

严重度为：阻断（主状态／操作被遮或误导）、主要（阅读／层级明显受损）、细节（局部不一致）。未修问题保留影响和理由，不能用其他项通过抵消。

## 评审过程

1. 固定提交、图片来源、语言／视口／状态；有构建运行或附件时一并记录。比较相同数据，不把内容变化误认为设计提升。
2. 先看完整构图，再看字、数字、间距、边缘与状态；写具体观察，不只写“现代”。
3. 将问题对应具体设计变更，再审实际新图。字节相同图可继承明确记录，变化图重看。
4. 独立核对行为与可访问性，记录人工复评结果及尚未检查的范围。

```text
提交 / 构建运行（如有） / 图片来源：
语言 / 视口 / 状态：
V1–V6 与结论：
具体区域、观察、严重度：
修改与复评证据：
剩余未评估内容：
```

浏览器与截图在 Actions 执行。视觉评审仍需人工查看实际图片并记录来源，普通比较通过不表示所有设计问题都已审阅。[浏览器验证与基线](e2e.md)

## 可访问性检查

按实际页面检查文字对比、控件名称、键盘操作、焦点、重排和状态播报。CI 的 [quality.spec.js](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/quality.spec.js) 与 [ui-quality.js](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/ui-quality.js) 保留 axe 版本、URL／语言／视口、完整 violations 和 incomplete，报告进入 `e2e-report`。只扫描选定状态不能外推全部 AA。[WAI 工具限制](https://www.w3.org/WAI/test-evaluate/tools/selecting/)

- 常规文字参考 4.5:1，大字 3:1，必要非文字 3:1。[文字](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)／[控件](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- AA 目标 24×24 CSS px 有例外；项目粗指针 44 是额外设计目标，不是统一 AA 下限。[目标尺寸](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- 320 重排不是实际 400% 缩放；焦点遮挡、读屏和状态播报需人工。[Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)／[Focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)／[Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- 输入许可、旧帧取消与停止要核后端／mock wire，截图不证明机械停止。零自动违规也不清除 incomplete。

## 尚无的数据

[HEART](https://research.google.com/pubs/archive/36299.pdf)的满意度、采纳、留存与任务成功率需要真实用户，本项目没有这些数据。[Web Vitals](https://web.dev/articles/vitals)的 LCP≤2.5s、INP≤200ms、CLS≤.1 是现场第 75 百分位参考，回环 CI 不是现场分布，INP 更不是设备停止延迟。

本轮不增加遥测、外部分析或虚构性能／审美预算。机器任务通过、问卷结果、人工视觉判断与实际设备验收分别报告。[使用指南](guide.md)
