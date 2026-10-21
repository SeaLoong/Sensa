# Sensa terminology / Sensa 术语

Sensa translates virtual interactions or motion trajectories into device targets. / Sensa 将虚拟交互或动作轨迹转换为设备目标。Use these terms consistently in code, UI and documentation. / 代码、界面与文档沿用以下含义。

| Term / 术语 | Definition / 定义 |
| --- | --- |
| **Motion target / 动作目标** | Desired normalized position or intensity sent toward an output, not physical sensor feedback. / 准备发送的归一化位置或强度，不是设备回读。 |
| **Input mode / 输入模式** | The actual Manual, Osc or Script category, one at a time; browsing a tab does not apply it. / 实际手动、OSC 或脚本类别，同一时刻一种；浏览页签不应用模式。 |
| **Input activation / 输入启用** | Explicit permission for the actual input to drive outputs. Configuration, mode or script changes disarm it. / 当前输入驱动输出的明确许可；配置、模式或脚本变更会关闭。 |
| **Emergency stop / 紧急停止** | A latched stop that closes input; clearing it does not reactivate. / 关闭输入的锁存停止；解除不自动启用。 |
| **Output / 输出** | A named destination with independent connection and enablement. Connection alone grants no input permission. / 有独立连接与启用状态的命名目标；连接不授予输入许可。 |
| **Axis profile / 轴配置** | Reusable ranges, limits, direction and motion settings for output axes. / 可复用的轴映射范围、限位、方向与运动配置。 |
| **Draft / 草稿** | Edited browser configuration before successful persistence, separate from runtime state. / 成功保存前的浏览器编辑内容，与运行状态分开。 |
| **OSC source / OSC 来源** | A tracked transport/source identity with independent values and lifecycle; not authenticated Contact Sender identity. / 独立跟踪值与生命周期的来源身份，不是 Contact Sender 认证。 |
| **Spatial rig / 空间测量组** | Markers interpreted in one local frame; grouping alone proves neither common identity nor synchronization. / 在一个局部框解释的标记组；分组不证明共同身份或同步。 |
| **Avatar-root coordinates / Avatar 根局部坐标** | Position relative to the selected Avatar root and authored local scale, excluding common world motion. / 相对所选 Avatar 根及作者局部尺度的位置，不包含共同世界运动。 |
| **Dedicated root marker / 专用根标记** | A known-radius marker following an explicitly selected root center on its own measurement channel. / 已知半径、跟随明确根中心并使用独立测量通道的标记。 |
| **Receiver radius / 接收半径** | Distance from one Contact receiver’s center to its spherical boundary; it is not the common coverage of an array. / 单个 Contact 接收器中心到球形边界的距离，不是整组测量点的共同覆盖范围。 |
| **Anchor axis offset / 测量点各轴偏移** | An anchor’s X/Y/Z offsets from the array center; these differ from its straight-line distance to that center. / 测量点相对布局中心的 X／Y／Z 偏移，不等于测量点到中心的直线距离。 |
| **Common measurable region / 共同可测区域** | Positions satisfying all required receivers’ unsaturated distance measurements and reconstruction bounds; sampling freshness is checked separately. / 同时满足全部必需接收器的未饱和距离测量及解算边界的位置区域，采样是否新鲜另行检查。 |
| **Sampling activity / 采样活动** | Continuing producer publication, not proof of sensor freshness, atomic sampling or target identity. / 生产端持续发布，不证明传感器刷新、原子采样或身份。 |
| **Native root capture / 原生根点捕获** | Permitted Avatar render components encode a root; an explicit desktop region is decoded. Not final-mesh feedback. / 允许的原生组件编码根点，再解码明确桌面区域；不是最终网格回读。 |
| **Model gate / 模型门控** | An explorer's simulated validity/gating result, excluding runtime learning, mapping and device output. / 图解中的模拟有效性／门控，不含运行时估长、映射或设备输出。 |
| **Preview release / 预发布** | A published development snapshot, separate from stable releases and the stable-only VPM index. / 已公开开发快照，与稳定发布及仅稳定版 VPM 分开。 |
| **Presentation locale / 呈现语言** | UI/document language preference, never a change to protocol names or numeric culture. / 界面／文档语言偏好，不改协议标识或数值文化。 |

Avoid “actual position” for command telemetry, “connected” for input permission, “world position” for AvatarRootLocal, and “mesh tracking” for root capture. / 不把命令遥测叫实测位置、连接叫输入许可、AvatarRootLocal 叫世界位置、根捕获叫网格跟踪。

[Architecture](docs/architecture.en.md) · [中文架构](docs/architecture.md) · [Control ADR / 控制决策](docs/adr/0001-control-and-input-activation.md)
