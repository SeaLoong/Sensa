# 功能参考

**简体中文** | [English](features.en.md)

让 VRChat／SPS、funscript 或手动控制驱动 OSR 等互动设备。从使用向导开始，用预设准备常见配置，再按需添加计算、录制或更多输出。

[连接第一个设备](quick-start.md) · [设备与连接](devices.md) · [浏览指南](start.md)

## 使用向导与预设

**开始设置向导**会打开**选择场景 → 连接设备 → 准备输入 → 检查并完成**四个步骤。保存进度后可以通过**继续设置**返回，或通过**操作引导**重新打开。点击**完成设置**后，准备好再打开**输入启用**。

**场景预设**准备常见的 VRChat／SPS 映射草稿与 TCode 轴配置。映射草稿检查并**保存更改**后再使用。设备动作预设需要检查并保存新轴配置，再到输出上选择使用。量程应符合实际设备。[整套方案](signal-pipeline.md#保存与复用整套方案)可以复用包含输入与输出的已保存配置。

[首次使用步骤](quick-start.md) · [映射模板](presets.md) · [工作台地图](guide.md)

## 选择版本

- **WebSensa**：[在浏览器打开](https://sealoong.github.io/Sensa/websensa/)，用于手动控制、脚本和浏览器支持的设备连接。
- **Desktop**：下载并运行桌面窗口，使用完整本地服务。
- **CLI**：运行同一本地服务，通过浏览器操作，支持后台运行与独立实例。

Desktop／CLI 提供实时 VRChat OSC、UDP／TCP 监听、原生连接与文件系统录制。各版本共用工作台与信号引擎。[架构](architecture.md)

## 浏览器工作台

场景快捷入口为常见任务提供起点。**控制**管理设备连接与手动／脚本输入，**OSC**查看参数并映射到动作轴，**流程**编辑计算信号、汇总输出连接并复用已保存方案，**设置**管理轴配置与日志。可用连接取决于运行环境。[工作台地图](guide.md) · [浏览器连接](websensa.md)

## 桌面输入

手动控制提供十二轴，funscript 播放支持倍率、循环、A–B 与定位。OSC 提供预设与校准映射，协议输入接收其他播放器的控制，组合输入让多个不同来源共同参与。[选择输入](usage-scenarios.md) · [协议输入](protocol-inputs.md)

## 计算与映射

在**流程**创建计算信号，混合、缩放、平滑或门控读数，添加定时效果与空间计算；再到**OSC → 映射**或输出绑定中选用结果。计算与轴映射共用**保存更改**，输出绑定通过**保存输出**单独应用，选择计算来源时使用已保存的结果。[计算示例](computed-signals.md) · [预设](presets.md)

## 设备与输出传输

- **OSR／SR6／TCode**：按运行环境使用串口、UDP、TCP 或 WebSocket，配合轴量程与运动配置。
- **Intiface／Buttplug**：发现设备，将位置、振动、旋转与标量功能映射到来源。
- **Handy、Lovense、Autoblow、VacuGlide**：使用支持的设备 API 与脚本控制。
- **DG-LAB、OSC、MIDI CC、HTTP／WebSocket JSON 与 MQTT**：连接设备、Avatar 与应用。
- **录制**：保存 funscript 轨道、CSV 与 JSON Lines。

[选择设备连接](devices.md) · [输出设置与绑定参考](signal-pipeline.md#添加输出与绑定) · [蓝牙配置与串口桥](../tools/protocol-bridge/README.zh-CN.md) · [适配器目录](adapter-catalog.md)

## 共用连接与多实例

多个输出可以共用兼容连接。桌面标签页共用实时会话，独立命名实例分别保存配置。[路由说明](protocol-inputs.md) · [启动另一个实例](quick-start.md#运行多个实例)

## 录制与可复用方案

浏览器与桌面录制输出都能将选定信号保存为 funscript 轨道或诊断 CSV／JSON Lines。录制可用作脚本／回放来源，整套方案则导出已保存的映射、计算、轴配置与输出。关闭网页前，请下载浏览器录制。[录制与方案](signal-pipeline.md#录制与观察)

## 参数图解

移动目标，用三维视图与实时曲线理解接触和定位。可以导出模拟 funscript，或将读数发送到 WebSensa。程序也提供同一图解的离线副本。[打开图解](https://sealoong.github.io/Sensa/parameter-geometry.html)

## Unity 与定位

Avatar 作者可以添加 SPS 四点定位、Contact 直接定位（SDK Beta）、Shader 捕获与跟随参考平面。[选择定位方案](usage-scenarios.md) · [Unity 组件包](../unity/top.sealoong.sensa/README.zh-CN.md) · [单位与校准](positioning.md)

## 配置与开发

[下载 Sensa](https://github.com/SeaLoong/Sensa/releases/latest)。每种下载包都包含运行时，无需单独安装 Node.js。下面的 `version` 代表发布版本，按电脑选择 x64 或 ARM64。

| 格式 | 文件名示例 | 启动 |
| --- | --- | --- |
| Windows Desktop | `Sensa-version-win-x64-Desktop.zip` | 完整解压，运行 `Sensa.exe` |
| Linux Desktop | `Sensa-version-linux-x64-Desktop.tar.gz` | 解压，运行 `./Sensa` |
| macOS Desktop | `Sensa-version-osx-arm64-Desktop.zip` | 解压，打开 `Sensa.app` |
| Windows CLI 安装器 | `Sensa-version-win-x64-Setup.exe` | 安装后从开始菜单启动 |
| Windows CLI 单文件 | `Sensa-version-win-x64-SingleFile.exe` | 放到可写目录中运行 |
| Windows CLI 便携版 | `Sensa-version-win-x64.zip` | 完整解压，运行 `Sensa.exe` |
| Linux CLI | `Sensa-version-linux-x64.tar.gz` | 解压，运行 `./Sensa` |
| macOS CLI | `Sensa-version-osx-arm64.tar.gz` | 解压，运行 `./Sensa` |

Ubuntu 24.04 限制用户命名空间时，先在 Desktop 解压目录运行 `python3 ./sensa-linux-sandbox.py install`，再打开 Sensa。它通过 sudo 为这个程序路径注册 AppArmor 权限，保留 Chromium 沙箱。移动或删除目录前运行 `python3 ./sensa-linux-sandbox.py remove`，再为新位置注册。其他 Linux 环境与 CLI 不需要此步骤。

CLI 在程序旁使用 `config.json`，Desktop 在用户应用数据目录使用 `Sensa/config.json`。`--config <path>` 指定其他文件。[配置与 API](architecture.md) · [开发与发布](development.md) · [验证记录](e2e-status.md)
