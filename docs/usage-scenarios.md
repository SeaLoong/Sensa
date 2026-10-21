# 选择接入方案

**简体中文** | [English](usage-scenarios.en.md)

使用 Avatar 已有的 OGB 参数，是开始深度或触碰联动最直接的方式。能构建自己的 Avatar 时，还可添加 Sensa SPS 测量组件，或使用实验性 Shader 捕获，读取选定根点的三维位置。

| 路线 | 适合的条件 | 结果 |
| --- | --- | --- |
| 已有 OGB / SPS | 只能使用 Avatar 已发布的 haptics 参数 | 深度径向估算或触摸强度 |
| Sensa SPS | 能构建自己的 Avatar，能明确选择真实 Socket／Plug 根 | 根点相对 Avatar 的左右、上下、前后位置 |
| Shader 捕获 | 能构建 PC 原生编码器，桌面画面实际可见图块 | 读取你框选的桌面图块，获得根点三维坐标 |

三条路线都将虚拟交互转换为设备动作目标。可先用手动／脚本确认设备方向与行程，再接入参数；[独立参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)可在无设备条件下比较模型。

## 已有 OGB / SPS

1. 应用 OSC，核对监听端口与实际来源，观察真实 `OGB/Orf/…`、`OGB/Pen/…` 或 `VFH/Zone/Touch/…`。
2. 如 Avatar 需要 OGB_ENABLED，在接收设置显式打开心跳并填写 **VRChat 接收端口**，常用 9000。Sensa 默认监听 9001；二者不可混填。
3. 选择“OGB / SPS · 深度”或“振动”，固定对象／来源，检查量程、方向与 Close 门控，保存后再启用输入。

**SPS2 · PenOthersNewRoot / PenOthersNewTip**：两路接近值描述同一 Plug 的根部与长度球。Sensa 将同来源、同实例、同类别的两路配对，先用未饱和样本估算长度，再换算为进入深浅的趋势。配对或估长尚未就绪时，结果为零。

**SPS1 · PenOthers / PenOthersClose**：`PenOthers` 可以理解为进入深浅的变化趋势；`PenOthersClose` 表示目标是否进入 Socket 周围的有效接近区。Sensa 在 SPS2 参数缺失或两值均零时考虑 SPS1，来源发布 Close 时按它限定有效区域；Plug 的单值则直接读取。

正对 Socket 的靠近最容易与进入深浅对应，横移、倾斜和作者尺寸也会改变数值，适合按期望的动作起点与终点校准。`Touch` 表示触碰区域内的接近强度，Plug `FrotOthers` 表示贴近或擦过时的强度，两者结合各自的 Close 条件使用；Socket Frot 与独立 Touch Zone 直接按对应值读取。[预设](presets.md) · [外部生成器和半径](ogb-compatibility.md)

## Sensa SPS 固定四锚点

在 Unity 添加 **Fixed SPS Root Probe** 或 **Automatic SPS Setup**，明确选择受支持的 Socket／Plug 根点。四个半径 2 m 的接收器固定在 Avatar 根下，一个半径 0.001 m 的小标记跟随所选根点；测量点间距约 0.99 m：

`P0=(-.35,.65,-.35)`、`P1=(.35,.65,.35)`、`P2=(.35,1.35,-.35)`、`P3=(-.35,1.35,.35)`。

放置目标前，先看 Unity 或图解中的绿色共同检测区。目标位于四个接收球的交集内，才满足位置解算的空间条件。

五个测量字段为 `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`。P0–P3 分别表示四个测量点的接近程度；Sample=0 失效，活动时约每 50 ms 循环 n/32（n=1…32），重复同值不续期。默认变化寿命 1000 ms，上限 1250 ms。可选菜单选择器是额外控制参数，不计入五个测量字段。

在根点面板固定对象，选择 X／Y／Z／距原点，采集两端并检查预览，替换草稿、保存，最后允许实验空间输入并启用输入。缺少采样、数据冻结、几何不一致或缩放检查失败，都会使坐标失效，并停止相关动作。

Unity 测量组件与桌面程序使用同一套共享几何。

单位是 Avatar 根局部单位，只有尺度为 1 才等于世界米。绿色共同区域和测量点附近的饱和区共同限定可用范围。[定位与停止](positioning.md) · [Unity 安装](../unity/top.sealoong.sensa/README.zh-CN.md) · [推导证据](fixed-anchor-research.md)

## Shader 根编码与区域捕获

在 Unity 添加 **Shader Root Capture (Experimental)**，选择要测量的根点，并设置一个 1–65535 的对象编号（Producer ID）；桌面桥需要选择同一编号。构建会生成将根点位置画成图块的组件。上传后的 Avatar 菜单默认关闭编码，需要你手动开启。

1. 在实际客户端开启编码，确认桌面上确实可见图块。
2. 选择紧贴完整图块外边缘的物理像素捕获区域（ROI），至少 80×48 像素，并固定相同对象 ID。桥按区域宽高推算每格大小，因此边界需要与完整图块贴合。先仅解码观察，再保存捕获设置并明确选择 OSC 目标。
3. 原生图块为 20×12 格：固定边缘标记包围 16×8 数据区。可容忍一条边损坏和小幅平移，但仍需通过数据 CRC、对象 ID、坐标标志与推进帧校验；默认 350 ms 冻结失效，启动／恢复需两个推进帧。
4. 有效单 bundle 按 `Sensa/Shader/<id>/{Frame,X,Y,Z,Valid}` 顺序发送，Valid 最后为 1；失效仅发 Valid=0。
5. 在根点面板校准、保存，再分别授予实验许可与输入许可。

桌面还检查同来源连续字段、坐标范围与最多 500 ms 的 Frame 变化寿命。对象 ID 写在路径中；二进制图块保存 ID、坐标类型、CRC 与帧号。诊断 ID0 使用独立 `Sensa/Diagnostics/Shader/0` 检查捕获链路。

Avatar 编码器和桌面桥按相同编码配置工作，边缘标记帮助纠正小幅捕获偏移。

编码范围为 X/Z=[−2,2]、Y=[−1,3]，读数表示所选 Transform 根中心相对 Avatar 的位置。16-bit 编码提供细分数值，实际响应还受渲染、桌面合成和捕获影响；按选用的桌面或头显画面检查方向、延迟与有效状态。[操作命令](../unity/top.sealoong.sensa/GPU-TRACKING.md) · [实现与来源](shader-capture-research.md)

## 其他输入与工具

手动十二轴和单 L0 funscript 适合先确认设备行程。原生 PB 使用 Stretch＋IsGrabbed 参数建立标量控制；L0 录制保存分发前的动作目标。OSCQuery／Hub 用于发现参数和转发消息。

独立 Point／Handle／Pose、实验室 QuickStart 和合成 Shader 图案用于探索测量模型、检查采样和传输。[实验室](lab-workflow.md)

完成配置后，在实际客户端确认参数随动作变化，再用较小行程检查设备方向、响应与停止。自动检查结果见[浏览器验证记录](e2e-status.md)。[完整功能](features.md)
