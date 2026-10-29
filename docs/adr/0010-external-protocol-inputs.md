# Typed external protocol input and explicit device emulation / 有类型的外部协议输入与明确设备模拟

## Decision / 决策

Sensa 接收其他应用的设备控制，作为独立的**协议输入**。Buttplug、TCode、HTTP／WebSocket 与厂商兼容入口只负责消息与传输；`ExternalControlStore` 拥有每来源的单控制会话、原子批次、命令轨迹、心跳租约、时效与代次。运行时通过同一输入许可、动作串行门与停止边界交付结果。与 [ADR 0001](0001-control-and-input-activation.md) 和 [ADR 0008](0008-signal-pipeline-and-shared-session.md) 一致，配置、模式与急停变化使旧工作失效，解除急停不恢复输入。

Sensa accepts other applications' device commands as a distinct **protocol input**. Buttplug, TCode, HTTP/WebSocket and vendor-compatible adapters own message/transport framing. `ExternalControlStore` owns each source's single controller, atomic batches, commanded trajectories, heartbeat lease, validity and generations. Runtime delivery retains the shared activation, serialization and stopping boundaries. As in [ADR 0001](0001-control-and-input-activation.md) and [ADR 0008](0008-signal-pipeline-and-shared-session.md), configuration, mode and emergency changes invalidate old work; clearing emergency stop does not restore input activation.

## Semantics / 语义

外部命令保留通道、类型、目标值、到达时长，以及旋转速度的方向。位置、强度和旋转速度不可互换。直接动作路径保留多轴独立时长和显式轴集合，继续执行所选输出的轴配置；计算路径提供带来源和时效的样本及目标／方向指标。标量绑定按自身节奏发送，不假装保存所有轨迹元数据。首段位置的起点未知时，不合成一个物理起点，也不把命令插值称作硬件回读。

External commands retain channel/type, target, arrival duration and rotation direction. Position, intensity and rotation speed are different meanings. Direct motion routing preserves independent axis durations and explicit active axes, retaining the output's axis profile. Computation exposes samples with source/age plus target/direction metrics. Scalar bindings use their own schedules and do not imply preservation of all trajectory metadata. An unknown initial position is not replaced with an invented physical origin, and command interpolation is not hardware feedback.

同一来源的变更与事件按序处理，待发状态按通道合并；停止是不可被后续通道更新跳过的屏障。租约过期、断线、非法 TCode 和停机清理旧工作。当前动作适配器的强停是全设备范围，因此协议来源／特征停止保守升级为动作停止，不能宣称某轴独立强停已实现。

Source mutations/events are ordered and pending state is coalesced per channel. Stop is a barrier that later channel updates cannot bypass. Lease expiry, disconnection, invalid TCode and deactivation clear stale work. Current motion adapters stop whole devices, so protocol source/feature stopping conservatively stops motion outputs; it does not establish independent per-axis emergency stopping.

## Boundaries / 边界

协议监听与管理 API 分离。兼容 Web 协议通过同一地址／端口的不同 Path 共用物理监听，各来源分别拥有通道、会话和时长；原始 TCP 与 UDP 保留独立传输监听。虚拟 Buttplug 设备只声明实现能力并协商消息 v2/v3/v4；输出客户端包版本与 wire 版本分别解释。WSDM 是连接 Central 设备管理端的另一路径；文本注册后二进制硬件帧与应用端 Buttplug JSON 不混用。TCode v0.4 尚未实现的曲线明确拒绝，D1 只宣告 v0.3。

Protocol listeners are separate from management APIs. Compatible web protocols share a physical address/port through distinct Path mounts, while each source owns its channels, session and timing. Raw TCP and UDP retain separate transport listeners. Virtual Buttplug devices advertise implemented capabilities and negotiate message v2/v3/v4; output-library version and wire version remain separate. WSDM connects to Central's device manager, using text registration followed by binary hardware frames; it is distinct from application-side Buttplug JSON. Unsupported TCode v0.4 curves are rejected and D1 advertises v0.3.

厂商云输出使用明确的设备地址与凭据；厂商兼容输入仅适用于可配置 endpoint 的上游。BLE 外围设备模拟与 central 输出放在可选桥工具，显式选择设备与依赖。虚拟串口不等于浏览器一定能枚举，BLE 断开不等于设备急停。验证报告区分编解码／隔离传输、Actions 浏览器与进程、真实应用和实体硬件。

Vendor cloud outputs use explicit endpoints/credentials; compatible local inputs require an upstream-selectable endpoint. Optional bridge tools own BLE peripheral emulation and central output, with explicit device/dependency selection. A virtual serial endpoint is not guaranteed browser enumeration; BLE disconnection is not hardware emergency stop. Evidence distinguishes codec/isolated transport checks, Actions browser/process checks and real application/hardware acceptance.

[操作与接口 / Operation and interfaces](../protocol-inputs.md) · [English](../protocol-inputs.en.md)
