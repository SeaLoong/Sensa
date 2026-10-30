# 适配器目录与拆包路线

**简体中文** | [English](adapter-catalog.en.md)

本页供开发者复用 Sensa 组件和规划社区包。Node CLI、Electron 与 WebSensa 共用 TypeScript 应用、输出协调器和 React 工作台；Unity 作者与构建包继续使用 C#。下面八个 TypeScript 包名及一个 Python 工具名均为候选，尚未发布或保留 scope。[宿主架构](adr/0011-shared-core-and-capability-adapters.md)

## 当前实现与源码入口

| 入口 | 职责 |
| --- | --- |
| [`src/core/index.ts`](https://github.com/SeaLoong/Sensa/blob/main/src/core/index.ts) | 公开源码入口：`RuntimeEngine`、`ApplicationFacade`、`OutputCoordinator`、配置、信号、定位、脚本与录制 |
| [`src/core/outputs/index.ts`](https://github.com/SeaLoong/Sensa/blob/main/src/core/outputs/index.ts) | 纯共享输出协调、编码、特征路由、生命周期与录制／回放 |
| [`src/node/index.ts`](https://github.com/SeaLoong/Sensa/blob/main/src/node/index.ts) | `startSensa` 本地服务、实例与启动选项 |
| [`src/node/inputs/index.ts`](https://github.com/SeaLoong/Sensa/blob/main/src/node/inputs/index.ts) | 协议监听、OSC／OSCQuery、发现、来源与外部控制会话 |
| [`src/node/outputs/index.ts`](https://github.com/SeaLoong/Sensa/blob/main/src/node/outputs/index.ts) | Node 输出工厂、原生端口与设备 API |
| [`src/websensa/browser-runtime.ts`](https://github.com/SeaLoong/Sensa/blob/main/src/websensa/browser-runtime.ts) | 浏览器本地宿主，注入存储与浏览器适配器，挂载同一 Workbench |

Node 输出工厂注册 **20 种输出类型**，具体可用项由宿主能力清单给出：

| 类型组 | 配置类型 |
| --- | --- |
| TCode（4） | `TCodeSerial`、`TCodeUdp`、`TCodeTcp`、`TCodeWebSocket` |
| 设备／厂商（6） | `Intiface`、`Dglab`、`Handy`、`Autoblow`、`VacuGlide`、`Lovense` |
| 信号／文件（6） | `OscParameter`、`HttpJson`、`WebSocketJson`、`Mqtt`、`Midi`、`Recording` |
| 桥接与互联（4） | `Bluetooth`、`BleBridge`、`SensaHttp`、`SensaWebSocket` |

本地输入注册 **12 种类型**：`Buttplug`、`TCodeTcp`、`TCodeUdp`、`TCodeSerial`、`TCodeWebSocket`、`IntifaceDevice`、`JsonHttp`、`JsonWebSocket`、`LovenseHttp`、`HandyHttp`、`AutoblowHttp`、`VacuGlideHttp`。OSC／OSCQuery 由独立服务接收；HTTP／WebSocket 输入共用端口并按最长完整路径分派。浏览器使用同一核心及其可用传输子集。[协议输入](protocol-inputs.md)

## 直接复用的库与平台能力

| 库／API | 仓库内职责 | 平台与许可 |
| --- | --- | --- |
| React／React DOM | 共用工作台组件与渲染 | 浏览器／Electron；MIT |
| esbuild | 浏览器、Node 与 Electron 构建 | 构建工具；MIT |
| Three.js | 参数图解三维场景，同时保留 SVG | 浏览器 WebGL；MIT |
| qrcode-generator | 配对二维码 | JavaScript；MIT |
| Mermaid tiny | 随站点分发的文档流程图 | 浏览器；MIT |
| `ws` | 实际 Node 客户端、监听与协议测试对端 | Node；MIT |
| `bonjour-service` | OSCQuery mDNS 公告、发现与清理 | Node；MIT |
| `proper-lockfile` | 配置文件的进程归属与恢复 | Node；MIT |
| `serialport` 13.0.0 | N-API 串口绑定 | Node 24；MIT |
| `@julusian/midi` 3.8.1 | N-API MIDI 端口访问 | Node 24；MIT |
| Web Serial／Bluetooth／MIDI | 浏览器设备发现、选择和 I/O | 浏览器与系统提供 |
| Bleak／Bless／PyWinRT／pyserial | Python 桥的 BLE central／peripheral 与串口 | 按 OS／角色选择；保留各依赖许可 |

原生串口／MIDI 通过 `src/node/native-packages.ts` 加载。SEA 包内含对应依赖，校验后提取至私有目录；Electron 使用同一 Node 服务，不在渲染进程另载一套绑定。Python 桥工具随便携包、CLI 安装器及 Electron 附带，解释器和所需依赖由使用者准备。[开发与打包](development.md)

## 可继续评估的复用候选

以下元数据核对于 **2026-10-30**，不是新增运行依赖：

| 候选 | 已核实范围 | 适合评估的用途 |
| --- | --- | --- |
| [`buttplug` 5.0.2](https://www.npmjs.com/package/buttplug/v/5.0.2) | 官方 BSD-3-Clause wire-v3 参考实现 | v3 客户端与共享协议夹具 |
| [`@zendrex/buttplug.js` 0.5.0](https://www.npmjs.com/package/@zendrex/buttplug.js/v/0.5.0) | MIT、类型化 wire-v4、`zod: ^4.4.3`、WS／WASM 路径 | v4／WASM 适配器与可选设备运行时 |
| [`webbluetooth` 7.1.0](https://www.npmjs.com/package/webbluetooth/v/7.1.0) | MIT、Node Web Bluetooth 形状的接口 | Node central 访问 |

合适的库可替换小型协议实现，外围继续保留连接归属、声明量程、取消与停止屏障。按实际 API、发布包和协议夹具比较选型。

## 八个 TypeScript 拆包候选

### 共享应用核心：`@sensa/core`

源码为 `src/core/runtime`、`src/core/outputs` 与 `src/core/protocols`，由 `src/core/index.ts` 导出。`RuntimeEngine` 统一模式、输入启用、映射、计算、定位、脚本与动作；`ApplicationFacade` 统一命令与快照；纯 `OutputCoordinator` 统一连接和绑定求值。宿主注入时间、存储、交付与设备工厂。

证据：`tests/runtime/domain-configuration.test.ts`、`domain-runtime.test.ts`、`domain-parity.test.ts`、`tracking.test.ts`，以及 `tests/node/output-coordinator.test.ts` 与浏览器本地宿主测试。拆包时保留完整应用行为，避免另建简化引擎。

### Funscript：`@sensa/funscript`

`src/core/funscript.ts` 提供解析与采样，`src/core/runtime/script.ts` 管理时钟、速度、循环、定位和自然结束；`src/core/outputs/recording.ts` 处理轨道片段与回放。可独立复用解析／时钟，不引入设备或窗口。

证据：共享 `tests/fixtures/funscript-interop.json`、`tests/web/websensa-interop-vectors.test.mjs` 与领域脚本契约。自然结束保留末值和输入激活，显式停止保持独立语义。

### Buttplug：`@sensa/buttplug-client`

Node 客户端位于 `src/node/outputs/intiface.ts`，实现 wire v4、请求关联、Ping、设备／特征元数据、声明量程及设备归属池。浏览器 `src/websensa/transports.ts` 的 `IntifacePeer` 使用 wire v3；虚拟设备输入的纯 v2／v3／v4 会话位于 `src/core/protocols/buttplug-input.ts`。

Node WebSocket 传输负责完整消息、UTF-8、1 MiB 上限与失败清理；协议解析和设备映射保留各自职责。证据：`tests/node/output-intiface.test.ts`、`input-codecs.test.ts`、`input-transports.test.ts`、`tests/web/websensa-transports.test.mjs` 与 Intiface E2E。独立包优先统一可注入 socket 接口与共享夹具。

### TCode：`@sensa/tcode`

纯输入解析／分帧位于 `src/core/protocols/tcode-input.ts`，输出编码位于 `src/core/outputs/codecs.ts`。Node 适配器负责串口、UDP、TCP、WebSocket 与 WSDM；浏览器适配器负责 Web Serial／WebSocket。编码保留轴、量程、到达时长与已知位置速度语义。

证据：`tests/node/input-codecs.test.ts`、`input-transports.test.ts`、`input-websocket-epoch.test.ts`、`output-codecs.test.ts`、`output-io.test.ts` 与协议复用 E2E。拆包时把文本／字节协议与端口创建分开。

### BLE 编解码：`@sensa/ble-codecs`

纯实现为 `src/core/protocols/ble.ts`，浏览器驱动为 `src/websensa/device-codecs.ts`，Python 参考实现为 `tools/protocol-bridge/bridge.py`。

| 配置 | 命令模型 | 依据 |
| --- | --- | --- |
| LOOB | 四字节位置／时长 | 公开 FapTap 连接器 |
| Thrust Sync | 三字节位置／时长 | 公开 FapTap 连接器 |
| Svakom V1 | 六字节单振动指令 | Buttplug Emma／Phoenix Neo／Ella 配置 |
| Lovense 单振动 | `Vibrate:0;`–`Vibrate:20;` | Buttplug Lovense 命令与 GATT 配置 |
| Youou VX001 | 十七字节序号／异或帧，强度 0–247 | Buttplug Youou／VX001 配置 |

Buttplug 依据固定于 [`179b0d9`](https://github.com/buttplugio/buttplug/tree/179b0d9306f519912c10bdddd111686622b7f63a)，[桥工具文档](../tools/protocol-bridge/README.zh-CN.md#来源与验证)提供各编码链接。`tests/web/websensa-device-codecs.test.mjs` 比较五种配置的 35 组 TypeScript／Python 向量；模拟 GATT E2E 检查浏览器交付，实机结果单独记录。

### 浏览器设备：`@sensa/browser-devices`

`src/websensa/transports.ts`、`device-codecs.ts` 与 `browser-outputs.ts` 在浏览器 API 上提供设备选择、单持有者、MIDI 映射归属、交付期限及迟到操作清理。`createBrowserOutputFactory` 将这些能力注入同一输出协调器。

证据：`tests/web/websensa-transports.test.mjs`、`websensa-device-codecs.test.mjs`、浏览器宿主单元与蓝牙 E2E。设备授权留在用户连接动作，公开接口可注入测试对端。

### 生命周期：`@sensa/transport-lifecycle`

`src/core/outputs/lifecycle.ts` 提供有界 `OutputLane` 与停止代次屏障；`coordinator.ts` 处理状态／事件交付和关闭。Node 的 Intiface／MIDI 池、浏览器连接池分别保留设备归属；HTTP 输入端口复用与跨标签页会话共享属于独立层次。

证据：`tests/node/output-coordinator.test.ts`、`output-intiface.test.ts`、`output-io.test.ts`、`tests/web/shared-realtime.test.mjs` 与复用 E2E。纯包不引入 DOM；SharedWorker／Web Locks／BroadcastChannel 由外层封装。

### 能力清单：`@sensa/capabilities`

浏览器入口为 `src/websensa/capabilities.ts`，Node 为 `src/node/outputs/capabilities.ts`。它们检查可调用 API、实际原生导出及桥依赖，查看清单不会打开设备；界面依据宿主能力呈现可选项。

证据：`tests/web/websensa-capabilities.test.mjs`、Node 输出／桥测试与跨浏览器 E2E。能力与 UI 文案、平台名称分开，真实连接行为另由适配器执行。

## Python 工具与历史上游贡献

独立工具候选 **`sensa-protocol-bridge`** 尚未发布。Bleak 提供 central 输出，Bless 提供 Linux／macOS 外设输入，原生 PyWinRT 提供 Windows 外设输入，pyserial 提供串口。五种 BLE 配置共用 TCP／TCode 桥接；Lovense 当前提供输出指令，其他文档列明的输入配置提供已实现的 GATT 命令接口。`tests/scripts/test_protocol_bridge*.py` 与 `tests/node/output-bridge.test.ts` 检查编码、进程归属和清理。

历史 C# 连接器对上游的改进依据保留在 Sensa [`941febb`](https://github.com/SeaLoong/Sensa/tree/941febb7b760cab37000d3bf54e7ccf756201b22)：[连接器](https://github.com/SeaLoong/Sensa/blob/941febb7b760cab37000d3bf54e7ccf756201b22/src/Outputs/Intiface/IntifaceWebSocketConnector.cs)、[分片复现](https://github.com/SeaLoong/Sensa/blob/941febb7b760cab37000d3bf54e7ccf756201b22/tests/Sensa.Tests/Contracts/IntifaceWebSocketTransportContracts.cs)和[量程契约](https://github.com/SeaLoong/Sensa/blob/941febb7b760cab37000d3bf54e7ccf756201b22/tests/Sensa.Tests/Contracts/IntifaceFeatureRoutingContracts.cs)。固定 Buttplug C# [`ec8e6ff`](https://github.com/buttplugio/buttplug-csharp/tree/ec8e6ff175e33dd75778cc91c485ec1a24353915)／NuGet 5.0.1 的 2048 字节接收块与百分比量程行为，已由大设备表、分片、跨 UTF-8 字符与声明最小值用例复现。提交上游前重新核对当前版本，避免重复报告。它们是历史复现依据，当前宿主使用上面的 TypeScript 实现。

## 独立发包顺序与要求

1. 稳定 core／funscript 和纯 TCode／BLE API，保留跨宿主夹具。
2. 分离协议编解码、设备归属与系统绑定，保留取消、迟到操作和停止回归。
3. 检查固定上游版本的最小复现，合适的修复先贡献上游。
4. 明确公开导出、单位、能力发现、错误与释放顺序，在干净消费工程验证 `npm pack`、声明、source map、Node 导入及浏览器构建。
5. 确认包名／scope、语义化版本与许可归属，再发布；wire 协议版本单独管理。

Sensa 代码使用 MIT；打包上游内容保留其条款和声明，包括 TypeScript 的 Apache-2.0 与 Buttplug 的 BSD-3-Clause。发行包的 `THIRD-PARTY-NOTICES.txt` 保留实际依赖许可。每项验证分别注明模拟、真实协议对端、操作系统与实体设备范围。

[开发与兼容策略](development.md) · [共享核心决策](adr/0011-shared-core-and-capability-adapters.md)
