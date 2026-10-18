# 功能参考

**简体中文** | [English](features.en.md)

本页描述当前实现与边界，源码索引用于继续查证；操作步骤见[使用指南](guide.md)。程序发送动作目标，没有机械位置反馈闭环。Contact 定位保留为默认关闭的实验估计，不能作为可靠定位承诺。

## 浏览器工作台

| 入口 | 当前功能 |
| --- | --- |
| 顶栏 | 实时连接、实际输入模式、输入启用、急停／解除、简体中文／English、帮助 |
| 控制 | 手动／OSC／脚本选择与应用；手动十二轴目标、一次／持续更新、运动参数；输出管理；录制与导出 |
| OSC → 映射 | 五项内置预设、替换／追加、自定义预设、路径／角色／反向、量程／曲线／映射区间、单条模拟、保存／恢复 |
| OSC → 参数 | 搜索、来源浏览、使用来源、分类、冻结、置顶、参数含义、添加映射 |
| OSC → 实验诊断 | 实验许可、Point／Handle 两端校准、Root／SharedRoot／Pose 观测、局部坐标和异常原因 |
| OSC 设置展开区 | 监听、来源过滤、超时、OSCQuery、轮询、接收服务发现、Hub |
| 设置 | 轴配置新增／编辑／默认／移除，十二轴详细设置，结构化日志筛选 |

Web 使用 React 和项目自建的 TDesign 风格基本组件。导航位于顶栏，正文在下方独立滚动；浅灰页面以单层白色工作面和细分隔组织内容。输入方式使用分段选择，与应用按钮同组；输出按名称／目标／操作成行排列，窄屏依次重排。滑条只保留一个可编辑数值，范围端点使用等宽输入列；脚本载入后才展示播放器。连接、映射和诊断详情展开查看。浏览器草稿和已保存配置分离；切换语言保留草稿和运行状态，偏好存于当前浏览器。窄屏使用同一功能结构。

## 模式、许可与停止

实际输入为 Manual／Osc／Script 三选一。浏览页面不切换模式；切换实际模式、替换脚本或保存完整配置会关闭输入并停止输出。连接设备不会自动打开输入许可；如果输入已经开启且有有效目标，连接后可能输出。

急停锁存，解除后不自动恢复动作。输入关闭、门控关闭和空间失效会停止。脚本暂停／停止／卸载停止自动帧与 UDP 刷新；显式暂停定位／步进仍可在已启用 Script 输入时发送。Stop 重置播放游标，不是设备归位。程序启动不恢复输入、输出启用、脚本或运动状态。[运行时](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs)、[应用控制](https://github.com/SeaLoong/Sensa/blob/main/src/Application/SensaApplication.cs)

## 输入与信号

| 能力 | 实现与条件 |
| --- | --- |
| 手动 | 十二轴目标；一次更新、持续更新、清除覆盖；按轴配置或显式 I／S 运动要求 |
| OSC UDP | Float／Int／Bool 标量、嵌套 bundle、Avatar 变更；剥离标准参数地址前缀 |
| 来源隔离 | 参数按来源保存；选择来源及稳定 ID 偏好；浏览来源不改变实际使用来源 |
| OSCQuery | HOST_INFO／参数树、LISTEN 订阅、可选轮询回退；本机接收服务广播 |
| Hub | 多 UDP 目标、事件驱动／固定频率合并、来源选择、发送／丢弃统计；保留未消费原始包的 bundle 结构 |
| 路径匹配 | 精确匹配、完整段 `*`、跨段 `**`、分号／换行别名；启发式提示不会自动建映射 |
| FT 过滤 | 移除标准 OSC 前缀后按 `FT/`／`v2/` 前缀隐藏；映射／置顶保留，不靠面形名称猜测 |
| 标量处理 | 校准范围、反向、Linear／EaseIn／EaseOut／SCurve、输出区间 |
| 融合 | 同角色优先校准后归一化更高的输入；平手按输出强度或距中位偏差择优；只修改实际出现的轴 |
| 门控／覆盖 | 每条 GateEnable 必须有开放值；DepthOverride 可覆盖普通深度 |
| 超时 | 常规 OSC 默认关闭；启用时 relevant 数据断流锁存急停；空间另有默认时效门槛 |

角色对应：Depth／Surge／Sway → L0／L1／L2，Twist／AngleX／AngleY → R0／R1／R2，V0–V2 → 三路振动，Auxiliary／Auxiliary1／Auxiliary2 → A0／A1／A2。角色名不是设备已标定方向。[映射与角色](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SignalMapping.cs)、[校准与融合](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SignalPipeline.cs)

SPS Socket 以同来源、同实例 NewRoot／NewTip 学习长度，估计径向比例；NewTip 是根部同心长度球。现代 Plug 近接不默认反向；原生 Touch／Frot 映射振动。五项预设及真实路径集中在[预设指南](presets.md)，不再提供旧 OGB 通用角度、反向和身体部位固定模板。[径向估计](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SpsDepthEstimator.cs)

参数目录受容量限制，丢弃非有限值；来源过期会清理。Avatar 变更清空对应采样和学习状态，并停止 OSC 输入。bundle timetag 可保留用于转发，但标量输入不是完整时序调度器。[OSC 实现](https://github.com/SeaLoong/Sensa/tree/main/src/Input/Osc)

## 脚本与录制

funscript 接受时间／位置动作，跳过无效动作、排序和处理重复时间；没有有效动作时拒绝。播放插值到 L0，支持 0.1–4 倍速、全段循环、A–B、时码定位、关键帧步进和活动分布。时间由注入时钟驱动，保留分数毫秒，结束帧不依赖界面读取快照的时机。[播放器](https://github.com/SeaLoong/Sensa/blob/main/src/Input/Script/FunscriptPlayer.cs)

录制缓冲带时间戳的 L0，最多 100000 帧，停止后可简化轨迹并导出标准 actions JSON。录制的是分发前命令，没有其他轴录制或硬件确认。[录制与导出](https://github.com/SeaLoong/Sensa/blob/main/src/Recording/MotionRecorder.cs)

## 输出与轴配置

| 输出 | 当前行为 |
| --- | --- |
| TCode 串口 | 115200、8N1；端口枚举、Windows 友好名称、D0／D1／D2 设备信息查询 |
| TCode UDP | 目标地址／端口；增量指令、必要全量刷新、停止；无远端确认 |
| TCode TCP | 流式连接、增量编码、停止和连接错误处理 |
| Intiface／Buttplug | 外部 WebSocket 服务、可选本地引擎管理、扫描／停止扫描、设备特征识别与停止 |

每个输出有独立名称、连接目标和启用状态。TCode 输出选择共享或独立轴配置：Min／Max、RemapMin／Max、MaxSpeed、Invert、Normal／Locked／Ignored、LockValue、None／Interval／Speed 和 RampType。输出级 slope 与速度单位参与最终编码。忽略的轴不会自动回中。[TCode 编码](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/TCode/TCodeEncoder.cs)

Intiface 根据能力选择定时位置或原始位置命令，支持振动特征；能力不足不能当作完整十二轴设备。程序不包含 Intiface 引擎。每输出遥测解析发送目标，不能证明硬件动作成功。[Intiface](https://github.com/SeaLoong/Sensa/tree/main/src/Outputs/Intiface)、[输出分发](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/OutputCoordinator.cs)、[遥测](https://github.com/SeaLoong/Sensa/blob/main/src/Outputs/OutputTelemetry.cs)

## 空间实验的边界

Point／Handle 由四面体近接值估计参考局部 XYZ；Root／SharedRoot 用八点拟合球心，始终只诊断；Pose 用 Root／Tip／Side 三组估计直线姿态。所有观测标记为实验、`ReferenceLocal`。默认 `osc.allowExperimentalSpatialInput=false` 阻断 SensaPoint／SensaPose，包括旧配置。

实验许可开启仍需要完整采样及有效门控。空间年龄取所有通道最旧更新时间，Handle 包括抓取状态；默认 1 秒，正值 `inputTimeoutMs` 覆盖。新鲜度与残差不能证明同帧或同 Sender。四点／八点都有多 Sender 零残差鬼点反例；共同刚体变换、世界位移和 GPU 形变表面也不可由这些距离独立恢复。两端校准只改变映射，不补足缺失的信息。[定位说明与未来可信批次方案](positioning.md)

## Unity 与实验工具

Unity 包提供构建期作者组件，不是在上传 Avatar 中运行任意 C#。依赖以[包清单](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/package.json)为准；NDMF 生成 Contacts、PhysBone、约束、Animator 参数和菜单，再清理作者配置。新传感器参数须同时进入实际 FX Animator 与本地参数配置，不能只登记名字。[传感器生成工具](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaSensorUtility.cs)

| 模块 | 提供的内容与限制 |
| --- | --- |
| QuickStart | 自动右手接收器、Depth／Active、本地初值和 FX 参数；配合世界阶梯台验证接收链路 |
| 传统 SensaComponent | Socket／Plug Contacts、环与原始侧向近接；PB／Contact／ExistingParameter／受 SDK 条件约束的 Raycast 辅助信号；不是现代 VRCFury 的相同生成器 |
| Automatic SPS Setup | 扫描／显式选择已有 SPS，排除目标、菜单选择；Dedicated／Exclusive／SharedRootArray 阵列策略 |
| Point／Handle／Pose／Root | 实验采样、抓取门控、参考坐标；缩放、命名、参数冲突与 Contact 预算预检 |
| GPU Model Probe | Editor 中读取已指定 Resolver 的模型快照、中心线与入口数据；固定源版本检查；不是最终网格或通用客户端定位 |
| 图像桥接 | 外部 PNG／屏幕区域解码、frame／CRC／冻结与 Valid、显式 UDP OSC；传输正确不证明采集源是真实 SPS |
| Avatar Lab | 能力拆分、QuickStart／FullFlow 场景、放置／贴手、菜单、SDK preprocess 与本地 bundle 检查；依赖用户自己的授权资源 |
| World Lab | 几何案例、PB／Contact／SPS／Shader 站、START HERE、可交互世界 Plug／Socket、ClientSim／PlayMode 验证入口 |

原生 PB 拉伸不依赖 Contact 位置解算。上传后的真实 Contacts、VR 手柄交互、GPU／头显、Avatar OSC 及硬件仍需要分别验收。世界 Udon 真值不自动成为 Avatar OSC；FullFlow 合成 Shader 码只验证传输。[Unity 指南](../unity/top.sealoong.sensa/README.md)、[自动生成](../unity/top.sealoong.sensa/AUTOMATION.md)、[GPU 实验](../unity/top.sealoong.sensa/GPU-TRACKING.md)、[Avatar 工具](../tools/unity-avatar-lab/README.md)、[世界工具](../tools/unity-world-lab/README.md)

## 服务、配置与 API

配置默认写入程序旁 `config.json`，可由 `SENSA_CONFIG_PATH` 指定。配置归一化、唯一默认轴配置、目标占用冲突和引用修复集中管理；保存通过关闭输入、停止、应用／重连、持久化的串行事务，失败恢复配置与连接。[配置](https://github.com/SeaLoong/Sensa/blob/main/src/Configuration/AppConfig.cs)、[事务](https://github.com/SeaLoong/Sensa/blob/main/src/Application/ConfigurationUpdate.cs)

默认 loopback HTTP；浏览器经 `GET /api/session` 获取 HttpOnly／SameSite=Strict Cookie。LAN 需要显式 `SENSA_ACCESS_TOKEN`，接受 Bearer 或 Basic 密码；检查 Origin／Host／cross-site，禁止跨站控制。HTTPS 才提供加密，普通 HTTP 不适合直接互联网暴露。HTTP／WS 消息有大小限制和并发／发送超时约束。[访问策略](https://github.com/SeaLoong/Sensa/blob/main/src/Hosting/LocalAccessPolicy.cs)、[宿主](https://github.com/SeaLoong/Sensa/blob/main/src/Hosting/SensaHost.cs)

| API 组 | 路径与操作 |
| --- | --- |
| 配置／状态 | GET／PUT `/api/config`；GET `/api/state/overview`、`/api/state/logs`、`/api/meta/serial-ports` |
| 输入 | PUT `/api/input/mode`、`active`、`manual`；DELETE `manual`；PUT `osc/source`；POST `oscquery/refresh` |
| 脚本 | POST `/api/input/script/load`、`play`、`pause`、`stop`、`action-prev`、`action-next`；PUT `configure`、`seek`；DELETE `/api/input/script` |
| 录制 | POST `/api/recording/start`、`stop`、`export` |
| 运行时 | POST `/api/control/runtime/emergency-stop`、`clear-emergency` |
| 指定输出 | POST `/api/control/output/{outputId}/connect`、`disconnect`、`scan-start`、`scan-stop`、`device-info-refresh` |
| 实时会话 | `/api/ws`，请求 `{id, method, path, body}`，响应 `{id, ok, data}`，另有状态推送 |

HTTP 文件上传使用 multipart；WS 脚本加载使用 fileName／content。两者进入同一命令实现。旧 loop 和按类型主输出别名仍保留；多输出应使用 outputId。总览包含 runtime、input.script、OSC 来源／参数／Query／Hub、输出、空间状态、录制与 signals；兼容镜像字段不是另一套运行状态。[命令路由](https://github.com/SeaLoong/Sensa/blob/main/src/Application/SensaApplication.cs)、[请求契约](https://github.com/SeaLoong/Sensa/blob/main/src/Hosting/ApiContracts.cs)

以下保留字段不代表接通的功能：WebUi.Title 动态标题、Intiface DeviceRoutes 逐设备路由、IsOgbSocket／IsOgbPlug 特殊后端行为、PreferSpeedMode 布尔编码选择、ObservedMin／Max 自动校准建议。以实际调用链为准。

## 工程与源码索引

| 区域 | 源码入口 |
| --- | --- |
| 启动与控制 | [Program](https://github.com/SeaLoong/Sensa/blob/main/src/Program.cs)、[Hosting](https://github.com/SeaLoong/Sensa/tree/main/src/Hosting)、[Application](https://github.com/SeaLoong/Sensa/tree/main/src/Application) |
| 输入与处理 | [OSC](https://github.com/SeaLoong/Sensa/tree/main/src/Input/Osc)、[Script](https://github.com/SeaLoong/Sensa/tree/main/src/Input/Script)、[Signals](https://github.com/SeaLoong/Sensa/tree/main/src/Signals)、[Runtime](https://github.com/SeaLoong/Sensa/tree/main/src/Runtime) |
| 输出与录制 | [Motion](https://github.com/SeaLoong/Sensa/tree/main/src/Motion)、[Outputs](https://github.com/SeaLoong/Sensa/tree/main/src/Outputs)、[Recording](https://github.com/SeaLoong/Sensa/tree/main/src/Recording) |
| 浏览器 | [Web](https://github.com/SeaLoong/Sensa/tree/main/src/web)、[架构职责表](architecture.md) |
| Unity 与场景 | [Unity package](https://github.com/SeaLoong/Sensa/tree/main/unity/top.sealoong.sensa)、[Avatar Lab](https://github.com/SeaLoong/Sensa/tree/main/tools/unity-avatar-lab)、[World Lab](https://github.com/SeaLoong/Sensa/tree/main/tools/unity-world-lab) |
| 验证与发布 | [scripts](https://github.com/SeaLoong/Sensa/tree/main/scripts)、[tests](https://github.com/SeaLoong/Sensa/tree/main/tests)、[workflows](https://github.com/SeaLoong/Sensa/tree/main/.github/workflows) |

桌面构建包含 Web 资源，提供六种平台包；Unity 为独立 ZIP。安装器先核对受管源码，不覆盖用户改动和场景；实验资源不包含付费模型。验证按影响选择并缓存成功本地结果，CI 接续未完成产品链，预发布保留十个。测试程序存在不表示本机、Unity、客户端或硬件已通过；实际结果以对应提交报告为准。[开发与发布](development.md)、[E2E 与基线审阅](e2e.md)

[首页](../README.md) · [定位说明](positioning.md) · [WebUI 视觉审美与质量证据](ui-quality.md)
