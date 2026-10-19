# OSC 参数字典

**简体中文** | [English](osc-parameters.en.md)

本页集中解释公开参数的含义、有效条件与测量边界。使用步骤见[指南](guide.md)，OGB 的逐项参数与生成器证据见[OGB 兼容说明](ogb-compatibility.md)，定位原理见[定位说明](positioning.md)。以下路径省略统一前缀 `/avatar/parameters/`；大小写有意义，`<id>` 是实例名。

## 先选择需要的信息

| 参数族 | 提供的信息 | 不能据此得出的信息 |
| --- | --- | --- |
| `OGB/Orf/<id>/…`、`OGB/Pen/<id>/…` | 外部 Socket／Plug 的近接、触摸、接近门控与径向比例估算 | 任意 XYZ、可靠插入深度、对方身份 |
| `VFH/Zone/Touch/<id>/Self`／`Others` | 独立触摸区的近接强度 | 根位置、插入深度 |
| `Sensa/SPS/<id>/P0…P3`、`Sample` | 专用小球根标记在 Avatar 根局部坐标中的估计位置 | 世界位置、姿态、最终 GPU 形变表面 |
| `Sensa/Shader/<id>/Frame`、`X`、`Y`、`Z`、`Valid` | 原生根点编码经桌面桥解码的 Avatar 根局部位置 | Contact 距离、最终 GPU 形变表面、设备回读 |
| `Sensa/Diagnostics/Shader/0/…` | Shader 图案、捕获与 OSC 传输诊断 | 可以映射到动作的有效根坐标 |

Sensa 自有 SPS 只有下文这一套契约：没有 `v1` 路径段，不兼容旧 A0–A3、八点共享阵列或旧 Profile／Scale／Valid／Heartbeat／Self／Others 结构。Unity 生产端与桌面必须一起更新。外部 OGB 路径与能力版本由上游定义，不随此精简改名。

## OGB 与 VRCFury 参数

Orf 表示 Socket，Pen 表示 Plug。`Self` 与 `Others` 是 Contact 过滤类别，不是玩家认证；Sensa 按 OSC 来源、完整实例父路径与类别配对，不拼接不同来源或实例。上游完整生成表、球／胶囊中心与半径、旧消费路径和 Sensa 支持范围均在[OGB 详表](ogb-compatibility.md)。

| 参数／路径 | 含义与 Sensa 处理 |
| --- | --- |
| Orf 的 `PenSelfNewRoot`／`PenOthersNewRoot` | Plug 根球在同心 Receiver 内的近接值；现代径向估算的一半 |
| Orf 的 `PenSelfNewTip`／`PenOthersNewTip` | 同一根中心的大球近接值，用于估算 Plug 长度；名字带 Tip，不是末端位置坐标 |
| Orf／Pen 的 `PenSelf`／`PenOthers` | 旧式单近接信号；现代配对缺失或均零时，OgbDepth 才考虑同实例回退。Orf 若同时发布 `PenOthersClose`，则以它门控；未发布时保留旧单值兼容 |
| `TouchSelf`／`TouchOthers` 与对应 `…Close` | Touch 是 0–1 近接值，Close 是 Constant 接近门控；OgbTouch 缺少必需 Close 时给零 |
| `FrotOthers` | 摩擦近接值；Pen 需要 `FrotOthersClose`，Orf 不需要 Close |
| `VFH/Zone/Touch/<完整id>/Self`／`Others` | 独立 Zone，OgbTouch 直接读取 0–1，不要求或猜测 Close |
| `VFH/Version/…`、历史 OGB Version 路径 | 上游能力标志，不是近接或位置；不会当作触摸强度 |
| `OGB_ENABLED` | Sensa 可显式启用的发送方向布尔心跳；固定目标默认关闭。在 OSC 模式且监听运行时每 5 秒发送 true，离开时尝试 false。它不启用设备输入 |

现代 VRCFury 不会生成上表所有旧式组合；例如不能凭命名规律构造 Pen NewRoot／NewTip 或 AngleX／Y／Z。OgbDepth 的现代模型采用 Receiver 半径 R=1、根球半径 r=0.01 的假设，得到径向比例，不直接测量轴向插入；作者几何、运行时缩放、不同 Sender 混入和饱和都会影响结果。Touch 的球／胶囊形状也不共享一个固定“触发半径”。[固定生成器源码](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs)、[官方 OGB 消费端](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts)

## Sensa SPS：四路近接与一个活动样本

生产端为明确选择的 Socket／Plug 根中心建立一个专用球形 Sender，四个球形 Receiver 固定在 Avatar 根坐标中，只接受自己的专用碰撞通道。每实例共五个 Contact。它测量 CPU Transform 根中心，不采样最终 SPS 形变网格。[生产端](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaFixedRootBuilder.cs)

### 五个公开测量参数

所有值均为 Float。一个 `<id>` 只占一层路径；实例名与专用碰撞通道须在 Avatar 内唯一。

| 完整路径 | 含义 | 有效范围 |
| --- | --- | --- |
| `Sensa/SPS/<id>/P0` | 锚点 P0 到根标记表面的近接值 | 有限且严格 `0.001 < p < 0.999` |
| `Sensa/SPS/<id>/P1` | 锚点 P1 的同类观测 | 同上 |
| `Sensa/SPS/<id>/P2` | 锚点 P2 的同类观测 | 同上 |
| `Sensa/SPS/<id>/P3` | 锚点 P3 的同类观测 | 同上 |
| `Sensa/SPS/<id>/Sample` | 合并“本实例当前有效／活动”的计数；不是坐标分量 | 0 表示失效；有效值仅 `n/32`，整数 n=1…32 |

FX 每个采样状态目标持续 0.05 秒：先复制 RawP0–RawP3 到 P0–P3，再写 Sample；Sample 从 1/32 到 1 循环，目标周期 1.6 秒。实际动画、Contact 更新和 OSC 传输可能延迟或丢失，不能据此宣称严格 20 Hz 或同帧原子快照。静止的 P 值允许缓存，Sample 必须变化。[共享常量](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs)、[接收检查](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedRootTracking.cs)

Sample 的寿命按**值最后变化时间 ChangedAt**计算，正常运行时**默认 1000 ms**。运行时使用正数 InputTimeoutMs 配置，否则回退为 1000 ms；解码器再将其上限限制为 1250 ms。因此配置更小会更严格，配置超过 1250 ms 也不会延长上限。重复发送同一个 Sample 只更新接收时间，不续期。缺少参数、Sample=0、非 n/32、冻结、超时或拟合失败均使坐标失效。[运行时寿命选择](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs#L76)

### 菜单控制不计入测量字段

每对象五个 Float 不代表整个 Avatar 只有五个参数。Automatic 的 Exclusive 策略还生成 `Sensa/Select/<group>`，类型 Int，默认 0=Off，1…N 按 Targets 顺序选择对象；Dedicated 没有该组选择器。这个控制项由 MA 注册为表达参数，`localOnly=true`、`saved=false`，不做网络同步或跨重载保存；它仍可能按 VRChat OSC 配置可见，不能把“本地”理解为“绝不发送 OSC”。[选择器实现](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaSelectionAnimator.cs)、[MA 参数规则](https://modular-avatar.nadena.dev/docs/reference/parameters)、[VRChat OSC 配置](https://docs.vrchat.com/docs/osc-avatar-parameters)

### 固定几何、距离公式与范围

所有坐标与半径均为 **Avatar 根局部单位**：中心 c=(0,1,0)，半跨度 h=0.5，Receiver 半径 R=2.5，标记半径 r=0.001。

| 锚点 | 局部坐标 |
| --- | --- |
| P0 | (-0.5, 0.5, -0.5) |
| P1 | (0.5, 0.5, 0.5) |
| P2 | (0.5, 1.5, -0.5) |
| P3 | (-0.5, 1.5, 0.5) |

球形 Sender 与 Receiver 的未饱和近接模型及反算为：

```text
p = clamp(1 - max(0, d - r) / R, 0, 1)
d = R × (1 - p) + r
```

d 是锚点中心到标记中心的距离；加 r 是因为 Proximity 描述靠近 Receiver 中心的 Sender 表面。四个已知非共面锚点的真实距离足以唯一确定这个局部 XYZ。实现还要求 RMS 距离残差≤0.01、坐标在 X/Z=[-1.5,1.5]、Y=[-0.5,2.5] 内；残差小只表示该模型自洽，不是精度或身份认证。[VRChat Contact 定义](https://creators.vrchat.com/common-components/contacts/)、[重建实现](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedAnchorReconstruction.cs)

可用空间是**四个球形覆盖区的交集**再扣除饱和区与边界，不是整个显示立方体。以 c 为中心、半径约 `2.5 - √3×0.5 ≈ 1.63` 的球给出保守共同覆盖尺度；实际有效区域仍受 p 阈值限制。上限 p<0.999 要求 d>0.0035，故每个锚点附近约 **0.0035 局部单位**（以局部米计为 3.5 mm）的区域被排除；下限 p>0.001 对应 d<2.4985。不能把这些局部长度直接当成任何 Avatar 的世界米数。

### 缩放、采样与菜单控制的边界

设作者 Avatar 根的均匀世界缩放为 s_author，VRChat 的缩放因子为 ScaleFactor，则 Receiver 世界半径为 `2.5 × s_author × ScaleFactor`。官方 Contact 半径上限为缩放后的 3 m；生产端预留 0.001 m，使用：

```text
maxScale = (3 - 0.001) / (2.5 × s_author)
```

超出门限时停用 Contact、清零公开采样并写 Sample=0；构建时拒绝不受支持的非均匀 Avatar 根缩放、根 ScaleConstraint 与根缩放动画。目标骨骼可以缩放，专用标记只跟随根中心，不把目标缩放带入已知球半径。s_author=1 且 ScaleFactor=1 时一个局部单位才等于一世界米。[门控实现](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaFixedRootBuilder.cs)、[VRChat 缩放后限制](https://creators.vrchat.com/common-components/contacts/)

RawP0–RawP3 仅供内部 FX 采样，不注册为公开 Expression 参数；ScaleFactor、IsLocal 是用于缩放和本地运行门控的内置参数。上文的 `Sensa/Select/<group>` 则是可按 OSC 配置导出的菜单控制项，不是 FX-only；其内部状态记忆与菜单参数承担不同角色。它们都不是额外的根位置测量字段。公开命名空间已固定几何与坐标框，Sample 同时承担失效和活动状态，因此不再另行导出 Profile、Scale、Valid、Heartbeat 或 Self／Others，也无需每帧重复这些元数据。内部 FX 名称不属于公开契约，但这不承诺客户端绝不会暴露它们。

专用通道与 AllowSelf 收窄了模型，仍不能证明每个 P 来自同一 Contact 帧，也不是抵御恶意相同标签的身份认证。共同刚体世界移动不会改变此局部坐标；网络中的其他 Avatar 和 GPU 表面不属于这个测量契约。

## Shader：直接根坐标与传输活性

原生 Avatar 组件把所选 CPU 根中心编码成图案，桌面桥只解码用户明确选择的区域及 Producer ID，再发 OSC。**它不使用 Contact，没有触发半径**；其范围是编码立方体 X/Z=[-1.5,1.5]、Y=[-0.5,2.5]，同样采用 Avatar 根局部坐标。[编码器](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaRootTelemetry.shader.txt)、[桥实现](https://github.com/SeaLoong/Sensa/blob/main/scripts/shader-osc-bridge.py)

### 五个公开测量参数

`<id>` 为明确选定的 Producer ID，十进制 1…65535，无前导零，例如 `Sensa/Shader/7/X`。这五个测量字段由桌面桥以 OSC Float 发送，不是 Avatar 内声明的五个 Expression 参数。

Shader 菜单另有 `Sensa/Select/ShaderCapture_<ID>`：Int，默认 0=Off，1=开启原生捕获 rig。例如 `Sensa/Select/ShaderCapture_42`。它同样是 MA 注册的表达参数，`localOnly=true`、`saved=false`，可能按 OSC 配置可见。内部 `Sensa/Internal/ShaderCapture_<ID>/Selected` 是 FX 的 Int 状态记忆，默认 0、由本地 Driver 写入 0／1，不注册为表达参数。[生成入口](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaShaderCaptureBuilder.cs)、[选择状态机](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaSelectionAnimator.cs)

| 叶子 | 含义与有效条件 |
| --- | --- |
| `Frame` | 0…65535 的整数，名义按 60 Hz 时间步生成并按 16 位回绕；约 18.2 分钟绕回一次 |
| `X` | 根中心局部 X，有限且位于 [-1.5,1.5] |
| `Y` | 根中心局部 Y，有限且位于 [-0.5,2.5] |
| `Z` | 根中心局部 Z，有限且位于 [-1.5,1.5] |
| `Valid` | 1 提交本次有效包；0 使根坐标立即失效 |

有效包按 **Frame → X → Y → Z → Valid=1** 的顺序发送，Valid 最后提交。失效只发 Valid=0，不重发旧 XYZ。桌面要求同一 OSC 来源、同一完整 Producer 路径下五字段连续接收；别的来源不会打断本来源的序列，插入本来源的其他消息则不能冒充完整坐标包。Frame 的 ChangedAt 寿命最多 500 ms，并与更短的正数配置超时取较小值；相同 Frame 持续重发也会过期。[桌面接收器](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/ShaderRootTracking.cs)

桥先检查图案、二进制 ID／标志、CRC 和模 65536 的向前帧序；反向／大幅跳序、同 Frame 不同 XYZ、身份变化或冻结会失效。启动或失效后需要重新建立两帧向前采样才恢复；默认桥冻结门限 350 ms。回绕可以正常向前推进，生产端重置为旧序列可能需要显式重启桥。连续字段与 CRC 是传输检查，不证明 UDP 事务原子性、真实用户身份或测量精度。

### 量化、精简字段与必要的二进制元数据

每轴长度 3 的区间使用 16 位无符号量化，步长 `3/65535 ≈ 4.58×10⁻⁵` 局部单位；理想舍入的单轴半步约 `2.29×10⁻⁵`，三轴合成量化误差上限约 `3.96×10⁻⁵`。这些只是编码量化界，**不是实际定位精度承诺**；蒙皮／坐标框计算、渲染合成、捕获与帧延迟仍需单独验收。

OSC 中不再重复 Producer 或 Profile：Producer 已在路径中，`Sensa/Shader` 已固定 AvatarRootLocal 与范围。二进制图案仍保留 Producer ID、有效／原生坐标标志、CRC 与 Frame，以便在解释路径前区分来源、拒绝损坏和冻结；二进制编码标记也不是 OSC 路径版本。ID 只是显式配对值，不是 Avatar 所有者认证。没有额外 PositionXYZ 参数，也没有默认滤波或独立“检测半径”选项。

## 诊断、点、姿态与设备的区别

`Sensa/Diagnostics/Shader/0/Frame|X|Y|Z|Valid` 使用相同的五字段传输形式，但来自诊断编码，XYZ 为 [-1,1] 的诊断归一化值。ID=0 不属于原生 Producer；此命名空间**不产生可映射的根坐标，不参与自动空间映射**。显式 Direct 虽能读取原始标量，也不会赋予它位置语义。Valid=1 仅说明诊断链当前可传输，不会把合成图案升级成真实 Avatar 根位置。[诊断分流](https://github.com/SeaLoong/Sensa/blob/main/scripts/shader-osc-bridge.py)

| 概念 | 所需信息与边界 |
| --- | --- |
| 一个点／根中心 | 三个坐标；SPS 与 Shader 本页方案都只提供这一项 |
| 姿态／方向 | 需要额外独立方向或多个有几何意义的点；单根 XYZ 不能给出旋转 |
| 世界位置 | 还需要可信世界参考及其变换；AvatarRootLocal 不包含共同世界平移／旋转 |
| 最终 GPU 表面 | 需要对具体形变算法与目标表面采样；本页根点捕获没有实现该能力 |
| 设备位置或强度 | 本页值只能经显式映射形成动作目标，不能替代设备传感器回读 |

独立的 Point／Handle／Pose 实验输入不与以上命名空间互换，也不能用其同名点自动补齐 SPS。空间动作仍需用户明确允许实验空间输入、选择相应来源与映射、启用当前输入；看到参数不等于允许设备动作。完整运行条件与未验证的真实客户端／多 Avatar／GPU／硬件边界见[定位说明](positioning.md)与[Shader 研究记录](shader-capture-research.md)。
