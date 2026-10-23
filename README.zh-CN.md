# Sensa

**简体中文** · [English](README.md) · [文档站](https://sealoong.github.io/Sensa/) · [信号流程](docs/signal-pipeline.md) · [参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html) · [下载](https://github.com/SeaLoong/Sensa/releases)

[![CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)
[![E2E](https://github.com/SeaLoong/Sensa/actions/workflows/e2e.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/e2e.yml)
[![Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml)
[![Release](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml)

**连接输入、计算可复用信号，再把结果送到设备或应用。** Sensa 在你的电脑上运行，通过浏览器工作台配置。输出包括 TCode 串口／UDP／TCP、Intiface／Buttplug、OSC 参数、DG-LAB、MIDI CC、网络服务和录制文件；VRChat 交互与 funscript 继续提供便捷的输入流程。

## 输入 → 计算转换 → 输出

| 步骤 | 可以使用什么 | 从哪里开始 |
| --- | --- | --- |
| **输入** | OSC 参数与定位、手动数值、funscript、设备反馈或录制回放 | 在“流程”选择来源；多种来源一起使用时，在“控制 → 组合”准备输入 |
| **计算转换** | 加权平均、差值、平滑、阈值、延迟、事件与生成节奏 | 新增计算信号，再保存计算与映射 |
| **输出** | 设备、应用参数、网络服务或 funscript 轨道 | 添加输出，通过“新增连接”选择来源、目标与量程 |

同一个结果可以送到多个输出，各自设置量程与发送节奏。例如，将两项触碰读数合成为强度，再分别驱动振动、Avatar 发光和轨道录制。输出绑定也可直接选择原始来源。[建立信号流程](docs/signal-pipeline.md) · [计算示例](docs/computed-signals.md)

工作台支持[保存整套方案](docs/signal-pipeline.md#保存与复用整套方案)，一起保留计算、轴配置和输出。浏览器支持时，同源标签页会自动[共用实时连接](docs/signal-pipeline.md#页面与连接共用)，各页保留自己的草稿。

## 选择结果送往哪里

| 输出 | 在该输出内部配置 |
| --- | --- |
| TCode／Intiface | 串口或网络连接、目标轴或设备功能，以及行程设置 |
| OSC 参数 | IP、端口、参数地址与 Float／Int／Bool；快捷选项可选择 VRChat OSC 接收端 |
| DG-LAB | DG-LAB 4 APP 配对、设备、通道、强度上限和波形播放方式 |
| MIDI CC | 系统 MIDI 端口、通道／控制器与 0～127 量程 |
| HTTP JSON／WebSocket JSON／MQTT | 服务或 Broker 地址，以及接收路径／主题 |
| 录制 | funscript 轨道名称和量程，或 JSON Lines／CSV 诊断数据 |

[输出设置与示例](docs/signal-pipeline.md#添加输出与绑定)

## 启动 Sensa，试一条流程

1. 下载 Windows、Linux 或 macOS 的 x64／ARM64 压缩包并解压。
2. 运行 Sensa，打开 **http://127.0.0.1:5086**。新会话的输入和输出默认关闭。
3. 打开“流程”，添加输出并选择来源和目标。可以先使用“录制”，把手动数值保存为可播放的 funscript 轨道。
4. 保存设置，**启用该输出**并连接。在“控制”应用手动、OSC、脚本或组合方式，准备好后启用输入。

使用动作设备时，先以小幅手动目标检查方向、行程和停止。Intiface 连接单独运行的 Central。保留急停入口；解除急停或保存新配置后，准备好再启用输入。

[首次使用](docs/quick-start.md) · [工作台指南](docs/guide.md) · [功能参考](docs/features.md)

## 录制与回放 funscript

在“流程”添加“录制”，保留默认 Funscript 格式，将来源连接到 `L0`、`R0` 等轨道。每个有效片段会生成可下载的文件。完成的轨道可载入 Sensa 脚本播放器，也可通过“录制回放”重新参与计算。JSON Lines／CSV 另外保留原始读数和有效状态，便于分析。[录制与播放步骤](docs/signal-pipeline.md#录制与观察)

## 我应该选择哪种接入方式？

| 路线 | 提供什么 | 主要限制 |
| --- | --- | --- |
| **已有 OGB / SPS** | 读取 Avatar 已有的接近、触摸和深度相关参数 | 使用 Avatar 现有参数，先确认实际发送的是 SPS1 还是 SPS2 信号 |
| **SPS 四点定位** | 在自己的 Avatar 上添加测量组件，计算 SPS Socket／Plug 根点相对 Avatar 的三维位置 | 需要重新构建 Avatar；目标必须处于有效检测区域 |
| **[Contact 直接定位（SDK Beta）](docs/contact-sdk.md)** | 用一个专用 Receiver 读取所选根点的位置和相对速度 | 需要 Beta SDK 并重新构建自己的 Avatar；目标位于接收覆盖内 |
| **Shader 捕获** | 通过黑白图块读取根点位置、X/Z 轴向与 Avatar 缩放 | PC 实验方案；留白和三副本帮助处理小幅位移与部分缺失，客户端效果待验收 |

这里的“根点”是你在 Unity 中选定的起点，例如 SPS Socket／Plug、骨骼／空物体 Transform、Sensa 或原生 Contact 根点。“相对 Avatar 的位置”会随该点在 Avatar 内移动而变化，整个 Avatar 一起走动或转身时则保持不变。明确选择 Transform、Sensa 或原生 Contact 时，SPS 四点定位沿用同一根点协议。SPS 四点定位、Contact 直接定位和 Shader 都需要先观察坐标、校准范围，再启用实验空间输入；详细参数放在[定位说明](docs/positioning.md)中。Contact 直接定位使用 SDK 3.10.6-beta.2 和物理米单位，速度值可校准为动作强度；真实客户端／OSC Beta 链路尚待验收。

[方案选择](docs/usage-scenarios.md) · [OSC 字典](docs/osc-parameters.md) · [定位与限制](docs/positioning.md) · [OGB 兼容](docs/ogb-compatibility.md)

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
