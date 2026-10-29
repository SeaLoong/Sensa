# Contact 直接定位（SDK Beta）

**简体中文** | [English](contact-sdk.en.md)

Contact 直接定位测量所选 Avatar 根点的米制位置，以及接触点相对速度（m/s）。添加专用球形 Sender／Receiver，查看高级 Proximity 字段，再校准所选读数。以下设置使用 **VRChat Avatars SDK 3.10.6-beta.3**，也支持 Beta.2 的高级接口。

已核对官方 [3.10.6-beta.3](https://github.com/vrchat/packages/releases/tag/3.10.6-beta.3) 的 Editor 源码和运行时程序集，并保留 [3.10.6-beta.2](https://github.com/vrchat/packages/releases/tag/3.10.6-beta.2) 的协议依据。以下说明区分 SDK 接口、Sensa 发布字段与客户端接入；各项实际运行结果见[验证记录](e2e-status.md)。

## 构建专用根点测量

1. 通过 VRChat 项目工具安装配套的 Base 和 Avatars Beta 包，再安装 Sensa Unity 组件包。
2. 在 **Automatic SPS Setup** 的根点定位方式中明确选择 **Contact 直接定位（SDK Beta）**，或直接添加 **Contact direct tracking (SDK Beta)**（`SensaContactRootProbe`）。
3. 在 Target 选择自己 Avatar 内的骨骼／空物体 Transform、SPS Socket／Plug、Sensa Component 或原生 Contact。实例默认 `Root`，多个点使用不同实例名；碰撞通道留空时按实例名稳定分配。Transform、Sensa 和原生 Contact 目标可直接使用。
4. 构建 Avatar。统一 NDMF 插件先于 MA 读取作者配置，生成跟随所选根点的微小球形 Sender，并在 Avatar 原点生成 Proximity Receiver；接收形状偏移为零，各轴与 Avatar 对齐，只接受专用通道上的 Self。
5. 在实际客户端中按需通过生成菜单选择目标。在单一 OSC 来源下检查 `Sensa/Contact/<id>/…`，先在根点面板校准，再启用空间输入。

作者脚本实现 `IEditorOnly`，生成后移除，宿主与原生测量组件保留。构建时机、预制件选择和官方流程依据见[Unity 构建指南](unity-build.md)。

Receiver 的制作半径为 2 个 Avatar 根局部单位，标记半径为 0.001。公开的 `Radius` 是当前**世界米制半径**，随 `ScaleFactor` 更新。缩放门控会在 Receiver 超过 SDK 的 3 m 半径上限前停用测量并清零 `Sample`。支持的 Avatar 根缩放为正数且均匀。

## 按正确坐标框读取位置与速度

Sensa 根据已安装的 SDK 启用对应的 Bool 开关：**Beta.3 使用 `advancedParameters`，Beta.2 使用 `advancedProximityParameters`**。Beta.3 的开关默认关闭，标记为 `NotKeyable`；Sensa 在构建时将其开启。Beta.3 的高级报告可用于任意 Receiver 类型；Sensa 的测量组件采用 Proximity Receiver，其中 `_ProximitySpeed` 描述接近值变化率。基参数名为 `Proximity` 时，两版都提供 `Proximity_SenderType`、`Proximity_SenderLocalPositionX/Y/Z`、`Proximity_SenderVelocityX/Y/Z`、`Proximity_SenderVelocityMagnitude` 和 `Proximity_ProximitySpeed`。

[VRChat 官方 Contacts 说明](https://creators.vrchat.com/common-components/contacts/)介绍了 Receiver 的检测模式：Constant 报告匹配目标是否进入检测区，Proximity 则报告 0–1 的连续接近值。本页高级位置／速度字段按下文列出的官方安装包测量实现解释；Sensa 另外提供 `Radius` 与 `Sample`，用于覆盖范围和活动检查。图解的[“OSC 参数含义与来源”](parameter-geometry.html#parameter-reference)和工作台参数详情均可逐项阅读测量定义、联动用法与来源。

| 要了解什么 | 对应参数 | 读数怎样理解 |
| --- | --- | --- |
| 目标在哪里 | `Proximity_SenderLocalPositionX/Y/Z` | 相对接收器原点的左右、上下、前后位移，单位米；可沿选定轴校准动作范围 |
| 动作有多快、往哪边动 | `Proximity_SenderVelocityX/Y/Z`、`Proximity_SenderVelocityMagnitude` | 近似接触点处的相对速度，单位 m/s；分量保留方向，模长便于控制运动强弱 |
| 接近程度怎样变化 | `Proximity`、`Proximity_ProximitySpeed` | 接近值为 0–1，变化率为接近值／秒；便于观察进入接收范围后的靠近与退出 |

Sensa Contact 定位协议使用十二个公开字段，现有坐标、速度和预设可以直接沿用。[OSC 参数字典](osc-parameters.md)列出了接入范围；Beta.3 的额外原生报告见下文。

SDK 还会按碰撞标签写入 `_CollisionTag_<tag>` Bool。组件为自己的专用标签在 FX 中声明这个状态，并在停用时清零；十二项公开 OSC 字段见[参数字典](osc-parameters.md)。

位置描述**发送形状中点相对接收形状中点的位移**，再旋转到接收形状的坐标轴。运行时使用接收形状旋转的逆变换，保留物理米单位，未除以 Transform 缩放或 Receiver 半径。球形的中点就是球心，胶囊使用其形状中点。因此，Sensa 的专用零偏移 Receiver 建立 **AvatarRootMeters**：原点在 Avatar 根，各轴跟随根旋转，单位为物理米。SPS 四点定位和 Shader 捕获继续使用 **AvatarRootLocal**，其单位按制作时的 Avatar 根尺度解释。

```text
position = inverse(receiverShapeRotation)
           × (senderShapeMidpoint - receiverShapeMidpoint)
```

速度是 Sender 相对 Receiver 在近似接触点处的速度，包含角运动项，再旋转到 Receiver 坐标轴，单位为 **m/s**。形状旋转时，这个量可能与所报告中点坐标的时间导数不同。`Proximity_SenderVelocityMagnitude` 为其非负模长。`Proximity_ProximitySpeed` 是 Proximity 的带符号变化率，单位为**接近值／秒**；退出时，Proximity 归零可能带来短暂读数。

负的位置分量是正常坐标。Sender 静止时，速度为零仍可保持有效位置。单个专用点提供位置和速度；需要跟随骨骼的参考方向时，使用 Tracking Frame 同时测量 Origin、Forward、Right 三个标记。

### SDK Beta.3 的额外报告

[官方 3.10.6 发布说明](https://vrc-beta-docs.netlify.app/releases/release-3-10-6)解释了高级报告的扩展。启用 Advanced Parameters 后，SDK 可按 Receiver 的基参数名追加以下后缀：

| 后缀 | 含义与单位 | 怎样理解 |
| --- | --- | --- |
| `_PointSeparation` | Sender 与 Receiver **最近内部点**之间的世界空间距离，单位米 | 衡量两个 Contact 形状的最近靠近程度；Sensa 根点 `Distance` 则根据 XYZ 计算距 Avatar 原点的距离，两者各有参照 |
| `_SenderLossyScaleX/Y/Z` | Sender 所关联 Transform 的 `lossyScale` 三分量，无单位 | 读取该 Transform 包含父级影响的世界缩放，可用于观察信号形状随缩放的变化 |

“最近内部点”沿用 SDK 的形状定义，由 Sender 和 Receiver 的几何决定。选择位置联动时用 XYZ 或 Sensa `Distance`；使用原生 `_PointSeparation` 时，按实际 Contact 形状校准距离。

Beta.3 运行时程序集还显示：没有选中 Sender 时，缩放报告为 `(1,1,1)`、PointSeparation 为 `-1`；存在 Sender 时，≤0.001 m 的 PointSeparation 写为 0。读取额外报告时可先检查 `_SenderType`，再按这些状态解释数值。如需自行使用这些可选报告，请在 Animator 中声明对应的 Float 参数，并配置其 OSC 可见性。Sensa 生成既有的十二个公开字段，定位预设使用前述位置和速度信息。

## 让接收形状与参考平面跟随骨骼

原生 Contact 使用 `rootTransform` 作为参照；未指定时，采用组件所在 Transform。本地 `position` 与 `rotation` 共同确定形状。球心偏离骨骼原点时，骨骼转动会带动球心绕行；球心居中时，球形轮廓在转动前后保持相同。单个球的接近值适合测距离，方向可由多个已知布局的点测得。[官方 Contacts](https://creators.vrchat.com/common-components/contacts/) · [字段定义原文](https://github.com/vrchat-community/creator-docs/blob/f437f5081c4476aaf443b507a7ec4a9d21e0e63b/Docs/docs/common-components/contacts/index.md)

Sensa 的 **Tracking Frame** 为跟随平面生成 Origin、Forward、Right 三个独立 Contact 定位实例。选择 Contact 直接定位后，总共生成 6 个 Contact、36 个公开字段，位置统一采用 AvatarRootMeters。桌面以 Forward−Origin 确定当前深度方向，再计算目标的深度和侧向偏移。骨骼的旋转由标记位置变化体现；参照偏移与朝向在 Unity 中设置。[创建跟随平面](unity-build.md#创建随骨骼移动的参考平面) · [计算示例](computed-signals.md#组合根点坐标)

## 保持单一目标并检查活动

已核验运行时为 Proximity Receiver 选择匹配 Sender 中 **Proximity 严格大于零且最大**的对象。Beta.3 在两个 Sender 的 Proximity 都为 1 时，选择 PointSeparation 更小的对象，依据见上述官方发布说明。Sender 类型为：0 无选中 Sender，1 自己的 Avatar，2 其他 Avatar，3 世界 Sender。Sensa 根点方案接受类型 1；每个作者组件使用独立通道和唯一 Sender，将测量对应到所选自身根点。

原生报告未提供时间戳、序号或稳定 Sender 标识。Sensa 添加 `Sample` 和 `Radius`；`Sample` 目标每 50 ms 在 n/32（n=1…32）间循环，0 表示停用或失效。桌面要求同一来源与实例的十二字段齐全、数值有限、Proximity 为正、类型为 Self，且 Radius 在支持的正数范围内；位置边界随 Radius 变化并留有小量数值容差。变化后的 Sample 最多保留 **1000 ms**，较短的正数输入超时优先；重复相同 Sample 不延长活动有效期。

没有选中 Sender 时，SDK 写入类型 0 和零位置／速度。Contact、完整字段、活动或边界失效时，Sensa 停止相关动作。Sample 检查生产端活动；SDK 字段传递和 Sender 对应关系通过专用布置与客户端验收核对。[参数字典](osc-parameters.md)列出全部十二个公开字段。

## 将身体局部动作映射为设备目标

`contact-position` 与 `contact-speed` [预设](presets.md)提供起始映射，将 `Root` 替换为实际实例并校准量程。使用 **X、Y、Z 或 Distance**，按校准后的方向或距 Avatar 原点的距离联动。细微局部动作可沿一轴采集希望的起点和终点，例如将根点少量前后位移映射为有限的深度范围。已有 OGB 深度信号适合其作者几何下的深浅趋势；Contact 坐标方便选择具体的动作轴。

使用 **VelocityX、VelocityY、VelocityZ 或 Speed** 映射运动强弱，或通过 **ProximitySpeed** 观察接收区内靠近／退出的强度。需要限定动作生效范围时，可另用 Touch／Close 信号作为区域条件。采集适当端点、检查预览并保存映射，再启用实验空间输入和实际 OSC 输入。校准、曲线、输出限位、输入启用与失效停止沿用现有空间流程。

位置和速度提供不同控制：静止根点可保持按位置生成的目标，速度目标则可回到校准的零速水平。在实际客户端检查方向、响应和停止，再以小输出范围确认设备响应。[工作台指南](guide.md) · [定位说明](positioning.md)

## 安装包依据与相关 SDK 能力

以下官方发布资产及 SHA-256 用于复核来源。Beta.3 为本次接口兼容核验版本，Beta.2 保留为原协议依据：

| 安装包 | SHA-256 |
| --- | --- |
| [com.vrchat.base-3.10.6-beta.3.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.3/com.vrchat.base-3.10.6-beta.3.zip) | `5c2e392d0cb56545731a1990952f237421a2ef56d2bc3b0929bd14f28fa31d14` |
| [com.vrchat.avatars-3.10.6-beta.3.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.3/com.vrchat.avatars-3.10.6-beta.3.zip) | `e5e901e7953cbd8b1e1c998b7a6c83fe419012736135d4bf4a53b7e1eb8cebb9` |
| [com.vrchat.base-3.10.6-beta.2.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.base-3.10.6-beta.2.zip) | `7c6d17be89b1ffad2da8dc52eb3cdd477533f4f7957359d24351807b6aa64ff2` |
| [com.vrchat.avatars-3.10.6-beta.2.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.avatars-3.10.6-beta.2.zip) | `22d5fbe409de4e9640a6772c5156bce1a64d1eb59a392a29d7094a786379b332` |

Beta.3 Avatars 包的 `Editor/VRCSDK/SDK3A/AvatarDynamicsSetup.cs:88–104` 通过 `advancedParameters` 绑定报告，包括新增的缩放与 PointSeparation 后缀。Beta.3 Base 运行时程序集中的 `ContactReceiver.SetAdvancedParameters` 确认了这些报告的默认值及 0.001 m 归零阈值。Beta.2 的同文件 `88–113` 及 Base 包运行时程序集 `Runtime/VRCSDK/Plugins/VRC.Dynamics.dll` 的 `ContactReceiver.SetAdvancedProximityParameters`、`ShapeData.GetPointInLocalSpace`、`ContactManager.CalcRelativeVelocity` 与 Proximity 选择任务支持上述选择规则、坐标框、单位和速度语义。安装包核验用于建立协议参考，Sensa 实际执行的检查另见[验证记录](e2e-status.md)。

Beta.3 的高级参数与材质报告均支持任意 Receiver 类型，`_ProximitySpeed` 专用于 Proximity。SDK 还提供材质／Shader 报告，可包含最多八个 Sender 项与四个 Renderer，属于独立 SDK 输出路径。Sensa 的 Contact 方案使用 Animator／OSC 参数，材质报告可留待后续接入。现有 Sensa Shader 捕获继续使用屏幕编码传输。

[接入方案](usage-scenarios.md) · [OSC 字典](osc-parameters.md) · [Unity 组件包](../unity/top.sealoong.sensa/README.zh-CN.md)
