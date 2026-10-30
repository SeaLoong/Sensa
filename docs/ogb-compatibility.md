# OGB 互通与检测几何

**简体中文** | [English](ogb-compatibility.en.md)

OGB／SPS 参数描述接近、进入和触碰。根据几何含义与命名规则选择读数，校准深度或强度，再连接到 Sensa 输出。本页说明 Socket、Plug 和独立触碰区域信号，并提供上游定义。

先在参数列表找到实际来源和完整路径，再选[深度或振动模板](presets.md)。图解中的 **SPS2 · PenOthersNewRoot / PenOthersNewTip** 用两路数值估算进入深浅；**SPS1 · PenOthers / PenOthersClose** 用深浅信号配合有效接近区域。配对时保持同来源、同实例和同 Self／Others 类别，需要时开启 Avatar 的 OGB_ENABLED 心跳。

**外部 OGB 路径沿用上游名称**。Sensa 自有 SPS 四点定位、Contact 直接定位和 Shader 参数见[字典](osc-parameters.md)。[在线图解](https://sealoong.github.io/Sensa/parameter-geometry.html)可交互查看检测球与胶囊，灰色轮廓帮助辨认 Socket／Plug 的相对位置。

研究固定到 VRCFury `6bd33f4cb453df816c943a335e47f64e6a37e188`、OGB v2.1.30 `643aedd493ba21b0c0859ce6e57708fe408ee9c0`，并核对 OGB v1.0.0 `262164576721f12958409638851808aa662b87c7`。OGB v1.0.0 已同时读取 `PenOthersNewRoot`／`PenOthersNewTip` 和 `PenOthers`；图解的 SPS1／SPS2 标签按参数几何区分，具体以 Avatar 发布的路径为准。[旧消费端](https://github.com/OscToys/OscGoesBrrr/blob/262164576721f12958409638851808aa662b87c7/src/main/GameDevice.ts#L68-L151)

图解已核对 **VRCFury 1.1434.0** 的 `BakeHapticSocketsService.cs`、`VRCFuryHapticSocketBaker.cs` 与 `VRCFuryHapticPlugBaker.cs`；这三个文件与上述固定提交一致。

Node 的 [OscServices](https://github.com/SeaLoong/Sensa/blob/main/src/node/inputs/osc-services.ts) 接收 OSC／OSCQuery 并维护来源；共享 [RuntimeEngine](https://github.com/SeaLoong/Sensa/blob/main/src/core/runtime/runtime.ts) 解释 OgbDepth／OgbTouch，再经同一输出协调器路由到设备。来源标识用于把配对读数对应到同一实例，几何与单位沿用下文的上游定义。

## 图解采用哪些默认尺寸

每种参数使用对应的上游生成规则。Plug 长度、粗细和 Socket 自动触碰区来自 Avatar 尺寸，图解用一组明确的示例尺寸展示这些规则；滑条可改成你的实际尺寸。

| 场景 | VRCFury 生成规则 | 图解初始值 |
| --- | --- | --- |
| SPS2 · NewRoot / NewTip | 两只接收球半径均为 1 m；Plug 根标记半径 0.01 m | 1 m / 0.01 m |
| SPS1 · PenOthers，以及 Socket Touch | 接收半径 D 来自区域长度；自动长度为 Avatar 视点高度的 5%，Close 半径为 D/2.5 | 示例视点高 1.60 m → D=0.08 m，Close=0.032 m |
| Plug 侧深度、触碰与摩擦 | 按 Plug 的实际长度 L、半径 W 生成 | 示例 L=0.20 m、W=0.03 m |
| Socket 根标记 | 半径 0.001 m | 0.001 m |
| 独立 Touch Zone | 默认半径 0.10 局部单位，随对象缩放 | 缩放 1 时为 0.10 m |

Sensa 的 **SPS 四点定位**和 **Contact 直接定位**各自创建专用 Contact：接收半径为 2 个制作局部单位，目标标记半径为 0.001；制作缩放为 1 时分别对应 2 m 和 1 mm。它们使用 `Sensa/SPS/…` 与 `Sensa/Contact/…` 路径，几何配置见[定位说明](positioning.md)。上表的原生 `OGB/…` 参数继续使用 VRCFury 的生成尺寸。

## 先理解半径与数值

以下路径省略 `/avatar/parameters/`。Orf 是 Socket，Pen 是 Plug；原点为各自根中心，+Z 为作者的前向。Self／Others 分别筛选本 Avatar 或其他 Avatar 的匹配目标。

| 符号 | 本页含义 |
| --- | --- |
| L | Plug 生成时的世界长度 |
| W | Plug 生成时的世界半径 |
| e | `min(W, 0.08 m)`，Plug 手触扩展 |
| D | Socket 触碰区域深度 |
| R、r | 实际 Receiver、球形 Sender 的半径 |
| H | 胶囊的完整高度，包含两端半球 |

Proximity 是连续 0–1 浮点值，通常随目标靠近检测中心增大；Constant 表示是否进入有效接近区域，进入时为 1，离开时为 0。每个 Proximity Receiver 独立选择 Proximity 严格大于零且最大的匹配 Sender；[SDK Beta.3](https://vrc-beta-docs.netlify.app/releases/release-3-10-6) 在两个读数都为 1 时选取最近内部点间距更小的目标。球形接收器按 Sender 最近表面到自身中心计算接近程度。球对球模型为：

```text
p = clamp(1 - max(0, |senderCenter - receiverCenter| - r) / R, 0, 1)
开始接触的中心距 ≈ R + r；Sender 包含接收器中心时饱和为 1。
```

开始检测的距离同时受接收器与目标信号形状影响。例如接收半径为 10 cm 时，还要加上球形目标的半径。胶囊和身体目标按最近表面计算。VRChat 限制缩放后的半径不超过 3 m、宽高深不超过 6 m。[官方 Contacts 行为](https://creators.vrchat.com/common-components/contacts/)

## Socket：`OGB/Orf/<id>`

这组参数由 VRCFury 的 OGB Haptics 构建生成，SpsForAll 自动补充目标走自己的生成分支。`PenOthersNewRoot`／`PenOthersNewTip` 和对应 Self 配对用于 SPS2；启用触摸区域后，还会生成表中的 Touch、SPS1 与 Frot 参数。

| 叶子参数 | 类型、检测对象 | Receiver 几何 | Sensa 自动解释 |
| --- | --- | --- | --- |
| FrotOthers | 近接；他人 Socket 根标签 | 中心 +0.05·Z，球 R=0.1 m；需要触摸区 | 靠近或擦过时的强度，OgbTouch 直接读取 |
| PenOthers | 近接；TPS_Pen_Penetrating | 中心 -D·Z，球 R=D；需要触摸区 | SPS1 的深浅趋势 |
| PenOthersClose | Constant；同一 Plug 标签 | 中心 -D/2·Z，胶囊 R=D/2.5、H=D；需要触摸区 | 目标进入 Socket 有效接近区时为 1 |
| PenOthersNewRoot | 近接；他人 Plug 根 Sender | 根中心，球 R=1 m | SPS2 根部接近值，与 NewTip 配对换算深浅 |
| PenOthersNewTip | 近接；他人 Plug 长度 Sender | 根中心，球 R=1 m | SPS2 长度球接近值，与 NewRoot 配对估长 |
| PenSelfNewRoot | 近接；自身 Plug 根 Sender | 根中心，球 R=1 m | 对应 Self 类别的 SPS2 配对 |
| PenSelfNewTip | 近接；自身 Plug 长度 Sender | 根中心，球 R=1 m | 对应 Self 类别的 SPS2 估长辅助值 |
| TouchOthers | 近接；他人 Head/Hand/Foot/Finger | 中心 -D·Z，球 R=D；需要触摸区 | 触碰强度，与 TouchOthersClose 配合 |
| TouchOthersClose | Constant；对应身体标签 | 中心 -D/2·Z，胶囊 R=D/2.5、H=D；需要触摸区 | 目标进入对应触碰区时为 1 |
| TouchSelf | 近接；自身 Hand/Finger/Foot | 中心 -D·Z，球 R=D；需要触摸区 | 触碰强度，与 TouchSelfClose 配合 |
| TouchSelfClose | Constant；对应身体标签 | 中心 -D/2·Z，胶囊 R=D/2.5、H=D；需要触摸区 | 自身目标进入对应触碰区时为 1 |

D 来自作者 `length`：组件默认值为 0，启用触碰区后按 Avatar 视点高度的 5% 自动生成。填写正值时，勾选米制直接使用，否则乘对象世界 Z 缩放。有效触碰区会生成上表对应参数；尺度转换见后文。[组件默认值](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Runtime/Component/VRCFuryHapticSocket.cs#L31-L34)、[Socket 生成器](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L174-L273)、[D 的来源](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs#L303-L318)

`PenSelf` 是官方 OGB 消费端仍会读取的旧值，但上述现代生成器并未生成 Orf/PenSelf。使用这类历史来源时，按它实际发布的路径和作者几何校准。当前生成器支持的 Socket 叶子以表中清单为准。

## Plug：`OGB/Pen/<id>`

| 叶子参数 | 类型、检测对象 | Receiver 几何 | Sensa 自动解释 |
| --- | --- | --- | --- |
| FrotOthers | 近接；他人 Plug 包络标签 | 根中心，球 R=L | 贴近或擦过时的强度，结合 FrotOthersClose |
| FrotOthersClose | Constant；他人 Plug 包络标签 | 中心 L/2·Z，胶囊 R=W+0.08 m、H=L | 匹配目标进入有效接近区时为 1 |
| PenOthers | 近接；他人 Socket 根标签 | 根中心，球 R=L | 深浅趋势，OgbDepth 使用原值 |
| PenSelf | 近接；自身 Socket 根标签 | 根中心，球 R=L | 对应 Self 类别的深浅趋势 |
| TouchOthers | 近接；他人 Hand/Finger/Foot | 根中心，球 R=L+e | 触碰强度，结合 TouchOthersClose |
| TouchOthersClose | Constant；同上 | 中心 L/2·Z，胶囊 R=W+e、H=L+2e | 匹配目标进入触碰区时为 1 |
| TouchSelf | 近接；自身 Hand/Finger/Foot | 根中心，球 R=L+e | 触碰强度，结合 TouchSelfClose |
| TouchSelfClose | Constant；同上 | 中心 L/2·Z，胶囊 R=W+e、H=L+2e | 自身目标进入触碰区时为 1 |

Plug 的 TouchOthers 检测 Hand/Finger/Foot；Socket 的 TouchOthers 在这些身体标签外，还包括 Head。[Plug 生成器](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L175-L256)、[标签定义](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/HapticUtils.cs#L13-L35)

Plug 的深浅信号是 `PenOthers` 或 `PenSelf`，按原值和所需方向映射；Touch 与 Frot 分别使用表中的 Close 条件。

## Sender 才决定“对方”的大小

Sender 定义接收器看到的目标形状。常见生成对象如下：

| 生成对象 | Sender 形状、标签 | 用途 |
| --- | --- | --- |
| Plug Root | 根中心球 r=0.01 m；TPS_Pen_Root | SPS2 的 PenOthersNewRoot／PenSelfNewRoot |
| Plug Length | 根中心球 r=L；TPS_Pen_Penetrating | SPS2 的 NewTip 与 SPS1 的 PenOthers，均观测根中心长度球 |
| Plug WidthHelper | 根中心球 r=max(0.01 m,L-2W)；TPS_Pen_Width | 上游内部宽度辅助 |
| Plug Envelope | 中心 L/2·Z；胶囊 R=W、H=L；TPS_Pen_Close | Plug 摩擦／独立触摸区 |
| Socket Root | 根中心球 r=0.001 m；含 TPS_Orf_Root | Plug 的 PenSelf／PenOthers，以及 Socket FrotOthers |
| Socket Front | +0.01·Z，球 r=0.001 m；TPS_Orf_Norm 等 | 上游方向辅助 |

例如 Plug/PenOthers 在中心距约 L+0.001 m 时开始产生数值。SPS1 Socket 的 `PenOthers` 观测根中心的 Length 球 r=L（TPS_Pen_Penetrating）；SPS2 的 `PenOthersNewRoot` 观测 r=0.01 的根球，`PenOthersNewTip` 观测 r=L 的长度球。两球同心，因此数值主要随根中心距离变化。正对 Socket 靠近时，这种变化便于理解为进入深浅的趋势；侧移和倾斜时应结合图形及实际两端校准。[Plug Sender](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs#L60-L108)、[Socket Sender](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs#L37-L83)

## 其他真实参数与未支持范围

| 参数 | 实际含义 | Sensa 当前行为 |
| --- | --- | --- |
| OGB_ENABLED | Avatar 输入 bool；启用本地 Orf/Pen Haptics | 显式控制开关；固定目标发真值，5 秒心跳 |
| VFH/Version/10 | 当前生成器的能力标记路径 | 在参数列表中查看所支持的能力 |
| 旧 `OGB/Pen/<id>/Version/8`、`OGB/Orf/<id>/Version/9`、`VFH/Version/9` | 官方 OGB 仍识别的历史能力标记 | 用于识别历史来源能力 |
| `VFH/Zone/Touch/<id>/Self`、`VFH/Zone/Touch/<id>/Others` | 独立 SPS Touch Zone 近接 | OgbTouch 直接读取 0–1，不要求 Close |
| `TPS_Internal/Orf/<id>/Depth_In`、`TPS_Internal/Pen/<id>/RootRoot` | 官方 OGB 消费端的原生 TPS 分支 | 不属于 OgbDepth 自动路径；需明确直接映射 |
| 自定义 Angle／Depth／Trigger 等 | 含义由实际发送方定义 | 按发送方说明配置 Direct 等明确映射 |

独立 Touch Zone 是以作者对象为中心、半径为作者 `radius`（默认 0.1 局部单位）的球，`worldScale=false`，故实际半径随对象缩放。它接受身体标签及 Plug 包络，且没有 Orf/Pen 那组 Close 门控；它也没有注册上述 OGB_ENABLED 开关。官方 OGB 的 bridge 与 Sensa OgbTouch 都读取此命名空间；Sensa 按完整实例、来源和 Self／Others 分别读取该区域的强度。[Zone 生成器](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Feature/VRCFuryHapticTouchReceiverBuilder.cs#L21-L49)、[默认半径](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Runtime/Component/VRCFuryHapticTouchReceiver.cs#L4-L7)、[OGB 路径解析](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/bridge.ts#L39-L67)

Version 10 是上游生成器提供的能力标记。Sensa 结合路径识别来源支持的功能，动作强度读取实际 Pen、Touch 或 Frot 数值。[版本标记生成](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticVersionsService.cs#L16-L29)、[OGB 能力识别](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/main.ts#L108-L120)

## 世界尺度与 Socket 估算公式

`worldScale=true` 的生成请求会把位置向量、半径和高度统一除以**构建时**对象的 `worldScale.x`；`false` 则保留作者局部数值。D 的局部长度另乘 Z 缩放，非均匀缩放时需按实际生成结果检查尺寸。Plug／Socket 的 WorldSpace 还通过 ScaleConstraint 保持世界尺度；OGB Receiver 位于 OneSpace 下，实际世界半径还受运行时缩放影响。[Receiver 转换](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/HapticContactsService.cs#L49-L66)、[Sender 转换](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/HapticSenderFactory.cs#L24-L40)、[WorldSpace 约束](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Utils/ConstraintUtils.cs#L9-L25)

在两个 Receiver 同心、半径均为 R、实际 Plug 根球半径为 r，且观察区未饱和时：

```text
L ≈ R × (pTip - pRoot) + r
d ≈ R × (1 - pRoot) + r
径向比例 q = clamp(1 - d / L, 0, 1)
```

Sensa 采用生成器的 R=1、r=0.01 模型，得到 +0.01 修正。运行时缩放或自定义尺寸会使换算带有误差，因为实际 R／r 需要从作者几何确认。Root 饱和为 1 时表示 d≤r，该小范围内保持同一读数；映射时用实际对象的期望起点和终点校准。[估算器](https://github.com/SeaLoong/Sensa/blob/main/src/core/runtime/motion.ts)

只有完整、有限的 0–1 配对且存在未饱和估长采样时才产生后续径向比例；从内部启动、长度未知时给零，需要先退出再进入。横向偏移、不同 Plug 混入、截断和逐参数异步都会影响结果。固定同一对象与来源进行校准，有助于得到稳定、容易解释的变化。

## 专用 Contact 直接定位（SDK Beta）

Sensa 也支持 SDK 3.10.6-beta.3 与 Beta.2 的高级 Proximity 报告，读取原生 Sender 中点位置和接触点相对速度。Sensa 使用独立的 `Sensa/Contact/<id>/…` 实例，由唯一通道上的自身根点 Sender 和 Avatar 根 Receiver 组成。位置是物理米制 AvatarRootMeters，速度为 m/s；运动强弱可通过 VelocityX／Y／Z、Speed 或 ProximitySpeed 校准。SPS 四点定位保留 `Sensa/SPS/<id>/P0…P3+Sample`，已有 OGB 路径以及上文深度／触摸模型保留其发布语义。

构建自己的根点测量时可选择此方案，明确的 Sensa／原生 Contact 根点可独立于 VRCFury 使用。身体联动可用校准位置轴跟随细微深浅趋势，并以 Touch／Close 条件确认触碰。[Beta 设置、源码依据与字段语义](contact-sdk.md) · [字典](osc-parameters.md)

## Sensa 的精简入口与使用条件

深度选择一组 OgbDepth，触碰选择一组 OgbTouch。OgbDepth 优先读取 **SPS2 · PenOthersNewRoot / PenOthersNewTip** 配对；缺配对或尚未估长时输出零，两路缺失或均零时再使用同实例 **SPS1 · PenOthers / PenOthersClose** 的深浅信号。OgbTouch 按同来源、完整父路径和功能配对 Close，缺少必需 Close 给零；显式 Direct 可以读取原值。[消费端选择依据](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts#L63-L149)、[Sensa 地址解释](https://github.com/SeaLoong/Sensa/blob/main/src/core/runtime/resolver.ts)

现代 VRCFury 把生成实例名中的斜杠替换为下划线；Sensa 也支持保留自定义嵌套父路径。所有辅助值严格留在同一来源／实例／Self 或 Others 内。输入重新启用、更换 Avatar 或重建映射时重新估长；超时按当前选用的信号计算。

Orf/Pen Haptics 需作者启用构建选项，客户端开启 OSC，并收到 OGB_ENABLED。Sensa 的 `osc.ogbControl` 默认关闭；启用后只向明确配置的单播 IP／localhost 和 UDP 端口发送，不猜来包端口。在 OSC 或组合方式且监听运行时每 5 秒发 true，离开／停用／正常退出向旧目标尝试发 false。在参数列表中观察 Avatar 是否开始发布读数，随后保存映射并启用设备输入。[上游启用条件](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/OgbEnabledService.cs#L16-L41)、[官方心跳](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/OscConnection.ts#L21-L68)

推荐先看原始参数，再选深度或振动，并用实际对象校准。独立 Zone 通过同一个振动模板读取 `VFH/Zone/Touch/<完整id>/Self` 或 `.../Others`。完成后在实际客户端检查方向、响应与 Close 条件，再以小行程验证设备动作。

上游项目分别遵循各自许可。[OGB 许可](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/LICENSE)、[VRCFury 许可](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/LICENSE.md)仍分别适用。
