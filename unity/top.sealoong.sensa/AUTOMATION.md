# 自动配置与固定根部采样

**简体中文** | [English](AUTOMATION.en.md)

Automatic SPS Setup 在构建时读取已有 SPS Socket／Plug 的作者几何，生成 Sensa 自己的辅助标记、固定锚点和原生参数，不修改原 SPS。默认测量对象的根部位置；不是 GPU 表面或远端 Avatar 定位。桌面空间输入默认关闭。[原理与边界](COMPATIBILITY.md)

## 最少配置

在 Avatar 根添加 **Sensa → Automatic SPS Setup**，先确保 SPS 已由 VRCFury 正确配置。默认 Discover All，也可改用 Selected Targets；Excluded Targets 优先。新组件的阵列策略默认 Exclusive，游戏内菜单初始 Off；已有保存配置保留自己的策略。一个目标不要同时分配给重复自动组。

| 能力 | 生成内容 | 含义 |
| --- | --- | --- |
| 固定 SPS 根部定位（socketRootTracking） | 每个 Socket／Plug 的 4 固定 Receiver＋1 专用 Sender | Self 根点在 AvatarRootLocal 中的位置 |
| Paired Socket Tracking | Root／Tip／Side 各 8 个 Receiver | 高级三点直线姿态实验 |
| Paired Plug Markers | 三个匹配通道标记 | 未形变参考点，不是 GPU 尖端 |
| Local Plug Tip Tracking | 参考 Socket 下的四面体阵列＋本地标记 | 相对该参考框的未形变尖端实验 |
| Create Plug Grab Handles | 独立 PhysBone 把手、采样与抓取状态 | 抓取门控，不代表朝向 |

Local Plug Tip Tracking 需要明确的参考 Socket；只有一个候选时可自动选择。目标与参考共同移动不产生世界位移信息。上传前检查生成计划、正值均匀缩放、命名与全部插件的 Contact 预算。

只测一个目标时也可添加 **Fixed SPS Root Probe**，选择明确的 SPS Socket、Plug、Sensa 根组件或原生 Contact。作者通过 ReadRoot 解析真实 CPU Transform 根中心；不从物体名称猜位置。实例和 Collision Channel 必须唯一；新增组件的通道默认随机生成，复制作者后应重新生成。包内 `SensaSpsRootProbe.prefab` 和 **GameObject → Sensa → Fixed-anchor SPS Root Probe** 菜单现在都创建固定四锚点作者，初始 target 留空，必须选择真实根部；复制该预制件时也要为实例与通道设置唯一值。旧 `SensaPoseSocket.standardSpsRoot` 八路模式构建时明确拒绝，请替换作者；三点 Pose 不受影响。

## 默认固定四锚点

锚点固定在 Avatar 根局部坐标，中心 `(0,1,0)`、半跨度 0.5，四点非共面；Receiver 半径 2.5，专用 Sender 半径 0.001。Sender 只跟随目标根的位置与旋转，不跟随目标骨骼缩放，因此其半径仍由 Avatar 根尺度定义。

| 策略 | 基础根部 Contact 数 | 行为 |
| --- | --- | --- |
| Dedicated | 每目标 5 | Socket 和 Plug 各自独立，可同时观察 |
| Exclusive | 每目标 5 | 一次选择一个目标；降低活动数量，不减少注册总数 |
| SharedRootArray | 共享 8 Receiver | 保留旧 Socket 移动阵列诊断；不是固定四锚点协议 |

基础成本不包含额外开启的姿态、尖端、PB 把手或其他插件。手工 Fixed SPS Root Probe 的 Others Diagnostic 另加 4 Receiver，总数为 9；该 Others 通道的 Valid 始终为零，不用于输出。

SharedRootArray 最多支持 16 个符合缩放要求的目标，使用 Slot／Ready 和切换后的新采样避免立即复用旧槽位；没有固定参考或共同目标身份，不提供运动映射。旧 SpsRoot 八路数据也不会被当成新的 Profile=1；需要重新构建固定根作者。

## 缩放与数据发布

Avatar 根必须正值均匀缩放，且 `2.5 × authoredRootScale × ScaleFactor` 保持在约 2.999 m 以下。作者检测已知根缩放动画和 Avatar 根 ScaleConstraint 并拒绝构建；运行时过大／无效 ScaleFactor 会关闭 Contacts、将 Valid 与范围清零。Scale 元数据复制 VRChat 内置的 ScaleFactor，不是世界尺度，也不观测任意自定义缩放动画。

FX 约每 0.05 秒复制四个 Raw 值到公开值，再推进 32 步 Heartbeat（第 i 步为 i/31，约 1.6 秒循环一次），并发布 Profile、Valid 和 Scale。这个心跳允许静止距离保留；它不是同帧事务、frameId 或 UDP 可靠传输协议。作者组件经 NDMF 清理后，运行时只依靠原生组件。

## 路径与桌面操作

固定 Self 根的公共前缀为 `Sensa/SpsRoot/v1/<实例>/Self`：

| 相对前缀的路径 | 内容 |
| --- | --- |
| `/Root/RawA0..RawA3` | Contact 原始近接值，供 FX 读取 |
| `/Root/A0..A3` | FX 发布的四路近接值，供桌面解算 |
| `/Profile` | 1，表示 AvatarRootTetrahedron |
| `/Valid` | 本地、选中且缩放有效时为 1 |
| `/Scale` | 内置 ScaleFactor |
| `/Heartbeat` | 32 步 i/31 的生产端存活计数（0–1） |

元数据位于 Self 前缀下，**不在 Root 下**；不存在此协议的 `/Root/Valid`。手工开启的 Others 诊断使用同样结构，但 Valid=0。解算结果是 AvatarRootLocal，不是世界坐标。

在桌面应用 OSC 模式，打开 **OSC → 实验诊断 → 本地点与根部 → 两点量程校准**。固定 Self 根点可选择 X／Y／Z／Distance，采集两端并保存草稿；需要唯一有效实例、同来源和同测量轴。SharedRoot／Others 不生成运动映射。保存后仍需显式实验许可及输入启用。

`osc.allowExperimentalSpatialInput` 默认 false，已有空间映射同样阻断。固定根需要 Profile=1、Valid=1、正值 Scale 和有效生产端心跳；桌面默认心跳时效 1 秒，协议上限 1.25 秒。心跳不证明每个 UDP 距离包都到达。Point／Handle／Pose 继续使用最旧参与通道时间，Handle 还包括抓取状态，默认 1 秒。

## 其他实验与原生 PB

Local Bone or PB Probe 独立于 SPS，使用 Target／Reference 和旧式 Point／Handle 四路局部采样；Pose 是三组八路。其参考框可能随目标一起移动，不与固定 Avatar 根方案混用。原生 PB 拉伸控制可直接读取 `_Stretch`＋`_IsGrabbed`，无需位置解算；桌面模板的 MyPB 必须换成实际前缀。

旧作者预制件和 QuickStart 保留给显式实验／开发夹具，不再作为默认推荐。低残差、校准成功或 Editor 合成检查不等于实际定位验收。上传客户端 OSC、真实抓取、混合 Sender、GPU 和硬件效果仍需单独验证；本轮不以它们声称已验证。

[安装](README.md) · [兼容边界](COMPATIBILITY.md) · [Shader 指南](GPU-TRACKING.md)
