# 功能参考

**简体中文** | [English](features.en.md)

Sensa 将 VRChat／SPS／OGB、funscript 与手动输入连接到互动设备。首次连接请跟随[首次使用](quick-start.md)，本页供之后扩展功能时查阅。

## 选择版本

- **WebSensa：**[在浏览器打开](https://sealoong.github.io/Sensa/websensa/)，用于手动控制、脚本和浏览器支持的设备连接。
- **Desktop：**下载并运行桌面窗口，使用完整本地服务。
- **CLI：**运行同一本地服务，通过浏览器操作，支持后台运行与独立实例。

Desktop／CLI 提供实时 VRChat OSC、UDP／TCP 监听、原生连接与文件系统录制。各版本共用工作台与信号引擎。[架构](architecture.md)

## 浏览器工作台

**控制**连接输出并运行手动／脚本输入，**OSC**查看参数与映射，**流程**添加计算、绑定与方案，**设置**管理轴配置与日志。可用连接取决于运行环境。[工作台地图](guide.md) · [浏览器连接](websensa.md)

## 桌面输入

手动控制提供十二轴，funscript 播放支持倍率、循环、A–B 与定位。OSC 提供预设与校准映射，协议输入接收其他播放器的控制，组合输入让多个不同来源共同参与。[选择输入](usage-scenarios.md) · [协议输入](protocol-inputs.md)

## 计算与映射

混合、缩放、平滑或门控读数，添加定时效果与空间计算。同一结果可以送到多个输出。[计算示例](computed-signals.md) · [预设](presets.md)

## 设备与输出传输

- **OSR／SR6／TCode：**按运行环境使用串口、UDP、TCP 或 WebSocket，配合轴量程与运动配置。
- **Intiface／Buttplug：**发现设备，将位置、振动、旋转与标量功能映射到来源。
- **Handy、Lovense、Autoblow、VacuGlide：**使用支持的设备 API 与脚本控制。
- **DG-LAB、OSC、MIDI CC、HTTP／WebSocket JSON 与 MQTT：**连接设备、Avatar 与应用。
- **录制：**保存 funscript 轨道、CSV 与 JSON Lines。

[输出设置与绑定参考](signal-pipeline.md#添加输出与绑定) · [蓝牙配置与串口桥](../tools/protocol-bridge/README.zh-CN.md) · [适配器目录](adapter-catalog.md)

## 共用连接与多实例

多个输出可以共用兼容连接。桌面标签页共用实时会话，独立命名实例分别保存配置。[路由说明](protocol-inputs.md) · [启动另一个实例](quick-start.md#运行多个实例)

## 录制与可复用方案

浏览器与桌面录制输出都能将选定信号保存为 funscript 轨道或诊断 CSV／JSON Lines。录制可用作脚本／回放来源，整套方案则导出映射、计算、轴配置与输出。关闭网页前，请下载浏览器录制。[录制与方案](signal-pipeline.md#录制与观察)

## 参数图解

移动目标，用三维视图与实时曲线理解接触和定位。可以导出模拟 funscript，或将读数发送到 WebSensa。程序也提供同一图解的离线副本。[打开图解](https://sealoong.github.io/Sensa/parameter-geometry.html)

## Unity 与定位

Avatar 作者可以添加 SPS 四点定位、Contact 直接定位（SDK Beta）、Shader 捕获与跟随参考平面。[选择定位方案](usage-scenarios.md) · [Unity 组件包](../unity/top.sealoong.sensa/README.zh-CN.md) · [单位与校准](positioning.md)

## 配置与开发

下载包包含运行时，无需单独安装 Node.js。下面的 `version` 代表发布版本，按电脑选择 x64 或 ARM64。

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
