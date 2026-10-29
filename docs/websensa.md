# WebSensa

**简体中文** | [English](websensa.en.md)

[打开 WebSensa](https://sealoong.github.io/Sensa/websensa/)，直接在浏览器控制设备与应用。可以调节手动值、播放 funscript，或接入参数图解，再将结果同时送给多个输出。页面独立运行，“控制、输出、帮助”的布局沿用桌面工作台。

## 连接并发送

1. 在**输出**添加输出，选择连接方式。
2. 填写地址；使用串口、蓝牙或 MIDI 时，在浏览器选择目标设备。
3. 连接输出，选择目标轴或设备功能。
4. 在**控制**选择**手动**，启用输入后调节数值。

添加多个输出，即可同时发送同一控制值或脚本。每个输出分别保留目标与连接状态。Intiface 的多个设备共用同一地址连接，每台物理设备由一条输出管理。MIDI 可在同一端口使用不同通道／控制器。TCode 每个地址／串口由一条输出管理，一起发送选中轴；不同 WebSocket 路径可以共用一个服务端口。

## 手动控制

手动面板提供位置、旋转与强度轴。按输出需要选择 L0／L1／L2、R0／R1／R2 或 V0，再使用滑条调整。TCode 将归一化数值转换为轴指令；振动和 MIDI 使用对应协议范围。

**停止**结束发送。**紧急停止**还会保持输入关闭，解除后才能重新启用。输入关闭时仍可准备设备连接。

## 播放脚本

从电脑打开 `.funscript` 文件，时间轴会显示轨迹与播放位置。选择目标轴、**0.1× 至 4×** 播放速度，以及是否循环。

启用输入后点击**播放**。暂停保留光标位置，拖动或跳转可以选择时间点。载入脚本时读取其真实首目标，包括非零首值。点击**停止**结束播放。

需要简单录制时，启动手动 L0 录制、调整控制值，再结束并下载 funscript。文件可以在 WebSensa 或桌面版再次播放。

## 输出连接

| 方式 | 选择内容 | 发送内容 |
| --- | --- | --- |
| Intiface／Buttplug | Central WebSocket、设备与功能 | 目标功能支持的位置、振动或旋转指令 |
| TCode WebSocket | WebSocket 地址与轴 | TCode 文本帧 |
| TCode 串口 | 浏览器选择的串口与波特率 | 通过 Web Serial 发送 TCode 文本帧 |
| JSON WebSocket | WebSocket 地址 | 轴数值 JSON 消息 |
| HTTP JSON | HTTP 地址 | 接收服务使用的 JSON 请求 |
| MIDI CC | MIDI 输出、通道与控制器编号 | MIDI 控制值 |
| 蓝牙 | 受支持的设备配置与浏览器选择的设备 | 对应协议的 GATT 指令 |

蓝牙配置包括 **LOOB、Thrust Sync** 的 L0 位置，以及 **Svakom V1、Lovense 单振动、Youou VX001** 的 V0 强度。先选择匹配配置，再选择设备。[协议详情](protocol-inputs.md#蓝牙与虚拟串口的实际接线)

需要 UDP／TCP 套接字、OSC 接收、厂商云接口或完整录制与计算系统时，使用桌面版。[桌面连接](signal-pipeline.md#添加输出与绑定) · [设备桥工具](../tools/protocol-bridge/README.zh-CN.md)

自制 JSON WebSocket 接收端对每条命令返回 `{ "ok": true }`。HTTP／JSON 消息使用 Sensa 通道命令模型，可以直接连接已配置的 [JSON 协议输入](protocol-inputs.md#自制应用的-httpwebsocket-json)。

## 使用图解中的数值

打开[参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)，选择参数并发送到 WebSensa。在 WebSensa 选择图解来源、启用输入，再移动图解目标，即可将模拟深度或触碰读数送给选定输出。

## 浏览器支持与设置

| 功能 | 浏览器要求 |
| --- | --- |
| WebSocket／HTTP | 目标服务接受页面连接；HTTP 使用接收端的 CORS 策略 |
| 串口／蓝牙／MIDI | 浏览器提供对应 API，并获准访问选定设备 |
| HTTPS 网站连接本机服务 | 按浏览器的混合内容与本地网络权限规则，选择允许连接的地址 |
| 文件 | 从本机打开 funscript，导出文件下载到本机 |

连接选择器会显示当前可用能力。基于 Chromium 的桌面浏览器通常提供更完整的设备 API。语言偏好保留在浏览器中；设备凭据和连接设置用于当前会话。

[桌面版首次使用](quick-start.md) · [功能对比](features.md) · [信号流程](signal-pipeline.md)
