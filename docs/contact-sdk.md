# Contact 直接定位（SDK Beta）

**简体中文** | [English](contact-sdk.en.md)

Contact 直接定位通过 VRChat 的高级 Proximity 参数读取所选根点的位置和相对速度，使用一个专用球形 Sender 和一个球形 Receiver。构建自己的 Avatar 时，可安装 **VRChat Avatars SDK 3.10.6-beta.2** 或提供同一能力的后续 SDK，再明确选择此方案。Automatic SPS Setup 默认仍使用四点定位。

官方 [3.10.6-beta.2](https://github.com/vrchat/packages/releases/tag/3.10.6-beta.2) 发布于 **2026 年 10 月 20 日北京时间 05:50（10 月 19 日 21:50 UTC）**。本说明依据该安装包的 Editor 源码和运行时程序集。此 Beta 在真实 Unity／VRChat 客户端中的参数发布与 OSC 链路尚待验收；隔离测试和 CI 按各自记录的范围验证实现。

## 构建专用根点测量

1. 通过 VRChat 项目工具安装配套的 Base 和 Avatars Beta 包，再安装 Sensa Unity 组件包。
2. 在 **Automatic SPS Setup** 的根点定位方式中明确选择 **Contact 直接定位（SDK Beta）**，或直接添加 **Contact direct tracking (SDK Beta)**（`SensaContactRootProbe`）。
3. 选择自己 Avatar 上实际的 SPS Socket／Plug 根点、Sensa 组件或原生 Contact 根点。每个作者组件使用唯一的实例名和碰撞通道；明确选择 Sensa／原生 Contact 根点时，可独立于 VRCFury 使用。
4. 构建 Avatar。Sensa 生成跟随所选根点的微小球形 Sender，并在 Avatar 原点生成 Proximity Receiver；接收形状偏移为零，各轴与 Avatar 对齐，只接受专用通道上的 Self。
5. 在实际客户端中按需通过生成菜单选择目标。在单一 OSC 来源下检查 `Sensa/Contact/<id>/…`，先在根点面板校准，再启用空间输入。

Receiver 的制作半径为 2 个 Avatar 根局部单位，标记半径为 0.001。公开的 `Radius` 是当前**世界米制半径**，随 `ScaleFactor` 更新。缩放门控会在 Receiver 超过 SDK 的 3 m 半径上限前停用测量并清零 `Sample`。支持的 Avatar 根缩放为正数且均匀。

## 按正确坐标框读取位置与速度

SDK 的公开开关是 **`advancedProximityParameters`**，类型为 Bool，适用于 Proximity Receiver。基参数名为 `Proximity` 时，SDK 写入 `Proximity_SenderType`、`Proximity_SenderLocalPositionX/Y/Z`、`Proximity_SenderVelocityX/Y/Z`、`Proximity_SenderVelocityMagnitude` 和 `Proximity_ProximitySpeed`。

位置描述**发送形状中点相对接收形状中点的位移**，再旋转到接收形状的坐标轴。运行时使用接收形状旋转的逆变换，保留物理米单位，未除以 Transform 缩放或 Receiver 半径。球形的中点就是球心，胶囊使用其形状中点。因此，Sensa 的专用零偏移 Receiver 建立 **AvatarRootMeters**：原点在 Avatar 根，各轴跟随根旋转，单位为物理米。四点定位和 Shader 捕获继续使用 **AvatarRootLocal**，其单位按制作时的 Avatar 根尺度解释。

```text
position = inverse(receiverShapeRotation)
           × (senderShapeMidpoint - receiverShapeMidpoint)
```

速度是 Sender 相对 Receiver 在近似接触点处的速度，包含角运动项，再旋转到 Receiver 坐标轴，单位为 **m/s**。形状旋转时，这个量可能与所报告中点坐标的时间导数不同。`Proximity_SenderVelocityMagnitude` 为其非负模长。`Proximity_ProximitySpeed` 是 Proximity 的带符号变化率，单位为**接近值／秒**；退出时，Proximity 归零可能带来短暂读数。

负的位置分量是正常坐标。Sender 静止时，速度为零仍可保持有效位置。单个专用点提供位置和速度；计算方向还需额外的方向信息，多点姿态可作为后续扩展。

## 保持单一目标并检查活动

已核验运行时为 Proximity Receiver 选择匹配 Sender 中 **Proximity 严格大于零且最大**的对象。Sender 类型为：0 无选中 Sender，1 自己的 Avatar，2 其他 Avatar，3 世界 Sender。Sensa 根点方案接受类型 1；每个作者组件使用独立通道和唯一 Sender，将测量对应到所选自身根点。

原生报告未提供时间戳、序号或稳定 Sender 标识。Sensa 添加 `Sample` 和 `Radius`；`Sample` 目标每 50 ms 在 n/32（n=1…32）间循环，0 表示停用或失效。桌面要求同一来源与实例的十二字段齐全、数值有限、Proximity 为正、类型为 Self，且 Radius 在支持的正数范围内；位置边界随 Radius 变化并留有小量数值容差。变化后的 Sample 最多保留 **1000 ms**，较短的正数输入超时优先；重复相同 Sample 不延长活动有效期。

没有选中 Sender 时，SDK 写入类型 0 和零位置／速度。Contact、完整字段、活动或边界失效时，Sensa 停止相关动作。Sample 检查生产端活动；SDK 字段传递和 Sender 对应关系通过专用布置与客户端验收核对。[参数字典](osc-parameters.md)列出全部十二个公开字段。

## 将身体局部动作映射为设备目标

`contact-position` 与 `contact-speed` [预设](presets.md)提供起始映射，将 `Root` 替换为实际实例并校准量程。使用 **X、Y、Z 或 Distance**，按校准后的方向或距 Avatar 原点的距离联动。细微局部动作可沿一轴采集希望的起点和终点，例如将根点少量前后位移映射为有限的深度范围。已有 OGB 深度信号适合其作者几何下的深浅趋势；Contact 坐标方便选择具体的动作轴。

使用 **VelocityX、VelocityY、VelocityZ 或 Speed** 映射运动强弱，或通过 **ProximitySpeed** 观察接收区内靠近／退出的强度。需要触碰确认的效果，可另用 Touch／Close 信号作为接触条件。采集适当端点、检查预览并保存映射，再启用实验空间输入和实际 OSC 输入。校准、曲线、输出限位、输入启用与失效停止沿用现有空间流程。

位置和速度提供不同控制：静止根点可保持按位置生成的目标，速度目标则可回到校准的零速水平。在实际客户端检查方向、响应和停止，再以小输出范围确认设备响应。[工作台指南](guide.md) · [定位说明](positioning.md)

## 安装包依据与相关 SDK 能力

以下官方发布资产及 SHA-256 用于复核来源：

| 安装包 | SHA-256 |
| --- | --- |
| [com.vrchat.base-3.10.6-beta.2.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.base-3.10.6-beta.2.zip) | `7c6d17be89b1ffad2da8dc52eb3cdd477533f4f7957359d24351807b6aa64ff2` |
| [com.vrchat.avatars-3.10.6-beta.2.zip](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.avatars-3.10.6-beta.2.zip) | `22d5fbe409de4e9640a6772c5156bce1a64d1eb59a392a29d7094a786379b332` |

Avatars 包的 `Editor/VRCSDK/SDK3A/AvatarDynamicsSetup.cs:88–113` 绑定生成后缀；Base 包运行时程序集 `Runtime/VRCSDK/Plugins/VRC.Dynamics.dll` 的 `ContactReceiver.SetAdvancedProximityParameters`、`ShapeData.GetPointInLocalSpace`、`ContactManager.CalcRelativeVelocity` 与 Proximity 选择任务支持上述选择规则、坐标框、单位和速度语义。安装包核验用于建立协议参考，Sensa 实际执行的检查另见[验证记录](e2e-status.md)。

该 Beta 还提供材质／Shader 报告，可包含最多八个 Sender 项与四个 Renderer，属于独立 SDK 输出路径。Sensa 的 Contact 方案使用 Animator／OSC 参数，材质报告可留待后续接入。现有 Sensa Shader 捕获继续使用屏幕编码传输。

[接入方案](usage-scenarios.md) · [OSC 字典](osc-parameters.md) · [Unity 组件包](../unity/top.sealoong.sensa/README.zh-CN.md)
