# 自动配置、本地骨骼测量与 PB 把手（初版开发中）

**简体中文** | [English](AUTOMATION.en.md)

## 最少操作的安装方式

在 Avatar 根对象添加 **Sensa > Automatic SPS Setup**，点击“检查目标、自动位置与 Contact 开销”。默认发现头像内的 VRCFury SPS Socket/Plug，为 Socket 生成标准 Root 诊断阵列；其他能力按需要开启。新添加组件与入口预制件默认采用 Exclusive，每组一次选择一个 Socket 或 Plug，初始 Off。已有组件的序列化策略保持不变，可手动改为 Exclusive。也可以直接把组件加到单个 SPS 对象：Reset 会把选择范围限定为该对象，单 Plug 默认开启配对标记。

上传/NDMF 构建时读取 SPS 的原点、旋转与长度，生成原生组件，然后移除 Sensa 作者组件。无需手动摆接收器。原头像资产不被写回，原 SPS 的形变组件不被移动。未知的 VRCFury 几何接口会报错，不静默猜测位置。

已核对环境：Unity 2022.3.22f1、Avatars SDK 3.10.5、VRCFury 1.1434.0、MA 1.18.7、NDMF 1.14.8。自动 SPS 配置需要 VRCFury 作者组件；仅有旧 Shader/灯光的对象不会被自动识别。普通本地骨骼/PB 探针不依赖 VRCFury。头像与世界必须使用独立项目，不能混装两个 SDK。

## Unity 侧：从空项目到可以观察

1. 用 VCC/ALCOM 建立或打开 **Avatars** 项目。测试世界必须保留在另一个 Worlds 项目中，不要混装两个 SDK。
2. 在该 Avatar 项目安装 Modular Avatar（会带入其所需 NDMF），使用自动 SPS 配置时还要安装 VRCFury，并先让原本 SPS Socket/Plug 正常工作。
3. 当前开发源码可在 Unity 的 `Window > Package Manager > + > Add package from disk` 选择本仓库 `unity/top.sealoong.sensa/package.json`。这一步不会替你安装所有 VPM 依赖；若缺 MA/NDMF/SDK，先用 VCC 解决依赖再导入。已验证的具体依赖版本见本页开头，不代表所有旧版本均经过测试。
4. 选中带 `VRCAvatarDescriptor` 的 Avatar 根对象，`Add Component > Sensa > Automatic SPS Setup`。保持一个组进行单目标选择；Group Name 使用唯一 ASCII 名字，例如 `Main`。
5. 默认发现全部 SPS 作者组件。只测指定位置时，关闭 Discover All，把目标 GameObject 拖到 Selected Targets；排除项放到 Excluded Targets。点击“检查目标、自动位置与 Contact 开销”确认识别数量、实例名和位置，出现错误先解决，不要忽略。
6. 按下表选择能力。不要因为选中了 Plug 就以为所有测量自动启用。
7. 使用上传/NDMF 构建生成原生组件。作者组件是 EditorOnly，构建副本中会被移除，源头像保持可编辑。无需手动摆放四/八个接收器。不要把 Worlds Udon 脚本放进头像。
8. 在 VRChat 打开 OSC，并开启相应交互权限。Sensa 生成的菜单初始为 Off，选择本次使用的目标；同时检查 SPS 自身菜单选择正确。两套选择目前不会互相自动同步。
9. 在桌面 Sensa 开启 OSC 接收并应用 OSC 输入方式，**先不打开输入开关**，到“空间诊断”确认实例、来源、完整采样和有效状态。

| 你想做什么 | Automatic SPS Setup 的关键选项 | 软件侧应该看到什么 |
| --- | --- | --- |
| 只观察普通对端 Plug 根部 | Socket Root Tracking；选择自己的 Socket | SpsRoot / Others，8 路，XYZ；仅诊断，不生成行程 |
| 多 Socket 只测一个、节省注册接收器 | SharedRootArray；相同缩放，最多 16 个有效目标 | SharedRoot、Ready/Slot，切换等待后生效；仍是诊断 |
| 自己抓一个手柄输入 | Create Plug Grab Handles；选择自己的 SPS Plug | Handle / Self，4 路；抓取才有效，松手停止 |
| 测自己 Plug 尖端相对自己 Socket | Local Plug Tip Tracking；选择 Plug 与参考 Socket，必要时指定 Local Reference Socket | Point / Self，4 路；测未形变参考尖端，需要两者相对移动 |
| 双方配对完整参考姿态 | 本地 Socket 开 Paired Socket Tracking；对端 Plug 开 Paired Plug Markers；Pair Channel 一致 | Pose 的 Root/Tip/Side，24 路；可校准六轴 |

### 不依赖 SPS 的本地骨骼探针

在 Avatar 内参考对象上添加 `Sensa > Local Bone or PB Probe`，Target 拖入要测的本地骨骼，Reference 拖入固定参考系（留空使用组件对象）。启用 Create Grab Handle 时会自动创建 PB 手柄，无需 Target。给每个探针不同 Instance Name。生成的 Sender 跟随位置但不继承目标 PB 拉伸；所有测量层级仍须保持正值均匀缩放。

手动方式可用 `SensaLocalPoint.prefab` / `SensaGrabHandle.prefab` / `SensaPoseSocket.prefab` / `SensaPosePlug.prefab`。手动骨骼探针需要你选择参考和目标；自动 SPS 方式才会读取 Socket/Plug 的已有原点、方向、长度。两者生成同类原生组件，但手动摆放不会自动获得多目标选择控制器。

## Sensa 软件侧：观察、选预设、校准

1. 启动 `Sensa.exe`；从源码则先 `npm ci`，使用 `global.json` 指定的 .NET SDK 构建/运行。默认 WebUI 为 `http://127.0.0.1:5086`，默认 OSC 接收为 `127.0.0.1:9001`。OSC UDP 端口和 WebUI HTTP 端口不是同一个设置。
2. 进入 OSC 输入页，配置并启用监听，点击“应用输入方式”。参数接收和诊断不要求输入开关打开。无数据时先检查 VRChat OSC 开关、端口占用、交互权限以及 Sensa 目标菜单是否仍是 Off。
3. 在“空间诊断”核对类型、实例、Self/Others 与采样数量。位置无效时先修几何/数据，不要用扩大映射范围掩盖无效状态。多个来源同时在线时固定使用来源。
4. 在“参数与映射”选择预设：本地点/PB 使用相应 Z、三轴或距原点模板；完整配对使用 Pose；普通 SPS 使用对应 Socket/Plug/触碰预设。Root/SharedRoot 原始采样仅用于诊断；Shader 有独立的 Z 位移实验模板，不能当作 SPS 插入深度。完整的 29 项清单见主仓库 docs/presets.md。
5. 本地点可到独立“量程校准”页选轴，分别采集期望的 0% 和 100% 位置。例：10 cm→5 cm 会自动反向，7.5 cm 预览 50%。生成草稿会返回参数页；模板范围不是自动校准结果。
6. 确认目标轴、输入范围、反向、映射范围，然后“保存并应用映射”。多轴模板需逐轴核对；单轴校准生成草稿会替换冲突的精确位置映射，不是自动保留原六轴组合。
7. 添加输出、选择轴配置并限制行程/速度。连接本身不会移动。最后才启用输入；输出卡显示该传输实际发送的目标，不是机械位置回读。先用隔离模拟或断开设备验证方向。
8. PB 松手、定位缺失或门控关闭会停止相应输入。断流停止默认关闭，因为增量 OSC 静止时可能不重发；开启时按几何采样而不是无关参数检查超时。

## 选择目标与能力

- `Discover All`：扫描头像内所有 SPS 作者组件。关闭后用 `Selected Targets` 指定对象；`Excluded Targets` 总是优先。
- `Group Name`：组名应唯一，最多 30 个 ASCII 字母/数字/下划线/短横线。同一 SPS 对象不能被两个自动组重复选择。
- `Socket Root Tracking`：标准 `TPS_Pen_Root` 球形 Sender 定位，8 路。对方不用安装 Sensa，但需存在兼容触点。只提供根部诊断。
- `Paired Socket Tracking`：配套 Root/Tip/Side 三点定位，24 路。对方需要配套标记及相同 `Pair Channel`。
- `Paired Plug Markers`：根据 SPS 的未形变根部、长度和方向生成 3 个配对标记；不是 GPU 形变后的真实尖端。一个通道一次只能有一个目标，多个 Plug 应使用不同组/通道或确保不会同时进入范围。
- `Local Plug Tip Tracking`：测量自己 Plug 的未形变参考尖端相对某个自己 Socket 的位置。只有一个选中 Socket 时自动使用；多个时必须指定 `Local Reference Socket`，不需要调整坐标。不能把与 Plug 一起移动的自身坐标系当作有意义的位移来源。
- `Create Plug Grab Handles`：自动创建独立 PB 把手，长度由 Plug 尺寸生成。其可见网格放在 SPS 渲染器搜索树之外，避免误被加入 SPS 形变。PB 与跟随约束作用于不同对象。

自动实例名包含简短目标名与路径摘要，用于区分重名目标。更改名字或层级可能改变 OSC 实例路径，应检查已有映射。Inspector 报告提供实例名和共享槽位对应关系。

## 三种性能策略

以下数量仅计算开启标准 Root 的 N 个 Socket，不包括配对阵列、其他插件触点及本地探针。

| Array Policy | 注册 Receiver | 同时启用 Receiver | 行为 |
| --- | --- | --- | --- |
| Dedicated | 8N | 最多 8N | 每个位置独立，适合需要同时观察多个位置的调试 |
| Exclusive | 8N | 最多 8 | 新组件默认；只启用一个位置，减少活动开销，不减少注册总量 |
| SharedRootArray | 8 | 8 | 一个阵列由辅助 Parent Constraint 跟随选定位置；最多 16 个同缩放目标 |

共享复用的部分只支持标准 Root 诊断，不支持配对 Socket 三点阵列，也不同时测多个 Socket。同组可加入 Plug 的标记、本地点与 PB 手柄，它们仍使用各自的组件；选择 Plug 时关闭共享 Root 阵列，Ready=false、Slot=0。共享模式总共最多 16 个有测量能力的 Socket/Plug 菜单项。它移动的是 Sensa 辅助阵列，不移动 SPS Socket。约束与 Animator 本身有开销，Contact 数量下降不等于所有场景帧率必然提高。

Exclusive/Shared 生成 `Sensa <组名>` 菜单，默认 Off。该菜单选择的是测量位置，**独立于 SPS 自带开关和 Auto Mode**；不会修改 SPS 的标签、Guided Path 或视觉启用逻辑。Dedicated 的生成对象继承所在 GameObject 的激活状态，但不能保证跟随 VRCFury 内部生成对象的所有开关。

互斥范围是一个自动组，不是整个头像：同组 Socket 和 Plug 共用一个选择器；多个组仍可同时启用。只作为本地坐标参考、没有开启任何测量能力的目标不会产生空菜单项。Slot 从 1 开始，Off 为 0；层级、目标选择或能力改变后应重新查看 Inspector 报告。Plug 的配对标记、Socket 下的本地点阵列、头像根下的 PB 手柄虽分散在不同层级，也会一起切换。Socket 参考框架保持激活，仅关闭其测量子节点，避免误关正在使用的 Plug 参考系。

切换与 Off 状态显式清零生成的接收参数及 PB 抓取/拉伸参数。这个动作减少停用后的残留值，不承诺跨 OSC 包原子切换。若需要整个头像一次只测一个目标，把目标放在同一个组；不要建立多个互相独立的自动组。SPS 本身仍需通过原有菜单选择相应目标，尤其不要把控制骨骼/身体网格的整个 SPS 对象直接设为 inactive。

共享切换过程：关闭接收器 → Ready=false、写入槽位、清零 8 路 → 等待 0.25 秒 → 启用接收器并设置 Ready=true。桌面按接收序号拒绝旧槽位采样，毫秒时间戳相同也不会放行旧值。它仍不是原子网络事务；OSC 丢包/乱序和约束时序需要客户端测试，因此共享模式保持诊断用途，不直接驱动设备。

选择动画用当前槽位参数阻止重复进入，再通过 AnyState 跳转，转换数量随目标数线性增长。16 个目标时，Exclusive 为 19 条转换，Shared 为 35 条（含等待完成转换）；共享 Active 不会因选择值保持不变而不断重启等待。这个优化减少生成的状态转换，未据此宣称实际客户端帧率提升。内部槽位参数只用于控制器，不加入菜单或网络同步列表。

每个本地点/PB 把手另需 4 Receiver + 1 Sender；每个把手另有 PhysBone 和可见网格。构建前及 NDMF 优化阶段检查总 Contact 预算。共享目标必须与 Avatar 根保持相同正值均匀缩放；不同缩放用 Dedicated。运行时极端缩放、组件被禁用和多同标签 Sender 混入仍需单独验证。

## 为什么是 8N，以及位置如何解算

N 是独立测量位置的数量，不是玩家数，也不是 Sender 数。每个球形标记对应 8 个 Proximity Receiver，其中心位于参考坐标系的立方体八角 `(±0.06, ±0.06, ±0.06)`，半径 R=0.35。以下距离均为参考局部单位；仅在缩放为 1 时可直接按世界米理解。

VRChat 的 Proximity 是到 Sender 表面的近接量，而非到其中心的距离。在球形、未饱和、只有同一个 Sender 贡献全部测量的条件下：

```
ai = R × (1 - pi)                 // 接收值 pi 转为表面距离
di = ai + r                      // r 为 Sender 半径，di 为球心距离
||x - ci||² = (ai + r)²           // x 是待求球心，ci 是第 i 个接收器中心
x(r) = -Σ ci × (ai + r)² / (16 b²), b=0.06
```

利用八角对称性，给定半径 r 后直接计算位置 x(r)。当前软件在 0–0.02 范围内搜索半径，再细化，选择八路中心距离残差 RMS 最小的结果。半径作为待估量可适应不同的有效球尺寸；它不是凭一个近接值推算深度。缺样、饱和、非有限值、拟合残差过大或位置超出有效范围会被拒绝。当前残差阈值 0.002 **是拟合一致性阈值，不是实测精度保证**；标准 Root 的半径触及搜索上界也会拒绝。

8 不是数学最小数量。已知半径、理想无噪声时，4 个非共面距离一般已足够确定三维位置；未知半径还增加一个未知数。这里使用 8 个是为了对称几何和额外的一致性检查。当前实现要求八路完整有效，不会自动降级为四路。八路不一致可以发现部分混入或噪声，却不能证明八路来自同一个玩家；官方规则是每个接收器分别取最近的 Sender。

普通兼容 Root 只能给球心 XYZ，不能由一个球推导方向、尖端或弯曲后的真实行程。配对方案分别重建 Root/Tip/Side 三个点，因此每个 Socket 需要 3×8=24 个接收器：Root→Tip 定义轴线，Side 提供侧向/扭转信息，再结合 Socket 平面、孔径和倾角判断深度。Plug 标记目前是未形变参考点，Shader 形变后的曲线仍属于另外的实验路径。单个本地点/PB 方案则是 4 个接收器加一个自己生成的微小 Sender。

协议常量见 `Runtime/SensaPoseProtocol.cs`，桌面几何实现见 `src/Signals/PoseReconstruction.cs` 和 `src/Signals/SpsPositionTracking.cs`。[VRChat Contacts 官方说明](https://creators.vrchat.com/common-components/contacts/)定义了表面近接值、最近 Sender 规则与组件预算。

## 手动预制件与骨骼组件

### 本地点与 PB：统一四接收器实现

本地点/PB 统一使用 **4 Receiver + 1 Sender**，无需选择布局、协议或兼容模式。项目尚未发布，直接更新初版实现，保留 `Sensa/Point/v1/<实例>/Self/Root/A0..A3` 与 `Sensa/Handle/v1/<实例>/Self/Root/A0..A3` 作为当前路径。路径中的 v1 是数据格式标识，与应用版本无关。标准 Root、共享 Root 和配对三点仍按各自几何要求使用八路，不属于兼容分支。

四个接收器取立方体角 0、3、5、6，构成正四面体。生成的 Sender 半径固定为 0.001，放在参考框架下，通过 Position Constraint 只跟随目标位置。它不继承被测 PB 的拉伸/骨骼缩放，因此 Sender 与 Receiver 保持同一缩放基准；整个参考系仍要求正值均匀缩放。

已知半径时，球面方程相减可消掉二次项。四面体对称性给出 `x = -Σ ci di² / (8 b²)`，不需要八路实现中的半径搜索。解出位置后仍回代全部四个距离检查残差，并保留饱和、缺样、非有限值与范围检查。这节省了组件和解算工作，尚未据此宣称任何具体帧率提升。

三个距离通常不能唯一定位：三个球面的交点往往是接收器平面两侧的两个镜像点。已知目标始终处在某个半空间时可以额外选解，但 Avatar/PB 会跨越参考平面，自动猜一侧会跳变。四个非共面接收器避免这个镜像问题。四路模式冗余更少，对噪声和混入的检测能力也更有限；四路一致并不能证明目标身份。不支持缺一路后自动猜解，也不建议把外部 SPS Sender 的未知有效半径硬套进此模式。

### 旋转可观测性与 PB 的真实含义

单个球形 Sender 的距离场具有旋转对称性，增加到八个甚至更多接收器也不能测出球自身旋转。两个不同身份的点给出方向向量，可求轴向 yaw/pitch；绕这条轴的 roll 仍不可观测。三个不共线点可通过轴向归一化、侧向投影正交化与叉积形成完整坐标基，现有配对 Pose 就采用这一方式。不要把接收器数量和被测标记数量混为一谈：4/8 接收器确定一个点，多个被测点才带来朝向信息。

PB 路径不是从 `Stretch` 反推三维坐标。生成链条为“参考原点 → Joint → Grip”，原生 PhysBone 允许抓取 Grip；另一个独立辅助 Sender 跟随 Grip 的实际 Transform，再由四接收器测量。`IsGrabbed` 用作输入门控，松手停止；`Stretch` 仅是额外状态，归一化范围受 PB 配置影响。单个端点相对原点的向量可以描述把手指向，却不等于最后一根骨骼的完整旋转，也不揭示弯曲链每一段的形状。

若要测某根本地骨骼完整旋转，需要在该骨骼上固定两个非共线偏移点，加上原点形成三点；偏移点应跟随骨骼旋转，不能只是固定在参考框架上。若只关心某轴行程，增加三点会增加 Contact、参数与噪声传播，当前没有默认生成这类额外姿态探针。远端旧 SPS 的单个球也不能仅靠本地 PB 获得缺失的朝向信息；PB 是可抓交互输入，不能代替不可观测的远端骨骼。

用户只需选择本地参考框架和目标（或启用自动 PB 手柄），然后在桌面选择对应实例、校准轴向和量程。半径和四个接收器位置由生成器管理，不应逐个手动调整。[PhysBones 官方说明](https://creators.vrchat.com/common-components/physbones/)解释了抓取参数和 Stretch/Angle 的标量含义。

- `Prefabs/SensaAutoSetup.prefab`：自动配置入口，仍可调整目标和能力。
- `Prefabs/SensaLocalPoint.prefab`：带示例 Target 的本地点探针。将 `Target` 引用换成要测量的实际骨骼，设置 Reference；不用移动八个触点。
- `Prefabs/SensaGrabHandle.prefab`：自动生成可抓把手。放置参考原点后，无需逐个配置 PhysBone 或触点。
- 现有 `SensaPoseSocket`、`SensaPosePlug`、`SensaSpsRootProbe` 继续可用。

`Local Bone or PB Probe` 允许指定头像内任意目标 Transform 和参考坐标系；Reference 留空使用组件所在对象。它测量一个点，不提供该点的完整姿态或扭转。测量范围约为参考局部 24 cm；靠近接收器导致饱和时也会无效，不代表在范围内就一定可解算。不能直接读取对方任意骨骼，也不能读取 GPU 顶点形变。

## 桌面端

Unity 资产和桌面程序一起使用当前源码构建。OSC 的“空间诊断”子页会区分：

- `Sensa/SpsRoot/v1/<实例>/<Self|Others>/Root/A0..A7`：标准 Root。
- `Sensa/SharedRoot/v1/<组>/Others/...`：共享阵列，另有 Ready 与 Slot。
- `Sensa/Point/v1/<实例>/Self/Root/A0..A3`：本地骨骼/参考点。
- `Sensa/Handle/v1/<实例>/Self/...`：PB 把手，另有 `Handle_IsGrabbed` 与 `Handle_Stretch`。

Point/Handle 可生成 **Z 位移映射草稿**，或选 X、Y、Z、距原点 Distance。数值是参考局部米，不是插入比例；需要校准量程与方向后保存。多个点/来源同时匹配时拒绝输出，建议限定一个实例并固定来源。PB 松手、缺少采样、拟合无效时停止该精确输入。不能把标准 Root 或共享诊断路径伪装成本地点驱动输出。

OSC 的“量程校准”独立子页提供两点校准：选择 X/Y/Z/距原点，把目标移到期望的 0% 与 100% 位置分别采集，再生成草稿。坐标减小的行程会自动反向；两个位置间距小于 1 mm 时拒绝生成，避免把微小抖动放大成完整行程。采样绑定目标、来源和轴，不能混用；无效坐标或未抓取的 PB 不能采样。采集完成后可以松手再生成草稿。生成草稿后自动返回“参数与映射”，仍需确认目标轴并保存，不会自动启用输入或连接硬件。

面板的 XZ/YZ 投影用于观察偏移；网格范围 ±25 cm 不是有效采样区域保证。三步卡片分别显示起点、终点和实时百分比预览，超出校准量程时显示限制到 0–100% 的提示。失效时清除当前位置显示并禁用采集，保留已记录的端点；目标消失后须重新选择，不静默切换到另一个目标。窄屏使用单列卡片。

一个配置内只能选择一类精确坐标输入（Pose 或 Point），同类多轴必须共享同一个目标路径。没有自动激活硬件，也不会把接收器原始近接值直接当作坐标。

## 验证边界

新增 Unity 测试覆盖本地点、PB 构造、目标筛选/位置继承、独立/互斥/共享开销、切换动画、NDMF 的菜单/参数/FX 合并和参考系选择。桌面测试覆盖接收顺序、抓取门控、松手停止、来源隔离与配置保存。

回归覆盖 Unity EditMode、桌面后端、前端与脚本。Unity 测试包含四面体布局、互斥/共享配置、16 目标选择转换和 NDMF 合并；桌面使用重新采集的四路世界 SDK 数据验证坐标重建，并覆盖 PB 松手停止、过期坐标激活拒绝和元数据不能为坐标续期。两点校准覆盖反向范围、无效采样、目标/来源/轴隔离；浏览器已验证 10 cm → 5 cm 的反向草稿与满量程预览，输入保持关闭。

这不等于完成真实头像上传和双人 PCVR 交互测试。应先在设备断开的情况下测试默认 Off、切换、松手、目标离开范围、重载头像和极端缩放，再决定是否接入输出。OSCLeash 提供了“PB/约束/Contact 转换为 OSC”的设计启发，本实现没有复制其移动控制逻辑，也不会发送玩家行走输入。
