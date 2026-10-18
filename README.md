# Sensa

**简体中文** | [English](README.en.md)

[![main CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml?query=branch%3Amain)

把手动、VRChat OSC 或 funscript 转换为 Intiface／TCode 设备目标。浏览器工作台分为**控制、OSC、设置**，详细配置按需展开。

[下载预览版](https://github.com/SeaLoong/Sensa/releases) · [快速开始](docs/quick-start.md) · [使用指南](docs/guide.md) · [五项映射预设](docs/presets.md)

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
- OSC 参数发现、前缀隐藏 FT、五项精简预设、自定义映射、OSCQuery 与 Hub。
- 多输出、独立轴配置、目标预览、显式输入许可和急停。
- 简体中文／English 与窄屏布局。
- Unity QuickStart 接收链路、原生 PB 标量及高级实验工具。

目标预览不是设备位置回读。Contact 四／八点定位默认禁止驱动输出；它只能提供带假设的参考局部估计，不能证明 Sender 身份、同帧、世界位置或 GPU 表面。[定位原理与重做方向](docs/positioning.md)

已有原生 SPS 参数通常不需要 Sensa Unity 包；现代 Socket 径向估算与 Plug 近接的路径和局限见[预设](docs/presets.md)。首次测试可用 QuickStart World Receiver，不需要 SPS、相机或 Python。

## 文档

[完整功能与源码索引](docs/features.md) · [架构](docs/architecture.md) · [开发与 CI](docs/development.md) · [截图审阅](docs/e2e.md) · [双语支持](docs/languages.md)

[Unity 安装](unity/top.sealoong.sensa/README.md) · [实验流程](docs/lab-workflow.md) · [Avatar 工具](tools/unity-avatar-lab/README.md) · [世界工具](tools/unity-world-lab/README.md)

产品预览要求同一候选通过必要检查、全量 E2E 比较和平台验证；main 会接续未完成验证。只保留最近十个已发布预发布，稳定版、草稿及 Git tags 保留。预览功能仍可能调整；客户端、Unity 和硬件验收以实际报告为准。
