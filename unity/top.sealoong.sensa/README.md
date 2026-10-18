# Sensa Unity 资产

**简体中文** | [English](README.en.md)

本包提供 QuickStart、原生辅助参数和高级 Contact／Shader 实验。已有 SPS OSC 参数通常不需要安装它。**Contact 位置仅为实验局部估计，桌面默认禁止驱动输出。**

## 安装

1. 在 VCC／ALCOM 的 **Avatars** 工程安装 VRChat Avatars SDK、Modular Avatar 和 NDMF；按工程锁定的编辑器版本打开。
2. 解压 Sensa Unity ZIP，通过 Package Manager 的 Add package from disk 选择其中 `package.json`，或放入 `Packages/top.sealoong.sensa`。
3. 首次链路测试在 Humanoid Avatar 根添加 **Sensa → Quick Start World Receiver**，私有上传并穿戴新版 Avatar，按[快速开始](https://github.com/SeaLoong/Sensa/blob/main/docs/quick-start.md)使用测试世界。
4. 只有需要研究额外采样时才添加 **Automatic SPS Setup** 或手工探针。自动配置不是可靠定位的保证，不会自动生成通用准确行程。

不要安装到 Worlds 工程。SPS 形变需要另外安装、配置 VRCFury；本包不附带 SPS 或付费模型。[依赖与边界](COMPATIBILITY.md)

## 选择能力

| 需求 | 组件／输出 |
| --- | --- |
| 检查世界 → Avatar → OSC | QuickStart 的 Depth＋Active；无需 SPS、相机或 Python |
| 简单 PB 控制 | 原生 Stretch＋IsGrabbed 标量，按真实参数校准 |
| 实验本地相对点 | Local Bone or PB Probe，Target／Reference；Point／Handle 四点采样 |
| 实验标准根部 | Socket Root Tracking；SpsRoot／SharedRoot 八点，仅诊断 |
| 实验配对姿态 | Socket 阵列和 Plug Root／Tip／Side，Pair Channel 一致；不保证唯一 Sender |
| Shader 数据研究 | 指定编辑器 Resolver 快照或显式图像桥接，不是通用客户端表面跟踪 |

自动配置可 Discover All，或用 Selected／Excluded Targets 限定对象。检查命名、参考框、正值均匀缩放和最终 Contact 预算；上传时生成原生 Contacts、Animator 参数、PhysBone 和约束，作者组件不在 Avatar 里运行任意 C#。目标菜单默认关闭，SPS 菜单与 Sensa 测量选择分开。

## 在桌面观察

选择并应用 OSC 模式，先保持输入关闭。OSC → **实验诊断**查看局部估计；在“本地点与根部”展开两点量程校准。Root／SharedRoot 不提供运动映射；Point／Handle／Pose 需要显式实验许可，也仍可能被不完整或过期采样阻断。

四个真实距离能解相对位置，但 Proximity 没有可靠的共同身份／同帧保证。残差低、参数已声明或多加接收器不能证明可用于设备定位。坐标是 `ReferenceLocal`，不是世界坐标或 SPS GPU 形变表面。[定位原理](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.md)

[自动配置与高级选项](AUTOMATION.md) · [兼容边界](COMPATIBILITY.md) · [Shader 实验](GPU-TRACKING.md)
