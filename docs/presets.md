# 场景预设：映射、变换与轴配置

**简体中文** | [English](presets.en.md)

**场景预设**提供 **VRChat / OSC 映射**、**常用变换**和**设备轴配置**三类卡片。载入只准备草稿；检查、保存和启用输入分别执行。

## 六个内置映射模板

映射预设填入常用路径和动作角色，帮助快速建立映射。选择 Avatar 已有功能与实时来源，采集输入起止值并保存。每行都可继续调整为自己的路径、方向、范围与条件。

| 模板 ID | 用途 | 默认输出 |
| --- | --- | --- |
| `ogb-depth` | SPS2/SPS3 配对估算、SPS1 或 Plug 深浅趋势 | Depth → L0 |
| `ogb-depth-touch` | 同时准备 SPS 深度与触碰强度两条映射 | Depth → L0 ＋ V0 |
| `ogb-touch` | Touch／Frot 或独立 VFH Touch Zone | V0 |
| `contact-position` | Contact 直接位置；按米校准所选轴 | SensaPoint Z → Depth／L0 |
| `contact-speed` | Contact 相对速率；按 m/s 校准强度 | SensaPoint Speed → V0 |
| `native-pb-stretch` | 原生 PB Stretch＋IsGrabbed | Depth＋GateEnable |

## OGB / SPS · 深度

默认读取 Others，路径别名为：

```text
OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers
```

OgbDepth 优先配对同来源、同实例、同 Self／Others 类别的 `PenOthersNewRoot` 与 `PenOthersNewTip`，对应图解中的 **SPS2/SPS3 · PenOthersNewRoot / PenOthersNewTip**。先用未饱和样本估算 Plug 长度，再换算进入深浅的变化趋势；配对或估长未就绪时输出零。

SPS2/SPS3 参数缺失或两值均为零时，使用同实例的 **SPS1 · PenOthers / PenOthersClose**：`PenOthers` 提供深浅趋势，已发布的 `PenOthersClose` 限定 Socket 的有效接近区域。Plug 的 `PenOthers` 直接使用原值，按实际方向配置反向。

`PenOthersNewTip` 观测根部长度球，与 `PenOthersNewRoot` 一起反映 Plug 靠近 Socket 的程度。先将对象分开，再沿期望方向靠近，让 Sensa 取得估长样本；随后检查并校准期望的两端。更换 Avatar、修改映射或重新启用输入后会重新学习。[几何和限制](ogb-compatibility.md)

## OGB / SPS · 振动

```text
OGB/Orf/**/TouchOthers;OGB/Orf/**/FrotOthers;OGB/Pen/**/TouchOthers;OGB/Pen/**/FrotOthers;VFH/Zone/Touch/**/Others
```

OgbTouch 将 `TouchOthers` 与同实例的 `TouchOthersClose` 配对，目标进入触碰区域后采用 Touch 强度。Plug 的 `FrotOthers` 同样结合 `FrotOthersClose`，适合贴近或擦过时的联动；Socket Frot 和独立 VFH Zone 直接读取相应强度。Intiface 振动来源默认 V0，也可按需要选择 L0 等其他轴。

## 原生 PB · 拉伸

模板使用 `MyPB_Stretch` 和 `MyPB_IsGrabbed`。把 MyPB 换成实际 PhysBone 参数前缀；抓取时 GateEnable 开放，松手时关闭，拉伸程度转换为动作目标。

## Contact 直接定位：校准根点映射

先使用受支持的 Beta SDK 构建专用自身根点 Sender／Receiver，再选择 `contact-position` 或 `contact-speed`。两者使用 `Sensa/Contact/Root/*`，将 `Root` 替换为实际实例。位置初始按 Z 的 0–0.2 m 映射 Depth，速率初始按 0–1 m/s 映射 V0；请按实际动作校准示例量程。也可从根点面板生成映射。位置选择 **X／Y／Z／Distance**，运动强弱选择 **VelocityX／Y／Z／Speed／ProximitySpeed**，采集 0%／100% 端点、检查预览并保存。生成的 SensaPoint 映射使用 `Sensa/Contact/<id>/**`、选定来源和指标；位置默认对应 Depth，速度指标默认对应 V0。细微深浅趋势可选校准轴，需要确认触碰时可另配 Touch／Close 门控。[Contact 设置](contact-sdk.md)

## 应用与自定义

“替换”替换映射草稿，“追加”保留已有行，两者都保留计算信号。检查路径与角色后**保存更改**：计算与轴映射一起保存，包括在计算信号页签做的编辑。**恢复更改**将两组草稿一起恢复。保存会关闭输入，准备好再启用。需要检测自身目标时，将类别改为 Self，并保持配对参数属于同一对象。

可保存或移除自定义预设。实验根点使用面板的两端校准生成映射；QuickStart 阶梯和 Shader 诊断按实验中实际发布的路径手动配置。[映射操作](guide.md) · [参数字典](osc-parameters.md)

需要多输入融合或中间计算时，在**映射与变换 → 计算信号**创建[计算信号](computed-signals.md)并**保存更改**，再到**映射与变换 → 轴映射**或输出绑定中选用其结果。自定义预设保存 OSC 参数与定位映射；[整套方案](signal-pipeline.md#保存与复用整套方案)一起导出已保存的轴映射、轴配置、计算和输出，需要包含最新编辑时先保存更改。

## 常用变换

在**场景预设 → 常用变换**载入计算草稿，或在**映射与变换 → 计算信号**展开常用变换。预设不会自动创建目标轴映射，也不会改变输入方式。

| 预设 | 默认行为 | 后续操作 |
| --- | --- | --- |
| 手动信号平滑 | 手动 L0 经 250 ms 平滑 | 将计算结果用于目标轴或输出绑定 |
| 手动与脚本混合 | 手动 L0 与脚本 L0 等权平均 | 在输入页准备并应用组合输入 |
| 阈值开关 | L0 ≥ 60% 开启，低于 40% 关闭 | 选择门控或强度目标 |
| 缓慢往复节奏 | 0～1 正弦波，每 4 秒一周期 | 检查范围与频率，再连接目标 |

可以继续修改来源和参数。每次载入创建独立计算草稿；点击**保存更改**后，输出绑定才能引用该保存结果。

## 设备轴配置

在**轴配置**页或**场景预设 → 设备轴配置**选择卡片，**查看并创建轴配置**后检查并保存。保存配置不会自动绑定或启用输出。

| 预设 | 保留的轴或限制 |
| --- | --- |
| OSR 首次测试 · L0 小行程 | L0 映射到 TCode 400～600，速度上限 100；其他轴忽略 |
| SR6 / OSR6 六轴 | L0/L1/L2/R0/R1/R2 |
| OSR2 三轴 | L0/R1/R2 |
| 仅 L0 主轴 | 仅 L0，其余轴忽略 |
| 轻量振动 · 仅 V0 | 仅 V0，其余轴忽略 |
| L0 ＋ 姿态锁定 | L0 运动，位置／旋转及辅助轴锁定中位，V0/V1/V2 忽略 |

TCode 输出需选择保存的轴配置。Intiface 的设备特征与来源在**输出设置**单独配置，不会因选择 TCode 轴预设而自动改变。
