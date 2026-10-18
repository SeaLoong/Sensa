# 固定锚点 SPS 根部：研究与实现边界

**简体中文** | [English](fixed-anchor-research.en.md)

本轮把 SPS 根部方案重新定义为 **AvatarRootLocal 中四个固定锚点，测量一个明确选中的根中心**。这重新打开了旧定位方案的设计结论；旧移动参考八路 Contact 不会自动获得新协议的身份或有效性。

## 几何与协议

唯一几何源是 [SensaFixedAnchorProtocol.cs](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs)。按 A0–A3 顺序：

| 锚点 | AvatarRootLocal 坐标 |
| --- | --- |
| A0 | (-0.5, 0.5, -0.5) |
| A1 | (0.5, 0.5, 0.5) |
| A2 | (0.5, 1.5, -0.5) |
| A3 | (-0.5, 1.5, 0.5) |

中心为 (0,1,0)，接收球半径 2.5，独立根标记球半径 0.001；这些是头像根局部单位，并非在任意缩放下的世界米。坐标边界是中心各轴 ±1.5，同时必须满足四个球的非饱和覆盖交集；这个立方体的所有角落并不都可测。残差拒绝阈值 0.01 是一致性门槛，不是精度保证。

公开路径为 `Sensa/SpsRoot/v1/<id>/Self/Root/A0…A3`。同一 Self 层另有 `Profile=1`、`Valid`、`Scale`、`Heartbeat`；元数据不放在 Root 层。内部 Contact 写入 `Root/RawA0…RawA3`，FX 每 0.05 秒按顺序复制四路到公开参数，再更新元数据并推进 32 步归一化心跳计数（0…1，周期 1.6 秒，大于 1.25 秒时效窗，以降低二值采样别名）。桌面允许静止时沿用未变化的范围值，但必须检查新协议、许可、有效标记、缩放和心跳。**这不是 OSC 原子采样协议**：复制过程、OSC 分包、丢包与 Contact 更新时序仍可能造成混合样本，心跳只证明 FX 仍在运行。

## 为什么四个值可以解局部位置

[VRChat 官方 Contacts 文档](https://creators.vrchat.com/common-components/contacts/) 将 Proximity 定义为 Sender 最近点相对 Receiver 中心的接近程度；多 Sender 时取最近者。网页没有公布线性方程。本轮还核对了安装的 VRChat SDK 3.10.5 的 ContactManager / CollisionScene 实现；检查副本与包内 VRC.Dynamics.dll 的 SHA-256 相同：

`672093e0c2a52a035979f1ff66478389949f42ffcf7daba5edd8b8da718629a3`

从该实现推导，已知球形 Sender、Receiver 且未饱和时：

```text
p_i = 1 - clamp(max(0, distance_i - senderRadius) / receiverRadius, 0, 1)
distance_i = (1 - p_i) * receiverRadius + senderRadius
2 (anchor_i - anchor_0) · position =
    |anchor_i|² - |anchor_0|² + distance_0² - distance_i²
```

三个锚点差向量的行列式为 2，非零，因此三个平方距离差唯一给出 XYZ；再用全部球面残差和范围检查拒绝不一致结果。中心 (0,1,0) 到四锚点距离均为 sqrt(0.75)，理想 Proximity 均约 0.653989838。端点 p=0、p=1 只给范围或包含关系，不能按普通距离使用。

整个 Avatar 进行相同平移、旋转，所有相对距离保持不变。因此它能测根相对 Avatar 的运动，不能恢复 Avatar 的世界位移或朝向。增大半径也不会增加全局参考信息，并会放大相同 Proximity 误差对应的距离误差。

## 目标身份与缩放守卫

作者明确选择受支持组件，解析实际 CPU 根参考，而非按通用 SPS 标签猜测目标。VRCFury [Socket baker](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs) 和 [Plug baker](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs) 的根位置来自各自解析的局部姿态，现有 Sender 半径和附加用途并不统一。实现保留原 SPS，生成独有自定义 tag 的小球，通过 ParentConstraint 跟随该根；小球与锚点共用 Avatar 根缩放，不继承目标骨骼缩放。Sensa 自有组件使用 depthAxis/rootBone；显式原生 Contact 使用 rootTransform 和 position 偏移。这个中心不包含 SPS shader 的 GPU 曲线形变。

官方 Contacts 将缩放后的世界半径限制为 3 米。构建拒绝非正、非均匀或已经过大的头像根缩放，以及根 ScaleConstraint / 根缩放动画；这些自定义缩放不受内置 ScaleFactor 观测。运行时 FX 使用 [VRChat ScaleFactor 与 IsLocal](https://creators.vrchat.com/avatars/animator-parameters/) 守卫，要求：

```text
2.5 * authoredRootScale * ScaleFactor < 3 - 0.001
```

超界或未选中时关闭 Contact 并清零有效标记及范围。默认 Self 只接收自己的唯一 tag。可选 Others 仅供诊断，Valid 始终为 false；复制头像、额外同 tag Sender、世界内容或丢包并没有被认证机制解决，不能声称任意远端 Avatar 根可被可靠识别。

## 本轮证据

真实 Unity 2022.3.22f1 EditMode 共 65 项通过、零失败、零跳过，包含固定根作者的 9 项、原作者回归和新增 ShaderCapture 的 2 项。覆盖固定坐标、独有 Sender、根绑定、参数可写性、NDMF 合并、缩放拒绝及 FX 启停结构/动画；在 nographics 模式导入生成 shader，无编译错误。报告位于忽略的 `artifacts/verification/fixed-root-authors-final-editmode.xml`。随后修改 32 步心跳和多生产端 Shader 隔离后，受影响的固定根 9 项与 ShaderCapture 3 项再次全部通过、零跳过，报告为 `artifacts/verification/fixed-root-counter-native-editmode.xml`；没有无理由重跑其余作者合同。

公开入口收尾将 `SensaSpsRootProbe.prefab` 原位迁移为固定根作者（保留资产 GUID，目标初始为空）；原八路 standardSpsRoot 分支在生成前拒绝并提供迁移说明。必要的 FixedRoot／Pose EditMode 共 22 项通过、零跳过，包含真实预制件类型、菜单实例、指定目标后四锚点及元数据合同；报告为 `artifacts/verification/fixed-root-public-entry-editmode.xml`。

没有运行本地 PlayMode、浏览器、截图、完整进程冒烟或硬件。真实 VRChat Contact 精度、OSC 更新率与丢包、上传后的约束/FX 行为、GPU 渲染和实际设备仍未验证；合成几何和 EditMode 不能替代这些证据。
