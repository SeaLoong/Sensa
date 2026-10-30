# 架构与行为契约

**简体中文** | [English](architecture.en.md)

Sensa 在 WebSensa、Node.js 服务与 Electron 中共用一份 TypeScript 运行时和 React 工作台。各宿主提供可用的传输、设备访问与存储，共享应用统一处理命令、信号计算和输出协调。[使用指南](guide.md) · [术语](../GLOSSARY.md)

## 宿主与共享应用

| 运行方式 | 引擎与界面 |
| --- | --- |
| WebSensa | 引擎在页面内运行，挂载共用工作台，使用浏览器设备 API |
| Node.js CLI | 一个本地引擎持有监听、文件与设备连接，通过浏览器显示工作台 |
| Electron | 启动同一份打包 Node CLI 可执行文件，在内嵌窗口显示其工作台 |

Electron 等待 CLI 就绪消息并使用其中的实际 URL，渲染进程与普通浏览器一样通过 HTTP／WebSocket 调用共享应用。再次打开同一配置会复用既有服务；退出 Electron 时关闭由它启动的服务。Unity 作者与构建组件包继续使用 C#，沿用既有 OSC 契约。

```mermaid
flowchart LR
  Electron["Electron 外壳"] --> Node["Node CLI 服务"]
  Node --> Remote["远程 RuntimeClient"]
  Page["浏览器本地宿主"] --> Local["本地 RuntimeClient"]
  UI["共享 React Workbench"] --> Remote
  UI --> Local
  Remote --> App["ApplicationFacade"]
  Local --> App
  App --> Runtime["RuntimeEngine"]
  OSC["OSC / OSCQuery"] --> Store["OscParameterStore"]
  Store --> Runtime
  Inputs["设备协议输入"] --> Commands["ExternalControlStore"]
  Commands --> Runtime
  Sources["手动 / 脚本 / 定位 / 反馈"] --> Runtime
  Runtime --> Compute["计算信号与动作"]
  Compute --> Outputs["共享 OutputCoordinator"]
  Outputs --> Adapters["宿主输出适配器"]
  Adapters --> Destinations["设备 / 应用 / 录制"]
```

| 模块 | 拥有的规则 |
| --- | --- |
| [ApplicationFacade](https://github.com/SeaLoong/Sensa/blob/main/src/core/runtime/application.ts) | 共用命令分派；模式、脚本、录制与连接操作 |
| [Configuration](https://github.com/SeaLoong/Sensa/blob/main/src/core/runtime/configuration.ts) | 规范配置模型、默认值、校验与持久化活动状态复位 |
| [RuntimeEngine](https://github.com/SeaLoong/Sensa/blob/main/src/core/runtime/runtime.ts) | 实际模式、输入启用、门控、信号融合、时效、请求代次与停止 |
| [ComputedSignalEvaluator](https://github.com/SeaLoong/Sensa/blob/main/src/core/runtime/computed.ts)／[ComputedSignalResolver](https://github.com/SeaLoong/Sensa/blob/main/src/core/runtime/resolver.ts) | 有界依赖图、来源解析、同来源／坐标框检查与样本有效性 |
| [定位与几何](https://github.com/SeaLoong/Sensa/tree/main/src/core/runtime) | SPS、Contact、Shader 解码，坐标换算与跟随平面计算 |
| [RuntimeScriptPlayer](https://github.com/SeaLoong/Sensa/blob/main/src/core/runtime/script.ts)／[RuntimeMotionRecorder](https://github.com/SeaLoong/Sensa/blob/main/src/core/runtime/recording.ts) | 脚本时间线与 L0 动作录制 |
| [OutputCoordinator](https://github.com/SeaLoong/Sensa/blob/main/src/core/outputs/coordinator.ts)／[OutputLane](https://github.com/SeaLoong/Sensa/blob/main/src/core/outputs/lifecycle.ts) | 每绑定求值、输出连接归属、有序交付、取消与停止 |
| [录制与回放](https://github.com/SeaLoong/Sensa/blob/main/src/core/outputs/recording.ts) | 有效 funscript 片段、JSON Lines／CSV 编码与信号会话回放 |
| [ExternalControlStore](https://github.com/SeaLoong/Sensa/blob/main/src/core/protocols/external-control.ts) | 来源会话、原子多通道命令、类型与时长、租约和当前命令身份 |
| [OscParameterStore 与 OSC 编解码](https://github.com/SeaLoong/Sensa/blob/main/src/core/protocols/osc.ts) | 来源、值、接收／内容变化时间、序列、bundle 与 Avatar 生命周期 |
| [Node 宿主](https://github.com/SeaLoong/Sensa/tree/main/src/node/host) | 管理会话、可回滚的串行配置更新、原子文件与进程归属 |
| [Node 输入](https://github.com/SeaLoong/Sensa/tree/main/src/node/inputs)／[Node 输出](https://github.com/SeaLoong/Sensa/tree/main/src/node/outputs) | 网络／原生监听、设备 API、发现与文件系统适配器 |
| [浏览器宿主](https://github.com/SeaLoong/Sensa/blob/main/src/websensa/browser-runtime.ts) | 页面生命周期、本地配置，以及供同一应用与输出协调器使用的浏览器适配器 |

核心不依赖浏览器或 Node 传输，时钟、交付回调、文件与设备工厂由宿主注入。配置读取兼容既有 PascalCase 字段，保存统一写入 camelCase 模型；新进程启动时复位临时输入与输出活动状态。

UDP 与 OSCQuery 共用 Avatar 变化清理入口。转发保留未消费 OSC bundle 的结构、顺序与 timetag，输入按消息逐项解释。[共享核心决策](adr/0011-shared-core-and-capability-adapters.md)

## 许可与停止不变量

| 事件 | 必须保持的行为 |
| --- | --- |
| 浏览导航／输入页签 | 切换查看内容，保留实际模式和许可 |
| 模式改变、脚本替换、配置保存 | 先关闭输入并停止，旧待发请求失效 |
| 急停／解除 | 锁存停止；解除后等待手动启用输入 |
| 脚本自然结束 | 保留末值与输入启用，组合模式中的其他来源继续运行 |
| 暂停、停止、卸载脚本 | 停止对应脚本活动；已许可的显式 seek／step 仍可发送 |
| 门控／空间失效 | 停止相应动作或绑定，并使旧目标失效 |
| 启动 | 以输入关闭、输出禁用、脚本未加载和运动停止的状态启动 |

连接与输入启用分别管理；已启用输入可向新连接发送当前有效目标。L0 录制位于动作分发前；录制输出默认将绑定换算后的 0～1 数值保存为 funscript 轨道，每个有效片段独立计时和存档。高级 JSON Lines／CSV 保留同一时间线上的原始值、换算值和有效性。命令遥测、录制与设备回报分别呈现各自含义。

## 信号与空间有效性

普通标量先匹配路径与来源，再做校准、反向、曲线、角色融合和门控。OgbDepth／OgbTouch 按外部协议定义解释对应参数。空间输入另有默认关闭的实验许可。

计算信号在校准前生成可复用的原始数值，输入可以是 OSC 参数、已通过模型检查的定位指标、手动／脚本读数、设备反馈、常量或另一计算。时间处理属于当前求值器实例，使用注入时钟。配置校验限制图规模与引用深度，并拒绝缺失引用和循环；运行时按依赖顺序复用结果，同次求值共用叶子输入。每个结果保留参与输入的来源、坐标框和最旧样本时间，必需输入失效会沿引用链传播到依赖它的绑定，现有轴映射保留动作运行时的门控。关闭输入、重新配置和来源变化会复位相应时序状态。工作台在远程与浏览器本地宿主中都使用同一求值器结果展示已保存状态。[运算与配置](computed-signals.md)

| 输入族 | 坐标／新鲜度规则 |
| --- | --- |
| 旧 Point／Handle／Pose | ReferenceLocal；最旧参与通道，Handle 包括抓取状态；默认 1000 ms 或正值超时 |
| Contact 直接定位（SDK Beta） | AvatarRootMeters；一个专用 Self Sender／Receiver，十二字段完整、Proximity 为正且 Radius 受支持；Sample 变化寿命最多 1000 ms |
| SPS 四点定位 | AvatarRootLocal；P0–P3 已知几何、非饱和与残差检查；静止 P 可缓存，Sample 内容变化默认 1000 ms、上限 1250 ms |
| 原生 Shader | AvatarRootLocal；检查完整测量包、来源、帧推进与有效状态；字段、编码与恢复规则见[定位协议](positioning.md) |

专用根标记与唯一通道将每个根点测量对应到期望的自身目标。四点距离按制作尺度的 AvatarRootLocal 解算单点位置；Contact 使用物理米制 AvatarRootMeters，报告中点位置与接触点相对速度。Contact 位置和速度指标共用 SensaPoint 校准、启用与失效停止。原生报告提供 Contact 属性值，Sensa Sample 补充生产端活动检查；时钟、序号与稳定 Sender ID 超出该原生报告的字段范围。[SDK 契约与依据](contact-sdk.md)。公开协议、公式和停止条件集中于[定位说明](positioning.md)与[参数字典](osc-parameters.md)。

输出绑定选择来源、换算、数值类型、量程、停止值与发送方式。协议适配器编码 OSC 数值、JSON 消息、DG-LAB 任务或记录；传输负责连接生命周期、有界交付、取消与关闭。状态发送保留最新目标，事件通过有界队列按序交付；设备反馈通过来源解析重新进入计算。[输入、计算与输出决策](adr/0008-signal-pipeline-and-shared-session.md) · [用户配置](signal-pipeline.md)

## 外部协议输入与设备 API

Buttplug v2/v3/v4、TCode、JSON 与厂商兼容入口将控制解释为带通道、目标、时长和方向的外部命令。直接动作路径按通道保留独立时长，停止是有序屏障；协议样本也可作为计算／绑定来源。首次位置轨迹起点未知时，当前值保持无效而目标可读；位置插值表示命令状态，不代表设备回读。原有设备反馈仍是独立来源，协议输入不伪装成 OSC 或硬件反馈。

协议监听与管理 API 分离。共享 HTTP 监听通过不同 `path` 前缀提供 Buttplug、JSON、厂商 API 与 TCode WebSocket。最长完整路径匹配先选择来源，再交给该来源的会话、通道与时序处理；原始 TCP 与 UDP 保留各自监听。

## 跟随平面与空间计算

空间计算以测量点 `P`、参考原点 `O` 和平面朝向为输入。沿法线的有符号深度与平面内偏移分别描述前后和横向运动；两点距离与方向夹角可单独用于输出绑定。自己 Avatar 内的测量点和参考对象都可移动或旋转；参考原点与朝向来自实时定位时，计算随当前读数更新。结果保留输入的位置单位，角度使用度，最后由输出绑定设置需要的范围和方向。跨 Avatar 互动使用[配对三点姿态](positioning.md#跨-avatar-互动配对三点姿态)的专用深度、偏移和角度指标。

`SensaTrackingFrame` 将目标的平移和旋转变成三个同坐标系测量点：原点、前向和右向。前向点减原点得到虚拟平面的正法线。Shader 直接测得根点和 X/Z 两条轴向；单轴可以定义与其垂直的工作平面，两条独立切向轴可以定义实际采样平面。后者使用叉积，适合需要保留非均匀缩放影响的场景。两种方式的几何含义见[参考平面决策](adr/0009-following-reference-planes.md)。

空间运算核对各组三分量的坐标框、位置单位与方向用途，保留同一 OSC 来源和最旧样本时间。零法线、共线平面轴或无效输入会使依赖该结果的绑定停止。AvatarRootLocal 与 AvatarRootMeters 可用同一来源的 AvatarScale 换算位置单位；不同局部参照的坐标不直接混用。[配置例子](computed-signals.md)

## Unity 作者与定位生成

Unity 作者组件保存配置并实现 SDK `IEditorOnly`。`SensaPlugin` 在 NDMF Generating 中、MA 同阶段处理之前统一读取配置，生成 Contact、约束及临时 Animator／参数／菜单，再由 MA 合并。每次构建的完成状态保存在 `BuildContext.GetState`；源场景与作者预制件保持可编辑。

SPS 四点定位、Contact 直接定位与 Shader 捕获共用该入口，分别输出既有协议。三个根点预制件都可明确选择 Avatar 内的 Transform、SPS、Sensa Component 或原生 Contact。根点参照先读取，再移除可能被其引用的 Sensa 作者组件；上传结果保留原生测量组件与参照 Transform。

只读 SDK 检查点在已核验的 Fury 加工之后、SDK 默认作者清理之前诊断残留设置；NDMF Optimizing 中另检查作者清理和此时 Contact 数量。具体阶段、组件与 GameObject 的 EditorOnly 区别，以及官方版本依据见[Unity 构建指南](unity-build.md)。

## 浏览器模块

React 使用原生控件、对话框与语义标签，本地样式呈现 TDesign 风格。顶栏承载实际状态／许可，正文独立滚动；UI 草稿与已保存配置分开。

| 文件 | 职责 |
| --- | --- |
| [RuntimeClient](https://github.com/SeaLoong/Sensa/blob/main/src/web/runtime-client.ts)／[bootstrap.tsx](https://github.com/SeaLoong/Sensa/blob/main/src/web/bootstrap.tsx) | 挂载同一工作台，连接远程服务或浏览器本地应用 |
| [configuration.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/configuration.js) | 草稿归一化、输出引用、冲突与保存 |
| [input-workflows.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/input-workflows.js) | 手动／脚本意图与时码 |
| [realtime-session.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/realtime-session.js) | 同源会话、关联、超时、断线拒绝与重连；重连后等待新的控制请求 |
| [shared-realtime.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/shared-realtime.js) | 页面引用计数客户端、共享会话消息代理与标签页请求隔离 |
| [elected-realtime.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/elected-realtime.js) | Web Locks 独占连接归属，BroadcastChannel 传递跨标签页消息 |
| [osc-workspace.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/osc-workspace.js)／[osc-preview.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/osc-preview.js) | 预设草稿、匹配、过滤、预览与校准 |
| [i18n.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/i18n.js) | 会话偏好／浏览器语言，文档路由与呈现文本 |
| [diagnostics.js](https://github.com/SeaLoong/Sensa/blob/main/src/web/diagnostics.js) | 日志与状态筛选 |

每页通过一个会话复用状态与命令。同源标签页优先通过 SharedWorker 共用一条后端 WebSocket；其不可用时，通过 Web Locks 确保一个标签页拥有连接，再用 BroadcastChannel 传递消息；两种共享方式均不可用时采用每标签页单例。请求分别关联，各页保留本地草稿。页面进入缓存时分离当前客户端，恢复时重新附着。HTTP 连接池与服务器 WebSocket 会话预算分别限制，共用连接减少了受支持标签页占用的后端会话数。

独立参数图解通过经典本地脚本、纯模型与打包 Three.js 在浏览器内展示参数，查看时可独立于应用会话和设备运行。Pages 静态发布 Markdown 与同一套图解资源，运动运行时由 Sensa 服务承载。

## 浏览器原生 WebSensa

`src/websensa/app.tsx` 与服务界面挂载同一个 `src/web/app.js` 工作台。`createBrowserWorkbench` 在页面内创建 `RuntimeEngine`、`ApplicationFacade` 与共享 `OutputCoordinator`，由 `RuntimeClient` 将本地请求与快照适配为远程工作台使用的接口。手动输入、funscript、计算信号、录制／回放与已连接的参数图解因此使用同一套应用行为。

浏览器适配器提供 WebSocket、fetch、Web Serial、Web Bluetooth、Web MIDI 与录制文件下载，宿主能力清单决定可选项目。明确选择设备时触发权限请求。配置保存在浏览器本地存储，完成的录制归当前页面持有。[WebSensa 指南](websensa.md)

## 桌面启动与实例归属

Node CLI 持有引擎，提供随包工作台、参数图解与 WebSensa 资源。发布的单文件程序内含 Node 运行时、应用与资源。Electron 将同一 CLI 打包为服务子进程，通过就绪／停止 IPC 协调生命周期；应用命令仍使用共享 HTTP／WebSocket 入口。

一个配置由一个进程持有。再次启动时联系持有进程并复用其工作台，页面存活状态决定是否打开新页。命名实例分别保存独立配置。启动时绑定配置端口或可用端口，并报告实际地址；共用入口的协议来源一起调整。手动保存配置保留冲突校验。

配置归属与实例协调独立于跨标签页实时共享，后台服务可以关闭自动打开浏览器。[启动选项](quick-start.md#运行多个实例)

## 兼容输入的脚本下载

兼容输入下载器对 URL、响应大小和任务时长设置边界。连接时重新校验公网地址，固定已检查 IP 并核对远端；重定向和入站凭据不会被转发。系统代理隐藏最终目标时，URL 路径无法完成此校验，可使用 multipart 文件上传。真实设备输出则将脚本 URL 交给设备／厂商下载，由对应 API 使用自己的获取策略。

## 验证边界

宿主注入时钟与传输工厂，隔离测试使用虚拟时间、进程内回环端口与模拟设备，核对协议字节、会话归属、停止屏障和生命周期清理。安装器在写入前预检受管源码，保留用户改动；完整进程清理由公共冒烟工具负责。

CI 将单元测试、完整 E2E 和隔离原生冒烟作为构建与发布条件，浏览器与进程检查使用模拟传输。EditMode、元数据和浏览器模拟分别验证作者处理、资产结构与界面行为；真实上传、客户端和硬件行为须在对应环境中验收。World PlayMode 和真实客户端检查另行安排，流程见[开发与发布](development.md)。
