# 自动配置与实验采样

**简体中文** | [English](AUTOMATION.en.md)

Automatic SPS Setup 在构建时识别已有 SPS 目标并生成原生组件。它减少作者配置工作，不证明数据具有唯一 Sender、同帧或真实表面含义。位置估计默认不能驱动设备；先读[定位说明](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.md)。

## 最少配置

安装依赖后，在 Avatar 根添加 **Sensa → Automatic SPS Setup**，选择需要的能力并执行预检。SPS 目标须已由 VRCFury 正确配置。默认 Discover All；也可关闭后使用 Selected Targets，Excluded Targets 优先。同一目标不要分配到重复自动组；组名、实例和 Pair Channel 按 Inspector 规则保持唯一。

| 能力 | 生成内容 | 含义 |
| --- | --- | --- |
| Socket Root Tracking | 每对象八个标准 Root Receiver | 候选球心，仅诊断 |
| Paired Socket Tracking | Root／Tip／Side 各八个 Receiver | 配对三点的实验直线姿态 |
| Paired Plug Markers | 三个匹配通道标记 | 未形变参考点，不是 GPU 尖端 |
| Local Plug Tip Tracking | 参考 Socket 下的四面体阵列与本地标记 | 未形变尖端相对参考框的实验估计 |
| Create Plug Grab Handles | 独立 PhysBone 把手、采样与抓取状态 | 抓取门控；不等于手柄朝向跟踪 |

Local Plug Tip Tracking 需要明确参考 Socket；只有一个候选时可自动选择。目标与参考一起移动不会产生世界位移信息。把手网格与 SPS 搜索树分开，PhysBone 与跟随约束使用不同对象，避免相互覆盖。上传前检查自动生成计划、缩放和总 Contact 数量。

## 本地探针与原生 PB

**Local Bone or PB Probe** 可独立于 SPS：设置 Target／Reference，或创建把手。Point／Handle 使用四点阵列，Root 使用八点；四点配置是实验数据格式，不是可靠性承诺。所有祖先应为正值均匀缩放，实例名唯一。

只需抓取拉伸控制时，优先用实际 PhysBone 的 `_Stretch`＋`_IsGrabbed` 标量。它不需要定位解算。桌面内置 PB 模板使用测试路径，必须替换成自己的实际前缀。

## 阵列策略

| 策略 | Root Receiver 注册数 | 行为 |
| --- | --- | --- |
| Dedicated | 8 × 目标数 | 每目标独立；可同时观察 |
| Exclusive | 8 × 目标数 | 选择一个目标，仅减少同时活动数量 |
| SharedRootArray | 8 | 共享阵列跟随选中参考；最多 16 个同缩放目标 |

SharedRootArray 切换使用 Slot／Ready 和切换后采样防止立即复用旧槽位。它仍没有 Sender 身份或原子采样帧，不能作为运动行程。最终预算还应包括其他插件生成的 Contacts。

## 路径与桌面入口

| 路径 | 输入 |
| --- | --- |
| `Sensa/SpsRoot/v1/<实例>/<Self|Others>/Root/A0..A7` | 标准 Root 诊断 |
| `Sensa/SharedRoot/v1/<组>/Others/...` | 共享 Root，含 Slot／Ready |
| `Sensa/Point/v1/<实例>/Self/Root/A0..A3` | 本地点实验 |
| `Sensa/Handle/v1/<实例>/Self/...` | 把手实验，含抓取／拉伸 |
| `Sensa/Pose/v1/<实例>/<Self|Others>/<Root|Tip|Side>/A0..A7` | 配对姿态实验 |

在桌面应用 OSC 模式，打开 **OSC → 实验诊断**。在“本地点与根部”查看对象并展开两点量程校准：选轴、采集 0%／100%、生成草稿、保存。端点必须来自同一对象、来源和轴；Root／SharedRoot 不提供行程校准。保存不会自动启用输入。

`osc.allowExperimentalSpatialInput` 默认 false，已有空间映射同样阻断。显式实验许可后，全部参与通道须完整且未过期；以最旧通道计时，Handle 还包括抓取状态，默认 1 秒。OSC 静止值可能不重发；新鲜度也不证明同帧或身份。不要把校准成功或低残差当作定位验收。

## 预制件与构建边界

保留 SensaAutoSetup、SensaLocalPoint、SensaGrabHandle、SensaPoseSocket／Plug 和 SensaSpsRootProbe 作者预制件。新传感器生成器检查参数冲突、命名、缩放和预算，并生成实际 FX Animator 参数；仅在本地表达参数列表登记名字不足以让 Contact 写入。

Sensa 配置组件经 NDMF 生成后清理，运行时依靠原生组件。菜单默认 Off；测量选择和 SPS 原菜单分开。Editor／合成契约不能替代上传后客户端 OSC、真实抓取、混合 Sender、GPU 或设备验收。

[安装](README.md) · [兼容边界](COMPATIBILITY.md) · [Shader 实验](GPU-TRACKING.md)
