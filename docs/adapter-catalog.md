# 适配器目录与拆包路线

**简体中文** | [English](adapter-catalog.en.md)

本页供开发者复用 Sensa 组件、规划社区包。以下包名为候选名称，尚未发布或保留 npm scope。当前桌面发行仍使用 .NET 服务，共享 TypeScript 核心与浏览器适配器是首批迁移内容。[宿主架构](adr/0011-shared-core-and-capability-adapters.md)

## 怎样选择实现

现成库已经提供协议、平台或渲染能力时直接复用，再用薄适配器处理 Sensa 的归属与生命周期。已核实的格式或应用需求需要时，实现小型协议层。目录逐项记录选择依据，不据此推断某个生态“没有可用库”。

| 分类 | 当前方式 | 拆分方向 |
| --- | --- | --- |
| 现成库 | 复用维护中的依赖并保留许可证说明 | 保留为依赖，改进优先回馈上游 |
| 封装／改进 | 保留库或系统 API，补充有界交付和资源归属 | 有其他使用者需要时独立提供适配器 |
| Sensa 自研 | 纯类型化引擎、编解码与生命周期组件 | 以稳定公开 API 和共享夹具拆出小包 |

## 直接使用的现成库

| 库／API | 仓库内职责 | 平台 |
| --- | --- | --- |
| React／React DOM | 工作台组件与渲染 | 浏览器；隔离测试中服务端渲染 |
| esbuild | 构建同一 WebSensa 源码与依赖说明 | Node 构建工具；目标 Chrome 110、Firefox 115、Safari 16 |
| Three.js | 参数图解三维场景 | 浏览器 WebGL，图解同时提供 SVG 视图 |
| qrcode-generator | 配对二维码编码 | JavaScript，桌面 WebUI 使用 |
| Mermaid tiny | 本地文档流程图 | 浏览器文档资源 |
| `ws` | Node 测试中的真实 WebSocket 对端 | Node 测试设施，尚非已发布 Node 服务 |
| Buttplug NuGet 5.0.1 | 桌面 wire-v4 消息、客户端和特征模型 | 当前 .NET 桌面宿主 |
| Bleak／Bless／PyWinRT | 桥工具的 OS BLE central／peripheral 绑定 | Python，按 OS 和角色选择后端 |

Web Serial、Web Bluetooth 和 Web MIDI 适配器直接使用浏览器 API，OS 蓝牙栈由浏览器与系统提供。Node／Electron 系统适配器将在相同引擎接口后使用自己的平台绑定。

## 已核实的复用候选

设备审查于 **2026-10-30** 核对了固定版本注册表元数据与所列 Buttplug README。它们是待评估候选，不是本目录新增的依赖。

| 候选 | 发布方说明与许可 | 可以用于 |
| --- | --- | --- |
| [`buttplug` 5.0.2](https://www.npmjs.com/package/buttplug/v/5.0.2) | 官方 BSD-3-Clause wire-v3 参考实现，README 推荐下面的社区客户端 | 扩展 v3 客户端复用与共享协议夹具 |
| [`@zendrex/buttplug.js` 0.5.0](https://www.npmjs.com/package/@zendrex/buttplug.js/v/0.5.0) | MIT、类型化 wire-v4、`zod: ^4.4.3` schema 依赖、元数据量程与 WS／WASM 路径 | 优先评估 v4／WASM 适配器及其可选 `buttplug-wasm-blob` 设备运行时 |
| [`serialport` 13.0.0](https://www.npmjs.com/package/serialport/v/13.0.0) | MIT Node 串口绑定，要求 Node >=20 | 未来 Node／Electron 串口宿主适配器 |
| [`webbluetooth` 7.1.0](https://www.npmjs.com/package/webbluetooth/v/7.1.0) | MIT、Node 的 Web Bluetooth 接口实现 | 在浏览器形状的适配器接口后评估 Node central 访问 |

匹配的库可以替换 Sensa 小型协议客户端，外围仍保留地址归属、取消与停止屏障契约。选型时对照当前 API、平台打包与实际夹具。Node 提供浏览器形状的接口，并不为普通网页增加外围广播能力。

## 我们封装或改进的能力

### 桌面 Buttplug 有界传输

当前代码：`src/Outputs/Intiface/IntifaceWebSocketConnector.cs`、`IntifaceConnection.cs` 和 `IntifacePositionFeatures.cs`。连接器保留上游 Buttplug 解析与请求关联，补充完整消息聚合、严格 UTF-8、1 MiB 消息上限、JSON 深度校验、顺序写入，以及连接失败／取消后的清理。

已核实的上游版本为 Buttplug C# 提交 [`ec8e6ff`](https://github.com/buttplugio/buttplug-csharp/tree/ec8e6ff175e33dd75778cc91c485ec1a24353915)，对应 NuGet 5.0.1。该连接器把固定 2048 字节的接收块当作消息，Sensa 回归测试重现了大设备表、分片与跨 UTF-8 字符失败。默认百分比构造还需要 Sensa 特征映射补充声明最小值的处理。这是具体版本的可复现发现，不推断所有最新上游版本都有相同缺陷。

测试：`IntifaceWebSocketTransportContracts.cs`、`IntifaceFeatureRoutingContracts.cs`、`IntifaceInitializationContracts.cs`、`tests/e2e/intiface-fragmented.spec.js`。最小分片／量程复现适合向上游贡献；未来 JavaScript 包复用这些协议夹具，而不是把 C# 连接器复制一份。

### 浏览器设备归属

候选：**`@sensa/browser-devices`**。当前适配器位于 `src/websensa/transports.ts` 和 `src/websensa/device-codecs.ts`，提供串口单持有者、Intiface 设备单持有者、MIDI 端口／通道／控制器单映射，以及操作期限和迟到原生操作的清理。

浏览器负责设备发现、授权与写入，适配器负责应用所需的共享规则。这是生命周期需求，不是 Web Serial／MIDI／Bluetooth API 缺失的证据。注入接口让单元测试在不打开设备的情况下检查关闭、超时与归属竞争。

测试：`tests/web/websensa-transports.test.mjs`、`websensa-device-codecs.test.mjs` 和 `tests/e2e/websensa-bluetooth.spec.js`。权限窗口由浏览器宿主触发，Node／Electron 使用原生绑定提供对应引擎操作。

### 原生 BLE 桥

候选：独立 Python 工具 **`sensa-protocol-bridge`**。当前代码为 `tools/protocol-bridge/bridge.py`，固定依赖清单位于同目录。Bleak 提供 central 输出，Bless 提供 Linux／macOS 外设输入，WinRT 后端提供 Windows 外设输入，pyserial 负责串口 I/O。

LOOB、Thrust Sync、Svakom V1、Lovense 单振动和 Youou VX001 共用 TCP／TCode 桥接。Lovense 当前提供输出指令，其余文档列明的输入配置可以广播已实现的 GATT 命令接口。普通浏览器页面提供 central 访问，而外围广播依赖原生宿主，这就是保留桥工具的具体用途。

测试：`tests/scripts/test_protocol_bridge.py`、`test_protocol_bridge_windows.py`、`tests/e2e/protocol-bridge.spec.js` 和 `websensa-bluetooth.spec.js`。协议编码改进可回馈 Buttplug，若问题来自 OS 绑定，则向 Bleak／Bless／PyWinRT 提供修复。

## 适合独立拆分的 Sensa 组件

### 共享引擎与 funscript

候选：**`@sensa/core`**；有独立使用需求时再拆 **`@sensa/funscript`**。公开入口为 `src/core/index.ts`，实现为 `engine.ts`、`funscript.ts` 和 `types.ts`。

核心拥有归一化轴帧、手动／脚本／图解来源状态、脚本时钟、录制与独立输出队列。解析／采样覆盖反向脚本、重复时间戳、非零首目标、插值和时长。时钟、调度与 `OutputTransport` 可注入，纯核心不导入浏览器设备 API 或 Electron。

测试：`tests/web/websensa-controller.test.mjs`、`websensa-interop-vectors.test.mjs`、共享 `tests/fixtures/funscript-interop.json` 与桌面 `FunscriptInteropContracts.cs`。迁移时继续共享夹具，让方向、端点与时序遵循同一约定。

### 浏览器 Buttplug 客户端

候选：**`@sensa/buttplug-client`**。当前实现为 `src/websensa/transports.ts` 中的 `IntifacePeer` 与连接获取逻辑。它协商 wire v3、关联响应、维持 Ping、刷新设备功能，并让不同设备共用一个 socket。一条设备输出可以合并其映射功能的命令。

浏览器已经交付完整 WebSocket 消息，适配器对解析消息、批次和发送背压设置边界，不重复实现原生 WebSocket 分片。[官方 Buttplug JavaScript 客户端](https://github.com/buttplugio/buttplug-js)仍是扩大协议覆盖时的复用候选。拆出 Sensa 小客户端前，先比较其当前 API 与打包方式；现有实现围绕已验证的 v3 子集和 Sensa 归属／停止契约编写。

测试：`tests/web/websensa-transports.test.mjs`、`tests/e2e/websensa.spec.js` 和 `websensa-desktop-interop.spec.js`。独立包应把纯消息／schema 处理与可注入的 WebSocket 实现分开。

### TCode 分帧与连接

候选：**`@sensa/tcode`**。共享编码器通过 `src/core/index.ts` 从 `funscript.ts` 导出，浏览器串口／WebSocket 适配器位于 `src/websensa/transports.ts`。桌面输入分帧与解析位于 `src/Input/Protocols/TCodeProtocol.cs`、`TCodeInputService.cs` 和 `TCodeWebSocketInput.cs`。

编码保留所选轴、TCode 小数值与到达时长。Web Serial 写入完整文本帧；TCode WebSocket 地址由一个整帧持有者管理。共享 HTTP 监听通过不同路径在同一 TCP 端口提供多个入口，WSDM 的二进制硬件分帧保留独立传输约定。

测试：`tests/web/websensa-controller.test.mjs`、`websensa-transports.test.mjs`、桌面协议契约、`tests/e2e/protocol-multiplex.spec.js` 和 `websensa-desktop-interop.spec.js`。先拆字节／文本编码，将串口选择和 socket 创建留给宿主适配器。

### BLE 编解码与元数据

候选：**`@sensa/ble-codecs`**。纯实现位于 `src/core/protocols/ble.ts`，浏览器驱动为 `src/websensa/device-codecs.ts`，Python 参考实现为 `tools/protocol-bridge/bridge.py`。

| 配置 | 命令模型 | 共用依据 |
| --- | --- | --- |
| LOOB | 四字节位置／时长 | 公开 FapTap 连接器 |
| Thrust Sync | 三字节位置／时长 | 公开 FapTap 连接器 |
| Svakom V1 | 六字节单振动指令 | Buttplug 编码与 Emma／Phoenix Neo／Ella 配置 |
| Lovense 单振动 | `Vibrate:0;`–`Vibrate:20;` 及支持的 GATT 系列 | Buttplug Lovense 命令与 GATT 配置 |
| Youou VX001 | 十七字节序号／异或帧，连续强度 0–247 | Buttplug Youou 编码与 VX001 配置 |

Buttplug 依据固定于 [`179b0d9`](https://github.com/buttplugio/buttplug/tree/179b0d9306f519912c10bdddd111686622b7f63a)，[桥工具文档](../tools/protocol-bridge/README.zh-CN.md#来源与验证)列出各编码与配置链接。当前代码独立实现已知包行为，没有复制 Rust 设备运行时。

测试：`tests/web/websensa-device-codecs.test.mjs`将五种配置的 35 组边界向量与实际导入的 Python 桥编码比较，同时覆盖生命周期单元与模拟 GATT 浏览器 E2E。数据包向量、单位、舍入、序号归属和停止指令归可移植包；GATT 发现、权限与连接清理由平台驱动负责。

### 队列、连接池与停止屏障

候选：**`@sensa/transport-lifecycle`**。输出队列位于 `src/core/engine.ts`，地址连接池与浏览器归属位于 `src/websensa/transports.ts`，桌面标签页共享位于 `src/web/shared-realtime.js` 与 `elected-realtime.js`。

这里有三个不同复用层：多输出队列共用理解设备的目标连接、多协议路由共用监听端口、多桌面标签页共用后端会话。独立包应明确区分范围。最新值合并、顺序命令、末目标与停止屏障归队列约定，协议／设备归属由使用连接池的适配器管理。

测试：`tests/web/websensa-controller.test.mjs`、`websensa-transports.test.mjs`、`shared-realtime.test.mjs` 和对应的浏览器复用／共享会话用例。包本身保持无 DOM，SharedWorker／Web Locks／BroadcastChannel 另外封装。

### 能力清单

候选：**`@sensa/capabilities`**。当前代码为 `src/websensa/capabilities.ts`，检查可调用的 WebSocket／fetch、设备方法、安全上下文与实际宿主工厂。查看清单不触发连接或权限请求，单独布尔标记不会注册原生适配器。

测试：`tests/web/websensa-capabilities.test.mjs` 与 WebSensa 界面／浏览器流程。能力检测独立于 UI 文案和宿主名称，Node 已有 WebSocket／fetch 或未来 Electron 桥都可提供对应适配器。

## 待迁移的本地服务能力

| 能力 | 当前实现 | Node／Electron 工作 |
| --- | --- | --- |
| OSC 包、UDP 接收与转发 | `src/Input/Osc/`、`src/Outputs/Adapters/OscSignalOutputCodec.cs` | 选择或适配 JS 编解码，再添加 UDP 宿主适配器与一致性夹具 |
| VRChat／OGB／SPS 解释与定位 | `src/Runtime/`、OSC 来源类及 Unity 协议源码 | 通过共享测试迁移来源、坐标框和单位语义 |
| 协议输入监听与路径复用 | `src/Input/Protocols/`，.NET Kestrel／TCP／UDP | 添加本地监听适配器，保留路由与会话行为 |
| 配置、进程归属与启动 | `src/Hosting/` 和 `src/Configuration/` | 实现 Node 服务持久化／IPC 与 Electron 外壳 |
| 原生 MIDI／串口／设备 API | 桌面适配器与 Python 桥 | 按 OS 评估平台绑定，接入类型化接口 |

目前尚无完整 Node 或 Electron 桌面宿主。表中是迁移任务，不是已经提供的 JavaScript 实现。[OSC 契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OscContracts.cs)、[来源选择](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OscSourceSelectionContracts.cs)、[协议契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/ProtocolMultiplexContracts.cs)与现有 Actions 工作流定义了需要保留的行为。

## 贡献与拆分顺序

1. 为固定 Buttplug C# 版本提供最小分片／量程复现与针对性修复，提交前核对当前上游版本，避免重复报告。
2. 稳定核心／funscript 和纯 TCode／BLE 编解码 API，它们宿主依赖较少，也有共用向量测试。
3. 将浏览器设备适配器与可注入 WebSocket／原生绑定分离，归属和迟到操作测试随包保留。
4. 通过核心接口迁移 OSC／本地监听和桌面外壳，能力匹配时优先使用已有平台库。
5. 完成下面的 API、许可、打包与跨宿主检查后，再发布独立包。

## 独立发包前的要求

- 定义公开导出、帧单位、能力发现、错误模型与取消／停止／释放顺序，纯入口不含浏览器或原生全局依赖。
- 在 TypeScript strict 检查下生成声明，使用实际打包文件检查 Node 直接导入与浏览器构建。
- 保留现有行为夹具，为拆出的适配器添加平台测试；分别记录模拟、真实协议对端与硬件结果。
- 对已发布 API 使用语义化版本，wire 协议单独版本化；当前仓库的开发期原位修改不构成已发布兼容承诺。
- 确认包名／scope 可用性与归属，按实际包含的代码检查许可证并保留要求的说明。
- Sensa 自有代码使用 MIT。Buttplug C#／Rust 来源使用 BSD-3-Clause；React、Three.js、ws、esbuild、Bleak、Bless、PyWinRT 各有对应说明，TypeScript 使用 Apache-2.0。复制或打包上游内容时保留其原条款。
- 在干净消费工程检查 `npm pack` 内容、导入、声明、source map 和许可证文件，区分编译器、测试、浏览器权限与运行时协议依赖。

[开发与兼容策略](development.md) · [共享核心决策](adr/0011-shared-core-and-capability-adapters.md)
