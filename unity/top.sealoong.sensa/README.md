# Sensa — Unity 包

VRChat SPS/OGB/TPS 触点感知桥接，用于在 VRChat 头像上自动生成触点组件。

0.4 新增 [自动 SPS 配置、本地骨骼/PB 测量与共享阵列](AUTOMATION.md)。推荐从 Automatic SPS Setup 组件开始；手动预制件仍保留。

安装前请阅读 [前置依赖、单侧 SPS 根部探针与兼容矩阵](COMPATIBILITY.md)。对方不安装 Sensa 时，可用标准 Root 触点观测相对 XYZ；这不等于完整姿态或准确行程。

Shader 路线见 [SPS GPU 模型探针与桥接设计](GPU-TRACKING.md)：提供编辑器采样源码与离线分析，游戏内 GPU→OSC 桥接尚未实现。

## 依赖

- VRChat 当前支持的 Unity 2022.3 编辑器版本（通过 VCC 选择）
- [VRChat SDK - Avatars](https://creators.vrchat.com/sdk/) 3.7+
- [Modular Avatar](https://modular-avatar.nadena.dev/) 1.10+
- [NDMF](https://ndmf.nadena.dev/) 1.5+

## 安装（VCC）

1. 在 VCC / ALCOM 中添加此 VPM 源：
   - **仓库地址**：`https://sealoong.github.io/Sensa/vpm.json`
2. 安装 **Sensa** 包到你的项目。
3. 在头像的 GameObject 上添加 `Sensa Component` 组件。
4. 在 Inspector 中配置 Socket/Plug 参数。
5. 上传头像——Sensa 会自动生成所需的触点与参数。

## 手动安装

将 `top.sealoong.sensa` 文件夹复制到 Unity 项目的 `Packages/` 目录下。

## 使用说明

参见 [Sensa 主仓库 README](https://github.com/SeaLoong/Sensa)。

## Sensa Pose v1 空间定位（实验性）

旧 `PenOthers`/`PenSelf` 是生成器定义的近接值，不是通用深度或位置坐标。
球形 Receiver 的 Proximity 由到 Sender 最近表面的距离决定，因此相同值可以对应前后、左右等不同位置。
`PenOthersNewRoot/NewTip` 能辅助估算长度，但两路标量仍不能唯一还原三维偏移、轴线和扭转。

这套独立方案使用真正的 **VRCContactSender / VRCContactReceiver**，不使用普通 Unity Collider，也不依赖头像运行自定义脚本。
NDMF 在上传副本上生成组件、移除 Sensa authoring 组件；Inspector 也可把独立 rig 烘焙成包含原生 VRC 组件的 prefab 副本。
它不替代 SPS 的形变系统；现有 SPS 组件可保留。

### 包含的资产

- `Prefabs/SensaPoseSocket.prefab`：Socket 作者预制件。原点位于孔口，+Z 指向孔内。
- `Prefabs/SensaPosePlug.prefab`：Plug 作者预制件，含 Root、Tip、Side 三个标记引用。
- `Profiles/DefaultPair.asset`：Others 配对示例，通道 `Pair01`。
- `Profiles/SelfTest.asset`：Self 校准示例，通道 `SensaCalibration`。
- `Tests/Editor`：预制件导入、生成组件及非均匀缩放拒绝的 EditMode 测试。

可通过 `GameObject > Sensa > Spatial Pose Socket / Plug` 创建；`Local Calibration Pair` 会在当前选中对象下创建 Self 测试对。
这些是可编辑的作者预制件，上传时才展开接收阵列。独立烘焙时所有标记必须在 prefab 内部；引用头像外部骨骼时，应让完整头像的 NDMF 流程处理。

### 配置顺序

1. 将 Socket prefab 放在目标孔口。移动/旋转整个对象，让 +Z 指向内部。Scene 视图会显示孔口圆、方向箭头和 A0…A7 锚点。
2. 将 Plug prefab 放在目标 Pen 根部，把 Tip 对齐实际尖端、Side 放在根部旁边。也可把标记引用改为实际骨骼上的子对象。Root–Tip 决定轴线，Side 决定扭转，不应与轴线重合。
3. 复制 `DefaultPair.asset` 到 `Assets` 创建自己的配对配置。双方使用相同、大小写一致的通道；其他配对使用不同通道。一个 Socket 阵列同一时刻只应接收一个同通道 Plug。
4. 自插或同头像测试启用 Self；他人交互启用 Others。两者可同时启用，但采样数翻倍。确保 VRChat 的交互权限允许这次接触。
5. 保持 rig 及所有父级为正的均匀缩放。整体均匀缩放可调整捕捉体积和孔口尺寸；不要单独移动阵列锚点或改变接收半径，这会破坏 v1 的几何约定。
6. 上传后启用 OSC。Sensa 的“空间定位”面板应出现完整 `24/24` 样本。先在输入关闭时观察正视/侧视图与数值，再生成深度映射草稿并保存。六轴映射需要按设备安装方向校准，不是机械平台逆运动学求解器。
7. 若多个 OSC 来源同时存在，在参数工作台固定“使用来源”。精确模式不会跨来源、跨 Socket 混合坐标。

若新增路径未出现，检查 VRChat 当前头像的 OSC 输出配置是否包含这些新参数，再重新加载头像；不要直接覆盖已有的自定义 OSC 配置。

### 几何与数据

每个标记有 8 个球形 Receiver，位于 Socket 局部坐标 `(±0.06, ±0.06, ±0.06)`；半径为 `0.35`。
三种标记分别使用独立的碰撞标签，Sender 是半径 `0.001` 的小球。
接收器均为本地 Proximity；生成的 MA 参数使用 **Float + localOnly**，不是 `NotSynced`（后者其实表示 Animator Only，不注册 Expression Parameters）。

```text
碰撞标签：SensaPoseV1_<channel>_Root / Tip / Side
OSC 参数：Sensa/Pose/v1/<instance>/<Self|Others>/<Root|Tip|Side>/A0…A7
```

单位均为 Socket 局部 Unity 单位，默认缩放下 1 单位相当于 1 米；不是世界坐标。
对于未饱和的球形采样，近接值 `p` 对应表面距离 `0.35 × (1 − p)`。后端联合拟合标记球半径（0…0.02 局部单位）与中心位置，减少双方缩放不同时的半径偏差。
8 个非共面距离约束用于定位一个标记，额外约束产生拟合残差。

Root 到 Tip 给出 Pen 轴线；轴线与 `Z=0` 孔口平面的交点给出横向偏移。
插入比例为 `clamp(Tip.z / (Tip.z − Root.z), 0, 1)`，因此轴线穿过同一孔口时，横向偏移不会再被直接当成深度缩短。
Side 标记用于计算扭转；偏航/俯仰来自轴线方向。
当前控制条件为交点在半径 `0.04` 的孔口内、入射角不超过 65°、尖端进入正 Z，且三标记拟合有效。
任一路缺失、饱和或拟合残差超过 `0.002` 时拒绝输出；定位中心还需在约 `0.245` 的有效范围内。

### 限制与校准

- **不能从旧的一个 OGB 参数恢复不存在的信息。** 精确定位必须使用配套标记与阵列；与仅提供 TPS/OGB 标签的任意 Avatar 交互时仍是旧兼容模式。
- Contact 在多个同标签 Sender 中选择最近者，不提供对方身份。不同接收器可能选中不同目标。残差可以拒绝部分不一致数据，但不能检测所有混合情况；单目标、独立通道是必要前提。
- 重建的是三个标记的相对位置和直线轴近似，不是弯曲网格的完整表面。骨骼引用、形变和运行时非均匀缩放会影响结果。
- SPS 在 GPU 上产生的网格弯曲不会自动移动 Unity Transform/Contact。没有跟随形变的骨骼标记时，本方案不能测出着色器变形后的真实尖端或表面；也不会把拟合出来的直线当作完整曲线。孔口圆是控制用的虚拟边界，不是自动扫描出的网格开口。
- OSC 多参数不是原子姿态帧。Sensa 合并约 30ms 的更新再解算以缓解分包；快速运动、丢包和旧值仍可能造成误差。冻结 UI 预览不影响实际输入/输出。
- 残差只是模型一致性指标，**不是实际定位误差或置信概率**。小残差也不能证明标记安装正确。
- 本地数学测试覆盖同距离前后歧义、横向偏移、倾斜、扭转、不同球半径、缺失/饱和和合成噪声。合成结果不能当作 VRChat 实机毫米级精度承诺。
- 每组 Self/Others 使用 24 个 Contact，Plug 使用 3 个 Sender；启用两组共 48 个 Receiver。本地 Contact 仍有计算开销，并受 SDK 总数限制。

建议先用 Self 校准对：沿 Z 平移、保持深度横移、绕孔口倾斜、绕轴旋转，逐一核对面板；再测试 Others、不同 Avatar 缩放、接触退出和第二个同通道目标。
可用 `Tests/Editor` 的 Unity Test Runner 测试验证导入与生成，但还需真实 VRChat 联调。开发环境未安装 Unity 时，仅能验证资产结构、SDK API 与数学模型。
运行包内测试时，在测试项目的 `Packages/manifest.json` 添加 `"testables": ["top.sealoong.sensa"]`，并安装 Unity Test Framework，然后在 EditMode 测试中运行 `SensaPoseTests`。

参考：[VRChat Contacts](https://creators.vrchat.com/common-components/contacts/)、[OSC Avatar Parameters](https://docs.vrchat.com/docs/osc-avatar-parameters)、[MA Parameters](https://modular-avatar.nadena.dev/docs/reference/parameters)、[VRCFury SPS](https://vrcfury.com/sps/)。
