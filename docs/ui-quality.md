# WebUI 视觉审美与质量评估

**简体中文** | [English](ui-quality.en.md)

本指南的主线是**美观与视觉传达**：界面是否有清晰的视觉秩序、协调的配色、合适的疏密和完整的细节，能否让人自然辨认重要内容。可访问性与控制正确性是底线，不能代替美感判断。

研究核对日期：2026-10-19。采用 VisAWI 的审美构念作为观察框架，以 Carbon／Fluent 的官方设计原则落实为六项人工视觉准则，并采用 TDesign 统一当前组件和布局；项目不生成综合审美分，也没有真实受试者问卷结果。

## 体系与证据的分工

| 参考 | 本项目怎么用 | 不能据此声称 |
| --- | --- | --- |
| [VisAWI 作者说明](https://meinald.de/forschung/visawi/)及原论文 | 组织对简洁、多样、配色与精工感的审美观察 | 未调查用户就获得官方问卷分数 |
| [Carbon 布局](https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/overview)、[字体](https://www.carbondesignsystem.com/building-blocks/foundations/typography/style-strategies)与 [Fluent 布局](https://fluent2.microsoft.design/layout)、[色彩](https://fluent2.microsoft.design/color) | 把抽象感受转成层级、分组、节奏、对齐和色彩角色的检查 | 使用某套 token 就取得通用审美认证 |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | 可访问操作底线与相关自动规则子集 | 自动扫描等于完整 AA 合规或界面美观 |
| [NNG 启发式](https://www.nngroup.com/articles/ten-usability-heuristics/) | 补充状态理解、错误恢复等可用性判断 | 用操作正确性替代审美评价 |
| [HEART 原论文](https://research.google.com/pubs/archive/36299.pdf)、[Web Vitals](https://web.dev/articles/vitals) | 后续用户研究和性能参考 | 从没有用户数据的 CI 推出满意度或真实访问分位数 |

## VisAWI 告诉我们观察什么

Moshagen 与 Thielsch 的 VisAWI 是经研究验证的**用户感知视觉美感问卷**。全量版有 18 项；四项短版 VisAWI-S 测整体视觉美感，不能当成四个独立可靠分量表。[作者官网](https://meinald.de/forschung/visawi/)、[2013 年原论文的作者接受稿](https://www.uni-muenster.de/OWMS/uploads/drafts_thielsch/pdf/moshagen_thielsch_2013.pdf)

| 构念 | 在 Sensa 中的观察方向 |
| --- | --- |
| Simplicity／简洁秩序 | 整体平衡、分区明确、容易形成清晰画面；不只计算删了多少元素 |
| Diversity／适度变化 | 让状态、主要操作和数据有可辨别的表现，避免所有区块同样呆板；不追求装饰堆积 |
| Colourfulness／配色 | 颜色选择、位置和组合是否协调，并支持内容表达 |
| Craftsmanship／精工感 | 版式、字级和组件细节是否一致，是否呈现经过仔细设计的整体 |

上表是本项目对构念的应用解释，不是量表题项、译本或计分规则；原量表的研究验证不等于这份本地控制台 rubric 已经过验证。没有参与者，不能填写 VisAWI 均分、套用其研究阈值或称“用户更喜欢新版”。若以后正式使用问卷，应使用作者提供的版本、按其方法施测并引用来源；本仓库不复制题项，不把自编检查清单标成经过心理测量验证的量表。

## 用设计原则把美感落实到界面

- **秩序与节奏**：Carbon 用统一网格、关键对齐线和尺寸关系形成整体；Fluent 通过邻近关系和留白表达信息分组。Sensa 采用“组内紧、组间疏”，并用分区而不是重复卡片边框解释层级。[Carbon Grid](https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/overview)、[Fluent Layout](https://fluent2.microsoft.design/layout)
- **适合控制台的字级**：Carbon 区分任务密集界面与阅读展示场景。Sensa 的标题、操作标签、实时数字、单位和说明各有角色；重要性通过字级、字重和位置共同表达，不把所有文本缩成相同小字。[Carbon Typography](https://www.carbondesignsystem.com/building-blocks/foundations/typography/style-strategies)
- **有限且有角色的色彩**：Fluent 区分中性色、品牌色和状态语义色。Sensa 以中性底色承载内容，用有限强调色标识主要操作／选择，危险色留给需要注意的控制和异常；不能用红绿装饰把状态语义稀释。[Fluent Color](https://fluent2.microsoft.design/color)
- **数字与细节是设计的一部分**：数字长度变化不应挤动单位或相邻控制；同类输入、按钮、图标和边缘应保持可见的一致性。这是项目自己的实现准则，不是上述体系给出的统一像素配方。

不机械照搬 Carbon 的 8 px 或 Fluent 的 4 px 系统，也不因采用某框架配色就判定好看。先定义适合本地控制台的信息优先级，再用一致的尺寸关系落实。

## TDesign 组件与工作台约束

当前组件与页面采用 TDesign 风格，以独立实现的 React／原生控件承载现有功能。依据[官方主题变量](https://github.com/Tencent/tdesign-common/tree/d9734f64af0e863f70e7f2c839a15278ca3d6867/style/web/theme)及[中后台布局指南](https://github.com/Tencent/tdesign/blob/522dcfd95b1ec5077a4d7c3fc5ff2bd1bd6cc3d0/docs/design/offices_zh-CN.md)，统一色阶、字号、尺寸、圆角、间距与状态；没有引入 TDesign React 运行时，也不宣称完整实现其组件库。

主导航置于顶栏，正文在下方独立滚动，顶栏与正文共用宽度和边缘。浅灰页面、单层白色工作面与细分隔组织内容；内部输出、映射、配置保持扁平行。切换三个主工作区后回到正文顶部。页签仍只浏览，应用输入方式与启用输入继续是独立明确操作。

输入方式用分段页签，应用按钮与其同组；主导航和 OSC 子导航采用线型页签。按钮区分实心、线框和文字形式，保留主要、普通与危险语义。表单、滑条、复选框／开关、标签、折叠区、表格、提示和弹窗统一正常、悬停、焦点、选中与禁用状态。脚本先导入、后显示播放操作及低频选项；急停在正文之外与弹窗内均可达。

TDesign 小／中／大控件为 24／32／40 px，对应字号 12／14／16 px。Sensa 默认中号 32 px，正文与控件 14／22 px，辅助文字 12／20 px；组件圆角 3 px、弹窗 9 px，主要工作面间隔 24 px。品牌色为 `#0052d9`；必要边界、普通白底文字及实心按钮的悬停／危险色按对比度选用较深的官方色阶。

**视觉尺寸与命中区域分开定义**。数字框从 80 px 起，在宽度上限内随有限数值字符数扩宽；端口／频率用短列，地址／路径分配余量。复选框保留 24 px 原生输入，开关以关联标签提供完整点击区。粗指针下常用操作、字段与整体开关标签至少 44 px；强制配色回退原生绘制。真实触屏、系统高对比与辅助技术仍需单独验收，不能由 CSS 规则推出已通过。

这些约束落实当前方向；V1–V6 仍需逐图复评。几何检查用于发现对齐、重叠和容纳问题，不替代整体美感判断。

## 六项人工视觉准则

每项结论只能是**符合／问题／未评估**，必须附对应提交、语言、视口和截图区域。以下是 Sensa 自定义的视觉 rubric，不汇总为假总分。

| 项目 | “符合”的可观察锚点 | “问题”的典型锚点 | 必看证据 |
| --- | --- | --- | --- |
| V1 层级与注意力 | 实际状态、主要任务、次要配置有明确视觉先后；主要动作突出，停止可辨认；页面不是同权重区块平铺 | 标题、徽标、卡片与按钮同样抢眼；空状态或大说明压过主要任务；停止淹没 | 控制页完整视口、正常／急停状态、OSC 映射页 |
| V2 字体与数字排版 | 标题／正文／说明角色一致，实时数字稳定、单位贴近值；长路径仍可识别 | 到处是同样小字；值与单位跳动、基线杂乱；字重过多；说明比主数据更突出 | 手动目标、输出目标、脚本时间、长 OSC 路径 |
| V3 分组、留白与节奏 | 同组内容靠近，组间明显分隔；连续表单节奏一致；留白形成焦点而不浪费空间 | 同组被拉散；不相关项挤在一起；层层框线、拥挤或大片无意义空白 | 展开的映射、设置、输出列表、对话框 |
| V4 配色与语义 | 中性层次协调，强调色有节制，状态颜色与含义一致；不能只靠颜色辨认 | 每个区域都有强色；装饰误用危险色；大片浅灰弱化内容；强调色互相竞争 | 正常／选中／禁用／错误／急停状态 |
| V5 对齐与精工细节 | 共享边缘／基线，字段、按钮、图标和数字成组对齐；边框、圆角、内距有一致逻辑 | 相邻控件错位、随意宽度、图标偏心、边框层级杂乱；修一处破坏另一处 | 相同组件跨页对照、表单行、滑条行、对话框页脚 |
| V6 双语与窄屏完整性 | 中英均保持层级与节奏，换行自然，重要动作顺序稳定；窄屏仍有完整构图 | 英文长词裁切、中文单字掉行、按钮挤压、表格拖宽整页；窄屏只有缩小而无重排 | zh／en × 桌面／窄屏；长名称及展开状态 |

“符合”仅指已审阅状态满足上述锚点，不表示所有页面或用户都已验证。空状态、加载、错误、悬停和键盘焦点也应抽样审阅；只看首页静态截图不够。

空间图还要核对原点、坐标轴、真实半径与屏幕标记的区别、标签可读性与选中底色；文字不能盖住需要辨认的开口或端头。还要检查默认／复位／窄屏缩放后的完整构图。分别检查正常、无效和 3D 回退状态；相机旋转不能改动参数；拖动目标应更新所选平面的两轴并保留锁定轴，锚点颜色要与参数行一致。完整入镜要求针对默认构图，用户主动放大可按预期裁切。

问题严重度不做加权：**阻断**表示主要状态／操作被遮或误导，**主要**表示层级、分组或阅读明显受损，**细节**表示局部不一致。未修问题必须保留影响与理由，不能靠其他项通过抵消。

## 实际怎么复评

1. 固定提交与任务状态，准备前后版本相同语言／视口／数据的 CI 图片。记录来源 run、artifact 与图片名，避免把内容差异误认成设计改进。
2. 先按 V1–V6 看完整画面，再检查局部文字、数字、边缘和状态。每项记录具体问题与截图位置，而非只写“更现代”或“更高级”。
3. 将问题对应到字级、布局、间距或色彩角色的具体修改，重新查看新候选；先前未评估项不能自动继承通过。
4. 另行核对可访问与关键任务证据，最后才接受有意的截图基线。截图更新是回归基线维护，不是审美投票。

记录模板：

```text
提交／CI run／artifact：
语言／视口／页面状态／图片名：
准则 V1–V6：
结论：符合／问题／未评估
截图区域与观察：
严重度：阻断／主要／细节（有问题时）
对应修改：
复评证据、结论与剩余限制：
```

本轮具体发现、前后图片和复评结果见[视觉评审记录](ui-visual-review.md)；本指南不预填没有看过的截图结论。浏览器执行、自动截图都只在 GitHub Actions，不在本机生成。[截图与基线规则](e2e.md)

## 可访问与控制：辅助底线

自动证据与人工美感结论分别保留：

- [quality.spec.js](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/quality.spec.js) 使用 [ui-quality.js](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/ui-quality.js) 扫描相关 WCAG 标签规则子集，并检查键盘、对话框、重排及指定目标尺寸。axe 4.14.0 的这些标签不覆盖全部 AA；例如焦点遮挡不能凭勾选 WCAG 2.2 标签就认定已全面检测。violation 为零是项目门槛，incomplete 仍需审阅。[WAI 工具限制](https://www.w3.org/WAI/test-evaluate/tools/selecting/)
- 文字对比参考常规 4.5:1／大字 3:1，必要控件视觉信息参考 3:1；AA 目标最小 24×24 CSS px 有例外，不能把 44 px 说成统一 AA 下限。[文字](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)、[非文字](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)、[目标尺寸](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- 320 CSS px 是重排条件，不代表已经实际测试 400% 浏览器缩放。辅助技术、真实缩放、焦点遮挡和状态播报仍需人工证据。[Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)、[Focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)、[Dialog APG](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- 浏览与编辑不误发动作，模式／脚本变更需要重新许可，暂停／急停不续发旧帧，由运行时和 mock wire 验证；截图不能证明真实机械停止。

自动报告明确以“自动可检的无障碍与行为底线”为范围，不评价视觉美感。报告为 `artifacts/e2e/ui-quality/<project>-<locale>-<kind>-retry<n>.json` 与 `.md`，附到 Playwright 结果，保留版本、标签、URL／语言／视口、完整违规／待审阅节点和行为检查。未执行与未发现问题分开；通过扫描不能代填 V1–V6。

## 尚未测量的用户与性能指标

[HEART](https://research.google.com/pubs/archive/36299.pdf)提供目标→信号→指标方法；本项目没有真实参与者数据，满意度、采纳、留存和用户任务成功率均未测量。机器任务通过只证明对应工程场景。

[Core Web Vitals](https://web.dev/articles/vitals)良好参考为 LCP≤2.5 s、INP≤200 ms、CLS≤0.1，采用现场访问第 75 百分位。项目不增加遥测、外部分析服务或本轮性能预算；CI 回环值不能替代真实用户分位数，INP 也不是硬件停止延迟。它们不参与审美 rubric 评分。

[使用指南](guide.md) · [功能参考](features.md) · [架构](architecture.md)
