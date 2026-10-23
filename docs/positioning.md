# 根点定位：在哪里能测到，坐标表示什么

**简体中文** | [English](positioning.en.md)

Sensa 可以读取你在 Unity 中选定的**根点**相对自己 Avatar 的三维位置，可选择受支持的 SPS Socket／Plug、骨骼／空物体 Transform、Sensa 或原生 Contact 根点。X 表示左右，Y 表示上下，Z 表示前后；整个 Avatar 一起走动或转身时，这个相对位置保持稳定，适合把局部的靠近、抬起或前后移动映射为设备动作。

先按下面的条件选择方案，再观察坐标，最后校准为设备动作。需要逐步设置时看[接入方案](usage-scenarios.md)；想先尝试模型，可打开[交互图解](https://sealoong.github.io/Sensa/parameter-geometry.html)。

| 方案 | 你能得到什么 | 什么时候会失效 |
| --- | --- | --- |
| Contact 直接定位（SDK Beta） | AvatarRootMeters 根点位置及相对接触点速度 | 离开专用接收区、完整字段非法或活动停止 |
| SPS 四点定位 | 自己选定根点的位置，坐标系为 AvatarRootLocal | 超出四个接收球的共同覆盖区、接近值饱和、采样停止或几何不一致 |
| Shader 捕获 | 从屏幕编码图块读出的根点位置，同为 AvatarRootLocal | 坐标越界、图块无法定位或校验失败、画面冻结 |
| 独立 Point／Handle／Pose | 各自参考对象下的位置或姿态实验 | 参与参数过期，或配对／抓取／几何条件不满足 |
| SPS2 · PenOthersNewRoot / PenOthersNewTip；SPS1 · PenOthers / PenOthersClose | 进入深浅的变化趋势与接近状态，适合深度联动 | 参数配对缺失、估长条件不满足，或 Close 条件关闭 |

[查看三种定位方式的实际读数面板](screenshots.md#定位读数)。

## Contact 直接定位：一个 Receiver 提供位置与速度

Sensa 已适配 SDK **3.10.6-beta.3** 的高级 Contact 报告，并兼容 Beta.2 的 Proximity 接口。Sensa 使用跟随所选自身根点的微小球形 Sender，并在 Avatar 根放置零偏移、各轴对齐的球形 Receiver。独立通道与 Self-only 选择用于对应期望目标；明确选择 Sensa／原生 Contact 根点时，可独立于 VRCFury 使用。[Beta 设置与安装包依据](contact-sdk.md)

SDK 报告发送形状中点相对接收形状中点的位移，旋转到 Receiver 坐标轴并保留物理米单位；本布置的坐标框为 **AvatarRootMeters**。半径覆盖以 Avatar 原点为中心，Receiver 制作半径为 2 个局部单位，`Radius` 发布当前世界半径。Avatar 缩放同时改变物理位移和 Radius，门控会在达到 3 m Contact 半径上限前停止测量。

`Proximity_SenderVelocityX/Y/Z` 和 `Proximity_SenderVelocityMagnitude` 报告近似接触点处的相对速度，单位 m/s，包含角运动项；`Proximity_ProximitySpeed` 表示每秒接近值变化。旋转时，中点坐标与接触点速度可能呈现不同变化。负坐标和静止时的零速度均有效。单点提供位置和速度；Tracking Frame 的三个标记进一步提供随骨骼运动的参考方向。

每实例在 `Sensa/Contact/<id>/` 下发布十二字段，原生报告另配 Sensa 的 `Radius` 与变化的 `Sample`。Sample 目标每 50 ms 在 n/32（n=1…32）间循环，变化寿命最多 1000 ms，较短的正数输入超时优先。桌面要求同来源实例字段完整、Proximity 为正、类型为 1（自身 Avatar）、数值有限且半径／位置边界受支持。Contact 消失、Sample=0、活动冻结或数值非法时，相关动作停止。[字段字典](osc-parameters.md)

## SPS 四点定位：目标必须同时被四个接收球测到

Sensa 在 Avatar 根下放置四个固定测量点（P0–P3），围成正四面体。一个很小的专用标记跟随你选择的 SPS Socket／Plug 根点。四个接收器分别测量到该标记的距离，桌面程序据此计算位置。明确选择骨骼／标记 Transform、Sensa 或原生 Contact 时，也沿用同一 SPS 根点协议。

默认接收半径为 **2 个 Avatar 根局部单位**，测量点之间约 **0.99 个局部单位**。这些数值按 Avatar 根局部单位定义；只有作者和运行时的根缩放都为 1，才直接等于世界米。Unity 与桌面使用同一套固定几何，保证四路距离按相同尺寸解算。

### 接收半径、测量点间距和可测范围

**接收半径**描述每个球从圆心延伸多远；**测量点偏移**描述四个圆心摆在哪里。两者共同决定绿色可测区域的大小和形状。

| 当前尺寸 | 数值 | 含义 |
| --- | --- | --- |
| 接收半径 R | 2 局部单位 | 单个接收球从测量点向外延伸的距离 |
| 测量点各轴偏移 h | ±0.35 局部单位 | 相对布局中心的 X、Y、Z 偏移 |
| 测量点到布局中心的距离 √3h | 约 0.606 局部单位 | 一个测量点离中心有多远 |
| 任意两点的距离 2√2h | 约 0.990 局部单位 | 两个接收球圆心之间的间距 |

目标同时进入四个接收球的共同区域后，才具备位置解算条件。图中的方框标出允许的坐标范围，绿色区域标出其中可测的位置。独立 Point／Handle／Pose 使用半径 2、偏移 ±0.35 的相同几何，数值按所选参考对象的局部单位解释，原点随参考对象确定。参考对象的累计世界缩放为 1 时，这些长度才直接等于世界米；计算与映射中的孔口偏移同样保留局部单位。

### 当前四个测量点的位置

| 测量点 | 相对 Avatar 根的坐标 |
| --- | --- |
| P0 | (−0.35, 0.65, −0.35) |
| P1 | (0.35, 0.65, 0.35) |
| P2 | (0.35, 1.35, −0.35) |
| P3 | (−0.35, 1.35, 0.35) |

**可测区域是四个球的交集**，扣除接收边界和测量点附近的饱和区。围绕中心 (0,1,0)，约 1.393 m 半径的中心区域位于外侧检测边界以内，但其中仍要排除测量点附近的小饱和孔。Unity 和网页的覆盖显示用于判断这一空间限制；实际有效性还要通过采样、缩放和一致性检查。

选择 2 m 同时缩短点间距，是覆盖范围、噪声放大和 Avatar 缩放余量之间的取舍。1 m 会明显缩小四球共同区域；无限缩短间距又会削弱离中心位置的解算稳定性。默认值依据几何模型选择，实际精度可在客户端中用已知位置测量。[推导与取舍](fixed-anchor-research.md)

### 距离如何转换为位置

以下细节供需要核查算法的用户阅读。接收半径 R=2、标记半径 r=.001，中心 c=(0,1,0)，四面体半跨度 h=.35。未饱和时，接近值 p 与中心距离 d 的关系是：

```text
p = clamp(1 - max(0,d-r)/R, 0, 1)
d = R(1-p)+r
q = -Σ((aᵢ-c)dᵢ²)/(8h²)
position = c+q
```

r 用于将标记表面距离换算为中心距离。程序要求严格 .001<p<.999、四路距离的 RMS 残差≤.01，并将坐标限制在 X/Z=[−2,2]、Y=[−1,3]。残差用于检查计算位置与四路距离的一致程度；实际误差需用已知位置对照测量。[共享定义](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs) · [桌面解算](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedAnchorReconstruction.cs)

## 为什么静止时坐标可以有效，停止采样却会失效？

每个对象发送 `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`。P0–P3 是四个接近值；`Sample` 是测量组件持续工作的计数：0 表示停用或无效，启用后约每 50 ms 在 n/32（n=1…32）间循环。

根点静止时，P 值不变是正常的；**Sample 必须继续变化**。桌面默认允许 1000 ms 的变化间隔，正数 `InputTimeoutMs` 可以调整，但解码上限为 1250 ms。重复收到同一个 Sample 不会延长有效期。缺字段、非法计数、Sample=0、冻结、超时或几何拟合失败都会使位置失效。

桌面将 Sample 的变化用于判断测量组件是否持续工作，并结合四路距离与几何一致性检查决定坐标是否有效。每个实例都使用上面的完整五字段。

Avatar 菜单还可能出现 `Sensa/Select/<group>`：0 为关闭，1…N 选择目标。它负责在 Avatar 菜单中选择测量目标；桌面输入由工作台单独启用。

## Avatar 缩放会有什么影响？

共同平移和转身不改变相对距离；共同均匀缩放可在距离比中抵消。非均匀缩放或 SDK 对半径的限幅会破坏这一关系，因此构建会拒绝非正／非均匀根尺度、根 ScaleConstraint 和已知根缩放动画。专用标记不继承目标骨骼的缩放。

SDK 的世界 Contact 半径上限为 3 m。内部 FX 会在 `2×authorScale×ScaleFactor` 超过约 2.999 m 前停用测量并清零。这使接收器在支持的缩放范围内工作。[官方 Contacts 说明](https://creators.vrchat.com/common-components/contacts/)

## Shader：坐标、轴向与屏幕捕获

Shader 把根点位置、局部 +X／+Z 两条轴向和 Avatar 世界缩放画成黑白图块，由桌面桥读取。位置范围是 **X/Z=[−2,2]、Y=[−1,3]**，采用 Avatar 根局部单位；`AvatarScale` 表示每局部单位对应的世界米数。根点面板显示有效包中的位置、两条轴向与单位换算。

图块采用 **QR Code v4-H**：33×33 格主体加上每边 8 格白色留白，共 **49×49 格**，捕获区域至少 **196×196 物理像素**。读屏先找到三个角标，再还原部分被遮挡或读错的数据；校验完整且画面持续更新后，才交给定位计算。掩码让数据保持清楚的黑白纹理，Reed–Solomon 纠错负责数据恢复，具体恢复范围见[编码设计](shader-capture-research.md)。外围留白包含标准 4 格静区和额外 4 格位移余量；窗口尺寸变化后重新框选完整图块。

`Frame` 检查画面推进，默认 350 ms 未变化时失效，启动和恢复需要两个新的推进帧。有效 OSC 按 **Frame → X/Y/Z → RightX/Y/Z → ForwardX/Y/Z → AvatarScale → Valid=1** 连续发送；失效只发 Valid=0。桌面最多接受 500 ms 的 Frame 变化年龄，更短的正数输入超时优先。

Right／Forward 保留根点 X/Z 轴的方向和长度，适合在“流程”中通过定位测量（SensaPoint）输入计算夹角、向量长度或朝向关系；独立 Y 轴缩放需要另行测量。端到端时间延迟和实际位置误差通过客户端测量确认。[捕获设置](../unity/top.sealoong.sensa/GPU-TRACKING.md) · [编码设计](shader-capture-research.md) · [参数解释](osc-parameters.md)

对象 ID 位于 `Sensa/Shader/<id>/` 路径中。内部 `Sensa/Diagnostics/Shader/0` 采用独立的五字段诊断格式，方便检查图案和传输。

## 测量相对跟随平面的深度和偏移

Tracking Frame 与 Shader 的跟随平面用于**自己 Avatar 内测量点与参考对象的相对运动**。当你希望动作以胸部、手部或某个 SPS 根点的当前朝向为参照时，在 Unity 添加 **Tracking Frame**。它有一个中心 Origin，并在 +Z 与 +X 方向放置 Forward、Right 标记；三点随所选参照移动和转动。中心与朝向可通过局部位置／旋转偏移调整，Scene 中的 XY 平面和 +Z 箭头显示测量方向。[创建步骤](unity-build.md#创建随骨骼移动的参考平面)

桌面从三点的实际位置取得方向：Forward−Origin 是正深度方向，Right−Origin 是向右方向。选择另一个测量目标 P 后，可以分别获得：

| 读数 | 含义 |
| --- | --- |
| 平面深度 | 目标沿正深度方向离开平面的距离为正，反方向为负 |
| 平面内偏移 | 目标投影到平面后，离中心的距离，始终大于或等于零 |
| 两点距离 | 目标到平面中心的直线距离 |
| 方向夹角 | 目标的已测方向与平面方向之间的角度 |

单个居中球的轮廓在骨骼旋转前后保持相同；偏心球的中心则会随旋转移动。Tracking Frame 通过分开的标记观察方向，Shader 则直接测量两条轴向。由球形接近值获得的单一距离，可继续用于接近程度联动。

Tracking Frame 可选 SPS 四点定位或 Contact 直接定位，分别发布 `Sensa/SPS/<名称>_Origin/…` 或 `Sensa/Contact/<名称>_Origin/…`，另两点使用 `_Forward`、`_Right` 后缀。SPS 方案生成 15 个 Contact、15 个公开字段，采用 AvatarRootLocal；Contact 方案生成 6 个 Contact、36 个公开字段，采用 AvatarRootMeters。三点间距默认 0.2 个 Avatar 根制作单位，跟随 Avatar 缩放；测量框架通过约束跟随参照的平移和旋转。

在“流程”使用“跟随移动平面”模板，选择目标 P 和对应 Origin，检查模板生成的差值、深度与偏移，再保存和连接输出。目标位置与平面标记使用同一种坐标框，参与当前计算的测量点需在可测范围内，每个点保留自己的 Sample 有效期。计算采用参与输入中最旧的时间；快速运动时可通过客户端实测确认多点更新带来的方向误差。独立 Point／Pose 采用各自的 ReferenceLocal，适合直接在所选局部参照下测量。[空间计算与单位](computed-signals.md#组合根点坐标)

## 跨 Avatar 互动：配对三点姿态

测量双方 Avatar 的互动时，使用 **SensaPoseSocket + SensaPosePlug**，让接收方的 Socket 局部坐标系成为共同参照。Socket 随身体移动或转动时，所测的深度、偏移和角度也随这个参照解释。对方的 Root／Tip／Side 三个标记提供实际几何；已有 OGB／SPS 接近参数可继续用于深浅和触碰联动。

1. 双方在各自 Unity 工程通过 **Assets → Create → Sensa → Pose Pair Profile** 创建配对设置，填写相同 `channel`，例如 `Pair01`。接收方启用 `receiveOthers`；一个通道每次对应一个进入测量区域的 Plug。
2. 接收方在要跟随的骨骼下通过 **GameObject → Sensa → Spatial Pose Socket** 创建对象，指定 Profile 和唯一实例名。把对象原点放在入口，**+Z 指向进入方向**，XY 为入口平面；对象与父级保持受支持的均匀缩放。
3. 发送方通过 **GameObject → Sensa → Spatial Pose Plug** 创建组件，指定同通道 Profile。把自己 Avatar 内的 Root、Tip、Side 标记分别拖入 `rootMarker`、`tipMarker`、`sideMarker`：Root 与 Tip 确定主轴，Side 放在轴线侧面以确定扭转。
4. 双方构建并在 VRChat 使用各自 Avatar 后，接收方开启 VRChat OSC，在 Sensa 固定来源，查看 **三点姿态（实验）**。完整实例路径例如 `Sensa/Pose/v1/Main/Others/**`；Root、Tip、Side 各有 A0～A7，共 24 路。观察进入方向、横向偏移和扭转是否符合动作。
5. 选择“生成深度草稿”或“生成六轴草稿”，检查将替换的映射草稿并保存；也可在计算或输出中选择 **三点姿态指标（SensaPose）**，填写同一实例路径。校准后允许实验空间输入，再启用当前输入。

| 可用指标 | 数值含义 |
| --- | --- |
| `Depth` | 0～1 的进入比例，适合归一化深度联动 |
| `OffsetX`／`OffsetY` | 主轴与入口平面交点的横向偏移，使用 Socket 局部单位 |
| `Yaw`／`Pitch`／`Roll` | 相对 Socket 的偏航、俯仰和扭转，单位度 |

当 24 路测量完整且保持时效、三个标记能还原有效几何，并满足进入条件时，这六个指标可用于动作。进入条件包括：主轴与入口平面有唯一交点、相对 +Z 倾角不超过 65°、交点距中心不超过 0.04 个 Socket 局部单位，并且 Tip 位于平面的 +Z 一侧。Root–Tip 间距支持 0.02～0.5 个局部单位，Side 离轴至少 0.005 个局部单位；局部累计缩放为 1 时，这些长度数值等于米。

Pose 使用全部 24 路中最旧的采样时间检查时效。`Depth` 保留进入比例的含义；前文 `PlaneDepth` 保留位置长度单位，可按各自量程选择计算和输出。[配对生成能力](../unity/top.sealoong.sensa/AUTOMATION.md#目标与范围) · [标记布局](lab-interaction.md#pointpose-布局与-sps-四点定位)

## 网页中“模拟收到有效样本”是什么？

勾选时，图解按有效样本显示读数；取消时，显示发送端报告样本失效后的状态。可以用它观察数据中断对测量结果的影响。实际联动在工作台中通过选择输入、保存映射和启用输入完成。

## 从观察坐标到控制动作

1. 在根点面板固定对象和来源，先确认位置有效且变化方向符合预期。
2. 选择 X、Y、Z 或距 Avatar 原点的距离；Contact 直接定位还可选择 VelocityX／Y／Z、Speed 或 ProximitySpeed 控制运动强弱。分别采集动作起点和终点，对应 0% 与 100%。
3. 检查预览后替换映射草稿并保存。保存会关闭输入。
4. 允许实验空间输入，再启用实际 OSC 输入。

校准后的轴适合细微局部深浅变化；需要确认触碰时，可另用 Touch／Close 条件。速度指标适合运动强弱联动。坐标或活动失效时，对应动作停止。独立 Point／Handle／Pose 按各自参考对象解释坐标，并检查参与通道中最旧样本的时效；Handle 还检查抓取条件。三个具有明确布局的标记可以进一步计算局部姿态。

完成配置后，在实际客户端检查坐标方向、响应延迟和失效停止，再以小行程确认设备动作。自动检查的范围与结果见[浏览器验证记录](e2e-status.md)。[参数字典](osc-parameters.md) · [操作指南](guide.md)

## 把定位结果用于组合计算

在“流程”中添加计算信号，输入类型选择“定位测量”（SensaPoint），填写目标实例的路径并选择指标，即可把解算结果用于加权平均、差值或向量长度等计算。SPS 四点定位先将四路距离解算为坐标，计算输入使用这个有效坐标；多个目标分别选择各自的完整实例路径。

例如，A、B 两个根点共用 Avatar 根坐标框时，选择“两点距离”，分别指定 A 和 B 的 XYZ，就能直接得到间距。使用平面深度或平面内偏移时，再选择参考点与法线，或定义平面的两条轴。SPS 四点定位与 Shader 的 AvatarRootLocal 距离按制作尺度解释，Contact 的 AvatarRootMeters 距离按米解释。使用相同参考对象、坐标轴方向和单位，再将最终结果校准到动作范围。定位有效性与 Sample／Frame 时效会传到计算结果；活动计算失效时停止动作。[计算信号示例](computed-signals.md)
