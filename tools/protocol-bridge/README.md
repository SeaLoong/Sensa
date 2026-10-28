# Serial and Bluetooth protocol bridges

[简体中文](README.zh-CN.md) | **English**

These optional tools connect Sensa's network TCode input or output to a Unix pseudo-terminal, an existing Windows COM pair, or the LOOB and Erojoy Thrust Sync BLE protocols. Dependencies load only when needed. The tools do not start Sensa, install drivers, change the system Bluetooth name, or select a real device automatically. Save the Sensa configuration, connect the intended outputs and check their limits, then enable input separately.

## Check and install

Run from the repository root, or use the corresponding `tools/protocol-bridge` location in a release package. Python 3.10+; native Windows BLE input has its own PyWinRT dependencies.

```sh
python tools/protocol-bridge/bridge.py --help
python tools/protocol-bridge/bridge.py --check
python -m venv .venv-protocol-bridge
```

Activate the environment and install only the requirements you need:

```sh
python -m pip install -r tools/protocol-bridge/requirements-serial.txt
python -m pip install -r tools/protocol-bridge/requirements-ble-output.txt
python -m pip install -r tools/protocol-bridge/requirements-ble-input.txt
```

For Windows BLE input, use `requirements-ble-input-windows.txt` instead. Bless 0.3.0 has conflicting Windows/Python 3.12+ dependency constraints, so this tool uses an independent native WinRT backend there. Installing the non-Windows Bless requirements does not provide Windows input support. `--check` reports platform and dependency discoverability without probing hardware; it does not establish driver or permission readiness.

## Serial input → Sensa

Configure Sensa's network TCode **TCP input** on local port `12401` first. The bridge does not grant Sensa input activation on your behalf.

Create a raw PTY for local serial applications on Linux/macOS:

```sh
python tools/protocol-bridge/bridge.py pty-input --sensa tcp://127.0.0.1:12401
```

The tool prints this session's serial endpoint. Raw mode preserves bytes and line endings without local echo. Optionally use `--link ./sensa-serial` for a convenient symlink. Existing files and links are never replaced; cleanup removes only the link created by this instance. Some browsers' Web Serial pickers **do not enumerate PTYs**. If the port is absent, use Sensa's Buttplug/Intiface input or a previously installed virtual serial device that the browser can enumerate. Creating a PTY does not establish website compatibility.

On Windows, create a virtual COM pair yourself: the browser opens one end, and this bridge opens the other.

```sh
python tools/protocol-bridge/bridge.py serial-ports
python tools/protocol-bridge/bridge.py serial-input --port COM12 --baud 115200 --sensa tcp://127.0.0.1:12401
```

Replace example `COM12` with the actual bridge-side port. Sensa, the browser and the bridge must not compete for the same end. `serial-ports` enumerates without opening ports; it does not prove pairing or driver signatures.

If using the [official com0com project](https://sourceforge.net/projects/com0com/), manually select a maintainer-distributed, signed build compatible with your Windows version. Inspect its digital signature before installation, then create a pair and Windows-recognized COM names with its setup utility. If no appropriately signed build is available, choose another virtual serial product with a trusted signature. Do not disable signature enforcement or enable test mode for this tool. This read-only administrator PowerShell command can inspect installed driver metadata:

```powershell
Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName -match 'com0com' } | Select-Object DeviceName, DriverProviderName, IsSigned, Signer
```

The tool never downloads or installs drivers. A website's native OSR/Erojoy X3 connector can send line-based TCode through a browser-enumerable pair to Sensa.

## BLE input: website → virtual device → Sensa

Install Bless input dependencies on Linux/macOS, or native WinRT dependencies on Windows. The adapter must support the peripheral role and advertising, with the necessary OS permissions.

```sh
python tools/protocol-bridge/bridge.py ble-input --protocol loob --sensa tcp://127.0.0.1:12401
python tools/protocol-bridge/bridge.py ble-input --protocol thrust-sync --sensa tcp://127.0.0.1:12401
```

Select the corresponding website connector and grant Bluetooth access. LOOB advertises as `LOOB Sensa`; Thrust Sync is discovered by service UUID. On Linux, `--adapter /org/bluez/hci1` explicitly chooses another adapter. Native Windows GATT uses the system Bluetooth friendly name and cannot assign a separate name to each service. The website's LOOB picker requires a `LOOB` prefix, so that mode refuses to start by default on Windows. Only use `--confirm-windows-loob-name` after configuring the actual advertised name yourself in OS settings; the tool does not change it. Thrust Sync filters by service UUID and has no such prefix requirement.

| Protocol | Service / characteristic | Encoding |
| --- | --- | --- |
| LOOB | `b75c49d2-04a3-4071-a0b5-35853eb08307` / `ba5c49d2-04a3-4071-a0b5-35853eb08307` | Four bytes: big-endian uint16 position 1–1000 + uint16 milliseconds |
| Thrust Sync | `0000ffe0-0000-1000-8000-00805f9b34fb` / `0000ffe1-0000-1000-8000-00805f9b34fb` | Three bytes: position 0–180 + big-endian uint16 milliseconds |

Frames are checked for exact length and range before conversion to `L0xxxI<milliseconds>`. BLE position 1.0 becomes the three-digit TCode maximum 999. Invalid frames, queue overflow or downstream failure stop the session. Windows observes native GATT session closure. These write-only protocols do not provide reliable notification-subscription disconnect events in Bless, so Linux/macOS use the `--idle` watchdog to send `DSTOP` without new commands, by default two seconds after the latest command’s finite I interval. An ordinary webpage cannot serve as a BLE peripheral. Same-adapter browser self-connection, concurrent roles and platform-specific advertising require real hardware verification; another adapter or an external peripheral may be needed.

## BLE output: Sensa → actual BLE device

Add a **TCode TCP output** in Sensa targeting local port `12411`. Enable L0 only and choose Interval slope. Obtain the actual device's OS identifier, then connect explicitly:

```sh
python tools/protocol-bridge/bridge.py ble-output --protocol loob --device DEVICE_ID --listen tcp://127.0.0.1:12411
```

`thrust-sync` is also available. The tool acts as a Bleak central and writes the real GATT characteristic. It does not automatically scan or choose devices. It accepts one L0 position with an optional I duration. Speed S, ramp suffixes, multiple axes and unknown commands terminate the session rather than being silently discarded. Without I the duration is 100 ms; duration must not exceed 65535 ms. Listening is loopback-only by default. For deliberate LAN exposure, pass `--allow-lan` and restrict network access separately.

Neither public protocol has a **verified emergency-stop opcode**. `DSTOP`, upstream disconnection, timeout or write failure clears pending commands and disconnects BLE. The tool never treats position zero as stop, and never reconnects to replay old commands. A device may still complete its last accepted finite-duration move; disconnecting is not a hardware emergency stop. Applications requiring immediate physical stop need a protocol with verified stop capability.

## Lifecycle and verification limits

Interactive input bridges accept `disable`, `enable`, `disconnect`, `unpair` and `quit`. Disable discards the pending generation before sending `DSTOP`; enable accepts new commands only. `unpair` ends this tool session and withdraws advertising; persistent OS pairing keys must be removed separately in system settings. Ctrl+C also cleans up connections. Transport/device failure never automatically reconnects or restores an old target. Transport operations have deadlines and the ingress queue is limited to 64 frames. Partial TCP bytes cannot renew validity without a complete new command.

Repository tests use real local PTYs, mock serial/BLE/WinRT and bounded failure injection to cover encoding, ordering, disable, timeouts, cancellation and cleanup. Dependencies were installed and imported in a temporary Linux environment. No real device, complete Sensa process or browser/hardware acceptance was exercised.

Dependency licenses: pyserial BSD-3-Clause; Bleak, Bless and PyWinRT MIT. Upstream API references: [Bless](https://github.com/kevincar/bless), [Bleak](https://github.com/hbldh/bleak), [Windows GATT](https://learn.microsoft.com/en-us/windows/apps/develop/devices-sensors/gatt-server), [PyWinRT](https://github.com/pywinrt/pywinrt). The codec evidence is the LOOB / Thrust Sync implementation in [FapTap's public connector bundle](https://faptap.net/assets/index.de793511.js), rather than a vendor guarantee for every device model or firmware.
