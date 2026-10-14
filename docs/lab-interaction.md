# 测试目标怎么拿、怎么放、怎么看

打开 Avatar 项目的 `Assets/SensaAvatarLab/Generated/FullFlow.unity` 和世界项目的 `Assets/SensaLab/Functional/FunctionalLab.unity`。本轮更改需要重新构建并私有上传后才会出现在 VRChat；没有自动上传。

## Avatar 的道具菜单

进入 **Sensa Test Props**，选择 Palm Socket、Forearm Socket、PB handle 或 Shader rig：

1. 选 **Left hand / Right hand**，目标跟随该手。
2. 手移到合适位置，选 **Place in world**；之后走开，目标留在原地。
3. 选 **Home / reset** 回到初始位置，也可重新选左右手拿回。

棒棒糖保留 **SPS_Lollipop → LeftHand / RightHand / Fixed / Off**，放在同一个道具菜单内。

菜单里还集中提供 **SPS OSC**、**Measure plug**；Socket 子菜单有 **Measure this socket**；Shader 子菜单有合成码输出和 CRC 故障开关。摆放只负责位置；测量和软件输出仍需明确启用。

名称、入口中心、+Z 方向及探针小球默认可见。**Visible labels / probes** 可统一隐藏辅助标记。标记文字是静态网格，前后两面都可读，不依赖客户端不支持的 TextMesh 组件。

QuickStart 仍绑定右手腕，供入门阶梯台定位；它不是可摆放的 SPS 道具。世界里的测试球可左右手持有或放置。

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

先在 Avatar 开启 SPS 和 **SPS OSC**。在 Sensa 应用 OSC 输入、导入对应角色预设、保存映射，并固定实际出现的实例路径。世界 Contact 可能同时触发 Self/Others，不能仅凭后缀推断来源。

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

选择 Avatar 的 Measure plug 时，Palm 参考框和 Plug 把手显示实际四点 P 阵列；选择 Socket 测量时恢复八点 C 阵列。同一 Socket 的 Root、Tip、Side 三组八点采样共享 C 位置，通过完整路径区分组别。独立 PB 参考架始终使用 P 阵列。

世界标签、读数、条形图及 Sensa 参数列表使用同一套颜色。软件列表仍保留真实 OSC 路径，旁边增加“定位探针 P# · 输入采样”；设备的 L/R/V/A 轴名称保持原义。

![探针中心与对应颜色](images/probe-colors.png)

## 已验证的范围

世界的原生 SPS 烘焙、手部跟随、玩家移动后的放置保持、复位及颜色对应已通过 ClientSim；原有功能与几何用例也进行了回归。Avatar 通过 SDK 构建及上传包检查，检查器实际运行 Animator 验证左手、世界固定和复位，并核对菜单与组件。

真实 VRChat 的 Avatar OSC、头显抓取与硬件动作仍需客户端实测。Shader 当前是合成码传输实验，不能当作真实 SPS 形变定位。
