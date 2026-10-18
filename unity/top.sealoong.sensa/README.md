# Sensa Unity 资产

**简体中文** | [English](README.en.md)

本包在构建时生成 Avatar 原生 Contacts、Animator 参数和约束。默认的 SPS 根部方案使用**固定在 Avatar 根坐标中的四个锚点，测量所选 Socket／Plug 的独立小球标记**。它测量根部点，不测真实尖端、朝向或 GPU 形变表面；桌面空间输入仍默认关闭。

已有 OGB／SPS 参数通常不需要安装本包，先使用桌面的 OGB 深度或振动映射。[OGB 兼容说明](https://github.com/SeaLoong/Sensa/blob/main/docs/ogb-compatibility.md)

## 安装与最少配置

1. 在 VCC／ALCOM 的 **Avatars** 工程安装 VRChat Avatars SDK、Modular Avatar 和 NDMF；按工程锁定的 Unity 版本打开。
2. 解压 Sensa Unity ZIP，通过 Package Manager → Add package from disk 选择 `package.json`，或放入 `Packages/top.sealoong.sensa`。手工解压不会自动安装缺失的 VPM 依赖。
3. 已有 SPS Socket／Plug 时，在 Avatar 根添加 **Sensa → Automatic SPS Setup**，检查 Discover All 或 Selected／Excluded Targets。新组件默认 Exclusive，游戏内选择菜单初始 Off。
4. 只测明确对象时可添加 **Sensa → Fixed SPS Root Probe**，显式指定 Target，保持实例名与 Collision Channel 唯一；复制作者后更换通道。
5. 执行预检，再私有上传并穿戴新版 Avatar。先保持设备输入关闭，检查实际 OSC 参数与诊断结果。

不要安装到 Worlds 工程。SPS 需要另行配置 VRCFury；本包不附带 SPS 或付费模型。作者 C# 经 NDMF 构建后清理，不在 Avatar 中运行任意脚本。

## 选择能力

| 需求 | 建议 |
| --- | --- |
| 已有 OGB／SPS 深度或触摸强度 | 桌面统一 OGB 映射；不必添加本包 |
| 简单抓取拉伸控制 | 原生 PB `_Stretch`＋`_IsGrabbed`；替换 MyPB 为实际前缀 |
| 所选 Socket／Plug 根部相对 Avatar 的位移 | 默认固定四锚点 Self 根部方案，显式开启桌面实验许可后映射 |
| 自定义骨骼／PB 相对参考点 | Local Bone or PB Probe；Point／Handle 实验 |
| 三点直线姿态／旧共享根阵列 | 高级研究选项，不能替代唯一目标或同步协议 |
| Shader 位置数据 | 独立捕获链路，见 [Shader 指南](GPU-TRACKING.md) |

QuickStart 世界接收器和测试世界仅保留为隐藏的开发／实验夹具，不作为正式用户的首选输入方案。

## 固定四锚点的含义

四个 Receiver 相对 Avatar 根固定，围绕局部 `(0,1,0)` 分布，半跨度 0.5；半径 2.5，目标专用 Sender 半径 0.001。标记跟随明确目标根的位置，接收器不随目标移动。默认每对象共 **4 Receiver＋1 Sender**，自定义通道及 Self 过滤避免直接混入其他 Avatar 的同类标准根球。

坐标为 `AvatarRootLocal`：Avatar 整体平移或旋转会同时移动参考框，不能据此得到世界运动。单位是 Avatar 根局部单位；仅当作者根缩放与 ScaleFactor 都为 1 时对应世界米。图示／映射范围为中心各轴 ±1.5，实际有效区域还受四球共同覆盖、饱和和拟合一致性约束，并非整个立方体都保证可测。

缩放守卫要求 `2.5 × 作者根缩放 × ScaleFactor < 约 2.999 m`。超出支持范围时禁用测量并清零；非正值／非均匀 Avatar 根缩放、根 ScaleConstraint 或已知根缩放动画在构建时拒绝。运行时 `ScaleFactor` 不代表任意自定义缩放动画。

## 在桌面观察与映射

应用 OSC 输入方式，保持输入未启用。打开 **OSC → 实验诊断 → 本地点与根部**，确认所选来源与唯一实例、`Profile=1`、`Valid=1`、缩放许可和持续心跳。两点量程校准可以把这个 Self 根点的 X／Y／Z／Distance 转成映射草稿；保存不会自动启用输入。

`osc.allowExperimentalSpatialInput` 默认 false；显式开启后仍须满足有效性检查。新固定根协议有专用生产端心跳，允许静止距离不重复发送，但心跳不证明原子采样或无 UDP 丢包。旧 Point／Handle／Pose 仍按全部参与通道的最旧时间判断，默认 1 秒。SharedRoot 和 Others 根坐标不用于输出。

四个已知非共面锚点对同一个点的真实距离足以确定相对 XYZ。此方案通过固定参考与专用 Self 标记减少普通 Contact 的歧义；仍不是带 frameId 的可信同批坐标协议，也不能由低残差推导用户硬件可安全使用。参见[定位原理](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.md)。

[自动配置与路径](AUTOMATION.md) · [兼容边界](COMPATIBILITY.md) · [Shader 指南](GPU-TRACKING.md)
