# 使用方案：选择、走通与验收

**简体中文** | [English](usage-scenarios.en.md)

本文回答“我手里有什么，应该用哪条链路”，而不是再次列出 API。研究基线为 [04f6f488](https://github.com/SeaLoong/Sensa/tree/04f6f488d77e3f562ba313352395c6913dc4e662)，外部资料核对日期为 2026-10-19；录制结束时间等后续修正以当前源码及其契约为准。具体控件位置见[使用指南](guide.md)，完整字段见[功能参考](features.md)。

**发送目标不等于设备实测位置。** 软件验证分三层：本地契约证明算法／生命周期；CI 浏览器和 mock wire 证明页面到模拟传输；自己的 Avatar、VRChat 客户端、固件和机械动作仍须分别验收。[运行时](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs)、[输出分发](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/OutputCoordinator.cs)、[E2E 规则](e2e.md)

## 先选方案

| 已有条件／目标 | 首选路径 | 能得到的效果 | 关键边界 |
| --- | --- | --- | --- |
| 只想检查连接、方向、行程 | 手动 → TCode／Intiface | 明确发送单次目标，或调整时跟随 | 不需要 VRChat；“连续发送”不是自动往返 |
| 已有 `.funscript`／动作 JSON | 脚本 → L0 | 插值播放、倍速、循环、A–B、定位和步进 | 没有视频／音频同步；不是十二轴脚本播放器 |
| 验证世界 → 自己 Avatar → Sensa | QuickStart | 五档 Depth 和 Active 门控 | 需自己的测试 Avatar 与世界，没有公共世界地址 |
| 自己 Avatar 已有原生 PhysBone 参数 | Stretch＋IsGrabbed → 标量映射 | 拉伸比例控制 L0，松手关门控 | 不需要位置重建；不是骨骼 XYZ |
| 自己是现代 SPS Socket，收到 NewRoot／NewTip | SPS Socket 径向估算 | 学习长度后输出归一化径向比例 | 需要实际生成 Haptics；不是准确轴向插入深度 |
| 自己是现代 SPS Plug，收到 PenOthers | Plug 近接 → 标量映射 | 越近，目标越大；可按需要校准方向 | 根部近接不是尖端位置，不默认反向 |
| 想将接触／摩擦变成振动 | TouchOthers／FrotOthers → V0 | 接触强度映射到振动轴 | Intiface 默认采用 V0；深度转振动须显式选择 L0 |
| 只有旧 TPS／DPS 视觉效果 | 先检查参数，再升级／生成 Haptics 或使用现有标量 | 有可解释参数时才能接入 | Shader 兼容不等于有 OGB 参数；没有通用旧路径模板 |
| 已有任意含义明确的数值参数 | 自定义 Direct 映射 | 校准、曲线、反向、门控及多路融合 | 固定实例／来源；不要把所有未知数值当距离 |
| 想研究局部点／姿态 | Contact 空间实验 | ReferenceLocal 候选位置、姿态、残差 | 默认不驱动；同 Sender／同帧保证缺失 |
| 想研究弯曲 SPS 模型 | GPU Model Probe／图像桥 | 编辑器模型快照、编码传输诊断 | 尚无通用上传 Avatar 内真实 SPS→桌面的完整生产链 |
| 想保留动作或分发给其他应用 | L0 命令录制／OSC Hub | 导出动作文件／转发选定来源 | 录制不是设备回读；Hub 不是另一种设备运动输入 |

现有五个内置预设的用途和路径见[预设说明](presets.md)。复杂实验不应成为第一次设备连通测试的前置条件。

## 所有路径共用的起点

1. 在“控制”添加输出，或先保持输出为空观察软件逻辑。TCode 输出选用符合固件和实际标定的轴配置；连接成功不会自动授予输入许可。
2. 选择输入页签只是浏览。明确应用输入方式；脚本导入会切到 Script 并关闭输入。
3. 检查实际来源、保存后的映射、方向和门控，再启用输入。配置保存、模式变化或更换脚本后重新检查许可。
4. 分别确认“收到了什么”“准备发送什么”“传输是否成功”“设备实际做了什么”。最后一项不能由前两项的图形预览证明。

关闭输入会发送停止；急停还会保持锁定，解除后不自动续动。停止不是归位或硬件断电。相关规则由统一命令入口和运行时执行，而不是只依赖按钮是否灰显。[控制入口](https://github.com/SeaLoong/Sensa/blob/main/src/Application/SensaApplication.cs)、[输入许可契约](adr/0001-control-and-input-activation.md)、[输入生命周期测试](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/input-safety.spec.js)

## 输出怎样选

| 输出 | 前提与操作 | 命令层效果 | 限制与证据 |
| --- | --- | --- | --- |
| TCode 串口 | 固件理解 TCode；选择实际端口，115200／8N1，保存并启用 | 编码选中轴配置后的轴值；可查询 D0／D1／D2 设备信息 | 设备信息不是位置回读；真实驱动、供电、固件和机械行程未由模拟串口证明 |
| TCode UDP | 正确的主机／端口及网络固件 | UDP 发送轴指令和停止 | 本地“已连接”不能证明远端设备存在；无远端接收确认 |
| TCode TCP | 远端 TCP 服务已运行 | 流式发送轴指令和停止 | 当前不读回 D 指令；连接成功不是机械执行证明 |
| Intiface／Buttplug | 先启动 Central 服务，填写实际 WebSocket 地址并关闭“管理引擎进程”；然后扫描设备 | 按声明的 Position／HwPositionWithDuration／Vibrate 特征发送命令；停止调用服务端停止能力 | 不附带引擎，也没有完整十二轴／逐设备路由；同一输出会遍历其连接设备 |

TCode 的量程、限位、反向和速度在每个输出所用的轴配置中执行。仅存在某个配置字段，不能据此推断 Intiface 已应用同一套 TCode 编码规则。[TCode 编码](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/TCode/TCodeEncoder.cs)、[Intiface 实现](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/Intiface/IntifaceOutputClient.cs)、[输出契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OutputContracts.cs)

**Intiface 振动来源是明确配置：** 每个输出的 `vibrationAxis` 默认 V0，也可选 V1、V2 或 L0；纯振动设备与同时具有位置／振动特征的设备使用同一个选择，不再根据设备类型隐式切换。Touch→V0 和手动 V0 使用默认设置；要把 funscript／深度变成振动，显式选择 L0。振动从任意非零值变为零时会发送零值，即使差值小于普通变化阈值。位置特征仍使用 `Clamp01(1−L0)`，不要把 TCode 的方向／物理刻度套到它上面。[实际路由](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/Intiface/IntifaceOutputClient.cs)、[特征契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/IntifaceContracts.cs)

新输出默认 `ManageEngineProcess=false`，直接连接用户已经运行的 Central；已有配置中显式的 true 保留。只有已安装外部引擎、且确实要让 Sensa 管理其进程时才开启管理；该选项不代表分发包包含引擎。[连接前置条件](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/OutputCoordinator.cs)、[配置归一化](https://github.com/SeaLoong/Sensa/blob/main/src/Configuration/AppConfig.cs)

外部规范要求根据实际设备特征选命令；Central 负责发现和连接硬件，Sensa 是客户端。[Intiface 官方快速开始](https://intiface.com/docs/intiface-central/quickstart/)、[Buttplug 设备与特征](https://buttplug.io/docs/dev-guide/architecture/client-device-in-depth/)

## 方案一：手动建立命令基准

**前提：** 可访问 Sensa；要测硬件时已选好输出和量程。没有 Avatar、SPS 或 Unity 依赖。

1. 应用“手动”，先用 L0／L1／L2 检查目标；需要时展开旋转、振动和辅助轴。
2. 启用输入后“发送一次”。检查逻辑数值、每个输出目标和实际方向。
3. 勾选“连续发送”后调整滑条。它按调整事件合并发送，不会自行生成来回动作。
4. 需要改变时间／速度时展开“发送设置”；测完关闭输入。

**效果：** 手动提供完整十二轴目标。TCode 再经过各自轴配置，例如测试用 L0 400–600 配置会把逻辑中点映射到约 500；这只是数值范围，不能代替硬件标定。Intiface 只使用其实现支持的轴／特征。

**已验证：** CI 操作原生滑条／数字框并检查 UDP、TCP、伪串口和 Intiface mock 命令，验证急停不恢复旧动作。**未验证：** 用户设备的方向、机械到位时间与停止能力。[手动实现](https://github.com/SeaLoong/Sensa/blob/main/src/web/app.js)、[动作契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/MotionContracts.cs)、[使用流程回归](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/flows.spec.js)

## 方案二：播放已有 funscript

**前提：** 文件有有效的 `actions`，时间为毫秒、位置为 0–100。程序会整理有效动作；空或不可用内容会被拒绝。

1. 浏览 Script，选择文件；导入后实际模式为 Script，输入保持关闭。
2. 检查时间轴、倍率和循环范围。先关闭输入定位到期望起点，再明确启用。
3. 播放、暂停、重播，或用“定位与 A–B”精确选段。快捷键只在合适的非表单位置生效。
4. 更换文件后重新检查许可；卸载结束当前脚本。

**效果：** 时间线插值生成 L0，支持 0.1–4 倍率及整段／A–B 循环。暂停停止自动输出，但输入仍启用时，显式定位／关键帧步进可以发送目标。停止归零的是脚本游标，不表示设备回到中点。

**限制：** 没有视频播放器或媒体时钟同步；文件里的其他自定义字段不等于多轴动作协议。长脚本的输出时序仍受程序、网络和设备能力影响。

**已验证：** 可控时钟的插值／边界／循环契约，以及导入、播放、暂停、步进、卸载的浏览器到 mock wire 回归。**未验证：** 第三方播放器同步、真实设备跟随误差。[播放器](https://github.com/SeaLoong/Sensa/blob/main/src/Input/Script/FunscriptPlayer.cs)、[脚本契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/ScriptContracts.cs)、[流程回归](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/flows.spec.js)

## 方案三：QuickStart 验证自己的 VRChat 链路

**前提：** 自己可上传的 PC Humanoid Avatar、Avatars SDK／NDMF 依赖及测试世界。没有现成公共世界地址；已有普通 SPS Avatar不自动包含 QuickStart Receiver。

1. 按[首次使用](quick-start.md)给 Avatar 添加 Quick Start World Receiver，上传并穿戴。
2. VRChat 开启 OSC／Contacts；在 Sensa 应用 OSC 模式，监听默认 `127.0.0.1:9001`。
3. 用“链路测试”替换草稿并保存，仅保留 Depth＋Active。参数页检查实际值。
4. 到自己的“00 START HERE”测试台，点五档和 STOP；先无输出验证，再连接已标定设备。
5. 结束时关闭输入；换方案时替换旧映射，避免遗留 QuickStart Active 门控。

**效果：** 收到 `Sensa/QuickStart/Depth` 的约 0／.25／.5／.75／1，以及 Active；Active=0 关门控。TOUCH 用自己的右手骨骼原点接近测试体，世界 Expected 只是预期，实际 OSC 才是链路证据。

**限制：** 不是 SPS 安装器或准确定位器。离台／超时自动结束还依赖客户端发出 Active=0。Build & Test 可用 OSC，但 VRChat 不为它保存与已发布 Avatar 相同的自动配置文件；不要因没有配置 JSON 就认为所有参数都没输出。

**已验证：** 生成器／协议契约和模拟 OSC 五档、门控停止回归。**未验证：** 本次用户的上传 Avatar、真实客户端 Contacts 和硬件。[QuickStart 作者组件](https://github.com/SeaLoong/Sensa/blob/main/tools/unity-avatar-lab/Editor/QuickStartAvatar.cs)、[世界测试台](https://github.com/SeaLoong/Sensa/blob/main/tools/unity-world-lab/Runtime/QuickStartStation.cs)、[VRChat OSC 概览](https://docs.vrchat.com/docs/osc-overview)、[Avatar 参数](https://docs.vrchat.com/docs/osc-avatar-parameters)

## 方案四：原生 PB Stretch，不经过空间定位

**前提：** 自己 Avatar 的 PhysBone 已允许抓取／拉伸，并设置 Parameter 前缀，实际 Animator／OSC 中存在 `<前缀>_Stretch` 和 `<前缀>_IsGrabbed`。Stretch 是相对最大拉伸程度的 0–1 标量，不是厘米坐标。[官方 PhysBones 参数](https://creators.vrchat.com/common-components/physbones/)

1. 应用 OSC；在参数页确认自己的实际前缀和数据来源。
2. 复制“PB · 拉伸”，把两条测试路径换成真实 Stretch／IsGrabbed。
3. Stretch 使用 Direct→Depth；IsGrabbed 使用 GateEnable。
4. 通过实际放松端、期望拉伸端的读数设置 Stretch 输入最小／最大，再检查输出轴范围与反向。
5. 保存并启用；抓取拉伸检查命令，松手应关门控。

**效果：** 拉伸标量控制 L0，不需要四个 Receiver，也不需要允许实验空间输入。

**两种“校准”不可混淆：** 上述是单条标量的输入范围校准。实验诊断里以厘米采集两端、生成 SensaPoint 映射的校准属于下一节的 Point／Handle，不是给原生 Stretch 增加可靠 XYZ。

**已验证：** 官方参数定义、当前预设、映射与门控契约。**未验证：** 本次实际 Avatar 的 PB 参数声明／OSC 输出、抓取权限和客户端行为。[预设数据](https://github.com/SeaLoong/Sensa/blob/main/src/web/data/osc-presets.json)、[信号处理](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SignalPipeline.cs)、[参数契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/PresetContracts.cs)

## 方案五：SPS／OGB／旧 TPS 参数

先看**自己这一侧真正输出了什么**，再选路径。SPS2 形变可在没有 Contacts 时工作；旧 TPS／DPS 视觉兼容也不保证 OGB Haptics 参数存在。核对的 VRCFury 生成器仅在桌面构建且 Haptics 生成条件满足时创建这些接收器；Touch／Frot 还取决于对应区域是否生成。[SPS 官方说明](https://vrcfury.com/sps/)、[Socket 生成条件与路径](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L151-L274)

| 本地可用数据 | 操作路径 | 命令效果／不能推断的内容 |
| --- | --- | --- |
| `OGB/Orf/<id>/PenOthersNewRoot` 和同实例 NewTip | 复制 Socket 径向预设；最好固定具体 id；从外部接近，先让长度球未饱和，之后再测试 | NewRoot／NewTip 配对学习长度后给出径向比例；NewTip 仍是根部同心长度球，不是尖端标记 |
| `OGB/Pen/<id>/PenOthers` | 复制 Plug 近接预设，按实际零点／上限校准 | 根部近接直接映射，默认不反向；不是准确插入深度 |
| TouchOthers／FrotOthers | 复制触碰预设，确认目标为 V0 和实际输出振动路由 | 接触强度转振动；不提供位置／朝向 |
| 只有 Self 对应参数 | 复制用户预设并改为真实 Self 路径 | Others 模板不会自动变成 Self；按自身交互权限测试 |
| 只有旧 TPS／DPS 或传统 Sensa 生成的别名 | 从参数列表添加确实存在且含义已知的路径，必要时升级／重新生成 Haptics | 不套用已删除的身体部位／角度通用模板；无参数时不能靠添加别名得到数据 |

操作仍是：参数确认 → 替换草稿 → 检查范围／门控 → 保存 → 选择使用来源 → 启用。不要把 QuickStart Active 留在只输出 SPS 的配置里。

**限制：** 径向距离会随侧偏、倾斜改变；多个匹配 Sender、不同参数更新时间和换目标都会影响估算。通配符适合发现参数，固定实例适合可解释的日常控制。不能把当前一组外部源码快照当作所有未来插件版本的保证。

**已验证：** 固定上游生成源码、项目路径／方向契约和模拟 NewRoot／NewTip 估算回归。**未验证：** 用户安装版本的构建结果、双方交互与 Shader／Contact 权限、真实插入几何。[Plug 源码](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L176-L242)、[估算器](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SpsDepthEstimator.cs)、[预设契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/PresetContracts.cs)

## 方案六：自定义标量、来源与应用间转发

**前提：** 知道参数的语义、单位、零点和变化范围。VRChat 默认向 9001 发送，向 9000 接收；Sensa 的 HTTP 5086 与二者无关。Avatar 参数一般按变化发送，不能把静止时无包直接当断连。[VRChat OSC](https://docs.vrchat.com/docs/osc-overview)、[参数输出规则](https://docs.vrchat.com/docs/osc-avatar-parameters)

1. 应用 OSC，确认监听与来源；在参数列表找到值，查看含义后添加映射。
2. 用真实上下限、反向和曲线把输入变成所需轴。用本地模拟隔离映射问题，结束时关闭模拟再观察真实参数。
3. 选择控制用的“使用来源”；“浏览来源”只筛列表。FT 默认按 FT／v2 命名空间隐藏，可显式显示；冻结列表不会停止输入或设备。
4. 保存映射。GateEnable 全部需要有效；同轴多个输入采用既定融合，不是简单相加。
5. 需要让另一应用消费同一来源时配置 Hub 目标，再检查目标参数；避免把接收口转回自身。

**效果：** 支持段通配 `*`、跨段 `**` 和别名；数值经校准／曲线后生成轴目标。Hub 按事件或固定频率转发选定来源，OSCQuery 用于目录发现／订阅及可选轮询回退。

**限制：** OSCQuery 的目录可见不等于实时值有效；Hub 转发不等于运动输入。多个来源未固定时不能把不同发送端随意拼成同一个控制对象。普通标量超时默认关闭；若源只发变化值，启用超时会在静止时停止，不能用固定转发频率伪造上游传感器的新鲜度。

**已验证：** 来源选择、参数浏览、FT 前缀、门控、超时和 Hub 的契约／mock 回归。**未验证：** 外部应用端口、网络阻塞、各插件的 OSCQuery 实现。[OSC 接入](https://github.com/SeaLoong/Sensa/tree/main/src/Input/Osc)、[OSC 契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OscContracts.cs)、[浏览器参数与 Hub 流程](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/flows.spec.js)

## 方案七：Contact Point／Handle／Pose 只做有边界的实验

**前提：** 自己能重新构建 Avatar，生成器参数、尺寸、正值均匀缩放和参考骨骼正确；接受不可观测性限制。日常 PB Stretch 不需要走这条路。

1. 用 Unity 作者组件生成 Point／Handle 或明确配对的 Root／Tip／Side，上传前检查实际 Animator 参数及 Contact 预算。
2. 应用 OSC；在“实验诊断”先只看数据、残差、阻断原因和采样年龄。
3. Point／Handle 确认抓取／交互门控，采集期望的 0%／100% 两端；检查草稿、替换、保存。
4. 只有要测试运动时才显式允许实验空间输入，再重新启用。Root／SharedRoot 始终仅诊断。
5. 缺通道、过期、门控失效或多目标歧义时停止试验；不要通过无限延长超时来宣称定位可靠。

**效果：** 四面体或多点近接值拟合 ReferenceLocal 坐标，Pose 再计算直线姿态。默认每路最旧采样上限为 1 秒，正值输入超时可覆盖；单一路的新包不能替其他旧坐标续期。

**限制：** 四个已知非共面锚点的同点真实距离足以解相对 XYZ；当前 Proximity 缺同 Sender／同帧证明，四／八路都可能产生零残差鬼点。整体刚体运动、世界位置和 GPU 弯曲表面也不可由这些相对距离恢复。[官方 Contacts](https://creators.vrchat.com/common-components/contacts/)

**已验证：** 几何、鬼点反例、最旧通道时效及默认阻断契约，模拟 Point／Handle 校准回归。**未验证：** 真实客户端误差、目标身份、帧同步、头显或硬件定位闭环。完整论证与未来可信批次 XYZ 条件见[定位说明](positioning.md)，当前未实现通用生产协议。[空间契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/SpatialContracts.cs)、[位置观测](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SpsPositionTracking.cs)

## 方案八：GPU／Avatar／World 通路怎样分开验收

| 通路 | 当前能执行的路径 | 结果与不可越过的边界 |
| --- | --- | --- |
| Avatar 构建期组件 | NDMF 生成原生 Contacts／PB／Animator，再上传 | 上传后不是任意桌面 C# 在 Avatar 中执行 |
| 世界 QuickStart／交互站 | 自己世界中的原生对象与 Udon 配合 Avatar Receiver | 世界显示或 Udon 真值不会自动成为 Avatar OSC |
| Editor SPS GPU Model Probe | 选实际渲染相机、对应 Resolver／表面，检查锁定源码依赖，再导出快照／PNG | 读取模型中心线／入口，不是最终网格；源纹理新鲜度和多相机仍有限制 |
| 可上传纯相机测试装置 | 渲染合成编码图块，外部解码 | 仅证明编码传输，不证明图块来自真实 SPS |
| 外部图像桥 | 已生成 PNG 或明确授权桌面区域 → CRC／帧序／冻结检查 → 显式本机 OSC | 当前无完整上传 Avatar 内真实 SPS 生产端；不能据桥接成功宣称实用表面定位 |

若只分析已有快照，可执行：

```shell
python -X utf8 scripts/analyze-gpu-capture.py <capture.json>
python -X utf8 scripts/shader-osc-bridge.py --image <telemetry.png>
```

前者只分析模型；后者默认只解码，依赖 Pillow。只有明确配置 `--port` 才发送 OSC，`--watch` 用于连续观察。桥接会检查递增帧并发 Valid；CRC 和图块帧号不能证明底层 SPS 纹理本身是新帧。也不要仅用单张静态 PNG 通过一次解码就接入运动。

VRChat 的 AsyncGPUReadback 是世界 Udon 能力，不能把编辑器回读脚本直接挂到上传 Avatar；GPU 回读本身也不是任意 UDP 发送权限。[官方 AsyncGPUReadback](https://creators.vrchat.com/worlds/udon/vrc-graphics/asyncgpureadback/)

**已验证：** 代码含离线几何与编码／CRC／帧序契约，并有受控 Unity 实验记录。**未验证：** 本次构建的完整游戏内真实 SPS→桌面→设备链、PCVR 头显可见性、跨相机同步与表面真值。按独立阶段验收，不把 Worlds／Editor 成果外推到 Avatar。[实验安装与既有证据](../unity/top.sealoong.sensa/GPU-TRACKING.md)、[桥接源码](https://github.com/SeaLoong/Sensa/blob/main/scripts/shader-osc-bridge.py)、[世界能力说明](../tools/unity-world-lab/CAPABILITIES.md)

## 附加方案：录制后再回放

**前提：** 已走通一种输入；了解录制的是运行时分发前 L0，而非多轴、设备位置或收到确认后的命令。

1. 开始录制，再按选定方案产生目标。重新开始会开启新录制，不是追加旧文件。
2. 录制中使用“停止并导出”结束并下载，已停止时直接导出；动作文件可用脚本路径复查时间和末值。
3. 停止会把末值保持到实际停止时刻；无采样不生成动作，同毫秒不另造终点，重复停止不延长时长。
4. 达到 100000 帧时录制结束；后续停止不把已经结束的采样人为延长。

**效果与限制：** 导出 L0 的 actions，轨迹会简化。没有硬件回读、其他轴、输入／门控／停止事件或视频时钟；暂停动作／没有新目标时仍可保留停止前的持值时间。停止输出或急停并不等于自动关闭录制，应检查录制状态。

**已验证：** 可控时钟测试验证末值保持到停止时刻、同毫秒、空录制、容量和重复停止；浏览器回归验证下载文件的动作数据。**未验证：** 用导出文件还原真实机械轨迹。[录制器](https://github.com/SeaLoong/Sensa/blob/main/src/Recording/MotionRecorder.cs)、[生命周期契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/RecordingLifecycleContracts.cs)、[录制契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/RecordingContracts.cs)

## 验收时按哪一层排查

| 现象 | 先核对 | 不要据此推出 |
| --- | --- | --- |
| 世界 Expected 变化，参数没变化 | 新 Avatar、Receiver、OSC／Contacts、正确监听口 | 世界场景成功就是 Avatar 已输出 |
| 参数有值，目标没变化 | 已保存映射、实际模式、控制来源、门控、输入许可、实验阻断 | 图表冻结等于接收停止 |
| 目标变化，传输没发 | 输出启用、连接、重复目标冲突、错误日志、设备能力 | 预览就是已发送成功 |
| 命令已发，硬件不动／方向错误 | 固件协议、供电、真实范围、反向及实际传输端 | 网络 socket 存在就是设备已执行 |
| 静止后停用 | 普通超时／空间最旧通道年龄；源是否仅发送变化值 | 放大超时能补足同帧或身份保证 |
| Intiface 振动不跟预期参数 | 输出所选 V0／V1／V2／L0、相应映射、Vibrate 特征 | 设备支持振动就会自动猜到输入来源 |

目前更值得优化的是显式的输入／设备能力匹配、端到端可理解的阻断原因和录制生命周期，而不是增加没有观测保证的定位模板。软件自动化结果应绑定具体提交；真实 Avatar、客户端和硬件未验证的部分始终保留为未验证。
