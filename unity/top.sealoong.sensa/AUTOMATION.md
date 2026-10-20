# SPS 作者配置与生成参数

**简体中文** | [English](AUTOMATION.en.md)

[安装与语言选择](README.zh-CN.md)。Automatic SPS Setup 读取受支持 Socket／Plug 的作者几何，不修改原 SPS；只支持当前 `Sensa/SPS/<id>` 契约。

## 目标与范围

Discover All 发现受支持的 VRCFury 作者组件；Selected Targets 缩小范围，Excluded Targets 优先排除。自动组名必须唯一，同一目标只归一个组。构建前检查目标与 Contact 开销。

| 能力 | 生成范围 |
| --- | --- |
| 固定 SPS 根部定位 | 每个目标四个固定 Receiver 和一个专用 Sender |
| 配对 Socket 定位 | 独立 Root／Tip／Side Pose 接收阵列 |
| 配对 Plug 标记 | 三个参考标记，不追踪 GPU 形变 |
| 本地 Plug 尖端定位 | 相对明确参考 Socket 的本地点 |
| Plug PB 把手 | 独立可抓把手、Stretch 与抓取门控 |

Exclusive 每组一次启用一个测量目标，初始关闭；Dedicated 允许同时测量。互斥减少活动对象，不减少注册 Contact 预算；可选能力和其他插件也计入。未知策略会令构建失败。

单目标可用 `SensaSpsRootProbe.prefab` 或 **GameObject → Sensa → Fixed-anchor SPS Root Probe**。Target 刻意留空，应明确选择实际 SPS／Sensa／原生 Contact 根中心；复制后更换实例名和碰撞通道。适配器读取 CPU 根参考框，不是 GPU 表面。

## 几何与五个测量字段

`Runtime/SensaFixedAnchorProtocol.cs` 与桌面解算共享。

| 点 | AvatarRootLocal |
| --- | --- |
| P0 | (−0.5, 0.5, −0.5) |
| P1 | (0.5, 0.5, 0.5) |
| P2 | (0.5, 1.5, −0.5) |
| P3 | (−0.5, 1.5, 0.5) |

Receiver 半径 2.5，标记半径 0.001。锚点与标记共享 Avatar 根缩放；ParentConstraint 跟随所选根的位置／旋转，不继承目标骨骼缩放。只接收专用 Self 标签。

| `Sensa/SPS/<id>` 下公开后缀 | 含义 |
| --- | --- |
| `P0` … `P3` | 四个 Float 近接值，不是 XYZ |
| `Sample` | 0 无效；n/32（n=1…32）为活动发布计数 |

FX 约每 50 ms 先复制四个内部 RawP，再发布 Sample；32 步周期为 1.6 秒。RawP 不注册为表达参数；仅在 FX 声明不代表隐私边界，也不能保证客户端不会导出它。

## 控制参数与语言

Exclusive 另注册本地、不同步、不保存的 Int `Sensa/Select/<group>`：默认 0 为关闭，1…N 选择有序目标，越界回到关闭。它可能出现在 OSC，但属于**菜单控制**而非测量值。Dedicated 不生成自动选择器；任何选择器都不会启用桌面输入或连接设备。

语言偏好影响 Inspector、帮助、错误和生成菜单标题。用户名称、参数名、枚举值和槽位不变。Avatar 菜单文字在作者构建时固定，不跟随每个客户端语言。

## 校验与停止

非正值／非均匀根缩放、根 ScaleConstraint 及已知根缩放动画会构建失败。IsLocal、ScaleFactor 与选择门禁在无效时停用 Contact 并清零 P／Sample，使 Receiver 不超出约 2.999 世界米。

桌面需要四路完整、未饱和且拟合一致的值，以及合法变化的 Sample。静止 P 允许缓存；Sample 内容变化的时效上限为 1250 ms，正值输入超时可更严格。重发同一 Sample 不续期；发布顺序不等于 OSC 原子事务或 Sender 身份认证。

采集两端点、替换映射草稿、检查并保存，再单独允许实验空间输入和启用输入。零值、无效或过期观测会停止动作；旧 Sensa SPS 数据不支持。独立 Point／Handle／Pose 保留各自最旧通道时效。

[限制](COMPATIBILITY.md) · [原生 Shader 路线](GPU-TRACKING.md)
