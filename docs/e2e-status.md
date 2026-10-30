# 验证记录

**简体中文** | [English](e2e-status.en.md)

下列结果属于明确列出的提交。更新源码的执行情况请查看[当前 CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)、[Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml) 和 [CodeQL](https://github.com/SeaLoong/Sensa/actions/workflows/codeql.yml)。[检查流程](development.md) · [浏览器测试工作流](e2e.md)

## 迁移候选与审图来源：197af206

源码 [`197af206`](https://github.com/SeaLoong/Sensa/commit/197af206bafda79b12160929251101aeca30214d) 的[候选运行 40996282389](https://github.com/SeaLoong/Sensa/actions/runs/40996282389/attempts/1)完整执行 **218/218** 项，独立 Firefox／WebKit 兼容检查 **8/8** 项；失败、跳过、重试及未执行均为 0。候选使用图片生成模式，记录采集行为，不充当普通截图比较凭据。

[逐图记录](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json)对应 164 张应用基线和 8 张站点原图：接受 20 张已打开的新应用图和 8 张代理审阅原图，142 张按相同摘要复用已有观察，2 张 OSC Hub 图保留旧图。审图识别出的 Hub 地址／发送状态显示回归没有被采纳。38 张文档图与所选基线字节一致，并记录真实采集源码和运行。

候选采集和审图分别说明图片来源与选择；当前固定提交的普通比较、原生 CLI／Electron、预览及 Pages 结果，以对应 [CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)与 [Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml)运行摘要和附件为准。以下表格保留各历史快照的实际验收范围。

## 已验收快照：b225ee3a

源码 [`b225ee3a7074a3a1e6a6c81d5e2bf8da824f10de`](https://github.com/SeaLoong/Sensa/commit/b225ee3a7074a3a1e6a6c81d5e2bf8da824f10de)，[CI #213](https://github.com/SeaLoong/Sensa/actions/runs/40783839713)，attempt 1：

| 检查 | 实际结果 |
| --- | --- |
| Web／.NET／Python | **252／1207／401 项通过** |
| 完整普通浏览器比较 | **176/176 通过**，每种视口 88 项，无重试、失败、跳过或未执行 |
| Pages | [20/20 通过并部署](https://github.com/SeaLoong/Sensa/actions/runs/40783839496)，98 条路由、154 项资源，55 个选定线上文件一致 |
| 原生包 | Windows、Linux、macOS，各 x64／ARM64 的隔离 TCode 冒烟通过 |
| Windows 格式 | 两架构的便携、单文件、安装后运行、重装／卸载与用户数据保留通过 |
| WinRT | 两架构导入 8 个命名空间并完成原生缓冲区字节往返，未操作适配器／GATT |
| 发布 | [预览 #213](https://github.com/SeaLoong/Sensa/releases/tag/preview-213-1-b225ee3a) 的 12 个下载文件与官方 SHA-256／SHA256SUMS 一致，54 份桥工具源副本和 169 份 Unity 文件与构建计划一致 |
| CodeQL | [四语言上传并处理](https://github.com/SeaLoong/Sensa/actions/runs/40783839791)，覆盖 249 个跟踪 C# 文件，两项质量指标为 100%，none-mode 为 0 |

该历史运行执行了全部选中用例，并在关闭基线更新时完成比较。对应的八张站点原图与八张图表原图已逐张打开审阅。部署图表另通过键盘滚动、源码回退与主动内容拒绝检查。

## 自动套件覆盖内容

| 套件 | 检查内容 |
| --- | --- |
| 单元／契约 | 注入时钟、真实回环 HTTP／WebSocket、隔离 PTY 与模拟串口／BLE／WinRT |
| 协议输入 | 规范协商、来源独立会话、原子通道批次、时长、任务生命周期和停止顺序 |
| 浏览器流程 | 配置、控制、录制、脚本、共享标签页与模拟设备传输 |
| 站点 | 双语导航、直接下载、离线资源、响应式布局、图库与图表行为 |
| 原生包冒烟 | 各平台实际二进制、临时配置与模拟网络目标 |
| 源码分析 | 真实应用／Unity 引用编译、源码覆盖与扫描证据 |

Contact 用例包括离开接触与活动冻结：截图使用固定 0.210 m/s，之后在 Sample 冻结时发送十个不同速度。设备与协议回归还覆盖 Intiface 大消息／分片、循环选择、非零脚本首值、有限任务时长和 Python 桥往返。

## 图片与审阅

[基线审阅记录](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json)保存当前 164 张应用基线与 8 张站点原图的来源、摘要、逐图观察及复用链，普通比较使用所选应用基线。38 张文档图片保留原始字节和采集清单。视觉变化经过候选采集与审阅后，再由对应源码的普通比较验证。[审阅流程](e2e.md)

## 对应环境检查

实际网站、厂商云、实体 OSR／BLE、Unity 客户端和 VRChat／HMD 在对应环境检查。最近记录的 Unity Editor 2022.3.22f1 尝试停在许可证验证，**实际执行零项测试**；17 项 Tracking Frame 源用例未运行，未产生 NUnit XML。编译和包结构结果保留各自的验证作用。

扫描执行和 SARIF 结果与 GitHub 告警处置分别记录。已验收 b225 快照完成四语言上传，但该轮未远端关闭告警或接受风险；当前面板计数和告警状态需要单独访问与复核。

## 更早的已验收快照

[`0bf1a8e9`](https://github.com/SeaLoong/Sensa/commit/0bf1a8e95ff5f191dec03603c28fb983e3b69ad1)通过 [144/144 普通浏览器用例](https://github.com/SeaLoong/Sensa/actions/runs/40768992258)、六平台检查和[预览 #210](https://github.com/SeaLoong/Sensa/releases/tag/preview-210-1-0bf1a8e9)发布；其 [Pages](https://github.com/SeaLoong/Sensa/actions/runs/40768992056)通过 14/14 站点检查。这些历史运行可用于比较后续变化。
