# Sensa

## 本项目当前正在使用 AI Coding 半自动迭代，完全由 AI 维护，目前完成度为暂时不可用

Sensa 是一个面向 VRChat 的接触感知桥接系统：在 Unity 侧自动生成接触组件，把 SPS / OGB / TPS 相关参数通过 OSC 发到本地 Companion；Companion 再以 **HTTP 服务 + WebSocket 服务 + WebUI** 的方式提供配置、监控、功能测试与设备驱动能力，最终控制 Intiface / Buttplug 设备或 TCode 设备（OSR2 / SR6 / OSR6）。

---

## 目录

- [Sensa](#sensa)
  - [本项目当前正在使用 AI Coding 半自动迭代，完全由 AI 维护，目前完成度为暂时不可用](#本项目当前正在使用-ai-coding-半自动迭代完全由-ai-维护目前完成度为暂时不可用)
  - [目录](#目录)
  - [功能概览](#功能概览)
  - [安装要求](#安装要求)
    - [Unity 端](#unity-端)
    - [Companion 端](#companion-端)
  - [快速开始](#快速开始)
  - [Unity 组件配置](#unity-组件配置)
    - [Socket（Orifice）模式](#socketorifice模式)
    - [Plug（Penetrator）模式](#plugpenetrator模式)
    - [辅助信号](#辅助信号)
  - [Companion Web 服务](#companion-web-服务)
    - [运行方式](#运行方式)
    - [WebUI 能力](#webui-能力)
      - [推荐使用方式](#推荐使用方式)
    - [配置文件](#配置文件)
    - [信号管道](#信号管道)
      - [信号角色说明](#信号角色说明)
    - [手动功能测试](#手动功能测试)
    - [录制与导出](#录制与导出)
    - [HTTP 与 WebSocket 端点](#http-与-websocket-端点)
      - [常用 HTTP 端点](#常用-http-端点)
      - [WebSocket 端点](#websocket-端点)
  - [OSC 参数参考](#osc-参数参考)
  - [TCode 映射说明](#tcode-映射说明)
    - [协议约定](#协议约定)
    - [OSR2-class / OSR2+（常见 4 轴）](#osr2-class--osr2常见-4-轴)
    - [SR6 / OSR6（6 轴）](#sr6--osr66-轴)
  - [Intiface 映射说明](#intiface-映射说明)
  - [实现审计与资料来源](#实现审计与资料来源)
  - [常见问题](#常见问题)

---

## 功能概览

| 功能             | 说明                                                            |
| ---------------- | --------------------------------------------------------------- |
| Unity 组件       | 通过 NDMF（或 SDK 预处理回调）在构建时自动注入 VRC Contact 组件 |
| OSC 接收         | 监听 UDP `:9001`，解析 VRChat 发出的头像参数                    |
| 信号处理         | 标定 → EMA 平滑 → 死区 → 曲线映射（每路信号独立配置）           |
| 信号融合         | 将多路信号融合为统一 `DeviceCommand`                            |
| Intiface 驱动    | 通过 Buttplug v5 WebSocket 控制线性设备及振动马达               |
| TCode 驱动       | 通过串口驱动 OSR2 / SR6 / OSR6；按 TCode 规范输出 `L* / R*` 轴  |
| SafetySystem     | 强度上限、启动渐变、紧急停止、空闲回中 / 回零                   |
| WebUI            | 浏览器内完成多 Tab 配置、状态查看、日志查看、录制与手动测试     |
| WebSocket 状态流 | 实时向 WebUI 推送服务状态、录制状态、日志与设备命令快照         |
| 3D 预览          | WebUI 内提供轻量 3D-ish 设备姿态可视化，便于看轴向是否反了      |
| 诊断与筛选       | 内置诊断摘要、信号/参数/日志筛选、操作 Toast 反馈               |
| 录制导出         | 录制 `L0` 曲线并导出为 `.funscript`（带 RDP 简化）              |

---

## 安装要求

### Unity 端

- Unity 2022.3 LTS（VRChat SDK 3.7+）
- [Modular Avatar](https://modular-avatar.nadena.dev/)（必须）
- [NDMF](https://ndmf.nadena.dev/)（推荐；可选，无 NDMF 时回退到 SDK 预处理回调）
- VRChat Avatars SDK 3.x（含 Contacts / PhysBone）

### Companion 端

- .NET 9 Runtime（Windows x64）
- 任意现代浏览器（推荐 Chrome / Edge）
- Intiface Central 或 `intiface-engine.exe`（可选，驱动 Buttplug 设备时需要）
- OSR2 / SR6 / OSR6 对应的串口设备（可选）

---

## 快速开始

1. 在 Unity 头像对象上添加 **Sensa Component**。
2. 构建并进入 VRChat，确保 **OSC 已启用**。
3. 启动 Companion（本质上是一个本地 Web 服务）。
4. 打开浏览器访问 `http://127.0.0.1:5086`（默认地址）。
5. 在 WebUI 中：

- 在“总览”页确认 Loop 正常运行；
- 在“配置”页配置信号路径与角色；
- 在“测试”页连接 TCode 或 Intiface，并做手动功能测试；
- 在“监控”页检查参数流、日志与录制状态；
- 需要时在“说明”页查看当前端点和常见实现边界。

> 默认绑定在 `127.0.0.1`，仅本机可访问；这也是当前推荐与默认的安全方案。

---

## Unity 组件配置

在头像根对象或任意子对象（骨骼）上添加 **Sensa Component**：

```text
右键 → Add Component → Sensa → Sensa Component
```

### Socket（Orifice）模式

适用于被插入方（孔洞），构建时自动生成：

- **深度探针**：N 个沿插入轴分布的 `VRCContactReceiver`（Proximity）
- **角度探针**：四个方向各一个 Proximity Receiver
- **PenOthers**：入口主深度 Receiver

| 属性                  | 说明                                |
| --------------------- | ----------------------------------- |
| Instance Name         | 参数路径唯一标识名，如 `Main`       |
| Orifice Type          | `Pussy / Ass / Mouth / Custom`      |
| Depth Axis            | 插入轴骨骼，`+Z` 指向内部           |
| Socket Length (m)     | 最大插入深度，默认 `0.15`           |
| Depth Ring Count      | 深度探针数量 `1–10`，默认 `5`       |
| DPS/TPS Compat        | 同时兼容 `TPS_Pen_Penetrating` 标签 |
| Generate Angle Params | 生成 `AngleRight/Left/Up/Down_Raw`  |
| Generate Self Param   | 生成 `PenSelf` 参数                 |

> Scene Gizmos 会绘制探针和轴向，便于对准。

### Plug（Penetrator）模式

适用于插入方（穿透器），构建时自动生成：

- **Tip Sender**：尖端 `VRCContactSender`
- **Root Sender**：根部 `VRCContactSender`
- **PenOthers / TouchOthers**：检测他人 Socket 的接近 / 接触

| 属性             | 说明                |
| ---------------- | ------------------- |
| Tip Bone         | 穿透器尖端骨骼      |
| Root Bone        | 穿透器根部骨骼      |
| Self Penetration | 同时检测自身 Socket |

### 辅助信号

在 **Supplementary Signals** 列表中可以追加额外信号源：

| 类型              | 说明                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| Contact           | 自动创建 Proximity Receiver，可配置半径                                                 |
| PhysBone          | 输出所选子参数（`Angle / Stretch / Squish / IsGrabbed` 之一）；**只注册选中的一个参数** |
| ExistingParameter | 直接复用已有 VRChat 参数                                                                |

辅助信号可以映射到以下角色：

| 角色                 | 说明                         |
| -------------------- | ---------------------------- |
| Vibrate              | 驱动振动强度                 |
| Gate                 | 门控，`< 0.5` 时关闭全部输出 |
| Depth                | 作为额外深度信号参与融合     |
| AngleX / AngleY      | 驱动 R0 / R1                 |
| Twist / Surge / Sway | 驱动 OSR6 / SR6 的扩展轴     |

---

## Companion Web 服务

### 运行方式

Companion 已不再依赖任何 Native UI。启动后会：

1. 读取本地配置；
2. 启动 OSC 接收器；
3. 启动主循环；
4. 暴露 HTTP / WebSocket 端点；
5. 通过浏览器提供完整 WebUI。

默认地址：

- WebUI：`http://127.0.0.1:5086`
- WebSocket：`ws://127.0.0.1:5086/api/ws`

如果 `WebUi.AutoOpenBrowser = true`，程序启动后会尝试自动打开浏览器。

### WebUI 能力

当前 WebUI 已覆盖以下能力：

- **多 Tab 信息架构**：总览 / 配置 / 测试 / 监控 / 说明
- **总览页**：快速上手、服务状态、实时诊断、3D-ish 设备预览
- **配置页**：WebUI / OSC / TCode / Intiface / Safety / Rhythm 配置编辑
- **配置页增强**：支持刷新本机串口列表，便于直接选择可用 COM 口
- **信号配置表**：新增 / 删除 / 修改 Role、Curve、Dead Zone，支持关键字筛选
- **测试页**：TCode / Intiface 控制按钮、手动功能测试、录制与导出 `.funscript`
- **测试页增强**：展示 TCode / Intiface 当前连接摘要与发现到的 Intiface 设备列表
- **监控页**：参数流表格、日志面板，均支持关键字筛选
- **说明页**：端点列表、上手建议、当前实现边界
- **操作反馈**：通过 Toast 告知保存、应用、导出、手动测试等动作结果
- **界面偏好**：支持本地保存主题与中英切换状态
- **移动端适配**：窄屏下切换为单列布局，并显示底部 Tab 导航

> WebUI 的定位不是“只读监视器”，而是本地控制台：绝大多数日常操作都可以只靠浏览器完成。

#### 推荐使用方式

- **桌面端**：侧边导航 + 大面积状态区，适合一边调参一边看日志和设备预览。
- **移动端 / 小窗口**：自动切换为单列布局，并启用底部 Tab 导航，适合放在副屏、平板或远程桌面小窗里当控制板。
- **远程协作排障**：可直接复制“实时诊断”摘要，把关键运行信息发给协作者。

### 配置文件

配置保存在：

- `%LOCALAPPDATA%\Sensa\config.json`

示例：

```jsonc
{
  "WebUi": {
    "Host": "127.0.0.1",
    "Port": 5086,
    "AutoOpenBrowser": false,
    "Title": "Sensa WebUI",
  },
  "Osc": {
    "ReceiverPort": 9001,
  },
  "Intiface": {
    "Enabled": true,
    "ManageEngineProcess": true,
    "WebsocketAddress": "ws://localhost:12345",
    "Port": 12345,
  },
  "TCode": {
    "ComPort": "COM3",
    "MaxPos": 900,
    "MinPos": 100,
    "MaxVelocity": 1400,
    "L0Invert": false,
    "UpdatesPerSecond": 50,
    "PreferSpeedMode": true,
    "Enabled": false,
  },
  "Safety": {
    "GlobalIntensityCap": 0.8,
    "RampUpMs": 2000,
    "Idle": "RetractToZero",
    "EmergencyStopKey": "Escape",
  },
  "Rhythm": {
    "Enabled": false,
    "WindowMs": 3000,
    "MinBpm": 5,
    "MaxBpm": 300,
  },
  "Signals": [],
}
```

### 信号管道

每路信号都遵循同样的处理链：

```text
VRChat OSC float → 标定[VrchatMin, VrchatMax] → [可选反转] → EMA平滑(α) → 死区 → 曲线 → [0,1]
```

| 参数             | 说明                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| OSC Path         | 参数路径（不含 `/avatar/parameters/` 前缀）                                  |
| Invert Direction | 反转输入范围                                                                 |
| Smoothing α      | EMA 系数，越小越平滑                                                         |
| Dead Zone        | 低于该值视为 0；超过阈值后会产生阶跃                                         |
| Curve            | `Linear / Ease In / Ease Out / S-Curve`                                      |
| Role             | `Depth / AngleX / AngleY / Twist / Surge / Sway / Vibrate / Gate / BpmDrive` |

#### 信号角色说明

| 角色     | 设备作用                          |
| -------- | --------------------------------- |
| Depth    | 驱动 `L0`，多路取最大值           |
| Vibrate  | 驱动振动，多路取最大值            |
| AngleX   | 驱动 `R0`（滚转 / 左右倾斜）      |
| AngleY   | 驱动 `R1`（俯仰 / 前后倾斜）      |
| Twist    | 驱动 `R2`（沿插入轴旋转）         |
| Surge    | 驱动 `L1`（前后横移）             |
| Sway     | 驱动 `L2`（左右横移）             |
| Gate     | 门控，任意一路 `< 0.5` 即关闭输出 |
| BpmDrive | 仅用于节奏显示，不直接驱动设备    |

> `AngleRight_Raw` / `AngleLeft_Raw` 这类参数本身是接近度，不是数学意义上的角度。当前系统会把处理后的结果直接映射到对应轴，不会自动做 `Right - Left` 这种差值重建；若需要更真实的差值角度，应在外部先完成参数计算。

### 手动功能测试

WebUI 新增了 **手动功能测试** 区块，这是本次重构最关键的能力之一。

作用：

- 在没有 VRChat 输入时直接测试轴向是否正确；
- 快速确认 OSR2 / SR6 / OSR6 的 R0 / R1 / R2 / L1 / L2 映射；
- 快速确认 `Vibrate`、`GateOpen` 是否按预期生效；
- 测试路径同样经过 `SafetySystem`，因此紧急停止与强度限制依然有效。

`GateOpen` 的当前实现语义：

- 当 `GateOpen = false` 时，不再继续跟随新的原始融合值；
- `Safety.Idle = RetractToZero` 时，输出会回到 `L0 = 0`、其余对称轴回中；
- `Safety.Idle = Park` 时，输出会回到居中停放位；
- `Safety.Idle = StayAtPosition` 时，会保持最近一次**已经通过 SafetySystem 的安全输出**，而不是继续采纳 Gate 关闭后的新输入。

说明：

- 启用后会覆盖实时融合输出；
- 清除后恢复正常实时输入；
- 适合做设备安装后的第一轮冒烟测试。

补充：

- 测试页还集成了 TCode / Intiface 的快速连接与回中按钮；
- 录制与导出功能也放在同一页，便于边测边录。

### 录制与导出

WebUI 提供录制控制：

1. 点击 **开始录制**；
2. 收集 `L0` 轨迹；
3. 点击 **停止录制**；
4. 点击 **导出 .funscript**。

导出路径：

- `%USERPROFILE%\Documents\Sensa\recordings\recording_YYYYMMDD_HHmmss.funscript`

导出前会自动做 Ramer-Douglas-Peucker 简化（默认 `ε = 0.02`）。

### HTTP 与 WebSocket 端点

#### 常用 HTTP 端点

| 方法     | 路径                                | 说明                    |
| -------- | ----------------------------------- | ----------------------- |
| `GET`    | `/api/meta`                         | 返回元信息、枚举和值域  |
| `GET`    | `/api/meta/serial-ports`            | 返回当前可见 COM 口列表 |
| `GET`    | `/api/config`                       | 返回完整配置            |
| `PUT`    | `/api/config`                       | 热更新配置              |
| `POST`   | `/api/config/save`                  | 写入本地配置文件        |
| `GET`    | `/api/state/overview`               | 当前服务状态快照        |
| `GET`    | `/api/state/parameters`             | 当前收到的参数列表      |
| `GET`    | `/api/state/logs`                   | 日志缓冲区              |
| `GET`    | `/api/state/recording/data`         | 录制轨迹数据            |
| `POST`   | `/api/control/loop/start`           | 启动主循环              |
| `POST`   | `/api/control/loop/stop`            | 停止主循环              |
| `POST`   | `/api/control/loop/emergency-stop`  | 紧急停止                |
| `POST`   | `/api/control/loop/clear-emergency` | 清除紧急停止            |
| `POST`   | `/api/control/tcode/connect`        | 连接 TCode              |
| `POST`   | `/api/control/tcode/disconnect`     | 断开 TCode              |
| `POST`   | `/api/control/tcode/park`           | 回中                    |
| `POST`   | `/api/control/intiface/connect`     | 连接 Intiface           |
| `POST`   | `/api/control/intiface/disconnect`  | 断开 Intiface           |
| `POST`   | `/api/control/intiface/scan-start`  | 开始扫描                |
| `POST`   | `/api/control/intiface/scan-stop`   | 停止扫描                |
| `POST`   | `/api/control/recording/start`      | 开始录制                |
| `POST`   | `/api/control/recording/stop`       | 停止录制                |
| `POST`   | `/api/control/recording/export`     | 导出 `.funscript`       |
| `PUT`    | `/api/manual-test`                  | 设置手动测试覆盖        |
| `DELETE` | `/api/manual-test`                  | 清除手动测试覆盖        |

#### WebSocket 端点

- `ws://127.0.0.1:5086/api/ws`

用途：

- 周期性推送当前状态；
- 推送日志快照；
- 驱动 WebUI 实时更新状态卡片、录制状态、日志与 3D 预览。

---

## OSC 参数参考

以下为 Socket 模式（`Orifice Type=Pussy`，`Instance Name=Main`）默认生成的参数：

| 参数路径                                          | 类型  | 说明                                   |
| ------------------------------------------------- | ----- | -------------------------------------- |
| `OGB/Orf/Pussy/Main/PenOthers`                    | float | 入口处主深度                           |
| `OGB/Orf/Pussy/Main/PenSelf`                      | float | 自插深度（需开启 Generate Self Param） |
| `OGB/Orf/Pussy/Main/TouchZones/Tip`               | float | 入口环                                 |
| `OGB/Orf/Pussy/Main/TouchZones/Ring1`…`Ring{N-2}` | float | 中间环                                 |
| `OGB/Orf/Pussy/Main/TouchZones/Middle`            | float | 正中一环                               |
| `OGB/Orf/Pussy/Main/TouchZones/Root`              | float | 最深环                                 |
| `OGB/Orf/Pussy/Main/AngleRight_Raw`               | float | 右侧接近度                             |
| `OGB/Orf/Pussy/Main/AngleLeft_Raw`                | float | 左侧接近度                             |
| `OGB/Orf/Pussy/Main/AngleUp_Raw`                  | float | 上侧接近度                             |
| `OGB/Orf/Pussy/Main/AngleDown_Raw`                | float | 下侧接近度                             |

Plug 模式（`Instance Name=Main`）生成的参数：

| 参数路径                   | 类型  | 说明                       |
| -------------------------- | ----- | -------------------------- |
| `OGB/Pen/Main/PenOthers`   | float | 检测到他人 Socket 的接近度 |
| `OGB/Pen/Main/TouchOthers` | bool  | 触碰他人 Socket            |
| `OGB/Pen/Main/PenSelf`     | float | 自插                       |
| `OGB/Pen/Main/TouchSelf`   | bool  | 触碰自身 Socket            |

所有参数均为 **NotSynced / localOnly / not saved**，不占用网络同步位宽。

---

## TCode 映射说明

本节基于以下公开资料与参考实现交叉核对：

- `multiaxis/TCode-Specification`
- `multiaxis/OSR2-Arduino`
- `ayvasoftware/osr-emu`
- `funscript.wiki` 的 T-Code 条目

### 协议约定

- TCode 是基于 ASCII 的串口协议；命令在收到换行后提交执行。
- 实时控制场景下，建议每条命令后立即发送换行，以降低缓冲等待。
- 轴值语义范围为 `[0, 1)`；Sensa 内部统一用归一化值，再映射到用户配置的设备范围。
- 基础轴命名遵循：`L0/L1/L2` 为线性轴，`R0/R1/R2` 为旋转轴。

### OSR2-class / OSR2+（常见 4 轴）

按公开模拟器与参考实现的常见约定，OSR2-class / OSR2+ 常见使用：

- `L0`：主冲程
- `R0`：滚转 / 左右倾斜
- `R1`：俯仰 / 前后倾斜
- `R2`：自转 / Twist

```text
normalised_L0 ∈ [0, 1]
mapped = MinPos + (MaxPos - MinPos) × normalised_L0
pos = round(mapped)
command = "L0{pos:D3}S{velocity:D4}"
```

其中速度项当前按 TCode `Sxxxx` 语义估算：

```text
speed = ceil(|Δnormalised| × 10000 × 100 / Δt_ms)
```

也就是把相邻帧的归一化位移换算成“**每 100ms 的四位幅值刻度**”，而不是简单按“每秒归一化速度”发送。

### SR6 / OSR6（6 轴）

SR6 / OSR6 在上述基础上额外增加：

| TCode 轴 | 中点 | 信号角色 | 物理含义 |
| -------- | ---- | -------- | -------- |
| L0       | 0    | Depth    | 主冲程   |
| R0       | 0.5  | AngleX   | 滚转     |
| R1       | 0.5  | AngleY   | 俯仰     |
| R2       | 0.5  | Twist    | 自转     |
| L1       | 0.5  | Surge    | 前后横移 |
| L2       | 0.5  | Sway     | 左右横移 |

说明：

- `R0 / R1 / R2 / L1 / L2` 都以 `0.5` 为中心；
- `OSR2-class` 固件对不存在的轴会忽略；因此 Sensa 可以统一发送完整轴集，由设备侧按能力接收；
- `L0Invert = true` 时，会先执行 `L0 = 1 - L0`；
- 速度由 `VelocityEstimator` 从相邻帧差估算，并换算到 TCode `Sxxxx` 所使用的“每 100ms 幅值刻度”单位；
- 当前串口层使用 `SerialPort.WriteLine(...)`，符合 TCode 对“换行提交”的要求。

---

## Intiface 映射说明

```text
position01 = Clamp01(1.0 - L0)
```

即：

- `L0 = 0` → 顶部（`position01 = 1.0`）
- `L0 = 1` → 底部（`position01 = 0.0`）

规则：

- 线性设备发送 `PositionWithDuration.Percent(position01, durationMs)`；
- 没有线性功能的设备会回退到振动映射；
- 振动设备在没有线性轴时，会把 `L0` 直接映射为 `vibrateIntensity`。

如果启用了内置 `intiface-engine` 托管，但本地找不到 `intiface-engine.exe`，Sensa 会：

1. 记录明确日志；
2. 跳过连接尝试；
3. 保持服务继续运行，不影响 WebUI 和 TCode 功能。

---

## 实现审计与资料来源

本仓库已补充一份基于源码与公开资料交叉核对的实现审计报告：

- [implementation-audit-report.md](./implementation-audit-report.md)

该报告重点记录：

- Unity 侧接触生成、Companion 后端、WebUI、TCode、Intiface 各部分实际上做了什么；
- 使用了哪些本地源码或公开资料作为依据；
- 本轮审计中确认的问题、已完成的修复、以及仍应继续关注的边界。

---

## 常见问题

**Q：WebUI 打不开怎么办？**  
A：先确认 Companion 进程正在运行，并访问默认地址 `http://127.0.0.1:5086`。如果修改过 `WebUi.Port` 或 `WebUi.Host`，请按新地址访问。

**Q：手机或平板上能用吗？**  
A：可以。当前 WebUI 已针对窄屏做单列布局和底部 Tab 导航优化，适合用作副屏控制台。默认仍建议仅在本机或受信任网络环境中访问。

**Q：修改了 OSC 端口为什么没有立刻生效？**  
A：当前版本中，OSC 端口变更建议重启服务后生效；其余大部分配置支持热更新。

**Q：VRChat OSC 发到哪个端口？**  
A：默认向 UDP `127.0.0.1:9001` 发送头像参数。Sensa 默认监听 `0.0.0.0:9001`，与默认配置兼容。

**Q：设备不动作？**  
A：按顺序检查：

1. 服务状态里 `Loop` 是否运行；
2. `GateOpen` 是否被某个 Gate 信号关掉；
3. TCode 或 Intiface 是否已连接；
4. 是否触发了 Emergency Stop；
5. 用“手动功能测试”直接发送一组测试值，排除上游 OSC 配置问题。

**Q：我没有安装 Intiface，还会影响 TCode 使用吗？**  
A：不会。当前实现会在日志里提示缺少 `intiface-engine.exe`，但不会阻塞 WebUI、OSC 或 TCode 功能。

**Q：配置文件在哪里？**  
A：`%LOCALAPPDATA%\Sensa\config.json`，例如：`C:\Users\<用户名>\AppData\Local\Sensa\config.json`。

**Q：TCode 连接失败怎么办？**  
A：确认 `ComPort` 正确、串口未被其他程序占用，并且设备驱动已正确安装。现在也可以直接在 WebUI 配置页点击“刷新”来重新枚举当前可见的 COM 口。

**Q：构建后头像接触不生效？**  
A：检查 `depthAxis`（Socket）或 `tipBone / rootBone`（Plug）是否已赋值；也可以在 Scene 视图用 Gizmos 确认接触放置是否正确。
