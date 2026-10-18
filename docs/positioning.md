# 定位能测到什么

**简体中文** | [English](positioning.en.md)

当前 Contact 定位是**实验性的参考局部估计**，默认不允许驱动输出。增加接收器或得到很低的拟合残差，都不能把普通 VRChat Proximity 变成可靠的位置传感器。

## 四个距离够不够？

如果四个已知锚点不共面，四路都是**同一时刻、同一个点的真实距离**，距离标定和单位正确，那么足以唯一确定该点相对锚点的 XYZ。数量本身不是问题。

设锚点为 `c0..c3`、目标为 `x`、距离为 `d0..d3`：

```text
|x - ci|² = di²
2(ci - c0) · x = |ci|² - |c0|² - (di² - d0²), i = 1..3
```

相减后是三个线性方程。锚点差向量张成三维空间时能求出唯一 XYZ；共面、接近共面或噪声很大时会有歧义或不稳定。一个球心仍不提供朝向；要恢复姿态，还需要可信的方向或多个有身份的标记。

整体平移或旋转锚点和目标不会改变任何距离。因此，自己与参考骨骼一起移动时，本地读数可能不变；它无法独立恢复世界位移。

## 现有代码怎么做？

Unity 构建器为 Point／Handle 生成四面体接收阵列，为 Root 生成八点阵列，为 Pose 的 Root／Tip／Side 分别生成八点阵列。原始输入是接近度，不是直接的 XYZ。

对于已知球形 Sender、接收器半径 `R`、Sender 半径 `r`、未截断的近接值 `p`，实现按 `d = R × (1 - p) + r` 转换成球心距离，再拟合局部位置。标准 Root 的半径作为待拟合量；Pose 再用三个拟合点估计直线轴、孔口平面交点和姿态。它没有测量形变后的网格表面。[几何实现](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/PoseReconstruction.cs)、[点位观测](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SpsPositionTracking.cs)、[Unity 协议常量](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaPoseProtocol.cs)

观测明确标记 `Experimental=true`、`CoordinateFrame=ReferenceLocal`。单位是参考局部米，不是无条件的世界米。正确的尺寸、正值均匀缩放和组件生成参数仍是必要条件。

## 为什么仍然不可靠？

| 缺失的保证 | 实际后果 |
| --- | --- |
| 同一 Sender | Proximity 对每个接收器返回最近的匹配 Contact；不同接收器可能选到不同目标 |
| 同一帧 | Avatar OSC 参数分别更新，现有距离协议没有 frameId 或完整采样批次 |
| 几何模型正确 | 球、胶囊、半径、缩放不一致会破坏“球心距离”解释 |
| 完整量程 | 0／1 饱和丢失距离信息；仅四个数值非零也不充分 |
| 世界参考 | 相对距离看不到整体刚体运动；骨骼参考不等于世界坐标 |
| 真实表面 | 参考骨骼与 SPS Shader 形变曲线可能不同 |

VRChat 官方将 Proximity 定义为到 Sender 最近表面的近接度，多目标时选最近 Contact；Avatar Receiver 写 Animator 参数，普通参数输出没有附带目标身份。[官方 Contacts 文档](https://creators.vrchat.com/common-components/contacts/)

项目的 `NearestOfSeveralSendersCanProduceAZeroResidualGhost` 回归给出了四点和八点反例：每路来自不同 Sender，却恰好符合一个不存在的球心，残差为零。具体构造是把每个 Sender 放在对应锚点位置的两倍处：接收器在 aᵢ，Sender 在 2aᵢ，每路最近距离为 |aᵢ|，与原点放一个球得到的距离完全相同。当前 ±6 cm 锚点下，真实 Sender 距原点约 20.8 cm，解算却落在空原点。因此“拟合通过”只证明数值符合模型；八点冗余不能证明身份，也不能证明同帧。[反例与时效契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/SpatialContracts.cs)

## 本版如何处理？

- 默认 `osc.allowExperimentalSpatialInput=false`。旧 SensaPoint／SensaPose 映射也不能绕过它；没有默认定位预设。
- 仍保留观测、残差和高级实验校准。实验输入开启后还需完整、未过期的几何、正确来源及有效门控；Root／SharedRoot 仍仅诊断。
- 时效使用**所有参与通道中最旧的时间戳**，Handle 还包括抓取状态。空间默认上限为 1000 ms；正值 `inputTimeoutMs` 覆盖它。只刷新一路不能替其他坐标续期。
- 超时、不完整、无效或关闭实验输入会阻断空间输出，不回退旧标量来伪装有效定位。实验开关不是可靠性认证。
- VRChat 增量 OSC 可能不重发静止值，所以即使画面静止合理，实验估计也可能过期；不能靠延长到无限或伪造新时间戳证明数据新鲜。

状态与门槛由[运行时](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs)和[配置](https://github.com/SeaLoong/Sensa/blob/main/src/Configuration/AppConfig.cs)执行。

日常控制优先使用含义明确的标量：手动、funscript、原生 PB Stretch／IsGrabbed，或明确接受其局限的 SPS 径向估算。PB Stretch 是 PhysBone 自身的标量，不宣称为 XYZ。[预设](presets.md)

## 可靠定位需要怎样重做？

下一步应先得到可信的数据生产者，而非继续堆叠无身份距离值。建议契约为：

1. 一个已标定生产者输出同一批次的 XYZ，明确米制单位、参考坐标系、目标／参考身份和标定标识。
2. 每批带单调 `frameId`、有效状态和可核查的新鲜度；位置、状态和身份原子接收，拒绝乱序、部分更新和旧帧。
3. 需要六轴时提供经过标定的方向／四元数，或同帧且能区分身份的多个标记。
4. 明确过期、生产者断开、标定变化和越界时的停止行为，再用记录的真实轨迹验证误差。

这只是后续实现条件，当前没有这样的通用生产协议。Avatar 不能运行任意桌面 C#；世界 Udon 的对象访问也不能直接迁移到 Avatar。现有 Shader 工具能检查编辑器模型快照或图像传输，尚未建立可靠的通用 VRChat 实时 SPS 表面定位链路。[Shader 实验边界](../unity/top.sealoong.sensa/GPU-TRACKING.md)

[使用指南](guide.md) · [功能参考](features.md)
