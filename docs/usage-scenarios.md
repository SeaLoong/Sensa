# 三条实际接入路线

**简体中文** | [English](usage-scenarios.en.md)

SPS 是 Avatar 交互系统，其 haptics 使用 OGB 参数；Socket 和 Plug 是同一参数体系的两侧。Sensa 将现有参数读取、固定锚点测量、图像编码捕获分成三条实际路线。合成阶梯保留为内部回归工具，不作为安装或控制方案。

| 路线 | 已有条件 | 数据与效果 | 当前边界 |
| --- | --- | --- | --- |
| OGB / SPS | Avatar 实际输出 OGB 参数 | 自动选择现代 Root／Tip 或旧单近接；接触映射到振动 | 径向／近接强度，不是准确 XYZ 或任意姿态插入深度 |
| Sensa SPS | 可构建自己的 PC Avatar，能明确选择 Socket／Plug 根 | 固定四锚点＋专用根标记，还原 AvatarRootLocal 坐标并校准到轴 | 默认 Self；Others 仅诊断；缩放、共同覆盖和非原子 OSC 有限制 |
| Shader 捕获 | 可生成原生编码组件，桌面能实际看到并捕获图块 | 根点坐标→带 ID／CRC／帧号的图块→显式区域捕获→坐标校准 | PC 实验；隐藏层不保证可捕获；真实客户端／像素精度尚未验收 |

三条路线最终都生成设备命令，不提供设备位置回读。传输选择为 TCode 串口／UDP／TCP 或 Intiface 所支持的设备特征；本地连接状态不等于硬件执行成功。

## 1. OGB / SPS：直接利用已有参数

无需给已有 OGB Avatar 再安装一套假定的 SPS 参数。先应用 OSC，确认实际监听口和来源，在参数页查看 `OGB/Orf/...`、`OGB/Pen/...`。

- 在“接收与转发设置 → OGB 参数启用”显式启用 `OGB_ENABLED` 心跳，填写真实 VRChat 接收 IP／端口。默认关闭，常用目标是 `127.0.0.1:9000`；Sensa 默认监听 9001。仅 OSC 接收运行时每 5 秒发送 true，停止时发送 false。它不授予设备输入许可，也没有 UDP 应答证明。
- “OGB / SPS · 深度”使用 `OgbDepth`。同一来源、完整实例、Self／Others 下现代通道有正值时优先配对；缺配对或未估长保持零。现代通道均零／缺失才允许旧 PenOthers 回退。Plug 按原值，不统一反向。
- “OGB / SPS · 振动”使用 `OgbTouch`。Touch 与 Plug Frot 的 Close 必须由同对象开放，Socket Frot 直接使用。输出 V0；Intiface 默认也选择 V0。
- 用实际参数固定对象，检查方向／量程后保存，再启用输入。通配符用于发现，不能把不同对象或来源拼成一对。
- 现代 Socket 首次或重新启用后应先从外部接近估长；改变 Avatar／映射／输入许可会清除旧长度。偏移、倾斜与多个 Sender 都会影响径向估算。

“旧版本只有单触发器”并非通用版本边界：官方 OGB v1 已有现代配对与旧回退。兼容按实际 producer 能力判断。[完整能力矩阵与固定上游源码](ogb-compatibility.md) · [三个模板](presets.md)

## 2. Sensa SPS：直接测选定根点

在自己的 Avatar 安装 Unity 包，添加 **Sensa → Fixed SPS Root Probe**，明确选择实际 Socket／Plug、Sensa Component 或受支持的原生 Contact 根。专用小球跟随选定根中心；四个接收器固定在 Avatar 根下，不跟着目标或 Socket 移动。Automatic SPS Setup 的 Dedicated／Exclusive 也使用该实现。

两端共享一个几何定义：

| 锚点 | AvatarRootLocal |
| --- | --- |
| A0 | (-0.5, 0.5, -0.5) |
| A1 | (0.5, 0.5, 0.5) |
| A2 | (0.5, 1.5, -0.5) |
| A3 | (-0.5, 1.5, 0.5) |

接收半径 2.5，专用标记半径 0.001；数值属于作者局部单位。共同有效体积是四球交集，并非整个 Avatar 附近无限覆盖。SDK 世界半径上限 3 m；作者和运行时缩放守卫在发生限幅前关闭测量，非均匀缩放拒绝。

```text
Sensa/SpsRoot/v1/<实例>/Self/Root/A0 ... A3
Sensa/SpsRoot/v1/<实例>/Self/{Profile,Valid,Scale,Heartbeat}
```

1. 在参数页确认四路与元数据，进入根点面板，固定目标和来源。
2. 选择 X／Y／Z／距原点，采集实际 0% 与 100% 两端；预览后替换草稿并保存。
3. 显式允许实验空间输入，再启用；失效、心跳冻结、超时或目标歧义会阻断并停止。
4. 半径、坐标和标记模型由共享协议生成，不能拿普通 TPS 根球替代专用小标记。

Self 在构建时保证专用通道没有第二个本地 Sender；Others 仍可能混合多个 peer，因此只诊断、Valid 始终 false。32 步心跳及周期复制改善静止值和采样别名问题，仍不证明 OSC 同帧／无丢包。输出只有根位置，不能据单点推断朝向、尖端、表面或精确插入比例。[几何／缩放／时效](positioning.md) · [安装](../unity/top.sealoong.sensa/README.md) · [研究证据](fixed-anchor-research.md)

## 3. Shader：真实根点编码与显式捕获

添加 **Sensa → Shader Root Capture (Experimental)**，选择真实 SPS Socket／Plug，固定非零 producer ID。构建器生成原生 SkinnedMeshRenderer、相机、RenderTexture、编码／显示 Shader 和本地菜单。Avatar 不执行自定义桌面 C#；Editor Model Probe 仍是独立诊断工具。

1. 在实际客户端启用默认关闭的编码显示，找到桌面窗口里真实可见的图块。
2. 明确设置物理像素区域和 producer ID；先 decode-only 核对，再保存注册并明确指定 OSC 端口。命令与注册格式见 [Shader 指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)。
3. 桥检查 RGB 黑白阈值、CRC、ID、坐标配置及递增帧。冻结、旧帧、错误区域或异常会发送 Valid=0，恢复需连续进展帧。
4. Sensa 接收 `Sensa/Shader/v1/<ID>/...` 完整原生包，在同一个根点面板做两端校准并显式允许实验空间输入。

有效包顺序为 Valid、Frame、X、Y、Z、Producer、Profile；桌面核对完整接收序列、Profile 1、匹配 ID、范围和内容变化时效。只反复重发相同 Frame 不会续期。Profile 0 的旧诊断图块只用于预览，不生成可用坐标。

原生根点坐标与固定锚点共用 AvatarRootLocal；不等于变形 SPS 尖端或网格表面。镜子专用层、VR 隐藏层、头显合成与桌面镜像不是同一个画面，必须实际看见并注册，不能凭渲染层名字承诺桌面能捕获。[官方与源码核验](shader-capture-research.md)

## 基础输入与辅助工具

- **手动：** 十二轴目标，适合建立连接／方向／量程基准；连续发送跟随修改，不自动往返。
- **funscript：** 单 L0 时间线，支持倍速、循环、A–B 和定位；无音视频同步。
- **原生 PB：** 实际 Stretch＋IsGrabbed 做标量控制；不需要四锚点，也不提供 XYZ。MyPB 模板必须换成实际前缀。
- **L0 录制：** 记录分发前命令，停止保留末值持续时间；重录确认后清空。无多轴、门控／停止事件、视频时钟或设备回读。
- **OSC Hub／OSCQuery：** 用于转发、目录发现／订阅或轮询；转发频率不代表传感器内容在变化。
- **旧三点／SharedRoot 实验：** 留给已有 lab 验证；不当作这三条路线的前置条件或生产定位证明。

## 验证边界

本地隔离契约验证模型、来源和生命周期；Unity EditMode 验证作者生成、原生组件和 Shader 导入；CI 浏览器／mock wire 验证交互到模拟输出。真实 SDK 上传、VRChat Contacts／OSC、桌面／HMD 图块、坐标准确度与硬件动作需要各自验收，不能用前一层替后一层。具体检查与画面见[功能参考](features.md)和[视觉评审](ui-visual-review.md)。
