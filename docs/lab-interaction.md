# 测试目标怎么拿、怎么放、怎么看

**简体中文** | [English](lab-interaction.en.md)

这里说明内部实验室道具，不是正式安装或控制方案；实际接入先看[三条路线](usage-scenarios.md)。实验室使用 Avatar 的 `Assets/SensaAvatarLab/Generated/FullFlow.unity` 和世界的 `Assets/SensaLab/Functional/FunctionalLab.unity`；更改需重新构建并私有上传，没有自动上传。

## Avatar 的道具菜单

进入 **Sensa Test Props**，选择 Palm Socket、Forearm Socket、PB handle 或 Shader rig：

1. 选 **Left hand / Right hand**，目标跟随该手。
2. 手移到合适位置，选 **Place in world**；之后走开，目标留在原地。
3. 选 **Home / reset** 回到初始位置，也可重新选左右手拿回。

棒棒糖保留 **SPS_Lollipop → LeftHand / RightHand / Fixed / Off**，放在同一个道具菜单内。

菜单里还集中提供 **SPS OSC**、**Measure plug**；Socket 子菜单有 **Measure this socket**；Shader 子菜单有合成码输出和 CRC 故障开关。摆放只负责位置；测量和软件输出仍需明确启用。

名称、入口中心、+Z 方向及探针小球默认可见。**Visible labels / probes** 可统一隐藏辅助标记。标记文字是静态网格，前后两面都可读，不依赖客户端不支持的 TextMesh 组件。

QuickStart 仍绑定右手腕，只用于内部阶梯台的合成标量验证，不是正式接入方案或可摆放 SPS 道具，也没有内置阶梯预设。测试映射需手动按实际参数配置；世界里的测试球可左右手持有或放置。

## 世界里的控制按钮

物理实验架、QuickStart 球和原生 SPS 道具都有：

| 按钮 | 行为 |
| --- | --- |
| LEFT / RIGHT | 跟随本地玩家对应手部 |
| PLACE | 停止跟随，留在当前位置 |
| HOME | 放下并回到该目标初始位置 |

可拿取的球和 SPS 道具也能直接抓取；直接拿取会退出按钮跟随模式。PB 把手的参考架可以移动，但抓取 PB 球才会产生拉伸。所有按钮只在本地生效，不操作 OSR。

## 用原生 SPS 测自己的 Avatar

出生区左侧是 **08 MY AVATAR SPS**：

- **琥珀色 WORLD PLUG**：20 cm 长，靠近自己 Avatar 上已启用的 Socket；Sensa 观察 Socket 的实际 OGB 参数。
- **蓝框 WORLD SOCKET**：用自己的 Avatar Plug 靠近它；Sensa 观察 Plug 的实际 OGB 参数。

先在 Avatar 开启 SPS 和 **SPS OSC**。在 Sensa 选择 OGB / SPS 深度或振动模板，固定实际实例和来源，保存后明确应用 OSC 输入。需要时在接收设置显式启用 OGB 参数心跳；它不授予设备输入许可。世界 Contact 可能同时触发 Self/Others，不能仅凭后缀推断来源。

先让目标分开，再靠近；沿轴对正时，20 cm Plug 的 10 cm 插入量大约对应 50%。横向偏移会暴露原生径向估算的偏差。世界文字是几何说明，**实际 OSC 是否到达，要看 Sensa**。

![原生 SPS 与自己的 Avatar 交互区域](images/native-sps-avatar-zone.png)

## P1、P2 是什么？

它们是定位接收器的采样编号，**不是设备输出轴，也不是直接的行程百分比**。

| 可见标记 | 颜色 | 原始 OSC 末尾 |
| --- | --- | --- |
| P1 | 红 | A0 |
| P2 | 蓝 | A1 |
| P3 | 绿 | A2 |
| P4 | 黄 | A3 |
| C5–C8（八点阵列） | 紫、青、橙、浅灰 | A4–A7 |

小球表示接收器中心，实际接收范围比小球大。四面体定位用 **P1–P4**；八点阵列用 **C1–C8**。八点的 C1–C4 同样为红、蓝、绿、黄，C5–C8 为紫、青、橙、浅灰。两种布局的原始字段都从 A0 编号，但并非同一空间位置，所以不能把 P2 当成 C2。

这些是旧配对 Pose／PB 实验的显示：Measure plug 显示 Palm 参考框和 Plug 把手的 P 阵列；Socket 测量显示 C 阵列，Root／Tip／Side 组共用 C 位置但路径不同。独立 PB 参考架使用 P 阵列。它们都不是新固定根点协议：新方案把 P0–P3 固定在 Avatar 根下，跟随专用根标记；不能把旧 Socket 八个 C 点或其 A0–A3 子集当作新四锚点。

世界标签、读数、条形图及 Sensa 参数列表使用同一套颜色。软件列表仍保留真实 OSC 路径，旁边增加“定位探针 P# · 输入采样”；设备的 L/R/V/A 轴名称保持原义。

![探针中心与对应颜色](images/probe-colors.png)

## 验证边界

构建和 ClientSim 检查可验证菜单、放置、复位、颜色和生成控制器；实际结果以对应提交报告为准。它们不能证明上传后 Avatar OSC、头显抓取或硬件动作。

旧 P／C 只是 Contact 采样标签；旧配对位置默认禁止运动输出，四／八路及零残差不证明共同 Sender 或同帧。新固定根点使用独立几何、专用本地标记与合并有效性／活性的 Sample，不应与旧显示混为一谈；仍需实验许可、校准及停止检查。[定位说明](positioning.md)

本实验室 Shader 道具仍是合成码传输测试。包内另有原生 SPS 根点编码，但不是形变网格采样，真实客户端捕获仍待验收。[Shader 指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)
