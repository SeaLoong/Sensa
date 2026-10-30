# Shared TypeScript core and capability adapters / 共享 TypeScript 核心与能力适配

## Decision / 决策

Use one TypeScript application runtime and one React workbench across browsers, Node.js and Electron. Signal behavior belongs to the shared core; hosts provide available system and device capabilities. The local service runs on Node.js. Electron embeds its workbench and launches the same packaged CLI as a service child. / 浏览器、Node.js 与 Electron 共用一份 TypeScript 应用运行时和 React 工作台。信号行为归共享核心，宿主提供可用系统与设备能力。本地服务使用 Node.js，Electron 内嵌其工作台并启动同一份打包 CLI 作为服务子进程。

Unity authoring, NDMF generation and SDK integration remain in the Unity C# package. Their OSC contracts are consumed by the TypeScript runtime. / Unity 作者组件、NDMF 生成与 SDK 集成继续保留在 Unity C# 包，输出的 OSC 契约由 TypeScript 运行时消费。

## Shared application / 共享应用

| Source / 源码 | Responsibility / 职责 |
| --- | --- |
| `src/core/runtime/runtime.ts` | `RuntimeEngine`: modes, input activation, scripts, tracking, computation and motion dispatch / 模式、输入启用、脚本、定位、计算与动作分发 |
| `src/core/runtime/application.ts` | `ApplicationFacade`: the command boundary used by all hosts / 所有宿主共用的命令入口 |
| `src/core/runtime/presentation.ts` | One workbench snapshot format / 统一工作台快照 |
| `src/core/runtime/configuration.ts` | Configuration decoding, validation and persistence state / 配置读取、校验与持久化状态 |
| `src/core/outputs` | Output coordination, ordered lanes, codecs, recording and replay / 输出协调、有序队列、编解码、录制与回放 |
| `src/core/protocols` | Reusable OSC, external-control and device protocol rules / 可复用 OSC、外部控制与设备协议规则 |
| `src/web/app.js`, `src/web/bootstrap.tsx` | One mounted workbench for every host / 所有宿主挂载同一工作台 |
| `src/web/runtime-client.ts` | Remote HTTP/WebSocket or local facade requests with the same UI interface / 将远程 HTTP／WebSocket 与本地应用请求统一为界面接口 |

Hosts inject clocks, output delivery, storage and transport/device factories. Existing PascalCase JSON configuration is decoded case-insensitively; persisted configuration uses canonical camelCase and resets transient activity. / 宿主注入时钟、输出交付、存储与传输／设备工厂。既有 PascalCase JSON 配置通过大小写不敏感读取兼容；保存采用规范 camelCase，并复位临时活动状态。

## Host ownership / 宿主归属

- **Browser:** `createBrowserWorkbench` creates the shared runtime, facade and output coordinator in the page. Browser adapters supply available WebSocket, HTTP, serial, Bluetooth and MIDI access. Local storage owns the profile; recording files belong to the page. / **浏览器：** `createBrowserWorkbench` 在页面内创建共享运行时、应用入口与输出协调器。浏览器适配器提供可用的 WebSocket、HTTP、串口、蓝牙与 MIDI；本地存储保存配置，录制文件由当前页面持有。
- **Node.js CLI:** `startSensa` owns the engine, configuration, listeners, files and device connections. Management HTTP/WebSocket serves the shared workbench. Configuration ownership and local IPC reuse one service for the same profile; independent instances coordinate their actual ports. / **Node.js CLI：** `startSensa` 持有引擎、配置、监听、文件与设备连接，通过管理 HTTP／WebSocket 提供共享工作台。配置归属与本地 IPC 为同一配置复用一项服务，独立实例协调各自实际端口。
- **Electron:** the main process launches the packaged Node single-executable application, waits for its ready URL and displays the shared workbench in a sandboxed renderer. Ready/shutdown IPC controls the child lifecycle; application commands use the service's HTTP/WebSocket facade. A reused CLI remains owned by its original launcher. / **Electron：** 主进程启动打包的 Node 单文件程序，等待实际就绪 URL，再在沙盒渲染进程显示共享工作台。就绪／停止 IPC 控制子进程生命周期，应用命令通过服务 HTTP／WebSocket 入口执行；复用的 CLI 仍由原启动者持有。

Register adapters by available capability. The UI uses host capabilities to present available input and output choices. Browser device selection invokes permission prompts; Node sockets, files and native modules stay in Node adapters; Electron owns windows and desktop lifecycle. / 按可用能力注册适配器，界面依据宿主能力呈现输入输出选项。浏览器设备选择触发授权，Node 网络、文件与原生模块留在 Node 适配器，Electron 管理窗口与桌面生命周期。

## Language and compatibility / 语言与兼容

TypeScript 7.0.2 checks the shared and host code with strict unknown-data boundaries, unchecked-index and optional-property checks, and erasable-only syntax. Node 24.22.2 is the local-service baseline. Production builds bundle the application; browser bundles target Chrome 110, Firefox 115 and Safari 16 syntax. Device APIs are detected at runtime. / TypeScript 7.0.2 对共享与宿主代码执行严格检查，包括 unknown 数据边界、索引／可选属性检查及可擦除语法。本地服务以 Node 24.22.2 为基线；生产构建打包应用，浏览器构建面向 Chrome 110、Firefox 115 与 Safari 16 语法，设备 API 在运行时检测。

Shared behavior is exercised with the same protocol bytes, funscript fixtures, virtual clocks and injected transports across hosts. Component tests use isolated loopback sockets; browser E2E and packaged CLI/Electron smoke run in Actions. These checks cover application and transport behavior; physical-device and Unity-client acceptance is recorded separately. / 各宿主使用相同协议字节、funscript 夹具、虚拟时钟与注入传输验证共享行为。组件测试使用隔离回环连接，浏览器 E2E 与打包 CLI／Electron 冒烟在 Actions 执行。这些检查验证应用与传输行为，实体设备与 Unity 客户端验收单独记录。

## Distribution / 分发

Node single-executable applications embed the runtime, application, web assets and packaged native dependencies. Electron distributions include that same service executable. Main checks publish development previews; stable publication remains a separate Release workflow. Generic Download links go directly to GitHub's latest stable release. / Node 单文件程序内含运行时、应用、网页资源及打包原生依赖，Electron 分发包包含同一服务程序。main 检查发布开发预览，正式版由独立 Release 工作流发布。通用下载链接直接指向 GitHub 最新正式版。

[Architecture / 架构](../architecture.md) · [English](../architecture.en.md) · [Adapter catalog / 适配器目录](../adapter-catalog.md) · [English](../adapter-catalog.en.md)
