# SPS 作者配置与生成参数

**简体中文** | [English](AUTOMATION.en.md)

[安装与语言选择](README.zh-CN.md)。Automatic SPS Setup 读取受支持 Socket／Plug 的作者几何，不修改原 SPS。根点定位默认使用四点定位，也可明确选择 Contact 直接定位（SDK Beta）。

## 目标与范围

Discover All 发现受支持的 VRCFury 作者组件；Selected Targets 缩小范围，Excluded Targets 优先排除。自动组名必须唯一，同一目标只归一个组。构建前检查目标与 Contact 开销。

| 能力 | 生成范围 |
| --- | --- |
| 四点定位 | 每个目标四个固定 Receiver 和一个专用 Sender |
| Contact 直接定位（SDK Beta） | 每个根点一组专用 Sender／Receiver，输出原生 XYZ 与速度 |
| 配对 Socket 定位 | 独立 Root／Tip／Side Pose 接收阵列 |
| 配对 Plug 标记 | 三个参考标记，不追踪 GPU 形变 |
| 本地 Plug 尖端定位 | 相对明确参考 Socket 的本地点 |
| Plug PB 把手 | 独立可抓把手、Stretch 与抓取门控 |

Exclusive 每组一次启用一个测量目标，初始关闭；Dedicated 允许同时测量。互斥减少活动对象，不减少注册 Contact 预算；可选能力和其他插件也计入。未知策略会令构建失败。

单目标可用 `SensaSpsRootProbe.prefab` 或 **GameObject → Sensa → Four-anchor tracking**。SDK 路线使用 `SensaContactRootProbe.prefab` 或 **GameObject → Sensa → Contact direct tracking (SDK Beta)**。Target 刻意留空，应明确选择实际 SPS／Sensa／原生 Contact 根中心；复制后更换实例名和碰撞通道。明确指定 Sensa／原生 Contact 目标时不需要 VRCFury。适配器读取 CPU 根参考框，不是 GPU 表面。

## Contact 直接定位（SDK Beta）

在 Automatic SPS Setup 中选择根点定位方式；稳定版 SDK 安装默认仍用四点定位。Contact 直接定位需要包含 `advancedProximityParameters` 的 SDK（已核对 3.10.6-beta.2）；旧 SDK 选择此方式时会构建失败，并给出安装要求或替代方式。

`Runtime/SensaContactProtocol.cs` 定义 `Sensa/Contact/<id>`。一个半径 2 制作单位的 Proximity Receiver 位于 Avatar 根点，形状偏移为零，坐标轴与根旋转对齐；另一个半径 0.001 制作单位的 Sender 跟随所选根点。原 SPS Contact 不变。SDK 直接写入十个原生报告：`Proximity`、Int `Proximity_SenderType`、`Proximity_SenderLocalPositionX/Y/Z`、`Proximity_SenderVelocityX/Y/Z`、`Proximity_SenderVelocityMagnitude` 和 `Proximity_ProximitySpeed`；其余字段为 Float。不导出碰撞标签参数。

XYZ 使用 `AvatarRootMeters`：以 Avatar 根点为原点、以其旋转为坐标轴，单位米，不除以制作时根缩放。速度是 SDK 碰撞点的相对速度，单位米/秒；ProximitySpeed 是归一化接近值每秒变化量。单点不提供朝向。`Radius` 报告包含制作缩放与 ScaleFactor 的实际世界接收半径。`Sample` 约每 50 ms 按 n/32 循环；停用时两个控制字段均清零。时钟表示生产端活动，不证明 SDK 同帧或 Sender 身份。桌面活动时效上限 1000 ms；Sample 推进时允许缓存静止坐标。接触存在性与 SenderType 单独校验，零位置／速度可以是合法静止值。

两种方式采用相同 IsLocal、缩放和选择门禁。Contact 直接定位每个目标计入 2 个 Contact，四点定位计入 5 个。原生报告及两个控制字段均为本地、不同步、不保存参数；桌面共用空间许可、校准和输入启用控制。[SDK 语义与限制](../../docs/contact-sdk.md)。

包内包含功能检测、生成参数、位置、缩放门禁和选择清零的 EditMode 契约；正向 SDK 构建契约需要 Beta API，缺少时跳过。此次变更尚未在稳定版或 Beta Unity Editor 中执行这些契约；包元数据检查与 SDK 程序集检查不等于 Unity 客户端或真实硬件验收。

## 几何与五个测量字段

`Runtime/SensaFixedAnchorProtocol.cs` 与桌面解算共享。

| 点 | AvatarRootLocal |
| --- | --- |
| P0 | (−0.35, 0.65, −0.35) |
| P1 | (0.35, 0.65, 0.35) |
| P2 | (0.35, 1.35, −0.35) |
| P3 | (−0.35, 1.35, 0.35) |

Receiver 半径 2，标记半径 0.001。锚点与标记共享 Avatar 根缩放；ParentConstraint 跟随所选根的位置／旋转，不继承目标骨骼缩放。只接收专用 Self 标签。

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
