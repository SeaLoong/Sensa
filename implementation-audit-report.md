# Sensa 实现审计报告

> 本报告记录本轮对 `Assets/UnityBox/Sensa` 的源码审计结果。目标不是“猜一个大概”，而是把**当前实现实际上做了什么**、**依据来自哪里**、以及**已经确认并修复了什么**写清楚。

---

## 1. 审计范围

本轮覆盖了以下部分：

- Unity 侧：`Runtime/`、`Editor/`
- Companion：`program/`、`application-loop/`、`core/`、`transmit-tcode/`、`transmit-intiface/`、`service-recording/`
- WebUI：`program/wwwroot/`
- 第三方本地源码：`Packages/com.vrcfury.vrcfury`
- 公开资料：TCode / OSR / Intiface / Buttplug / NDMF / Modular Avatar

---

## 2. 本轮采用的主要资料来源

### 本地源码（优先级最高）

- `Packages/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/HapticUtils.cs`
- `Packages/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketEditor.cs`
- `Packages/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs`
- `Packages/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs`
- `Packages/com.vrcfury.vrcfury/Editor-Avatars/Service/HapticContactsService.cs`

这些文件用于校对 SPS / TPS / Socket / Plug 的 contact tag、发送器 / 接收器语义，以及 Sensa 与 VRCFury 的兼容边界。

### 公开资料

- TCode 规范：<https://github.com/multiaxis/TCode-Specification>
- OSR2 参考固件：<https://github.com/multiaxis/OSR2-Arduino>
- OSR 模拟器：<https://github.com/ayvasoftware/osr-emu>
- T-Code 词条：<https://funscript.wiki/wiki/T-Code>
- VoiceScriptPlayer TCode 文档：<https://voicescriptplayer.github.io/vspdocs/zh/device/tcode/>
- Buttplug / Intiface 官方文档
- NDMF 官方文档
- Modular Avatar 官方文档

---

## 3. 各子系统当前“实际上做了什么”

### 3.1 Unity 侧构建与参数生成

- `SensaComponent` 用于声明 Socket / Plug / 辅助信号配置。
- `SensaProcessor` 在构建阶段生成 VRChat Contact Sender / Receiver 与参数定义。
- 兼容行为应以本地已安装的 VRCFury 源码为准，而不是凭记忆推断。
- 本轮确认：此前已经修正过的 SPS / TPS 标签使用方向，与本地 VRCFury 源码一致。

### 3.2 OSC 接收

- `OscReceiver` 监听 UDP，解析 `/avatar/parameters/*` 与 `/avatar/change`。
- `ParameterStore` 线程安全缓存所有已见过的参数路径。
- Avatar 变化时会清空参数并重置信号平滑状态，避免旧头像的 EMA 状态泄漏到新头像。

### 3.3 信号处理与融合

- 每路信号都按“标定 → EMA → 死区 → 曲线”处理。
- `SignalFusion` 负责把多个角色合并为单个 `DeviceCommand`。
- `Depth` / `Vibrate` 多路取最大值；`Gate` 任一路 `< 0.5` 即关闭门控。

### 3.4 SafetySystem / 主循环

- `Routine` 是 50Hz 左右的主循环，读取参数、处理信号、套 Safety、再发送到设备。
- `SafetySystem` 负责：
  - 强度上限
  - 启动渐变
  - idle 行为
  - emergency stop

### 3.5 TCode 串口层

- `TCodeSerial` 使用 `SerialPort`，波特率 `115200`。
- 使用 `WriteLine(...)` 发送命令，因此命令天然带换行提交。
- 按用户配置把归一化 `[0,1]` 映射到 `[MinPos, MaxPos] / 1000`。
- 默认统一发送 `L0 / R0 / R1 / R2 / L1 / L2`；设备是否接受某个轴，取决于固件能力。

### 3.6 Intiface / Buttplug 层

- `IntifaceTransmitter` 按 Buttplug v5 的 feature-based API 工作。
- 如果设备支持 Position 输出，则对线性特征发送 `PositionWithDuration.Percent(...)`。
- 如果设备没有线性输出但有振动，则退回到振动控制。
- 如果启用了内置引擎托管且本地缺少 `intiface-engine.exe`，服务会记录日志并继续运行，不会拖垮其它功能。

### 3.7 WebUI

- WebUI 现在是 Companion 的主控台，而不是只读面板。
- 当前支持：
  - 配置编辑
  - 信号表编辑
  - 手动测试
  - 录制导出
  - 参数 / 日志监控
  - TCode / Intiface 状态摘要
  - 串口枚举刷新
  - 主题切换
  - 中英切换（已实现基础文案切换，仍可继续补全更广覆盖）

---

## 4. 本轮确认的问题

### 问题 A：`index.html` 存在整页重复内容

审计时发现 `program/wwwroot/index.html` 在第一个 `</html>` 之后又拼接了一整份旧版页面，属于无效结构。

**影响：**

- DOM 结构不可信
- 页面行为可能依赖浏览器的容错解析
- 新旧页面元素并存，容易让 `app.js` 与实际 DOM 对不上

**处理：** 已移除重复页面内容。

### 问题 B：`app.js` 与新版 HTML 结构不一致

审计时确认：页面里已经有 `langToggleBtn`、`themeToggleBtn`、`refreshPortsBtn`、`tcodeStatusRow`、`intifaceStatusRow`、`intifaceDeviceList` 等新元素，但旧 `app.js` 不认识它们。

**处理：** 已重写 WebUI 控制器，使其与当前页面结构一致。

### 问题 C：串口刷新 UI 没有后端接口

页面提供了“刷新 COM 口”按钮，但后端没有对应元数据接口。

**处理：** 已新增：

- `GET /api/meta/serial-ports`

其当前实现使用 `SerialPort.GetPortNames()` 返回本机可见 COM 口列表。

### 问题 D：`GateOpen=false` 时 `StayAtPosition` 语义不严谨

原实现里，`IdleBehavior.StayAtPosition` 直接返回 `raw`。这意味着：

- 即使 Gate 已经关闭，
- 只要上游原始信号还在变，
- 输出仍可能继续跟随新输入，而不是真正“保持当前位置”。

**处理：** 已改为保存最近一次通过 SafetySystem 的安全输出；Gate 关闭且 idle 为 `StayAtPosition` 时，保持该安全输出，而不是继续跟随新的原始融合值。

### 问题 E：WebUI 声明了大量 `data-i18n` 键，但前端词典覆盖不足

第二轮复查时，将 `index.html` 中的 `data-i18n` / `data-i18n-placeholder` / `data-i18n-data-tip` 键与 `app.js` 中实际提供的词典键做了对比，确认仍存在大量缺口。

**影响：**

- 切换英文后会出现“部分控件还是中文、部分控件直接显示 key 名”的半本地化状态；
- 提示语、按钮文案、Tab 标题与帮助页说明无法保持一致；
- 页面结构虽然正确，但国际化契约并不完整。

**处理：** 已为当前页面结构补齐缺失的中英双语键，并一并补上 placeholder / tooltip 相关文案。

---

## 5. 本轮已完成的修复

1. 删除 `index.html` 中重复拼接的旧页面内容。
2. 重写 `program/wwwroot/app.js`，对齐当前 DOM：
   - 主题切换
   - 基础中英切换
   - 串口刷新
   - TCode / Intiface 状态行
   - Intiface 设备列表
   - 手动测试状态同步
3. 在 `Program.cs` 中新增 `GET /api/meta/serial-ports`。
4. 修复 `SafetySystem` 中 Gate 关闭时的 idle / hold 语义。
5. 为新增状态块补了样式，避免界面信息“能显示但不好看”。
6. 补齐 WebUI 当前页面所声明的大部分 i18n 键，避免英文切换时出现半本地化状态。

---

## 6. 已验证结果

### 编译验证

已在 `Assets/UnityBox/Sensa/Companion/Sensa.sln` 上执行构建，结果：

- `dotnet build` 成功

### 运行验证

已启动 Companion，并验证以下行为：

- `GET /api/meta`
- `GET /api/config`
- `GET /api/state/overview`
- `GET /api/state/parameters`
- `GET /api/state/logs`
- `GET /api/ws`

均可正常响应。

### WebUI 验证

在运行态页面中已确认：

- 页面可正常加载
- 测试页的 TCode / Intiface 状态摘要可显示
- COM 口输入框可显示当前端口值与刷新按钮
- 语言切换按钮可触发界面文案刷新

### Gate 语义验证

已通过 `PUT /api/manual-test` 手动注入以下测试：

- `gateOpen = false`
- 同时故意给出较大的 `l0/r0/r1/r2/l1/l2/vibrate`

之后读取 `GET /api/state/overview`，结果显示 `loop.command` 为：

- `l0 = 0`
- `r0/r1/r2/l1/l2 = 0.5`
- `vibrate = 0`
- `gateOpen = false`

这说明 Gate 关闭后，当前实现确实回到了 idle 语义，而不是继续跟随原始输入。

---

## 7. 当前仍值得继续关注的边界

1. **中英切换还可继续补全文案覆盖率。**
   - 当前主页面结构所声明的键已补齐，但后续新增控件仍需继续遵守同一套 i18n 契约。

2. **TCode 速度项 `Sxxxx` 的细节仍可继续对照更底层固件实现做专项校验。**
   - 本轮已经确认了轴命名、数值范围、换行提交与实时控制的总体语义；
   - 若后续要继续抠更细的速度估算与固件内部平滑逻辑，建议直接再对照具体固件源码做二次审计。

3. **Intiface 实机验证仍受本地是否存在 `intiface-engine.exe` 影响。**
   - 本轮已验证“缺失时不阻塞系统”；
   - 但设备扫描 / 连接的完整闭环，仍建议在有实际 Buttplug 设备的机器上继续跑一次。

---

## 8. 结论

截至本轮，Sensa 的以下结论已经可以较有把握地成立：

- Unity 侧的 VRCFury 兼容标签应以本地安装包源码为准，本轮已按此修正并复核；
- Companion 的主循环、信号处理、WebSocket 推送与设备发送链路已经被逐段阅读；
- WebUI 之前确实存在“结构与控制器不同步”的问题，本轮已修正；
- `GateOpen` 之前在 `StayAtPosition` 语义下存在实现缺口，本轮已修复并实测验证；
- TCode 部分的轴命名、范围与换行提交语义，现已由公开规范与参考实现交叉支撑，不再依赖主观猜测。

如果后续继续做下一轮审计，建议优先方向是：

1. 用真实 TCode 设备继续验证不同固件的 `Sxxxx / Ixxxx` 体感差异；
2. 在有 Buttplug 设备的环境下完成 Intiface 全链路实机验证；
3. 继续补全 WebUI 的英文本地化覆盖。
