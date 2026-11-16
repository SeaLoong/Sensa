# 验证记录

**简体中文** | [English](e2e-status.en.md)

本页只列当前工作台改版的证据；旧页面、旧数量和历史结论保留在[固定历史记录](https://github.com/SeaLoong/Sensa/blob/8eff42a03462566a61e37c97737fede0e973c59b/docs/e2e-status.md)。每项验证分别对应源码与 Actions 运行。

## 独立工作区、预设与高亮引导

候选源码 [`a0122057`](https://github.com/SeaLoong/Sensa/commit/a012205759b1b60f50fb4f736a26e90aac344e6b)，[完整候选运行](https://github.com/SeaLoong/Sensa/actions/runs/43941133222/attempts/1)，attempt 1。

| 检查 | 当前证据 |
| --- | --- |
| Web／运行时／脚本和文档单元 | 候选源码 `a0122057` 的 [CI](https://github.com/SeaLoong/Sensa/actions/runs/43940440695) 分别通过 **501／1607／455 项** |
| 完整浏览器候选 | 正在执行；包含桌面和窄屏的 **310 项**，尚无完成结论 |
| 截图与引导审阅 | 已更新逐图审阅后的应用基线和公开图库；最新引导与站点原图仍待复核 |
| 普通完整比较 | 图片审阅与提交之后单独执行；候选采集不证明比较通过 |

上轮后续候选通过 308/310；两项窄屏用例发现变换预设网格挤压引导正文。最新实现高亮一个可操作预设，并保留引导可读高度。

本轮覆盖输入、映射与变换、轴配置、输出四个独立页面；OSC 接收与协议输入归入输入，映射与计算共享保存／恢复草稿，输出保留连接、路由与录制。六步引导高亮真实目标并变暗其他区域，支持直接操作、Escape／续接和编辑器暂停。预设包括六套 OSC 映射、四种计算变换和六套设备轴配置。

逐图选择、截图摘要和来源将记录在[图片凭据](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json)。[视觉评审](ui-visual-review.md)记录实际观察范围。最终源码的普通比较、原生构建、隔离冒烟和预览发布以[当前 CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)为准。

## 依赖与验证范围

合并 CodeQL、Electron、Mermaid 更新；Playwright 1.65.0 在 Firefox axe 分析时重复崩溃，因此保留 1.64.1 与现有无障碍检查，见 [PR #60](https://github.com/SeaLoong/Sensa/pull/60)。

自动套件使用回环服务、临时配置和模拟传输，覆盖输入、计算、映射、脚本、录制、协议、停止顺序、双语与窄屏。模拟线包、WebGL 或构建成功不代表真实设备、Unity／VRChat 客户端、HMD 或机械停止已经验收。

[开发与检查](development.md) · [浏览器验证](e2e.md) · [Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml) · [CodeQL](https://github.com/SeaLoong/Sensa/actions/workflows/codeql.yml)
