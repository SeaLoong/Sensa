# SPS 作者配置与生成参数

**简体中文** | [English](AUTOMATION.en.md)

[安装与语言选择](README.zh-CN.md)。Automatic SPS Setup 读取受支持 Socket／Plug 的作者几何，不修改原 SPS。根点定位默认使用四点定位，也可明确选择 Contact 直接定位（SDK Beta）。两者与独立 Shader 捕获都由同一个 NDMF 生成入口处理，时机见[Unity 构建指南](https://github.com/SeaLoong/Sensa/blob/main/docs/unity-build.md)。

## 目标与范围

Discover All 发现受支持的 VRCFury 作者组件；Selected Targets 缩小范围，Excluded Targets 优先排除。自动组名必须唯一，同一目标只归一个组。构建前检查目标与 Contact 开销。只启用根点测量时按根点几何验证；尖端、配对 Plug 标记和抓取把手功能另外验证 Plug 长度。

| 能力 | 生成范围 |
| --- | --- |
| 四点定位 | 每个目标四个固定 Receiver 和一个专用 Sender |
| Contact 直接定位（SDK Beta） | 每个根点一组专用 Sender／Receiver，输出原生 XYZ 与速度 |
| 配对 Socket 定位 | 独立 Root／Tip／Side Pose 接收阵列 |
| 配对 Plug 标记 | 三个参考标记，不追踪 GPU 形变 |
| 本地 Plug 尖端定位 | 相对明确参考 Socket 的本地点 |
| Plug PB 把手 | 独立可抓把手、Stretch 与抓取门控 |

Exclusive 每组一次启用一个测量目标，初始关闭；Dedicated 允许同时测量。互斥减少活动对象，不减少注册 Contact 预算；可选能力和其他插件也计入。未知策略会令构建失败。

单目标可用 `SensaSpsRootProbe.prefab` 或 **GameObject → Sensa → Four-anchor tracking**。SDK 路线使用 `SensaContactRootProbe.prefab` 或 **GameObject → Sensa → Contact direct tracking (SDK Beta)**。两者的 Target 可选择 Avatar 内的骨骼／空物体 Transform、SPS、Sensa Component 或原生 Contact；适配器读取所选根点的参照框。默认实例名为 `Root`，复制后换成唯一实例名；Collision Channel 留空时按实例名稳定派生，也可填写手动覆盖值。

独立 Shader 路线使用 `SensaShaderCapture.prefab` 或 **GameObject → Sensa → Shader Root Capture (Experimental)**，接受同样的 Target 类型，并配置独立 Producer ID 和桌面区域。[Shader 设置](GPU-TRACKING.md)

## Contact 直接定位（SDK Beta）

在 Automatic SPS Setup 中选择根点定位方式；稳定版 SDK 安装默认仍用四点定位。Contact 直接定位需要包含 `advancedProximityParameters` 的 SDK（已核对 3.10.6-beta.2）；旧 SDK 选择此方式时会构建失败，并给出安装要求或替代方式。

`Runtime/SensaContactProtocol.cs` 定义 `Sensa/Contact/<id>`。一个半径 2 制作单位的 Proximity Receiver 位于 Avatar 根点，形状偏移为零，坐标轴与根旋转对齐；另一个半径 0.001 制作单位的 Sender 跟随所选根点。原 SPS Contact 不变。SDK 直接写入十个原生报告：`Proximity`、Int `Proximity_SenderType`、`Proximity_SenderLocalPositionX/Y/Z`、`Proximity_SenderVelocityX/Y/Z`、`Proximity_SenderVelocityMagnitude` 和 `Proximity_ProximitySpeed`；其余公开字段为 Float。SDK 另为专用碰撞标签写入 `Proximity_CollisionTag_<tag>`；Sensa 在 FX 中声明该 Bool，停用时清零，位于十二个公开表达参数声明之外。客户端 OSC 可见性另行检查。

XYZ 使用 `AvatarRootMeters`：以 Avatar 根点为原点、以其旋转为坐标轴，单位米，不除以制作时根缩放。速度是 SDK 碰撞点的相对速度，单位米/秒；ProximitySpeed 是归一化接近值每秒变化量。单点不提供朝向。`Radius` 报告包含制作缩放与 ScaleFactor 的实际世界接收半径。`Sample` 约每 50 ms 按 n/32 循环；停用时两个控制字段均清零。时钟表示生产端活动，不证明 SDK 同帧或 Sender 身份。桌面活动时效上限 1000 ms；Sample 推进时允许缓存静止坐标。接触存在性与 SenderType 单独校验，零位置／速度可以是合法静止值。

两种方式采用相同 IsLocal、缩放和选择门禁。Contact 直接定位每个目标计入 2 个 Contact，四点定位计入 5 个。原生报告及两个控制字段均为本地、不同步、不保存参数；桌面共用空间许可、校准和输入启用控制。[SDK 语义与限制](https://github.com/SeaLoong/Sensa/blob/main/docs/contact-sdk.md)。

包内包含功能检测、生成参数、位置、缩放门禁和选择清零的 EditMode 契约；正向 SDK 构建契约需要 Beta API，缺少时跳过。此次变更尚未在稳定版或 Beta Unity Editor 中执行这些契约；包元数据检查与 SDK 程序集检查不等于 Unity 客户端或真实硬件验收。

## 四点几何与五个测量字段

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

## 基础组件与补充信号

`SensaComponent` 在构建副本上生成基础 OGB Contact。接收形状绑定配置的 Depth Axis，Plug 标记分别绑定 Root Bone／Tip Bone，因此骨骼移动时测量形状持续跟随。Socket 量程与 Contact 尺寸按所选轴的局部单位解释；轴缩放为 1 时，数值等于米。

补充 Contact 信号可填写 1–16 个与 Sender 匹配的碰撞标签，默认标签为 `TPS_Pen_Penetrating`。已有参数信号引用原参数并保留其类型。生成的 Contact／PhysBone 参数同时具有表达参数声明与 FX 可写声明。

Raycast 补充信号沿原点的本地 +Z 测距，量程按米填写，生成 `_Distance`（米）、`_Hit`（Bool）和 `_Ratio`（0–1）三个原生报告字段。把 `_Hit` 映射为命中条件，再使用归一化值或实际距离。[路径、单位与未命中行为](https://github.com/SeaLoong/Sensa/blob/main/docs/osc-parameters.md#raycast-补充信号命中与距离)

构建先核对骨骼、PhysBone 与 Raycast 等参照属于当前 Avatar。取消勾选的作者只移除脚本；未激活对象上的已启用配置照常处理，运行时开关遵循各生成物及其菜单规则。生成后的宿主、原生组件与参照 Transform 保留。

## 校验与停止

两种根点方案均要求正数均匀根缩放，并检查根 ScaleConstraint 及已知根缩放动画。IsLocal、ScaleFactor 与选择门控在停用时关闭 Contact 并清零该方案的公开值，使 Receiver 不超出约 2.999 世界米。

四点定位的桌面解算需要四路完整、未饱和且拟合一致的值，以及合法变化的 Sample。静止 P 允许缓存；Sample 内容变化的时效上限为 1250 ms，正值输入超时可更严格。重发同一 Sample 不续期；发布顺序不等于 OSC 原子事务或 Sender 身份认证。

Contact 直接定位要求同来源与实例的十二字段齐全、Proximity 为正、SenderType=1、Radius／位置边界受支持，且 Sample 变化寿命最多 1000 ms。接触有效时可报告零坐标和零速度；Contact 消失或活动非法／冻结时，相关动作停止。

两种方案都先采集两端点、替换映射草稿、检查并保存，再单独允许实验空间输入和启用输入。缺失、无效或过期观测会停止动作。旧 Sensa SPS Avatar 与映射按当前四点契约重建；独立 Point／Handle／Pose 保留各自最旧通道时效。

[限制](COMPATIBILITY.md) · [原生 Shader 路线](GPU-TRACKING.md)
