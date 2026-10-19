# 三条实际接入路线

**简体中文** | [English](usage-scenarios.en.md)

SPS 的 haptics 使用 OGB 参数，Socket 和 Plug 是同一体系的两侧。Sensa 提供现有参数读取、固定锚点定位和图像编码捕获三条路线；[参数字典与半径](osc-parameters.md)解释每个字段、单位与触发范围。合成阶梯仅供内部回归，不作为用户方案。

| 路线 | 已有条件 | 数据与效果 | 当前边界 |
| --- | --- | --- | --- |
| OGB / SPS | Avatar 实际发布 haptics 参数 | 现代 Root／Tip 或旧近接控制深度，触摸控制振动 | 径向／近接估算，不是准确 XYZ 或轴向插入深度 |
| Sensa SPS | 可构建自己的 PC Avatar，明确选择 Socket／Plug 根 | 固定 P0–P3＋专用根标记，重建 AvatarRootLocal 坐标并校准到轴 | 仅自己的根；受覆盖、缩放和非原子 OSC 限制 |
| Shader 捕获 | 可构建编码器，桌面能实际捕获图块 | 根坐标→ID／CRC／帧号图块→区域解码→坐标校准 | PC 实验；隐藏层不保证桌面可见，真实客户端／HMD 尚未验收 |

这些路线生成设备命令，不提供设备位置回读。TCode 串口／UDP／TCP 或 Intiface 特征负责输出；服务连接成功不代表硬件执行成功。

## 1. OGB / SPS：读取现有参数

先应用 OSC 输入方式，确认监听地址、端口和实际来源，观察 `OGB/Orf/...`、`OGB/Pen/...` 或独立触摸区 `VFH/Zone/Touch/...`。

- 在“接收与转发设置 → OGB 参数启用”明确启用心跳，目标是 **VRChat 接收地址**，常用 `127.0.0.1:9000`；Sensa 默认监听 9001。每 5 秒发送 OGB_ENABLED=true，离开 OSC／停止时尝试 false。默认关闭，与设备输入许可独立；UDP 没有确认。
- “OGB / SPS · 深度”优先同来源、完整实例及 Self／Others 的现代配对。缺另一通道或未估长时输出零；现代值均零／缺失才回退旧单近接。Plug 按原值，不统一反向。
- “OGB / SPS · 振动”使用 Touch／Frot 及所需 Close；独立 VFH Touch Zone 直接读取，不需要虚构 Close。
- 固定实际对象和来源，检查量程、方向后保存，再启用输入。更换 Avatar、映射或重新启用会清除现代估长缓存。
- NewTip 是根部同心长度球，并非尖端标记。偏移、旋转、多 Sender 和运行时缩放都限制估算，不能从参数名推断真实坐标。

官方 OGB v1 已有 Root／Tip 与旧回退，按“新旧应用版本”划分单双触发器并不可靠。[完整参数与生成器半径](ogb-compatibility.md) · [三个预设](presets.md)

## 2. Sensa SPS：固定四锚点测根位置

添加 **Sensa → Fixed SPS Root Probe**，明确选择 Socket／Plug、Sensa Component 或受支持的原生 Contact 根。专用半径 0.001 的小球跟随该根；四个半径 2.5 的接收球固定在 Avatar 根下。

| 锚点 | AvatarRootLocal 坐标 |
| --- | --- |
| P0 | (-0.5, 0.5, -0.5) |
| P1 | (0.5, 0.5, 0.5) |
| P2 | (0.5, 1.5, -0.5) |
| P3 | (-0.5, 1.5, 0.5) |

每个对象的测量路径只有：

```text
Sensa/SPS/<对象>/P0
Sensa/SPS/<对象>/P1
Sensa/SPS/<对象>/P2
Sensa/SPS/<对象>/P3
Sensa/SPS/<对象>/Sample
```

P0–P3 是近接值，不是 XYZ；未饱和时中心距 `d=2.5×(1−p)+0.001`。Sample=0 表示停用／失效；有效时每 50 ms 循环 1/32…1，兼任有效状态与活动计数。相同计数重发不会续期。Profile、Scale、Valid、Heartbeat、Self／Others 路径层级均移除，不提供旧八路或版本路径别名。

1. 在参数页固定对象和来源，进入根点面板。
2. 选择 X／Y／Z／距原点，采集实际 0%／100% 两端，预览并替换草稿、保存。
3. 明确允许实验空间输入，再启用输入。Sample=0、冻结／超时、缺采样或拟合不一致会阻断并停止。

几何由 Unity／桌面共享，ScaleFactor／IsLocal 在 FX 内守卫有效性；RawP 仅注册 FX，不作为公开表达参数。可选本地菜单 `Sensa/Select/<group>` 是 Int 控制，不属于这五个测量字段，仍可能由 OSC 导出。仅测自己的专用根；Automatic SPS Setup 保留 Dedicated／Exclusive 两种方式。

半径属于作者局部单位。有效体积是四球交集，SDK 世界半径上限为 3 m；作者和运行时缩放守卫在限幅前停用，非均匀／自定义动画根缩放拒绝。单点不能提供朝向、尖端、表面或准确插入比例，Sample 也不证明 Contact 同帧。[定位与覆盖](positioning.md) · [安装](../unity/top.sealoong.sensa/README.md) · [设计证据](fixed-anchor-research.md)

## 3. Shader：根坐标编码与显式区域捕获

添加 **Sensa → Shader Root Capture (Experimental)**，选择真实 Socket／Plug 根并设置非零 producer ID。构建器生成原生蒙皮点、单个 None-eye Camera 与编码 Shader，默认由本地菜单关闭。没有 Avatar 自定义回读 C#。

1. 在实际客户端开启编码显示，确认桌面窗口里能看见图块。
2. 明确设置物理像素区域和 producer ID；先 decode-only 检查，再保存注册并明确指定 OSC 端口。
3. 桥校验黑白阈值、CRC、ID、坐标类型和帧推进；冻结、旧帧、错误区域等只发送 Valid=0，恢复需两帧推进。
4. 原生有效包发到 `Sensa/Shader/<非零ID>`，按 `Frame、X、Y、Z、Valid` 顺序在一个 bundle 内提交，Valid 最后为 1。独立失效只发 Valid=0。
5. 在同一根点面板校准并明确允许实验空间输入。

对象 ID 已在路径中，公开 Producer／Profile 字段删除；二进制 ID、坐标类型位、CRC 和帧号仍保留。桌面检查同来源连续五字段、范围和 Frame 内容变化时效；桥负责循环序号前进和恢复。诊断图块使用 `Sensa/Diagnostics/Shader/0`，只预览传输，不生成坐标映射。

Shader 不使用 Contact 触发半径，而是固定编码立方体：X/Z=[−1.5,1.5]、Y=[−0.5,2.5]，均为 Avatar 根局部单位。16-bit 量化步长约 0.00004578，不能当作真实精度。单相机及每点一次 CRC 减少冗余渲染工作；未做实际客户端性能测试。

镜面层、VR 隐藏层、头显合成和桌面镜像不是同一个画面，必须实际确认区域可捕获。[设置与命令](../unity/top.sealoong.sensa/GPU-TRACKING.md) · [实现研究](shader-capture-research.md)

## 基础输入与辅助工具

- **手动：** 十二轴目标，用于连接／方向／量程基准；连续发送跟随修改，不自动往返。
- **funscript：** 单 L0 时间线，支持倍速、循环、A–B 与定位；没有音视频同步。
- **原生 PB：** 实际 Stretch＋IsGrabbed 做标量控制；模板 MyPB 必须换成真实前缀，不提供 XYZ。
- **L0 录制：** 记录分发前命令，停止保留末值时长，重录确认才清空；没有多轴、门控事件、视频时钟或设备回读。
- **OSC Hub／OSCQuery：** 用于转发、发现、订阅或轮询；收包频率不代表传感器内容变化。
- **独立 Point／Handle／三标记 Pose 实验：** 保留各自测量模型，不参与新 SPS 协议兼容；不能替代正式生产端验证。

## 验证边界

隔离单元契约检查几何、字段、来源和生命周期；Unity EditMode 检查作者生成和原生组件；CI 浏览器／mock wire 检查交互到模拟输出。真实上传、Contacts／OSC、桌面／HMD 图块、坐标准确度及硬件动作需要独立验收。[功能参考](features.md) · [视觉评审](ui-visual-review.md)
