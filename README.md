# Sensa

VRChat 接触感知组件，将 SPS/OGB 接触数据通过 OSC 转发至 PC，驱动 Intiface/Buttplug 设备（以及 OSR2/SR6 TCode 设备）。

---

## 目录

- [功能概览](#功能概览)
- [安装要求](#安装要求)
- [Unity 组件配置](#unity-组件配置)
  - [Socket（Orifice）模式](#socketorifice模式)
  - [Plug（Penetrator）模式](#plugpenetrator模式)
  - [辅助信号](#辅助信号)
- [Companion 应用程序](#companion-应用程序)
  - [配置文件](#配置文件)
  - [信号管道](#信号管道)
  - [设备驱动](#设备驱动)
  - [安全系统](#安全系统)
  - [録制与导出](#录制与导出)
- [OSC 参数参考](#osc-参数参考)
- [TCode 映射说明](#tcode-映射说明)
- [Intiface 映射说明](#intiface-映射说明)
- [常见问题](#常见问题)

---

## 功能概览

| 功能          | 说明                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------ |
| Unity 组件    | 通过 NDMF（或 SDK 预处理回调）在构建时自动注入 VRC Contact 组件                            |
| OSC 接收      | 监听 UDP :9001，解析 VRChat 发送的头像参数                                                 |
| 信号处理      | 标定 → EMA 平滑 → 死区 → 曲线映射（每路信号独立配置）                                      |
| 信号融合      | 将多路信号合并为单一 `DeviceCommand`（深度取最大值，振动取最大值）                         |
| Intiface 驱动 | 通过 Buttplug v5 WebSocket 控制线性设备及振动马达                                          |
| TCode 驱动    | 通过串口驱动 OSR2/SR6/OSR6，支持速度模式和区间模式；OSR2 使用 3 轴，SR6/OSR6 使用全部 6 轴 |
| 安全系统      | 全局强度限制（80%）、启动渐变（2000 ms）、紧急停止、空闲复位                               |
| ImGui UI      | 实时状态显示、信号配置、设备路由、日志面板                                                 |
| 录制导出      | 录制 L0 曲线并导出为 `.funscript`（含 RDP 简化）                                           |

---

## 安装要求

### Unity 端

- Unity 2022.3 LTS（VRChat SDK 3.7+）
- [Modular Avatar](https://modular-avatar.nadena.dev/)（必须）
- [NDMF](https://ndmf.nadena.dev/)（推荐；可选，无 NDMF 时回退到 SDK 预处理回调）
- VRChat Avatars SDK 3.x（含 Contacts / PhysBone）

### Companion 应用

- .NET 9 Runtime（Windows x64）
- Intiface Central 或 intiface-engine.exe（可选，驱动 Buttplug 设备时需要）
- OSR2/SR6 设备连接 COM 串口（可选）

---

## Unity 组件配置

在头像根对象或任意子对象（骨骼）上添加 **Sensa Component**：

```
右键 → Add Component → Sensa → Sensa Component
```

### Socket（Orifice）模式

适用于被插入方（孔洞），在构建时自动生成：

- **深度探针** — N 个沿插入轴分布的 `VRCContactReceiver`（Proximity 类型），检测 SPS/OGB/TPS 穿透标签
- **角度探针** — 轴向四侧各一个 Proximity Receiver，用于计算横向角度
- **PenOthers** — 入口处的主深度 Receiver

| 属性                  | 说明                                                               |
| --------------------- | ------------------------------------------------------------------ |
| Instance Name         | 参数路径的唯一标识名，如 `Main`（最终路径 `OGB/Orf/Pussy/Main/…`） |
| Orifice Type          | 孔洞类型：Pussy / Ass / Mouth / Custom                             |
| Depth Axis            | 插入轴骨骼，+Z 方向指向内部                                        |
| Socket Length (m)     | 最大插入深度（米），默认 0.15                                      |
| Depth Ring Count      | 深度探针数量（1–10），默认 5                                       |
| DPS/TPS Compat        | 勾选后同时检测 `TPS_Pen_Penetrating` 标签（默认开启）              |
| Generate Angle Params | 生成角度接收器（AngleRight/Left/Up/Down_Raw 参数）                 |
| Generate Self Param   | 同时生成 `PenSelf` 参数（检测自我插入）                            |

> **提示**：Scene Gizmos 会显示探针圆盘和插入轴线，便于可视化调整。

### Plug（Penetrator）模式

适用于插入方（穿透器），在构建时自动生成：

- **Tip Sender** — 穿透器尖端的 `VRCContactSender`，带 `SPS_Pen_Tip` + `TPS_Pen_Penetrating` 标签
- **Root Sender** — 穿透器根部的 `VRCContactSender`，带 `SPS_Pen_Root` + `TPS_Pen_Root` 标签
- **PenOthers / TouchOthers** — 检测他人 Socket 的 Proximity/OnEnter Receiver

| 属性             | 说明                    |
| ---------------- | ----------------------- |
| Tip Bone         | 穿透器尖端骨骼          |
| Root Bone        | 穿透器根部骨骼          |
| Self Penetration | 同时检测插入自身 Socket |

### 辅助信号

在 **Supplementary Signals** 列表中添加额外信号源：

| 类型              | 说明                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Contact           | 自动创建 Proximity Receiver，可配置半径                                                                                          |
| PhysBone          | 附加到指定 PhysBone，输出所选子参数（Angle / Stretch / Squish / IsGrabbed 之一）；**仅注册选中的一个参数**，不会浪费其余参数预算 |
| ExistingParameter | 直接引用已有的 VRChat 参数名称                                                                                                   |

每个辅助信号可映射为以下设备角色：

| 角色            | 说明                              |
| --------------- | --------------------------------- |
| Vibrate         | 驱动振动强度                      |
| GateEnable      | 布尔门控——为 false 时关闭所有输出 |
| DepthOverride   | 完全覆盖深度信号                  |
| AngleX / AngleY | 补充横向角度                      |

---

## Companion 应用程序

在 VRChat **Game** 里运行头像时，同时启动 `Sensa.exe`（Companion 应用）。

### 配置文件

配置保存于 `%LOCALAPPDATA%\Sensa\config.json`，首次运行自动创建。可在 UI 菜单 **File → Save Config** 手动保存。

主要配置项：

```jsonc
{
  "Osc": { "ReceiverPort": 9001 },
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
  "Signals": [],
}
```

### 信号管道

每路信号在 UI **Signals** 面板中独立配置，处理链为：

```
VRChat OSC float → 标定[VrchatMin, VrchatMax] → [可选反转] → EMA平滑(α) → 死区 → 曲线 → [0,1]
```

| 参数             | 说明                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| OSC Path         | 参数路径（不含 `/avatar/parameters/` 前缀），如 `OGB/Orf/Pussy/Main/PenOthers`                                                   |
| Invert Direction | 反转输入范围（适用于信号极性与期望相反时）                                                                                       |
| Smoothing α      | EMA 系数，越小越平滑（0.01–1.0）                                                                                                 |
| Dead Zone        | 低于此值的信号视为零（**注意**：死区产生阶跃——超过阈值后信号值直接从 0 跳至该阈值；若需线性过渡，请将死区设为 0 并使用曲线处理） |
| Curve            | Linear / Ease In / Ease Out / S-Curve                                                                                            |
| Role             | Depth / AngleX / AngleY / Vibrate / Gate / BpmDrive（详见下表）                                                                  |

> **信号角色说明**
>
> | 角色     | 设备作用                                                                     |
> | -------- | ---------------------------------------------------------------------------- |
> | Depth    | 驱动 L0（插入深度）——多路 Depth 信号取最大值                                 |
> | Vibrate  | 驱动振动——多路 Vibrate 信号取最大值                                          |
> | AngleX   | 驱动 R0（滚转 / 左右倾斜）——取最后写入值                                     |
> | AngleY   | 驱动 R1（俰仰 / 前后倾斜）——取最后写入值                                     |
> | Twist    | 驱动 R2（管道自转）——SR6/OSR6 专属，取最后写入值                             |
> | Surge    | 驱动 L1（前后多余线性）——SR6/OSR6 专属，取最后写入值                         |
> | Sway     | 驱动 L2（左右外摆线性）——SR6/OSR6 专属，取最后写入值                         |
> | Gate     | 布尔门控——任意 Gate 信号 < 0.5 时关闭所有输出                                |
> | BpmDrive | **仅用于节奏显示**——此路信号不直接驱动设备，全局节奏检测始终基于 L0 深度信号 |
>
> **角度信号配置说明**：角度原始参数（`AngleRight_Raw` 等）是 [0,1] 的接近度，并非直接的角度值。若要获得正确的左右角度，需要在外部将 Right_Raw 和 Left_Raw 相减后再作为一路信号输入（例如借助 VRCExpressionParameters 的本地参数计算），或分别将两路原始值配置为 Vibrate 角色用于双侧非对称驱动。目前 AngleX/Y 角色直接传入原始值到旋转轴，不做差值计算。

### 设备驱动

**Intiface（Buttplug）**：

- L0=0 → 线性设备在顶部（position=1.0）；L0=1 → 底部（position=0.0）
- 无线性功能的设备自动降级为振动（深度映射为强度）

**TCode（串口）**：

- 速度模式（默认）：`L0{pos:D3}S{velocity:D4}`
- 区间模式（备用）：`L0{pos:D3}I{durationMs:D4}`
- 物理行程：`[MinPos, MaxPos] / 1000`（默认 100–900）

### 安全系统

| 功能         | 说明                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------- |
| 全局强度限制 | 输出幅度不超过 GlobalIntensityCap（默认 80%）                                                   |
| 启动渐变     | 首次收到活动信号后，限制在 RampUpMs 毫秒内线性增至上限                                          |
| 空闲行为     | `RetractToZero`（默认）：无活动时归零 \| `Park`：停在中间位置 \| `StayAtPosition`：保持最后位置 |
| 紧急停止     | UI 红色按钮或 Escape 键；发送 `DSTOP`（TCode）并调用 `StopAllDevices`（Intiface）               |

### 节奏检测

Companion 内置节奏检测器，实时分析 L0 深度曲线的峰谷周期，估算当前 BPM（在 Status 面板显示）。

启用节奏检测需在配置中设置：

```jsonc
"Rhythm": {
  "Enabled": true,
  "WindowMs": 5000,   // 检测窗口（毫秒）
  "MinBpm": 5,        // 低于此 BPM 认为无节奏
  "MaxBpm": 300       // 高于此 BPM 认为过快、忽略
}
```

> BPM 超出 `[MinBpm, MaxBpm]` 范围时，当前 BPM 显示重置为 0，不更新。节奏检测仅用于 UI 显示；`BpmDrive` 角色信号亦不直接驱动设备。

1. 在菜单 **View → Recording** 打开录制面板
2. 点击 **Start Recording** 开始录制 L0 轨迹
3. 点击 **Stop Recording** 停止
4. 点击 **Export .funscript** 导出

文件保存于 `%USERPROFILE%\Documents\Sensa\recordings\recording_YYYYMMDD_HHmmss.funscript`，自动使用 Ramer-Douglas-Peucker（ε=0.02）简化冗余帧。

---

## OSC 参数参考

以下为 Socket 模式（Orifice Type=Pussy，Instance Name=Main）默认生成的 OSC 参数：

| 参数路径                                          | 类型  | 说明                                       |
| ------------------------------------------------- | ----- | ------------------------------------------ |
| `OGB/Orf/Pussy/Main/PenOthers`                    | float | 入口处主深度（0=无接触，1=完全重叠）       |
| `OGB/Orf/Pussy/Main/PenSelf`                      | float | 自插深度（需开启 Generate Self Param）     |
| `OGB/Orf/Pussy/Main/TouchZones/Tip`               | float | 入口环                                     |
| `OGB/Orf/Pussy/Main/TouchZones/Ring1`…`Ring{N-2}` | float | 中间环                                     |
| `OGB/Orf/Pussy/Main/TouchZones/Middle`            | float | 中间环（N≥3 时的正中一环）                 |
| `OGB/Orf/Pussy/Main/TouchZones/Root`              | float | 最深环                                     |
| `OGB/Orf/Pussy/Main/AngleRight_Raw`               | float | 右侧接近度（需开启 Generate Angle Params） |
| `OGB/Orf/Pussy/Main/AngleLeft_Raw`                | float | 左侧接近度                                 |
| `OGB/Orf/Pussy/Main/AngleUp_Raw`                  | float | 上侧接近度                                 |
| `OGB/Orf/Pussy/Main/AngleDown_Raw`                | float | 下侧接近度                                 |

Plug 模式（Instance Name=Main）生成的参数：

| 参数路径                   | 类型  | 说明                            |
| -------------------------- | ----- | ------------------------------- |
| `OGB/Pen/Main/PenOthers`   | float | 检测到他人 Socket 的接近度      |
| `OGB/Pen/Main/TouchOthers` | bool  | 触碰他人 Socket（OnEnter）      |
| `OGB/Pen/Main/PenSelf`     | float | 自插（需开启 Self Penetration） |
| `OGB/Pen/Main/TouchSelf`   | bool  | 触碰自身 Socket（需开启）       |

所有参数均为 **NotSynced / localOnly / not saved**，不占用网络同步位宽。

---

## TCode 映射说明

### OSR2（3 轴）

OSR2 支持 L0（主冲程）、R0（滚转 / 左右倾斜）、R1（俰仰 / 前后倾斜）共 3 轴。

```
normalised_L0 ∈ [0, 1]
mapped = MinPos + (MaxPos - MinPos) × normalised_L0    // 默认 100 + 800 × L0
pos = round(mapped)          // 0–999
command = "L0{pos:D3}S{velocity:D4}"   // 速度模式
```

### SR6 / OSR6（6 轴）

SR6 和 OSR6 在 L0/R0/R1 基础上增加三个轴，对应三个新信号角色：

| TCode 轴 | 中点 | 信号角色 | 物理含义                                         |
| -------- | ---- | -------- | ------------------------------------------------ |
| L0       | 0    | Depth    | 主冲程（插入 / 抽出）                            |
| R0       | 0.5  | AngleX   | 滚转（左右摇摆）                                 |
| R1       | 0.5  | AngleY   | 俰仰（前后摇摆）                                 |
| R2       | 0.5  | Twist    | 管道自转（沿插入轴旋转）                         |
| L1       | 0.5  | Surge    | 前后内次线性浮动（部分固件支持，取决于构建版本） |
| L2       | 0.5  | Sway     | 左右内次线性浮动（部分固件支持，取决于构建版本） |

所有对称轴（R0/R1/R2/L1/L2）均以 0.5 为中心点；信号处理后的 [0,1] 输入映射到 [0.5, 1.0] 平移范围内。若需反向假设，配置该信号时勾选 Invert。OSR2 固件会默默忽略它不认识的 R2/L1/L2 指令，不需额外配置。

- `L0Invert = true` 时，在送入映射前先执行 `normalised_L0 = 1 - normalised_L0`
- 速度由 `VelocityEstimator` 从相邻帧位置差估算，上限为 `MaxVelocity`（默认 1400）

---

## Intiface 映射说明

```
position01 = Clamp01(1.0 - L0)    // L0=0 → 顶部(1.0)；L0=1 → 底部(0.0)
```

线性设备发送 `PositionWithDuration.Percent(position01, durationMs)`；纯振动设备映射 `L0 → vibrateIntensity`。

---

## 常见问题

**Q：VRChat OSC 发送到哪个端口？**  
A：VRChat 默认向 UDP `127.0.0.1:9001` 发送头像参数。Sensa 监听所有网卡（`0.0.0.0:9001`），与默认配置兼容。在 VRChat 设置 → OSC 中确认已启用 OSC。

**Q：如何快速配置深度信号？**  
A：在 VRChat 中进入互动，观察 Signals 面板中 `PenOthers` 参数的 _Current raw_ 数值。将 `VrchatMin`/`VrchatMax` 校准至实际观测范围，然后设置合适的死区（建议 0.05）。

**Q：设备不动作？**  
A：检查以下几点：

1. Status 面板中 `L0` 是否有数值变化
2. `GateOpen` 是否为 true（需要配置一个 Role=Gate 的信号，或无 Gate 信号时默认开门）
3. Intiface 是否已连接（面板显示设备名称）
4. 安全系统是否触发了紧急停止（点击 Clear Emergency）

**Q：如何使用 intiface-engine 内置模式？**  
A：将 `intiface-engine.exe` 放在 `Sensa.exe` 旁边或 `%LOCALAPPDATA%\Sensa\` 目录下，配置中 `"ManageEngineProcess": true`，Sensa 启动时会自动拉起引擎进程。Intiface 启动需要约 1.5 秒，Companion 会等待连接完成后再继续。

**Q：配置文件在哪里？**  
A：`%LOCALAPPDATA%\Sensa\config.json`（即 `C:\Users\<用户名>\AppData\Local\Sensa\config.json`）。使用本地路径而非漫游路径，避免多台设备间同步设备特定配置（COM 端口、蓝牙地址等）。

**Q：TCode 连接失败？**  
A：确认 `ComPort` 与设备实际端口一致（设备管理器中查看），并且没有其他程序占用该串口。

**Q：构建后头像接触不生效？**  
A：检查 `depthAxis`（Socket）或 `tipBone`/`rootBone`（Plug）是否已赋值；Inspector 底部的错误帮助框会提示缺失字段。也可在 Scene 视图观察绿色/橙色 Gizmos 确认接触放置是否正确。
