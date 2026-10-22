# Unity 定位组件与构建流程

**简体中文** | [English](unity-build.en.md)

Sensa 的 Unity 脚本保存制作设置。构建 Avatar 时，NDMF 在构建副本上读取这些设置，生成 Contact、约束、FX 动画与菜单，再移除作者脚本。你可以继续编辑场景中的原 Avatar 和预制件；上传后的测量由生成的标准 Avatar 组件完成。

## 先选择测量方式

| 方式与预制件 | 适合读取什么 | 坐标与要求 |
| --- | --- | --- |
| SPS 四点定位：`SensaSpsRootProbe.prefab` | SPS Socket／Plug 根点的位置，也可明确选择骨骼或标记 | `AvatarRootLocal` 制作单位；四个 Receiver 和一个 Sender |
| Contact 直接定位（SDK Beta）：`SensaContactRootProbe.prefab` | 根点位置、相对速度及接近值变化率 | `AvatarRootMeters` 米制坐标；一个 Receiver 和一个 Sender；需要高级 Proximity 参数 |
| Shader 根点捕获：`SensaShaderCapture.prefab` | 将根点坐标编码为桌面图块后读取 | `AvatarRootLocal` 制作单位；PC Built-in、支持 geometry shader 的图形后端与桌面桥 |
| Point／Handle／Pose | 自定义参照下的点、可抓把手或配对姿态 | 使用各自的参照、协议及采样时效 |

三个根点预制件的 `Target` 都可明确指定自己 Avatar 内的骨骼／空物体 `Transform`、SPS Socket／Plug、Sensa Component 或原生 Contact。骨骼与普通标记可以直接作为目标；选择原生 Contact 时读取其形状中心，选择 SPS 时读取其作者根点几何。[定位和单位](positioning.md) · [Contact SDK 报告](contact-sdk.md)

多个现成 SPS 目标可使用 **Automatic SPS Setup**，统一选择 SPS 四点定位或 Contact 直接定位。只测根点时只读取位置和旋转；开启尖端、配对 Plug 标记或抓取把手时才需要 Plug 长度。Shader 捕获通过独立作者预制件配置自己的 Producer ID 与桌面区域。

## 放置并配置预制件

1. 安装 Unity 组件包的 VPM 依赖：NDMF **1.5.0+**、Modular Avatar **1.10.0+** 及配套 VRChat Avatars SDK。使用 SPS 作者目标时另装官方 VRCFury。Contact 直接定位需提供 `advancedProximityParameters` 的 SDK，已核对 **3.10.6-beta.2**。
2. 从 **GameObject → Sensa** 创建所选方式，或把对应预制件放到 Avatar 层级内。检查 `Target` 指向希望测量的根点。
3. SPS 四点定位和 Contact 预制件默认实例名为 `Root`。测量多个点时使用不同的实例名，例如 `Root`、`Chest`、`Hand`。`Collision Channel` 留空时按实例名稳定分配；仅在需要手动管理通道时填写覆盖值。复制后改实例名即可得到独立的自动通道。
4. Shader 捕获使用唯一的 `Producer Id`（1–65535），并在桌面桥固定同一 ID。按[Shader 设置](../unity/top.sealoong.sensa/GPU-TRACKING.md)配置呈现区域和捕获注册。
5. 正常执行 Avatar 构建或使用 NDMF 的处理后预览。在生成层级中检查测量组件，再按桌面指南检查参数、校准和输入启用。

作者宿主保持普通 GameObject。它的 Transform 可以作为测量参照，生成的 Contact、约束和动画也需要留在构建结果里。

## 作者脚本怎样进入构建

所有九类 Sensa 作者组件均实现 `VRC.SDKBase.IEditorOnly`：`SensaComponent`、`SensaAutoSetup`、`SensaFixedRootProbe`、`SensaContactRootProbe`、`SensaShaderCapture`、`SensaPointProbe`、`SensaPoseSocket`、`SensaPosePlug` 和内部实验用 `SensaQuickStart`。

| 设置 | 构建中的作用 |
| --- | --- |
| 脚本实现 `IEditorOnly` | 向 VRChat SDK 标明这是作者工具脚本；Sensa 在生成完成后移除该组件 |
| GameObject 标记为 `EditorOnly` | 把该对象及其子层级作为编辑辅助内容移除；仅用于独立的纯编辑预览 |
| 作者组件取消勾选 `Enabled` | 移除该作者脚本，跳过其生成 |
| 作者位于未激活的对象中 | 正常读取已启用的配置；运行时开关遵循各生成物及其菜单规则 |

内部 QuickStart 保留作合成实验室入口。日常定位使用上面的三种根点预制件或 Point／Pose。

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

每次构建通过 `BuildContext.GetState` 记录已生成状态。SPS 四点定位、Contact、Shader 与其他作者共用这一调度，运行时协议各自保持独立。SDK 的 `-1026` 检查只诊断残留设置，实际生成始终在前段 NDMF 执行。

表中的数字对应下列已核验版本。VRCFury 当前还会延后 SDK 的组件清理；Sensa 自行完成作者清理，因此也适用 SDK 的默认顺序。其他工具可注册更晚的 SDK 回调，Contact 数量检查描述的是 Sensa 所在的 NDMF 检查点。

## 资产与引用怎样处理

生成器在构建副本上工作。目标、骨骼、PhysBone 和 Raycast 参照须属于当前 Avatar；基础组件先检查引用，再创建原生组件，便于在配置错误时定位问题。

Sensa 创建供 MA 合并的临时 Animator／菜单／参数，交给 NDMF 保存构建资产。原生根点 Shader 随包提供，位于 `Runtime/Shaders/SensaRootTelemetry.shader`；构建直接引用该资产。更新组件包后重新构建即可采用当前编码器。

基础 `SensaComponent` 的原生 Contact 持续跟随配置的轴／骨骼，相关参数在 FX 中保持可写。Socket 量程与 Contact 尺寸使用所选轴的局部单位，轴缩放为 1 时数值等于米；SPS 四点定位和 Contact 直接定位仍分别采用上表的坐标契约。补充 Contact 信号配置与 Sender 相同的碰撞标签；已有参数信号只引用原参数，保留它原来的类型。

## 官方资料与核验范围

本次于 **2026-10-23（北京时间）**核对以下官方资料与源代码：

| 来源 | 用于核对的规则 |
| --- | --- |
| [VRChat SDK 接口文档](https://github.com/vrchat-community/creator-docs/blob/f437f5081c4476aaf443b507a7ec4a9d21e0e63b/Docs/docs/sdk/build-pipeline-callbacks-and-interfaces.md#ieditoronly) | `IEditorOnly` 的含义与 SDK 验证 |
| [官方 Base 3.10.6-beta.2 安装包](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.base-3.10.6-beta.2.zip) | `VRCSDKBase-Editor.dll` 中 `RemoveAvatarEditorOnly` 的顺序与组件／对象清理；通过程序集核验 |
| [NDMF 1.5.0 SDK 构建 Hook](https://github.com/bdunderscore/ndmf/blob/eb332294b65fe06dfdd38fbe33d5d8bda68eb267/Editor/VRChat/BuildFrameworkPreprocessHook.cs#L24) | 最低支持版本中的 `-11000`／`-1025` 两段执行 |
| [MA 1.10.0 扩展指南](https://github.com/bdunderscore/modular-avatar/blob/a71af7ae0a7caa904cf67f04a70754ae2939a8bb/docs~/docs/extending.md#L5) · [插件定义](https://github.com/bdunderscore/modular-avatar/blob/a71af7ae0a7caa904cf67f04a70754ae2939a8bb/Editor/PluginDefinition/PluginDefinition.cs#L23) | Generating 中先于 MA 生成、Transforming 中合并 |
| [NDMF 执行模型](https://github.com/bdunderscore/ndmf/blob/a03cb9374e3ff5c788c65bed7fa45016b0784c36/docfx~/execution-model.md) · [最佳实践](https://github.com/bdunderscore/ndmf/blob/a03cb9374e3ff5c788c65bed7fa45016b0784c36/docfx~/best-practices.md#L11) | 同阶段排序、每次构建状态、作者清理与资产保存 |
| [VRCFury 开发指南](https://github.com/VRCFury/vrcfury.com/blob/3d507b6dc5c118e3c88d067fa4efd06f9a3ead1c/docs/50-tutorials/zz-api.mdx) · [构建 Hook](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Hooks/VrcPreuploadHook.cs#L7) | Fury `-10000`、临时资产与合并的职责 |

这些资料用于确定实现与排序。Unity EditMode 契约已编写，本次尚未在 Unity Editor 执行；各项实际结果见[验证记录](e2e-status.md)。Avatar 上传、客户端 OSC、渲染与设备联动分别验收。

[Unity 包](../unity/top.sealoong.sensa/README.zh-CN.md) · [自动配置](../unity/top.sealoong.sensa/AUTOMATION.md) · [依赖与测量范围](../unity/top.sealoong.sensa/COMPATIBILITY.md)
