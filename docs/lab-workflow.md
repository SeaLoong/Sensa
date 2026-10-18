# 实验环境联动

**简体中文** | [English](lab-workflow.en.md)

使用自己的 Avatar／世界工程和授权资源；本仓库不提供公共世界链接，不自动上传。先保持设备输出为空。放置道具的方法见[交互说明](lab-interaction.md)。

| 环节 | 入口 |
| --- | --- |
| Avatar 工程 | `Assets/SensaAvatarLab/Generated/FullFlow.unity`，SDK 私有上传 |
| 世界工程 | `Assets/SensaLab/Functional/FunctionalLab.unity`，SDK Build & Test 或私有上传 |
| VRChat | 穿戴新版 Avatar，启用 OSC／Contacts 和需要的自身交互权限 |
| Sensa | 应用 OSC 模式，监听默认 UDP 9001，输入先关闭 |

FullFlow 已有 QuickStart 和实验组件，不要重复添加。菜单选择、SPS 启用、测量选择、桌面输入许可是不同状态。

## 推荐验证顺序

1. **链路**：在世界 START HERE 点五档与 STOP；Sensa 用“链路测试”预设，只保留 Depth／Active。核对实际参数，不以世界 Expected 代替接收。
2. **原生 PB**：抓取自己的 PB，把实际 `_Stretch` 映射到 Depth、`_IsGrabbed` 映射到 GateEnable。PB 模板的 `Sensa/Lab/PB` 是测试路径，须替换；松手应关门。这一步不依赖 Contact XYZ。
3. **原生 SPS**：启用 Avatar SPS／SPS OSC，查看实际 OGB 路径。现代 VRCFury Socket 用同实例 NewRoot／NewTip，Plug 用 PenOthers／PenSelf；自身测试复制草稿并改真实 Self 路径。先分离再接近以学习长度，径向比例不能当任意姿态真实行程。
4. **空间实验**：OSC → 实验诊断，保持实验输入关闭观察 Point／Handle／Root／Pose。要研究端点映射，在“本地点与根部”展开两点量程校准；显式实验许可不证明定位可靠。Root／SharedRoot 仅诊断。
5. **Shader 传输**：Synthetic code 仅检查图像、帧号、CRC、Valid、冻结与恢复。固定 (.25, −.5, .75) 不是 SPS 数据。Editor GPU Probe 的真实模型快照也不是通用客户端实时采集。[桥接边界](../unity/top.sealoong.sensa/GPU-TRACKING.md)

每次换场景先停止输入，替换映射并保存，检查来源、实际模式和门控后才开启。不要混入旧 QuickStart Active 或其他测试的门控。普通标量超时默认关闭；空间仍按最旧参与通道检查，默认 1 秒。

## 世界 SPS 目标

**08 MY AVATAR SPS** 的琥珀色 WORLD PLUG 可接近自己的 Socket，蓝框 WORLD SOCKET 可接收自己的 Plug。世界 Contact 可能触发 Self／Others；根据实际接收的参数选择，不凭菜单或后缀证明身份。世界上的数值是几何参考，不是 Avatar OSC 回执。

## 最后连接设备

按[首次使用](quick-start.md)配置仅 L0 小行程，核对硬件中位和速度。只有接收链路与停止行为核对后才连接设备。输出卡片显示命令目标，实验低残差不能作为接通硬件的依据。

记录提交、Unity／SDK／客户端版本、对象和来源、实际路径、采样年龄、失败原因及停止行为。Editor／ClientSim／SDK bundle 报告只证明各自检查；上传后 Avatar OSC、真实 VR 抓取、头显和机械动作须单独验收。

[定位原理](positioning.md) · [Avatar 工具](../tools/unity-avatar-lab/README.md) · [世界工具](../tools/unity-world-lab/README.md)
