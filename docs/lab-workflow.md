# 内部实验室联动

**简体中文** | [English](lab-workflow.en.md)

本页保留内部 Avatar／世界实验工具的联动方法，不是正式安装或控制方案。实际接入先选择[OGB / SPS、Sensa SPS 固定根点或 Shader 捕获三条路线](usage-scenarios.md)。使用自己的工程和授权资源；仓库没有公共世界链接，也不自动上传。先保持输出为空、输入关闭。[道具交互](lab-interaction.md)

| 环节 | 内部工具入口 |
| --- | --- |
| Avatar 工程 | `Assets/SensaAvatarLab/Generated/FullFlow.unity`，SDK 私有上传 |
| 世界工程 | `Assets/SensaLab/Functional/FunctionalLab.unity`，SDK Build & Test 或私有上传 |
| VRChat | 穿戴对应 Avatar，启用 OSC／Contacts 及需要的自身交互权限 |
| Sensa | 核对 OSC 接收端口和来源；常用监听端口为 9001 |

FullFlow 已带 QuickStart 和实验组件，不要重复添加。道具摆放、SPS 启用、测量选择和 Sensa 输入许可是不同状态。

## 验证顺序

1. **内部标量夹具：**世界 START HERE 的五档／STOP 及手腕 QuickStart 只检查合成阶梯和门控。按实际接收参数手动配置 Depth／GateEnable；没有内置“链路测试”或 QuickStart 预设。世界 Expected 是预期值，不是 OSC 回执。
2. **原生 PB：**抓取自己的 PB，将实际 `_Stretch`／`_IsGrabbed` 对应到拉伸和门控。内置 PhysBone 模板中的 `MyPB` 必须替换成真实前缀；它不是固定的 `Sensa/Lab/PB` 路径。松手应关门，不依赖 Contact XYZ。
3. **已有 OGB / SPS：**启用 Avatar SPS／SPS OSC，检查真实 OGB 参数；需要时在接收设置显式开启 OGB 参数心跳。使用统一的深度或振动模板，固定对象和来源。现代 Root／Tip 优先、旧单近接回退由实际能力决定，不再按 Socket／Plug 拆成角色预设。分离后接近学习长度；径向比例不代表任意姿态的准确行程。
4. **固定根点：**通过 Fixed SPS Root Probe／Automatic SPS Setup 选择实际根。四个 Avatar 根锚点发布 `Sensa/SPS/<id>/P0..P3` 加 Sample，内部保留本地身份／缩放守卫；校准后明确允许实验输入，Sample=0 或超时停止。不再有旧 SharedRoot／SpsRoot 解码；独立 Point／Handle／Pose 不是这条路线的前置条件。
5. **Shader：**原生根捕获使用单 Camera、真实根 Transform 及非零二进制 ID，显式 ROI 注册后在 `Sensa/Shader/<id>` 发布有序五字段。合成实验码与 Editor Model Probe PNG 用 `Sensa/Diagnostics/Shader/0`，只验证传输，不证明原生捕获或最终网格精度。[Shader 指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)

换场景前关闭输入，清理上一测试的映射／门控，保存后检查实际模式、来源和有效性，再决定是否启用。三项内置模板不包含合成阶梯；不要把夹具 Active 门控混入正式映射。

## 时效与停止

按具体路线检查，不能统一套用“全部空间最旧通道 1 秒”：旧 Point／Handle／Pose 检查最旧参与通道；新固定根检查有效性及变化心跳，Shader 检查变化 Frame。静止值和不断重发的相同内容不是同一种新鲜度证据；更严格的正值输入超时仍生效。[定位与停止规则](positioning.md)

内部无设备预览配置 `tools/unity-world-lab/sensa-preview.json` 显式采用 500 ms 输入超时；它不是所有接入方案的默认值。低残差不证明身份、同帧或正确设备行程。

## 世界 SPS 目标

**08 MY AVATAR SPS** 的琥珀色 WORLD PLUG 可接近自己的 Socket，蓝框 WORLD SOCKET 可接收自己的 Plug。世界 Contact 可能触发 Self／Others；根据实际参数判断，不凭菜单或后缀证明身份。世界数值是几何参考，不是 Avatar OSC 回执。

## 设备与证据

按[首次使用](quick-start.md)建立连接、方向和小量程基准，只有接收与停止行为核对后才显式允许设备输入。输出卡片显示命令目标，不是设备回读。

记录提交、Unity／SDK／客户端版本、对象／来源、实际路径、采样年龄和停止行为。Editor／ClientSim／SDK bundle 只证明各自检查；真实上传、Contacts／OSC、VR 抓取、桌面／头显图块、准确度与机械动作须分别验收。

[三条路线](usage-scenarios.md) · [Avatar 工具](../tools/unity-avatar-lab/README.md) · [世界工具](../tools/unity-world-lab/README.md)
