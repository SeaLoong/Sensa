# 验证记录

**简体中文** | [English](e2e-status.en.md)

本页只列当前工作台改版的证据；旧页面、旧数量和历史结论保留在[固定历史记录](https://github.com/SeaLoong/Sensa/blob/8eff42a03462566a61e37c97737fede0e973c59b/docs/e2e-status.md)。

## 独立工作区、预设与高亮引导

完整候选源码 [`a0122057`](https://github.com/SeaLoong/Sensa/commit/a012205759b1b60f50fb4f736a26e90aac344e6b)，[Actions 运行](https://github.com/SeaLoong/Sensa/actions/runs/43941133222/attempts/1)，attempt 1。后续键盘修复 `84bc6f45` 已通过普通 CI 43942444086；受测合并提交 `6fac7c4c` 与 PR 分支头的源码树完全相同。

| 检查 | 证据 |
| --- | --- |
| Web／运行时／脚本和文档 | [最终引导实现的 CI](https://github.com/SeaLoong/Sensa/actions/runs/43942444086) 分别通过 **501／1607／455 项** |
| 完整浏览器候选 | 桌面与窄屏 **310/310 通过**；失败、跳过、重试通过、未执行与中断均为零 |
| Chromium／Firefox／WebKit 兼容 | 候选运行 **8/8 通过** |
| 图片审阅 | 逐张审阅 76 张变化的应用基线；逐字节相同的图片复用已记录观察；图解细小栅格差异保留原基线 |
| 独立普通比较 | [运行 43942444086](https://github.com/SeaLoong/Sensa/actions/runs/43942444086) **310/310 通过**，`selectionComplete=true`、`snapshotsCompared=true`；后续提交仍保留同一 CI 门槛 |

输入、映射与变换、轴配置、输出各有独立页面。OSC 接收与协议来源归入输入，映射与计算共享保存／恢复草稿，输出保留连接、路由与录制。六步引导高亮可操作的真实控件、变暗其他区域，支持 Escape 保存进度与编辑器暂停。紧凑引导优先显示当前说明，跳转步骤默认折叠；变换步骤聚焦一个可操作预设，Tab／Shift+Tab 包含高亮按钮自身。预设包括六套 OSC 模板、四种计算变换和六套设备轴配置。

[图片凭据](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json)逐项记录来源运行、摘要和选择，也明确标注复用的早期诊断观察。[视觉评审](ui-visual-review.md)记录实际范围与限制。原生构建、隔离冒烟和预览发布依赖其固定提交的普通完整比较。

## 依赖与验证范围

包含 CodeQL、Electron、Mermaid 更新。Playwright 1.65.0 在 Firefox axe 分析时重复崩溃，因此保留 1.64.1 与现有无障碍检查，见 [PR #60](https://github.com/SeaLoong/Sensa/pull/60)。

自动套件使用回环服务、临时配置和模拟传输。浏览器／WebGL、模拟线包或构建成功不代表真实设备、Unity／VRChat 客户端、HMD 或机械停止已经验收。

[开发与检查](development.md) · [浏览器验证](e2e.md) · [Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml) · [CodeQL](https://github.com/SeaLoong/Sensa/actions/workflows/codeql.yml)
