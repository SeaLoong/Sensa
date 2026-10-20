# 功能参考

**简体中文** | [English](features.en.md)

本页按产品边界列出已实现能力与限制。操作顺序见[指南](guide.md)，方案选择见[使用方案](usage-scenarios.md)，协议数值见[参数字典](osc-parameters.md)。Sensa 发送动作目标，没有硬件反馈闭环。

## 浏览器工作台

| 区域 | 能力 |
| --- | --- |
| 常驻顶栏 | 实时会话、实际模式、输入许可、急停／解除、语言与帮助 |
| 控制 | 浏览／应用输入；手动十二轴、脚本、输出管理、准备状态与 L0 录制 |
| OSC 映射 | 三个内置模板、自定义预设、替换／追加、草稿保存／恢复、路径／角色／曲线／量程／模拟 |
| OSC 参数 | 来源浏览与实际使用分开；搜索、冻结、分类、置顶、FT 前缀显示、含义与添加映射 |
| OSC 设置 | UDP 接收、来源、超时、OGB 心跳、OSCQuery、服务广播与 Hub |
| 实验诊断 | 根点／Point／Handle／Pose、原因与局部读数、两端校准、明确实验许可 |
| 设置 | 十二轴配置、默认与引用管理、结构化日志 |

React 使用自建 TDesign 风格原生组件，无 MUI／Emotion。顶栏与独立滚动正文共用边缘；输出是对应列的扁平条目。低频选项展开，脚本未载入时只呈现导入入口。草稿与已保存状态分开，语言切换不重置草稿。[语言](languages.md) · [视觉规则](ui-quality.md)

[独立参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)包含十场景的真实 3D、XZ／立体 SVG、精确滑条、指定平面拖动、参数联动与 Shader 位图。Socket／Plug 是参考截面；它不连接输入或设备，模型门控不包含运行时估长或映射。Three.js 随包离线分发，WebGL 不可用时回退 SVG。

## 运行时与输入

实际模式为 Manual／Osc／Script 三选一，浏览不改变它。模式变化、脚本替换、配置保存先关输入并停止。急停锁存，解除不恢复。连接不授予许可；已有有效许可时连接可能收到目标。启动不恢复运动／输出启用／脚本。

- **手动：**十二轴、一次／跟随编辑、清除覆盖；跟随轴配置或显式 Interval(ms)／Speed。跟随编辑不是自动振荡。
- **脚本：**funscript 无效动作跳过，同时间保留最后一项，再排序；无有效动作拒绝。L0 插值、0.1–4×、循环、A–B、时码、关键帧和密度。暂停／停止／卸载停止自动帧；已许可的显式定位仍可发送。注入时钟保留分数毫秒；没有媒体同步。
- **OSC：**UDP Float／Int／Bool、嵌套 bundle、Avatar 生命周期、标准参数前缀剥离；丢弃非有限值，目录和来源有容量／过期清理。timetag 可转发，不提供完整调度语义。

门控／空间失效停止，不回退旧同轴数据。常规 OSC 默认无超时，正值超时对相关断流锁存急停；不同空间模型另有时效。[运行时](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs) · [脚本](https://github.com/SeaLoong/Sensa/blob/main/src/Input/Script/FunscriptPlayer.cs)

## 信号解释与网络辅助

路径支持精确、完整段 `*`、跨段 `**`、分号／换行别名。来源独立，Avatar 变化清缓存／估长并停止 OSC。FT 隐藏只匹配剥离标准前缀后的 `FT/`／`v2/`，已映射和置顶保留，不猜表情名。

校准、反向、Linear／EaseIn／EaseOut／SCurve 与输出区间先于角色融合。同角色优先较高归一化值，平手按强度或距中位偏差选择；只修改实际出现轴。GateEnable 必须全部开放，DepthOverride 可覆盖深度。

| 角色 | 目标轴 |
| --- | --- |
| Depth／Surge／Sway | L0／L1／L2 |
| Twist／AngleX／AngleY | R0／R1／R2 |
| V0／V1／V2 | 同名振动轴 |
| Auxiliary／Auxiliary1／Auxiliary2 | A0／A1／A2 |

OgbDepth 现代配对优先，缺配对／未估长给零；现代缺失／均零才旧近接回退。OgbTouch 检查对应 Close，独立 Zone 无虚构门控。三模板不包含合成阶梯或空间输入。[OGB](ogb-compatibility.md) · [预设](presets.md)

OSCQuery 支持 HOST_INFO／树／LISTEN 与可选轮询；本机可广播接收服务。Hub 支持多 UDP 目标、来源筛选、事件／定频合并和统计，未消费原包保留 bundle。OGB_ENABLED 默认关闭，只向明确目标在实际 OSC 运行时每 5 秒发 true，停止尝试 false；无远端确认，不授予设备许可。

## 输出、轴配置和录制

TCode 支持串口 115200／8N1、端口友好名称和 D0／D1／D2 查询，以及 UDP／TCP 增量编码、必要刷新与停止。每输出有独立启用、目标和轴配置。十二轴支持 Min／Max、RemapMin／Max、MaxSpeed、Invert、Normal／Locked／Ignored、LockValue、None／Interval／Speed 与 RampType；忽略不意味着回中。

Intiface 使用 Buttplug WebSocket、扫描和设备特征。位置按能力选择定时／原始命令，L0 方向转换为 1−L0；振动独立选 V0／V1／V2／显式 L0，默认 V0，微小值降零仍发零，纯振动设备可用。新输出默认外部 Central，显式自管配置保留，但不附引擎。改变已连接振动轴走保存事务并重建客户端。[输出源码](https://github.com/SeaLoong/Sensa/tree/main/src/Outputs)

录制分发前 L0，停止补末值保持段，最多 100000 帧自动结束，简化后导出 funscript。活动导出先停录制，重录确认后才清空；停止录制不关输入。它不记录其他轴、许可／门控／停止事件或硬件反馈。[录制源码](https://github.com/SeaLoong/Sensa/blob/main/src/Recording/MotionRecorder.cs)

## Unity 与空间实验

默认禁止空间驱动。固定 SPS 的 `P0..P3+Sample` 使用专用根标记、AvatarRootLocal 四锚点和缩放守卫；Sample 默认 1000 ms、上限 1250 ms。原生 Shader 的 `Frame+XYZ+Valid` 使用一个 Camera／蒙皮点、显式 ROI 桥和最多 500 ms 变化窗；诊断独立不生成点。旧 Point／Handle／Pose 保留 ReferenceLocal 最旧参与通道规则。它们都不是世界／网格／设备位置。[定位](positioning.md)

NDMF 构建生成允许的原生组件再移除作者脚本。Automatic SPS Setup 支持 Dedicated／Exclusive，独立固定根作者可选实际根；传统 SensaComponent、PB、Point／Handle／Pose 仍各有自己的生成模型。GPU Model Probe 是 Editor 模型快照，不是客户端生产链。Avatar／World Lab 提供能力场景、菜单与放置、SDK／ClientSim／PlayMode 入口，使用自己的授权资源。QuickStart 仅内部合成夹具。[Unity](../unity/top.sealoong.sensa/README.zh-CN.md) · [实验室](lab-workflow.md)

## 配置、访问与 API

配置默认程序旁 `config.json`，可用 `SENSA_CONFIG_PATH`。唯一默认轴配置、目标冲突、引用修复与持久化集中管理；保存串行关闭输入／停止／重连，失败恢复配置与连接。

默认 loopback HTTP。浏览器通过 `GET /api/session` 获取 HttpOnly／SameSite=Strict Cookie；LAN 需明确 `SENSA_ACCESS_TOKEN`，接受 Bearer 或 Basic 密码，校验 Origin／Host／跨站请求。HTTP 不加密，不应直接暴露互联网。消息大小、并发与发送时间有界。[访问策略](https://github.com/SeaLoong/Sensa/blob/main/src/Hosting/LocalAccessPolicy.cs)

| API | 操作 |
| --- | --- |
| 配置／状态 | GET/PUT `/api/config`；GET `/api/state/overview`、`logs`、`/api/meta/serial-ports` |
| 输入 | PUT `/api/input/mode`、`active`、`manual`、`osc/source`；DELETE manual；POST oscquery/refresh |
| 脚本 | POST load/play/pause/stop/action-prev/action-next；PUT configure/seek；DELETE `/api/input/script` |
| 录制／运行时 | POST `/api/recording/start|stop|export`、`/api/control/runtime/emergency-stop|clear-emergency` |
| 输出 | POST `/api/control/output/{outputId}/connect|disconnect|scan-start|scan-stop|device-info-refresh` |
| 实时 | `/api/ws`：请求 {id,method,path,body}、响应 {id,ok,data} 与状态推送 |

脚本 HTTP 为 multipart，WS 使用 fileName/content，进入同一命令实现。旧 loop／按类型输出别名仍有，但多输出用 outputId。WebUi.Title 动态标题、Intiface DeviceRoutes、IsOgbSocket/Plug 特殊行为、PreferSpeedMode 编码选择与 ObservedMin/Max 自动建议等保留字段**不代表已接通能力**。[应用路由](https://github.com/SeaLoong/Sensa/blob/main/src/Application/SensaApplication.cs)

[架构](architecture.md) · [开发与发布](development.md) · [E2E](e2e.md)提供源码边界与验证规则。CI、元数据、EditMode、模拟线包分别只证明自己的检查；真实客户端、GPU／HMD、准确度和机械动作仍需验收。
