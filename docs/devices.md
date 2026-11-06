# 设备与连接

**简体中文** | [English](devices.en.md)

Sensa 向设备发送动作、振动或其他控制。先选择设备实际支持的连接，再按[首次使用](quick-start.md)连接设备并选择输入。

**OSR／SR6 是设备，TCode 是它们使用的控制协议；Intiface Central 通过 Buttplug 发现并连接兼容设备；VRChat／SPS 提供输入数值。** 你可以将输入和输出连接成 **VRChat／SPS → Sensa → TCode → OSR** 这样的流程。

## OSR 与 TCode

OSR、SR6 或其他接受 TCode 的控制器使用 **TCode** 输出。根据固件与运行方式选择串口、UDP、TCP 或 WebSocket。WebSensa 支持浏览器串口与 TCode WebSocket，原生 UDP／TCP 使用 Desktop／CLI。

在输出上选择**轴配置**，动作前到**设置 → 轴配置**检查方向与行程。L0 通常是主动作轴，其他轴取决于控制器与设备。

[连接第一个输出](quick-start.md#2-配置输出) · [输出设置与绑定](signal-pipeline.md#添加输出与绑定)

## Intiface 设备

启动 **Intiface Central** 并扫描设备，在 Sensa 添加 **Intiface** 输出，填写 Central 的 WebSocket 地址。设置**匹配设备名称**，或选择已发现的**目标设备**，将控制限定到该设备。

Sensa 可发送的控制取决于设备声明的功能。位置、振动与旋转分别设置。首次手动测试时，类似 OSR 的位置功能使用 L0；使用默认振动来源的设备则在**更多动作轴**中调整 V0。WebSensa 还需在**输出动作轴**中勾选 V0。

将 L0 funscript 用于纯振动设备时，将输出的**振动来源**设为 **L0 · 深度转振动**。各个功能需要不同来源时，使用执行器映射。

[手动与脚本步骤](websensa.md#手动控制与脚本) · [功能路由参考](signal-pipeline.md#添加输出与绑定)

## 其他设备与应用

Desktop／CLI 还提供 Handy、Lovense、Autoblow、VacuGlide、DG-LAB 输出，以及 OSC、MIDI CC、HTTP／WebSocket JSON 与 MQTT。所选输出会显示连接设置及支持的绑定。

WebSensa 可使用支持的蓝牙协议配置、浏览器 MIDI、HTTP 与 WebSocket 输出。蓝牙连接同时需要匹配的协议配置与浏览器支持，不能连接任意蓝牙设备。

网站或播放器可以通过[协议输入](protocol-inputs.md)将指令发给桌面版 Sensa，例如 **网站 → Sensa 虚拟 Buttplug 设备 → TCode → OSR**。这与将 Intiface 用作输出是两条不同的连接。需要串口或蓝牙接口的兼容上游应用，使用[桥工具](../tools/protocol-bridge/README.zh-CN.md)。

## 选择桌面版或 WebSensa

| 连接或任务 | Desktop／CLI | WebSensa |
| --- | --- | --- |
| 手动控制与 funscript | 支持 | 支持 |
| 实时 VRChat／OSC 输入 | 支持 | 使用桌面版 |
| TCode 串口 | 原生串口组件 | 需要 Web Serial 的浏览器 |
| TCode WebSocket 与 Intiface | 支持 | 支持，受浏览器连接规则限制 |
| 原生 TCode UDP／TCP | 支持 | 使用桌面版 |
| 蓝牙 | 可选桥工具与匹配协议 | Web Bluetooth 与匹配协议 |
| MIDI 输出 | 原生 MIDI 组件 | 需要 Web MIDI 的浏览器 |
| 接收其他应用的设备指令 | 协议监听与桥工具 | 使用桌面版 |
| 录制输出 | 文件系统录制 | 关闭页面前下载文件 |

输出菜单会说明不可用项目的原因。浏览器串口、蓝牙与 MIDI 需要浏览器支持及设备授权，HTTP／WebSocket 地址需要符合浏览器的 HTTPS、本地网络与 CORS 要求。

[打开 WebSensa](https://sealoong.github.io/Sensa/websensa/) · [下载 Sensa](https://github.com/SeaLoong/Sensa/releases/latest) · [下载格式](features.md#配置与开发)

## 检查连接

保存输出设置，再**启用**设备卡片，检查连接状态。分别选择并应用输入，准备好后打开**输入启用**。设备已连接本身不会开始播放或发送手动动作。

没有动作时，检查地址或端口、设备选择、输出启用状态、来源轴与**输入启用**。[工作台地图](guide.md)帮助你找到这些控制，[连接参考](protocol-inputs.md)介绍端口与桥接。
