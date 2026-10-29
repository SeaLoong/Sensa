# 首次使用

**简体中文** | [English](quick-start.en.md)

想直接在浏览器调节设备或播放脚本，可以[打开 WebSensa](https://sealoong.github.io/Sensa/websensa/)。需要 OSC、应用转发、录制和完整设备连接时，按下面的步骤启动桌面工作台。两个版本都围绕来源、连接和结果组织操作。

## 1. 启动

[下载](https://github.com/SeaLoong/Sensa/releases/latest)最新正式版。[发布历史](https://github.com/SeaLoong/Sensa/releases)还列出开发预览与旧版本。所有桌面格式均自带 .NET 运行时。

| 系统与方式 | 架构 | 文件名示例 | 怎样启动 |
| --- | --- | --- | --- |
| Windows 安装版（推荐） | x64／ARM64 | `Sensa-version-win-x64-Setup.exe` | 安装后从开始菜单打开 |
| Windows 单文件 | x64／ARM64 | `Sensa-version-win-x64-SingleFile.exe` | 将 EXE 放到可写目录后运行 |
| Windows 便携版 | x64／ARM64 | `Sensa-version-win-x64.zip` | 完整解压 ZIP，再运行 `Sensa.exe` |
| Linux 便携版 | x64／ARM64 | `Sensa-version-linux-x64.tar.gz` | 解压后运行 `./Sensa` |
| macOS 便携版 | x64／ARM64 | `Sensa-version-osx-arm64.tar.gz` | 解压后运行 `./Sensa` |

Intel／AMD 电脑通常使用 **x64**，Apple Silicon 和 Windows ARM 使用 **ARM64**。开发预览文件名还包含构建编号与提交摘要。

运行 Sensa 后，工作台会自动在浏览器打开。常用地址为 **http://127.0.0.1:5086**；端口调整时，以控制台显示的实际地址为准。首次启动输入处于关闭状态，可以先准备连接。

Windows 安装目录默认为 `%LOCALAPPDATA%\Programs\Sensa`。更新与卸载保留用户配置和录制。便携包与安装版附带文档及桥工具；单文件内置工作台与[参数图解](http://127.0.0.1:5086/docs/parameter-geometry.html)。

![Sensa 实际运行界面](screenshots/desktop/control-page.png)

[窄屏界面](screenshots/mobile/control-page.png) · [更多运行画面](screenshots.md)

## 2. 配置输出

可以先把滑条录成一条轨道：

1. 在**流程**选择**添加输出 → 录制**，保留 **Funscript** 格式。
2. 展开**输入到输出绑定**，来源选**手动 → L0**，轨道名称填 `L0`，输入与输出范围均为 **0–1**。
3. 保存并启用录制输出。

也可以直接连接目标：

| 目标 | 连接方式 |
| --- | --- |
| TCode／OSR | 115200/8N1 串口，或 UDP／TCP 地址；选择轴配置 |
| Intiface | 启动 Central，填写地址，扫描并选择设备 |
| OSC／VRChat | 接收 IP／端口、参数路径与 Float／Int／Bool 类型 |
| DG-LAB | DG-LAB 4 APP 配对、设备与通道 |
| MIDI／网络服务 | MIDI 端口、HTTP／WebSocket 地址，或 MQTT 服务与主题 |

绑定把一个来源连到目标。输入范围说明读数的起止值，输出范围决定目标的响应范围。[完整输出配置](signal-pipeline.md#添加输出与绑定)

## 3. 启用输入并检查结果

在**控制**选择**手动**，应用后启用输入。调整 L0 并点击**发送一次**，或开启**连续发送**跟随滑条变化。每条绑定会显示原始值、转换值与最近目标。

关闭输入即可完成录制。下载 funscript，或载入播放器，选择**脚本**、启用输入，再点击**播放**。

使用动作设备时，在轴配置中设置方向与行程，先试一个小幅动作。顶栏的**紧急停止**会停止全部输出并保持，解除后再启用输入。保存配置、切换方式或更换脚本会关闭输入，准备好新设置后重新启用。

## 4. 选择来源并添加计算

| 来源 | 下一步 |
| --- | --- |
| OSC 参数 | 选择 OSC 或组合，查看发送来源并保存映射 |
| Funscript | 载入文件、选择脚本，再设置速度、循环与位置 |
| 网站／播放器 | 添加[协议输入](protocol-inputs.md)、连接客户端，选择协议或组合 |
| 多种来源 | 添加计算和绑定，再选择组合 |
| Avatar 位置 | 按[定位方案](usage-scenarios.md)完成设置，查看读数并校准范围 |

VRChat 通常向 Sensa 的 **9001** 端口发送 OSC，并在 **9000** 接收回写与心跳。[参数含义](osc-parameters.md)与[预设](presets.md)可以帮助选择读数。

在**流程**点击**添加计算信号**，设置加权、平滑、阈值或空间计算。结果保存一次，即可被多个输出选用。[计算示例](computed-signals.md)

## 5. 保存录制与整套方案

完成的录制可以下载、播放，或作为计算输入。Funscript 保存轨迹；JSON Lines／CSV 保存诊断样本。[录制与回放](signal-pipeline.md#录制与观察)

在**流程 → 保存与载入整套方案**中，将计算、映射、轴配置和输出一起导出。导入预览会先显示将要替换的内容。

配置默认保存为程序旁的 `config.json`。通过 `SENSA_CONFIG_PATH` 或 `--config <path>` 可以选择其他文件。[工作台指南](guide.md) · [语言设置](languages.md)

## 运行多个实例

再次打开同一配置，会复用已经运行的实例。已有工作台页面连接时沿用该页面；没有页面时打开工作台。

独立设置可以使用命名实例：

```sh
Sensa --instance studio
Sensa --instance portable
Sensa --new-instance
```

命名配置位于原配置旁的 `instances/<name>/config.json`，新实例从全新设置开始。`--new-instance` 自动生成唯一名称。管理 HTTP、OSC 接收和启动时的协议监听遇到端口占用，会选择可用端口；当前地址可在控制台与工作台查看。手动保存监听配置时，端口冲突仍会直接提示，便于选定客户端要连接的地址。

后台运行时，传入 `--open-browser false`。
