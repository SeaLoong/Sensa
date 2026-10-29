# Shared TypeScript core and capability adapters / 共享 TypeScript 核心与能力适配

## Decision / 决策

Use one TypeScript signal engine and one WebUI across browser, Node.js and Electron hosts. Separate device and system capabilities from signal behavior. Node.js is the target for the local service; Electron supplies its embedded window and desktop integration. / 浏览器、Node.js 与 Electron 共用一份 TypeScript 信号引擎和一份 WebUI。设备与系统能力通过适配器提供，信号行为由核心统一实现。Node.js 是本地服务的迁移目标，Electron 提供内嵌窗口与桌面集成。

`src/core/index.ts` is the public engine entry. It exports the script sampler, signal engine, output lanes and common TCode encoding. Clock, scheduling and output transports are injected; these modules run directly in Node.js and bundle into WebSensa. / `src/core/index.ts` 是引擎公开入口，导出脚本采样、信号引擎、输出队列和共用 TCode 编码。时钟、调度和输出传输可注入；这些模块既可直接在 Node.js 运行，也可打包进 WebSensa。

The shared source uses TypeScript 7.0.2 strict checking with explicit unknown-data boundaries, unchecked-index/optional-property checks and erasable-only syntax. Node 24 is the development baseline; esbuild provides the browser build for Chrome110/Firefox115/Safari16 syntax. Runtime device capabilities are detected separately. / 共享源码使用 TypeScript 7.0.2 严格检查，明确 unknown 数据边界、索引／可选属性检查和可擦除语法。Node 24 为开发基线，esbuild 面向 Chrome110／Firefox115／Safari16 构建浏览器语法，设备能力在运行时单独检测。

## Hosts and ownership / 宿主与状态归属

- Browser: a local engine uses available browser adapters. UI and device selection remain in the page. / 浏览器：本地引擎使用浏览器提供的适配器，界面与设备选择留在页面。
- Node.js: one service owns the engine, configuration, listeners and device connections; a browser can open its WebUI. / Node.js：一个服务拥有引擎、配置、监听和设备连接，浏览器可打开其 WebUI。
- Electron: the host owns one engine; the renderer uses the same UI through a narrow command/event interface. / Electron：宿主拥有一个引擎，渲染进程通过明确的命令与事件接口使用同一份界面。

Register adapters by actual available capability. The core consumes their interfaces instead of branching on browser or Electron names. A host exposes its capability inventory to the UI so the UI presents usable operations. / 适配器按实际可用能力注册。核心使用接口，不按浏览器或 Electron 名称散布条件分支。宿主向界面提供能力清单，界面据此呈现可用操作。

Protocols, transforms, script timing, routing and recording belong in the shared core. Browser permission prompts, Node sockets/files and native device bindings belong in adapters. Electron window, tray and startup behavior belong in its shell. / 协议、换算、脚本时钟、路由和录制归共享核心；浏览器授权、Node 网络与文件、原生设备绑定归适配器；窗口、托盘和启动行为归 Electron 外壳。

## Migration / 迁移

The initial shared engine covers WebSensa manual control, funscript, recording, external parameter samples and independent output queues. The current desktop application still runs the .NET service. Move its signal processing, source/session management and local transports behind the common engine interfaces before changing the desktop runtime. / 首批共享引擎覆盖 WebSensa 手动控制、funscript、录制、外部参数采样和独立输出队列。当前桌面程序仍运行 .NET 服务；先将信号计算、来源与会话管理、本地传输迁入共用接口，再切换桌面运行时。

Reuse protocol fixtures and behavior contracts during migration. `tests/fixtures/funscript-interop.json` already drives the browser/Node engine and desktop player with identical direction, interpolation and duration examples. Each migrated capability replaces its old implementation after equivalent behavior and platform checks pass. The destination is one maintained engine, not permanent parallel implementations. / 迁移复用协议夹具与行为契约。`tests/fixtures/funscript-interop.json` 已使用同一组方向、插值和时长示例验证浏览器／Node 引擎与桌面播放器。每项能力通过等价行为和平台检查后替换旧实现，最终维护一个引擎。

Browser APIs determine the browser host's available inputs and outputs. Raw OSC UDP and TCP/HTTP/WebSocket listeners use local-service adapters. JavaScript can implement those adapters in Node.js; their need does not prescribe .NET. / 浏览器宿主的输入输出取决于浏览器 API；原始 OSC UDP、TCP／HTTP／WebSocket 监听通过本地服务适配器提供。这些适配器可以由 Node.js 实现，本地能力需求不限定后端语言。

[Adapter catalog / 适配器目录](../adapter-catalog.md) · [English](../adapter-catalog.en.md)
