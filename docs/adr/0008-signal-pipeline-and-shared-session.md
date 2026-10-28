# Input, computation and output bindings / 输入、计算与输出绑定

## Decision / 决定

Sensa 的通用数据流由输入、计算与输出三部分组成。输入提供带有效性、来源和时间的样本；计算保留可复用的具名结果；输出绑定将结果转换为某个设备、应用参数、脚本轨道或诊断记录需要的类型、范围和更新节奏。TCode／Intiface 的动作目标沿用现有轴处理；OSC、DG-LAB、JSON、MQTT、MIDI CC 和录制使用各自的目标能力。

Sensa's general data flow comprises input, computation and output. Inputs provide samples with validity, provenance and time; computation produces reusable named results; output bindings convert them into the type, range and schedule expected by a device, application parameter, script track or diagnostic record. TCode/Intiface motion targets retain axis processing; OSC, DG-LAB, JSON, MQTT, MIDI CC and recording expose their destination capabilities.

协议说明消息的含义和格式，传输负责连接、发送、取消与关闭。例如 OSC 消息通过 UDP 发送，JSON 可以通过 HTTP 或 WebSocket 发送，DG-LAB V4 在 WebSocket 上管理配对与任务。连接归后端管理，浏览器保存配置并观察状态。

A protocol defines a message's meaning and encoding; transport owns connection, sending, cancellation and closure. OSC messages can travel over UDP, JSON over HTTP or WebSocket, and DG-LAB V4 manages pairing and tasks over WebSocket. The backend owns these connections; the browser edits configuration and observes state.

录制默认导出广泛支持的 funscript 时间—位置轨道，绑定换算结果限制到 0～1，再写为整数毫秒与 0～100 位置。每条绑定的连续有效片段独立发布为完整文件，失效结束片段；后续片段从 0 ms 计时，列表保留原录制起点偏移。单文件回放提供线性插值的 `value` 信号。高级 JSON Lines／CSV 则保留原始值与无效区间，用于诊断和原始信号回放。[格式约定与文件命名](../signal-pipeline.md#录制与观察)

Recording defaults to widely supported funscript time-position tracks. Converted binding values are clamped to 0–1 and written as integer milliseconds and positions from 0 to 100. Each continuous valid segment is published as a complete file; invalidity closes it. Later segments start at 0 ms while the file list retains their original start offsets. Single-file replay provides a linearly interpolated `value` signal. Advanced JSON Lines/CSV retain raw readings and invalid intervals for diagnostics and raw-signal replay. [Format conventions and filenames](../signal-pipeline.en.md#record-and-inspect)

## Activation and validity / 启用与有效性

Manual、Osc、Script 与 [ADR 0010](0010-external-protocol-inputs.md) 增加的 Protocol 保留快捷输入方式，Combined 允许不同来源共同参与绑定。计算中 Manual／Script／DeviceFeedback／Protocol 保留独立的来源标识，OSC 来源和空间坐标框继续接受既有兼容性检查。关闭输入、保存配置、换源与急停清理待发工作和时间计算状态；解除急停后需要单独启用。

Manual, Osc, Script and Protocol from [ADR 0010](0010-external-protocol-inputs.md) remain quick input modes; Combined allows several source kinds to contribute to bindings. Manual/Script/DeviceFeedback/Protocol retain their own origin identities, while OSC source and spatial-frame compatibility checks remain. Disabling input, saving, changing sources or emergency stopping clears pending work and temporal state; clearing emergency stop requires separate activation.

有效性按绑定传播，某个必需输入失效时结束相应绑定的有效交付，清理旧目标并采用配置的 `StopValue`。位置轴的停止值是备用目标，可能运动；全局关闭输入与急停使用整机停止路径，急停继续覆盖全部输出。原有动作轴模式的门控和停止语义继续由动作运行时管理。此处细化 [ADR 0001](0001-control-and-input-activation.md) 的来源生命周期，以及 [ADR 0007](0007-computed-signals.md) 中计算结果影响的范围。

Validity propagates per binding. An invalid required input ends its affected binding's valid delivery, clears its old target and applies the configured `StopValue`. A position-axis stop value is a fallback target and may move; global input disable and emergency stop use the whole-device stop path, with emergency stop continuing to cover every output. The motion runtime retains gating and stop semantics for existing axis modes. This refines source lifecycle in [ADR 0001](0001-control-and-input-activation.md) and the affected-result scope in [ADR 0007](0007-computed-signals.md).

## Browser session ownership / 浏览器会话归属

同一页面中的调用共用引用计数会话。同源标签页优先通过 SharedWorker 共用一条后端 WebSocket，线程统一管理鉴权、连接代次与重连；其不可用时，由 Web Locks 确定唯一连接持有页，通过 BroadcastChannel 传递消息。标签页分别关联自己的请求和响应。状态可以广播，断线与换届结束待处理请求，控制请求至多交付一次。

Calls within one page share a reference-counted session. Same-origin tabs first share one backend WebSocket through SharedWorker, which owns authentication, connection generations and reconnection. If unavailable, Web Locks grants one tab exclusive connection ownership and BroadcastChannel carries messages. Each tab correlates its own requests and responses. State may be broadcast; disconnection or ownership changes end pending requests, and control requests are delivered at most once.

页面缓存生命周期释放／恢复订阅，关闭一页后其余页面继续使用连接或由下一持有页接续。两种跨页共享方式均不可用时回退每标签页单例。HTTP 连接预算、浏览器 WebSocket 行为与服务器会话预算分别处理，文档明确当前共享范围。

Page-cache lifecycle releases/restores subscriptions. When one page closes, the remaining pages continue using the connection or a new owner takes over. If neither cross-tab method is available, a per-tab singleton is used. HTTP connection budgets, browser WebSocket behavior and server session budgets are handled separately, with the current sharing scope documented.

## Verification / 验证

适配器使用隔离传输与时钟检查编码、超时、清理、停止和恢复；计算检查依赖、时序重置、单位与有效性传播。Actions 浏览器用例检查跨标签页请求隔离、连接数量、持有页接续和全部页面关闭后的重新连接。页面缓存挂起与恢复由隔离的生命周期单元测试检查。实际运行结果在[验证记录](../e2e-status.md)中按提交记录；DG-LAB APP、VRChat 和硬件按所选版本另行检查。

Adapters use isolated transports and clocks to verify encoding, timeouts, cleanup, stopping and recovery. Computation checks dependencies, temporal reset, units and validity propagation. Actions browser cases check cross-tab request isolation, connection counts, ownership handoff and reconnection after all pages close. Isolated lifecycle unit tests check page-cache suspension and restoration. [Verification records](../e2e-status.en.md) identify actual results by commit; DG-LAB APP, VRChat and hardware receive checks for the selected versions.
