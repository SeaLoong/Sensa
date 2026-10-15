# 选择映射预设

当前共 29 个内置预设。它们生成映射草稿，不会自动连接设备、启用输入或替代量程校准。通配路径用于发现目标；实际使用应限定到一个实例和来源。

- 首次连接 OSR：选 **入门 · 测试世界 → 我的 Avatar**，按 [首次使用](quick-start.md) 给自己的 Avatar 添加 Quick Start World Receiver，在世界 START HERE 测试。

- 没装 Sensa 定位资产、只使用常规 SPS：先选 SPS Socket/Plug 对应角色，按 Self/Others 筛选。新 Root/Tip 成对输入是近似径向深度，不能校正所有偏移。
- 自己安装本地点测量：选 `Sensa 本地点` 的 Z/三轴/距离，或优先在校准页按真实采样生成单轴草稿。
- 使用可抓 PB 手柄：选 `Sensa PB 把手`；抓取状态内置门控，松手失效，无须额外增加不存在的 Gate 参数。
- 对方也安装配对三点：选 Pose 几何深度或六轴，双方 Pair Channel 一致。
- 辅助信号：优先选振动、门控、深度覆盖、方向等单项。组合模板包含 GateEnable；头像没有这个角色时必须删除该条，否则不会输出。
- 标准 Root/SharedRoot 和 Shader 实验数据只做诊断，不提供把原始距离样本直接当运动的预设。

| 预设 | ID | 映射条数 |
| --- | --- | --- |
| 入门 · 测试世界 → 我的 Avatar | `sensa-quick-start` | 2 |
| Sensa Pose · 几何深度 | `sensa-pose-depth` | 1 |
| Sensa Pose · 六轴（需校准） | `sensa-pose-full` | 6 |
| Sensa 本地点 · Z 位移（需校准） | `sensa-point-z` | 1 |
| Sensa 本地点 · 三轴位置（需校准） | `sensa-point-xyz` | 3 |
| Sensa 本地点 · 距参考原点（需校准） | `sensa-point-distance` | 1 |
| Sensa PB 把手 · Z 位移（需校准） | `sensa-handle-z` | 1 |
| Sensa PB 把手 · 三轴位置（需校准） | `sensa-handle-xyz` | 3 |
| Sensa PB 把手 · 距参考原点（需校准） | `sensa-handle-distance` | 1 |
| Sensa · 辅助振动 | `sensa-aux-vibration` | 1 |
| Sensa · 辅助门控 | `sensa-aux-gate` | 1 |
| Sensa · 辅助深度覆盖 | `sensa-aux-override` | 1 |
| Sensa · 辅助方向 | `sensa-aux-angles` | 2 |
| VRCFury SPS · Socket 新深度 · 仅他人 | `sps-socket-depth-others` | 1 |
| VRCFury SPS · Socket 新深度 · 仅自身 | `sps-socket-depth-self` | 1 |
| VRCFury SPS · Plug 深度 · 仅他人 | `sps-plug-depth-others` | 1 |
| VRCFury SPS · Plug 深度 · 仅自身 | `sps-plug-depth-self` | 1 |
| VRCFury SPS · Socket 新深度 | `sps-socket-depth` | 2 |
| VRCFury SPS · Plug 深度 | `sps-plug-depth` | 1 |
| OGB Socket · 深度 + 姿态 | `ogb-socket-full` | 5 |
| OGB Plug · 深度（插入 / 自插） | `ogb-plug-full` | 2 |
| OGB Plug · 仅插入他人 | `ogb-plug-others` | 1 |
| OGB Plug · 仅自插 | `ogb-plug-self` | 1 |
| OSR-VRChat · 被插入（小穴） | `osr-inserted-pussy` | 1 |
| OSR-VRChat · 被插入（后庭） | `osr-inserted-ass` | 1 |
| VRCFury SPS · 触碰与摩擦 | `sps-touch` | 1 |
| Sensa · 辅助信号组合（须按需删减） | `sensa-aux` | 5 |

三轴模板默认将 Z→L0、X→L2、Y→L1；这些是起始模板，不表示物理设备安装方向。Point/PB 的范围使用局部米，Pose 角度使用度，普通标量通常是 0–1。生成草稿后检查角色、反向、输入范围与输出轴限制，再保存。

SPS Socket 新深度需要同一来源、同一 Socket 的 `NewRoot` 和 `NewTip` 都出现过。若手动启用输入超时，任意一路更新都会刷新这一对输入的有效期，允许另一路保持缓存值；其他 Socket、其他来源和独立门控不会为它续期。两路都不再更新时仍会超时停止，因此静止的增量 OSC 也可能触发停止；默认超时仍关闭。此配对按路径和 OSC 来源区分，不能识别同一接收器范围内的多个玩家，也不能证明两路来自同一发送体。

[返回使用指南](guide.md)

实验室新增：`sensa-lab-pb-stretch` 为原生 PB 拉伸 + 抓取门控（无 XYZ）；`sensa-lab-shader-z` 为图像桥接 Z 位移 + Valid 门控。后者 0.12 m 预览 60%，并非 SPS 几何插入深度 40%。请先使用无输出的测试配置。
