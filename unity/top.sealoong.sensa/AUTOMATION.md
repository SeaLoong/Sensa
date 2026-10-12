# 自动配置、本地骨骼测量与 PB 把手（0.4）

## 最少操作的安装方式

在 Avatar 根对象添加 **Sensa > Automatic SPS Setup**，点击“检查目标、自动位置与 Contact 开销”。默认发现头像内的 VRCFury SPS Socket/Plug，为 Socket 生成标准 Root 诊断阵列；其他能力按需要开启。也可以直接把组件加到单个 SPS 对象：Reset 会把选择范围限定为该对象，单 Plug 默认开启配对标记。

上传/NDMF 构建时读取 SPS 的原点、旋转与长度，生成原生组件，然后移除 Sensa 作者组件。无需手动摆接收器。原头像资产不被写回，原 SPS 的形变组件不被移动。未知的 VRCFury 几何接口会报错，不静默猜测位置。

已核对环境：Unity 2022.3.22f1、Avatars SDK 3.10.5、VRCFury 1.1434.0、MA 1.18.7、NDMF 1.14.8。自动 SPS 配置需要 VRCFury 作者组件；仅有旧 Shader/灯光的对象不会被自动识别。普通本地骨骼/PB 探针不依赖 VRCFury。头像与世界必须使用独立项目，不能混装两个 SDK。

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
| Dedicated | 8N | 最多 8N | 每个位置独立，无切换等待；默认推荐 |
| Exclusive | 8N | 8 | 自动生成本地选择菜单和 FX 动画，只启用一个位置；减少活动开销，不减少注册总量 |
| SharedRootArray | 8 | 8 | 一个阵列由辅助 Parent Constraint 跟随选定位置；最多 16 个同缩放目标 |

共享只支持标准 Root 诊断，不支持配对三点运动输出，也不同时测多个 Socket。它移动的是 Sensa 辅助阵列，不移动 SPS Socket。约束与 Animator 本身有开销，Contact 数量下降不等于所有场景帧率必然提高。

Exclusive/Shared 生成 `Sensa <组名>` 菜单，默认 Off。该菜单选择的是测量位置，**独立于 SPS 自带开关和 Auto Mode**；不会修改 SPS 的标签、Guided Path 或视觉启用逻辑。Dedicated 的生成对象继承所在 GameObject 的激活状态，但不能保证跟随 VRCFury 内部生成对象的所有开关。

共享切换过程：关闭接收器 → Ready=false、写入槽位、清零 8 路 → 等待 0.25 秒 → 启用接收器并设置 Ready=true。桌面按接收序号拒绝旧槽位采样，毫秒时间戳相同也不会放行旧值。它仍不是原子网络事务；OSC 丢包/乱序和约束时序需要客户端测试，因此共享模式保持诊断用途，不直接驱动设备。

每个本地点/PB 把手另需 8 Receiver + 1 Sender；每个把手另有 PhysBone 和可见网格。构建前及 NDMF 优化阶段检查总 Contact 预算。共享目标必须与 Avatar 根保持相同正值均匀缩放；不同缩放用 Dedicated。运行时极端缩放、组件被禁用和多同标签 Sender 混入仍需单独验证。

## 手动预制件与骨骼组件

- `Prefabs/SensaAutoSetup.prefab`：自动配置入口，仍可调整目标和能力。
- `Prefabs/SensaLocalPoint.prefab`：带示例 Target 的本地点探针。将 `Target` 引用换成要测量的实际骨骼，设置 Reference；不用移动八个触点。
- `Prefabs/SensaGrabHandle.prefab`：自动生成可抓把手。放置参考原点后，无需逐个配置 PhysBone 或触点。
- 现有 `SensaPoseSocket`、`SensaPosePlug`、`SensaSpsRootProbe` 继续可用。

`Local Bone or PB Probe` 允许指定头像内任意目标 Transform 和参考坐标系；Reference 留空使用组件所在对象。它测量一个点，不提供该点的完整姿态或扭转。测量范围约为参考局部 24 cm；靠近接收器导致饱和时也会无效，不代表在范围内就一定可解算。不能直接读取对方任意骨骼，也不能读取 GPU 顶点形变。

## 桌面端

使用配套的 Sensa 0.4 或更新版本。OSC 页“根部与本地点测量”会区分：

- `Sensa/SpsRoot/v1/<实例>/<Self|Others>/Root/A0..A7`：标准 Root。
- `Sensa/SharedRoot/v1/<组>/Others/...`：共享阵列，另有 Ready 与 Slot。
- `Sensa/Point/v1/<实例>/Self/Root/A0..A7`：本地骨骼/参考点。
- `Sensa/Handle/v1/<实例>/Self/...`：PB 把手，另有 `Handle_IsGrabbed` 与 `Handle_Stretch`。

Point/Handle 可生成 **Z 位移映射草稿**，或选 X、Y、Z、距原点 Distance。数值是参考局部米，不是插入比例；需要校准量程与方向后保存。多个点/来源同时匹配时拒绝输出，建议限定一个实例并固定来源。PB 松手、缺少采样、拟合无效时停止该精确输入。不能把标准 Root 或共享诊断路径伪装成本地点驱动输出。

一个配置内只能选择一类精确坐标输入（Pose 或 Point），同类多轴必须共享同一个目标路径。没有自动激活硬件，也不会把接收器原始近接值直接当作坐标。

## 验证边界

新增 Unity 测试覆盖本地点、PB 构造、目标筛选/位置继承、独立/互斥/共享开销、切换动画、NDMF 的菜单/参数/FX 合并和参考系选择。桌面测试覆盖接收顺序、抓取门控、松手停止、来源隔离与配置保存。

这不等于完成真实头像上传和双人 PCVR 交互测试。应先在设备断开的情况下测试默认 Off、切换、松手、目标离开范围、重载头像和极端缩放，再决定是否接入输出。OSCLeash 提供了“PB/约束/Contact 转换为 OSC”的设计启发，本实现没有复制其移动控制逻辑，也不会发送玩家行走输入。
