# Serial and Bluetooth bridges

[简体中文](README.zh-CN.md) | **English**

Connect serial applications and Bluetooth devices to Sensa, or send Sensa's TCode output to a BLE device. WebSensa can use the same BLE output profiles directly from a supported browser.

| Profile | Input to Sensa | Output to device | Signal |
| --- | --- | --- | --- |
| `loob` | Yes | Yes | L0 position + arrival time |
| `thrust-sync` | Yes | Yes | L0 position + arrival time |
| `svakom-v1` | Yes | Yes | V0 vibration; Emma Neo, Phoenix Neo, Ella subset |
| `youou-vx001` | Yes | Yes | V0 vibration; VX001_ wand family |
| `lovense-single` | — | Yes | V0 vibration; single-actuator Lush, Hush, Ambi, Domi, Ferri, Diamo |

## Install

Use Python 3.10+ and a virtual environment. Windows BLE input uses Python 3.11+.

```sh
python -m venv .venv-protocol-bridge
python tools/protocol-bridge/bridge.py --help
python tools/protocol-bridge/bridge.py --check
```

Activate the environment, then install the requirements for your connection:

| Connection | Requirements file |
| --- | --- |
| Serial/COM | `requirements-serial.txt` |
| BLE output | `requirements-ble-output.txt` |
| BLE input on Linux/macOS | `requirements-ble-input.txt` |
| BLE input on Windows | `requirements-ble-input-windows.txt` |

```sh
python -m pip install -r tools/protocol-bridge/requirements-ble-output.txt
```

Run commands from the repository root; release archives include the same `tools/protocol-bridge` directory. `--check` lists installed backends without opening a device.

## Serial application → Sensa

Create a **TCode TCP input** in Sensa on `127.0.0.1:12401`. On Linux/macOS, create a raw pseudo-terminal:

```sh
python tools/protocol-bridge/bridge.py pty-input --sensa tcp://127.0.0.1:12401 --link ./sensa-serial
```

Open the printed path or the new link in your serial application. The bridge accepts CR, LF and CRLF endings. Browser serial pickers may require an OS-enumerated virtual serial device instead of a PTY.

On Windows, create a virtual COM pair with your preferred driver. Open one end in the application and the other in the bridge:

```sh
python tools/protocol-bridge/bridge.py serial-ports
python tools/protocol-bridge/bridge.py serial-input --port COM12 --baud 115200 --sensa tcp://127.0.0.1:12401
```

## Website or application → BLE input → Sensa

Choose an input-capable profile from the table and connect the upstream application to its advertised device:

```sh
python tools/protocol-bridge/bridge.py ble-input --protocol loob --sensa tcp://127.0.0.1:12401
python tools/protocol-bridge/bridge.py ble-input --protocol youou-vx001 --sensa tcp://127.0.0.1:12401
```

LOOB advertises `LOOB Sensa`, Svakom V1 `Emma NEO`, and Youou `VX001_Sensa`. On Linux, `--adapter /org/bluez/hci1` selects an adapter. BLE input needs an adapter with peripheral/advertising support. An ordinary browser supplies BLE central output, so use this bridge when you need a virtual peripheral.

Windows advertising uses the system Bluetooth name. Configure a matching name in Windows for name-filtered clients and add the corresponding flag: `--confirm-windows-loob-name`, `--confirm-windows-svakom-name` or `--confirm-windows-youou-name`. Thrust Sync uses its service UUID.

For position profiles, configure the Sensa input's L0 feature as **Linear**. For vibration profiles, use **Scalar / Vibrate**, channel and direct target **V0**. Select Protocol or Combined mode in Sensa, connect your destinations, then enable input. A source interval is limited to 60000 ms.

Svakom input exposes the writable FFE1 command subset. Lovense BLE model identification and battery replies are not emulated; use Sensa's Lovense HTTP or Buttplug input for those application workflows.

## Sensa → BLE device

Create a **TCode TCP output** targeting `127.0.0.1:12411`. Select the device's actual OS address/identifier:

```sh
python tools/protocol-bridge/bridge.py ble-output --protocol loob --device DEVICE_ID --listen tcp://127.0.0.1:12411
python tools/protocol-bridge/bridge.py ble-output --protocol lovense-single --device DEVICE_ID --listen tcp://127.0.0.1:12411
python tools/protocol-bridge/bridge.py ble-output --protocol youou-vx001 --device DEVICE_ID --listen tcp://127.0.0.1:12411
```

For LOOB/Thrust Sync, enable **L0 only** with **Interval** slope. For vibration, enable **V0 only**, choose **NoSlope**, and set the axis command/ramp modes to **None**. Use an untimed intensity binding; position durations and speed modifiers belong to the position profiles. Lovense output discovers one of the supported official GATT write services automatically.

Run separate bridge instances on different listen ports for different devices. Each connection owns its write queue and Youou packet counter. A stop clears queued moves, finishes the in-flight write and sends zero vibration before disconnecting. LOOB/Thrust Sync disconnect after clearing the queue; their last finite move may continue. Position zero is a position command. In WebSensa, zero-vibration stop retains a connection, while stopping these position profiles requires reconnection.

`--idle 2` sets the deadline for a fresh complete command; finite position moves add their arrival interval. Regular sending keeps a steady intensity. `--timeout` bounds transport operations. Interactive input sessions offer `disable`, `enable`, `disconnect`, `unpair` and `quit`; enable starts with fresh commands. `--allow-lan` exposes an output listener beyond loopback when needed.

## Wire formats

| Profile | GATT service / write characteristic | Packet |
| --- | --- | --- |
| LOOB | `b75c49d2-04a3-4071-a0b5-35853eb08307` / `ba5c49d2-04a3-4071-a0b5-35853eb08307` | Big-endian uint16 position 1–1000 + uint16 duration |
| Thrust Sync | `FFE0` / `FFE1` | Position 0–180 + big-endian uint16 duration |
| Svakom V1 | `FFE0` / `FFE1` | `55 04 03 00`, enabled byte, speed 0–19 |
| Youou VX001 | `FFF0` / `FFF6` | 17 bytes: `AA 55`, wrapping packet id, `02 03 01`, speed, enabled, XOR of bytes 0–7, `FF`, seven zeros |
| Lovense single | Official FFF0/FFF2, Nordic UART, Lush/Hush/etc. GATT families | ASCII `Vibrate:0;` through `Vibrate:20;` |

Short UUIDs use the Bluetooth base `0000xxxx-0000-1000-8000-00805f9b34fb`. Youou uses the upstream encoder's 0–247 continuous-speed range; higher values are described upstream as pattern selection even though the general device configuration permits 255. Sensa maps intensity 0–1 across 0–247. The raw position encoders allow 65535 ms; input forwarding to Sensa uses its 60000 ms limit.

## Sources and verification

LOOB and Thrust Sync follow [FapTap's connector](https://faptap.net/assets/index.de793511.js). Other codecs follow Buttplug commit `179b0d9306f519912c10bdddd111686622b7f63a`:

- [Svakom V1 encoder](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server/src/device/protocol_impl/svakom/svakom_v1.rs) and [model configuration](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server_device_config/device-config/protocols/svakom-v1.yml).
- [Youou encoder](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server/src/device/protocol_impl/youou.rs) and [GATT configuration](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server_device_config/device-config/protocols/youou.yml).
- [Lovense commands](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server/src/device/protocol_impl/lovense/mod.rs), [single actuator](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server/src/device/protocol_impl/lovense/lovense_single_actuator.rs) and [models/GATT](https://github.com/buttplugio/buttplug/blob/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server_device_config/device-config/protocols/lovense.yml).

Tests cover exact packets, ranges, checksums, per-device sequences, concurrent writes, stop ordering, real isolated PTYs/TCP and mock BLE/WinRT. Browser mock-GATT E2E runs in Actions. These checks verify software behavior; device/adapter support is established with physical hardware. Dependency licenses: pyserial BSD-3-Clause; Bleak, Bless and PyWinRT MIT.
