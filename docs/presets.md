# 配置模板：映射、变换与轴配置

**简体中文** | [English](presets.en.md)

配置模板分别位于**映射与变换 → 轴映射**的预设选择器、**计算信号 → 常用变换**和**轴配置 → 设备动作预设**，不再使用独立的总预设弹窗。映射和计算先载入可编辑草稿，再明确保存；轴模板在编辑器检查行程、方向与速度后保存，随后由 TCode 输出选择使用。载入模板不会启用输入。

## 内置映射模板

映射预设填入常用路径和动作角色，帮助快速建立映射。选择 Avatar 已有功能与实时来源，采集输入起止值并保存。每行都可继续调整为自己的路径、方向、范围与条件。

普通 OSR 选“前后跟随”或“轻柔起步”即可，两者都只控制主轴（L0）。有振动输出时，可在“其他预设”里选择振动联动。

先选**动作效果**，再选**Avatar 配置**。前后跟随和轻柔起步都有相同的五个配置选项。切换体验会保留已选配置；选择只更新说明，点“替换草稿”或“追加草稿”后才会生成映射。

- **前后跟随**：标准线性响应。停在同一深度，主轴应保持；前进一半行程，主轴也走一半。
- **轻柔起步**：同样跟随深度。默认量程的前 20% 留在起点，之后按平方曲线增加。走到默认输入量程的 60%，主轴约走 25%。输入起点可调整到希望开始有反馈的位置。

| 自己和对方有什么 | 同一动作的测量差异 |
| --- | --- |
| 只有 SPS 深度 | 用接近程度估计前后，侧移也可能引起回退。 |
| 接收器已开 Contact 高级位置 | 取接收器局部 Z，侧移不改变深度；将 Z 对准入口，两行填同一接收器。 |
| 自己装了 Sensa 四点定位或 Contact 自身定位 | 取自身目标在 Avatar 根坐标的 Z。入口能独立转向时，装 Tracking Frame 后可改用跟随平面。 |
| 双方装了同通道 Pose Socket／Plug | 在入口坐标中测量双方的进入比例。超出孔口或倾角范围时停止空间联动。 |

Sensa 自身定位和双方姿态方案需要允许实验空间输入。速度、触碰振动、混合输出、通用参数与自定义预设位于“其他预设”。

| 模板 ID | 用途 | 默认输出 |
| --- | --- | --- |
| `osc-l0` | 将 Depth 换成收到的 OSC 参数，可追加死区和平滑 | 0～1 → L0 0～999 |
| `ogb-depth` | 正式 SPS3 的 DepthOthers，或旧版配对估算／深浅趋势 | Depth → L0 |
| `ogb-depth-touch` | 同时准备 SPS 深度与触碰强度两条映射 | Depth → L0；Touch → V0 |
| `ogb-touch` | Touch／Frot 或独立 VFH Touch Zone | V0 |
| `native-contact-separation` | 原生 Contact 参考点间距 | 0～0.20 m → L0 |
| `native-contact-speed` | 不分方向的接触点相对速率 | 0～1 m/s → V0 |
| `native-contact-approach` | 接近值增加的速率，不是物理速度 | 0～2 接近值/秒 → V0 |
| `contact-position` | Contact 直接位置；按米校准所选轴 | SensaPoint Z → Depth／L0 |
| `contact-speed` | Contact 相对速率；按 m/s 校准强度 | SensaPoint Speed → V0 |
| `native-pb-stretch` | 原生 PB Stretch＋IsGrabbed | Depth＋GateEnable |

## OGB / SPS · 深度

**正式 SPS3：** 预设直接读取 `OGB/Socket/<id>/DepthOthers` 或 `OGB/Plug/<id>/DepthOthers`。这是 0～1 的接近值，不是插入米数，也不是长度百分比。按实际读数校准 L0；若多个对象同时命中，可将通配路径改为具体对象。升级 Avatar 后，如果旧映射只含 `OGB/Orf` 或 `OGB/Pen`，请改为新路径或重新载入预设；已保存的个人配置不会被自动覆盖。[正式 SPS3 说明](sps3.md)

**旧版 Avatar：** 预设也兼容以下 Others 路径：

```text
OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers
```

OgbDepth 优先配对同来源、同实例、同 Self／Others 类别的 `PenOthersNewRoot` 与 `PenOthersNewTip`，对应图解中的 **SPS2/SPS3 · PenOthersNewRoot / PenOthersNewTip**。先用未饱和样本估算 Plug 长度，再换算进入深浅的变化趋势；配对或估长未就绪时输出零。

SPS2/SPS3 参数缺失或两值均为零时，使用同实例的 **SPS1 · PenOthers / PenOthersClose**：`PenOthers` 提供深浅趋势，已发布的 `PenOthersClose` 限定 Socket 的有效接近区域。Plug 的 `PenOthers` 直接使用原值，按实际方向配置反向。

`PenOthersNewTip` 观测根部长度球，与 `PenOthersNewRoot` 一起反映 Plug 靠近 Socket 的程度。先将对象分开，再沿期望方向靠近，让 Sensa 取得估长样本；随后检查并校准期望的两端。更换 Avatar、修改映射或重新启用输入后会重新学习。[几何和限制](ogb-compatibility.md)

## OGB / SPS · 振动

正式 SPS3 将 `OGB/Socket/<id>/TouchOthers` 或 `OGB/Plug/<id>/TouchOthers`、`FrotOthers` 直接映射到 V0，不必等待 `Close`；独立触碰区使用 `OGB/Touch/<id>/Others`。以 Avatar 实际发布的路径为准。旧版读取：

```text
OGB/Orf/**/TouchOthers;OGB/Orf/**/FrotOthers;OGB/Pen/**/TouchOthers;OGB/Pen/**/FrotOthers;VFH/Zone/Touch/**/Others
```

OgbTouch 将 `TouchOthers` 与同实例的 `TouchOthersClose` 配对，目标进入触碰区域后采用 Touch 强度。Plug 的 `FrotOthers` 同样结合 `FrotOthersClose`，适合贴近或擦过时的联动；Socket Frot 和独立 VFH Zone 直接读取相应强度。Intiface 振动来源默认 V0，也可按需要选择 L0 等其他轴。

## 原生 PB · 拉伸

模板使用 `MyPB_Stretch` 和 `MyPB_IsGrabbed`。把 MyPB 换成实际 PhysBone 参数前缀；抓取时 GateEnable 开放，松手时关闭，拉伸程度转换为动作目标。

## 原生 Contact：这三个预设怎么选？

在 [Avatars SDK 3.10.6](https://github.com/vrchat/packages/releases/tag/3.10.6) 的 Receiver → **Advanced Parameters** 勾选 **Sender Type** 和所需的测量项，并让这两个 Animator 参数可通过 Avatar OSC 读取。先在**输入 → OSC → 参数**确认实际路径和读数，再载入一个预设，把**两行**的 `MyContact` 都换成 Receiver 的参数名（不是物体名）。不需要安装 Sensa 根点组件。

| 预设 | 保持输入关闭，尝试这个动作 | 默认量程下的预估效果 |
| --- | --- | --- |
| 距离（`_PointSeparation`） | 保持已识别的 Sender 接触，让参考点间距从 5 cm 变到 15 cm | L0 从约 250 增至 749（满量程 999）。测的是形状内部参考点间距，不是两个表面的间隙；`-1` 表示没有接触。 |
| 速度强度（`_SenderVelocityMagnitude`） | 以 0.5 m/s 的相对速度擦过，然后相对静止 | V0 约 50%，停住降到零。不分方向，所以仍在接触时，移开也可能有振动。 |
| 接近时振动（`_ProximitySpeed`） | 用 **Proximity** Receiver，让接近值在 0.1 秒内从 0.3 增至 0.4，再退回 | 增速 +1/秒时 V0 约 50%；保持或退回时为零。响应的是靠近的过程，不是保持贴近的程度。 |

三个预设的第二行都是 `_SenderType` → `GateEnable`。没有收到该值，或值为 0（没有 Sender 或归属未知）时，门控关闭；1～4 打开。它影响**整组 OSC 轴映射**，不仅是旁边那一行。建议一次试一个，不要直接追加到需要独立工作的其他映射上。选定一个 OSC 来源；原生参数没有 Sensa 的活动 `Sample`。核对预览后再保存，保存后输入仍然关闭。表中是指令目标，不是实测设备位置或振感。[Contact 字段、单位与限制](contact-sdk.md) · [交互参数图解](parameter-geometry.html#parameter-reference)

## Contact 直接定位：校准根点映射

先构建专用自身根点 Sender／Receiver，再选择 `contact-position` 或 `contact-speed`。两者使用 `Sensa/Contact/Root/*`，将 `Root` 替换为实际实例。位置初始按 Z 的 0–0.2 m 映射 Depth，速率初始按 0–1 m/s 映射 V0；请按实际动作校准示例量程。也可从根点面板生成映射。位置选择 **X／Y／Z／Distance**，运动强弱选择 **VelocityX／Y／Z／Speed／ProximitySpeed**，采集 0%／100% 端点、检查预览并保存。生成的 SensaPoint 映射使用 `Sensa/Contact/<id>/**`、选定来源和指标；位置默认对应 Depth，速度指标默认对应 V0。细微深浅趋势可选校准轴，需要确认触碰时可另配 Touch／Close 门控。[Contact 设置](contact-sdk.md)

## 应用与自定义

“替换”替换映射草稿，“追加”保留已有行，两者都保留计算信号。检查路径与角色后**保存更改**：计算与轴映射一起保存，包括在计算信号页签做的编辑。**恢复更改**将两组草稿一起恢复。保存会关闭输入，准备好再启用。需要检测自身目标时，将类别改为 Self，并保持配对参数属于同一对象。

可保存或移除自定义预设。实验根点使用面板的两端校准生成映射；QuickStart 阶梯和 Shader 诊断按实验中实际发布的路径手动配置。[映射操作](guide.md) · [参数字典](osc-parameters.md)

需要多输入融合或中间计算时，在**映射与变换 → 计算信号**创建[计算信号](computed-signals.md)并**保存更改**，再到**映射与变换 → 轴映射**或输出绑定中选用其结果。自定义预设保存 OSC 参数与定位映射；[整套方案](signal-pipeline.md#保存与复用整套方案)一起导出已保存的轴映射、轴配置、计算和输出，需要包含最新编辑时先保存更改。

## 常用变换

在**映射与变换 → 计算信号**展开**常用变换**，选择示例载入计算草稿。预设不会自动创建目标轴映射，也不会改变输入方式。

| 预设 | 默认行为 | 后续操作 |
| --- | --- | --- |
| 手动信号平滑 | 手动 L0 经 250 ms 平滑 | 将计算结果用于目标轴或输出绑定 |
| 手动与脚本混合 | 手动 L0 与脚本 L0 等权平均 | 在输入页准备并应用组合输入 |
| 阈值开关 | L0 ≥ 60% 开启，低于 40% 关闭 | 选择门控或强度目标 |
| 缓慢往复节奏 | 0～1 正弦波，每 4 秒一周期 | 检查范围与频率，再连接目标 |

可以继续修改来源和参数。每次载入创建独立计算草稿；点击**保存更改**后，输出绑定才能引用该保存结果。

## 设备轴配置

在**轴配置**页展开**设备动作预设**并选择模板，在打开的轴编辑器中检查并保存。保存配置不会自动绑定或启用输出。

| 预设 | 保留的轴或限制 |
| --- | --- |
| OSR 首次测试 · L0 小行程 | L0 映射到 TCode 400～600，速度上限 100；其他轴忽略 |
| SR6 / OSR6 六轴 | L0/L1/L2/R0/R1/R2 |
| OSR2 三轴 | L0/R1/R2 |
| 仅 L0 主轴 | 仅 L0，其余轴忽略 |
| 轻量振动 · 仅 V0 | 仅 V0，其余轴忽略 |
| L0 ＋ 姿态锁定 | L0 运动，位置／旋转及辅助轴锁定中位，V0/V1/V2 忽略 |

TCode 输出需选择保存的轴配置。Intiface 的设备特征与来源在**输出设置**单独配置，不会因选择 TCode 轴预设而自动改变。
