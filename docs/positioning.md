# 根点定位：固定几何、坐标和有效性

**简体中文** | [English](positioning.en.md)

Sensa SPS 现在测量**选定 SPS Socket／Plug 根中心在 AvatarRootLocal 中的坐标**。根点来自已解析的真实作者位置，再由专用小球跟随；四个接收器固定在 Avatar 根下。原始 OGB 近接、三点姿态实验和此专用协议不互相替代。[三条实际路线](usage-scenarios.md)

## 四个距离怎样还原位置

已知四个非共面锚点到**同一个点**的真实距离可以解相对 XYZ。四面体以 `c=(0,1,0)` 为中心、半跨度 `h=0.5`：

| 编号 | 固定锚点 aᵢ |
| --- | --- |
| A0 | (-0.5, 0.5, -0.5) |
| A1 | (0.5, 0.5, 0.5) |
| A2 | (0.5, 1.5, -0.5) |
| A3 | (-0.5, 1.5, 0.5) |

对未饱和 Proximity `pᵢ`，接收半径 `R=2.5`、专用 Sender 半径 `r=0.001`，球心距离为 `dᵢ=R(1-pᵢ)+r`。令 `bᵢ=aᵢ-c`，则：

```text
q = -Σ(bᵢ × dᵢ²) / (8h²)
position = c + q
residual = sqrt(Σ(|position-aᵢ|-dᵢ)² / 4)
```

Unity 作者与桌面直接共享同一个 [SensaFixedAnchorProtocol](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs)，没有两套可独立漂移的几何设置。接受范围还要满足四路未饱和、共同覆盖、局部边界及残差阈值；0.01 的拟合阈值不是准确度证明。[桌面解算](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedAnchorReconstruction.cs)

## 覆盖、缩放和单位

- 覆盖区域是四个半径 2.5 球的交集。±1.5 局部边界用于限制解算和显示，不表示其整个立方体均有采样。
- VRChat 将缩放后 Contact 世界半径限制为 3 m。作者拒绝初始超界／非均匀缩放，FX 同时检查真实 `ScaleFactor` 与作者根缩放；超过余量前关闭 Contact、清样本并将 Valid 置 false。[官方 Contacts](https://creators.vrchat.com/common-components/contacts/)
- 在没有半径限幅的统一缩放下，共同缩放因子在近接比例中相消，得到作者 Avatar 根局部单位。它不是世界米、设备厘米，也不能恢复 Avatar 的整体世界平移／旋转。
- 界面以“本地单位”展示新根点与 Shader 坐标。映射通过实际两端校准，不把原始局部 Z 无条件当作机械行程。

## 专用根点的生产端约束

每个目标独立 collision channel；构建时检查本地重名 Sender。小球位于 Avatar 根测量组中，以 ParentConstraint 跟随明确选中的根中心，避免继承目标骨骼缩放改变已知半径。不靠一个通用 TPS 标签猜测目标，也不用普通 1 cm SPS 根球替代专用标记。

Dedicated／Exclusive 自动作者为 Socket 和 Plug 都创建固定根组。一个默认 Self 组占 5 个 Contact；远端诊断另加 4 个 Receiver。Others 的 Valid 始终 false，因为多个 peer、不同尺度和相同通道仍可能混合；普通旧 Avatar 不会自动变成此协议的生产者。

```text
Sensa/SpsRoot/v1/<id>/Self/Root/A0 ... A3
Sensa/SpsRoot/v1/<id>/Self/Profile = 1
Sensa/SpsRoot/v1/<id>/Self/Valid
Sensa/SpsRoot/v1/<id>/Self/Scale
Sensa/SpsRoot/v1/<id>/Self/Heartbeat
```

元数据在 Self 层，只有 A0–A3／RawA0–RawA3 在 Root 层。旧八路根数据缺少新配置时无效，不作为兼容坐标猜解。

## 静止、时间与停止

FX 每 0.05 s 将四个内部 RawA 参数复制到公开 A 参数，再写元数据。Heartbeat 为 32 步归一化计数，完整周期 1.6 s 大于 1250 ms 最大存活窗，降低二值翻转与 OSC 采样别名。桌面使用**内容变化时间**，不断重读或转发同一心跳不会续期。

静止范围可以缓存，由专用生产端有效性与活动计数守卫；这解决 delta-only 参数不重复发送时必然超时的问题，同时承担范围缺包／传感器冻结未被单独证明的限制。动画心跳不是 Contact 同帧证明；普通 Avatar OSC 也不保证原子四路提交。30 ms 合并窗口减少暂态混拼，不能把低残差当成目标身份认证。

旧 Point／Handle／Pose 仍按最旧贡献通道检查，默认 1 s；新固定根按变化心跳、Shader 按变化 Frame 检查。正值输入超时可更严格。显式实验许可、唯一目标／来源、有效配置与输入许可缺一都会阻断输出；急停另有保持锁定语义。

## Shader 根点坐标

原生组件编码当前根点的 AvatarRootLocal XYZ、producer ID、坐标 Profile、Frame 和 CRC；桌面桥从显式区域读取，不执行 Avatar 自定义 C#。桥先检查身份、RGB／CRC、进展帧和恢复状态，再发送有序七字段 OSC bundle。

桌面只接受 Profile 1、非零匹配 ID、范围有效、同来源连续字段及 500 ms 内变化的 Frame。源内序号避免其他来源穿插造成误停；这些序号检查不是密码身份认证。Profile 0 的模型／合成诊断只预览，不生成运动坐标。多个 Avatar 的实际渲染隔离与 producer ID 碰撞仍须客户端验收。[Shader 正式指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)

## 仍然不能推断什么

单个根点不提供尖端、朝向、扭转、变形表面或精确插入比例。未约束普通 Contact 的多个 Sender 能形成低残差鬼点；增加接收器不能替代目标身份。固定锚点排除了“锚点跟着被测对象走”的布局错误，专用 Self 标记收窄了身份模型，但它并未把所有旧 SPS／世界场景变成可靠全局定位器。

[研究与代数反例](fixed-anchor-research.md)保留 SDK 源证据和实际作者测试范围。Unity EditMode／Shader 导入、本地模型契约和 CI 模拟输出不代替 SDK 上传、真实 Contacts／OSC、桌面／头显画面、世界真值误差或硬件验收。
