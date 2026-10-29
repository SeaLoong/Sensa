# 实验道具：拿取、放置与读数

**简体中文** | [English](lab-interaction.en.md)

操作内部 Avatar／World Lab 道具时，可按本页完成抓取、启用、测量选择和场景控制。生成场景为 `Assets/SensaAvatarLab/Generated/FullFlow.unity` 与 `Assets/SensaLab/Functional/FunctionalLab.unity`。普通 Avatar 接入从[方案选择](usage-scenarios.md)开始。

## Avatar 菜单

在 **Sensa Test Props** 选择 Palm Socket、Forearm Socket、PB handle 或 Shader rig：

1. Left hand／Right hand：跟随对应手。
2. Place in world：停止跟随，留在当前位置。
3. Home / reset：回初始位置；也可重新选手拿回。

棒棒糖保留 SPS_Lollipop → LeftHand／RightHand／Fixed／Off。菜单集中提供 SPS OSC、Measure plug、Socket 的 Measure this socket，以及 Shader 合成码／CRC 故障开关。位置菜单决定道具放在哪里，测量菜单选择读数，SPS 开关控制对应交互；设备交付由 Sensa 的输入启用和输出设置控制。

名称、入口中心、+Z 与探针默认可见，Visible labels / probes 可隐藏辅助标记。文字使用构建时生成的双面静态网格，菜单文字按构建语言生成。世界每玩家语言仍待客户端验收。[语言](languages.md)

QuickStart 绑定右手腕，用于检查内部阶梯台的合成标量；请按实际参数路径手动配置阶梯值与门控。SPS 接入使用[相应定位或参数方案](usage-scenarios.md)。世界测试球可持有／放置。

## 世界按钮与原生 SPS 区

LEFT／RIGHT 跟随本地对应手，PLACE 留在原地，HOME 放下并复位。直接抓取退出按钮跟随。要观察 PB 拉伸，请抓取 PB 球并相对参考架移动。按钮的作用范围是本地道具；设备交付使用 Sensa 的输入与输出配置。

08 MY AVATAR SPS 提供：

- 琥珀 WORLD PLUG：长 20 cm，用于靠近自己的 Socket。
- 蓝框 WORLD SOCKET：接收自己 Avatar 的 Plug。

先开启 Avatar SPS／SPS OSC，在 Sensa 固定实例／来源并选择深度或振动模板。需要时显式打开 OGB 心跳，用于维持对应 Avatar 功能；设备交付仍由 Sensa 的输入启用和输出设置控制。先分开再接近，轴向对正的 20 cm Plug 插入 10 cm 可作为约 50% 的参考，横向偏移会影响径向估算。Self／Others 表示 SDK 的交互类别，目标身份需结合实例和来源核对。世界文字显示几何预期，实际 OSC 到达情况在 Sensa 中观察。

![原生 SPS 与 Avatar 交互区域](images/native-sps-avatar-zone.png)

## Point／Pose 布局与 SPS 四点定位

配对 Pose／PB 实验用以下标签标识采样位置；设备命令轴与行程另在输出配置中查看：

| 标记 | 颜色 | 旧原始叶子 |
| --- | --- | --- |
| P1／P2／P3／P4 | 红／蓝／绿／黄 | A0／A1／A2／A3 |
| C5／C6／C7／C8 | 紫／青／橙／浅灰 | A4／A5／A6／A7 |

四面体用 P1–P4，八点用 C1–C8；C1–C4 沿用红蓝绿黄，位置按各自布局解释，例如 P2 与 C2 分别对应各自阵列的第二个点。Measure plug 展示 Palm 参考框／Plug 把手 P 阵列，Socket 展示 C 阵列，Root／Tip／Side 共享 C 位置并使用各自参数路径；独立 PB 参考架也用 P。

SPS 四点定位使用固定在 Avatar 根下的 **P0–P3** 加专用移动根标记，配色为蓝／青绿／紫／玫红。它们使用 `Sensa/SPS/<id>/P0` 到 `P3` 的专用路径和固定根布局；配对实验的 C 点及 A 叶子按各自协议解释。参数列表保留真实路径，输出 L/R/V/A 表示设备命令轴。

![旧探针中心与对应颜色](images/probe-colors.png)

## 如何判断通过

构建／ClientSim 检查覆盖菜单、放置、复位和生成控制器。上传后的 Avatar OSC、HMD 抓取与硬件行为需在对应环境验收。配对实验的空间驱动默认关闭；启用前需核对目标 Sender、参与通道的采样时间、校准和失效停止，残差用于检查几何一致性。

SPS 四点定位使用独立几何和 Sample，启用前需完成实验许可、校准与停止检查。本实验室 Shader 道具检查合成数据的编码与传输；原生根点捕获通过独立作者组件和三点蒙皮几何报告所选根的位置、X/Z 轴向与 Avatar 世界缩放。形变网格观测使用单独的诊断探针和验收流程。[定位](positioning.md) · [实验顺序](lab-workflow.md) · [Shader 指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)
