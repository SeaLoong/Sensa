# 视觉审阅：逐页引导与日志

**简体中文** | [English](ui-visual-review.en.md)

[候选 44107180755](https://github.com/SeaLoong/Sensa/actions/runs/44107180755)，源码 `bf35742613299174758666392fcbb2e09888abf5`，完整浏览器用例 314/314 通过。[上轮审阅](https://github.com/SeaLoong/Sensa/blob/579074a2fed50bef2901f81abdaa522c49d2d50d/docs/ui-visual-review.md)保留为固定历史。

[逐图记录](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json)包含 164 张基线、16 张引导附件与 8 张站点原图。本轮逐张打开所有接受的变化图：21 张应用基线及全部 24 张引导／站点附件。其余 143 张基线复用精确字节一致的既有审阅，其中 6 张无关的微小渲染差异未被接受。[图库记录](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/catalog-capture-review.json)将 38 张镜像绑定到本轮通过用例。

| 区域 | 实际观察 |
| --- | --- |
| 预设 | 输入／帮助／映射页的重复场景预设入口已移除。OSC 模板保留在草稿操作旁；计算与设备动作模板位于各自区域。 |
| 引导 | 七步提供有序、按用途区分的操作说明。导航和真实输入／模板／轴配置／日志目标同时高亮。 |
| 窄屏 | 390×844 下卡片避让高亮控件。长说明在固定的上一步／下一步和急停按钮上方滚动。英文诊断标签在高亮框内折为两行。 |
| 日志 | 诊断引导显示已展开的日志区及筛选说明；E2E 也检查手动收起和重新进入后自动展开。 |
| 站点 | 中英文桌面与手机首页、指南正文、页脚完整；七步、键盘与日志说明正常呈现。候选图内的中文图库仍来自上轮记录，最终 CI 须验证刷新后的镜像。 |

[输入](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/mobile/input-en-US.png) · [映射](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/desktop/mapping-en-US.png) · [轴配置](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/mobile/axes-zh-CN.png) · [诊断](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__review__/tour/desktop/diagnostics-zh-CN.png)

候选采集不构成普通截图比较验收。后续可读性回退与焦点修复仍须通过最终源码的普通完整 CI。视口图不验证屏外字段或关闭的折叠区。本轮不声称完整 WCAG 符合性、读屏／实体手机／400% 缩放测试、用户偏好研究、真实硬件或 Unity／VRChat 验收。[验证记录](e2e-status.md) · [审阅标准](ui-quality.md)

首次普通比较 [44115646674](https://github.com/SeaLoong/Sensa/actions/runs/44115646674) 发现英文手机端设备引导遮挡 Enable。后续修复将目标从整张输出卡缩小为操作按钮，并补充命中、正文空间及导航焦点断言；修复后的源码仍须通过相同的完整 CI。
