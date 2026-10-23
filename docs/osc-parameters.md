# OSC 参数字典

**简体中文** | [English](osc-parameters.en.md)

先看参数描述的是位置、接近程度还是运动强弱，再用希望的动作起点和终点校准映射。本页说明各字段的含义、单位、变化方向和常见联动用途；接入步骤见[使用方案](usage-scenarios.md)与[工作台指南](guide.md)。下文省略 `/avatar/parameters/`，路径区分大小写，`<id>` 使用实际实例名。

## 用图解理解数值

[公开参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)按浏览器语言打开，手动切换后在当前标签页记住选择。分享时直接复制页面地址即可。应用参数详情可打开随包页面；保留相邻 assets，即可离线打开 `docs/parameter-geometry.html`。

先选择参数，再拖动橙色目标，观察靠近、进入、接触区域时读数怎样变化。十一个场景都有 3D、平面投影和精确滑条。蓝色表示接收范围，橙色表示目标信号的形状，灰色外形帮助理解 Socket／Plug 的相对位置；橙色操作柄放大显示，方便拖动。SPS 四点定位的四个颜色关联测量球、标签和参数行。

页面下方的[“OSC 参数含义与来源”](parameter-geometry.html#parameter-reference)列出当前参数组的说明。展开实际参数名，可查看它测量什么、范围与单位、怎样用于联动，以及对应的官方或项目来源。工作台中打开 **OSC → 参数**，点击参数名称，也可在“参数含义”中阅读这些解释；先确认完整路径，再添加映射草稿。

图解按完整 XYZ 计算距离。XZ 视图将空间投到一个平面，SPS 四点定位的绿色部分另标出当前 Y 高度的可测切片。“可用值”体现 Close 或有效性条件，通过这些条件的数值可作为建立映射时的参考。实际联动按[工作台指南](guide.md)配置。

参数按名称字典序显示，同一前缀的短名称在前，例如 `PenOthers` 在 `PenOthersClose` 之前。前缀中的 `*` 代表实例名：`Sensa/SPS/Example/P0` 的完整地址为 `/avatar/parameters/Sensa/SPS/Example/P0`。Shader ID 使用下文规定的十进制数。

Three.js／[OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)随资源打包；[WebGL2](https://threejs.org/docs/pages/WebGLRenderer.html)不可用时切换 SVG。MIT 声明位于 `assets/parameter-geometry-3d.LICENSE.txt`。[图解操作](guide.md)

## 说明来自哪里

“测量定义”说明参数怎样产生，“联动用法”帮助选择映射。页面按以下来源标注，官方说明采用便于理解的译述：

| 来源 | 负责说明什么 | 参考资料 |
| --- | --- | --- |
| VRChat 官方 | Contact 的检测方式、SDK 原生坐标／速度报告和 Raycast 命中／距离 | [Contacts 官方说明](https://creators.vrchat.com/common-components/contacts/)、[官方 SDK Beta.3](https://github.com/vrchat/packages/releases/tag/3.10.6-beta.3)、[Raycast 参数说明](https://creators.vrchat.com/avatars/avatar-components/raycast/#raycast-parameters) |
| VRCFury／OGB 实现 | `PenOthers`、`NewRoot`、`NewTip`、`Touch`、`Frot` 和 `Close` 的生成名称、检测形状与配对方式 | [固定 Socket 生成器](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L174-L273)、[固定 Plug 生成器](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L175-L256)、[OGB 互通详解](ogb-compatibility.md) |
| Sensa 协议与应用解释 | 四点解算、`Sample`／`Radius`、Shader 的 `Frame`／`Valid`，以及如何把读数变成动作目标 | [定位与单位](positioning.md)、[Contact 方案](contact-sdk.md)、[计算信号](computed-signals.md) |

通用 Contacts 文档解释检测规则；本页高级 Proximity 字段的具体后缀、坐标框和速度语义来自上表官方 Beta 安装包实现，[Contact 说明](contact-sdk.md)保留了对应方法和包摘要，方便复核。

## 先选择需要的信息

| 参数族 | 提供的信息 | 常见用途 |
| --- | --- | --- |
| `OGB/Orf/<id>/…`、`OGB/Pen/<id>/…` | Socket／Plug 的进入深浅趋势、触碰强度和接近状态 | 深度或振动联动 |
| `VFH/Zone/Touch/<id>/Others`／`Self` | 选定触摸区域的接近强度 | 区域触碰联动 |
| `Sensa/<id>/Aux<index>/<role>_…` | Raycast 是否命中、归一化距离与米制距离 | 命中条件、表面距离联动 |
| `Sensa/Contact/<id>/Proximity…`、`Radius`、`Sample` | 所选根点的米制位置与 m/s 相对速度 | 校准后的局部动作或运动强弱 |
| `Sensa/SPS/<id>/P0…P3`、`Sample` | 选定根点相对 Avatar 的三维位置 | 按左右、上下、前后移动控制动作 |
| `Sensa/Shader/<id>/…` | 从屏幕图块解码的位置、X/Z 轴向与 Avatar 世界缩放 | 空间映射、方向计算与米制换算 |
| `Sensa/Diagnostics/Shader/0/…` | 图案、捕获与 OSC 传输诊断 | 检查捕获链路 |

SPS 四点定位的 Unity 测量组件与桌面共享下文的五字段和固定几何。外部 OGB 参数由 Avatar 使用的生成器提供，可在参数列表中核对完整路径。

需要组合多个参数时，可在工作台建立[计算信号](computed-signals.md)，进行加权平均、差值、比例或向量长度计算，再映射到目标轴。定位计算直接选择已经解算的坐标或速度指标；每个输入保留来源和有效性条件。

## OGB 与 VRCFury 参数

`Orf` 表示 Socket，`Pen` 表示 Plug。`Self` 表示检测自身的匹配目标，`Others` 表示检测其他 Avatar 的匹配目标。Sensa 按 OSC 来源、完整实例路径与类别配对。图解中的 **SPS2 · PenOthersNewRoot / PenOthersNewTip** 和 **SPS1 · PenOthers / PenOthersClose** 对应两种参数几何。

| 参数／路径 | 怎样理解读数 | Sensa 的处理 |
| --- | --- | --- |
| `FrotOthers` | 两个匹配外形靠近、贴合或擦过时的接近强度 | Plug 与 `FrotOthersClose` 配合；Socket 直接使用该值 |
| `FrotOthersClose` | Plug 周围是否有匹配目标进入有效接近区，0 为离开、1 为接近 | 为 Plug 的 Frot 提供附加条件 |
| Orf／Pen 的 `PenOthers`／`PenSelf` | 连续 0–1 接近值。Socket 的 SPS1 参数可理解为进入深浅趋势；Plug 参数随 Socket 入口靠近其根部而变化 | 以希望的浅端、深端校准；Socket 在 SPS2 配对缺失或两值均零时使用，Plug 直接读取 |
| Orf 的 `PenOthersClose` | 匹配目标是否进入 Socket 周围的有效接近区，0 为离开、1 为接近 | 发布该值时，以它作为 SPS1 深度的接近条件；单值来源按自身路径读取 |
| Orf 的 `PenOthersNewRoot`／`PenSelfNewRoot` | SPS2 中 Plug 根部小球到 Socket 接收器的接近值，范围 0–1 | 与同实例 `NewTip` 配对，参与长度估计和深度换算 |
| Orf 的 `PenOthersNewTip`／`PenSelfNewTip` | SPS2 中以 Plug 根部为球心、半径为 Plug 长度的球体所产生的接近值，范围 0–1 | 两路未饱和样本用于估长，再换算进入深浅的趋势 |
| `TouchOthers`／`TouchSelf` | 身体或匹配目标靠近触碰区域时的连续强度，范围 0–1 | 与对应 `Touch…Close` 配合使用 |
| `TouchOthersClose`／`TouchSelfClose` | 匹配目标是否进入相应触碰区域，0 为离开、1 为接近 | Close 为 1 时采用 Touch 强度，为 0 时输出零 |
| `VFH/Zone/Touch/<完整id>/Others`／`Self` | 指定区域内的连续接近强度，越靠近区域中心通常越大 | OgbTouch 直接读取 0–1 |
| `VFH/Version/…`、历史 OGB Version 路径 | 上游支持能力的标志 | 用于识别参数能力 |
| `OGB_ENABLED` | 向 Avatar 表示接收服务正在工作 | 按配置目标每 5 秒发送 true，停用时尝试 false；默认关闭 |

深度相关数值按检测形状之间的距离变化。正对 Socket 的移动最容易与进入深浅对应；横移、倾斜和作者设置的尺寸也会改变读数，因此映射时应以自己希望的起点和终点校准。`Close=1` 表示匹配目标进入该 Contact 定义的有效区域，适合作为动作生效条件；身体外形与区域边界的关系由作者的形状设置决定。SPS2 的 OgbDepth 使用 Receiver 半径 R=1、根球半径 r=0.01 的模型；图解可以帮助观察两路数值如何配合。

实际参数名以 Avatar 发布内容为准。完整生成表、形状和尺寸见[OGB 详表](ogb-compatibility.md)，依据[固定生成器源码](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs)与[官方 OGB 消费端](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts)。

## Raycast 补充信号：命中与距离

在 `SensaComponent` 的补充信号中选择 Raycast，可从指定原点沿其本地 **+Z** 方向测量表面距离。原点留空时使用组件所在对象；最大量程按米配置，支持正数至 1000。此功能需要 **VRChat SDK 3.10.3+**，Sensa 显式关闭 `ApplyTransformScale`，因此量程保持米制。

参数前缀为 `Sensa/<id>/Aux<index>/<role>`：`<index>` 是从 0 开始的补充信号序号，`<role>` 为 Inspector 中选择的角色标识，例如 `Vibrate` 或 `GateEnable`。角色用于区分参数名，桌面映射中再选择需要的控制用途。以实例 `Body` 的第一个 `Vibrate` 信号为例：

| 路径 | 类型与含义 | 怎样使用 |
| --- | --- | --- |
| `Sensa/Body/Aux0/Vibrate_Distance` | Float；原点至命中点的世界距离，米 | 按所需实际距离校准动作范围 |
| `Sensa/Body/Aux0/Vibrate_Hit` | Bool；true 表示当前射线命中 | 作为 `GateEnable` 条件，只在命中时采用距离 |
| `Sensa/Body/Aux0/Vibrate_Ratio` | Float；命中距离在 0 到最大量程内的归一化值，0–1 | 0 对应原点，1 对应量程末端；可按需要反向映射接近强度 |

量程为 0.3 m、命中距离为 0.1 m 时，`_Distance` 约为 0.1，`_Ratio` 约为 1/3。先用 `_Hit` 确认命中，再读取距离：当前生成组件采用 SDK 默认的 `DoNothing` 未命中行为，未命中时 `_Hit=false`，两路距离保留最近的命中值，首次命中前为 0。

三字段对应官方 SDK 的原生 `VRCRaycast` 报告；[官方 Raycast 参数说明](https://creators.vrchat.com/avatars/avatar-components/raycast/#raycast-parameters)解释了命中、距离比例和世界距离，以及未命中行为的选择。Sensa 将它们声明为本地、不同步的表达参数，并在 FX 中声明匹配类型。已核对最低支持版本 3.10.3 的 API 与参数绑定。[Unity 配置](../unity/top.sealoong.sensa/AUTOMATION.md) · [官方 SDK 3.10.3 安装包](https://github.com/vrchat/packages/releases/download/3.10.3/com.vrchat.avatars-3.10.3.zip)

## Contact 直接定位（SDK Beta）：十二个公开字段

为所选自身根点使用专用球形 Sender，在 Avatar 根设置零偏移、各轴对齐的 Proximity Receiver。Receiver 使用独立碰撞通道且只接收 Self。Sensa 在 SDK **3.10.6-beta.3** 开启 `advancedParameters=true`，在 Beta.2 开启 `advancedProximityParameters=true`。坐标框为 **AvatarRootMeters**：以 Avatar 根为原点，坐标轴随根旋转，保留物理米单位。[设置与 SDK 核验依据](contact-sdk.md)

SDK Beta.3 的高级报告可用于任意 Receiver 类型，并新增 `_SenderLossyScaleX/Y/Z`（Sender 关联 Transform 的世界缩放）与 `_PointSeparation`（Sender 和 Receiver 最近内部点之间的世界距离，米）。它们描述原生 Contact 形状；Sensa 的 `Distance` 根据根点 XYZ 计算距 Avatar 原点的距离。Sensa 当前生成以下十二个公开字段，位置／速度解算和预设使用这套协议。使用额外原生报告时，由作者在 Animator 中声明对应 Float 并配置 OSC 可见性。[官方发布说明](https://vrc-beta-docs.netlify.app/releases/release-3-10-6) · [额外报告的读法与默认值](contact-sdk.md#sdk-beta3-的额外报告)

全部路径以 `Sensa/Contact/<id>/` 开头，`<id>` 只占一层路径。下表按字典序排列，共享前缀的短名称在前。`Proximity_SenderType` 为 Int，其余十一个字段为 Float。

| 叶子 | 它告诉你什么 | 怎样用于联动 |
| --- | --- | --- |
| `Proximity` | 所选目标的接近程度，0–1；目标信号形状越靠近 Receiver 中心，读数通常越大 | 查看目标是否进入检测范围；Sensa 根点测量使用正值 |
| `Proximity_ProximitySpeed` | 接近值每秒增减多少；正值表示读数增大，负值表示读数减小，单位为接近值／秒 | 区分靠近与退出的变化强弱，按所需方向校准；退出时可出现短暂读数 |
| `Proximity_SenderLocalPositionX` | Sender 形状中点相对 Receiver 形状中点的 X 位移，米 | 在 Sensa 的 Avatar 根参考下，单独用左右位移控制一个轴；正负值保留方向 |
| `Proximity_SenderLocalPositionY` | 同一位置的 Y 分量，米 | 用上下位移控制动作，按需要的低端与高端校准 |
| `Proximity_SenderLocalPositionZ` | 同一位置的 Z 分量，米 | 用前后位移或进入程度控制动作，按需要的浅端与深端校准 |
| `Proximity_SenderType` | SDK 当前选中的目标类别：0 无，1 自身 Avatar，2 其他 Avatar，3 世界 Sender | 确认参数来自哪类目标；Sensa 专用根点方案使用 1 |
| `Proximity_SenderVelocityMagnitude` | 近似接触点处的相对速率，m/s，始终 ≥0；静止时可为 0 | 将动作快慢映射为振动或其他强度，零速对应校准后的静止水平 |
| `Proximity_SenderVelocityX` | Receiver X 轴方向的相对接触点速度，m/s，含角运动影响 | 控制左右运动的方向或强弱；正负值分别表示沿该轴正向、反向运动 |
| `Proximity_SenderVelocityY` | 同一速度的 Y 分量，m/s | 控制上下运动的方向或强弱 |
| `Proximity_SenderVelocityZ` | 同一速度的 Z 分量，m/s | 控制往返运动的方向或强弱 |
| `Radius` | Sensa Receiver 当前的世界半径，米，`0 < Radius ≤ 3`，随 ScaleFactor 更新 | 查看覆盖范围与缩放后的测量边界 |
| `Sample` | Sensa 生产端活动计数；n/32（n=1…32）循环推进，0 表示停用或失效 | 用于判断测量是否持续更新，配合完整字段检查输入有效性 |

例如，Z 从 0.05 m 变到 0.15 m 表示沿接收器 Z 轴移动了 0.10 m，可将这两个端点校准为希望的动作范围。相对速率 0.4 m/s 描述该时刻的运动快慢；Proximity 变化率 0.4/s 则描述接近值每秒增加 0.4。按这三种含义分别选择位置、速度或接近变化的映射。

SDK 选择匹配 Sender 中 Proximity 严格大于零且最大的对象；Beta.3 在两个 Proximity 都为 1 时，以较小的 PointSeparation 决定目标。中点位移通过接收形状旋转的逆变换转换，保留米单位，未按缩放或半径归一化。报告速度取近似接触点处的相对速度，包含角运动项；形状旋转时，可能与中点位置的导数不同。没有选中 Sender 时，SDK 写入类型 0 和零 XYZ／速度。原生报告未提供时间戳、序号或稳定 Sender ID。

桌面要求同一来源与完整实例的十二字段齐全、类型为 Self、Proximity 为正、数值有限、位置在 Radius 边界及小量数值容差内，且 Radius 受支持。Sample 目标每 50 ms 推进，按 ChangedAt 检查的年龄上限为 **1000 ms**；较短的正数 InputTimeoutMs 优先，重复相同计数不续期。Contact 消失、字段缺失、Radius／坐标非法或活动停用／冻结时，相关空间动作停止。

Contact 直接定位通过 SensaPoint 映射 **X／Y／Z／Distance** 或 **VelocityX／VelocityY／VelocityZ／Speed／ProximitySpeed**。端点校准、曲线、输出限位、空间启用与停止沿用现有流程。SPS 四点定位的 `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}` 和按制作尺度解释的 AvatarRootLocal 保留既有定义。[定位说明](positioning.md) · [工作台](guide.md)

## SPS 四点定位：四路近接与一个活动样本

生产端为明确选择的 Socket／Plug 根中心建立一个专用球形 Sender，四个球形 Receiver 固定在 Avatar 根坐标中，只接受自己的专用碰撞通道。每实例共五个 Contact，跟踪所选 Transform 根中心。[生产端](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaFixedRootBuilder.cs)

### 五个公开测量参数

所有值均为 Float。一个 `<id>` 只占一层路径；实例名与专用碰撞通道须在 Avatar 内唯一。

| 完整路径 | 含义 | 有效范围 |
| --- | --- | --- |
| `Sensa/SPS/<id>/P0` | 锚点 P0 到根标记表面的近接值 | 有限且严格 `0.001 < p < 0.999` |
| `Sensa/SPS/<id>/P1` | 锚点 P1 的同类观测 | 同上 |
| `Sensa/SPS/<id>/P2` | 锚点 P2 的同类观测 | 同上 |
| `Sensa/SPS/<id>/P3` | 锚点 P3 的同类观测 | 同上 |
| `Sensa/SPS/<id>/Sample` | 表示本实例当前有效性与采样活动的计数 | 0 表示失效；有效值仅 `n/32`，整数 n=1…32 |

FX 每个采样状态目标持续 0.05 秒：先复制 RawP0–RawP3 到 P0–P3，再写 Sample；Sample 从 1/32 到 1 循环，目标周期 1.6 秒。更新节奏还受动画、Contact 与 OSC 调度影响。根点静止时沿用最近的 P 值，并通过变化的 Sample 检查采样是否持续。[共享常量](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs)、[接收检查](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedRootTracking.cs)

Sample 的寿命按**值最后变化时间 ChangedAt**计算，正常运行时**默认 1000 ms**。运行时使用正数 InputTimeoutMs 配置，否则回退为 1000 ms；解码器再将其上限限制为 1250 ms。因此配置更小会更严格，配置超过 1250 ms 也不会延长上限。重复发送同一个 Sample 只更新接收时间，不续期。缺少参数、Sample=0、非 n/32、冻结、超时或拟合失败均使坐标失效。[运行时寿命选择](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs#L76)

### 菜单选择测量目标

除每对象的五个测量 Float 外，Automatic 的 Exclusive 策略还生成 `Sensa/Select/<group>`，类型 Int，默认 0=Off，1…N 按 Targets 顺序选择对象；Dedicated 没有该组选择器。这个控制项由 MA 注册为表达参数，`localOnly=true`、`saved=false`，每次加载从默认值开始，按 VRChat OSC 配置决定可见性。[选择器实现](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaSelectionAnimator.cs)、[MA 参数规则](https://modular-avatar.nadena.dev/docs/reference/parameters)、[VRChat OSC 配置](https://docs.vrchat.com/docs/osc-avatar-parameters)

### 固定几何、距离公式与范围

所有坐标与半径均为 **Avatar 根局部单位**：中心 c=(0,1,0)，半跨度 h=0.35，Receiver 半径 R=2，标记半径 r=0.001。

| 锚点 | 局部坐标 |
| --- | --- |
| P0 | (-0.35, 0.65, -0.35) |
| P1 | (0.35, 0.65, 0.35) |
| P2 | (0.35, 1.35, -0.35) |
| P3 | (-0.35, 1.35, 0.35) |

球形 Sender 与 Receiver 的未饱和近接模型及反算为：

```text
p = clamp(1 - max(0, d - r) / R, 0, 1)
d = R × (1 - p) + r
```

d 是锚点中心到标记中心的距离；加 r 是因为 Proximity 描述靠近 Receiver 中心的 Sender 表面。四个已知非共面锚点的真实距离足以唯一确定这个局部 XYZ。实现还要求 RMS 距离残差≤0.01、坐标在 X/Z=[-2,2]、Y=[-1,3] 内；残差反映四路距离与计算位置的一致程度。[VRChat Contact 定义](https://creators.vrchat.com/common-components/contacts/)、[重建实现](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedAnchorReconstruction.cs)

可用空间是**四个球形覆盖区的交集**，扣除饱和区与边界。以 c 为中心、半径约 `2 - √3×0.35 ≈ 1.394` 的球提供内接参考；p 阈值、饱和孔和数值边界进一步限定实际有效区域。上限 p<0.999 要求 d>0.003，故每个锚点附近约 **0.003 局部单位**（以局部米计为 3 mm）的区域被排除；下限 p>0.001 对应 d<1.999。世界尺寸随 Avatar 根缩放变化。

### 缩放、采样与菜单控制

设作者 Avatar 根的均匀世界缩放为 s_author，VRChat 的缩放因子为 ScaleFactor，则 Receiver 世界半径为 `2 × s_author × ScaleFactor`。官方 Contact 半径上限为缩放后的 3 m；生产端预留 0.001 m，使用：

```text
maxScale = (3 - 0.001) / (2 × s_author)
```

超出门限时停用 Contact、清零公开采样并写 Sample=0；构建时拒绝不受支持的非均匀 Avatar 根缩放、根 ScaleConstraint 与根缩放动画。目标骨骼可以缩放，专用标记只跟随根中心，不把目标缩放带入已知球半径。s_author=1 且 ScaleFactor=1 时一个局部单位才等于一世界米。[门控实现](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaFixedRootBuilder.cs)、[VRChat 缩放后限制](https://creators.vrchat.com/common-components/contacts/)

RawP0–RawP3 供内部 FX 采样使用。ScaleFactor 与 IsLocal 用于缩放检查和本地运行，`Sensa/Select/<group>` 用于菜单选择。公开根位置测量固定为 P0–P3 与 Sample，坐标框和几何由共享定义提供。

专用通道与 AllowSelf 将测量限定到本 Avatar 的根标记。整体走动或转身时，读数保持相对 Avatar 的局部意义；测量时序和误差的检查方法见[定位说明](positioning.md)。

## Shader：根点位置、轴向与世界缩放

原生 Avatar 渲染组件采样选定根点的原点、局部 +X 和 +Z 三个蒙皮点，编码为黑白图块。桌面桥解码明确选择的区域和 Producer ID，再把同一次采样送入 Sensa。[编码器](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/Shaders/SensaRootTelemetry.shader) · [桥实现](https://github.com/SeaLoong/Sensa/blob/main/scripts/shader-osc-bridge.py)

### 十二个公开测量参数

`<id>` 为 Producer ID，十进制 1…65535，无前导零，例如 `Sensa/Shader/7/X`。以下参数均由 Sensa 桌面桥以 **OSC Float** 发送，采用 Sensa 协议。

| 叶子 | 含义与有效条件 |
| --- | --- |
| `Frame` | 0…65535 的整数编码时钟；`floor(_Time.y×60)` 按 16 位回绕，约 18.2 分钟一轮 |
| `X / Y / Z` | 根中心在 Avatar 根局部坐标中的位置；X/Z=[−2,2]，Y=[−1,3] |
| `RightX / RightY / RightZ` | 选定根点的局部 +X 轴，按 Avatar 根坐标表达；分量范围 [−8,8]，向量长度保留该轴缩放 |
| `ForwardX / ForwardY / ForwardZ` | 同一根点的局部 +Z 轴，同样保留方向和长度；分量范围 [−8,8] |
| `AvatarScale` | 每根局部单位对应的世界米数，范围 (0,8]；相对位移乘此值可换算成米 |
| `Valid` | 1 最后提交完整有效包；0 立即使测量失效 |

两条轴由同一三角形内的三个采样点计算。向量长度须大于 `10⁻⁶`，两轴夹角的正弦须大于 `10⁻⁴`，以排除退化测量。它们可用于计算朝向、平面法线、夹角与 X/Z 轴缩放；独立 Y 轴缩放需要另外测量。在“流程”中选择定位测量（SensaPoint），使用 `Sensa/Shader/<id>/**` 和对应指标，即可供计算信号或输出绑定使用，并保留完整包与时效检查。

有效单 bundle 的固定顺序是 **Frame → X → Y → Z → RightX → RightY → RightZ → ForwardX → ForwardY → ForwardZ → AvatarScale → Valid=1**。失效只发 Valid=0。桌面要求同一来源、同一 Producer 路径的十二字段连续到达，并检查完整性、有限值和量程。Frame 内容变化年龄最多 500 ms，更短的正数输入超时优先。[桌面接收器](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/ShaderRootTracking.cs)

桥先找到 QR 定位方框，再进行 Reed–Solomon 纠错、CRC32 和向前序号检查。同一 Frame 的任意测量改变、倒序、来源变化或冻结都会使测量失效；启动和恢复需要两个新的推进帧，默认冻结门限 350 ms。49×49 格图块包含 33×33 格 QR 主体和每边 8 格白色留白，捕获至少需要 196×196 物理像素。留白包含标准静区与额外位移余量；窗口尺寸改变后重新框选完整图块。

Shader 菜单另有 `Sensa/Select/ShaderCapture_<ID>`：Int，默认 0=Off，1=开启捕获。MA 将其注册为 `localOnly=true`、`saved=false` 的表达参数。内部 `Sensa/Internal/ShaderCapture_<ID>/Selected` 为 FX Int 状态记忆，默认 0，由本地 Driver 写入 0／1。[生成入口](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaShaderCaptureBuilder.cs) · [选择状态机](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaSelectionAnimator.cs)

### 数字精度与完整性

位置量化步长为 `4/65535≈6.10×10⁻⁵` 根局部单位；轴向分量为 `8/32767≈2.44×10⁻⁴`，零可精确表示；世界缩放为 `8/65535≈1.22×10⁻⁴` 米／局部单位。理想舍入的单分量误差最多半步，实际误差另以已知位置和方向测量。图解采用与 [HLSL round](https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/dx-graphics-hlsl-round) 一致的最近偶数舍入。

32 字节包保留 Producer ID、坐标标志、时钟序号、完整测量值与 CRC32。QR v4-H 将数据分成四组，每组 9 个数据字节和 16 个纠错字节，按 `2×错误字节数＋缺失字节数≤16` 的范围恢复。数据来自同一次捕获；完整性与时效检查共同决定结果是否可用。[完整布局与恢复规则](shader-capture-research.md)

## 诊断与位置相关信息

`Sensa/Diagnostics/Shader/0/Frame|X|Y|Z|Valid` 使用五字段传输形式，XYZ 为 [-1,1] 的诊断值，可用来检查图案生成、区域捕获和 OSC 传输。ID=0 在诊断命名空间中处理；原生根位置使用 1…65535 的对象 ID。[诊断分流](https://github.com/SeaLoong/Sensa/blob/main/scripts/shader-osc-bridge.py)

| 概念 | 提供的信息与使用方式 |
| --- | --- |
| 根点位置 | 三个坐标，表示所选根中心相对 Avatar 的左右、上下、前后位置 |
| 姿态／方向 | 通过独立方向信息或具有已知布局的多个点计算旋转 |
| 世界位置 | 结合世界参考对象与坐标变换，描述场景中的位置 |
| 最终形变表面 | 根据具体形变算法采样所需的表面点 |
| 设备位置或强度 | 由参数映射产生动作目标，通过设备自身的反馈确认实际响应 |

独立 Point／Handle／Pose 实验使用各自的参考对象和完整字段。空间联动的启动步骤是：允许实验空间输入，选择来源与映射，再启用当前输入。运行条件与实际客户端检查方法见[定位说明](positioning.md)与[Shader 研究记录](shader-capture-research.md)。
