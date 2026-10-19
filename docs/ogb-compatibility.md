# OGB 参数、检测几何与 Sensa 支持范围

**简体中文** | [English](ogb-compatibility.en.md)

OGB 是应用及一组外部触觉参数约定，SPS 是 Avatar 形变／交互系统，两者不是同一个位置协议。本页解释官方生成器实际产生的参数、消费者怎样使用它们，以及 Sensa 的处理范围。**OGB 的外部路径不会随 Sensa 自有点名 P0–P3、去除路径版本段而改名**；Sensa 自有方案见[定位说明](positioning.md)。

研究固定到 VRCFury `6bd33f4cb453df816c943a335e47f64e6a37e188`、OGB v2.1.30 `643aedd493ba21b0c0859ce6e57708fe408ee9c0`，并核对 OGB v1.0.0 `262164576721f12958409638851808aa662b87c7`。旧 OGB v1.0.0 已同时读取 Root／Tip 和旧单近接值；“旧版只有一个 trigger”不是可靠的版本划分。[旧消费端](https://github.com/OscToys/OscGoesBrrr/blob/262164576721f12958409638851808aa662b87c7/src/main/GameDevice.ts#L68-L151)

## 先理解半径与数值

以下路径省略 `/avatar/parameters/`。Orf 是 Socket，Pen 是 Plug；原点为各自根中心，+Z 为作者的前向。Self／Others 选择本 Avatar 或其他 Avatar，不代表某一个人的身份。

| 符号 | 本页含义 |
| --- | --- |
| L | Plug 生成时的世界长度 |
| W | Plug 生成时的世界半径 |
| e | `min(W, 0.08 m)`，Plug 手触扩展 |
| D | Socket 手触区域深度；不是对方 Plug 长度 |
| R、r | 实际 Receiver、球形 Sender 的半径 |
| H | 胶囊的完整高度，包含两端半球 |

Proximity 是连续 0–1 浮点值；Constant 给出接触存在时的 1、离开时的 0，不能把两者都叫“进入一次的触发器”。VRChat 每个 Receiver 独立选择最近的匹配 Sender；球形接收器按 Sender 最近表面到自身中心计算接近程度。球对球模型为：

```text
p = clamp(1 - max(0, |senderCenter - receiverCenter| - r) / R, 0, 1)
开始接触的中心距 ≈ R + r；Sender 包含接收器中心时饱和为 1。
```

因此“Receiver 半径 10 cm”不表示对方中心距恰好 10 cm 才触发；Sender 自己也有大小。胶囊／身体 Sender 应使用最近表面距离，不能套成另一个根球。VRChat 限制缩放后的半径不超过 3 m、宽高深不超过 6 m。[官方 Contacts 行为](https://creators.vrchat.com/common-components/contacts/)

## Socket：`OGB/Orf/<id>`

现代 VRCFury 在启用 OGB Haptics、非 SpsForAll 自动补充目标时生成这组参数。手触区域关闭时，表中标记“需要触摸区”的参数不会生成；现代四个 Root／Tip 不依赖此选项。

| 叶子参数 | 类型、检测对象 | Receiver 几何 | Sensa 自动解释 |
| --- | --- | --- | --- |
| PenSelfNewRoot / PenOthersNewRoot | 近接；对应方 Plug 根 Sender | 根中心，球 R=1 m | OgbDepth 的现代配对 |
| PenSelfNewTip / PenOthersNewTip | 近接；对应方 Plug 长度 Sender | 根中心，球 R=1 m | 配对辅助值，不单独映射 |
| TouchSelf | 近接；自身 Hand/Finger/Foot | 中心 -D·Z，球 R=D；需要触摸区 | OgbTouch，并要求 TouchSelfClose |
| TouchOthers | 近接；他人 Head/Hand/Foot/Finger | 同上 | OgbTouch，并要求 TouchOthersClose |
| TouchSelfClose / TouchOthersClose | Constant；对应身体标签 | 中心 -D/2·Z，胶囊 R=D/2.5、H=D；需要触摸区 | 对应手触门控 |
| PenOthers | 近接；TPS_Pen_Penetrating | 中心 -D·Z，球 R=D；需要触摸区 | OgbDepth 的旧信号回退 |
| PenOthersClose | Constant；同一 Plug 标签 | 中心 -D/2·Z，胶囊 R=D/2.5、H=D；需要触摸区 | 存在时约束旧 PenOthers |
| FrotOthers | 近接；他人 Socket 根标签 | 中心 +0.05·Z，球 R=0.1 m；需要触摸区 | OgbTouch 直接读取 |

D 来自作者 `length`：勾选米制时直接使用，否则乘对象世界 Z 缩放；未给正值时尝试使用 Avatar 视点高度的 5%。不能取得有效触摸区时不生成该区。上表是生成请求值，尺度转换见后文。[Socket 生成器](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L174-L273)、[D 的来源](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs#L303-L318)

`PenSelf` 是官方 OGB 消费端仍会读取的旧值，但上述现代生成器并未生成 Orf/PenSelf。其旧作者几何不应从 PenOthers 的当前实现推定。现代 Orf 没有 PenSelfClose、FrotOthersClose，亦没有标准 Angle／AngleX／AngleY／AngleZ 参数。

## Plug：`OGB/Pen/<id>`

| 叶子参数 | 类型、检测对象 | Receiver 几何 | Sensa 自动解释 |
| --- | --- | --- | --- |
| PenSelf / PenOthers | 近接；对应方 Socket 根标签 | 根中心，球 R=L | OgbDepth 原值，不默认反向 |
| TouchSelf / TouchOthers | 近接；对应方 Hand/Finger/Foot | 根中心，球 R=L+e | OgbTouch，需要对应 Close |
| TouchSelfClose / TouchOthersClose | Constant；同上 | 中心 L/2·Z，胶囊 R=W+e、H=L+2e | 手触门控 |
| FrotOthers | 近接；他人 Plug 包络标签 | 根中心，球 R=L | OgbTouch，需要 FrotOthersClose |
| FrotOthersClose | Constant；他人 Plug 包络标签 | 中心 L/2·Z，胶囊 R=W+0.08 m、H=L | 摩擦门控 |

Plug 的 TouchOthers 沿用这段生成器中的 SelfContacts 标签集合，不能假定与 Socket 的 BodyContacts 完全相同。上游标签集合分别是 Hand/Finger/Foot 与另加 Head 的集合。[Plug 生成器](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L175-L256)、[标签定义](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/HapticUtils.cs#L13-L35)

此组没有 PenSelfNewRoot／NewTip、PenOthersNewRoot／NewTip 或 PenSelfClose／PenOthersClose。不能把 Socket 叶子自动套到 Plug。

## Sender 才决定“对方”的大小

这些是检测体，不是额外的 OSC 位置输出：

| 生成对象 | Sender 形状、标签 | 用途 |
| --- | --- | --- |
| Plug Root | 根中心球 r=0.01 m；TPS_Pen_Root | 现代 Socket NewRoot |
| Plug Length | 根中心球 r=L；TPS_Pen_Penetrating | 现代 NewTip／旧 PenOthers；**不是尖端点** |
| Plug WidthHelper | 根中心球 r=max(0.01 m,L-2W)；TPS_Pen_Width | 上游内部宽度辅助，不由 OGB 深度映射直接读取 |
| Plug Envelope | 中心 L/2·Z；胶囊 R=W、H=L；TPS_Pen_Close | Plug 摩擦／独立触摸区 |
| Socket Root | 根中心球 r=0.001 m；含 TPS_Orf_Root | Plug 的 PenSelf／PenOthers，以及 Socket FrotOthers |
| Socket Front | +0.01·Z，球 r=0.001 m；TPS_Orf_Norm 等 | 上游方向辅助；没有对应 OGB Angle 输出 |

例如 Plug/PenOthers 的非零接触中心距约为 L+0.001 m，而非严格 L。现代 NewRoot 与 NewTip 所观测的两个球同心，旋转轴线不改变球心距离；单靠它们不能确定角度、尖端或扭转。[Plug Sender](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs#L60-L108)、[Socket Sender](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs#L37-L83)

## 其他真实参数与未支持范围

| 参数 | 实际含义 | Sensa 当前行为 |
| --- | --- | --- |
| OGB_ENABLED | Avatar 输入 bool；启用本地 Orf/Pen Haptics | 显式控制开关；固定目标发真值，5 秒心跳 |
| VFH/Version/10 | 当前生成器的能力标记路径；不是距离 | 可浏览，不驱动轴 |
| 旧 `OGB/Pen/<id>/Version/8`、`OGB/Orf/<id>/Version/9`、`VFH/Version/9` | 官方 OGB 仍识别的历史能力标记 | 不用来猜几何或启用输出 |
| `VFH/Zone/Touch/<id>/Self`、`VFH/Zone/Touch/<id>/Others` | 独立 SPS Touch Zone 近接 | OgbTouch 直接读取 0–1，不要求 Close |
| `TPS_Internal/Orf/<id>/Depth_In`、`TPS_Internal/Pen/<id>/RootRoot` | 官方 OGB 消费端的原生 TPS 分支 | 不属于 OgbDepth 自动路径；需明确直接映射 |
| 自定义 Angle／Depth／Trigger 等 | 名字本身不证明类型、方向或单位 | 不生成别名，不宣称为官方标准参数 |

独立 Touch Zone 是以作者对象为中心、半径为作者 `radius`（默认 0.1 局部单位）的球，`worldScale=false`，故实际半径随对象缩放。它接受身体标签及 Plug 包络，且没有 Orf/Pen 那组 Close 门控；它也没有注册上述 OGB_ENABLED 开关。官方 OGB 的 bridge 与 Sensa OgbTouch 都读取此命名空间；Sensa 仍按完整实例、来源和 Self／Others 隔离，不给它附加不存在的 Close。[Zone 生成器](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Feature/VRCFuryHapticTouchReceiverBuilder.cs#L21-L49)、[默认半径](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Runtime/Component/VRCFuryHapticTouchReceiver.cs#L4-L7)、[OGB 路径解析](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/bridge.ts#L39-L67)

Version 10 是生成器源码中的常量，不是本文建议新增的协议版本。能力检测看参数路径与真实数据，不把标记的 bool 当前值当近接强度。[版本标记生成](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticVersionsService.cs#L16-L29)、[OGB 能力识别](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/main.ts#L108-L120)

## 世界尺度与 Socket 估算公式

`worldScale=true` 的生成请求会把位置向量、半径和高度统一除以**构建时**对象的 `worldScale.x`；`false` 则保留作者局部数值。D 的局部长度另乘 Z 缩放，不能把这些单轴换算当作非均匀缩放下的通用正确性保证。Plug／Socket 的 WorldSpace 还通过 ScaleConstraint 保持世界尺度；OGB Receiver 位于 OneSpace 下，不能仅凭选项名承诺所有运行时缩放后仍是 1 m。[Receiver 转换](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/HapticContactsService.cs#L49-L66)、[Sender 转换](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/HapticSenderFactory.cs#L24-L40)、[WorldSpace 约束](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Utils/ConstraintUtils.cs#L9-L25)

在两个 Receiver 同心、半径均为 R、实际 Plug 根球半径为 r，且观察区未饱和时：

```text
L ≈ R × (pTip - pRoot) + r
d ≈ R × (1 - pRoot) + r
径向比例 q = clamp(1 - d / L, 0, 1)
```

Sensa 当前估算器采用 R=1、r=0.01，故公式简化为此前的 +0.01 修正。这是对已知生成器几何的模型假设，不是读取了实际米制长度。接收半径或根球尺寸因运行时缩放／自定义作者而变化时，该修正不再精确；OGB 这组通道没有携带实际 R／r 元数据。Root 饱和为 1 只说明 d≤r，不能恢复最后这段距离，因此默认径向结果也不保证恰好到 1，仍应校准实际对象。[估算器](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SpsDepthEstimator.cs)

只有完整、有限的 0–1 配对且存在未饱和估长采样时才产生后续径向比例；从内部启动、长度未知时给零，需要先退出再进入。横向偏移、不同 Plug 混入、截断和逐参数异步都会影响结果。OSC 来源键不是 Contact Sender 身份，低残差或参数变动也不等于同帧。

## Sensa 的精简入口与使用条件

深度只需一组 OgbDepth，触摸只需一组 OgbTouch；不为每个叶子创建单独预设。现代通道有正值时优先使用现代配对，缺配对／未知长度时给零；现代缺失或均零时才回退同实例旧 PenSelf／PenOthers。OgbTouch 按同来源、完整父路径和功能配对 Close，缺少必需 Close 给零；显式 Direct 可以读取原值。[消费端选择依据](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts#L63-L149)、[Sensa 地址解释](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/OgbDepthAddress.cs)

现代 VRCFury 把生成实例名中的斜杠替换为下划线；Sensa 虽能保留自定义嵌套父路径，也不把这种扩展称为官方默认。所有辅助值严格留在同一来源／实例／Self 或 Others 内。输入重新启用、更换 Avatar 或重建映射时重新估长；超时使用被选信号，不让被抑制的旧值或 Close 单独续期。

Orf/Pen Haptics 需作者启用构建选项，客户端开启 OSC，并收到 OGB_ENABLED。Sensa 的 `osc.ogbControl` 默认关闭；启用后只向明确配置的单播 IP／localhost 和 UDP 端口发送，不猜来包端口。在 OSC 模式且监听运行时每 5 秒发 true，离开／停用／正常退出向旧目标尝试发 false。它独立于设备输入许可；UDP 发送成功不代表 Avatar 已应答。[上游启用条件](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/OgbEnabledService.cs#L16-L41)、[官方心跳](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/OscConnection.ts#L21-L68)

推荐先看原始参数，再选深度或振动并校准实际对象；不要添加没有来源证据的 Angle／位置叶子。独立 Zone 已补入原有触摸预设，没有增加预设数量；只有明确的 `VFH/Zone/Touch/<完整id>/Self` 或 `.../Others` 被解析，Version 和任意 VFH 路径不会混成触摸。本文的源码核对与项目契约不替代真实 Avatar 上传、运行时缩放、多 Avatar、GPU／头显或硬件验收。

本页只解释互通，不捆绑或修改上游源码。[OGB 许可](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/LICENSE)、[VRCFury 许可](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/LICENSE.md)仍分别适用。
