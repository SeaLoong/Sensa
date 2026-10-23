# Sensa

**简体中文** · [English](README.md) · [文档站](https://sealoong.github.io/Sensa/) · [参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html) · [下载](https://github.com/SeaLoong/Sensa/releases)

[![CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)

**连接输入、计算可复用信号，再把结果送到设备或应用。** Sensa 在你的电脑上运行，通过浏览器工作台配置。输出包括 TCode 串口／UDP／TCP、Intiface／Buttplug、OSC 参数、DG-LAB、MIDI CC、网络服务和录制文件；VRChat 交互与 funscript 继续提供便捷的输入流程。

## 第一次使用：先检查方向和行程

1. 下载 Windows、Linux 或 macOS 的 x64／ARM64 压缩包并解压。
2. 运行 Sensa，打开 **http://127.0.0.1:5086**。新会话的输入和输出默认关闭。
3. 添加输出，核对目标，**启用该输出**后连接。Intiface 默认连接已有服务，需要先独立启动 Central。
4. 应用**手动**、启用输入，发送小目标检查方向／量程。关闭输入后准备 OSC 或 funscript；应用新方式，准备好再重新启用。

保留急停入口。解除急停、保存配置、更换实际模式或替换脚本后，准备好再启用输入。界面位置是**命令目标**，实际移动情况通过观察设备确认。

[首次使用](docs/quick-start.md) · [工作台指南](docs/guide.md) · [功能参考](docs/features.md)

## 我应该选择哪种接入方式？

| 路线 | 提供什么 | 主要限制 |
| --- | --- | --- |
| **已有 OGB / SPS** | 读取 Avatar 已有的接近、触摸和深度相关参数 | 使用 Avatar 现有参数，先确认实际发送的是 SPS1 还是 SPS2 信号 |
| **SPS 四点定位** | 在自己的 Avatar 上添加测量组件，计算 SPS Socket／Plug 根点相对 Avatar 的三维位置 | 需要重新构建 Avatar；目标必须处于有效检测区域 |
| **[Contact 直接定位（SDK Beta）](docs/contact-sdk.md)** | 用一个专用 Receiver 读取所选根点的位置和相对速度 | 需要 Beta SDK 并重新构建自己的 Avatar；目标位于接收覆盖内 |
| **Shader 捕获** | 将根点位置画成黑白编码图块，由桌面程序读取 | PC 实验方案；需要图块完整可见，真实 VRChat／头显效果尚待验证 |

这里的“根点”是你在 Unity 中选定的起点，例如 SPS Socket／Plug、骨骼／空物体 Transform、Sensa 或原生 Contact 根点。“相对 Avatar 的位置”会随该点在 Avatar 内移动而变化，整个 Avatar 一起走动或转身时则保持不变。明确选择 Transform、Sensa 或原生 Contact 时，SPS 四点定位沿用同一根点协议。SPS 四点定位、Contact 直接定位和 Shader 都需要先观察坐标、校准范围，再启用实验空间输入；详细参数放在[定位说明](docs/positioning.md)中。Contact 直接定位使用 SDK 3.10.6-beta.2 和物理米单位，速度值可校准为动作强度；真实客户端／OSC Beta 链路尚待验收。

[方案选择](docs/usage-scenarios.md) · [OSC 字典](docs/osc-parameters.md) · [定位与限制](docs/positioning.md) · [OGB 兼容](docs/ogb-compatibility.md)

## 组合多个输入，再映射到动作

在“流程”中建立**计算信号**，可对多个参数做加权平均、差值、比例或向量长度计算，再将结果用于轴映射或输出绑定。输入也可以选用 SPS 四点定位、Contact 或 Shader 已解算的坐标，以及 Contact 的速度指标；同一中间结果可供多个目标使用。

例如，两个触碰强度按 1∶3 混合，或用两个根点的 XYZ 差计算间距。输出绑定复用计算结果，分别设置目标、类型、量程和更新频率。选择 OSC 参数输出可写入 Avatar 反馈参数，DG-LAB 输出可控制通道任务，录制输出可保存信号会话；组合输入允许手动、OSC、脚本与反馈来源共同参与。[输入、计算与输出](docs/signal-pipeline.md) · [计算与示例](docs/computed-signals.md)

## 不接设备也能理解参数

直接在浏览器打开[独立参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)。十一个模拟场景展示接收器、发送器、Socket／Plug 参考外形、固定锚点、Contact 直接报告和 Shader 编码；可旋转 3D、在指定平面拖点，也可使用精确滑条和 SVG 投影。

发行包包含 `docs/parameter-geometry.html` 及本地资源，可离线打开。页面自动识别浏览器语言并保存明确选择，也支持 [?lang=zh-CN](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN) 和 [?lang=en-US](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US)。

## Unity 与发布

安装 [Unity 组件包](unity/top.sealoong.sensa/README.zh-CN.md)，可为自己的 Avatar 添加根点测量或 Shader 捕获。使用已有 OGB 参数时，通过 OSC 设置接入。Avatar／World 实验工具使用自己的授权资源进行开发与验证。

[Releases](https://github.com/SeaLoong/Sensa/releases)中的正式版和自动预发布都包含六个桌面构建与 Unity ZIP。使用 VCC／ALCOM 安装时，**VPM 只提供已发布的 Unity 正式版**；预览版需要从 Releases 单独下载。请按实际安装版本阅读对应说明。

[文档站](https://sealoong.github.io/Sensa/)随 main 自动更新。[语言规则](docs/languages.md)

## 开发与发布

推送到 `main` 会执行单元测试与完整 E2E，通过后构建并发布 pre-release。正式版只需在 Actions 运行 [release.yml](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml)：它检查并构建最新 `main`，默认选择下一个补丁版本并自动生成发布说明，也可填写新的版本号。文档修改通过站点 E2E 后自动部署，无需另外操作 Pages。

发布要求当前提交的单元测试、普通 E2E 比较、原生冒烟和完整产物全部通过。检查使用隔离配置与模拟传输，真实客户端与设备另行验收。详见[开发与发布](docs/development.md)、[架构](docs/architecture.md)、[浏览器验证记录](docs/e2e-status.md)与[手动维护 E2E](docs/e2e.md)。

[MIT 许可](LICENSE) · [术语表](GLOSSARY.md)
