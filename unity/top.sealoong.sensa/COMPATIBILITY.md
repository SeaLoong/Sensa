# 安装依赖与单侧 SPS 定位

本页区分已实现能力与研究方案。单侧根部探针已实现；胶囊轴线、远端 Socket 法线解算尚未实现。Unity 导入、上传及 VRChat 双人实测仍需验证，合成数据测试不能代替真实精度测试。

## 前置依赖

| 环节 | 必需 | 说明 |
| --- | --- | --- |
| Unity 项目 | VCC/ALCOM 管理的 Avatars 项目、VRChat 当前支持的 Unity 2022.3 编辑器版本 | 不要仅因版本号更高就改用 Unity 6；以 VCC 的 SDK 支持版本为准 |
| 包依赖 | VRChat Avatars SDK、Modular Avatar、NDMF | package.json 声明下限分别为 3.7.0、1.10.0、1.5.0；这些是依赖解析下限，不是逐版本实测承诺。本次组件 API 核对使用 SDK 3.10.5；建议由 VCC 安装相互兼容的新版本 |
| 自动生成 | 保留上述依赖，上传时运行 Sensa NDMF 构建插件 | 作者 prefab 不是已经烘焙好的 Contact；菜单可另存烘焙副本。副本仍包含 MA 参数组件，不能因此卸载 MA/NDMF |
| SPS 视觉形变 | 需要时另外安装 VRCFury 并设置 SPS | Sensa 不包含形变 Shader；本地探针本身不引用 VRCFury 程序集 |
| 桌面端 | 支持该协议的 Sensa 桌面程序；VRChat 开启 OSC 并允许参数输出 | Windows 自包含发布包不要求另装 .NET SDK；从源码构建需要 global.json 指定的 .NET 10 SDK 与 Node/npm |
| 设备输出 | 选择对应传输；使用 Intiface 时另装并运行 Intiface Central | 单纯检查定位不需要连接设备；先保持输入停用、设备断开 |
| 对方头像 | 相应标准 Sender 必须存在、启用且允许交互 | 不需要对方安装桌面端或共享 OSC；只能读取自己头像的 Receiver 输出 |

手动复制包不会自动补齐所有 VPM 依赖，优先通过 VCC/ALCOM 安装。Gesture Manager 仅为可选编辑器调试工具。当前探针以 PC 头像为目标；所核对 VRCFury 的 Sender 工厂仅在 Desktop 构建生成 Contact，不能承诺 Android/Quest 对等支持。

## 如何选择

| 对方提供的信息 | 自己安装 | 当前能得到 | 不能得到 |
| --- | --- | --- | --- |
| 标准 `TPS_Pen_Root` 小球 | `SensaSpsRootProbe.prefab` | 根部相对 XYZ，诊断横移/前后位置 | 真实尖端、轴线、扭转、插入比例；不自动驱动输出 |
| Sensa Root/Tip/Side 三个标记 | `SensaPoseSocket.prefab`，通道一致 | 三点直线模型的相对位置和姿态 | GPU 形变后的曲线表面、可靠的远端玩家身份 |
| 只有旧长度球或旧 OGB 标量 | 现有 OGB/SPS 预设 | 粗略接近/长度归一化信号 | 唯一三维位置与方向；不能宣称已解决角度偏差 |
| 纯 DPS 灯光、没有相关 Contact、关闭交互 | 无法靠本地 Receiver 补出远端 Sender | 无可靠 Contact 观测 | 单侧通用定位 |

“SPS 新版本”“能看到形变”不等于“存在所需 Contact”。SPS2 形变本身不依赖 Contact；旧头像也不保证提供 Root 标签。兼容条件以实际触点为准，而不是只判断版本名称。

## 单侧探针安装

1. 在自己头像骨骼下放置 `Prefabs/SensaSpsRootProbe.prefab`，或使用 `GameObject > Sensa > Single-sided SPS Root Probe`。
2. 原点对齐希望作为参考的 Socket，+Z 朝内，X/Y 为横向。保持整个父级链正值均匀缩放。读数单位是探针局部米；整体缩放 2 倍时，局部 1 cm 对应世界 2 cm。
3. 默认使用 `DefaultPair` 的 Others 设置，仅生成 8 个本地 Proximity Receiver。若要 Self 测试，复制 Profile 再改 Self/Others，避免改变共享资产。开启两者生成 16 个。标准 Root 模式不使用 Profile 的 channel 筛选玩家。
4. 每个探针使用唯一 instanceName。与旧配对探针共存时也应避免重名。Contact 总数需保留其他插件的余量；Sensa 构建时检查现有触点与本插件新增量，但其他插件后续添加的触点仍需检查最终头像。
5. 上传后开启 VRChat OSC，确认交互权限和远端 Sender 启用。OSC 路径为 `Sensa/SpsRoot/v1/<instance>/<Self|Others>/Root/A0..A7`，导出到 Sensa 默认接收端口。参数使用 Float、localOnly，不需要网络同步给对方。
6. 在桌面 OSC 页查看“单侧 SPS 根部定位”。8 路完整且处于有效范围才显示位置；0/1 截断、缺路、拟合不一致或半径达到上限均拒绝显示有效结果。这里没有自动生成行程映射按钮。

采样几何与 Pose v1 相同：8 个 ±6 cm 立方体顶点、35 cm 接收半径，根部球心需在约 24 cm 有效范围内；拟合球半径 0–2 cm（相对探针缩放）。距离过近导致某路饱和时，即使视觉很近也不能求解。空白表示还没有收到本地参数，不是已经证明对方不兼容；全部为零可能是离开范围、禁用交互、缺 Sender 或未开启组件。

同标签多个 Sender 会让不同 Receiver 选中不同目标。球形拟合残差只能拒绝部分混合情况，不能证明来自同一个人。一次仅保留一个目标在采样范围内。OSC 值变化才发送，静止参数不等于断线；本诊断也不提供连接存活保证。

## 为什么 NewTip 不是真实尖端

核对 VRCFury 源码版本 `d048773de971881fb14c5f3b468e59ba2406a2dd`：

- `TPS_Pen_Penetrating`：以 Plug 根部为中心、半径等于长度的球，名称为 Length。
- `TPS_Pen_Width`：同心球，半径为 `max(0.01, length - 2 * radius)`。
- `TPS_Pen_Root`：根部附近半径 1 cm 的球。
- `TPS_Pen_Close`：沿轴线的 Envelope 胶囊。

因此 OGB 的 NewRoot/NewTip 接收器名称不代表两个空间端点。对于同心球，任意旋转轴线都保持所有球面距离不变。增加接收器可恢复球心，却无法凭空恢复方向。长度球还会覆盖近处探针使采样饱和，所以本次没有把它当成第二个点或直接送入小球解算器。

## 后续单侧实现路线

1. **本地 Socket + 远端 Root/Close**：先用 Root 阵列定位根部，再以多个非共面接收器采样 Close 胶囊，拟合轴线、半径、长度。必须分别测试只接触侧壁、端帽不可见、球形退化、多目标混入及缩放；只有端部信息充分时才能估计长度，圆柱/胶囊的轴向旋转始终不可观测。需要增加阵列尺寸或分层布点，做条件数/可观测性检查，不能只用低 RMS 判断唯一解。
2. **本地 Plug + 远端 Socket Root/Front**：标准 `TPS_Orf_Root` / `TPS_Orf_Norm` 是相距约 1 cm 的两个小球，可分别用阵列定位后估计法线。短基线会放大噪声：毫米级点位扰动即可产生明显角度误差；法线绕自身的扭转仍不可观测。必须独立设计基线质量门限和局部 Plug 长度校准。
3. **已知长度、人工对准假设**：根部 Z 可以辅助粗略轴向估算，但一旦对方倾斜假设即失效。若将来提供，应显式命名“估计”、由用户启用，并禁止接管要求完整姿态的映射；本版不自动采用。

上述两种几何路线都观测 Contact/bone，不是 SPS Shader 形变后的真实曲线。Avatar 不能通过运行任意 C# 或读取对方私有 OSC 来弥补缺失信息。世界 Udon 的能力也不能直接当作头像组件能力使用。

## 依据与验证

- [VRChat Contacts：形状、Proximity 和交互限制](https://creators.vrchat.com/common-components/contacts/)
- [VRCFury SPS：SPS2 与 Contact/旧版兼容的区别](https://vrcfury.com/sps/)
- [Plug Sender 生成源码（固定版本）](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs)
- [Socket Sender 生成源码](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs)

已增加桌面合成几何、缺样/截断/来源隔离测试和 Unity 生成测试。实际验收还需在 Unity 执行 EditMode 测试，并用单个默认 SPS 目标记录前后移动、横移、旋转、进出范围和多目标场景；全程先断开硬件，核对数据再决定是否启用现有输出。
