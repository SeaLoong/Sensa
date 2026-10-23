# 按使用目标选择方案

**简体中文** | [English](usage-scenarios.en.md)

先确定想得到的结果，再选择输入和输出。计算可以随后加入，用于混合、平滑、触发或换算。

| 想做什么 | 推荐流程 | 配置入口 |
| --- | --- | --- |
| 检查设备或应用的响应 | 手动滑条 → 目标输出 | [首次使用](quick-start.md) |
| 播放已有轨迹 | Funscript → 设备或应用 | [手动与脚本](guide.md#手动与脚本) |
| 混合多个读数，加入平滑或阈值 | 多项输入 → 计算信号 → 输出 | [计算示例](computed-signals.md) |
| 同时控制设备和 Avatar 效果 | 同一结果 → 设备与 OSC 参数 | [多输出](signal-pipeline.md#同一个结果连接多个输出) |
| 联动 DG-LAB、MIDI 或网络服务 | 信号 → 相应输出 | [输出设置](signal-pipeline.md#添加输出与绑定) |
| 保存一次交互，之后播放或编辑 | 选定来源 → Funscript 录制 | [录制与回放](signal-pipeline.md#录制与观察) |

使用多种输入时，在“控制”应用“组合”。一套流程可以[整体保存](signal-pipeline.md#保存与复用整套方案)，包括计算、映射、轴配置和输出。

## VRChat 参数与定位

先看 Avatar 已经提供什么。已有 OGB／SPS 参数可以直接接入；制作自己的 Avatar 时，可以增加根点测量组件。

| 你的情况 | 选择 | 取得什么 |
| --- | --- | --- |
| Avatar 已有 OGB／SPS haptics 参数 | 已有 OGB／SPS | 接近、触碰和深浅相关读数 |
| 想读取 SPS Socket／Plug 根点位置 | SPS 四点定位 | 相对 Avatar 的三维位置 |
| 使用支持高级 Proximity 的 SDK，想读取位置与速度 | Contact 直接定位（SDK Beta） | 米制位置与相对速度 |
| PC 画面能显示编码图块，想读取位置、轴向和缩放 | Shader 捕获 | 根点位置、X/Z 轴向和 AvatarScale |

[交互参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)可先帮你理解参数和有效区域。空间测量配置完成后，先观察、校准，再允许实验空间输入并启用输入；实际客户端与图形效果按所用版本检查。

## 已有 OGB / SPS

1. 在“控制”应用“OSC”或“组合”，到“OSC”检查监听、来源和实际参数。
2. Avatar 需要 OGB_ENABLED 时，在接收设置启用心跳，目标填写 VRChat 的接收端口，通常为 **9000**；Sensa 接收参数通常使用 **9001**。
3. 选择“OGB / SPS · 深度”或“振动”预设，固定对象／来源，校准范围和方向，保存后启用输入。

**SPS2 · PenOthersNewRoot / PenOthersNewTip** 提供同一 Plug 的两项接近读数。Sensa 配对后估算长度，再得到进入深浅的变化趋势；移动目标，让估长取得所需样本后再检查结果。

**SPS1 · PenOthers / PenOthersClose** 中，PenOthers 可理解为进入深浅的趋势，PenOthersClose 表示目标进入 Socket 附近的有效区域。Touch 表示触碰强度；Plug 的 Frot 表示贴近或擦过的强度。

正对、横移、倾斜和作者尺寸都会影响接近值，按实际动作的起点和终点校准。具体配对和有效条件见[参数说明](osc-parameters.md)、[预设](presets.md)和[OGB 兼容说明](ogb-compatibility.md)。

## Contact 直接定位（SDK Beta）

适合想同时使用根点位置和运动强弱的 Avatar 作者。安装 **SDK 3.10.6-beta.2** 或提供相同高级 Proximity 功能的版本，在 Automatic SPS Setup 中选择此方案，或添加 `SensaContactRootProbe`。

1. 选择要跟随的 SPS、Sensa 或原生 Contact 根点，构建 Avatar。
2. 在根点面板固定对象与来源，观察有效位置和速度。
3. 位置选 X／Y／Z／Distance；运动强弱选 VelocityX／Y／Z、Speed 或 ProximitySpeed。采集两端、检查预览、保存，再启用空间输入和当前输入。

位置使用米，速度使用 m/s；ProximitySpeed 表示接近值每秒的变化，单独校准。当前方案提供单点位置与速度，检测覆盖和采样活动决定有效性。[完整安装与条件](contact-sdk.md) · [校准说明](positioning.md)

## SPS 四点定位

适合测量 SPS Socket／Plug 根点在 Avatar 内的移动。Unity 组件用四个已知测量点计算一个根点的三维位置。

1. 添加 **SPS 四点定位**（`SensaFixedRootProbe`）或 Automatic SPS Setup，选择自己的目标根点。
2. 查看 Unity 或参数图解中的绿色共同检测区，让预期动作范围落在其中。
3. 在工作台选择对象和坐标指标，采集动作两端，检查方向与范围，保存并启用。

接收半径为 2 个 Avatar 根局部单位。坐标使用 Avatar 制作尺度，缩放后按该坐标框解释；明确的 Transform、Sensa 或原生 Contact 目标也可使用同一测量方案。几何布局、采样和缩放要求见[定位说明](positioning.md)，安装见[Unity 组件包](../unity/top.sealoong.sensa/README.zh-CN.md)。

## Shader 根编码与区域捕获

适合能在 PC 桌面画面中保留编码图块的实验配置。Avatar 渲染根点位置、X/Z 轴向与 Avatar 缩放，桌面桥读取图块并发出 OSC 测量。

1. Unity 添加 **Shader Root Capture (Experimental)**，选择根点并填写 Producer ID。
2. 构建后开启编码，按[捕获指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)框选完整图块，并配置相同 ID。
3. 观察解码状态，在工作台通过“定位测量”选择所需指标，再校准、保存和启用。

QR 定位方框帮助找到图块，白色留白缓冲小幅位移，Reed–Solomon 纠错帮助恢复部分受损数据。有效画面、捕获区域和帧更新共同决定测量是否可用。[当前协议与有效条件](positioning.md) · [实现依据](shader-capture-research.md)

## 其他输入与工具

PhysBone 的 Stretch／IsGrabbed 可用于标量控制；OSCQuery 与 Hub 可用于发现和转发参数。独立 Point／Handle／Pose 以及 Avatar／World 实验室提供测量模型和集成检查入口。[实验室工作流](lab-workflow.md)

搭好流程后，先用可观察的参数或录制检查计算，再以小幅设备目标确认方向、响应和停止。[工作台指南](guide.md) · [功能总览](features.md)
