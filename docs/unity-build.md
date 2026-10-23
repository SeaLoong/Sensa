# Unity 定位组件与构建流程

**简体中文** | [English](unity-build.en.md)

Sensa 的 Unity 脚本保存制作设置。构建 Avatar 时，NDMF 在构建副本上读取这些设置，生成 Contact、约束、FX 动画与菜单，再移除作者脚本。你可以继续编辑场景中的原 Avatar 和预制件；上传后的测量由生成的标准 Avatar 组件完成。

## 先选择测量方式

| 方式与预制件 | 适合读取什么 | 坐标与要求 |
| --- | --- | --- |
| SPS 四点定位：`SensaSpsRootProbe.prefab` | SPS Socket／Plug 根点的位置，也可明确选择骨骼或标记 | `AvatarRootLocal` 制作单位；四个 Receiver 和一个 Sender |
| Contact 直接定位（SDK Beta）：`SensaContactRootProbe.prefab` | 根点位置、相对速度及接近值变化率 | `AvatarRootMeters` 米制坐标；一个 Receiver 和一个 Sender；需要高级 Proximity 参数 |
| Shader 根点捕获：`SensaShaderCapture.prefab` | 将位置、X/Z 轴向和世界缩放编码为桌面图块后读取 | `AvatarRootLocal` 制作单位；PC Built-in、支持 geometry shader 的图形后端与桌面桥 |
| 跟随平面：`SensaTrackingFrame.prefab` | 随骨骼或根点移动、转动的参考平面，用于深度与侧向偏移 | 选择 SPS 四点或 Contact 直接定位，生成 Origin／Forward／Right 三点 |
| Point／Handle／Pose | 自定义参照下的点、可抓把手或配对姿态 | 使用各自的参照、协议及采样时效 |

三个根点预制件的 `Target` 都可明确指定自己 Avatar 内的骨骼／空物体 `Transform`、SPS Socket／Plug、Sensa Component 或原生 Contact。骨骼与普通标记可以直接作为目标；选择原生 Contact 时读取其形状中心，选择 SPS 时读取其作者根点几何。[定位和单位](positioning.md) · [Contact SDK 报告](contact-sdk.md)

多个现成 SPS 目标可使用 **Automatic SPS Setup**，统一选择 SPS 四点定位或 Contact 直接定位。只测根点时只读取位置和旋转；开启尖端、配对 Plug 标记或抓取把手时才需要 Plug 长度。Shader 捕获通过独立作者预制件配置自己的 Producer ID 与桌面区域。

## 放置并配置预制件

1. 安装 Unity 组件包的 VPM 依赖：NDMF **1.5.0+**、Modular Avatar **1.10.0+** 及配套 VRChat Avatars SDK。使用 SPS 作者目标时另装官方 VRCFury。Contact 直接定位已适配 **3.10.6-beta.3** 的 `advancedParameters`，同时兼容 Beta.2 的 `advancedProximityParameters`。
2. 从 **GameObject → Sensa** 创建所选方式，或把对应预制件放到 Avatar 层级内。检查 `Target` 指向希望测量的根点。
3. SPS 四点定位和 Contact 预制件默认实例名为 `Root`。测量多个点时使用不同的实例名，例如 `Root`、`Chest`、`Hand`。`Collision Channel` 留空时按实例名稳定分配；仅在需要手动管理通道时填写覆盖值。复制后改实例名即可得到独立的自动通道。
4. Shader 捕获使用唯一的 `Producer Id`（1–65535），并在桌面桥固定同一 ID。按[Shader 设置](../unity/top.sealoong.sensa/GPU-TRACKING.md)配置呈现区域和捕获注册。
5. 正常执行 Avatar 构建或使用 NDMF 的处理后预览。在生成层级中检查测量组件，再按桌面指南检查参数、校准和输入启用。

作者宿主保持普通 GameObject。它的 Transform 可以作为测量参照，生成的 Contact、约束和动画也需要留在构建结果里。

## 创建随骨骼移动的参考平面

1. 在 Avatar 内选中要跟随的骨骼或 SPS 对象，通过 **GameObject → Sensa → Tracking Frame** 创建；也可放入 `SensaTrackingFrame.prefab`。
2. 检查**参考坐标系（`reference`）**。这里统一接受 Transform、SPS Socket／Plug、Sensa Component 或原生 Contact。菜单会尝试填入选中的目标；在 Avatar 根创建时，手动指定参照。
3. 设置唯一**实例名称（`instanceName`）**，默认 `Frame`，最多 40 个 ASCII 字母、数字、下划线或连字符。选择**定位方式（`trackingMethod`）**：SPS 四点定位或 Contact 直接定位。
4. 用**原点偏移（`positionOffset`）**放置平面中心，用**坐标轴旋转（度）（`rotationOffset`）**调整朝向。两项基于已解析根点的局部轴；位置偏移在附加旋转前应用。Inspector 的六个轴向按钮可快速指定深度方向，Scene 的移动／旋转手柄用于细调。
5. 检查 Scene 中的 XY 平面与 +Z 箭头：**+Z 是深度正方向，+X 向右，+Y 向上**。**坐标轴标记间距（`axisLength`）**是 Origin 到 Forward／Right 标记的距离，按 Avatar 根制作单位计算，默认 0.2，可设 0.05～0.5。
6. 为同一 Avatar 内的测量目标 P 添加所选方式的根点预制件：`SensaSpsRootProbe.prefab` 或 `SensaContactRootProbe.prefab`。指定目标并使用独立实例名，例如 `Target`；已有同坐标框的测量实例可直接复用。
7. 构建后，在桌面确认目标、Origin 和 Forward 都提供有效坐标。在“流程 → 空间计算预设 → 跟随移动平面”选择目标与平面 Origin，检查生成草稿，再保存并连接输出。

生成的三点分别命名为 `<名称>_Origin`、`<名称>_Forward`、`<名称>_Right`。源参照随骨骼移动和转动，实际测量框架放在 Avatar 根下，通过 ParentConstraint 跟随平移、旋转。三点间距继承 Avatar 缩放，保持各向一致；骨骼自身缩放可改变偏移后原点的位置，轴长保持 Avatar 根制作尺寸。SPS 作者几何继续遵循其均匀缩放要求。

| 测量方式 | 生成数量 | 桌面坐标 |
| --- | --- | --- |
| SPS 四点定位 | 15 个 Contact，3 组各 5 个字段 | `Sensa/SPS/<名称>_<标记>/…`，AvatarRootLocal |
| Contact 直接定位 | 6 个 Contact，3 组各 12 个字段 | `Sensa/Contact/<名称>_<标记>/…`，AvatarRootMeters |

Scene 同时显示所选定位方式的覆盖范围。参与当前计算的点都要位于有效区域：默认模板使用目标 P、Origin 与 Forward；需要另一条方向时使用 Right。各标记分别沿用原协议的 Sample 检查。较短轴间距会放大方向读数的噪声，默认 0.2 的实际误差和快速运动下的效果可在客户端用已知姿态核对。测量目标与平面标记选择同一种坐标框；独立 Point／Pose 使用自己的 ReferenceLocal 参照，适合直接在该参照下测量。[深度、偏移与角度计算](computed-signals.md#组合根点坐标)

## 作者脚本怎样进入构建

Sensa 作者组件均实现 `VRC.SDKBase.IEditorOnly`：`SensaComponent`、`SensaAutoSetup`、`SensaFixedRootProbe`、`SensaContactRootProbe`、`SensaShaderCapture`、`SensaTrackingFrame`、`SensaPointProbe`、`SensaPoseSocket`、`SensaPosePlug` 和内部实验用 `SensaQuickStart`。

| 设置 | 构建中的作用 |
| --- | --- |
| 脚本实现 `IEditorOnly` | 向 VRChat SDK 标明这是作者工具脚本；Sensa 在生成完成后移除该组件 |
| GameObject 标记为 `EditorOnly` | 把该对象及其子层级作为编辑辅助内容移除；仅用于独立的纯编辑预览 |
| 作者组件取消勾选 `Enabled` | 移除该作者脚本，跳过其生成 |
| 作者位于未激活的对象中 | 正常读取已启用的配置；运行时开关遵循各生成物及其菜单规则 |

内部 QuickStart 保留作合成实验室入口。日常定位使用根点或跟随平面预制件，也可选 Point／Pose。

`IEditorOnly` 负责标识作者脚本，生成时机由 NDMF 插件安排。保留宿主对象、只移除作者组件，能让运行时的骨骼、参照点和生成物继续工作。

## 构建顺序

Sensa 使用一个 NDMF 生成入口。包依赖中已包含 NDMF 与 Modular Avatar；SDK 回调负责检查生成是否完成。

| 检查点 | Sensa 与上游的工作 |
| --- | --- |
| NDMF 前段，SDK 顺序 `-11000` | 执行 Resolving、Generating、Transforming。Sensa 在 **Generating → BeforePlugin("nadena.dev.modular-avatar")** 统一读取作者设置并创建 MA 输入 |
| MA 的 Transforming | 合并临时 Animator、参数和菜单，处理路径／参数名并清理自己的作者组件 |
| VRCFury，SDK 顺序 `-10000` | 加工自己的 SPS 作者配置；Sensa 此前已读取所需根点几何 |
| Sensa 只读检查，SDK 顺序 `-1026` | 检查 Sensa 作者脚本已经被消费。若 NDMF 构建处理关闭，或其他工具较晚插入作者组件，会报告构建错误并列出残留类型 |
| NDMF Optimizing，SDK 顺序 `-1025` | Sensa 在 MA 的同阶段处理之后检查作者清理和此时的 Contact 数量 |
| SDK 默认清理，顺序 `-1024` | 清理 EditorOnly 对象和 IEditorOnly 脚本；生成的标准组件继续进入 SDK 构建 |

跟随平面也在同一 Generating 入口生成：读取独立根点作者后、自动 SPS 配置前创建三点，随后在基础 SensaComponent 清理前移除 Tracking Frame 作者。生成物继续由既有 SPS／Contact 协议处理。

每次构建通过 `BuildContext.GetState` 记录已生成状态。SPS 四点定位、Contact、Shader 与其他作者共用这一调度，运行时协议各自保持独立。SDK 的 `-1026` 检查只诊断残留设置，实际生成始终在前段 NDMF 执行。

表中的顺序也已在 SDK **3.10.6-beta.3**、NDMF **1.14.8**、Modular Avatar **1.18.7** 和 VRCFury **1.1434.0** 安装包中核对。VRCFury 当前还会把 SDK 的组件清理延后至 `int.MaxValue`；Sensa 自行完成作者清理，因此也适用 SDK 的默认顺序。其他工具可注册更晚的 SDK 回调，Contact 数量检查描述的是 Sensa 所在的 NDMF 检查点。

## 资产与引用怎样处理

生成器在构建副本上工作。目标、骨骼、PhysBone 和 Raycast 参照须属于当前 Avatar；基础组件先检查引用，再创建原生组件，便于在配置错误时定位问题。

Sensa 创建供 MA 合并的临时 Animator／菜单／参数，交给 NDMF 保存构建资产。原生根点 Shader 随包提供，位于 `Runtime/Shaders/SensaRootTelemetry.shader`；构建直接引用该资产。更新组件包后重新构建即可采用当前编码器。

SPS 四点定位和 Contact 的根缩放检查按约束的实际目标与 MA Merge Animator 的 `relativePathRoot` 判断。Avatar 根保持固定尺度，子对象可按自身需要缩放。Shader 采样另外校验原始轴向、量化后的轴向和世界均匀缩放，帮助在构建时发现会产生无效编码的设置。

三种根点方案都会先检查原生 Contact 的根点偏移和旋转：偏移须为有限数值，旋转须为有限且非零的四元数，并在读取时归一化，原始 Contact 配置保持可编辑。Shader 同时检查父级与 Avatar 共同形成的最终世界基，避免层层累积的小幅非均匀缩放生成持续无效的编码。Sensa Pose Socket 会在生成任何接收器前检查已有参数声明，重复的参数名会给出构建提示；实例名与配对通道仅使用规定的 ASCII 字符。

基础 `SensaComponent` 的原生 Contact 持续跟随配置的轴／骨骼，相关参数在 FX 中保持可写。Socket 量程与 Contact 尺寸使用所选轴的局部单位，轴缩放为 1 时数值等于米；SPS 四点定位和 Contact 直接定位仍分别采用上表的坐标契约。补充 Contact 信号配置与 Sender 相同的碰撞标签；已有参数信号只引用原参数，保留它原来的类型。

## 官方资料与核验范围

本次于 **2026-10-23（北京时间）**核对以下官方资料与源代码：

| 来源 | 用于核对的规则 |
| --- | --- |
| [VRChat SDK 接口文档](https://github.com/vrchat-community/creator-docs/blob/f437f5081c4476aaf443b507a7ec4a9d21e0e63b/Docs/docs/sdk/build-pipeline-callbacks-and-interfaces.md#ieditoronly) | `IEditorOnly` 的含义与 SDK 验证 |
| [官方 Base 3.10.6-beta.3 安装包](https://github.com/vrchat/packages/releases/download/3.10.6-beta.3/com.vrchat.base-3.10.6-beta.3.zip) | 本次复核 `RemoveAvatarEditorOnly` 的默认顺序 `-1024`；Contact 接口与包摘要见[Contact 说明](contact-sdk.md) |
| [官方 Base 3.10.6-beta.2 安装包](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.base-3.10.6-beta.2.zip) | `VRCSDKBase-Editor.dll` 中 `RemoveAvatarEditorOnly` 的顺序与组件／对象清理；通过程序集核验 |
| [NDMF 1.5.0 SDK 构建 Hook](https://github.com/bdunderscore/ndmf/blob/eb332294b65fe06dfdd38fbe33d5d8bda68eb267/Editor/VRChat/BuildFrameworkPreprocessHook.cs#L24) | 最低支持版本中的 `-11000`／`-1025` 两段执行 |
| [MA 1.10.0 扩展指南](https://github.com/bdunderscore/modular-avatar/blob/a71af7ae0a7caa904cf67f04a70754ae2939a8bb/docs~/docs/extending.md#L5) · [插件定义](https://github.com/bdunderscore/modular-avatar/blob/a71af7ae0a7caa904cf67f04a70754ae2939a8bb/Editor/PluginDefinition/PluginDefinition.cs#L23) | Generating 中先于 MA 生成、Transforming 中合并 |
| [NDMF 执行模型](https://github.com/bdunderscore/ndmf/blob/a03cb9374e3ff5c788c65bed7fa45016b0784c36/docfx~/execution-model.md) · [最佳实践](https://github.com/bdunderscore/ndmf/blob/a03cb9374e3ff5c788c65bed7fa45016b0784c36/docfx~/best-practices.md#L11) | 同阶段排序、每次构建状态、作者清理与资产保存 |
| [VRCFury 开发指南](https://github.com/VRCFury/vrcfury.com/blob/3d507b6dc5c118e3c88d067fa4efd06f9a3ead1c/docs/50-tutorials/zz-api.mdx) · [构建 Hook](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Hooks/VrcPreuploadHook.cs#L7) | Fury `-10000`、临时资产与合并的职责 |

这些资料用于确定实现与排序。Unity EditMode 契约已编写，本次尚未在 Unity Editor 执行；各项实际结果见[验证记录](e2e-status.md)。Avatar 上传、客户端 OSC、渲染与设备联动分别验收。

[Unity 包](../unity/top.sealoong.sensa/README.zh-CN.md) · [自动配置](../unity/top.sealoong.sensa/AUTOMATION.md) · [依赖与测量范围](../unity/top.sealoong.sensa/COMPATIBILITY.md)
