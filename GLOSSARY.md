# Sensa

Sensa 将虚拟交互或动作轨迹转换为设备控制目标。 / Sensa translates virtual interactions or motion trajectories into device targets.

## Language / 术语

**Motion target / 动作目标**:
期望发送给设备的归一化运动或强度，不是设备传感器回读。 / Desired normalized movement or intensity, not physical sensor feedback.
_Avoid_: Actual position / 实测位置

**Input mode / 输入模式**:
当前选择的手动、OSC 或脚本输入类别，同一时刻只有一种。 / The selected manual, OSC or script input category, one at a time.

**Input activation / 输入启用**:
用户明确允许当前输入驱动输出的状态；更换输入方式或脚本后需要重新启用。 / Explicit permission for the current input to drive outputs; changing the mode or script requires reactivation.
_Avoid_: Connection / 已连接

**Emergency stop / 紧急停止**:
关闭输入并保持停止，直至用户解除并重新启用。 / A latched stop that closes input until cleared and explicitly reactivated.

**Output / 输出**:
具有独立连接目标与启用状态的命名设备控制通道。 / A named device-control destination with its own connection target and activation.

**Axis profile / 轴配置**:
为一组输出轴定义映射范围、限位、方向和运动方式的可复用配置。 / Reusable mapping ranges, limits, direction and motion settings for output axes.

**OSC source / OSC 来源**:
能独立追踪参数和生命周期的发送方身份。 / A sender identity whose parameters and lifecycle can be tracked independently.

**Spatial rig / 空间测量组**:
在同一局部参考框内用于估计点位置或姿态的一组标记；分组本身不证明身份或同步。 / Markers used to estimate a point or pose in one local reference frame; grouping alone proves neither identity nor synchronization.

**Preview release / 预发布**:
供开发验证的已发布构建快照，区别于稳定版本。 / A published development build snapshot, distinct from a stable release.
