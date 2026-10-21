# 选择接入方案

**简体中文** | [English](usage-scenarios.en.md)

不能编辑 Avatar 时，读取它已有的 OGB 参数。可以重新构建自己的 Avatar、并希望获得根点三维位置时，再选择 Sensa SPS 或实验性 Shader 捕获。SPS 本身负责 Avatar 的形变与交互；Sensa SPS 则额外添加本项目的测量组件。

| 路线 | 适合的条件 | 结果 |
| --- | --- | --- |
| 已有 OGB / SPS | 只能使用 Avatar 已发布的 haptics 参数 | 深度径向估算或触摸强度 |
| Sensa SPS | 能构建自己的 Avatar，能明确选择真实 Socket／Plug 根 | 根点相对 Avatar 的左右、上下、前后位置 |
| Shader 捕获 | 能构建 PC 原生编码器，桌面画面实际可见图块 | 显式 ROI 解码得到根点 XYZ |

三条路线都生成命令目标，没有设备回读。常规手动／脚本可先作为方向与范围基准；[独立参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)可在无设备条件下比较模型。

## 已有 OGB / SPS

1. 应用 OSC，核对监听端口与实际来源，观察真实 `OGB/Orf/…`、`OGB/Pen/…` 或 `VFH/Zone/Touch/…`。
2. 如 Avatar 需要 OGB_ENABLED，在接收设置显式打开心跳并填写 **VRChat 接收端口**，常用 9000。Sensa 默认监听 9001；二者不可混填。
3. 选择“OGB / SPS · 深度”或“振动”，固定对象／来源，检查量程、方向与 Close 门控，保存后再启用输入。

现代 Socket 使用同来源、完整实例、Self／Others 配对的 Root／Tip，先通过未饱和样本估长；缺配对或尚未估长给零。现代缺失或均零才考虑旧单近接；Plug 直接使用原值。Touch／Plug Frot 要求实际存在的 Close；Socket Frot 与独立 Touch Zone 按各自规则读取。

NewTip 是**根中心的长度球**，不是尖端坐标；旋转、侧向偏移、多个 Sender、尺度与异步通道都限制结果。OGB v1 已有现代与旧回退，不能靠“新旧软件版本”判断几何。[预设](presets.md) · [外部生成器和半径](ogb-compatibility.md)

## Sensa SPS 固定四锚点

在 Unity 添加 **Fixed SPS Root Probe** 或 **Automatic SPS Setup**，明确选择受支持的 Socket／Plug 根点。四个半径 2 m 的接收器固定在 Avatar 根下，一个半径 0.001 m 的小标记跟随所选根点；测量点间距约 0.99 m：

`P0=(-.35,.65,-.35)`、`P1=(.35,.65,.35)`、`P2=(.35,1.35,-.35)`、`P3=(-.35,1.35,.35)`。

放置目标前，先看 Unity 或图解中的绿色共同检测区。目标要同时被四个接收器测到，不能将完整坐标方框当作覆盖范围。

五个测量字段为 `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`。P 是近接，不是坐标；Sample=0 失效，活动时约每 50 ms 循环 n/32（n=1…32），重复同值不续期。默认变化寿命 1000 ms，上限 1250 ms。可选菜单选择器是额外控制参数，不计入五个测量字段。

在根点面板固定对象，选择 X／Y／Z／距原点，采集两端并检查预览，替换草稿、保存，最后允许实验空间输入并启用输入。缺采样、冻结、拟合或缩放守卫失败会阻断停止。

从旧几何更新后，应重新构建 Avatar、替换旧的生成测量组件，再使用更新后的桌面程序；混用新旧几何会得到错误解算。

单位是 Avatar 根局部单位，只有尺度为 1 才等于世界米。四球交集与饱和区限制可用范围；单根不提供朝向、世界运动、尖端或 GPU 表面。[定位与停止](positioning.md) · [Unity 安装](../unity/top.sealoong.sensa/README.zh-CN.md) · [推导证据](fixed-anchor-research.md)

## Shader 根编码与区域捕获

使用 **Shader Root Capture (Experimental)**，选择真实根与非零 producer ID。构建生成原生蒙皮点、一个 None-eye Camera 和 Shader；本地菜单默认 Off，没有上传后运行的自定义 C# 回读器。

1. 在实际客户端开启编码，确认桌面上确实可见图块。
2. 选择包含全部图块的物理像素捕获区域（ROI），至少 80×48 像素，并固定相同对象 ID。先仅解码观察，再注册并明确选择 OSC 目标。
3. 原生图块为 20×12 格：固定边缘标记包围 16×8 数据区。可容忍一条边损坏和小幅平移，但仍需通过数据 CRC、对象 ID、坐标标志与推进帧校验；默认 350 ms 冻结失效，启动／恢复需两个推进帧。
4. 有效单 bundle 按 `Sensa/Shader/<id>/{Frame,X,Y,Z,Valid}` 顺序发送，Valid 最后为 1；失效仅发 Valid=0。
5. 在根点面板校准、保存，再分别授予实验许可与输入许可。

桌面还检查同来源连续字段、坐标范围与最多 500 ms 的 Frame 变化寿命。公开 Producer／Profile 已删除；二进制 ID、坐标类型、CRC 与帧号仍保留。诊断 ID0 使用独立 `Sensa/Diagnostics/Shader/0`，不生成运动根点。

更新时应一起更新 Avatar 编码器和桌面桥，再重建捕获注册；旧半范围 1.5 的注册会被拒绝。边缘标记改善对齐，不会消除渲染延迟或证明底层测量新鲜。

编码范围 X/Z=[−2,2]、Y=[−1,3]，不是 Contact 半径。16-bit 量化步长不是实测精度。它测 CPU 根 Transform，不测 SPS 最终形变；隐藏层、镜面、HMD 与桌面合成不是同一画面，必须实际验收。[操作命令](../unity/top.sealoong.sensa/GPU-TRACKING.md) · [实现与来源](shader-capture-research.md)

## 其他输入与工具

手动十二轴和单 L0 funscript 不需要 Contact 解算。原生 PB 用真实 Stretch＋IsGrabbed 前缀做标量控制；L0 录制只记录分发前目标。OSCQuery／Hub 负责发现与转发，不建立位置语义。

独立 Point／Handle／Pose 与实验室 QuickStart、合成 Shader 码仍供内部验证；它们不是三条正式路线的兼容层或精度证明。[实验室](lab-workflow.md)

隔离契约、EditMode 和 CI mock wire 分别检查自己的边界。真实上传、Contacts／OSC、桌面／HMD 捕获、准确度和机械动作仍需独立验收。[完整功能](features.md)
