# Sensa SPS 根点：四个 P 与 Sample

**简体中文** | [English](positioning.en.md)

Sensa SPS 测量自己选定 Socket／Plug 根中心的 **AvatarRootLocal** 坐标。四个固定接收器和专用小球共用 Avatar 根尺度；坐标不是世界运动、设备回读或 GPU 形变表面。只支持当前五字段契约，不读取、转换或回退任何旧 Sensa SPS 数据。[使用方案](usage-scenarios.md)

用[交互参数图示](parameter-geometry.html?lang=zh-CN)移动根点，查看四路近接量、局部坐标与饱和边界。它是模型演示，不是客户端测量结果。

## 每对象测量契约

```text
Sensa/SPS/<id>/P0
Sensa/SPS/<id>/P1
Sensa/SPS/<id>/P2
Sensa/SPS/<id>/P3
Sensa/SPS/<id>/Sample
```

P0–P3 是四个 Float Proximity。Sample=0 表示停用或内部守卫失效；活动值依次为 n/32（n=1…32），约每 0.05 秒更新，1.6 秒循环。Sample 活动仍不代表几何有效：四路必须完整、非有限值被拒绝、接近度未饱和，并通过范围与拟合检查。

Contact 先写内部 RawP，FX 在同一状态入口依次复制四路 P，再写 Sample。RawP 只声明为 FX Float，不登记在 Modular Avatar 表达参数；最终 NDMF 合同检查其仍可被 Contact 写入，并且只有五个测量字段导出到表达参数。它不是客户端 OSC 隐私承诺。[作者端](../unity/top.sealoong.sensa/AUTOMATION.md)

## 菜单控制不属于测量值

“五字段”只限定每对象的测量契约，不代表整个 Avatar 只有五个表达参数。Automatic Exclusive 另登记 `Sensa/Select/<group>`：Int、本地不同步、不保存，显式默认 0；0 为 Off，1…N 选择已排序目标，超出范围保持或回到 Off。它是菜单控制，可能按客户端配置通过 OSC 导出；Dedicated 不生成此自动选择参数。独立 Shader 作者也有 `Sensa/Select/ShaderCapture_<id>` 的 0／1 开关。选择菜单不会启用桌面输入或连接设备。

## 四个距离怎样解一个点

共享几何见 [SensaFixedAnchorProtocol](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs)。中心 c=(0,1,0)，半跨度 h=0.5：

| 点 | 固定锚点 aᵢ |
| --- | --- |
| P0 | (-0.5, 0.5, -0.5) |
| P1 | (0.5, 0.5, 0.5) |
| P2 | (0.5, 1.5, -0.5) |
| P3 | (-0.5, 1.5, 0.5) |

已知 Receiver 半径 R=2.5、专用 Sender 半径 r=0.001，未饱和时：

```text
dᵢ = R(1-pᵢ) + r
bᵢ = aᵢ-c
q = -Σ(bᵢ × dᵢ²)/(8h²)
position = c+q
residual = sqrt(Σ(|position-aᵢ|-dᵢ)²/4)
```

四个已知非共面锚点对同一个已知半径标记的距离足以求 XYZ。零值／满值只能给边界或包含关系，不能当普通距离。0.01 的残差阈值检查模型一致性，不证明准确度。[解算实现](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedAnchorReconstruction.cs)

## 覆盖、尺度与保留当前半径的理由

有效覆盖是四球交集，再扣除饱和区域和数值边界。显示／解算的中心各轴 ±1.5 不保证整个立方体可测。例如相对中心 (0,0,1.5) 的最远锚点距离约 2.121，R=2.5 能覆盖，R=2.0 则不能。

较小 R 改善同一 Proximity 噪声对应的距离误差，却缩小覆盖；较宽锚点改善远离中心的条件数，却也缩小共同覆盖。中心的距离雅可比条件数为 1。在上述 Z 偏移处，h=0.5 的条件数约 3.742；h=0.75 可降到 2.517，但最远距离升到 2.487，几乎耗尽 R=2.5 的余量。因此保持 R=2.5、h=0.5、r=0.001，不将一种局部优化宣称为整体最优。[推导与证据](fixed-anchor-research.md)

统一尺度 s 未触发限幅时：

```text
p = 1-(s*d-s*r)/(s*R) = 1-(d-r)/R
```

得到的是作者根局部单位，仅 s=1 时对应世界米。VRChat 世界半径上限为 3 m；构建拒绝非正／非均匀根尺度、根 ScaleConstraint 和根缩放动画，内部 ScaleFactor 守卫将支持半径限制在约 2.999 m。守卫失效关闭 Contacts、清零 P 和 Sample。公开数据不再重复传输 Scale，守卫仍保留。[官方 Contacts](https://creators.vrchat.com/common-components/contacts/)

## 目标、时间与停止

每个目标使用独有 collision channel 和只接收自己的本地小球；ParentConstraint 跟随明确根中心，不继承目标骨骼缩放。Dedicated 可同时观察独立目标，Exclusive 一次选择一个、初始 Off。没有远端接收组或共享移动根阵列。

桌面按同一来源、唯一实例分组，检查合法 Sample 的**内容变化时间**。静止 P 可缓存；不断重发同一 Sample 不续期。活动时效上限 1250 ms，正值输入超时可更严格。缺字段、Sample=0、超时、饱和或几何不一致都会阻断／停止；实验许可和输入启用仍是两个独立的明确操作。

Sample 最后写入也不构成原子 OSC 提交。时间差、丢包和乱序仍可能混合样本，活动计数不证明 Contact 物理采样持续刷新。Point／Handle／Pose 是独立实验，继续使用最旧参与通道时效，不使用此缓存规则。

本轮不凭未测抖动添加滤波。若以后采用位置滤波，应先验证原始样本、单独测量误差与延迟，并让 Sample=0／过期／门控立即停止；不能把失效状态平滑掉。

## 独立 Shader 根点

Shader 路线直接编码所选 CPU 根的 AvatarRootLocal XYZ。公开路径为 `Sensa/Shader/<id>`，仅 Frame、X、Y、Z、Valid 五字段；producer ID 留在编码与地址中。显式区域桥接验证 RGB／CRC、身份、帧进展和恢复状态后，按该顺序发一个 OSC bundle。桌面要求同来源连续字段与变化 Frame 的 500 ms 内时效；拟合残差显示“—”，因为此路线没有四球距离拟合。

合成／模型图像使用独立诊断命名空间，不能映射运动。CRC 和 producer ID 不是所有者认证；真实相机可见性、其他 Avatar 混合和桌面／头显表现仍需客户端验收。[Shader 指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)

## 单点的限度

一个根点不提供尖端、朝向、扭转、精确插入比例或最终变形网格。整个 Avatar 的共同平移和旋转不改变相对距离。专用小球减少普通 Contact 的身份歧义，但不是认证协议。两点校准只定义映射，不补足缺少的观测。

单元、EditMode 和 CI 协议模拟各有范围，不能替代上传、真实 Contacts／OSC、GPU 画面或硬件验收。[研究记录](fixed-anchor-research.md) · [功能参考](features.md)
