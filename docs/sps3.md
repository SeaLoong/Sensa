# SPS3 与 VRCFury 测试版

**简体中文** | [English](sps3.en.md)

Sensa 支持 VRCFury SPS3 Beta 的 OGB 兼容参数，以及 Socket／Plug 的根点、姿态与跟随平面测量。深度和触摸继续使用现有预设，SPS1／SPS2 配置可以继续使用。

本页对应官方 **VRCFury 1.1437.1-beta.1**，源码固定到 [`59fa4fa`](https://github.com/VRCFury/VRCFury/tree/59fa4fa0277c0f3eb7c73811d9b24bf73e2133f4)。[上游测试版](https://github.com/VRCFury/VRCFury/releases/tag/com.vrcfury.vrcfury/1.1437.1-beta.1)

## 用深度或触摸控制输出

1. 在 Avatar 的 VRCFury 配置中启用需要的 **OGB Haptics**。对常用的他人／Others 联动，保留 Plug 的 **Include Public SPS Channel**。
2. 打开 Sensa 的 OSC 页面，选择实际发送参数的来源，应用 **OGB / SPS · 深度**或**OGB / SPS · 振动**预设。
3. 找到对象并让它先分开、再靠近，取得长度样本，校准所需两端，点击**保存更改**。需要心跳时在设置中启用 OGB 参数控制，再启用输入。

SPS3 的公开兼容读数沿用这些路径：

| 用途 | 参数 |
| --- | --- |
| Socket 深度 | `OGB/Orf/<id>/PenOthersNewRoot` 与 `PenOthersNewTip`；自身使用对应 `PenSelf…` |
| Plug 深浅趋势 | `OGB/Pen/<id>/PenOthers` 或 `PenSelf` |
| 触摸与摩擦 | 同实例的 `Touch…`／`Frot…` 与其实际发布的 `Close`；独立区域使用 `VFH/Zone/Touch/…` |

两路 Socket 读数仍使用半径 1 m 的接收器、半径 0.01 m 的根球和长度球，因此共用 SPS2 的估长与深度换算。工作台和图解将它们标为 **SPS2/SPS3 · PenOthersNewRoot / PenOthersNewTip**。[预设与校准](presets.md) · [完整几何](ogb-compatibility.md)

## 通道、Contact 标签与 OSC

SPS3 新增 `SPS/Plug/<channel>`、`SPS/Socket/<channel>` 和 `SPS/SocketPath/<channel>` 原生 Contact 标签，用于选择交互对象、编码尺寸及路径节点。这些标签在 Avatar 内部工作；在 OSC 映射中选择 Avatar 实际发布的 `OGB/…` 或 `Sensa/…` 参数。

`_public` 提供常用的公开兼容通道。`_nothips` 为自身接触提供排除髋部的旧标签配对，不能替代 Others 所需的公共通道。只保留自定义私有通道时，旧 OGB 路径仍可能存在，但因没有匹配的兼容标签而没有有效目标读数；保留所需公共通道即可继续使用标准预设。[上游通道定义](https://github.com/VRCFury/VRCFury/blob/59fa4fa0277c0f3eb7c73811d9b24bf73e2133f4/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/SpsTags.cs)

`VFH/Version/10` 是 OGB 能力标记，SPS2 与此 SPS3 测试版都可能发布它。Sensa 根据实际参数配对，不把数字 10 当作 SPS 代际。

SPS3 的原生 Socket 根标记半径为零；SPS1/2 旧标记为 0.001 m。Plug 的 `PenOthers`／`PenSelf` 继续读取原值并按实际对象校准，这一差异无需新的深度模式。在 Plug 深度或 Socket 摩擦图解中，将 **Socket 根标记**切换到 **SPS3 · 点（0 mm）**，即可观察点标记的数值与边界；切回 SPS1/2 可比较 1 mm 标记。

## 测量自己的根点和参考平面

在 Unity 中使用 **GameObject → Sensa → Automatic SPS Setup**，选择自己的 SPS3 Socket／Plug。Sensa 在构建副本中创建专用测量对象；四点定位、Contact 直接定位、原生根点编码和 Tracking Frame 沿用已有 `Sensa/…` 协议。

也可明确选择 SPS3 原生 Contact 的根点。SPS3 Socket 的 X 缩放编码分组与标志，Plug 的缩放编码长度和粗细；Sensa 将这类标记的位置与旋转转换为独立的刚性参考框，偏移和 Right／Forward 轴使用 Avatar 根单位。原始标记及通道配置保持作者设置。[Unity 设置](../unity/top.sealoong.sensa/README.zh-CN.md) · [定位和跟随平面](positioning.md)

## 实验模型探针

原生根点编码测量所选根点；编辑器 GPU 模型探针研究形变中心线。SPS3 改用 Renderer 的 Contact 数据，SPS2 则使用 Resolver 和网格纹理。探针按相应数据接口和固定依赖选择适配器，具体操作见 [GPU 指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)。

自动化回归覆盖兼容参数的几何、隔离、估长和超时停止，以及根点和材质数据契约。实际 VRChat 客户端、GPU 像素与设备运动的结果单独记录在[验证说明](e2e-status.md)中。
