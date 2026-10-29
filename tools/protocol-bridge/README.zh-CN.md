# 串口与蓝牙桥

**简体中文** | [English](README.md)

把串口应用和蓝牙设备接入 Sensa，或把 Sensa 的 TCode 输出发送给 BLE 设备。WebSensa 也能在支持的浏览器中直接使用这些 BLE 输出协议。

| 协议 | 输入到 Sensa | 输出到设备 | 信号 |
| --- | --- | --- | --- |
| `loob` | 支持 | 支持 | L0 位置与到达时长 |
| `thrust-sync` | 支持 | 支持 | L0 位置与到达时长 |
| `svakom-v1` | 支持 | 支持 | V0 振动；Emma Neo、Phoenix Neo、Ella 子集 |
| `youou-vx001` | 支持 | 支持 | V0 振动；VX001_ 棒式设备系列 |
| `lovense-single` | — | 支持 | V0 振动；单执行器 Lush、Hush、Ambi、Domi、Ferri、Diamo |

## 安装

使用 Python 3.10+ 和虚拟环境；Windows BLE 输入使用 Python 3.11+。

```sh
python -m venv .venv-protocol-bridge
python tools/protocol-bridge/bridge.py --help
python tools/protocol-bridge/bridge.py --check
```

激活环境后，按连接方式安装依赖：

| 连接方式 | 依赖文件 |
| --- | --- |
| 串口／COM | `requirements-serial.txt` |
| BLE 输出 | `requirements-ble-output.txt` |
| Linux／macOS BLE 输入 | `requirements-ble-input.txt` |
| Windows BLE 输入 | `requirements-ble-input-windows.txt` |

```sh
python -m pip install -r tools/protocol-bridge/requirements-ble-output.txt
```

以下命令在仓库根目录执行，发布包也包含相同的 `tools/protocol-bridge` 目录。`--check` 显示已安装后端，不打开设备。

## 串口应用 → Sensa

先在 Sensa 添加监听 `127.0.0.1:12401` 的 **TCode TCP 输入**。Linux／macOS 可以创建原始伪终端：

```sh
python tools/protocol-bridge/bridge.py pty-input --sensa tcp://127.0.0.1:12401 --link ./sensa-serial
```

在串口应用中打开工具输出的路径或新链接。桥接接受 CR、LF 和 CRLF 行尾。浏览器的串口选择器可能需要系统可枚举的虚拟串口，而非 PTY。

Windows 使用你选择的驱动建立虚拟 COM 对，应用打开一端，桥打开另一端：

```sh
python tools/protocol-bridge/bridge.py serial-ports
python tools/protocol-bridge/bridge.py serial-input --port COM12 --baud 115200 --sensa tcp://127.0.0.1:12401
```

## 网站／应用 → BLE 输入 → Sensa

选择表中支持输入的协议，把上游应用连接到它广播的设备：

```sh
python tools/protocol-bridge/bridge.py ble-input --protocol loob --sensa tcp://127.0.0.1:12401
python tools/protocol-bridge/bridge.py ble-input --protocol youou-vx001 --sensa tcp://127.0.0.1:12401
```

LOOB 广播名为 `LOOB Sensa`，Svakom V1 为 `Emma NEO`，Youou 为 `VX001_Sensa`。Linux 可用 `--adapter /org/bluez/hci1` 选择适配器。BLE 输入需要支持外围设备和广播的适配器；普通网页提供的是 BLE central 输出，需要虚拟外设时使用本桥。

Windows 广播沿用系统蓝牙名称。为按名称筛选的客户端在 Windows 中配置匹配名称，再使用对应参数：`--confirm-windows-loob-name`、`--confirm-windows-svakom-name` 或 `--confirm-windows-youou-name`。Thrust Sync 按服务 UUID 识别。

位置协议的 Sensa 输入特征使用 **Linear / L0**；振动协议使用 **Scalar / Vibrate**，通道和直接目标均选 **V0**。在 Sensa 应用“协议”或“组合”方式，连接目标输出，再启用输入。单条到达时长上限为 60000 ms。

Svakom 输入提供可写 FFE1 命令子集。Lovense BLE 的型号查询和电量回复未模拟；这类应用流程可用 Sensa 的 Lovense HTTP 或 Buttplug 输入。

## Sensa → BLE 设备

在 Sensa 添加目标为 `127.0.0.1:12411` 的 **TCode TCP 输出**，填入设备真实的系统地址或标识：

```sh
python tools/protocol-bridge/bridge.py ble-output --protocol loob --device DEVICE_ID --listen tcp://127.0.0.1:12411
python tools/protocol-bridge/bridge.py ble-output --protocol lovense-single --device DEVICE_ID --listen tcp://127.0.0.1:12411
python tools/protocol-bridge/bridge.py ble-output --protocol youou-vx001 --device DEVICE_ID --listen tcp://127.0.0.1:12411
```

LOOB／Thrust Sync 只启用 **L0**，斜率选 **Interval**。振动协议只启用 **V0**，斜率选 **NoSlope**，轴的命令与缓变方式均选 **None**，使用无到达时长的强度绑定。位置时长和速度修饰属于位置协议。Lovense 输出会自动寻找受支持的官方 GATT 写服务。

不同设备各运行一份桥，使用不同监听端口。每个连接独立持有写队列和 Youou 包序号。停止时先清除待发目标，等待正在执行的写入，再发送零振动并断开。LOOB／Thrust Sync 清除队列后断开连接，最后一个有限动作可能继续执行；位置零仍是位置指令。WebSensa 的零振动停止会保留连接；这两种位置协议停止后需要重新连接。

`--idle 2` 设置收到新完整命令的期限，有限位置动作会额外加上到达时长。需要保持固定强度时使用定期发送。`--timeout` 设置传输操作期限。交互式输入会话支持 `disable`、`enable`、`disconnect`、`unpair` 和 `quit`；启用后从新命令开始。需要让其他主机连接输出桥时使用 `--allow-lan`。

## 编码格式

| 协议 | GATT 服务／写特征 | 数据包 |
| --- | --- | --- |
| LOOB | `b75c49d2-04a3-4071-a0b5-35853eb08307` / `ba5c49d2-04a3-4071-a0b5-35853eb08307` | 大端 uint16 位置 1～1000 + uint16 时长 |
| Thrust Sync | `FFE0` / `FFE1` | 位置 0～180 + 大端 uint16 时长 |
| Svakom V1 | `FFE0` / `FFE1` | `55 04 03 00`、开关字节、速度 0～19 |
| Youou VX001 | `FFF0` / `FFF6` | 17 字节：`AA 55`、循环包序号、`02 03 01`、速度、开关、前 8 字节异或、`FF`、7 个零 |
| Lovense 单振动 | 官方 FFF0/FFF2、Nordic UART、Lush/Hush 等 GATT 系列 | ASCII `Vibrate:0;` 至 `Vibrate:20;` |

短 UUID 使用蓝牙基础格式 `0000xxxx-0000-1000-8000-00805f9b34fb`。Youou 使用上游编码器说明的 0～247 连续速度范围；尽管通用设备配置允许到 255，上游说明更高数值会选择内置模式，因此本桥把 0～1 强度映射到 0～247。原始位置编码允许 65535 ms；转发到 Sensa 输入时使用其 60000 ms 上限。

## 来源与验证

LOOB 和 Thrust Sync 依据 [FapTap 连接器](https://faptap.net/assets/index.de793511.js)。其他编码依据 Buttplug 提交 `179b0d9306f519912c10bdddd111686622b7f63a`：

- [Svakom V1 编码](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server/src/device/protocol_impl/svakom/svakom_v1.rs)及[型号配置](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server_device_config/device-config/protocols/svakom-v1.yml)。
- [Youou 编码](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server/src/device/protocol_impl/youou.rs)及 [GATT 配置](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server_device_config/device-config/protocols/youou.yml)。
- [Lovense 命令](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server/src/device/protocol_impl/lovense/mod.rs)、[单执行器](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server/src/device/protocol_impl/lovense/lovense_single_actuator.rs)及[型号／GATT](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server_device_config/device-config/protocols/lovense.yml)。

测试覆盖准确数据包、量程、校验、独立序号、并发写入、停止顺序、隔离 PTY／TCP 和模拟 BLE／WinRT，浏览器模拟 GATT E2E 在 Actions 执行。这些检查验证软件行为，设备与适配器支持通过实机确认。依赖许可证：pyserial BSD-3-Clause；Bleak、Bless、PyWinRT MIT。
