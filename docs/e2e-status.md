# 验证记录

**简体中文** | [English](e2e-status.en.md)

本轮移除独立“场景预设”弹窗，进入诊断页默认展开日志，并将引导扩为七步，同时高亮导航和实际控件。映射、计算与轴配置模板保留在各自页面。

| 检查 | 本轮证据 |
| --- | --- |
| 完整浏览器候选 | [运行 44107180755](https://github.com/SeaLoong/Sensa/actions/runs/44107180755)，源码 `bf35742613299174758666392fcbb2e09888abf5`，attempt 1：**314/314 通过**；失败、跳过、不稳定、未运行、中断均为零 |
| Chromium／Firefox／WebKit 兼容性 | 同次候选 **8/8 通过** |
| 图片审阅 | 逐张打开 21 张变化基线、16 张中英文桌面／手机引导附件与 8 张站点原图；6 张无关的 1～18 像素差异保留原基线 |
| 图库来源 | 38 张镜像均逐字节对应本轮通过用例附件及所选基线 |
| 普通完整比较 | **等待最终 PR 源码验证。** 候选 `selectionComplete=true`、`snapshotsCompared=false`，不构成普通比较验收 |

首轮诊断候选 [44105819069](https://github.com/SeaLoong/Sensa/actions/runs/44105819069) 为 309/314，发现手机引导遮挡及键盘导航时序问题。第二轮成功候选已包含避让修复；后续大目标可读性回退与导航焦点保持修复仍需普通完整 CI 验证。测试检查目标／导航命中、正文可读空间、键盘焦点、编辑器暂停、模板只改草稿、日志重新进入时展开，以及运行启用状态不被引导改变。

[逐图记录](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json) · [视觉审阅](ui-visual-review.md) · [上轮验证](https://github.com/SeaLoong/Sensa/blob/579074a2fed50bef2901f81abdaa522c49d2d50d/docs/e2e-status.md)

CI 保留源码／单测 → 同一固定提交完整浏览器比较 → 六组原生构建与隔离冒烟。候选站点图片早于图库镜像刷新，最终 CI 仍须检查重建站点。模拟传输与构建成功不等于真实硬件、Unity／VRChat、HMD 或机械停止验收；本轮未请求正式发布。

首次普通比较 [44115646674](https://github.com/SeaLoong/Sensa/actions/runs/44115646674) 发现英文手机端设备引导遮挡 Enable。后续修复将目标从整张输出卡缩小为操作按钮，并补充命中、正文空间及导航焦点断言；修复后的源码仍须通过相同的完整 CI。
