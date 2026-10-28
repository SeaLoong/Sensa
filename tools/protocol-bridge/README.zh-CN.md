# 串口与蓝牙协议桥

**简体中文** | [English](README.md)

这些可选工具连接 Sensa 的网络 TCode 输入或输出，支持虚拟串口、已有 Windows COM 对、LOOB 与 Erojoy Thrust Sync 的 BLE 协议。工具按需导入 Python 依赖；不会启动 Sensa、安装驱动、修改系统蓝牙名称或自动选择真实设备。先在 Sensa 中保存配置，连接所需输出，检查限位，再单独启用输入。

## 检查与依赖

从仓库根目录运行，或在发布包中使用对应的 `tools/protocol-bridge` 路径。Python 3.10+；原生 Windows BLE 输入要求 Python 3.11+，使用单独的 PyWinRT 4 依赖。

```sh
python tools/protocol-bridge/bridge.py --help
python tools/protocol-bridge/bridge.py --check
python -m venv .venv-protocol-bridge
```

在虚拟环境激活后，只安装所需的依赖文件：

```sh
python -m pip install -r tools/protocol-bridge/requirements-serial.txt
python -m pip install -r tools/protocol-bridge/requirements-ble-output.txt
python -m pip install -r tools/protocol-bridge/requirements-ble-input.txt
```

Windows BLE 输入改用 `requirements-ble-input-windows.txt`。Bless 0.3.0 在 Windows/Python 3.12+ 的依赖约束存在冲突，因此工具使用独立的原生 WinRT 后端；不要把非 Windows 的 Bless 依赖文件当成 Windows 输入后端。`--check` 仅报告平台及依赖可发现性，不探测硬件，也不代表驱动或权限正常。

## 串口输入 → Sensa

先在 Sensa 启用网络 TCode **TCP 输入**，监听本机 `12401`；工具不替用户打开输入许可。

Linux/macOS 为本地串口软件创建原始 PTY：

```sh
python tools/protocol-bridge/bridge.py pty-input --sensa tcp://127.0.0.1:12401
```

程序打印本次虚拟串口路径，原始模式保持字节和换行，不做本地回显；可用 `--link ./sensa-serial` 创建便于选择的符号链接。工具不会覆盖已有文件或链接，退出时只清理自己创建的链接。某些浏览器的 Web Serial 选择器**不会枚举 PTY**；这时请使用 Sensa 的 Buttplug/Intiface 输入，或已安装且能被浏览器枚举的虚拟串口设备。不能把创建 PTY 当作网站兼容验收。

Windows 需要用户预先建立的虚拟 COM 对，浏览器打开一端，桥打开另一端：

```sh
python tools/protocol-bridge/bridge.py serial-ports
python tools/protocol-bridge/bridge.py serial-input --port COM12 --baud 115200 --sensa tcp://127.0.0.1:12401
```

`COM12` 是示例，必须换成实际桥端；不要同时让 Sensa、浏览器与工具争用同一端。`serial-ports` 只枚举，不打开串口，不能证明两端配对关系或驱动签名。

如使用 [com0com 官方项目](https://sourceforge.net/projects/com0com/)，手动从维护者发布渠道选择符合当前 Windows 的已签名构建，安装前在文件属性检查数字签名，再使用其配置工具创建端口对、设置 Windows 可识别的 COM 名。没有适用的有效签名版本时，选择另一个具有受信任签名的虚拟串口产品；不要为本工具关闭驱动签名验证或开启测试模式。可在管理员 PowerShell 中只读核对已安装驱动：

```powershell
Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName -match 'com0com' } | Select-Object DeviceName, DriverProviderName, IsSigned, Signer
```

工具不会下载或安装驱动。浏览器原生 OSR/Erojoy X3 入口发送的按行 TCode 会经此桥进入 Sensa。

## BLE 输入：网站 → 虚拟设备 → Sensa

Linux/macOS 安装 Bless 输入依赖；Windows 安装原生 WinRT 输入依赖。适配器必须支持外围设备角色和广播，操作系统必须授予相应权限。

```sh
python tools/protocol-bridge/bridge.py ble-input --protocol loob --sensa tcp://127.0.0.1:12401
python tools/protocol-bridge/bridge.py ble-input --protocol thrust-sync --sensa tcp://127.0.0.1:12401
```

在网站选择相应连接器，允许蓝牙后选择虚拟设备。LOOB 广播名为 `LOOB Sensa`，Thrust Sync 按服务 UUID 发现。Linux 可通过 `--adapter /org/bluez/hci1` 明确选择另一个适配器。Windows 原生 GATT 使用系统蓝牙友好名，无法为每个服务单独设置名字；LOOB 的网站筛选要求 `LOOB` 前缀，默认会拒绝运行。只有用户已自行配置实际广播名后，才使用 `--confirm-windows-loob-name`；工具不会修改系统名称。Thrust Sync 按服务筛选，无此前缀限制。

| 协议 | 服务 / 特征 | 编码 |
| --- | --- | --- |
| LOOB | `b75c49d2-04a3-4071-a0b5-35853eb08307` / `ba5c49d2-04a3-4071-a0b5-35853eb08307` | 4 字节，大端 uint16 位置 1–1000 + uint16 毫秒 |
| Thrust Sync | `0000ffe0-0000-1000-8000-00805f9b34fb` / `0000ffe1-0000-1000-8000-00805f9b34fb` | 3 字节，位置 0–180 + 大端 uint16 毫秒 |

原始帧严格核对长度和范围，再转换为 `L0xxxI毫秒`。BLE 收到的 1.0 会转换为 TCode 三位量程的上限 999。错误帧、队列溢出或下游失败停止本次会话。Windows 会监听原生 GATT Session 关闭；Bless 的这些仅写协议没有可靠的订阅断线事件，所以 Linux/macOS 由 `--idle` 看门狗在无新命令时发送 `DSTOP`，默认在最近命令的有限 I 时长结束后再宽限两秒。普通网页不能作为 BLE 外围设备；同一适配器的浏览器自连接、双角色并发及不同平台的广播行为都需实机确认，必要时使用第二个适配器或外部外围设备。

BLE 输入转发到 Sensa 时，每条 I 时长须遵守 TCode 输入的 **60000 ms** 上限。原始 BLE 字段虽然能编码 60001～65535 ms，但 Sensa 会拒绝这些命令并关闭 TCP 会话；这部分原始字段范围不能通过该输入路径透传。

## BLE 输出：Sensa → 真实 BLE 设备

在 Sensa 添加 **TCode TCP 输出**，目标为本机 `12411`；只启用 L0，斜率选择 Interval。先明确获取实际设备的系统标识，再显式连接：

```sh
python tools/protocol-bridge/bridge.py ble-output --protocol loob --device DEVICE_ID --listen tcp://127.0.0.1:12411
```

`thrust-sync` 同样可用。工具使用 Bleak central 写入上述真实 GATT 特征，不自动扫描或连接任意设备。只接受一个 L0 位置及可选 I 时长；不支持速度 S、缓动后缀、多轴或未知命令，遇到这些会结束会话，而不是悄悄丢弃。无 I 时默认 100 ms，时长不得超过 65535 ms。默认仅监听回环；确需局域网访问可显式使用 `--allow-lan` 并自行限制网络访问。

这两个公开协议**没有已验证的紧急停止指令**。收到 `DSTOP`、上游断线、超时或写入失败时，工具清空旧命令并断开 BLE；不会把位置 0 当作停止，也不会重连后重放。设备可能继续完成最后已接收的有限时长动作，断开不等于硬件急停。需要硬件立即停止保障的场景，应使用具有已验证停止能力的设备协议。

## 生命周期与验证范围

输入桥的交互终端接受 `disable`、`enable`、`disconnect`、`unpair`、`quit`；禁用先清空待发代次并发送 `DSTOP`，启用只接受新命令。`unpair` 结束本工具会话并撤销广播，操作系统保留的蓝牙配对密钥需在系统设置中另行移除。Ctrl+C 同样清理连接。网络/设备失败不会自动重连或恢复旧目标。所有传输操作都有超时，队列最多 64 帧；部分 TCP 字节不能代替完整新命令来续期。

仓库隔离测试使用真实本地 PTY、模拟串口、假 BLE、假 WinRT 投影与有界故障，覆盖编码、顺序、禁用、超时、取消和资源清理。依赖在 Linux 临时虚拟环境中安装并导入检查；没有连接真实设备、运行 Sensa 完整进程或进行浏览器/硬件验收。

依赖许可证：pyserial BSD-3-Clause；Bleak、Bless、PyWinRT MIT。上游接口资料：[Bless](https://github.com/kevincar/bless)、[Bleak](https://github.com/hbldh/bleak)、[Windows GATT](https://learn.microsoft.com/en-us/windows/apps/develop/devices-sensors/gatt-server)、[PyWinRT](https://github.com/pywinrt/pywinrt)。协议依据为 [FapTap 公开连接器](https://faptap.net/assets/index.de793511.js) 的 LOOB / Thrust Sync 实现，并不表示厂商承诺所有型号或固件兼容。
