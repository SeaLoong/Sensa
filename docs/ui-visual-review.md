# 视觉评审：独立工作区与高亮引导

**简体中文** | [English](ui-visual-review.en.md)

本页记录当前工作区改版的视觉检查。旧参数图解评审保留于[固定历史提交](https://github.com/SeaLoong/Sensa/blob/8eff42a03462566a61e37c97737fede0e973c59b/docs/ui-visual-review.md)，不再混入当前结论。

## 来源与选择

[候选运行 43941133222](https://github.com/SeaLoong/Sensa/actions/runs/43941133222/attempts/1)，源码 [`a0122057`](https://github.com/SeaLoong/Sensa/commit/a012205759b1b60f50fb4f736a26e90aac344e6b)，浏览器用例 310/310 通过。生成候选不代表普通截图比较已经通过；最终 PR／main 源码仍须通过独立 [CI 比较](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)。

[图片凭据](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json)列出 164 张应用基线、12 张高亮引导附件和 8 张站点原图。应用基线变化 76 张；每张接受图片都有独立观察，或与已审阅原图逐字节一致，并保留原始运行来源。未变图片保留固定历史证据；图解细小栅格差异继续使用原基线。公开图库 38 张镜像通过[图库采集凭据](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/catalog-capture-review.json)逐项核对本次用例摘要。

## 实际观察

| 标准 | 观察结果 |
| --- | --- |
| V1 层级 | 输入、映射与变换、轴配置、输出各有入口。映射／计算页签共用一行保存与恢复，删除重复标题。 |
| V2 字体与数值 | 数值和单位保持成组；窄屏双语标签自然换行。面板裁图只证明可见字段。 |
| V3 分组 | OSC 接收留在输入，映射与计算放在一起，输出连接与录制归入输出页；预设按需展开。 |
| V4 配色与状态 | 中性色表面、蓝色主操作与文字状态保持一致。高亮引导变暗周围页面，描边标出可交互目标，卡片内始终保留急停。 |
| V5 对齐 | 桌面表单共用边线；窄屏字段纵向排列、按钮换行，录制导出仍可见。 |
| V6 双语与窄屏 | 逐张检查了中英文输入／映射／轴配置引导的桌面及 390px 原图。紧凑引导优先呈现当前说明，步骤导航默认折叠。 |

审图发现映射标题重复，以及英文手机轴配置引导的六步导航挤掉当前说明。标题已经合并，步骤导航移到正文后方的**跳转步骤**中；后续窄屏复核发现展开的变换网格挤压正文，因此改为高亮一个可操作预设，并保留最低可读高度。E2E 检查正文可见空间、“下一步”未被遮挡，以及高亮目标的点击命中。

| 代表画面 | 桌面 | 窄屏 |
| --- | --- | --- |
| 输入高亮 | [中文](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/desktop/input-zh-CN.png) | [英文](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/mobile/input-en-US.png) |
| 映射高亮 | [英文](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/desktop/mapping-en-US.png) | [中文](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/mobile/mapping-zh-CN.png) |
| 轴配置高亮 | [中文](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/desktop/axes-zh-CN.png) | [英文](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/mobile/axes-en-US.png) |

## 范围与剩余限制

8 张站点原图用于核对中英文首页／指南构图，均校验源码记录、构建清单和图片摘要。8 张均来自图库更新后的[普通运行 43942444086](https://github.com/SeaLoong/Sensa/actions/runs/43942444086)，源码 `6fac7c4c`，已逐张打开检查；当前嵌入图库与五节首次使用指南在两种布局中均正常。同一运行通过 310 项普通比较；后续文档改动继续由 CI 检查。[截图图库](screenshots.md)

完整浏览器套件覆盖工作区跳转、草稿保留、预设、Escape／恢复、编辑器暂停及切页后的录制。自动无障碍报告继续保留 incomplete 项；本评审不等于完整 WCAG、读屏、实体手机或真实 400% 缩放验收。桌面英文输入引导的次要“打开输入设置”按钮部分位于可滚动正文下沿，主要导航与停止保持可见。视口图片不证明屏外字段与关闭的折叠内容；没有审美问卷或用户偏好研究。

模拟传输、浏览器 WebGL 和隔离冒烟不代表真实硬件、Unity／VRChat 或 HMD 行为。历史空间图形验收仍只适用于当时源码。[验证记录](e2e-status.md) · [评审标准](ui-quality.md)
