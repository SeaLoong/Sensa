# 功能参考

**简体中文** | [English](features.en.md)

本页汇总已实现的功能及使用条件。操作顺序见[指南](guide.md)，方案选择见[使用方案](usage-scenarios.md)，协议数值见[参数字典](osc-parameters.md)。Sensa 处理输入信号，并将结果送到设备、应用与录制文件。[输入、计算与输出](signal-pipeline.md)

## 可直接搭建的流程

| 目标 | 已有能力 | 操作入口 |
| --- | --- | --- |
| 组合输入并计算 | OSC、手动、脚本、反馈和回放；加权、空间运算、平滑、阈值与事件 | [流程与计算](signal-pipeline.md#选择来源与计算) |
| 将一个结果送到多个目标 | TCode、Intiface、OSC 参数、DG-LAB、MIDI CC、HTTP／WebSocket JSON 和 MQTT | [输出绑定](signal-pipeline.md#同一个结果连接多个输出) |
| 保存可播放的轨迹 | 按绑定录制 funscript 轨道，分段下载、载入播放器或信号回放 | [录制与回放](signal-pipeline.md#录制与观察) |
| 复用完整交互 | 导入／导出计算、轴映射、轴配置与输出，先预览再应用 | [整套方案](signal-pipeline.md#保存与复用整套方案) |
| 打开多个工作台页面 | 同页单例及同源跨页连接共享，各页保留草稿 | [页面连接](signal-pipeline.md#页面与连接共用) |

## 浏览器工作台

| 区域 | 能力 |
| --- | --- |
| 常驻顶栏 | 实时会话、实际模式、输入许可、急停／解除、语言与帮助 |
| 控制 | 浏览／应用输入；手动十二轴、脚本、输出管理、准备状态与 L0 录制 |
| OSC 映射 | 五个内置模板、自定义预设、可复用计算信号、替换／追加、草稿保存／恢复、来源／角色／曲线／量程／模拟 |
| OSC 参数 | 来源浏览与实际使用分开；完整目录搜索、每页最多 100 项、冻结、分类、置顶、FT 前缀显示、含义与添加映射 |
| OSC 设置 | UDP 接收、来源、超时、OGB 心跳、OSCQuery、服务广播与 Hub |
| 实验诊断 | 根点／Point／Handle／Pose、原因与局部读数、两端校准、明确实验许可 |
| 流程 | 多来源计算、时间与事件处理、输出绑定、脚本录制／回放与整套方案导入／导出 |
| 设置 | 十二轴配置、默认与引用管理、结构化日志 |

常用操作直接显示，较少使用的选项展开后可见。顶栏保留急停入口；正文可独立滚动，设备按行显示名称、目标和操作。脚本未载入时只显示导入入口。草稿与已保存状态分开，语言切换保留当前草稿。[语言](languages.md) · [视觉规则](ui-quality.md)

[独立参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)包含十一个场景的真实 3D、XZ／立体 SVG、精确滑条、指定平面拖动、参数联动与 Shader 位图。选择实际参数名后，可观察目标靠近、进入和触碰区域时的数值变化，再据此选择映射。Three.js 随包离线分发，WebGL 不可用时回退 SVG。

同源标签页优先通过 SharedWorker 共用实时连接，也可通过 BroadcastChannel 与 Web Locks 由一个标签页维护共享连接；两种方式均不可用时，每页保留一条连接。请求分别关联、草稿独立，同一页使用引用计数单例。页面从缓存恢复后重新附着订阅。[连接行为](signal-pipeline.md#页面与连接共用)

## 运行时与输入

实际模式包括 Manual／Osc／Script／Combined；组合方式允许已配置来源共同参与。浏览保持当前已应用的方式。模式变化、脚本替换、配置保存先关输入并停止。急停锁存，解除不恢复。连接不授予许可；已有有效许可时连接可能收到目标。启动不恢复运动／输出启用／脚本。

- **手动**：十二轴、一次／跟随编辑、清除覆盖；跟随轴配置或显式 Interval(ms)／Speed。跟随编辑不是自动振荡。
- **脚本**：funscript 无效动作跳过，同时间保留最后一项，再排序；无有效动作拒绝。L0 插值、0.1–4×、循环、A–B、时码、关键帧和密度。暂停／停止／卸载停止自动帧；已许可的显式定位仍可发送。注入时钟保留分数毫秒；没有媒体同步。
- **OSC**：UDP Float／Int／Bool、嵌套 bundle、Avatar 生命周期、标准参数前缀剥离；丢弃非有限值，目录和来源有容量／过期清理。timetag 可转发，不提供完整调度语义。
- **组合**：绑定可同时使用手动／脚本读数、OSC／定位、设备反馈、常量和可复用计算。

门控／空间失效停止，不回退旧同轴数据。常规 OSC 默认无超时，正值超时对相关断流锁存急停；不同空间模型另有时效。[运行时](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs) · [脚本](https://github.com/SeaLoong/Sensa/blob/main/src/Input/Script/FunscriptPlayer.cs)

## 信号解释与网络辅助

路径支持精确、完整段 `*`、跨段 `**`、分号／换行别名。来源独立，Avatar 变化清缓存／估长并停止 OSC。FT 隐藏只匹配剥离标准前缀后的 `FT/`／`v2/`，已映射和置顶保留，不猜表情名。

校准、反向、Linear／EaseIn／EaseOut／SCurve 与输出区间先于角色融合。同角色优先较高归一化值，平手按强度或距中位偏差选择；只修改实际出现轴。GateEnable 必须全部开放，DepthOverride 可覆盖深度。

**计算信号**在校准前组合多个输入：支持加权平均、平均值、求和、相减、相乘、相除、最小值、最大值和向量长度。输入可选 OSC 参数、已解算的定位坐标／速度、手动／脚本读数、设备反馈、常量或其他计算信号；一个结果可重复用于映射和输出绑定。时间运算提供平滑、门限、延迟、变化率／峰值、事件、持续时间和波形生成。后端检查唯一来源、输入有效性和最旧样本时效，并为界面提供已保存配置的实时结果。计算与映射一起保存；有效性向依赖它的绑定传播，现有轴映射保留动作门控。[配置与示例](computed-signals.md)

| 角色 | 目标轴 |
| --- | --- |
| Depth／Surge／Sway | L0／L1／L2 |
| Twist／AngleX／AngleY | R0／R1／R2 |
| V0／V1／V2 | 同名振动轴 |
| Auxiliary／Auxiliary1／Auxiliary2 | A0／A1／A2 |

OgbDepth 优先使用 **SPS2 · PenOthersNewRoot / PenOthersNewTip**，从同实例配对和未饱和样本估算长度，再换算深浅趋势；尚未就绪时输出零。两路缺失或均零时，使用 **SPS1 · PenOthers / PenOthersClose** 的深浅信号与已发布的接近条件。OgbTouch 将 Touch／Plug Frot 与对应 Close 配合使用；Socket Frot 和独立 Zone 直接读取接近强度。五种内置模板用于 OGB 深度／振动、Contact 位置／速率和 PB 拉伸。[OGB](ogb-compatibility.md) · [预设](presets.md)

OSCQuery 支持 HOST_INFO／树／LISTEN 与可选轮询；本机可广播接收服务。Hub 支持多 UDP 目标、来源筛选、事件／定频合并和统计，未消费原包保留 bundle。OGB_ENABLED 默认关闭，启用后向配置目标在实际 OSC 接收期间每 5 秒发 true，停止时尝试 false，用于维持 Avatar 的参数发布。

## 输出、轴配置和录制

TCode 支持串口 115200／8N1、端口友好名称和 D0／D1／D2 查询，以及 UDP／TCP 增量编码、必要刷新与停止。每输出有独立启用、目标和轴配置。十二轴支持 Min／Max、RemapMin／Max、MaxSpeed、Invert、Normal／Locked／Ignored、LockValue、None／Interval／Speed 与 RampType；忽略不意味着回中。

Intiface 使用 Buttplug WebSocket、扫描和设备特征。位置按能力选择定时／原始命令，L0 方向转换为 1−L0；振动独立选 V0／V1／V2／显式 L0，默认 V0，微小值降零仍发零，纯振动设备可用。新输出默认外部 Central，显式自管配置保留，但不附引擎。改变已连接振动轴走保存事务并重建客户端。[输出源码](https://github.com/SeaLoong/Sensa/tree/main/src/Outputs)

输出绑定增加 **OSC 参数**、**DG-LAB**、**HTTP JSON**、**WebSocket JSON**、**MQTT**、**MIDI CC**和**录制**目标，分别选择来源、数值换算、目标量程、停止值和发送频率。OSC 提供 VRChat 回写预设；DG-LAB 使用 4 APP 的 V4 配对、设备与任务协议。协议适配器编码目标操作，传输负责交付和取消。[输出配置](signal-pipeline.md)

L0 录制保存分发前的动作目标，停止补末值保持段，最多 100000 帧自动结束，简化后导出 funscript。活动导出先停止该录制；重录确认后才清空。录制输出默认将每条绑定的有效片段保存为独立 funscript 轨道，回放得到 0～1 的位置值；高级 JSON Lines／CSV 诊断保留原始值、换算值与无效区间，回放读取原始值。整套方案导入／导出汇集映射、轴配置、计算与输出设置，导入后的输出默认关闭。[录制与回放](signal-pipeline.md#录制与观察)


## Unity 与空间实验

默认禁止空间驱动。SPS 四点定位的 `P0..P3+Sample` 使用专用根标记、AvatarRootLocal 四锚点和缩放守卫；Sample 默认 1000 ms、上限 1250 ms。Contact 直接定位（SDK Beta）用一个专用自身根点 Sender 和一个 Receiver，发布十二个 `Sensa/Contact/<id>/…` 字段，提供 AvatarRootMeters 位置与接触点相对速度；Sample 变化寿命最多 1000 ms，Radius 随 ScaleFactor 更新并受 3 m 门控保护。SensaPoint 支持 X／Y／Z／Distance 与 VelocityX／Y／Z／Speed／ProximitySpeed，沿用现有校准与停止行为。[Beta 前提与源码依据](contact-sdk.md)。Shader 捕获提供根点位置、Right／Forward 方向与 `AvatarScale`，三份数据副本可从完整且一致的副本恢复缺失区域，冲突副本会使测量无效。在流程的计算或输出绑定中选择“定位测量”（SensaPoint），再选择 RightX／Y／Z、ForwardX／Y／Z 或 AvatarScale，即可让这些指标参与计算并沿用定位的有效性检查。图块字段与捕获要求见[定位协议](positioning.md)。独立 Point／Handle／Pose 使用相对参考对象的坐标，并检查所有参与通道的最旧数据时间。它们的坐标分别相对 Avatar 或指定参考对象，适合校准为局部移动动作。[定位](positioning.md)

NDMF 构建生成允许的原生组件再移除作者脚本。Automatic SPS Setup 支持 Dedicated／Exclusive，并明确选择根点定位方式：默认 SPS 四点定位，安装受支持的 Beta SDK 后可选 Contact 直接定位。独立 Contact 作者也支持明确的 Sensa／原生根点，无需 VRCFury；单点提供位置与速度，多点姿态留待后续。独立 SPS 四点定位作者可选实际根；传统 SensaComponent、PB、Point／Handle／Pose 仍各有自己的生成模型。GPU Model Probe 提供 Editor 中的模型快照，便于检查作者设置。Avatar／World Lab 提供能力场景、菜单与放置、SDK／ClientSim／PlayMode 入口，使用自己的授权资源。QuickStart 仅内部合成夹具。[Unity](../unity/top.sealoong.sensa/README.zh-CN.md) · [实验室](lab-workflow.md)

## 配置、访问与 API

配置默认程序旁 `config.json`，可用 `SENSA_CONFIG_PATH`。唯一默认轴配置、目标冲突、引用修复与持久化集中管理；保存串行关闭输入／停止／重连，失败恢复配置与连接。

默认 loopback HTTP。浏览器通过 `GET /api/session` 获取 HttpOnly／SameSite=Strict Cookie；LAN 需明确 `SENSA_ACCESS_TOKEN`，接受 Bearer 或 Basic 密码，校验 Origin／Host／跨站请求。HTTP 不加密，不应直接暴露互联网。消息大小、并发与发送时间有界。[访问策略](https://github.com/SeaLoong/Sensa/blob/main/src/Hosting/LocalAccessPolicy.cs)

| API | 操作 |
| --- | --- |
| 配置／状态 | GET/PUT `/api/config`；GET `/api/state/overview`、`/api/state/logs`、`/api/meta/serial-ports` |
| 输入 | PUT `/api/input/mode`、`active`、`manual`、`osc/source`；DELETE manual；POST oscquery/refresh |
| 脚本 | POST load/play/pause/stop/action-prev/action-next；PUT configure/seek；DELETE `/api/input/script` |
| 录制／运行时 | POST `/api/recording/start\|stop\|export`、`/api/control/runtime/emergency-stop\|clear-emergency` |
| 输出 | POST `/api/control/output/{outputId}/connect\|disconnect\|scan-start\|scan-stop\|device-info-refresh` |
| 实时 | `/api/ws`：请求 {id,method,path,body}、响应 {id,ok,data} 与状态推送 |

脚本 HTTP 为 multipart，WS 使用 fileName/content，进入同一命令实现。旧 loop／按类型输出别名仍有，但多输出用 outputId。WebUi.Title 动态标题、Intiface DeviceRoutes、IsOgbSocket/Plug 特殊行为、PreferSpeedMode 编码选择与 ObservedMin/Max 自动建议等保留字段**不代表已接通能力**。[应用路由](https://github.com/SeaLoong/Sensa/blob/main/src/Application/SensaApplication.cs)

[架构](architecture.md)说明源码边界，[开发与发布](development.md)说明检查、构建、预发布、正式发布和文档部署。发布前运行单元检查和浏览器 E2E；实际联动按所选客户端与设备检查方向、响应和停止。
