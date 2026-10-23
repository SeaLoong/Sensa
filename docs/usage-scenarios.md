# 按使用目标选择方案

**简体中文** | [English](usage-scenarios.en.md)

从想得到的结果出发，选择输入、计算和输出。下面列出可以直接搭建的常见流程；VRChat 参数和定位方案继续放在后面的专节。

| 想做什么 | 建议的流程 | 配置说明 |
| --- | --- | --- |
| 先试一个数值或一段脚本 | 手动／脚本 → 设备、应用或录制 | [首次使用](quick-start.md) |
| 融合多个读数或加入平滑、阈值 | 多来源 → 计算信号 → 一个或多个输出 | [计算与多输出](signal-pipeline.md#同一个结果连接多个输出) |
| 回写 Avatar 效果参数 | 信号 → OSC 参数输出 → VRChat 接收端 | [OSC 回写](signal-pipeline.md#回写-vrchat-osc) |
| 联动 DG-LAB 或其他应用 | 信号 → DG-LAB、MIDI、HTTP／WebSocket JSON 或 MQTT | [输出选择](signal-pipeline.md#添加输出与绑定) |
| 留下可编辑、可播放的轨迹 | 选定绑定 → funscript 轨道 → 下载／回放 | [录制与观察](signal-pipeline.md#录制与观察) |
| 读取 Avatar 的触碰或空间运动 | OGB／SPS、Contact 或 Shader → 校准／计算 → 输出 | 本页下方的 VRChat 接入方案 |

## VRChat 参数与定位

Avatar 已有的 OGB／SPS 参数提供接近、触碰和深度相关读数；制作自己的 Avatar 时，还可选择 SPS 四点定位、Contact 直接定位或 Shader 捕获。

| 路线 | 适合的条件 | 结果 |
| --- | --- | --- |
| 已有 OGB / SPS | 只能使用 Avatar 已发布的 haptics 参数 | 深度径向估算或触摸强度 |
| SPS 四点定位 | 能构建自己的 Avatar，能明确选择 SPS Socket／Plug 根点 | 根点相对 Avatar 的左右、上下、前后位置 |
| Contact 直接定位（SDK Beta） | 使用受支持的 Beta SDK 构建自己的 Avatar，并配置专用自身根点通道 | 米制根点位置和 m/s 相对速度 |
| Shader 捕获 | 能构建 PC 原生编码器，桌面画面实际可见图块 | 读取所选图块，获得根点位置、X/Z 轴向与 Avatar 世界缩放 |

四条路线都提供可用于设备动作或其他输出绑定的信号。可先用手动／脚本确认设备方向与行程，再接入参数；[独立参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)可在无设备条件下比较模型。

## 已有 OGB / SPS

1. 应用 OSC，核对监听端口与实际来源，观察真实 `OGB/Orf/…`、`OGB/Pen/…` 或 `VFH/Zone/Touch/…`。
2. 如 Avatar 需要 OGB_ENABLED，在接收设置显式打开心跳并填写 **VRChat 接收端口**，常用 9000。Sensa 默认监听 9001；二者不可混填。
3. 选择“OGB / SPS · 深度”或“振动”，固定对象／来源，检查量程、方向与 Close 门控，保存后再启用输入。

**SPS2 · PenOthersNewRoot / PenOthersNewTip**：两路接近值描述同一 Plug 的根部与长度球。Sensa 将同来源、同实例、同类别的两路配对，先用未饱和样本估算长度，再换算为进入深浅的趋势。配对或估长尚未就绪时，结果为零。

**SPS1 · PenOthers / PenOthersClose**：`PenOthers` 可以理解为进入深浅的变化趋势；`PenOthersClose` 表示目标是否进入 Socket 周围的有效接近区。Sensa 在 SPS2 参数缺失或两值均零时考虑 SPS1，来源发布 Close 时按它限定有效区域；Plug 的单值则直接读取。

正对 Socket 的靠近最容易与进入深浅对应，横移、倾斜和作者尺寸也会改变数值，适合按期望的动作起点与终点校准。`Touch` 表示触碰区域内的接近强度，Plug `FrotOthers` 表示贴近或擦过时的强度，两者结合各自的 Close 条件使用；Socket Frot 与独立 Touch Zone 直接按对应值读取。[预设](presets.md) · [外部生成器和半径](ogb-compatibility.md)

## Contact 直接定位（SDK Beta）

安装 SDK 3.10.6-beta.2 或提供高级 Proximity 参数的后续 SDK。在 **Automatic SPS Setup** 的根点定位方式中明确选择 **Contact 直接定位（SDK Beta）**，默认仍为**SPS 四点定位**；也可直接添加 `SensaContactRootProbe`。选择自己实际的 SPS、Sensa 或原生 Contact 根点；明确选择 Sensa／原生根点时，可独立于 VRCFury 使用。

Sensa 生成跟随根点的微小球形 Sender，并在 Avatar 原点放置各轴对齐、半径 2 个局部单位的 Receiver。每个作者组件使用唯一通道和 Self-only 接收。`Sensa/Contact/<id>/…` 提供十二字段：原生位置／速度／接近报告，加上 Sensa 的 Radius 和 Sample。位置使用 AvatarRootMeters，速度为 m/s，ProximitySpeed 为接近值／秒。Radius 跟随实际世界缩放并受 3 m 上限约束；Sample 目标每 50 ms 变化，最多 1000 ms 过期。

在根点面板检查对象与来源，局部动作校准 **X／Y／Z／Distance**，运动强弱校准 **VelocityX／Y／Z／Speed／ProximitySpeed**，保存后启用空间和 OSC 输入。校准轴可读取细微深浅趋势，Touch／Close 可增加触碰确认；Contact 消失、字段非法或活动冻结时，相关动作停止。当前支持单点位置与速度，多点姿态留待后续；真实 Unity 客户端／OSC Beta 链路尚待验收。[设置、完整语义与安装包依据](contact-sdk.md)

## SPS 四点定位

在 Unity 添加**SPS 四点定位**（`SensaFixedRootProbe`）或 **Automatic SPS Setup**，明确选择 SPS Socket／Plug 根点。骨骼／空物体 Transform、Sensa 与原生 Contact 也可作为明确目标，沿用同一 SPS 根点协议。四个半径 2 个局部单位的接收器固定在 Avatar 根下，一个半径 0.001 的小标记跟随所选根点；测量点间距约 0.99 个局部单位：

`P0=(-.35,.65,-.35)`、`P1=(.35,.65,.35)`、`P2=(.35,1.35,-.35)`、`P3=(-.35,1.35,.35)`。

放置目标前，先看 Unity 或图解中的绿色共同检测区。目标位于四个接收球的交集内，才满足位置解算的空间条件。

五个测量字段为 `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`。P0–P3 分别表示四个测量点的接近程度；Sample=0 失效，活动时约每 50 ms 循环 n/32（n=1…32），重复同值不续期。默认变化寿命 1000 ms，上限 1250 ms。可选菜单选择器是额外控制参数，不计入五个测量字段。

在根点面板固定对象，选择 X／Y／Z／距原点，采集两端并检查预览，替换草稿、保存，最后允许实验空间输入并启用输入。缺少采样、数据冻结、几何不一致或缩放检查失败，都会使坐标失效，并停止相关动作。

Unity 测量组件与桌面程序使用同一套共享几何。

单位是 Avatar 根局部单位，只有尺度为 1 才等于世界米。绿色共同区域和测量点附近的饱和区共同限定可用范围。[定位与停止](positioning.md) · [Unity 安装](../unity/top.sealoong.sensa/README.zh-CN.md) · [推导证据](fixed-anchor-research.md)

## Shader 根编码与区域捕获

在 Unity 添加 **Shader Root Capture (Experimental)**，选择根点并设置 Producer ID。构建后，在实际客户端开启编码，检查桌面画面中的图块。

按[捕获操作指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)配置完整图块区域与同一对象编号，先观察解码结果和有效状态，再保存捕获设置与 OSC 目标。桌面收到根点测量后，按需要校准并启用实验空间输入。

图块结构、容错方式、位置／方向／缩放字段及有效性规则集中于[定位说明](positioning.md)与[Shader 实现依据](shader-capture-research.md)，按当前版本配置捕获和解码。

## 其他输入与工具

手动十二轴和单 L0 funscript 适合先确认设备行程。原生 PB 使用 Stretch＋IsGrabbed 参数建立标量控制；L0 录制保存分发前的动作目标。OSCQuery／Hub 用于发现参数和转发消息。

独立 Point／Handle／Pose、实验室 QuickStart 和合成 Shader 图案用于探索测量模型、检查采样和传输。[实验室](lab-workflow.md)

完成配置后，在实际客户端确认参数随动作变化，再用较小行程检查设备方向、响应与停止。自动检查结果见[浏览器验证记录](e2e-status.md)。[完整功能](features.md)

具名计算结果也可绑定到 OSC 参数、DG-LAB、网络服务或 funscript 轨道录制；目标分别设置量程与发送节奏。[输入、计算与输出](signal-pipeline.md)
