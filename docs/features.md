# Sensa 功能全景与实现说明

**简体中文** | [English](features.en.md)

本说明依据 **2026-10-18 的源码快照 `4d1be7205ba4b94f631529af55e4e23fcab61ec1`** 整理，覆盖主程序、WebUI、Unity 包、Avatar／世界实验工具、辅助脚本和 CI。它描述源码已经实现的行为；测试代码说明覆盖范围，不代表真实 VRChat、Unity 编辑器或硬件已在本次研究中运行验收。源码引用固定到该提交，便于以后核对；第三方依赖只说明本项目调用的能力，不推断其全部功能。

阅读操作步骤可先看[使用指南](guide.md)、[首次使用](quick-start.md)和[预设说明](presets.md)。本文供需要完整了解现有功能、配置边界和实现分工的使用者与开发者阅读。

## 阅读导航

- [系统组成与数据流](#系统组成与数据流)
- [服务启动、配置应用与访问控制](#服务启动配置应用与访问控制)
- [后端输入、信号处理与输出](#后端输入信号处理与输出)
- [浏览器界面与交互](#浏览器界面与交互)
- [Unity 资产与实验工具](#unity-资产与实验工具)
- [API 与状态协议索引](#api-与状态协议索引)
- [构建、验证和发布](#构建验证和发布)
- [实现范围与验证边界](#实现范围与验证边界)
- [代码覆盖索引](#代码覆盖索引)

## 系统组成与数据流

Sensa 是浏览器配置的本地动作桥接服务：把 OSC 参数、重建的局部几何、手动目标或 funscript 轨迹转换为统一动作帧，再分发到多个 Intiface／TCode 输出。桌面程序提供 .NET HTTP／WebSocket 服务，React 界面由服务直接提供；Unity 包负责把作者配置烘焙成 VRChat 原生组件，额外的 Shader 捕获链路由独立 Python 工具实现。[程序入口](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Program.cs#L1)、[服务组装](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L28)、[运行时](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L1)、[输出协调器](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputCoordinator.cs#L1)、[Unity 构建处理器](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L1)

```mermaid
flowchart LR
    A["VRChat OSC / OSCQuery"] --> O["参数存储与来源隔离"]
    U["Unity Contact / PB / QuickStart"] --> A
    G["GPU 光学编码画面"] --> B["Python 解码与有效性门控"]
    B --> A
    M["浏览器手动目标"] --> R["MotionRuntime"]
    F["funscript 播放器"] --> R
    O --> S["参数映射 / SPS 深度 / Pose / Point 重建"]
    S --> R
    R --> C["输出协调器与轴配置"]
    C --> T["TCode 串口 / UDP / TCP"]
    C --> I["Intiface"]
    R --> REC["录制与 funscript 导出"]
    O --> H["OSC Hub 转发"]
    R --> W["HTTP / WebSocket 状态"]
    C --> W
    W --> UI["浏览器预览、校准与诊断"]
```

图中的 OSC Hub 是转发支路；它转发选定来源的数据，并不以设备输入启用开关作为设备动作开关。GPU 捕获也不是所有输入路径的共同前置条件：普通参数映射、QuickStart 和原生 Contact／PB 路径不需要它。[Hub 与输入开关分工](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L361)、[Unity QuickStart 构建](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaQuickStartBuilder.cs#L1)、[Shader 桥接](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/shader-osc-bridge.py#L1)

| 层次 | 主要职责 | 功能边界 |
| --- | --- | --- |
| 服务与配置 | 启动本地站点、会话、API、配置校验与持久化、连接管理 | 默认本机 HTTP 访问；启用输出连接不等于启用动作 |
| 输入与运行时 | 三种输入模式、信号融合、几何重建、门控、停止 | 同时使用一个输入模式；不同来源与不完整几何不能随意拼接 |
| 输出 | 多输出分发、独立轴配置、TCode 编码、Intiface 特征路由 | 发送的是控制目标；没有实现物理位置反馈闭环 |
| WebUI | 配置、发现、预设、校准、轨迹、输出和日志预览 | 编辑中的草稿与后端保存状态有区分 |
| Unity 与实验工具 | 作者组件、自动烘焙、样例交互、几何与 GPU 验证 | 作者组件不会作为任意自定义脚本在 VRChat Avatar 中运行 |
| 工程工具 | 构建、隔离测试、可复现归档、预发布、VPM 索引 | 公共 CI 静态包检查不能替代 Unity／客户端／硬件验收 |

依据：[运行时](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L1)、[输出遥测](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputTelemetry.cs#L1)、[WebUI](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1)、[NDMF 插件](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L1)、[原生平台工作流](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/.github/workflows/build-platforms.yml#L1)。

## 服务启动、配置应用与访问控制

### 启动与关闭

- 入口调用 `SensaHost.RunAsync(args)`，加载并规范化配置，以程序所在目录为静态资源根目录，默认地址为 `http://127.0.0.1:5086`。可配置主机、端口和自动打开浏览器；这些字段在启动时消费，通过完整配置接口保存后需重启生效，不会在线重绑 HTTP 或重新打开浏览器。Windows 会设置控制台标题。[入口](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Program.cs#L1)、[启动过程](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L28)、[Web 配置](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L235)
- 启动时创建 OSC、OSCQuery、Hub、脚本播放器、录制器、动作运行时与输出协调器。加载配置会把输出启用标志重置为关闭，运行时从 Manual／输入关闭开始，所以重启不会恢复上次的设备启用和动作；启动流程保留了连接当前启用输出的统一入口。[配置加载与瞬态重置](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L310)、[瞬态字段](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L454)、[服务组装](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L74)、[运行时初始化](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L1)
- 关闭时停止录制、关闭 WebSocket、处置输出、停止 OSC 与 OSCQuery／Hub，释放运行时并尝试保存配置。资源处置和正常运行结束各有相应清理路径。[关闭过程](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L1891)

### 配置更新是一次受控切换

更新配置先复制候选配置并校验目标重复、OSCQuery 轮询、接收器服务和 Hub 目标；随后关闭输入、停止输出、应用新配置、重建处理器并按需要重配监听和输出连接，最后保存。发生应用错误时尝试恢复原配置与连接；恢复失败不会被包装成成功。保存后需要用户重新启用输入，切换映射不会悄悄继续动作。[配置应用与回滚](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L902)

输出连接按输出 ID 和类型管理。增加、删除、改变类型会触发拓扑重建；仅改变串口、主机、端口、Intiface 地址等连接目标时会按需重连。轴参数可以使用相同连接更新。[输出差异处理](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L747)、[输出配置应用](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L861)

### 访问策略与资源限制

| 能力 | 当前行为 |
| --- | --- |
| 本机浏览器会话 | 先 `GET /api/session` 取得随机会话 Cookie，后续 API 使用它 |
| Cookie 属性 | `HttpOnly`、`SameSite=Strict`；HTTPS 时设 `Secure` |
| 远程访问 | 需自行配置监听地址，并设置 `SENSA_ACCESS_TOKEN`；接受 Bearer，或以该 token 为密码的 Basic |
| 同源检查 | 检查 Origin 的 scheme／authority，拒绝 `Sec-Fetch-Site: cross-site`；本机请求也检查 Host 是否为 loopback／localhost |
| HTTP 限制 | Kestrel 请求体上限 4 MiB |
| WebSocket 限制 | 最多 16 个并发会话；消息上限 4 MiB；超额连接返回 429；单次发送有 3 秒超时 |
| 静态资源 | HTML、主 bundle、CSS 设置不缓存；站点设置禁止嵌入、禁 MIME 嗅探和不发送 Referrer 的响应头 |

访问控制是本地服务与显式共享凭据机制，未实现账号、角色或多用户权限管理。源码默认服务 URL 使用 HTTP；配置远程凭据不会自动启用 TLS。[访问策略完整实现](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/LocalAccessPolicy.cs#L8)、[HTTP 设置](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L39)、[静态资源与 WebSocket 设置](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L1435)、[WebSocket 限额与接收](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L1804)、[会话发送](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/ApiContracts.cs#L56)

### 状态推送和日志

状态以约 100 ms 的脏标记合并推送，包含运行时、输入／脚本、OSC 来源与预览、Query／Hub、输出、几何观测、录制、信号等；为每个浏览器合并待发送状态，减少积压。WebSocket 初次连接会收到状态。[状态推送](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L139)、[状态定时器](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L273)、[总览字段](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L1148)

运行日志按 Debug／Info／Warning／Error 和消息前缀分类，内存最多保留 2000 条，普通查询默认取最后 200 条，推送信封取最后 50 条。Warning／Error 写入标准错误，其余写入标准输出；这不是持久化日志数据库。[日志缓冲](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/RuntimeLogBuffer.cs#L5)、[日志入口](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L60)、[推送信封](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L153)

## 后端输入、信号处理与输出

### 运行模型与统一运动状态

Sensa 使用 MotionFrame 表示 12 个归一化轴：L0/L1/L2、R0/R1/R2、V0/V1/V2、A0/A1/A2，并携带事件间隔 DeltaMs、可选 TCode 命令模式及速度/时长请求。运行时中立姿态将位置、旋转和辅助轴设为 0.5，将 V0–V2 设为 0。MotionPatch 仅包含本次控制的轴，拒绝非有限数并将值限制在 0–1；因此局部输入不会把未控制轴重置为默认位置。（来源：[src/Motion/MotionFrame.cs:5](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Motion/MotionFrame.cs#L5)；[src/Motion/MotionAxes.cs:21](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Motion/MotionAxes.cs#L21)、[src/Motion/MotionAxes.cs:63](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Motion/MotionAxes.cs#L63)、[src/Motion/MotionAxes.cs:135](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Motion/MotionAxes.cs#L135)）

输入模式有 Manual、Osc、Script，初始为 Manual 且输入未激活。输出条件为：运行时未释放、没有急停、输入已激活、所有门控满足、空间输入未阻断。OSC/OSCQuery 参数经来源存储、映射或几何重建、处理和融合产生轴补丁；手动输入形成完整轴补丁；Funscript 形成 L0 补丁；补丁作用于当前运动帧，再交给录制器和多输出协调器。（来源：[src/Runtime/RuntimeInputMode.cs:3](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/RuntimeInputMode.cs#L3)；[src/Runtime/MotionRuntime.cs:51](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L51)、[src/Runtime/MotionRuntime.cs:81](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L81)、[src/Runtime/MotionRuntime.cs:407](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L407)、[src/Runtime/MotionRuntime.cs:501](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L501)、[src/Runtime/MotionRuntime.cs:599](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L599)）

运行时由输入事件触发，脚本使用自身 20ms 定时器。待发送手动请求会保留最新补丁，避免积压；模式切换、关闭输入和急停会更新代次，丢弃旧待发送请求。姿态未有效变化且运动参数未改变时通常不发新命令，重新激活等状态转换会强制重发。UDP 输出另由宿主每秒在允许发送时刷新全量姿态。（来源：[src/Runtime/MotionRuntime.cs:215](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L215)、[src/Runtime/MotionRuntime.cs:252](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L252)、[src/Runtime/MotionRuntime.cs:517](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L517)、[src/Runtime/MotionRuntime.cs:599](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L599)；[src/Input/Script/FunscriptPlayer.cs:311](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L311)；[src/Hosting/SensaHost.cs:268](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L268)）

#### 停止、急停与 Avatar 切换

急停关闭输入、清空待发送补丁、暂停脚本，并请求所有输出停止。解除急停只清除急停状态，必须再次显式激活输入。关闭输入也会暂停脚本并发送停止；重新激活同一手动姿态仍会重发。UDP 接收器收到 /avatar/change 后，清除该来源参数并重置信号观测范围、SPS 长度估计及连续滚转状态；当前为 OSC 且输入已激活时会急停。OSCQuery 的 AvatarChanged 目前只清空参数存储、转发 Hub 通知和刷新状态，没有接入同一运行时重置／急停路径。[通知接线](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L710)（来源：[src/Runtime/MotionRuntime.cs:172](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L172)、[src/Runtime/MotionRuntime.cs:187](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L187)、[src/Runtime/MotionRuntime.cs:252](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L252)、[src/Runtime/MotionRuntime.cs:332](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L332)、[src/Runtime/MotionRuntime.cs:625](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L625)）

### 配置保存、输出实例与轴配置

配置为 JSON，枚举按字符串保存，读取属性名不区分大小写，当前 schema 为 5。默认保存在可执行文件目录的 config.json，可通过 SENSA_CONFIG_PATH 指定其他路径。读取失败会记录错误、备份为 .invalid-时间戳 并返回默认配置；保存先写 GUID 临时文件、刷新至磁盘后替换目标。保存快照和加载结果都会将所有输出设为禁用，设备激活状态不会跨重启恢复。（来源：[src/Configuration/AppConfig.cs:267](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L267)、[src/Configuration/AppConfig.cs:283](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L283)、[src/Configuration/AppConfig.cs:290](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L290)、[src/Configuration/AppConfig.cs:310](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L310)、[src/Configuration/AppConfig.cs:334](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L334)、[src/Configuration/AppConfig.cs:454](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L454)）

多个输出实例分别保存 ID、名称、类型、启用状态和连接参数，类型为 TCodeSerial、TCodeUdp、TCodeTcp、Intiface。TCode 实例通过 MotionProfileId 引用共享轴配置库；每套轴配置有 ID、名称、唯一默认标记及全部 12 轴。缺少或不存在的引用回退默认项。规范化补齐名称和 ID、消除 ID 冲突并保证唯一默认项。（来源：[src/Configuration/AppConfig.cs:30](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L30)、[src/Configuration/AppConfig.cs:114](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L114)、[src/Configuration/AppConfig.cs:130](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L130)、[src/Configuration/AppConfig.cs:465](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L465)、[src/Configuration/AppConfig.cs:872](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L872)、[src/Configuration/AppConfig.cs:958](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L958)）

| 每轴字段 | 默认值与范围 | 作用 |
|---|---|---|
| Min / Max | 0 / 999；0–999，反序时交换 | 输出硬边界 |
| RemapMin / RemapMax | 0 / 999；0–999，反序时交换 | 将整个输入范围映射到指定输出区间 |
| MaxSpeed | 999；1–999 | 逻辑速度上限 |
| Invert | false | 输出方向反转 |
| Mode | Normal | Normal、Locked、Ignored |
| CommandMode | Interval | None、Interval、Speed |
| RampType | None | None、Linear、EaseIn、EaseOut、EaseInOut |
| LockValue | 0.5；0–1 | Locked 模式固定输入 |

以上默认值与规范化范围来自 [src/Configuration/AppConfig.cs:75](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L75)、[src/Configuration/AppConfig.cs:1162](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L1162)。

连接默认值为串口 COM3、UDP 127.0.0.1:9999、TCP 127.0.0.1:9998、Intiface ws://localhost:12345；Intiface 默认管理内置引擎，TCode 默认速度单位为每 100ms，输出级 SlopeMode 默认 None（跟随每轴命令模式）。非法网络端口回退对应默认值。（来源：[src/Configuration/AppConfig.cs:130](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L130)、[src/Configuration/AppConfig.cs:147](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L147)、[src/Configuration/AppConfig.cs:154](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L154)、[src/Configuration/AppConfig.cs:1070](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L1070)）

目标冲突验证检查所有输出实例：串口名、同协议主机加端口、Intiface WebSocket 地址及托管引擎端口不能重复。配置比较会忽略大小写和部分首尾空白，但不通过 DNS 统一不同主机别名，不能据此保证识别所有指向同一硬件的地址。（来源：[src/Configuration/AppConfig.cs:492](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L492)、[src/Configuration/AppConfig.cs:713](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L713)）

旧 TCode、UdpTCode、TcpTCode、Intiface、TCodeProfiles 结构仍存在，规范化时由每种类型的第一个输出及默认轴配置生成镜像；多输出列表与轴配置库是当前主要数据模型。（来源：[src/Configuration/AppConfig.cs:574](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L574)、[src/Configuration/AppConfig.cs:618](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L618)）

### OSC 接收、来源隔离与参数目录

UDP 接收器默认监听 127.0.0.1:9001，可配置 IP、DNS 主机名、0.0.0.0 / * / any 及 IPv6。重新绑定失败会恢复原地址。异步接收可取消，旧接收循环不会读取新一代 socket。每个 UDP 来源由地址加端口标识，接收前先调用来源过滤器。（来源：[src/Input/Osc/OscInputReceiver.cs:30](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscInputReceiver.cs#L30)、[src/Input/Osc/OscInputReceiver.cs:41](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscInputReceiver.cs#L41)、[src/Input/Osc/OscInputReceiver.cs:57](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscInputReceiver.cs#L57)、[src/Input/Osc/OscInputReceiver.cs:94](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscInputReceiver.cs#L94)、[src/Input/Osc/OscInputReceiver.cs:116](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscInputReceiver.cs#L116)、[src/Input/Osc/OscInputReceiver.cs:161](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscInputReceiver.cs#L161)）

运动参数解析消费 /avatar/parameters/... 的首个 float、int、true 或 false 值，以及 /avatar/change 通知，支持最多 16 层嵌套 bundle，拒绝非有限浮点。bundle 时间戳被跳过，不进行未来时间调度；运动解析不消费任意类型或多个参数。只有整包没有任何已处理的 Avatar 消息时，才进入未处理包预览／透传；若一个 bundle 同时包含已处理 Avatar 消息与其他消息，其他消息当前不会单独进入该支路。（来源：[src/Input/Osc/OscPacketParser.cs:9](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscPacketParser.cs#L9)、[src/Input/Osc/OscPacketParser.cs:17](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscPacketParser.cs#L17)、[src/Input/Osc/OscPacketParser.cs:44](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscPacketParser.cs#L44)、[src/Input/Osc/OscPacketParser.cs:61](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscPacketParser.cs#L61)；[src/Input/Osc/OscInputReceiver.cs:127](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscInputReceiver.cs#L127)）

参数按“路径加来源”保存最新值、时间戳和递增序号，并支持来源统计、快照及按来源清除。路径最长 512 字符，最多 4096 条路径/来源组合和 32 个来源；写入时每隔至少 10 秒清理超过 5 分钟无新数据的来源。明确选定来源后，缺失参数不会回退到其他发送者。（来源：[src/Input/Osc/OscModels.cs:50](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscModels.cs#L50)、[src/Input/Osc/OscModels.cs:67](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscModels.cs#L67)、[src/Input/Osc/OscModels.cs:83](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscModels.cs#L83)、[src/Input/Osc/OscModels.cs:129](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscModels.cs#L129)、[src/Input/Osc/OscModels.cs:219](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscModels.cs#L219)、[src/Input/Osc/OscModels.cs:245](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscModels.cs#L245)、[src/Input/Osc/OscModels.cs:286](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscModels.cs#L286)）

路径匹配区分大小写：* 匹配一个路径段，** 匹配任意数量路径段；分号或换行可并列最多 32 个模式，每个模式及路径最多 64 段。（来源：[src/Input/Osc/OscModels.cs:186](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscModels.cs#L186)）

输入超时默认 0，表示关闭；接收配置副本时限制为 0–600000ms。来源 IP 白名单最多 32 个独立 IP，非法 IP 抛错，避免错误白名单变成允许全部来源。参数分类器对面部追踪、OGB/Sensa 路径、已知名称、关键词及近似名称提供相关性提示；这是展示辅助，不会自动创建设备映射。（来源：[src/Configuration/AppConfig.cs:216](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L216)、[src/Configuration/AppConfig.cs:364](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L364)、[src/Configuration/AppConfig.cs:365](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L365)；[src/Input/Osc/OscParameterClassifier.cs:7](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscParameterClassifier.cs#L7)、[src/Input/Osc/OscParameterClassifier.cs:18](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscParameterClassifier.cs#L18)、[src/Input/Osc/OscParameterClassifier.cs:24](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscParameterClassifier.cs#L24)）

### OSCQuery 客户端、轮询与接收器广播

客户端读取根地址树和 HOST_INFO，取得服务名称、OSC 地址/端口/传输类型、WebSocket 地址、LISTEN 能力，以及参数类型、描述、访问权限、当前值、范围和枚举值。只将 /avatar/parameters/ 子树转成运动参数目录。默认 HTTP 超时 6 秒、响应缓冲上限 4MiB；URL 仅支持 HTTP/HTTPS，省略协议时补 HTTP。（来源：[src/Input/Osc/OscQueryClient.cs:25](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L25)、[src/Input/Osc/OscQueryClient.cs:77](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L77)、[src/Input/Osc/OscQueryClient.cs:214](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L214)、[src/Input/Osc/OscQueryClient.cs:281](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L281)、[src/Input/Osc/OscQueryClient.cs:718](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L718)、[src/Input/Osc/OscQueryClient.cs:761](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L761)、[src/Input/Osc/OscQueryClient.cs:937](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L937)）

对支持 LISTEN 且存在参数的服务，客户端建立 WebSocket，为当前节点发送 LISTEN，对不再需要的节点发送 IGNORE。二进制帧按 Avatar OSC 解码，PATH_CHANGED / PATH_RENAMED / PATH_REMOVED / PATH_ADDED 文本通知触发结构刷新；断开后约每 1.5 秒重连。单条 WebSocket 消息超过 4MiB 时拒绝。（来源：[src/Input/Osc/OscQueryClient.cs:129](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L129)、[src/Input/Osc/OscQueryClient.cs:302](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L302)、[src/Input/Osc/OscQueryClient.cs:354](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L354)、[src/Input/Osc/OscQueryClient.cs:390](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L390)、[src/Input/Osc/OscQueryClient.cs:400](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L400)、[src/Input/Osc/OscQueryClient.cs:443](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L443)、[src/Input/Osc/OscQueryClient.cs:607](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L607)）

OSCQuery 的运行时来源 key 基于 URL；持久来源标识优先使用服务名，否则使用 URL。HTTP 快照支持单一 f/d/i/h/T/F 值，其中 h 必须可表示为 32 位整数；字符串等保留为元数据展示。（来源：[src/Input/Osc/OscQueryClient.cs:646](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L646)、[src/Input/Osc/OscQueryClient.cs:665](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L665)、[src/Input/Osc/OscQueryClient.cs:786](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryClient.cs#L786)）

轮询回退默认关闭、10Hz，限制 1–30Hz；启用时必须同时开启 OSCQuery 客户端。服务执行一次回调后等待 1000/rate 毫秒，实际频率受请求耗时影响；快照记录最近轮询时间、应用值数和错误。（来源：[src/Configuration/AppConfig.cs:206](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L206)、[src/Configuration/AppConfig.cs:529](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L529)；[src/Input/Osc/OscQueryPollingService.cs:32](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryPollingService.cs#L32)、[src/Input/Osc/OscQueryPollingService.cs:96](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryPollingService.cs#L96)、[src/Input/Osc/OscQueryPollingService.cs:174](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryPollingService.cs#L174)）

接收器广播默认关闭，服务名 Sensa、HTTP 端口 9010，默认声明 /avatar 与 /tracking/vrsystem。仅在上层传入 OSC 模式有效、广播开启且至少选择一个分类时启动；HTTP 绑定 0.0.0.0，mDNS 广告 _oscjson._tcp 与 _osc._udp。仅支持 GET，可查询根树、子节点、HOST_INFO 及指定属性；此服务描述接收能力，没有实现 LISTEN 或动态 Avatar 参数值服务。配置验证要求至少一个广播分类，且 HTTP 端口不与 WebUI 冲突。（来源：[src/Configuration/AppConfig.cs:197](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L197)、[src/Configuration/AppConfig.cs:510](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L510)；[src/Input/Osc/OscQueryReceiverService.cs:44](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryReceiverService.cs#L44)、[src/Input/Osc/OscQueryReceiverService.cs:103](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryReceiverService.cs#L103)、[src/Input/Osc/OscQueryReceiverService.cs:207](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryReceiverService.cs#L207)、[src/Input/Osc/OscQueryReceiverService.cs:221](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryReceiverService.cs#L221)、[src/Input/Osc/OscQueryReceiverService.cs:311](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryReceiverService.cs#L311)、[src/Input/Osc/OscQueryReceiverService.cs:327](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryReceiverService.cs#L327)、[src/Input/Osc/OscQueryReceiverService.cs:337](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryReceiverService.cs#L337)、[src/Input/Osc/OscQueryReceiverService.cs:380](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscQueryReceiverService.cs#L380)）

### OSC Hub 与原始包预览

Hub 支持多个独立命名 UDP 目标，默认关闭、事件驱动、固定速率 10Hz、默认不转发 Avatar 改变。事件模式立即重编码并转发参数；固定速率模式按路径仅保留最新待发送值，每周期冲刷一次，范围 1–240Hz，因此会合并同一路径的中间值。原始包透传直接发送，不受参数固定速率合并约束。可将已有参数快照重放到目标。（来源：[src/Configuration/AppConfig.cs:179](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L179)、[src/Configuration/AppConfig.cs:188](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L188)、[src/Configuration/AppConfig.cs:766](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L766)；[src/Input/Osc/OscHubForwarder.cs:35](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscHubForwarder.cs#L35)、[src/Input/Osc/OscHubForwarder.cs:90](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscHubForwarder.cs#L90)、[src/Input/Osc/OscHubForwarder.cs:114](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscHubForwarder.cs#L114)、[src/Input/Osc/OscHubForwarder.cs:128](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscHubForwarder.cs#L128)、[src/Input/Osc/OscHubForwarder.cs:230](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscHubForwarder.cs#L230)、[src/Input/Osc/OscHubForwarder.cs:254](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscHubForwarder.cs#L254)）

Avatar 改变会清空待发参数；允许转发时，固定速率模式先发送改变通知再发后续参数。统计含目标数、活动目标数、待发数、发送/失败数、最近发送/失败时间及各目标错误。验证拒绝重复目标与已识别的直接指回当前监听端口回环。（来源：[src/Input/Osc/OscHubForwarder.cs:137](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscHubForwarder.cs#L137)、[src/Input/Osc/OscHubForwarder.cs:165](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscHubForwarder.cs#L165)、[src/Input/Osc/OscHubForwarder.cs:278](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscHubForwarder.cs#L278)、[src/Input/Osc/OscHubForwarder.cs:400](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscHubForwarder.cs#L400)；[src/Configuration/AppConfig.cs:540](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L540)）

包预览默认保留最近 64 条，分 tracking 与 raw，展示地址、类型标签、值摘要、时间、来源地址/端口/稳定标识。摘要解析 float/double/int/int64/bool/string，未知类型为占位符；最多解析 16 层 bundle、单包 64 条。预览是诊断信息，tracking 透传不等于身体姿态重建或设备运动映射。（来源：[src/Input/Osc/OscPacketPreviewStore.cs:11](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscPacketPreviewStore.cs#L11)、[src/Input/Osc/OscPacketPreviewStore.cs:36](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscPacketPreviewStore.cs#L36)、[src/Input/Osc/OscPacketPreviewStore.cs:53](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscPacketPreviewStore.cs#L53)、[src/Input/Osc/OscPacketPreviewStore.cs:76](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscPacketPreviewStore.cs#L76)、[src/Input/Osc/OscPacketPreviewStore.cs:109](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscPacketPreviewStore.cs#L109)、[src/Input/Osc/OscPacketPreviewStore.cs:125](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc/OscPacketPreviewStore.cs#L125)）

### 信号映射、校准、曲线与融合

映射包含路径模式、SourceMode、目标 Role、输入区间 VrchatMin/Max、InvertDirection、Curve 和 MappedMin/Max。来源模式为 Direct、SpsSocketDepth、SensaPose、SensaPoint；默认 Direct、0–1 输入、Linear、Depth。空间度量分别默认 Pose Depth 与 Point Z。（来源：[src/Signals/SignalMapping.cs:3](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SignalMapping.cs#L3)；[src/Configuration/AppConfig.cs:1222](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L1222)）

处理顺序为输入区间校准（反向则交换端点）→限制 0–1→曲线→输出区间。曲线为线性、平方 EaseIn、反平方 EaseOut、分段二次 SCurve；输入范围近似零时归一化为 0。映射输出按位置数值 0–999 配置，再除以 1000，因此最大内部值为 0.999。处理器记录观察到的最小/最大输入，不会自行修改校准区间。（来源：[src/Signals/SignalPipeline.cs:14](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SignalPipeline.cs#L14)、[src/Signals/SignalPipeline.cs:34](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SignalPipeline.cs#L34)、[src/Signals/SignalPipeline.cs:71](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SignalPipeline.cs#L71)、[src/Signals/SignalPipeline.cs:79](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SignalPipeline.cs#L79)）

| Role | 输出轴 |
|---|---|
| Depth / Surge / Sway | L0 / L1 / L2 |
| Twist / AngleX / AngleY | R0 / R1 / R2 |
| V0 / V1 / V2 | V0 / V1 / V2 |
| Auxiliary / Auxiliary1 / Auxiliary2 | A0 / A1 / A2 |

同轴多个信号按校准后的归一化强度选最高优先级；强度近似相同时，中心轴选偏离 0.5 更远的输出，其余轴选较大值。这不是按最近参数覆盖，也不是求和或平均。（来源：[src/Signals/SignalPipeline.cs:94](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SignalPipeline.cs#L94)、[src/Signals/SignalPipeline.cs:120](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SignalPipeline.cs#L120)、[src/Signals/SignalPipeline.cs:131](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SignalPipeline.cs#L131)、[src/Signals/SignalPipeline.cs:148](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SignalPipeline.cs#L148)；[src/Runtime/MotionRuntime.cs:481](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L481)）

GateEnable 的同一映射匹配多个值时，任一处理后值大于 0.5 即满足；多个门控映射之间必须全部满足，缺失视为关闭。DepthOverride 取所有覆盖值最大者，替代普通 Depth。Pose/Point 控制的角色会屏蔽同角色直接映射，空间输入丢失时不会退回旧深度信号。（来源：[src/Runtime/MotionRuntime.cs:416](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L416)、[src/Runtime/MotionRuntime.cs:456](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L456)、[src/Runtime/MotionRuntime.cs:482](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L482)、[src/Runtime/MotionRuntime.cs:486](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L486)、[src/Runtime/MotionRuntime.cs:489](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L489)）

输入 watchdog 每 500ms 检查一次，以当前输入类型相关采样的最新时间戳和本次激活时间计算整体断流时限；超过阈值会急停，并非每条映射各自独立触发全局急停。某个相关标量持续更新时，不保证另一标量过期就急停。空间模式只以相关几何采样计时，门控、抓取及其他元数据不会为冻结坐标续期；构建输出时还会检查所用数据的新鲜度。（来源：[src/Runtime/MotionRuntime.cs:138](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L138)、[src/Runtime/MotionRuntime.cs:549](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L549)、[src/Runtime/MotionRuntime.cs:563](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L563)、[src/Runtime/MotionRuntime.cs:576](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L576)）

### SPS 深度估计

SpsSocketDepth 使用同一来源、同一 Socket 的 NewRoot 与 NewTip。NewTip 是根部中心的长度球，不是尖端标记；估计器在长度球未饱和时学习长度，加回原生 Root 发送球 1cm 半径；长度至少 2cm。Tip 达到 0.99 且已有长度后才输出深度。无效、离开或不一致样本会重置，更换较短目标可重新学习，不永久保留最大长度。（来源：[src/Signals/SpsDepthEstimator.cs:3](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SpsDepthEstimator.cs#L3)、[src/Signals/SpsDepthEstimator.cs:15](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SpsDepthEstimator.cs#L15)、[src/Signals/SpsDepthEstimator.cs:29](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SpsDepthEstimator.cs#L29)）

Root 或 Tip 任一个实际坐标更新都能刷新该输入对；其他 Socket、来源和门控不能刷新。对 delta-only OSC 允许另一坐标保留缓存。几何事件合并约 30ms 后再处理。此模式仍为径向近似，不能校正侧偏和倾角，不能确认发送者身份，Root 饱和时也存在几何分辨限制。（来源：[src/Runtime/MotionRuntime.cs:296](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L296)、[src/Runtime/MotionRuntime.cs:463](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L463)、[src/Runtime/MotionRuntime.cs:552](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L552)；[src/Signals/SpsDepthEstimator.cs:3](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SpsDepthEstimator.cs#L3)；[tests/Sensa.Tests/SignalTests.cs:75](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tests/Sensa.Tests/SignalTests.cs#L75)）

### 空间 Pose、Point、Handle 与根部诊断

Pose 从同一来源和 rig 前缀的 Root/Tip/Side 三个标记、每标记八路接近度拟合几何，要求完整 24 路。拟合同时搜索 0–2cm 发送球半径。观察结果提供根部、尖端、侧点、轴线与孔口平面交点、深度、轴向深度、长度、Yaw/Pitch/Roll、残差及估计半径。单球本身不能观测朝向或扭转。（来源：[src/Signals/PoseReconstruction.cs:20](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/PoseReconstruction.cs#L20)、[src/Signals/PoseReconstruction.cs:58](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/PoseReconstruction.cs#L58)、[src/Signals/PoseReconstruction.cs:85](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/PoseReconstruction.cs#L85)、[src/Signals/PoseReconstruction.cs:122](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/PoseReconstruction.cs#L122)）

拒绝条件包括采样缺失/非有限/接近 0 或 1、拟合残差超限、位置离中心超过 0.245m、根尖距离不在 0.02–0.5m、轴线与平面平行、侧点与轴线近似重合、接近方向奇异位置。协议接收球半径 0.35m、锚点半跨距 0.06m、默认本地标记半径 0.001m、最大拟合残差 0.002m。Pose 只有倾角不超过 65°、轴线交点位于半径 0.04m 孔口内且尖端 Z>0 时才 Engaged；有效但未进入不会驱动输出。（来源：[src/Signals/PoseReconstruction.cs:65](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/PoseReconstruction.cs#L65)、[src/Signals/PoseReconstruction.cs:85](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/PoseReconstruction.cs#L85)、[src/Signals/PoseReconstruction.cs:151](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/PoseReconstruction.cs#L151)；[unity/top.sealoong.sensa/Runtime/SensaPoseProtocol.cs:14](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Runtime/SensaPoseProtocol.cs#L14)）

多个有效已进入 rig 中选深度最大者；新候选比当前目标深不足 0.05 时保留当前目标以降低跳变。未明确选来源而存在多个来源时阻断 Pose。Roll 跨 ±180° 使用连续角展开，避免突然在执行器两端之间跳转。（来源：[src/Runtime/MotionRuntime.cs:426](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L426)、[src/Runtime/MotionRuntime.cs:432](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L432)、[src/Runtime/MotionRuntime.cs:439](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L439)；[src/Signals/ContinuousAngle.cs:3](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/ContinuousAngle.cs#L3)）

Point 与 Handle 使用已知半径的四面体四路采样，度量为 X/Y/Z/距原点距离；必须唯一匹配且有效。Handle 额外要求 Handle_IsGrabbed=1，释放即阻断。SpsRoot 八路重建与 SharedRoot 共享阵列为诊断位置，不是可映射的本地点，也不被当作完整 Pose。SharedRoot 要求 Slot 为 1–16 整数、Ready=1，且 Ready 与全部几何样本序号晚于槽位选择，避免换槽使用旧数据。（来源：[src/Signals/PoseReconstruction.cs:65](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/PoseReconstruction.cs#L65)；[src/Signals/SpsPositionTracking.cs:6](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SpsPositionTracking.cs#L6)、[src/Signals/SpsPositionTracking.cs:14](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SpsPositionTracking.cs#L14)、[src/Signals/SpsPositionTracking.cs:20](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SpsPositionTracking.cs#L20)、[src/Signals/SpsPositionTracking.cs:37](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SpsPositionTracking.cs#L37)、[src/Signals/SpsPositionTracking.cs:46](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SpsPositionTracking.cs#L46)；[src/Runtime/MotionRuntime.cs:420](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L420)）

同一配置不能混用 Pose 与 Point，同模式的各轴必须共享一个路径模式，不能把 Pose/Point 映射至 GateEnable 或 DepthOverride。空间输入缺失、失效或歧义会阻断运动并发出停止；有效输入恢复后可重新形成输出，区别于需要用户解除的全局急停。（来源：[src/Configuration/AppConfig.cs:439](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L439)；[src/Runtime/MotionRuntime.cs:384](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L384)、[src/Runtime/MotionRuntime.cs:437](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L437)）

### Funscript 播放

播放器读取 actions 中的 at 毫秒与 pos 百分比。缺少有效数组或有效动作会报错；缺少数字字段的条目跳过；负时间限制为 0、位置限制为 0–100，动作按时间排序。限制为最多 500000 动作与 7 天时长，实际时长取末动作时间且至少 1ms。当前解析只消费 actions，不使用文件 inverted、range 等元数据。（来源：[src/Input/Script/FunscriptPlayer.cs:546](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L546)）

支持加载、播放/重播、暂停、停止、清空、时间定位、前后关键帧跳转、循环、0.1–4 倍速及 A/B 循环范围。边界限制在时长内，反序时交换；两端均设置且终点大于起点才形成有效范围。20ms 定时器按经过时间采样，二分定位关键帧并线性插值；到末尾进入 finished 并发送最终帧。（来源：[src/Input/Script/FunscriptPlayer.cs:51](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L51)、[src/Input/Script/FunscriptPlayer.cs:79](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L79)、[src/Input/Script/FunscriptPlayer.cs:115](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L115)、[src/Input/Script/FunscriptPlayer.cs:159](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L159)、[src/Input/Script/FunscriptPlayer.cs:184](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L184)、[src/Input/Script/FunscriptPlayer.cs:202](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L202)、[src/Input/Script/FunscriptPlayer.cs:226](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L226)、[src/Input/Script/FunscriptPlayer.cs:244](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L244)、[src/Input/Script/FunscriptPlayer.cs:289](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L289)、[src/Input/Script/FunscriptPlayer.cs:346](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L346)、[src/Input/Script/FunscriptPlayer.cs:433](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L433)、[src/Input/Script/FunscriptPlayer.cs:508](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L508)）

快照包括 Loaded、Playing、Paused、empty/stopped/playing/paused/finished 状态、文件名、播放位置、时长、动作数、当前 L0、循环边界、速度及 64 格动作密度。脚本只改变 L0，保留其他轴；补丁显式请求无 I/S 后缀命令。运行时仅在 Script 模式、输入已激活且非急停时消费脚本帧。（来源：[src/Input/Script/FunscriptPlayer.cs:408](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L408)、[src/Input/Script/FunscriptPlayer.cs:579](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L579)；[src/Runtime/MotionRuntime.cs:348](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L348)、[src/Runtime/MotionRuntime.cs:501](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L501)）

### 录制与 Funscript 导出

录制器在线程安全的缓存中采集通过运行时门控、去重后，交给输出分发前的 L0 目标帧及相对开始毫秒数；没有已连接输出或发送失败时也可录制，不代表传输或硬件执行确认；开始清空旧样本，停止保留缓存；达到 100000 帧后自动停止。被运行时判定为无变化而跳过的运动状态不新增样本；当前不是 12 轴录制器。（来源：[src/Recording/MotionRecorder.cs:16](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Recording/MotionRecorder.cs#L16)、[src/Recording/MotionRecorder.cs:26](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Recording/MotionRecorder.cs#L26)、[src/Recording/MotionRecorder.cs:34](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Recording/MotionRecorder.cs#L34)；[src/Runtime/MotionRuntime.cs:625](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L625)、[src/Runtime/MotionRuntime.cs:635](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L635)）

导出 JSON 包含 version=1.0、inverted=false、range=100，L0 乘 100 四舍五入为 pos；使用迭代 Ramer–Douglas–Peucker 简化，epsilon=0.02，时间轴转换成秒参与几何距离计算。空录制返回空内容。当前 WebUI 导出接口调用 Serialize 返回文件名与 JSON 文本，由浏览器下载；代码中另保留 Export 辅助方法，可落盘至 Documents/Sensa/recordings，但这不是当前用户界面的自动保存路径。（来源：[src/Recording/MotionRecorder.cs:63](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Recording/MotionRecorder.cs#L63)、[src/Recording/MotionRecorder.cs:69](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Recording/MotionRecorder.cs#L69)、[src/Recording/MotionRecorder.cs:96](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Recording/MotionRecorder.cs#L96)、[src/Recording/MotionRecorder.cs:116](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Recording/MotionRecorder.cs#L116)、[src/Recording/MotionRecorder.cs:152](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Recording/MotionRecorder.cs#L152)；[src/Hosting/SensaHost.cs:1456](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L1456)）

### 多输出分发与命令预览

输出协调器维护 ID 对应连接，重载时同 ID/类型可复用，删除或变更类型释放旧 transport。不同输出并行发送，单连接操作串行；真正发送前再次检查全局 CanSend 和实例状态。急停覆盖全部连接，连接本身不自动移动设备。输出概览包含类型、启用/连接状态、轴配置、功能列表、命令预览和设备信息。（来源：[src/Outputs/OutputCoordinator.cs:52](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputCoordinator.cs#L52)、[src/Outputs/OutputCoordinator.cs:131](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputCoordinator.cs#L131)、[src/Outputs/OutputCoordinator.cs:181](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputCoordinator.cs#L181)、[src/Outputs/OutputCoordinator.cs:242](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputCoordinator.cs#L242)、[src/Outputs/OutputCoordinator.cs:401](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputCoordinator.cs#L401)、[src/Outputs/OutputCoordinator.cs:505](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputCoordinator.cs#L505)）

预览记录本地 transport/API 已接受的目标命令，不是硬件传感器回读或实际位置。TCode 按轴记录 0–999，Intiface 按设备功能记录百分比；停止、断开和设备移除会更新/清空相关状态。（来源：[src/Outputs/OutputTelemetry.cs:6](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputTelemetry.cs#L6)、[src/Outputs/OutputTelemetry.cs:9](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputTelemetry.cs#L9)、[src/Outputs/OutputTelemetry.cs:17](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputTelemetry.cs#L17)、[src/Outputs/OutputTelemetry.cs:29](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputTelemetry.cs#L29)；[src/Outputs/Intiface/IntifaceOutputClient.cs:51](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifaceOutputClient.cs#L51)、[src/Outputs/Intiface/IntifaceOutputClient.cs:192](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifaceOutputClient.cs#L192)）

#### TCode 编码及 transport

每轴依次进行 Ignored 判断、Locked 替代、Invert、Remap、Min/Max 钳制，最终编码三位 000–999 位置。Ignored 不发送，Locked 仍经过反向、映射和边界。命令模式优先级为帧明确请求 > 输出级斜坡模式 > 每轴 CommandMode。None 只发位置；Interval 加 I时长；Speed 加 S速度，帧速度仍受 MaxSpeed 限制。逻辑速度基于每 100ms，选择 PerSecond 时线上 S 数值乘 10。（来源：[src/Outputs/TCode/TCodeEncoder.cs:24](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeEncoder.cs#L24)、[src/Outputs/TCode/TCodeEncoder.cs:58](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeEncoder.cs#L58)、[src/Outputs/TCode/TCodeEncoder.cs:66](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeEncoder.cs#L66)、[src/Outputs/TCode/TCodeEncoder.cs:127](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeEncoder.cs#L127)、[src/Outputs/TCode/TCodeEncoder.cs:172](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeEncoder.cs#L172)、[src/Outputs/TCode/TCodeEncoder.cs:186](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeEncoder.cs#L186)；[src/Outputs/TCode/TCodeAxisDebug.cs:12](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeAxisDebug.cs#L12)、[src/Outputs/TCode/TCodeAxisDebug.cs:24](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeAxisDebug.cs#L24)）

RampType 的命令后缀依次为空、=、<、>、<>，向支持该扩展的设备表达相应斜坡；主机没有额外插值轨迹。速度估计根据上一目标变化与事件时间计算，首次无历史时为 0。Interval 自动模式按距离和限速计算时长；明确请求的 Interval 时长直接进入编码。（来源：[src/Outputs/TCode/TCodeEncoder.cs:75](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeEncoder.cs#L75)、[src/Outputs/TCode/TCodeEncoder.cs:192](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeEncoder.cs#L192)；[src/Signals/SignalPipeline.cs:215](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SignalPipeline.cs#L215)；[src/Outputs/TCode/TCodeAxisDebug.cs:12](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeAxisDebug.cs#L12)、[src/Outputs/TCode/TCodeAxisDebug.cs:38](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeAxisDebug.cs#L38)）

串口固定 115200、8N1，读超时 100ms、写超时 200ms。连接查询 D0 固件、D1 协议、D2 轴说明，并支持 UTF-8、GB18030 及容错回退解码。UDP 不支持 D 指令回读，TCP 目前也未实现回读。TCP 连接期限 3 秒、发送与流写超时 500ms。（来源：[src/Outputs/TCode/TCodeSerialOutput.cs:68](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeSerialOutput.cs#L68)、[src/Outputs/TCode/TCodeSerialOutput.cs:184](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeSerialOutput.cs#L184)、[src/Outputs/TCode/TCodeSerialOutput.cs:337](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeSerialOutput.cs#L337)；[src/Outputs/TCode/TCodeTcpOutput.cs:40](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeTcpOutput.cs#L40)；[src/Outputs/OutputCoordinator.cs:390](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputCoordinator.cs#L390)）

三种 transport 首次发送全部非忽略轴，后续只发送变化轴并去重；UDP 距上次全量至少 1 秒时，在 Send 中重发全轴，配合宿主每秒刷新改善丢包后的目标状态恢复。停止/断开尝试发送 DSTOP。adapter 的 Center 方法以 I1000 请求 V轴0、其他轴0.5，仍经过轴配置；当前应按实际宿主入口判断其可见性，不把仅有底层方法写成已提供的 UI 功能。（来源：[src/Outputs/TCode/TCodeSerialOutput.cs:96](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeSerialOutput.cs#L96)、[src/Outputs/TCode/TCodeSerialOutput.cs:128](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeSerialOutput.cs#L128)、[src/Outputs/TCode/TCodeSerialOutput.cs:158](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeSerialOutput.cs#L158)、[src/Outputs/TCode/TCodeSerialOutput.cs:392](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeSerialOutput.cs#L392)；[src/Outputs/TCode/TCodeUdpOutput.cs:74](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeUdpOutput.cs#L74)、[src/Outputs/TCode/TCodeUdpOutput.cs:117](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeUdpOutput.cs#L117)；[src/Hosting/SensaHost.cs:268](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L268)）

#### Intiface / Buttplug

Intiface 使用 Buttplug v5 功能 API，支持连接/断开、显式扫描开始/停止、设备增删通知、停止全部设备。位置目标为 1−L0；支持 HwPositionWithDuration 时优先发送带时长命令，否则仅向 Position 功能发原始位置。有位置功能的设备振动使用 V0，没有位置功能的设备使用 L0 驱动振动。所有设备共享该 L0/V0 逻辑，变化达到 0.001 才重发，整批输出期限 500ms；没有实现其他旋转、泵、吸力等 Buttplug 功能映射。（来源：[src/Outputs/Intiface/IntifaceOutputClient.cs:42](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifaceOutputClient.cs#L42)、[src/Outputs/Intiface/IntifaceOutputClient.cs:83](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifaceOutputClient.cs#L83)、[src/Outputs/Intiface/IntifaceOutputClient.cs:100](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifaceOutputClient.cs#L100)、[src/Outputs/Intiface/IntifaceOutputClient.cs:112](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifaceOutputClient.cs#L112)、[src/Outputs/Intiface/IntifaceOutputClient.cs:149](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifaceOutputClient.cs#L149)、[src/Outputs/Intiface/IntifaceOutputClient.cs:192](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifaceOutputClient.cs#L192)；[src/Outputs/Intiface/IntifacePositionFeatures.cs:6](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifacePositionFeatures.cs#L6)）

可管理内置 intiface-engine，也可关闭进程管理连接外部 Intiface Central。内置引擎从程序同目录或 LocalApplicationData/Sensa 查找，以无窗口子进程启动、启用 BLE/HID、关闭崩溃报告；宿主等待 1500ms 后连接，断开或释放时终止所管理的子进程树。（来源：[src/Outputs/Intiface/IntifaceOutputClient.cs:211](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifaceOutputClient.cs#L211)、[src/Outputs/Intiface/IntifaceOutputClient.cs:224](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifaceOutputClient.cs#L224)、[src/Outputs/Intiface/IntifaceOutputClient.cs:257](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifaceOutputClient.cs#L257)、[src/Outputs/Intiface/IntifaceOutputClient.cs:266](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifaceOutputClient.cs#L266)；[src/Outputs/OutputCoordinator.cs:437](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputCoordinator.cs#L437)）

### 实现边界与保留字段

以下字段目前存在于配置或类型定义中，但不代表已接通的功能：

- WebUi.Title 目前只规范化、复制和保存；页面标题固定为 index.html 中的 Sensa WebUI，未接入运行时标题更新。[配置字段](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L379)、[页面标题](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/index.html#L6)

- DeviceRoutes 以及 DeviceName / SendL0 / SendV0 / Enabled 仅声明、复制和保存；Intiface 发送器不读取它，不能描述为已实现逐设备路由。（来源：[src/Configuration/AppConfig.cs:248](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L248)、[src/Configuration/AppConfig.cs:390](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L390)；[src/Outputs/Intiface/IntifaceOutputClient.cs:112](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface/IntifaceOutputClient.cs#L112)）
- IsOgbSocket / IsOgbPlug 仅声明和复制，不参与后端处理。（来源：[src/Signals/SignalMapping.cs:16](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SignalMapping.cs#L16)；[src/Configuration/AppConfig.cs:1239](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L1239)）
- PreferSpeedMode 被保留、复制或镜像，当前编码器依据 RequestedCommandMode、SlopeMode、每轴 CommandMode，不读取该布尔值。（来源：[src/Configuration/AppConfig.cs:634](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L634)、[src/Configuration/AppConfig.cs:992](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L992)；[src/Outputs/TCode/TCodeEncoder.cs:172](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeEncoder.cs#L172)）
- ObservedMin / ObservedMax 与 ResetCalibration 只存在于处理器，未发现宿主消费入口；不能写成已接通的自动校准建议或自动校准功能。（来源：[src/Signals/SignalPipeline.cs:24](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SignalPipeline.cs#L24)、[src/Signals/SignalPipeline.cs:65](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SignalPipeline.cs#L65)）

## 浏览器界面与交互

### 页面结构、运行状态与实时通信

WebUI 是 React 与 Material UI 单页界面，入口加载 /app.bundle.js，页面分为输入、轴配置、输出、日志四大区域。顶部提供中英文切换、实时连接、OSC 监听、实际输入方式、启用输出数量，以及停止/恢复输出按钮。[index.html:L1](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/index.html#L1)、[app.js:L3120](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3120)、[app.js:L5233](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5233)、[app.js:L5810](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5810)、[app.js:L5886](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5886)、[app.js:L6004](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L6004)

界面有几组互相独立的状态，不能仅凭当前显示的页签判断设备正在做什么：

| 状态 | 作用与操作 |
|---|---|
| 当前输入方式 | 手动、OSC、脚本三选一，后端快照决定实际生效方式。 |
| 当前页签 | 仅切页签只浏览界面，显示“待应用”；可点击“应用输入方式”切换。提交手动目标、导入或播放脚本也会切换实际模式。 |
| 输入开关 | 控制是否允许输入驱动输出；关闭时停止设备，仍可观察 OSC、诊断和校准。 |
| 输出启用 | 每个输出独立启用或禁用；没有输出或全部禁用时显示提示。 |
| 急停 | “停止输出”请求 emergency-stop；“恢复输出”解除急停后仍须手动重新打开输入。 |
| OSC 接收器 | 配置开关独立于输入激活开关；实际监听还要求当前输入模式为 OSC。关闭接收器停止监听，不切换输入模式。 |
| 草稿与已保存配置 | 未保存映射只影响当前浏览器预览；保存配置会关闭输入，之后需手动重新打开。 |

来源：[app.js:L3169](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3169)、[app.js:L4056](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4056)、[app.js:L4453](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4453)、[app.js:L5085](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5085)、[app.js:L5270](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5270)、[app.js:L5293](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5293)、[app.js:L5368](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5368)、[osc-workflow.js:L2](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-workflow.js#L2)。

前端先以同源凭据访问 /api/session，再建立同主机 /api/ws。apiRequest 实际通过 WebSocket 把 API 路径、method、body、请求 id 封装为命令，而不是直接对每个控制路径发送 HTTP 请求；超时为 15 秒。状态帧同时刷新运行总览和日志。会话初始化失败约 3 秒后重试，断线约 1.5 秒后重连；断线拒绝未完成请求，页面卸载关闭连接。[app.js:L1309](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1309)、[app.js:L1362](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1362)、[app.js:L1376](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1376)、[app.js:L3246](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3246)、[app.js:L3504](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3504)

浏览器本地保存当前输入页签、脚本倍率与循环偏好、语言和 OSC 路径置顶列表；这些不构成完整配置备份。完整配置通过后端 /api/config 保存。脚本 A/B 区间不进入本地 scriptDefaults，手动持续更新开关每次初始化为关闭。[app.js:L255](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L255)、[app.js:L1412](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1412)、[app.js:L1443](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1443)、[app.js:L1777](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1777)、[app.js:L3147](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3147)、[app.js:L3308](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3308)、[i18n.js:L5](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/i18n.js#L5)、[osc-preview.js:L63](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L63)

### 手动输入

手动页提供以下全部 12 个逻辑轴的 0–999 滑条和数值编辑：

| 轴 | 界面含义 |
|---|---|
| L0 | 主往复行程，0 缩回、999 伸出。 |
| L1 | 前后平移，小值朝前、大值朝后。 |
| L2 | 左右平移，正向为用户左侧。 |
| R0 | 绕 L0 的扭转。 |
| R1 | 绕 L1 的滚转。 |
| R2 | 绕 L2 的俯仰。 |
| V0、V1、V2 | 三路震动，0 关闭、999 最大。 |
| A0、A1、A2 | 三路辅助通道。 |

“更新位置”一次提交所有轴；“回正”把运动轴和辅助轴设为 500，震动设为 0。关闭“持续更新”时只修改本地草稿，开启后每次修改合并到下一次 requestAnimationFrame 提交；切换该开关本身不会额外发送一次命令。逻辑目标仍受输出侧轴配置限制。[app.js:L92](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L92)、[app.js:L107](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L107)、[app.js:L4074](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4074)、[app.js:L4094](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4094)、[app.js:L4138](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4138)、[app.js:L5727](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5727)

实际提交手动目标会切到 Manual 模式；总输入已经启用时可以立即形成输出，不需要再按一次“应用输入方式”。[手动提交](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L999)

手动斜率方式可以选择“跟随轴配置”、时间 I 或速度 S。I 指定 1–1000ms；S 指定逻辑速度 1–999，默认 999。跟随轴配置时，各轴分别选择时间、速度或无斜率；实际发送速度继续经过轴上限和每个输出的速度单位换算。[app.js:L224](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L224)、[app.js:L250](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L250)、[app.js:L978](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L978)、[app.js:L4113](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4113)、[app.js:L5180](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5180)、[app.js:L5760](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5760)

### OSC 接收、OSCQuery 与 Hub

OSC 工作区分“参数与映射”“空间诊断”“量程校准”；参数页设置再分“基础”“OSCQuery”“Hub”。基础项包括接收器启用、监听地址、UDP 端口、允许来源 IP、断流停止毫秒数。默认监听 127.0.0.1:9001；来源列表按空格、逗号、分号或换行拆分，留空不限；断流停止为 0 时关闭。UI 提醒增量 OSC 静止时可能不发包，只有持续发送的来源适合配置断流时间。[app.js:L834](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L834)、[app.js:L3725](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3725)、[app.js:L5344](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5344)、[app.js:L5365](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5365)、[app.js:L5371](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5371)

OSCQuery 提供远端根地址、客户端启用、LISTEN 不支持时的轮询回退、轮询频率、自动发现开关。前端把轮询频率归一到 1–30Hz，默认 10Hz；显示已同步路径数、LISTEN 连接、轮询运行状态及同步/轮询/自动发现错误。自动发现把 Sensa 广播为 OSCQuery receiver，便于 VRChat 发现当前接收端。[app.js:L60](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L60)、[app.js:L736](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L736)、[app.js:L834](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L834)、[app.js:L3749](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3749)、[app.js:L5026](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5026)、[app.js:L5404](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5404)

Hub 向多个 UDP 目标转发实时 OSC，可选参数变化立即转发的事件驱动，或每周期合并最新值的固定频率缓冲。固定频率范围 1–240Hz，默认 10Hz。每个目标可设置名称、主机、端口、启用或移除；新增时自动避开已占用端口和当前接收器端口。保存前检查重复目标及向当前接收器回发的环路。每目标显示待保存、禁用、冲突、待数据、正常、异常及最近发送时间；多个来源但未固定“使用来源”时提示 Hub 被阻塞。[app.js:L717](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L717)、[app.js:L742](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L742)、[app.js:L781](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L781)、[app.js:L800](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L800)、[app.js:L1165](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1165)、[app.js:L2854](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L2854)、[app.js:L3758](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3758)、[app.js:L3797](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3797)、[app.js:L5050](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5050)、[app.js:L5469](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5469)

### 参数工作台与来源隔离

参数表展示来源、路径、类型、当前值、更新时间和操作。命中当前映射的行高亮，提示对应目标角色和反向；点击路径打开“参数含义”，再生成映射草稿。[app.js:L5523](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5523)、[app.js:L5572](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5572)、[app.js:L5599](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5599)、[app.js:L6331](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L6331)

工作台支持路径搜索、显示/隐藏 FT，以及全部可见、触觉候选、已映射、定位阵列筛选。FT 默认隐藏，但显式映射或置顶的 FT 可继续显示；排序依次优先置顶、已映射、相关性、自然路径。初始最多显示 100 项，可每次再显示 100 项；最多持久化 64 个置顶路径。自动补全候选合并实时参数和 OSCQuery 节点，OGB 路径优先。“冻结预览”只保留表格快照，不停止设备，也不冻结运行映射输入。[osc-preview.js:L16](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L16)、[osc-preview.js:L63](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L63)、[osc-preview.js:L142](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L142)、[osc-preview.js:L152](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L152)、[app.js:L3130](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3130)、[app.js:L3614](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3614)、[app.js:L4973](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4973)、[app.js:L5523](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5523)

存在多个来源时，“使用来源”通过 /api/input/osc/source 决定映射预览和运行输入默认来源；下方来源标签页只负责浏览，不改变实际控制来源。普通参数预览在指定来源内取最近更新项并显示命中数；姿态预览不混合来源，本地点必须限定唯一实例和来源。[app.js:L3774](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3774)、[app.js:L4960](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4960)、[app.js:L4971](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4971)、[app.js:L5538](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5538)、[osc-preview.js:L79](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L79)、[osc-preview.js:L92](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L92)、[osc-preview.js:L104](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L104)

原始阵列参数有探针颜色和编号：八点阵列 C1–C8、四点本地点/PB 阵列 P1–P4，原始路径后缀仍为 A0 起始编号。这些是输入距离样本，不是设备 A0/A1/A2 辅助轴，也不能把单个样本直接当作行程。[osc-preview.js:L31](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L31)、[PosePanel.jsx:L43](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/PosePanel.jsx#L43)

### 映射编辑与浏览器模拟

每条映射包含路径、输入解释、目标角色、方向、输入范围、映射范围和曲线。路径支持精确匹配、单段 *、多段 **，以及分号或换行分隔的最多 32 个候选；通配比较有最多 64 段的边界。[osc-preview.js:L2](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L2)、[osc-preview.js:L70](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L70)、[app.js:L2934](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L2934)

| 输入解释 | 数据含义 |
|---|---|
| Direct | 原始 OSC 标量直接校准和映射。 |
| SpsSocketDepth | SPS NewRoot/NewTip 配对的深度解释。 |
| SensaPose | 后端解算的 Depth、OffsetX、OffsetY、Yaw、Pitch、Roll。 |
| SensaPoint | 后端解算的本地点/PB 局部 X、Y、Z 或距参考原点。 |

目标角色覆盖 GateEnable、DepthOverride、Depth→L0、Surge→L1、Sway→L2、AngleX→R1、AngleY→R2、Twist→R0、V0/V1/V2，以及 Auxiliary/Auxiliary1/Auxiliary2→A0/A1/A2。[app.js:L122](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L122)、[app.js:L2998](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L2998)

输入范围把标量校准为 0–1并夹紧，反向交换范围方向；曲线可选线性、缓入平方、缓出平方、缓入缓出，再进入 0–999 的逻辑位置映射区间。它还不是每个设备实际发送的目标值，输出自身的轴配置继续处理。[app.js:L211](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L211)、[app.js:L1497](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1497)、[app.js:L1510](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1510)、[app.js:L3062](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3062)

映射行展示实时输入或解算输入、预估位置、实际命中路径和数量；SPS 配对深度和 Pose Roll 的前端实时预估位置留空。“模拟”允许在浏览器中输入测试原始值，显示“模拟值→归一化→曲线→位置”；模拟开关和数值保存前被剔除，不进入配置或后端，不驱动设备。[app.js:L675](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L675)、[app.js:L916](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L916)、[app.js:L2934](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L2934)、[app.js:L3039](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3039)

同轴多条规则不相加，按校准后更高强度者接管；映射区间重叠时提示可能出现某条规则在部分区间看似无效。门控和覆盖是独立目标角色，不能当作普通位移轴理解。[app.js:L143](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L143)、[app.js:L158](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L158)、[app.js:L5667](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5667)

映射支持新增、移除、确认清空、恢复已保存列表、保存并应用。清空先改变页面草稿，可用“恢复映射”撤销；真正保存后替换运行时映射并关闭输入。未保存状态有单独提示。[app.js:L3815](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3815)、[app.js:L3827](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3827)、[app.js:L3840](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3840)、[app.js:L5711](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5711)、[app.js:L6320](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L6320)

参数表的快捷映射依据参数种类处理：Point/Handle 替换整套草稿为该对象 Z 位移，Pose 替换为该对象深度，均移除旧门控；SpsRoot/SharedRoot 只提示查看诊断；NewRoot/NewTip 追加同前缀配对规则；Touch/Frot 默认追加 V0，其他参数默认追加 Depth。生成草稿后仍须确认含义和保存。[app.js:L3622](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3622)、[app.js:L3631](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3631)、[app.js:L3648](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3648)

### 完整内置预设目录

当前有 29 套内置 OSC 预设。表中未显式规定的范围和曲线使用映射默认值；所有预设首先生成草稿，保存映射后才进入运行配置。[osc-presets.json:L1](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L1)、[app.js:L683](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L683)、[app.js:L3855](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3855)

| id | 功能 | 规则数 | 实现 |
|---|---|---:|---|
| sensa-quick-start | 测试世界 Depth + Active 门控。 | 2 | [L3](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L3) |
| sensa-pose-depth | 配套 Pose 几何深度。 | 1 | [L12](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L12) |
| sensa-pose-full | 深度、Yaw、Pitch、Roll、孔口 XY 六轴。 | 6 | [L27](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L27) |
| sensa-point-z | 本地点局部 Z→L0，模板 0–0.2m。 | 1 | [L82](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L82) |
| sensa-point-xyz | 本地点 Z/X/Y→L0/L2/L1。 | 3 | [L97](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L97) |
| sensa-point-distance | 本地点距参考原点→L0。 | 1 | [L128](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L128) |
| sensa-handle-z | PB 把手 Z→L0。 | 1 | [L143](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L143) |
| sensa-handle-xyz | PB 把手三轴位置。 | 3 | [L158](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L158) |
| sensa-handle-distance | PB 把手距参考原点。 | 1 | [L189](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L189) |
| sensa-aux-vibration | 振动辅助角色→V0。 | 1 | [L204](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L204) |
| sensa-aux-gate | 辅助 GateEnable。 | 1 | [L215](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L215) |
| sensa-aux-override | 辅助 DepthOverride。 | 1 | [L226](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L226) |
| sensa-aux-angles | 辅助 AngleX/AngleY。 | 2 | [L237](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L237) |
| sps-socket-depth-others | SPS Socket NewRoot/NewTip，仅他人。 | 1 | [L252](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L252) |
| sps-socket-depth-self | SPS Socket NewRoot/NewTip，仅自身。 | 1 | [L265](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L265) |
| sps-plug-depth-others | VRCFury Plug PenOthers，默认不反向。 | 1 | [L278](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L278) |
| sps-plug-depth-self | VRCFury Plug PenSelf，默认不反向。 | 1 | [L290](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L290) |
| sps-socket-depth | Socket 自身与他人各一配对。 | 2 | [L302](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L302) |
| sps-plug-depth | Plug 自身/他人别名。 | 1 | [L321](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L321) |
| ogb-socket-full | 旧 OGB 深度及左右/上下姿态分段映射。 | 5 | [L333](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L333) |
| ogb-plug-full | 旧 OGB 他人与自身深度，反向。 | 2 | [L373](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L373) |
| ogb-plug-others | 旧 OGB 仅他人，反向。 | 1 | [L392](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L392) |
| ogb-plug-self | 旧 OGB 仅自身，反向。 | 1 | [L405](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L405) |
| osr-inserted-pussy | OGB/Orf/Pussy/PenOthers→Depth。 | 1 | [L418](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L418) |
| osr-inserted-ass | OGB/Orf/Ass/PenOthers→Depth。 | 1 | [L430](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L430) |
| sps-touch | TouchOthers/TouchSelf/FrotOthers→V0。 | 1 | [L442](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L442) |
| sensa-aux | 振动、门控、覆盖、双方向组合，须按需删减。 | 5 | [L453](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L453) |
| sensa-lab-pb-stretch | 原生 PB Stretch→Depth，IsGrabbed 门控。 | 2 | [L480](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L480) |
| sensa-lab-shader-z | 实验 Shader Z 0–0.2m→Depth，Valid 门控。 | 2 | [L497](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L497) |

Pose 六轴模板 Yaw/Pitch 范围为 ±65°，Roll 为 ±180°，Offset XY 为 ±0.04m；本地点 X/Y 模板范围为 ±0.1m。模板仍需按安装和设备重新校准；PB 把手仅抓取时有效。旧 OGB Plug 反向与新 VRCFury Plug 默认不反向是两类不同模板，不能因为名称相近混用。[osc-presets.json:L27](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L27)、[osc-presets.json:L97](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L97)、[osc-presets.json:L143](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L143)、[osc-presets.json:L278](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L278)、[osc-presets.json:L373](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/osc-presets.json#L373)

预设管理支持替换草稿、追加草稿、复制内置为自定义、编辑自定义名称/说明/映射、当前列表另存、新建空预设、删除自定义。内置预设不能原地修改或删除；自定义项保存在后端 oscMappingPresets，用户名称和说明不随语言切换被翻译。[app.js:L862](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L862)、[app.js:L881](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L881)、[app.js:L899](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L899)、[app.js:L3855](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3855)、[app.js:L3902](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3902)、[app.js:L3925](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3925)、[app.js:L5634](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5634)

### 空间诊断与两点校准

Pose 面板标明实验性 Sensa Pose v1，显示 Root、Tip、Side 三个配套标记的 24 路样本。可选观测对象，区分有效、已进入和当前控制对象；提供侧视 Z/X、正视 X/Y 的 SVG 投影，每格 5cm。数值包括插入比例、沿 Pen 已入长度、孔口 XY 偏移、Yaw/Pitch、Roll、最大拟合残差、Socket 轴向深度、标记轴长和最近参数变化时间。[PosePanel.jsx:L7](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/PosePanel.jsx#L7)、[PosePanel.jsx:L31](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/PosePanel.jsx#L31)、[PosePanel.jsx:L45](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/PosePanel.jsx#L45)、[PosePanel.jsx:L54](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/PosePanel.jsx#L54)

可将当前 Pose 替换为该对象的深度或六轴整套草稿。界面明确：观测标记/骨骼不等于 GPU 形变后的网格；双方需使用匹配通道并正确对齐 Root/Tip/Side；支持条件是单匹配目标和均匀缩放。残差仅表示拟合一致性，不能当作实际定位精度。未进入孔口、角度过大或定位无效会停止输出，不自动回退旧 OGB；静止值不等于断线。[PosePanel.jsx:L41](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/PosePanel.jsx#L41)、[PosePanel.jsx:L49](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/PosePanel.jsx#L49)、[PosePanel.jsx:L68](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/PosePanel.jsx#L68)、[app.js:L3622](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3622)

位置诊断面板统一展示 Point/Handle、SpsRoot、SharedRoot。Point/Handle 用四路样本解算本地骨骼或 PB 把手参考坐标系位置；Root/SharedRoot 用八路估计根部 XYZ，仅用于诊断，不能恢复尖端、完整姿态或插入比例。面板显示 XZ/YZ 投影、XYZ、横向距离、拟合残差、采样数和原因；SharedRoot 显示当前槽位，一次仅测一个槽位。PB 需抓取；关闭输入仍可诊断。[SpsRootPanel.jsx:L6](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/SpsRootPanel.jsx#L6)、[SpsRootPanel.jsx:L21](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/SpsRootPanel.jsx#L21)、[SpsRootPanel.jsx:L36](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/SpsRootPanel.jsx#L36)、[SpsRootPanel.jsx:L45](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/SpsRootPanel.jsx#L45)

两点量程校准仅针对 Point/Handle。选择 X/Y/Z/距参考原点后，分别采集 0% 与 100%；每个端点保存对象 key、prefix、sourceKey、metric 和值。采集拒绝无效或非有限位置；生成校准草稿拒绝对象/来源/轴不一致、缺失端点以及差值不足 1mm。坐标下降表示行程增加时自动反向，实时百分比夹紧 0–100%并提示越界。端点仅保留于本页面，Root/SharedRoot 不能当作完整行程校准。[SpsRootPanel.jsx:L24](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/SpsRootPanel.jsx#L24)、[SpsRootPanel.jsx:L58](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/SpsRootPanel.jsx#L58)、[osc-preview.js:L113](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L113)、[osc-preview.js:L121](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L121)、[osc-preview.js:L131](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/osc-preview.js#L131)

“替换为校准映射”替换全部草稿并移除旧门控，之后回参数页检查并保存，不自动打开输入。所选对象丢失后需重新选择，旧端点不自动用于其他对象；已有有效端点可保留用于检查草稿，但失效时不能采集新点。[SpsRootPanel.jsx:L28](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/SpsRootPanel.jsx#L28)、[SpsRootPanel.jsx:L39](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/SpsRootPanel.jsx#L39)、[SpsRootPanel.jsx:L60](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/SpsRootPanel.jsx#L60)、[app.js:L3648](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3648)

### 脚本播放器

支持导入、更换、卸载 .funscript 或 .json；浏览器读取文本，把文件名、内容、loop/speed 偏好提交后端。载入后不等于自动播放，但导入或播放会切到 Script 模式；从其他模式切入且输入已激活时，运行时可能立即输出已载入脚本的当前位置，不能把“未播放”理解为必定不发初始目标。[脚本载入](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L1049)、[模式切换](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L215)播放器显示文件、就绪/播放/暂停/完成状态、当前位置、总时长、剩余时长、动作数、当前 L0、进度、倍率和单次/整段/A-B 循环状态。[app.js:L3461](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3461)、[app.js:L3698](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3698)、[app.js:L4359](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4359)、[app.js:L4518](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4518)、[app.js:L4606](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4606)

播放器的暂停、停止和卸载不等于顶部“停止输出”：它们不直接发送全局停止命令。Stop 把播放游标置零，不保证设备回零；暂停时定位或前后关键帧仍会产生帧，在 Script 模式且输入已启用时可驱动输出。[播放器控制](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L159)、[暂停定位与步进](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L226)、[运行时消费](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L348)

控制包括播放/继续、暂停、停止、从头重播、上一/下一动作关键帧、拖动进度、开头/结尾、±5秒、±10秒和时间码跳转。时间码解析支持普通秒数、s/ms 后缀、分:秒、时:分:秒及小数，跳转夹紧到脚本范围。倍率为 0.1–4x，滑条步长 0.05，快捷值为 0.25、0.5、1、1.5、2、3、4x。[app.js:L263](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L263)、[app.js:L1701](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1701)、[app.js:L1739](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1739)、[app.js:L4172](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4172)、[app.js:L4191](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4191)、[app.js:L4199](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4199)、[app.js:L4229](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4229)、[app.js:L4264](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4264)、[app.js:L4342](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4342)、[app.js:L4879](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4879)

动作密度时间轴显示后端 activityBins、播放头、悬停时间/密度、A/B 标记和循环区间。点击定位、Shift+点击设 A、Alt+点击设 B、拖动框选完整 A-B，松开提交，Esc 取消拖选。也可把当前播放/拖动预览位置设为 A/B、跳至边界或清除区间；反向框选会交换起终点，零长度不作为有效区间。循环打开且 A/B 完整时只循环该区间，否则循环整段；关循环为一次播放。[app.js:L1686](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1686)、[app.js:L2305](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L2305)、[app.js:L4289](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4289)、[app.js:L4308](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4308)、[app.js:L4326](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4326)、[app.js:L4802](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4802)

| 快捷键 | 动作 |
|---|---|
| Space / K | 播放/暂停 |
| R | 从头重播 |
| J / L | 上一/下一关键帧 |
| ← / → | 快退/进 5秒 |
| Shift + ← / → | 快退/进 10秒 |
| Home / End | 开头/结尾 |
| Shift + A / B | 设置 A/B |
| [ / ] | 跳到 A/B |
| Shift + C | 清除 A-B |
| - / + | 倍率降低/增加 0.1x |

快捷键只在脚本页生效；输入框、可编辑内容、按钮和滑条有焦点时让出键盘，忽略长按重复及 Ctrl/Meta 等修饰组合。说明和快捷键有独立辅助页。[app.js:L287](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L287)、[app.js:L1795](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1795)、[app.js:L3353](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3353)、[app.js:L4910](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4910)

倍率只改变脚本时间推进，不是硬件 TCode S 速度；脚本按位置关键帧直接输出，普通 funscript 不由轴配置或输出配置自动补算 S/I。界面没有新增、删除或修改关键帧内容的图形编辑器。[app.js:L3223](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3223)、[app.js:L4564](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4564)

### 轴配置管理

轴配置是可复用卡片，可新建、命名、修改、设默认、移除非默认项。卡片显示各轴配置及使用该配置的 TCode 输出数；删除非默认配置时，其绑定输出回退默认配置，默认项不能删除。[app.js:L335](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L335)、[app.js:L542](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L542)、[app.js:L3988](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3988)、[app.js:L4018](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4018)、[app.js:L4034](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4034)、[app.js:L5824](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5824)

每个轴支持普通、普通反向、锁定、锁定反向、忽略。普通模式先把逻辑 0–1 重映射到设备位置区间，再施加独立边界夹紧；锁定指定固定位置，内部为 0–1、界面显示 0–999；忽略不参与输出。每轴可选 I/S/无斜率、逻辑速度上限及 I 对应时长，另有非标准 ramp 扩展：无、= 线性、< 缓入、> 缓出、<> 缓入缓出。[app.js:L350](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L350)、[app.js:L369](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L369)、[app.js:L1004](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1004)、[app.js:L2719](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L2719)

五套快速模板为 OSR 首次测试小行程、SR6/OSR6 六轴、OSR2 三轴、仅 L0、L0+固定姿态。首次测试只输出 L0，映射与限位均为 400–600，速度上限 100，其余轴忽略。模板不等于硬件校准，也不会自动启用运动。[app.js:L388](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L388)、[app.js:L424](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L424)、[first-run-motion.json:L1](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/data/first-run-motion.json#L1)

### 输出管理与目标预览

可添加多个 TCode 串口、UDP、TCP、Intiface 输出，新输出默认禁用并打开配置对话框。每卡独立改名、启用/禁用和移除。[app.js:L78](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L78)、[app.js:L1181](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1181)、[app.js:L1250](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1250)、[app.js:L4374](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4374)、[app.js:L4386](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4386)、[app.js:L4407](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4407)、[app.js:L5899](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5899)

TCode 输出可选择独立轴配置、输出斜率覆盖（跟随各轴、强制 I、强制 S、只发位置）和速度单位（每100ms、每秒）。串口从后端枚举，描述含 CH340/CH341/CP210/FTDI/Arduino 等关键词时优先建议；已分配端口在选择器中禁用。UDP/TCP 编辑 Host/Port，新增自动绕过已有端点。重复串口、同传输网络目标、Intiface WebSocket 地址或受托管引擎端口会阻止保存。[app.js:L1115](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1115)、[app.js:L1181](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1181)、[app.js:L1219](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1219)、[app.js:L1421](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1421)、[app.js:L4435](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4435)、[app.js:L6097](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L6097)

串口卡和配置窗口显示 D0 固件版本、D1 TCode 版本、D2 轴描述，可连接后刷新，显示最近查询时间、查询失败或未返回。UI 无波特率选择，帮助明确当前串口固定 115200。[app.js:L2599](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L2599)、[app.js:L2646](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L2646)、[app.js:L4477](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4477)、[HelpDialog.jsx:L13](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/HelpDialog.jsx#L13)

Intiface 可配置 WebSocket 地址、引擎端口及后台托管 intiface-engine.exe；输出卡列出发现设备，并提供开始/停止扫描。界面没有逐设备选中、逐 feature 绑定或校准控件，具体设备映射由后端实现。[app.js:L4469](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4469)、[app.js:L5967](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5967)、[app.js:L6220](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L6220)

每个输出显示自己的 telemetry 目标、状态、最近发送时间与进度条：TCode 为 0–999，其他设备以百分比显示。状态有禁用、未连接、等待发送、最近发送目标、已请求停止、发送异常。没有发送目标时保持空白，连接不会自动制造位置数值。这些是已包含输出侧处理、最近被传输/API 接受的命令，不是位置传感器回读，不能证明硬件到位；UDP 也没有远端确认。[output-preview.js:L3](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/output-preview.js#L3)、[OutputPositionPanel.jsx:L6](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/OutputPositionPanel.jsx#L6)、[HelpDialog.jsx:L10](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/HelpDialog.jsx#L10)

实现限制：TCode 目标遥测的解析器目前只接受裸位置或带数字 I／S 的 token；附加非 None 的 RampType 后缀（=、<、>、<>）后，该 token 不进入目标遥测，卡片可能空白或保留旧值，而传输层仍会发送命令。[遥测解析](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputTelemetry.cs#L17)、[Ramp 编码](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeEncoder.cs#L192)、[发送顺序](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode/TCodeSerialOutput.cs#L110)

### 录制与结构化日志

输入区提供“录制 L0”/停止录制、帧数和导出按钮，调用 /api/recording/start、stop、export。导出使用后端返回内容和文件名生成 JSON Blob 下载，空内容仅提示；采样时刻、去重和 funscript 内容由后端负责。[app.js:L3602](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3602)、[app.js:L5312](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5312)

日志可按级别、分类、轴、处理结果和关键词筛选，或仅看轴调试；仅看轴调试自动包含 debug。前端最多显示过滤后最近 300 条，并显示总匹配、可见轴调试、输出更新/保持/忽略统计。[app.js:L1817](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1817)、[app.js:L5116](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5116)、[app.js:L5130](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5130)、[app.js:L6009](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L6009)

AXIS 文本日志被解析成结构化卡片，展示输入和输出前后值、归一化、重映射、边界裁剪、请求逻辑速度、速度上限、最终逻辑速度、实际 S、I 毫秒、轴模式、反向、范围、锁定位置和跳过原因。普通日志保留类别、时间、级别颜色和消息。[app.js:L1543](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1543)、[app.js:L1585](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L1585)、[app.js:L2204](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L2204)、[app.js:L2703](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L2703)

### 帮助、双语与窄屏

帮助共七个主题：三端联动、开始使用、OSC与Unity、校准与映射、输出与排错、预设选择、OSR首次测试。预设主题可按中英名称、说明和 id 搜索全部内置项；提供完整指南、Unity操作指南和测试世界说明链接。窄屏帮助对话框全屏显示。[HelpDialog.jsx:L6](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/HelpDialog.jsx#L6)、[HelpDialog.jsx:L15](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/HelpDialog.jsx#L15)

语言支持简体中文、英文；已保存选择优先，再读取浏览器偏好，均不匹配时默认英文。切换即时更新应用文案、MUI locale、html lang和日期格式，文档自动链接到英文 .en.md。只翻译显式应用字符串和受控诊断，用户名称、地址、路径、第三方未知消息保持原文。词典包含1060条英文应用项及16条诊断模板。[i18n.js:L5](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/i18n.js#L5)、[i18n.js:L29](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/i18n.js#L29)、[i18n.js:L44](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/i18n.js#L44)、[i18n.js:L55](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/i18n.js#L55)、[i18n.js:L68](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/i18n.js#L68)、[i18n.js:L76](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/i18n.js#L76)、[i18n.en.json:L1](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/i18n.en.json#L1)、[i18n-diagnostics.json:L1](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/i18n-diagnostics.json#L1)、[app.js:L4492](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4492)、[app.js:L5253](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L5253)

响应式 CSS 包括多断点栅格、手机单列输出卡、参数表横向滚动、校准步骤/空间投影改单列、脚本工作台重排和键盘焦点样式。手机工具栏隐藏辅助状态标签，保留语言与停止按钮。响应式实现不代表所有真实设备已验收，实际测试边界仍以验证章节为准。[styles.css:L837](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/styles.css#L837)、[styles.css:L1158](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/styles.css#L1158)、[styles.css:L1945](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/styles.css#L1945)、[styles.css:L2261](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/styles.css#L2261)、[styles.css:L3061](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/styles.css#L3061)、[styles.css:L3563](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/styles.css#L3563)、[styles.css:L4135](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/styles.css#L4135)、[styles.css:L4252](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/styles.css#L4252)

### 可见界面的能力边界

WebUI 的监听 Host/Port、自动打开浏览器等不在本页表单中；OSC receiverHost 只配置 OSC 接收器。OSCQuery receiver 的 serviceName/httpPort 在草稿中保留但无可见编辑项；保存时 advertiseAvatar、advertiseTracking 固定为 true，Hub forwardAvatarChange 也固定为 true，均无界面开关。[app.js:L834](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L834)、[app.js:L3749](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3749)

手动 disableManualInput 函数有实现但没有对应可见按钮，主要由总输入开关控制。界面没有完整配置导入/导出、日志下载或关键帧内容编辑；此处直接文件下载是录制导出。应区分浏览器模拟、映射预估、已保存运行目标、每输出最近发送目标、实际物理位置，避免把预览描述成真实设备反馈。[app.js:L3602](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L3602)、[app.js:L4159](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4159)、[app.js:L4518](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L4518)、[app.js:L6004](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/app.js#L6004)、[OutputPositionPanel.jsx:L6](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/OutputPositionPanel.jsx#L6)

## Unity 资产与实验工具

本节按源码描述 Unity 包、Avatar 实验工具、World 实验工具及配套脚本；“具备生成/验证代码”与“已经在 VRChat、头显或真实设备验证”是不同结论。本次仅阅读源码，没有启动 Unity、生成截图、运行全进程 smoke 或连接设备。

### Unity 包的定位与构建流程

- 包名为 `top.sealoong.sensa`，面向 Unity 2022.3，声明依赖 VRChat Avatars、Modular Avatar 和 NDMF；它提供 Avatar 上的编辑配置组件、构建时生成器、预制件和测试。声明的最低 SDK 是 3.7.0，Raycast 则由 3.10.3 的编译条件单独开启。[包清单](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/package.json#L1)、[SDK 条件](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Runtime/UnityBox.Sensa.asmdef#L16)
- NDMF 的 Generating 阶段依次处理 QuickStart、自动 SPS、本地点、Pose 和传统 SensaComponent；Optimizing 阶段再次计算最终 Contact 总数。源码还保留 SDK preprocess 回调，NDMF 存在时该回调直接返回，避免重复生成。Editor 程序集自身仍显式引用 NDMF 和 Modular Avatar，所以该回调不等于已经验证“可以卸载这些声明依赖”。[构建入口](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L23)、[程序集依赖](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/UnityBox.Sensa.Editor.asmdef#L4)
- 生成完成后移除 Sensa 的配置组件，保留原生 VRC Contacts、PhysBone、约束、Animator 和 Modular Avatar 合并内容。自动、本地点、Pose、QuickStart 都只生成启用的配置并清除禁用配置；传统 `SensaComponent` 的遍历没有 enabled 筛选。[自动生成清理](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaAutoBuilder.cs#L29)、[本地点清理](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaPointBuilder.cs#L17)、[Pose 清理](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaPoseBuilder.cs#L15)、[传统入口](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L37)
- 新传感器生成器要求命名为 1–48 个 ASCII 字母、数字、下划线或连字符；所有祖先 Transform 必须为正的均匀缩放，接收器缩放后的半径不得超过 3 米；新增与现存 Sender/Receiver 合计不能超过 256。Modular Avatar 参数默认 localOnly、非保存、显式零初值；公共工具还会拒绝参数名与 Avatar 内已有声明冲突。[工具约束](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaSensorUtility.cs#L17)、[Pose 校验](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaPoseBuilder.cs#L28)

### 传统 OGB / TPS Contact 生成功能

`SensaComponent` 可选择 Socket 或 Plug。Socket 名称路径为 `OGB/Orf/{类型}/{实例}`，类型有 Pussy、Ass、Mouth 和自定义字符串；Plug 路径为 `OGB/Pen/{实例}`。实例默认 Main，构建时要求非空且不能含 `/`；Inspector 可预览完整 `/avatar/parameters/...`、绘制场景辅助线并将当前 Transform 指定为深度轴。[配置字段](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Runtime/SensaComponent.cs#L89)、[路径及参数预览](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Runtime/SensaComponent.cs#L146)、[Inspector](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaComponentEditor.cs#L101)

| 能力 | 生成行为与输出 | 条件和限制 |
| --- | --- | --- |
| Socket 近接深度 | 沿 depthAxis 的 +Z，在 socketLength 内均匀放置 1–10 个近接环；默认长度 0.15 m、5 环，半径从入口 0.10 缩到最深 0.03；输出 TouchZones/Tip、Middle、Root 或 RingN | 缺少 depthAxis 时警告并跳过 Socket 主体；socketLength 必须为正且有限；环过滤标准 TPS_Pen_Penetrating，detectDps 已无作用 |
| Socket 主要深度 | 入口处额外创建半径 0.10 的 PenOthers；可选独立 PenSelf | PenOthers 只接收 Others；PenSelf 只接收 Self；开启 generateSelfParam 时深度环同时接收 Self/Others |
| Socket 方向原始量 | 可选右、左、上、下四个接收器，偏移 ±0.03、半径 0.06，输出 AngleRight_Raw、AngleLeft_Raw、AngleUp_Raw、AngleDown_Raw | 都是 Others 接收器；Unity 不生成 AngleX/AngleY 参数；桌面 OGB 预设把四路分别映射到两段区间，再按同角色融合规则择优，并非差值解算 |
| Plug 标准标签 | 在 tipBone/rootBone 的构建时位置生成半径 0.02 的 TPS_Pen_Penetrating / TPS_Pen_Root Sender | 缺任何一个骨骼时警告并跳过 Plug 主体；这些对象属于生成的 Sensa_Plug 子树，代码在构建时拷贝骨骼位姿 |
| Plug 近接与触碰 | 在尖端位置创建 PenOthers（Proximity，半径 0.10）及 TouchOthers（OnEnter，半径 0.04）；可选 PenSelf/TouchSelf | 检测 TPS_Orf_Root、TPS_Orf_Norm、SPSLL_Socket_Root、SPSLL_Socket_Front；Touch 是进入事件类型，不能直接理解为持续的 Constant 接触门控 |

上述具体生成依据：[Socket 生成](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L119)、[主要深度与方向](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L171)、[Plug 生成](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L227)、[Receiver 类型及可见性](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L375)。传统 Receiver 的 localOnly 为 false，但注册的表达参数 localOnly 为 true；不要把两种设置混为一谈。[Contact 属性](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L384)、[参数注册](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L453)

辅助信号列表支持以下来源，每项有 Vibrate、GateEnable、DepthOverride、AngleX、AngleY 的用途标签；Unity 负责产出参数，设备映射在桌面端完成。[辅助模型](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Runtime/SensaComponent.cs#L25)

- PhysBone：复用指定根部或当前对象上的 PhysBone，只注册所选的 `_Angle`、`_Stretch`、`_Squish` 或 `_IsGrabbed`。如果已有非空 PhysBone 参数前缀与计划前缀不同，则拒绝覆盖并提示使用 ExistingParameter。[生成辅助信号](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L311)、[保护已有参数](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L417)
- Contact：在当前对象处生成用户半径的近接 Receiver，同时允许 Self/Others，输出 `Sensa/{实例}/Aux{序号}/{用途}`；这里传入的 collisionTags 是空列表，源码没有附加专用身份标签。[Contact 分支](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L345)
- ExistingParameter：直接登记用户指定的非空参数名，不新增传感器。[ExistingParameter 分支](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L354)
- Raycast：在 SDK 3.10.3 及以上生成 VRCRaycast、Result Transform，输出 `_Hit` 和 `_Ratio`，范围钳制到 0.01–1000；较旧 SDK 选择该来源时明确报错。[Raycast 分支与版本保护](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L317)、[Raycast 创建](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaProcessor.cs#L427)

### Pose、单侧 Root、本地点与 PB 把手

| 模式 | Unity 生成内容 | 参数命名 | 用途边界 |
| --- | --- | --- | --- |
| 配对 Pose Socket | Root、Tip、Side 各 8 个 Proximity Receiver；每个 Self/Others 组共 24 个，均为 localOnly | `Sensa/Pose/v1/{实例}/{Self或Others}/{Root或Tip或Side}/A0..A7` | 需要对方配套三标记及相同 channel；同一阵列同时只应进入一个匹配 Plug |
| 配对 Pose Plug | 3 个半径 0.001 的球形 Sender，跟随 rootMarker、tipMarker、sideMarker，允许其他 Avatar 检测 | 标签为 `SensaPoseV1_{channel}_{marker}` | Root/Tip 定义直线轴，Side 定义扭转；不等同于 SPS Shader 变形后的真实网格 |
| 单侧标准 SPS Root | 每个 Self/Others 组只生成 Root 的 8 个 Receiver，筛选 TPS_Pen_Root | `Sensa/SpsRoot/v1/{实例}/{Self或Others}/Root/A0..A7` | 对方不需要 Sensa，channel 不筛选标准标签；只能得到根部位置诊断，不提供尖端、方向或行程 |
| 本地骨骼 / 点 | 四面体 4 Receiver + 独立的 1 个 0.001 Sender；PositionConstraint 让独立标记跟随 target | `Sensa/Point/v1/{实例}/Self/Root/A0..A3` | reference 和 target 必须属于当前 Avatar；跟踪本地骨骼/标记，测量参考坐标而非 GPU 形变 |
| 自动生成 PB 把手 | 在本地点方案上增加 HandleRoot→Joint→Grip 的 PhysBone，独立跟随对象测 Grip | `Sensa/Handle/v1/{实例}/Self/Root/A0..A3`，另有 `.../Handle_IsGrabbed`、`.../Handle_Stretch` | 把手长 0.02–0.18 本地米，允许抓取、不允许摆姿态、禁碰撞、无 Collider；PB 与位置约束不放在同一对象 |

来源：[协议常量](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Runtime/SensaPoseProtocol.cs#L6)、[Socket 生成](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaPoseBuilder.cs#L81)、[Plug 生成](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaPoseBuilder.cs#L115)、[本地点与把手生成](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaPointBuilder.cs#L26)、[用途提示](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaPoseEditor.cs#L13)。

Pose 接收阵列位于 ±0.06 的立方体角点，Receiver 半径 0.35；本地点使用其中索引 0、3、5、6，构成四面体。协议同时声明孔口半径 0.04、最大倾角 65°、拟合残差阈值 0.002。Inspector 将实用解算位置范围描述为约 24 本地厘米，并提示范围内仍可能饱和；这些是几何拟合的条件，不能把近接值无条件解释为准确空间测量。[常量](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Runtime/SensaPoseProtocol.cs#L9)、[场景范围提示](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaPoseEditor.cs#L19)、[本地点提示](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaAutoEditor.cs#L34)

Pose Plug 要求 Root/Tip 至少相距 2 cm，Side 离轴至少 5 mm，所有标记属于被构建 Avatar；Socket 至少选择接收 Self 或 Others。重复 Socket 实例名、无 profile、不合法 channel、重复烘焙都会失败。独立本地点也拒绝同一 Avatar 内复用 Sender 身份；它创建可写 FX 参数，保证不只是表达参数里有声明。[Pose 校验](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaPoseBuilder.cs#L15)、[点身份与 Animator](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaPointBuilder.cs#L34)

配套资产包括：DefaultPair（Pair01、仅 Others）、SelfTest（SensaCalibration、仅 Self）、Pose Socket、单侧 Root Probe、带 +Z 0.15 Tip / +X 0.03 Side 的 Pose Plug、LocalPoint、GrabHandle、AutoSetup。菜单可创建这些 Pose 对象和局部校准对，也可将副本烘焙为原生 VRC prefab；独立烘焙要求标记都在选中对象内部，外部骨骼引用要走完整 Avatar 构建。[默认 profile](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Profiles/DefaultPair.asset#L13)、[自测 profile](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Profiles/SelfTest.asset#L13)、[菜单与副本烘焙](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaPoseEditor.cs#L63)、[资产模板](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/generate-pose-assets.py#L81)

### 自动识别已有 SPS 与阵列策略

`SensaAutoSetup` 可发现 Avatar 下全部 VRCFury Haptic Socket/Plug，或只处理 selectedTargets 并扣除 excludedTargets；目标按层级路径与组件类型排序。生成实例名包含组名、前 6 个 ASCII 字母数字及层级/类型 SHA-256 的前 8 个十六进制字符。组名唯一且不超过 30 字符，同一个 SPS 目标不能同时归属两个自动组。[目标筛选与标识](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaAutoBuilder.cs#L13)、[组校验](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaAutoBuilder.cs#L29)

它通过反射调用已安装 VRCFury 的 Socket 几何 API 和 PlugSizeDetector，读取实际位置、旋转和 Plug 长度；找不到接口时拒绝猜测位置。可分别开启 Socket 标准 Root、配对 Socket、配对 Plug 标记、本地 Plug 参考尖端、Plug PB 把手；本地尖端要显式指定参考 Socket，只有恰好一个选中 Socket 时才可自动选定。参考尖端来自 Plug 构建几何长度，属于未形变参考点。[适配器](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaSpsAdapter.cs#L16)、[自动能力](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaAutoBuilder.cs#L51)、[参考限制](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaAutoEditor.cs#L19)

| 策略 | 生成与启用方式 | 开销 / 条件 |
| --- | --- | --- |
| Dedicated | 各目标保留独立测量对象，可同时启用 | Socket Root 每处 8；配对 Socket 每处 24；Plug 标记 3、本地尖端 5、PB 把手 5，可叠加 |
| Exclusive | Contact 数仍按每个目标生成，通过本地菜单每次只启用一个目标的全部 Sensa 辅助对象 | 默认 Off；只影响 Sensa 标记、Receiver、局部点和 PB，把原 SPS 对象保留启用 |
| SharedRootArray | 一组 8 个标准 Root Receiver 经 ParentConstraint 跟随所选 Socket，Plug 辅助能力仍随所选槽位切换 | 1–16 个标准 Root Socket，不允许配对 Socket，各 Socket 缩放必须等于 Avatar 根；被测 Socket/Plug 总数最多 16 |

来源：[开销计算](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaAutoBuilder.cs#L20)、[共享限制](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaAutoBuilder.cs#L38)、[对象生成与策略应用](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaAutoBuilder.cs#L68)。

Exclusive/Shared 使用 `Sensa/Select/{组}` 整数作为本地选择参数，0 为 Off，其他值对应菜单槽位；非法值切回 Off。切换时清零 Contact、PB 抓取和 Stretch 参数；Shared 会先禁接收、更新位置、等待 0.25 秒，再发布 Ready，另输出 `Sensa/SharedRoot/v1/{组}/Others/{Ready,Slot}`。内部已选槽位参数阻止重复进入同一状态不断重启等待。菜单超过一页时自动建立 More 子菜单。[选择 Animator](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaSelectionAnimator.cs#L19)

自动 PB 可见把手位于 SPS Plug 的渲染器发现子树之外，以免被 VRCFury 自动当成 SPS 形变网格；其 ParentConstraint 跟随 Plug 的参考框架。[把手隔离](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaAutoBuilder.cs#L79)

新加组件的 Reset 默认 Exclusive；当前提交的 AutoSetup prefab 也序列化为 Exclusive（arrayPolicy: 1）。但资源重建脚本的模板仍写 Dedicated（arrayPolicy: 0），所以重新运行生成器会改变该默认值，不能用生成脚本模板代替当前 prefab 的实际配置。[组件默认](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Runtime/SensaAutoSetup.cs#L25)、[当前 prefab](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Prefabs/SensaAutoSetup.prefab#L45)、[生成器模板](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/generate-pose-assets.py#L86)

Inspector 提供中英双语标签、当前对象快速选择、目标/几何/Contact 开销报告；显示标签不修改序列化字段、枚举值或 OSC 标识符。[自动 Inspector](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaAutoEditor.cs#L13)、[标签实现](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaInspectorLabels.cs#L7)

### QuickStart：世界到自己 Avatar 的链路测试

Avatar 根部添加 `SensaQuickStart` 后，在上传/预览时自动向右手骨骼生成 2 个本地 Receiver：Depth 为 Proximity，半径是 Avatar 视高的 15%；Active 为 Constant，半径为视高的 2%。它要求根部 Humanoid Animator、Avatar Descriptor、RightHand 映射、0.1–5 m 视高，添加 2 Contacts，生成可写 FX 参数 `Sensa/QuickStart/Depth` 与 `Sensa/QuickStart/Active`；不需要 SPS 或手工摆放。[生成流程](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaQuickStartBuilder.cs#L15)、[协议](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Runtime/SensaQuickStartProtocol.cs#L5)

World 的 START HERE 操作台可请求 0%、25%、50%、75%、100%，或 TOUCH 模式：前者把世界 Sender 放到按右手位置/Avatar 视高计算的距离，后者读取可拾取测试球与右手距离；Active Sender 跟随右手。选择一次开始 60 秒本地会话，STOP、离开 3 m、Avatar 更换、无效骨骼/视高或到期都会关闭 Sender；RESET 同时复原球与刚体速度。[运行逻辑](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Runtime/QuickStartStation.cs#L23)、[操作台生成](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/QuickStartLab.cs#L17)

操作台只显示期望值，不知道 Sensa 实际收到了什么；完整路径是世界 Contact Sender → 已上传 Avatar Receiver → VRChat OSC → 桌面应用。100% 指用户已配置映射范围的顶点；STOP 关闭输入门控并触发桌面端停止输出，不会执行硬件归位或断电。这是信号链路测试，不是 SPS 插入深度测量。[状态提示](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Runtime/QuickStartStation.cs#L62)、[Avatar Inspector](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaQuickStartBuilder.cs#L73)

### GPU 模型探针与离线几何分析

`Tools/Sensa/SPS GPU Model Probe (Experimental)` 是 EditorWindow，要求用户指定正在渲染的非 VR 相机、已烘焙 SPS Resolver 与表面材质；仅支持 Built-in、非立体相机、AsyncGPUReadback 和 ARGBFloat。它检查 Resolver Shader 名称、双方 SPS 身份属性及配置状态，并对已安装 VRCFury 的 13 个 SPS 源文件做规范化换行 SHA-256 检查，版本不匹配就停止。等待选定相机下一次渲染，10 秒超时；等待时身份改变、相机太小或进入立体模式也拒绝采集。[工具与输入检查](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaGpuProbe.cs#L86)、[依赖校验](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaGpuProbe.cs#L153)、[单帧采集](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaGpuProbe.cs#L202)

探针不打包或修改 VRCFury：通过可选 Shader 文本包含用户安装的 SPS 实现，从 Resolver 的 GPU 数据定位特定 Plug，导出 36×1 浮点纹理：头部、entryPosition、entryNormal、33 个未混合中心线采样点，采样 alpha 为 firstSegmentStrength。CPU 校验固定头、有限值、长度范围、单位法向和强度范围，生成 `sensa.sps-gpu-model.v1` JSON，并在 Scene 画中心线快照。[Shader 读出](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SpsGpuProbe.shader.txt#L23)、[解码](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaGpuProbe.cs#L246)、[快照展示](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaGpuProbe.cs#L70)

该数据是 SPS 未混合模型中心线，不是最终蒙皮/形变网格、实时完整行程或校准后的设备指令。连续 PNG 选项将 entryPosition 减去中心线首点的世界轴位移（每轴限制在 ±1 m）编码为 256×128 诊断图，临时文件原子替换；本身不发送 OSC。[实验范围提示](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaGpuProbe.cs#L136)、[PNG 输出](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor/SensaGpuProbe.cs#L262)

`scripts/analyze-gpu-capture.py` 可离线读最多 64 KiB 的有效 schema，要求恰好 33 点/强度，拒绝非有限值、退化线段、部分混合、切线/端点接触、平面内线段、多次交叉和非正向唯一穿越；成功时计算采样折线长、粗细采样弧长差、穿过入口平面后的材料比例/弧长比例、切向、入射角和入口偏移。可显式设孔口半径和最小入射角进一步拒绝结果；它不会发 OSC 或控制设备，粗细采样差也不表示未采样曲线误差的上界。[输入校验](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/analyze-gpu-capture.py#L29)、[几何拒绝条件](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/analyze-gpu-capture.py#L55)、[结果与 CLI](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/analyze-gpu-capture.py#L83)

### PNG / 屏幕区域到 OSC 的实验传输

`SensaLab/Telemetry` 用 16×8 黑白网格编码 16 字节：SN 魔数、协议 1、有效位、16 位序号、X/Y/Z 各 16 位 [-1,1] 量化、2 个保留字节、CRC-16（初始 0xffff、多项式 0x1021）。可用显式序号或合成时间序号，支持 CRC 故障注入及私有测试相机过滤。`TextureOutput` 仅在特定正交测试相机签名中绘制，默认过滤镜面/立体输出；这只是实验约定，不是通用 VRChat 相机身份 API。[编码 Shader](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Shaders/Telemetry.shader#L3)、[输出 Shader](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Shaders/TextureOutput.shader#L18)

`scripts/shader-osc-bridge.py` 接受 PNG（`--image`）或精确物理像素桌面区域（`--region`，至少 64×32）。解码可识别纵向翻转，要求每格中心 3×3 区域一致、SN/版本/有效位正确且 CRC 正确，拒绝混色、偏移或损坏画面。Windows 文件打开允许共享删除，避免阻塞 Unity 原子替换 PNG。[读帧](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/shader-osc-bridge.py#L15)、[网格解码](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/shader-osc-bridge.py#L48)

默认只解码；只有显式传 `--port` 才向 127.0.0.1 发 UDP OSC bundle，路径为 `Sensa/Lab/Shader/{Valid,Frame,X,Y,Z}`。监视/发送时需要连续两个前进序号才 valid；默认 350 ms 无前进会失效，拒绝倒序、同序号异坐标；错误后保留最后序号，旧帧不能重新开门，恢复需要两个新的前进帧。无效时只发送 Valid=0，结束时再次发送 Valid=0；默认监视时长 30 秒，支持 0.05–5 秒超时、最长 3600 秒时长，轮询约 30 Hz。[新鲜度](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/shader-osc-bridge.py#L73)、[OSC bundle](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/shader-osc-bridge.py#L116)、[CLI 循环](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/shader-osc-bridge.py#L127)

`smoke-shader-bridge.py` 提供真正桥接进程→隔离 Sensa 进程的重放验证：临时配置 outputs=[]、随机本地端口、回放 Unity 生成的两帧，检查 XYZ 和 Z→L0 映射（0.12/0.2=0.6）、冻结关门；可附损坏/恢复帧验证 CRC 失败、旧帧拒绝与两帧恢复。它是全进程 smoke，本项目工作流要求只在 GitHub Actions 执行，本次没有运行。[隔离配置与映射](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/smoke-shader-bridge.py#L45)、[故障恢复断言](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/smoke-shader-bridge.py#L78)

### Avatar 实验工具

安装器将第一方源码拷贝到既有 VRChat Avatars 工程，连同 Sensa 包和两个实验 Shader；通过 source-manifest 的 SHA-256 检查本地修改，冲突时拒绝覆盖。`--tests` 可把 Sensa 加入 manifest 的 testables。它不自带付费模型资源，不执行上传。[安装器](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/install-avatar-lab.py#L11)

| 实验入口 | 主要能力 | 依赖和范围 |
| --- | --- | --- |
| AvatarLab Create authoring scenes | 生成 Exclusive/Shared 两套 Avatar：手掌/前臂 Socket、SPS Lollipop Plug、自动 Root/Pose/本地尖端/把手、独立 PB 把手；清空 blueprintId；可添加 Gesture Manager | 要先导入源码指定路径的已授权 Chocolat 模型和 Lollipop 资源，要求 Humanoid、Descriptor；已有场景拒绝重建覆盖 |
| AvatarCapabilities | 生成 Contact、PB、PBContact、SPS、SPSContact、Shader、SPSShader 七种拆分场景 | Contact 四面体、仅 PB、组合把手、原生 SPS、SPS+点测量、合成传输、SPS GPU 模型分别检查，避免将其中一种信号当作另一种 |
| QuickStartAvatar | 为基础 Avatar 添加 QuickStart，检查 preprocess 与实际 .vrca 中的两个 Receiver、表达/Animator 参数及本地初值 | 仅验证构建产物；客户端 OSC 和硬件仍未验证 |
| FullFlowAvatar | 将 Exclusive、QuickStart、Shader 诊断组合成一个可测试 Avatar | 验证所有 Contact/PB 参数实际可写、2 个相机、选择/Shader 默认 Off、探针引导与菜单完整 |
| FullFlowInteraction | 对 Palm、Forearm、PB、Shader 提供 Home、Left hand、Right hand、Place in world；整合 Plug/测量/SPS OSC/CRC 菜单 | 以 VRCParentConstraint 贴手或 FreezeToWorld，冻结保留最后源权重；可视引导用 C1–C8 / P1–P4 区分阵列 |
| SDK Build | 调用 SDK builder.Build 生成本地 .vrca，复制到 Builds 并写 JSON 报告，QuickStart/FullFlow 再读实际 bundle 校验 | 源码未调用上传 API，不能把打包成功当作客户端集成验证 |

来源：[场景构建](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Editor/AvatarLab.cs#L80)、[能力矩阵](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Editor/AvatarCapabilities.cs#L23)、[QuickStart 校验](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Editor/QuickStartAvatar.cs#L30)、[FullFlow](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Editor/FullFlowAvatar.cs#L19)、[放置动作](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Editor/FullFlowInteraction.cs#L263)、[SDK 构建](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Editor/AvatarLab.cs#L259)。

FullFlow 将 TextMesh 标签烘焙成静态字体图集和双面网格，使用支持实例化/立体输出的 ProbeLabel Shader；预览/包校验要求没有残余 TextMesh、28 个探针引导对齐、4 组放置约束动作可执行。自动插入 Shader 实验使用合成 XYZ=(.25,-.5,.75)、两台非立体相机和默认关闭的本地选择器；它并不采集真实 SPS 数值。[标签烘焙](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Editor/FullFlowInteraction.cs#L159)、[引导与约束校验](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Editor/FullFlowAvatar.cs#L65)、[Shader 实验](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Editor/AvatarCapabilities.cs#L122)、[标签 Shader](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Shaders/ProbeLabel.shader#L1)

AvatarLab 还提供克隆上运行完整 SDK preprocess 的验证：Humanoid、缺失脚本、Contacts≤256、表达参数 cost≤256、Sensa Receiver/PB、选择器本地且默认 Off、SPS Resolver、Shader 无错误，以及把手可抓且不碰撞。批处理依赖热身等 VRCFury 临时包就绪，120 秒超时；特殊批处理兼容仅移除 Editor Toolbox 的可见工具栏回调。[构建检查](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Editor/AvatarLab.cs#L191)、[批处理热身](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Editor/AvatarLab.cs#L29)

### World 实验工具

World 安装器面向既有 VRChat Worlds 工程，把第一方源码、共享协议、GPU 探针复制到 Assets/SensaLab；不安装 SDK、不修改 Git remote，使用归属清单拒绝覆盖未知目录/本地修改。随附 sensa-preview.json 将 Web/OSC 绑定回环，关闭 OSCQuery，outputs/signals 均为空。[安装器](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/install-world-lab.py#L10)、[隔离预览配置](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/sensa-preview.json#L1)

生成工具提供两类世界，运行 Udon 组件均为本地无同步模式：

- 基础几何世界：8 角点标准 Root 实验、Pair01 三标记 Sender、SPS 20 cm Plug/Socket、Telemetry 显示、默认关闭的桌面输出、相机专用原型、Local PB/Contact 站。LabController 按时间移动目标并显示 SDK 近接值、CRC 和 GPU readback 帧延迟；点击暂停只停止运动时钟，序号仍会继续。相机专用 prefab 无 Udon 依赖，数据仍是合成图案；可导出 unitypackage。[基础生成](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/LabBuilder.cs#L88)、[相机原型](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/LabBuilder.cs#L52)、[运行逻辑](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Runtime/LabController.cs#L38)
- 功能世界：7 个能力站分别是 Contact、PB、PB+Contact、原生 SPS、SPS+PB+Contact、Shader 传输、SPS Shader 模型，另有 START HERE 和 MY AVATAR SPS 区。各站支持适用的 Rest/Near/Offset/Outside、Freeze、输出开关、CRC 故障；PB 禁碰撞而允许抓取。SPS 已知长度 0.2 m，Near 真值轴向/径向均为 0.4，横向偏移时轴向仍 0.4 而径向约 0.329，用于显式展示传统径向估计误差。[功能世界生成](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/FunctionalLab.cs#L24)、[站点运行](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Runtime/CapabilityStation.cs#L45)
- MY AVATAR SPS 区：可抓取的世界 Plug 和世界 Socket，可与自己的 Avatar 对应部件交互；提示先分离以学习长度、开启 SPS OSC 并在桌面应用确认真实 OGB 值。世界 Contacts 可能到达 Self/Others，两者的标签说明不能作为已收 OSC 的确认。[交互区](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/InteractiveLab.cs#L128)
- 放置和可视提示：夹具、世界 Plug/Socket 和 QuickStart 球可 LEFT/RIGHT 跟手、PLACE 停留、HOME 复位；手动抓取会取消自动跟手，Avatar 切换会复位。探针用颜色和 P/C 标号关联读数，P/C 表示输入采样点，不是 TCode 输出轴。[放置运行](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Runtime/LabPlacement.cs#L19)、[引导生成](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/InteractiveLab.cs#L35)
- 11 个几何案例：前方、后方、侧向、无接触、饱和、错误 Sender 半径、×2 均匀缩放、旋转框架、缺 P4、超出拟合体积、原点。白球可拾取，配重置/暂停/缺失注入、4 通道条和位置线；解码拒绝近接值≤0.00001或≥0.99999、残差>0.002、位置长度>0.245。预期有效性逐例固定，离开初始位置时显示探索状态。[案例定义](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/LabPointCases.cs#L33)、[交互及拟合](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Runtime/PointCaseStation.cs#L33)
- 可行走布局：默认步行/奔跑/侧移速度 2/4/2，跳跃冲量 3.5、重力 1；连续地面、边界、20/40 cm 跳台、0.85–1.15 m 可达按钮区，并用射线/胶囊检测站立点。NeutralFloor 只更新归属地面材质，保留场景布局。[运动](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Runtime/LabLocomotion.cs#L9)、[布局](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/LabPlayability.cs#L21)、[地面材质](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/NeutralFloor.cs#L9)

World 的 Transform、CalculateProximity、PB IsGrabbed/Stretch 和 GPU 回读均用于本地实验真值，Udon 不把这些自动导出成 Avatar OSC；真实 Avatar OSC 要经 Avatar 传感器或明确运行的外部 PNG 桥。Shader 传输站的固定 XYZ 是传输校准 fixture，非 SPS 测量。[站点提示](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Runtime/CapabilityStation.cs#L97)、[本地 PB 站](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Runtime/LocalProbeStation.cs#L19)

运行时编码材质通过禁用、无网格的 Renderer.material 创建每站独立实例，避免运行帧号、样本或 CRC 故障污染工程共享材质；验证器同时检查内存有效属性与源文件字节未改变，并检查实例非持久化且不共享。[实例承载](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/LabEncoderMaterials.cs#L11)、[材质验证](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/LabMaterialValidation.cs#L22)

### 已实现的 Unity 验证与验证边界

以下是仓库具备的验证入口，本次源码调研没有执行它们：

| 验证模块 | 检查内容 | 明确未覆盖的实际行为 |
| --- | --- | --- |
| SensaPoseTests | 标准 Root 8 Receiver、Pose Socket 24 本地 Float、Plug 三独立微型球形 Sender、非均匀缩放先失败 | VRChat 客户端输出、远端身份混合、实际硬件 |
| SensaAutoTests | 本地点四面体、不改原目标、可写 Contact/PB 参数、PB/约束对象分离、自动 SPS 几何、共享只用一组、默认 Off、16 目标状态跳转、NDMF 合并、本地 Tip 参考 Socket、把手不干扰 SPS、选择器同时控制所有辅助物、共享约束实际移动 | 真实 VR 抓取与 GPU 网格跟踪 |
| SensaGpuProbeTests | 缺目标/非法头无效，33 点合法快照成功，NaN 拒绝 | GPU 驱动与真实 Resolver 渲染 |
| LabValidation | Shader 编译、序号边界、量化/CRC、分辨率缩放、相机旋转、模拟镜面过滤、无 Udon 相机原型、SDK 接触公式、SPS 适配器版本和无目标拒绝 | HMD 隐藏性、VRChat 相机过滤、实际远端 Avatar Contact/OSC |
| FunctionalValidation / InteractiveValidation | Play Mode 中 7 站实际 Udon、已知 SPS 长度/近接/偏移、原生 SPS 烘焙、手跟随/放置/复位、探针配色、实际 GPU 模型、故障 PNG、材质隔离 | 真实 VR 手、客户端屏幕捕获时延、Avatar OSC |
| LabPlayValidation | 直线及偏移/倾斜场景，GPU 模型、11 案例及 Reset/Pause/Missing、ClientSim 实际走动跳跃、运行材质实例 | 物理设备、用户头显 |
| QuickStartValidation | 本地 ClientSim witness 检查五档深度、初始 Stop、Stop、Touch、过期 | 已上传 Avatar 的真实 OSC |
| Avatar bundle 检查 | SDK 构建后重读 .vrca，检查真实 runtime Animator、Receiver、参数、菜单、放置和引导 | 上传后客户端表现 |

来源：[Pose 测试](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Tests/Editor/SensaPoseTests.cs#L13)、[Auto 测试](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Tests/Editor/SensaAutoTests.cs#L30)、[GPU 测试](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Tests/Editor/SensaGpuProbeTests.cs#L9)、[Editor 验证](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/LabValidation.cs#L18)、[功能验证](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/FunctionalValidation.cs#L26)、[交互验证](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/InteractiveValidation.cs#L19)、[Play Mode 验证](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/LabPlayValidation.cs#L31)、[QuickStart 验证](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor/QuickStartValidation.cs#L25)。

`scripts/validate-labs.py` 封装 world-editor、world-functional、world-geometry、world-offset、avatar-tests、avatar-build 六组 Unity 命令；每次创建新的输出目录，要求进程返回 0 且所需 JSON/XML 报告为本次新生成的通过结果。XML 必须非空、全通过、无跳过；检查原 authoring scene 哈希未变，复制报告并生成 summary，默认每组 900 秒。该工具会启动真实 Unity 图形/Play Mode、生成截图，按本项目当前工作流不应在本机自动运行；本次只审阅。即使报告通过，summary 仍列客户端 Avatar OSC、VR 手交互、HMD 可见性和物理设备为未验证。[套件](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/validate-labs.py#L17)、[报告新鲜度](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/validate-labs.py#L35)、[实际启动与场景保护](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/validate-labs.py#L60)、[summary](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/validate-labs.py#L107)

### 资源生成与合成姿态 fixture

- `scripts/generate-pose-assets.py` 直接生成 profile/prefab YAML，并以仓库相对路径为 UUIDv5 输入生成稳定 .meta GUID；给尚无 .meta 的代码、文件夹、asset、prefab、asmdef 等补对应 importer。它是资产重建工具，会重写目标 profile/prefab，不是只读校验；目前 AutoSetup 默认策略模板与提交资产的区别见上文。[生成工具](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/generate-pose-assets.py#L8)、[profile/prefab 与 meta](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/generate-pose-assets.py#L63)
- `scripts/pose-demo.py` 是明确指定本地 UDP 端口的 Pose v1 fixture：基于 ±0.06 锚点、0.35 Receiver 半径和 0.001 Sender 半径合成三标记共 24 个近接值，OSC bundle 路径为 `Sensa/Pose/v1/Demo/Others/...`。默认运行 10 秒、约 30 Hz，以 20° 轴、18 cm 长度、横向偏置和正弦深度生成运动；`--static` 固定几何。它只发本地输入数据，不配置设备或自动启用输出，不能替代真实 Contact/OSC 集成试验。[样本公式与打包](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/pose-demo.py#L12)、[CLI 与姿态](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/pose-demo.py#L29)

## API 与状态协议索引

### HTTP 接口

以下是实现提供的接口，不是另一个独立的权限层；`/api` 请求统一受会话／显式凭据检查。JSON 枚举使用字符串。[HTTP 路由](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L1465)、[请求契约](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/ApiContracts.cs#L1)、[访问策略](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/LocalAccessPolicy.cs#L8)

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| GET | `/api/session` | 建立浏览器会话，返回 204 和 Cookie |
| GET / PUT | `/api/config` | 读取／受控应用完整配置 |
| GET | `/api/state/overview`、`/api/state/logs` | 当前总览、最近日志 |
| GET | `/api/meta/serial-ports` | 枚举串口；Windows 补充 WMI／注册表名称 |
| PUT | `/api/input/mode` | 应用 Manual／Osc／Script 输入模式 |
| PUT | `/api/input/active` | 显式启用或关闭当前输入 |
| PUT / DELETE | `/api/input/manual` | 设置十二轴手动目标与运动参数／清除 override |
| PUT | `/api/input/osc/source` | 选择 OSC 来源；有稳定 ID 时保存偏好 |
| POST | `/api/input/oscquery/refresh` | 刷新 Query 主机与参数树 |
| POST | `/api/input/script/load` | HTTP multipart 文件上传；读取 loop／speed |
| POST | `/api/input/script/play`、`pause`、`stop` | 播放、暂停、停止脚本 |
| PUT | `/api/input/script/configure`、`seek` | 倍速／循环段设置、定位 |
| POST | `/api/input/script/action-prev`、`action-next` | 跳到上一个／下一个关键帧 |
| DELETE | `/api/input/script` | 卸载脚本 |
| POST | `/api/recording/start`、`stop`、`export` | 录制控制；导出返回文件名与文本内容 |
| POST | `/api/control/runtime/emergency-stop`、`clear-emergency` | 锁存停止／解除锁存 |
| POST | `/api/control/output/{outputId}/connect`、`disconnect` | 指定输出连接控制 |
| POST | `/api/control/output/{outputId}/scan-start`、`scan-stop` | Intiface 扫描控制 |
| POST | `/api/control/output/{outputId}/device-info-refresh` | 刷新 TCode 固件／协议／轴信息 |
| WebSocket | `/api/ws` | 命令／响应及服务端状态推送 |

HTTP 还保留 `/api/control/loop/*` 的停止别名，以及 `/api/control/intiface/*`、`tcode/*`、`udp/*`、`tcp/*` 的主输出操作路由；它们选择相应类型的第一个配置输出。多输出操作应使用带 `outputId` 的接口。[HTTP 主输出与别名](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L1512)、[输出动作](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L1656)、[主输出选择](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L490)

### WebSocket 协议与总览

客户端请求形如：

```json
{"id":"request-1","method":"GET","path":"/api/state/overview"}
```

有请求体时增加 `body`；响应是 `{id, ok, data}`，失败通常通过 `ok:false` 和 `data.error` 描述；未知命令会返回错误。状态推送是 `{type:"state", data:总览, logs:[...]}`。WebSocket 的脚本加载使用 `body.fileName`／`body.content` 文本形式，其余运行时、配置、来源、录制、脚本和指定输出动作复用同一核心操作。不要假定所有历史 HTTP 别名都实现了同名 WS 命令。[WS 命令分派](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L1944)、[脚本加载契约](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/ApiContracts.cs#L26)、[状态信封](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L153)

| 总览字段 | 包含内容 |
| --- | --- |
| `runtime`／`loop` | 同一运行状态的两个字段：输入模式、启用、紧急停止、门控、几何阻塞、当前／手动命令 |
| `input.script` | 文件、播放状态、时长／进度、倍速、循环范围与 64 格动作密度分箱 |
| `osc.preview`／`sources` | 参数值、分类、时间、来源、稳定 ID 和选择状态 |
| `osc.query` | HOST_INFO、节点、LISTEN 连接和轮询状态 |
| `osc.queryReceiver` | 本地广播服务、路径、启动时间及最近接收活动 |
| `osc.rawPreview`／`trackingPreview` | 未作为 Avatar 标量消费的原始包与 tracking 摘要 |
| `osc.hub` | 有效来源、目标、待发送、发送／丢弃统计与原因 |
| `outputs` | 每输出连接状态、固件、设备、最近发送的目标 |
| `tcode`／`udpTCode`／`tcpTCode`／`intiface` | 主输出的镜像状态 |
| `poseTracking` | 成对姿态、活动目标、单点／根探针观测 |
| `recording`／`signals` | 录制帧数、每条映射及其最近匹配输入 |

依据：[总览构建](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/SensaHost.cs#L1148)。这些数据属于程序观测；`connected`、`sent` 或有效几何状态不构成硬件已到位的证明。

## 构建、验证和发布

### 构建与可分发程序

- Web 入口由 esbuild 打包、压缩为 `app.bundle.js`，CSS 独立提供；目标为 Chrome 110／Firefox 115／Safari 16 语法范围。该构建目标不是所有浏览器版本的实机兼容性验收。[Web 构建](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/build-web.mjs#L1)
- 主项目目标 `net10.0`，通过 MSBuild 在构建前生成 Web 资源，共享 Unity 的 Pose 协议源码，嵌入内置 OSC 预设；依赖锁文件参与恢复。项目基础版本为 0.4.0，本研究不修改它。[项目配置](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Sensa.csproj#L1)、[SDK 选择](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/global.json#L1)、[Web 包配置](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/package.json#L1)
- 原生构建矩阵包括 Windows／Linux／macOS 的 x64 与 ARM64。每个 runner 执行后端测试、自包含 publish、隔离进程 smoke 和归档；Windows x64 另做 GPU PNG 回放、损坏与恢复门控验证。Windows 使用 ZIP，Unix 使用保留执行权限的 tar.gz。[平台构建](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/build-platform.py#L1)、[矩阵](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/.github/workflows/build-platforms.yml#L1)
- 归档校验完整的语义版本 tag 与 manifest 一致性，预览标签只影响产物名；归档使用固定时间等规则保证相同输入的可复现性，并生成 SHA-256。桌面包包含两种语言的指南、图片、桥接脚本与构建信息。[归档实现](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/release.py#L45)
- Unity 静态检查校验所有资源的 `.meta`、GUID 唯一性、Prefab／Asset 引用和可选 VRCRaycast 宏一致性；成功只证明这些静态条件，不表示 Unity 编译通过。[Unity 包校验](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/release.py#L16)

### 自动化测试能力

| 层次 | 覆盖的功能 | 隔离与限制 |
| --- | --- | --- |
| Web 单元与静态检查 | 国际化键、参数匹配和排序、来源隔离、Point 校准、OSC 工作流提示、输出预览、标签 | `npm test`；无浏览器 |
| .NET 单元 | 映射、SPS 深度、Pose／Point、QuickStart、预设、OSC 生命周期、输出与 Intiface 特征 | 构造隔离配置；网络测试用 loopback 模拟端点 |
| Python 单元 | 安装器保护、实验报告新鲜度、GPU 解码、桥接门控、归档／索引、上传失败、双语文档 | 使用 fixture、临时目录与 mock |
| 浏览器 E2E | 手动控制到四类模拟输出、录制、停止、QuickStart、FT 过滤、PB 校准、SPS 学习、脚本、帮助、Pose 丢采样、Query／Hub、会话和双语草稿保持 | 真服务进程＋UDP／TCP／PTY／Buttplug／Query 模拟对端；仅 GitHub Actions |
| 进程 smoke | 会话／同源拒绝、WS 并发响应、FT 洪流、QuickStart 五个深度与 STOP、保存后关闭输入、Pose／Root 隔离和 PB 松手 | 临时配置与 `outputs:[]`，不配置真实设备 |
| Unity 测试与实验套件 | 作者构建、协议几何、原生组件、场景／GPU、SDK 构建检查 | 需要独立 Unity 工程与相应资源；公共 CI 没有执行完整 Unity 工程 |

依据：[Web 测试](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tests/web/osc-preview.test.mjs#L1)、[.NET 测试项目](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tests/Sensa.Tests/Sensa.Tests.csproj#L1)、[Python 测试](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tests/scripts/test_lab_validation.py#L1)、[E2E 场景](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tests/e2e/flows.spec.js#L1)、[双语 E2E](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tests/e2e/i18n.spec.js#L1)、[模拟对端](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tests/e2e/mocks.js#L1)、[进程 smoke](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/smoke.py#L47)、[Unity 验证器](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/validate-labs.py#L1)。

Playwright 在非 `GITHUB_ACTIONS=true` 时直接拒绝运行；桌面视口为 1280×900、窄屏为 390×844，单 worker、零重试，截图最大差异比例为 0.001，并保留失败 trace／视频／截图。窄屏项目是布局测试，不是实体手机验收。普通 CI 只比较基线；手动候选基线任务导出待审阅工件，不自动写回仓库。[Playwright 配置](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/playwright.config.js#L1)、[E2E 工作流](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/.github/workflows/e2e.yml#L1)、[分段截图工具](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tests/e2e/fixtures.js#L71)

### CI 门槛与发布状态机

1. PR／main 推送先做 npm 测试与安全审计、Python 测试、Unity 元数据检查和预览包。
2. 基础验证通过后运行 E2E 截图比较，再执行六平台原生构建。
3. 只有 main push 且所有依赖成功才自动预发布；先收集七个归档并核对本地校验，再建立 draft、逐个上传、核对远端附件状态／数量／大小／SHA-256 和目标提交，最后公开为 prerelease，且不标为 latest。上传单文件最多三次，失败保留未公开草稿。
4. 桌面 `v*` 与 Unity `unity-v*` tag 有独立正式发布工作流，也依赖 E2E。手动 Unity workflow 只验证与打包，不发布。
5. 只有成功稳定 Unity 发布才部署 VPM 索引。索引从已发布稳定 Release 构建，校验包身份和 SHA-256，验证历史 Pages 包来源与散列，拒绝空索引和冲突版本；预览包不进入稳定索引。

依据：[主 CI](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/.github/workflows/ci.yml#L1)、[完整预发布](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/publish-preview.py#L14)、[桌面发布](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/.github/workflows/release-app.yml#L1)、[Unity 发布](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/.github/workflows/release-unity.yml#L1)、[VPM 索引](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts/vpm-index.py#L1)。

VPM 静态页面提供双语添加 VCC／ALCOM 链接、手动 URL 和剪贴板复制、版本、许可与仓库入口。依赖更新配置按周检查 npm／NuGet／GitHub Actions，并把 React 和 React DOM 配套分组。[VPM 页面](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/.github/pages/index.html#L240)、[依赖更新配置](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/.github/dependabot.yml#L1)

## 实现范围与验证边界

- **已实现的控制能力**：单输入模式、多输出、轴配置与校准、参数／SPS／空间重建、脚本、录制、发现／转发、状态诊断、Unity 烘焙和实验工具；各模块的前置条件见上文源码引用。
- **测量边界**：输出卡片与模型图显示发送目标；单侧 SPS 根探针显示局部位置；只有满足成对几何、独立半径等条件的路径才会计算完整姿态或横向估计。坐标重建有效不等于真实设备已到位。[输出遥测](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/OutputTelemetry.cs#L1)、[姿态重建](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/PoseReconstruction.cs#L1)、[SPS 深度估计](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals/SpsDepthEstimator.cs#L1)
- **持久化边界**：保存配置会保留用户设置并在磁盘快照中清除输出启用状态；活动输入、停止锁存、手动覆盖、已载入脚本、录制帧和日志均属于进程状态。语言和部分预览偏好保存在浏览器存储中，不能替代后端配置。[配置保存](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration/AppConfig.cs#L334)、[运行时](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime/MotionRuntime.cs#L1)、[播放器](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L1)、[录制器](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Recording/MotionRecorder.cs#L1)、[国际化](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web/i18n.js#L1)
- **未实现／不能据源码承诺的能力**：没有设备物理位置反馈闭环、多用户角色、内置 TLS 或通用视频同步播放器；世界实验工具、NDMF 构建、GPU 捕获和 Intiface 引擎依赖各自外部环境。具体代码提供的检查和诊断不取代真实 VRChat 客户端、VR 抓取、头显可见性和硬件动作验收。[服务访问](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting/LocalAccessPolicy.cs#L1)、[脚本播放器](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script/FunscriptPlayer.cs#L1)、[Unity 包](https://github.com/SeaLoong/Sensa/blob/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/package.json#L1)
- **本次研究的验证方式**：阅读主仓库实现、配置与测试，并执行允许的本地静态／单元检查；浏览器 E2E、完整进程 smoke 与截图比较只交由 GitHub Actions。本次没有启动 Unity、VRChat 或真实硬件。具体执行结果记录在交付消息与关联提交的 CI 中。

## 代码覆盖索引

研究按实现职责逐文件梳理，而不是从 README 推断功能。下表列出纳入的 160 个代码／样式／Shader／工作流文件；根目录的项目配置、数据和资产另列其后。测试文件用于核对意图与边界，未将“存在测试”写成“本次已运行通过”。

| 实现目录 | 阅读文件 |
| --- | --- |
| [`.github/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/.github) | `dependabot.yml` |
| [`.github/pages/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/.github/pages) | `index.html` |
| [`.github/workflows/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/.github/workflows) | `build-platforms.yml`、`ci.yml`、`e2e.yml`、`release-app.yml`、`release-unity.yml` |
| [`scripts/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/scripts) | `analyze-gpu-capture.py`、`build-platform.py`、`build-web.mjs`、`generate-pose-assets.py`、`install-avatar-lab.py`、`install-world-lab.py`、`pose-demo.py`、`publish-preview.py`、`release.py`、`shader-osc-bridge.py`、`smoke-shader-bridge.py`、`smoke.py`、`validate-labs.py`、`vpm-index.py` |
| [`src/Configuration/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Configuration) | `AppConfig.cs` |
| [`src/Hosting/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Hosting) | `ApiContracts.cs`、`LocalAccessPolicy.cs`、`SensaHost.cs` |
| [`src/Input/Osc/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Osc) | `OscHubForwarder.cs`、`OscInputReceiver.cs`、`OscModels.cs`、`OscPacketEncoder.cs`、`OscPacketParser.cs`、`OscPacketPreviewStore.cs`、`OscParameterClassifier.cs`、`OscQueryClient.cs`、`OscQueryPollingService.cs`、`OscQueryReceiverService.cs` |
| [`src/Input/Script/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Input/Script) | `FunscriptPlayer.cs` |
| [`src/Motion/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Motion) | `MotionAxes.cs`、`MotionFrame.cs` |
| [`src/Outputs/Intiface/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/Intiface) | `IntifaceOutputClient.cs`、`IntifacePositionFeatures.cs` |
| [`src/Outputs/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs) | `OutputCoordinator.cs`、`OutputTelemetry.cs` |
| [`src/Outputs/TCode/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Outputs/TCode) | `TCodeAxisDebug.cs`、`TCodeDeviceInfo.cs`、`TCodeEncoder.cs`、`TCodeSerialOutput.cs`、`TCodeTcpOutput.cs`、`TCodeUdpOutput.cs` |
| [`src/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src) | `Program.cs` |
| [`src/Recording/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Recording) | `MotionRecorder.cs` |
| [`src/Runtime/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Runtime) | `MotionRuntime.cs`、`RuntimeInputMode.cs`、`RuntimeLogBuffer.cs` |
| [`src/Signals/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/Signals) | `ContinuousAngle.cs`、`PoseReconstruction.cs`、`SignalMapping.cs`、`SignalPipeline.cs`、`SpsDepthEstimator.cs`、`SpsPositionTracking.cs` |
| [`src/web/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/src/web) | `HelpDialog.jsx`、`OscFlowStatus.jsx`、`OutputPositionPanel.jsx`、`PosePanel.jsx`、`SpsRootPanel.jsx`、`app.js`、`i18n.js`、`index.html`、`osc-preview.js`、`osc-workflow.js`、`output-preview.js`、`styles.css` |
| [`tests/Sensa.Tests/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tests/Sensa.Tests) | `IntifaceFeatureTests.cs`、`OscReceiverTests.cs`、`OutputTests.cs`、`PointTests.cs`、`PoseTests.cs`、`PresetTests.cs`、`QuickStartTests.cs`、`SignalTests.cs`、`SpsPositionTests.cs` |
| [`tests/e2e/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tests/e2e) | `fixtures.js`、`flows.spec.js`、`i18n.spec.js`、`mocks.js`、`screenshot.css`、`serial-device.py` |
| [`tests/scripts/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tests/scripts) | `test_avatar_lab_installer.py`、`test_bilingual_docs.py`、`test_gpu_capture.py`、`test_lab_validation.py`、`test_preview_upload.py`、`test_release.py`、`test_shader_bridge.py`、`test_smoke_wait.py`、`test_world_lab_installer.py` |
| [`tests/web/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tests/web) | `i18n.test.mjs`、`osc-preview.test.mjs`、`osc-workflow.test.mjs`、`output-preview.test.mjs`、`probe-labels.test.mjs` |
| [`tools/unity-avatar-lab/Editor/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Editor) | `AvatarCapabilities.cs`、`AvatarLab.cs`、`FullFlowAvatar.cs`、`FullFlowInteraction.cs`、`QuickStartAvatar.cs` |
| [`tools/unity-avatar-lab/Shaders/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-avatar-lab/Shaders) | `ProbeLabel.shader` |
| [`tools/unity-world-lab/Editor/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Editor) | `FunctionalLab.cs`、`FunctionalValidation.cs`、`InteractiveLab.cs`、`InteractiveValidation.cs`、`LabBuilder.cs`、`LabEncoderMaterials.cs`、`LabMaterialValidation.cs`、`LabPlayValidation.cs`、`LabPlayability.cs`、`LabPointCases.cs`、`LabValidation.cs`、`NeutralFloor.cs`、`QuickStartLab.cs`、`QuickStartValidation.cs` |
| [`tools/unity-world-lab/Runtime/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Runtime) | `CapabilityButton.cs`、`CapabilityStation.cs`、`LabController.cs`、`LabLocomotion.cs`、`LabPlacement.cs`、`LabPlacementButton.cs`、`LabToggle.cs`、`LocalProbeStation.cs`、`PointCaseButton.cs`、`PointCaseStation.cs`、`QuickStartButton.cs`、`QuickStartStation.cs` |
| [`tools/unity-world-lab/Shaders/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/tools/unity-world-lab/Shaders) | `Telemetry.shader`、`TextureOutput.shader` |
| [`unity/top.sealoong.sensa/Editor/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Editor) | `SensaAutoBuilder.cs`、`SensaAutoEditor.cs`、`SensaComponentEditor.cs`、`SensaGpuProbe.cs`、`SensaInspectorLabels.cs`、`SensaPointBuilder.cs`、`SensaPoseBuilder.cs`、`SensaPoseEditor.cs`、`SensaProcessor.cs`、`SensaQuickStartBuilder.cs`、`SensaSelectionAnimator.cs`、`SensaSensorUtility.cs`、`SensaSpsAdapter.cs`、`SpsGpuProbe.shader.txt` |
| [`unity/top.sealoong.sensa/Runtime/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Runtime) | `SensaAutoSetup.cs`、`SensaComponent.cs`、`SensaPointProbe.cs`、`SensaPosePlug.cs`、`SensaPoseProfile.cs`、`SensaPoseProtocol.cs`、`SensaPoseSocket.cs`、`SensaQuickStart.cs`、`SensaQuickStartProtocol.cs` |
| [`unity/top.sealoong.sensa/Tests/Editor/`](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1/unity/top.sealoong.sensa/Tests/Editor) | `SensaAutoTests.cs`、`SensaGpuProbeTests.cs`、`SensaPoseTests.cs` |

另外核对了以下配置与声明性资源：

- 根目录 `package.json`、`global.json`、`Directory.Build.props`、`eslint.config.js`、`playwright.config.js`；.NET 主／测试项目与依赖声明，决定构建、检查和打包方式。
- `src/web/data/osc-presets.json`、`first-run-motion.json`、`i18n.en.json`、`i18n-diagnostics.json`：内置映射、首次使用轴配置及界面／诊断翻译。
- Unity `package.json`、三个 asmdef、六个 Prefab、两个 Profile Asset 和 GPU 依赖散列声明：依赖、可选能力宏、作者默认值、协议几何和版本锁定。
- 世界实验的 `sensa-preview.json`、.NET 几何 fixture、Shader PNG fixture 与已有截图基线：样例配置与验证输入。二进制图片没有当作业务实现；图像差异以 CI 比较结果为准。
- 依赖锁文件、Unity `.meta` 和自动构建产物没有独立功能条目。第三方 `node_modules`、SDK／插件实现及独立 Unity 测试工程不属于主仓库实现研究范围。

源码快照：[查看完整目录](https://github.com/SeaLoong/Sensa/tree/4d1be7205ba4b94f631529af55e4e23fcab61ec1)。未来实现变更后，应更新对应章节与引用；本说明不会因为发布了新的预览包而自动变更。
