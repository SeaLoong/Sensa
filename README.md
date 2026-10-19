# Sensa

**简体中文** | [English](README.en.md)

[![main CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml?query=branch%3Amain)

把手动、VRChat OSC 或 funscript 转换为 Intiface／TCode 设备目标。浏览器工作台分为**控制、OSC、设置**，详细配置按需展开。

[下载预览版](https://github.com/SeaLoong/Sensa/releases) · [快速开始](docs/quick-start.md) · [使用指南](docs/guide.md) · [三项映射预设](docs/presets.md)

## 启动

1. 下载对应系统／CPU 的桌面包，完整解压到可写目录。
2. Windows 运行 `Sensa.exe`；Linux／macOS 运行 `./Sensa`。无需另装 .NET。
3. 打开 **http://127.0.0.1:5086**，先保持输入关闭。
4. 配置输出和轴限制，选择并应用输入模式，核对预览后启用输入。

| 系统 | 包名中的平台 |
| --- | --- |
| Windows Intel／AMD、ARM | `win-x64.zip`、`win-arm64.zip` |
| Linux Intel／AMD、ARM64 | `linux-x64.tar.gz`、`linux-arm64.tar.gz` |
| macOS Intel、Apple 芯片 | `osx-x64.tar.gz`、`osx-arm64.tar.gz` |

macOS 预览是未签名公证的命令行程序。以 `top.sealoong.sensa-` 开头的 ZIP 是另行安装的 Unity 资产。

## 当前能力

- 手动十二轴、funscript 播放／循环／定位、L0 录制导出。
- OSC 参数发现、前缀隐藏 FT、三项精简预设、自定义映射、OSCQuery 与 Hub。
- 多输出、独立轴配置、目标预览、显式输入许可和急停。
- 简体中文／English 与窄屏布局。
- OGB／SPS 自动信号识别、固定四锚点根坐标、原生 Shader 根点捕获与 PB 标量。

目标预览不是设备位置回读。已有 OGB／SPS 参数优先使用自动深度或振动预设；必要时显式启用向 VRChat 发送 `OGB_ENABLED` 的心跳，其状态不代表 UDP 接收确认。[兼容与实际路径](docs/ogb-compatibility.md)

需要根点时，Unity 作者可为选定 Socket／Plug 生成 Avatar 根局部固定四锚点，或生成原生 Shader 捕获器，通过明确屏幕区域的 Python 桥发布根坐标。两者都在实验诊断中两点校准后生成映射，仍需显式实验许可；它们不测世界位置、完整姿态或 SPS 曲线表面。Sensa SPS 只接受无版本的 P0–P3／Sample；Shader 使用有序五字段并隔离诊断数据。[参数与半径字典](docs/osc-parameters.md)。[定位方案](docs/positioning.md) · [Shader 捕获](unity/top.sealoong.sensa/GPU-TRACKING.md)

## 文档

[完整功能与源码索引](docs/features.md) · [架构](docs/architecture.md) · [开发与 CI](docs/development.md) · [截图审阅](docs/e2e.md) · [双语支持](docs/languages.md)

[Unity 安装](unity/top.sealoong.sensa/README.md) · [实验流程](docs/lab-workflow.md) · [Avatar 工具](tools/unity-avatar-lab/README.md) · [世界工具](tools/unity-world-lab/README.md)

产品预览要求同一候选通过必要检查、全量 E2E 比较和平台验证；main 会接续未完成验证。只保留最近十个已发布预发布，稳定版、草稿及 Git tags 保留。预览功能仍可能调整；客户端、Unity 和硬件验收以实际报告为准。
