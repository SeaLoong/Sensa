# OSC 参数字典

**简体中文** | [English](osc-parameters.en.md)

本页是字段与有效条件参考；先按[使用方案](usage-scenarios.md)选路线，再按[工作台指南](guide.md)建立控制链。下文省略 `/avatar/parameters/`，路径区分大小写，`<id>` 使用实际实例名。

## 用图解理解数值

[公开参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)支持自动识别语言，也可直接打开[简体中文](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)或[English](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US)。应用参数详情会打开随包附带的页面；解压后保留相邻 assets，即可离线打开 `docs/parameter-geometry.html`。

先选择参数，再拖动橙色目标，观察靠近、进入、接触区域时读数怎样变化。十一个场景都有 3D、平面投影和精确滑条。蓝色表示接收范围，橙色表示目标信号的形状，灰色外形帮助理解 Socket／Plug 的相对位置；橙色操作柄放大显示，方便拖动。SPS 四点定位的四个颜色关联测量球、标签和参数行。

图解按完整 XYZ 计算距离。XZ 视图将空间投到一个平面，SPS 四点定位的绿色部分另标出当前 Y 高度的可测切片。“可用值”体现 Close 或有效性条件，通过这些条件的数值可作为建立映射时的参考。实际联动按[工作台指南](guide.md)配置。

参数按名称字典序显示，同一前缀的短名称在前，例如 `PenOthers` 在 `PenOthersClose` 之前。前缀中的 `*` 代表实例名：`Sensa/SPS/Example/P0` 的完整地址为 `/avatar/parameters/Sensa/SPS/Example/P0`。Shader ID 使用下文规定的十进制数。

Three.js／[OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)随资源打包；[WebGL2](https://threejs.org/docs/pages/WebGLRenderer.html)不可用时切换 SVG。MIT 声明位于 `assets/parameter-geometry-3d.LICENSE.txt`。[图解操作](guide.md)

## 先选择需要的信息

| 参数族 | 提供的信息 | 常见用途 |
| --- | --- | --- |
| `OGB/Orf/<id>/…`、`OGB/Pen/<id>/…` | Socket／Plug 的进入深浅趋势、触碰强度和接近状态 | 深度或振动联动 |
| `VFH/Zone/Touch/<id>/Others`／`Self` | 选定触摸区域的接近强度 | 区域触碰联动 |
| `Sensa/<id>/Aux<index>/<role>_…` | Raycast 是否命中、归一化距离与米制距离 | 命中条件、表面距离联动 |
| `Sensa/Contact/<id>/Proximity…`、`Radius`、`Sample` | 所选根点的米制位置与 m/s 相对速度 | 校准后的局部动作或运动强弱 |
| `Sensa/SPS/<id>/P0…P3`、`Sample` | 选定根点相对 Avatar 的三维位置 | 按左右、上下、前后移动控制动作 |
| `Sensa/Shader/<id>/Frame`、`Valid`、`X`、`Y`、`Z` | 从屏幕图块解码的根点相对位置 | 用画面编码获得三维位置 |
| `Sensa/Diagnostics/Shader/0/…` | 图案、捕获与 OSC 传输诊断 | 检查捕获链路 |

SPS 四点定位的 Unity 测量组件与桌面共享下文的五字段和固定几何。外部 OGB 参数由 Avatar 使用的生成器提供，可在参数列表中核对完整路径。

## OGB 与 VRCFury 参数

`Orf` 表示 Socket，`Pen` 表示 Plug。`Self` 表示检测自身的匹配目标，`Others` 表示检测其他 Avatar 的匹配目标。Sensa 按 OSC 来源、完整实例路径与类别配对。图解中的 **SPS2 · PenOthersNewRoot / PenOthersNewTip** 和 **SPS1 · PenOthers / PenOthersClose** 对应两种参数几何。

| 参数／路径 | 怎样理解读数 | Sensa 的处理 |
| --- | --- | --- |
| `FrotOthers` | 两个匹配外形靠近、贴合或擦过时的接近强度 | Plug 与 `FrotOthersClose` 配合；Socket 直接使用该值 |
| `FrotOthersClose` | Plug 周围是否有匹配目标进入有效接近区，0 为离开、1 为接近 | 为 Plug 的 Frot 提供附加条件 |
| Orf／Pen 的 `PenOthers`／`PenSelf` | Socket 的 SPS1 信号或 Plug 的深浅趋势；正对 Socket 靠近时，可用来理解逐渐进入的程度 | Socket 在 SPS2 配对缺失或两值均零时使用；Plug 直接读取 |
| Orf 的 `PenOthersClose` | 匹配目标是否进入 Socket 周围的有效接近区，0 为离开、1 为接近 | 发布该值时，以它作为 SPS1 深度的接近条件；单值来源按自身路径读取 |
| Orf 的 `PenOthersNewRoot`／`PenSelfNewRoot` | SPS2 中 Plug 根部靠近 Socket 的程度 | 与同实例 `NewTip` 配对，参与长度估计和深度换算 |
| Orf 的 `PenOthersNewTip`／`PenSelfNewTip` | SPS2 中以根部为中心的长度球与 Socket 的接近程度 | 两路未饱和样本用于估长，再换算进入深浅的趋势 |
| `TouchOthers`／`TouchSelf` | 身体或匹配目标靠近触碰区域时的连续强度，范围 0–1 | 与对应 `Touch…Close` 配合使用 |
| `TouchOthersClose`／`TouchSelfClose` | 匹配目标是否进入相应触碰区域，0 为离开、1 为接近 | Close 为 1 时采用 Touch 强度，为 0 时输出零 |
| `VFH/Zone/Touch/<完整id>/Others`／`Self` | 指定区域内的连续接近强度，越靠近区域中心通常越大 | OgbTouch 直接读取 0–1 |
| `VFH/Version/…`、历史 OGB Version 路径 | 上游支持能力的标志 | 用于识别参数能力 |
| `OGB_ENABLED` | 向 Avatar 表示接收服务正在工作 | 按配置目标每 5 秒发送 true，停用时尝试 false；默认关闭 |

深度相关数值按检测形状之间的距离变化。正对 Socket 的移动最容易与进入深浅对应；横移、倾斜和作者设置的尺寸也会改变读数，因此映射时应以自己希望的起点和终点校准。SPS2 的 OgbDepth 使用 Receiver 半径 R=1、根球半径 r=0.01 的模型；图解可以帮助观察两路数值如何配合。

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

三字段对应官方 SDK 的原生 `VRCRaycast` 报告，均声明为本地、不同步的表达参数，并在 FX 中声明匹配类型。已核对最低支持版本 3.10.3 的 API 与参数绑定。[Unity 配置](../unity/top.sealoong.sensa/AUTOMATION.md) · [官方 SDK 3.10.3 安装包](https://github.com/vrchat/packages/releases/download/3.10.3/com.vrchat.avatars-3.10.3.zip)

## Contact 直接定位（SDK Beta）：十二个公开字段

为所选自身根点使用专用球形 Sender，在 Avatar 根设置零偏移、各轴对齐的 Proximity Receiver。Receiver 开启 `advancedProximityParameters=true`，使用独立碰撞通道且只接收 Self。此方案需要 SDK 3.10.6-beta.2 或提供同一能力的后续 SDK。坐标框为 **AvatarRootMeters**：以 Avatar 根为原点，坐标轴随根旋转，保留物理米单位。[设置与 SDK 核验依据](contact-sdk.md)

全部路径以 `Sensa/Contact/<id>/` 开头，`<id>` 只占一层路径。下表按字典序排列，共享前缀的短名称在前。`Proximity_SenderType` 为 Int，其余十一个字段为 Float。

| 叶子 | 含义与单位 | 有效条件／用途 |
| --- | --- | --- |
| `Proximity` | 原生接近值，0–1 | Sensa 要求 `0 < p ≤ 1` |
| `Proximity_ProximitySpeed` | Proximity 的带符号变化率，接近值／秒 | 有限；退出可产生短暂读数 |
| `Proximity_SenderLocalPositionX` | 发送形状中点相对接收形状中点的位置，X，米 | 有限；负坐标有效 |
| `Proximity_SenderLocalPositionY` | 同一位置的 Y，米 | 同上 |
| `Proximity_SenderLocalPositionZ` | 同一位置的 Z，米 | 同上 |
| `Proximity_SenderType` | 0 无，1 自身 Avatar，2 其他 Avatar，3 世界 Sender | Sensa 专用根点测量要求 1 |
| `Proximity_SenderVelocityMagnitude` | 相对接触点速度的模长，m/s | 有限且非负；零有效 |
| `Proximity_SenderVelocityX` | Receiver X 轴下的相对接触点速度，m/s | 有限，包含角运动影响 |
| `Proximity_SenderVelocityY` | 同一速度的 Y，m/s | 同上 |
| `Proximity_SenderVelocityZ` | 同一速度的 Z，m/s | 同上 |
| `Radius` | Receiver 实际世界半径，米 | 有限，`0 < Radius ≤ 3`；随 ScaleFactor 更新 |
| `Sample` | Sensa 生产端活动计数 | 0 失效；有效值为 n/32，n=1…32 |

SDK 选择匹配 Sender 中 Proximity 严格大于零且最大的对象。中点位移通过接收形状旋转的逆变换转换，保留米单位，未按缩放或半径归一化。报告速度取近似接触点处的相对速度，包含角运动项；形状旋转时，可能与中点位置的导数不同。没有选中 Sender 时，SDK 写入类型 0 和零 XYZ／速度。原生报告未提供时间戳、序号或稳定 Sender ID。

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

## Shader：直接根坐标与传输活性

原生 Avatar 组件把所选 CPU 根中心编码成图案，桌面桥只解码用户明确选择的区域及 Producer ID，再发 OSC。其坐标范围是编码立方体 X/Z=[-2,2]、Y=[-1,3]，同样采用 Avatar 根局部坐标。[编码器](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/Shaders/SensaRootTelemetry.shader)、[桥实现](https://github.com/SeaLoong/Sensa/blob/main/scripts/shader-osc-bridge.py)

### 五个公开测量参数

`<id>` 为明确选定的 Producer ID，十进制 1…65535，无前导零，例如 `Sensa/Shader/7/X`。这五个测量字段由桌面桥以 OSC Float 发送。

Shader 菜单另有 `Sensa/Select/ShaderCapture_<ID>`：Int，默认 0=Off，1=开启原生捕获 rig。例如 `Sensa/Select/ShaderCapture_42`。它同样是 MA 注册的表达参数，`localOnly=true`、`saved=false`，可能按 OSC 配置可见。内部 `Sensa/Internal/ShaderCapture_<ID>/Selected` 是 FX 的 Int 状态记忆，默认 0、由本地 Driver 写入 0／1，不注册为表达参数。[生成入口](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaShaderCaptureBuilder.cs)、[选择状态机](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaSelectionAnimator.cs)

| 叶子 | 含义与有效条件 |
| --- | --- |
| `Frame` | 0…65535 的整数，名义按 60 Hz 时间步生成并按 16 位回绕；约 18.2 分钟绕回一次 |
| `Valid` | 1 提交本次有效包；0 使根坐标立即失效 |
| `X` | 根中心局部 X，有限且位于 [-2,2] |
| `Y` | 根中心局部 Y，有限且位于 [-1,3] |
| `Z` | 根中心局部 Z，有限且位于 [-2,2] |

有效包按 **Frame → X → Y → Z → Valid=1** 的顺序发送，Valid 最后提交。失效只发 Valid=0，不重发旧 XYZ。桌面要求同一 OSC 来源、同一完整 Producer 路径下五字段连续接收；各来源独立组包，同来源中插入其他消息时重新等待完整五字段。Frame 的 ChangedAt 寿命最多 500 ms，并与更短的正数配置超时取较小值；相同 Frame 持续重发也会过期。[桌面接收器](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/ShaderRootTracking.cs)

桥先检查图案、二进制 ID／标志、CRC 和模 65536 的向前帧序；反向／大幅跳序、同 Frame 不同 XYZ、身份变化或冻结会失效。启动或失效后需要重新建立两帧向前采样才恢复；默认桥冻结门限 350 ms。回绕可以正常向前推进，生产端重置为旧序列可能需要显式重启桥。连续字段和 CRC 共同检查包结构与数据完整性。

### 量化、精简字段与必要的二进制元数据

每轴长度 4 的区间使用 16 位无符号量化，步长 `4/65535 ≈ 6.10×10⁻⁵` 局部单位；理想舍入的单轴半步约 `3.05×10⁻⁵`，三轴合成量化误差上限约 `5.29×10⁻⁵`。这些数值描述数字编码的量化误差。实际定位误差还取决于坐标框计算、渲染合成、捕获与帧延迟，可通过已知位置测量。Shader 的 [HLSL `round`](https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/dx-graphics-hlsl-round) 在恰好半整数时取最近偶数；图解沿用这一舍入规则。

对象 ID 位于 OSC 路径中，`Sensa/Shader` 固定坐标框与范围。二进制图案保留对象 ID、有效／原生坐标标志、CRC 与 Frame，分别用于配对、识别坐标类型、检查数据和判断画面是否推进。

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
