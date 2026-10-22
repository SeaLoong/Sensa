# 五个内置映射模板

**简体中文** | [English](presets.en.md)

模板提供常用参数路径和动作角色，帮助快速建立映射。先确认 Avatar 发布的参数，再选择模板，检查来源、方向、量程和接近条件，保存后启用输入。[方案选择](usage-scenarios.md)

| 模板 ID | 用途 | 默认输出 |
| --- | --- | --- |
| `ogb-depth` | SPS2 配对估算、SPS1 或 Plug 深浅趋势 | Depth → L0 |
| `ogb-touch` | Touch／Frot 或独立 VFH Touch Zone | V0 |
| `contact-position` | Contact 直接位置；按米校准所选轴 | SensaPoint Z → Depth／L0 |
| `contact-speed` | Contact 相对速率；按 m/s 校准强度 | SensaPoint Speed → V0 |
| `native-pb-stretch` | 原生 PB Stretch＋IsGrabbed | Depth＋GateEnable |

## OGB / SPS · 深度

默认读取 Others，路径别名为：

```text
OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers
```

OgbDepth 优先配对同来源、同实例、同 Self／Others 类别的 `PenOthersNewRoot` 与 `PenOthersNewTip`，对应图解中的 **SPS2 · PenOthersNewRoot / PenOthersNewTip**。先用未饱和样本估算 Plug 长度，再换算进入深浅的变化趋势；配对或估长未就绪时输出零。

SPS2 参数缺失或两值均为零时，使用同实例的 **SPS1 · PenOthers / PenOthersClose**：`PenOthers` 提供深浅趋势，已发布的 `PenOthersClose` 限定 Socket 的有效接近区域。Plug 的 `PenOthers` 直接使用原值，按实际方向配置反向。

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

“替换”移除当前映射，“追加”保留它们；两者都先修改草稿。检查实际路径和角色后保存，配置保存会关闭输入，再明确启用。需要检测自身目标时，将类别改为 Self，并保持配对参数属于同一对象。

可保存或移除自定义预设。实验根点使用面板的两端校准生成映射；QuickStart 阶梯和 Shader 诊断按实验中实际发布的路径手动配置。[映射操作](guide.md) · [参数字典](osc-parameters.md)
