# SPS3 与 VRCFury

**简体中文** | [English](sps3.en.md)

本页按已发布的 [VRCFury 1.1491.0 正式版](https://github.com/VRCFury/VRCFury/releases/tag/com.vrcfury.vrcfury/1.1491.0)（`0723fc6e`）核对。请按 Avatar **实际发出的路径**选择预设；仅更新 Unity 工程里的 VRCFury 不会改变已上传的 Avatar。

## 用深度或触摸控制输出

1. 构建桌面 Avatar 时，要输出 Socket／Plug 的 OSC 参数，应保留 **Tools → VRCFury → Settings → Enable SPS Haptics**。公开互动保留 **Include Public SPS Channel**；自定义通道则要双方匹配，并允许对应的 Self／Others。
2. 在 Sensa 应用 OSC 输入方式。若需激活触觉接收器，在**输入 → OSC → 接收与转发设置**启用 OGB 参数控制；它会发送正式版的 `OGB/Enabled` 和旧版的 `OGB_ENABLED`，停止时撤销两者。观察参数时让设备的**输入启用**保持关闭。
3. 移动一个对象，确认参数路径、实例名和数值。再使用对应轴映射预设，按实际运动两端校准；核对预览并保存，最后才启用设备输出。

| 收到的 OSC 参数（`<id>` 是构建后的对象标识） | 预设可以做什么 |
| --- | --- |
| `OGB/Socket/<id>/DepthOthers` 或 `OGB/Plug/<id>/DepthOthers`（自身为 `DepthSelf`） | 单条 0～1 接近值驱动 L0：数值升高，主轴指令随之升高。不是以米为单位的插入深度，也不保证等于插入百分比；无需配对 Root／Tip 或先估长。 |
| `OGB/Socket/<id>/TouchOthers` 或 `OGB/Plug/<id>/TouchOthers`（自身为 `TouchSelf`） | 触摸值驱动 V0：读数越高，请求的振动强度越高。Socket 需满足构建触摸区的条件；Plug 的读数沿接触面测量。两者都不需要 `Close`。 |
| `OGB/Plug/<id>/FrotOthers` | Plug 与另一 Plug 接触时，按接触面接近值控制振动；它不是移动速度。 |
| `OGB/Touch/<id>/Others` 或 `Self` | 独立触摸区控制强度，不需要 Socket／Plug，也不用 `Close`。 |

`OGB/Version/11` 是能力标记，不是动作读数；构建时关闭触觉会有 `OGB/HapticsDisabled`。Socket 的 `DepthRadius` 和 Plug 的 `LengthMult1/2` 是辅助参数，不应当作深度。新 SDK 可用时，深度 Receiver 还请求高级报告，例如另一路 `_SenderVelocityMagnitude` 代表 m/s。[OSC 参数字典](osc-parameters.md) · [预设与校准](presets.md)

## 旧 Avatar 与原生 Contact 标签

`OGB/Orf/<id>/PenOthersNewRoot`＋`PenOthersNewTip` 是**旧版** Socket 测量。Sensa 仍按同来源、同对象和同一 Self／Others 配对，先估长再按旧几何换算。`OGB/Pen/<id>/PenOthers`、旧触摸及其 `Close`、`VFH/Zone/Touch/...` 沿用各自原有规则。旧新协议不是简单替换前缀。[旧版参数几何](ogb-compatibility.md)

`SPS/Plug/<channel>`、`SPS/Socket/<channel>`、`SPS/SocketPath/<channel>` 是 **Avatar 内的碰撞标签**，不自动成为 OSC 参数。SPS3 Socket 入口使用零半径标记，Plug 和 Socket 的缩放分别携带不同的元数据，不能当成普通 Avatar 缩放。可选的 GPU 模型探针单独锁定 Shader 依赖；支持 OSC 与作者组件几何，不等于新版 Shader 已验证。

**对应的正式版源码：**[Socket OSC](https://github.com/VRCFury/VRCFury/blob/0723fc6eeb764c37b5ed00b3ae27f48cadcc0596/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L141-L168)、[Plug OSC](https://github.com/VRCFury/VRCFury/blob/0723fc6eeb764c37b5ed00b3ae27f48cadcc0596/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L117-L159)、[深度参数](https://github.com/VRCFury/VRCFury/blob/0723fc6eeb764c37b5ed00b3ae27f48cadcc0596/com.vrcfury.vrcfury/Editor-Avatars/Service/SelfAndOthersReceiverAnimatorService.cs#L71-L82)、[独立触摸区](https://github.com/VRCFury/VRCFury/blob/0723fc6eeb764c37b5ed00b3ae27f48cadcc0596/com.vrcfury.vrcfury/Editor-Avatars/Feature/VRCFuryHapticTouchReceiverBuilder.cs#L24-L49)、[本地启用条件](https://github.com/VRCFury/VRCFury/blob/0723fc6eeb764c37b5ed00b3ae27f48cadcc0596/com.vrcfury.vrcfury/Editor-Avatars/Service/OgbEnabledService.cs#L17-L38)、[原生标签](https://github.com/VRCFury/VRCFury/blob/0723fc6eeb764c37b5ed00b3ae27f48cadcc0596/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/SpsTags.cs)。

## 测量自己的根点和参考平面

在 Unity 中使用 **GameObject → Sensa → Automatic SPS Setup**，选择自己的 SPS3 Socket／Plug。Sensa 在构建副本中创建专用测量对象；四点定位、Contact 直接定位、原生根点编码和 Tracking Frame 沿用已有 `Sensa/…` 协议。

也可明确选择 SPS3 原生 Contact 的根点。SPS3 Socket 的 X 缩放编码分组与标志，Plug 的缩放编码长度和粗细；Sensa 将这类标记的位置与旋转转换为独立的刚性参考框，偏移和 Right／Forward 轴使用 Avatar 根单位。原始标记及通道配置保持作者设置。[Unity 设置](../unity/top.sealoong.sensa/README.zh-CN.md) · [定位和跟随平面](positioning.md)

## 实验模型探针

**边界：SPS3 GPU 探针锁定的是此前测试过的 Beta 依赖，尚未验证 VRCFury 1.1491.0 的实际 GPU 像素或形变中心线。**

原生根点编码测量所选根点；编辑器 GPU 模型探针研究形变中心线。SPS3 改用 Renderer 的 Contact 数据，SPS2 则使用 Resolver 和网格纹理。探针按相应数据接口和固定依赖选择适配器，具体操作见 [GPU 指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)。

自动化回归覆盖兼容参数的几何、隔离、估长和超时停止，以及根点和材质数据契约。实际 VRChat 客户端、GPU 像素与设备运动的结果单独记录在[验证说明](e2e-status.md)中。
