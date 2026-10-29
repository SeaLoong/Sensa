# 功能参考

**简体中文** | [English](features.en.md)

WebSensa 适合打开浏览器直接控制；Sensa 桌面版连接应用、定位和完整传输方式。两个版本都能将一个来源同时送给多个输出。

## 选择版本

| 能力 | WebSensa | Sensa 桌面版 |
| --- | --- | --- |
| 手动轴／funscript | 支持 | 支持 |
| 一个来源连接多个输出 | 支持 | 支持计算与各绑定独立节奏 |
| 浏览器串口／蓝牙／MIDI | 浏览器 API 与设备协议配置 | 系统端口与桥工具 |
| WebSocket／HTTP | 浏览器直接连接 | 桌面客户端／服务端集成 |
| OSC／UDP／TCP／MQTT | 使用对应桥接地址 | 原生桌面传输 |
| 网站／播放器协议输入 | 参数图解连接 | Buttplug、TCode、JSON 与厂商 API 路由 |
| 录制 | 手动 L0 导出 funscript | 多轨 funscript、JSON Lines／CSV 与录制回放 |
| VRChat／Unity 定位 | 在参数页探索几何 | 实时测量、校准与空间计算 |

[打开 WebSensa](https://sealoong.github.io/Sensa/websensa/) · [WebSensa 指南](websensa.md) · [下载桌面版](https://github.com/SeaLoong/Sensa/releases/latest)

## 浏览器工作台

| 页面 | 操作 |
| --- | --- |
| **控制** | 选择输入方式、调整轴、播放脚本、开始／停止发送 |
| **OSC**（桌面版） | 接收与浏览参数、查看定义、映射轴并转发 |
| **流程**（桌面版）／**输出**（WebSensa） | 管理目标；桌面版增加计算、录制和整套方案 |
| **设置**（桌面版）／**帮助**（WebSensa） | 设备设置与连接说明；桌面版增加协议监听和日志 |

导航适配窄屏，顶栏持续显示输入启用与急停。切换语言保留当前草稿。[工作台指南](guide.md)

## 桌面输入

| 输入方式 | 能力 |
| --- | --- |
| **手动** | 十二轴、单次／连续发送、轴配置或指定时长／速度 |
| **脚本** | Funscript 插值、0.1–4×、循环、A–B、关键帧和时间跳转 |
| **OSC** | Float／Int／Bool、来源选择、预设与自定义映射 |
| **协议** | Buttplug v2/v3/v4、TCode TCP／UDP／串口／WebSocket、WSDM、JSON 与文档列出的厂商路由 |
| **组合** | 多种来源、定位、反馈、录制和计算结果共同参与 |

保存配置、应用其他输入方式或载入脚本会关闭输入，准备好下一条流程后重新启用。[操作说明](guide.md#准备应用输入方式再启用输入)

## 计算与映射

计算信号提供加权平均、加减乘除、最小／最大值、模长、阈值与时间效果。可以加入平滑、死区、滞回、延迟、变化率、峰值保持、边沿、脉冲、冷却或正弦／包络生成。

空间运算包括 `PointDistance`、`PlaneDepth`、`PlaneOffset`、`PlaneDepthFromAxes`、`PlaneOffsetFromAxes`、`VectorAngle` 和 `PlaneAngle`。XYZ 组描述目标、参考原点与平面朝向，结果保存一次即可被多个绑定选用。[完整示例](computed-signals.md)

轴映射负责校准、反向、曲线和动作角色量程。内置预设覆盖 OGB 深度／振动、Contact 位置／速度和 PhysBone。路径支持完整名称、`*`、`**` 与别名。[预设指南](presets.md)

## 设备与输出传输

| 输出 | 能力 |
| --- | --- |
| TCode 串口／UDP／TCP | 十二轴、方向、行程、速度与动作配置 |
| Intiface／Buttplug | 发现设备并映射其位置、振动、旋转与标量功能 |
| Handy／Lovense／Autoblow／VacuGlide | 设备 API 控制、同步脚本与可用循环设置 |
| 蓝牙／串口桥 | 通过附带工具发送对应设备协议 |
| OSC | 有类型参数与 VRChat 回写快捷项 |
| DG-LAB | APP／设备配对、强度、波形和设备反馈 |
| MIDI CC | 系统端口、通道／控制器和 0–127 数值 |
| HTTP JSON／WebSocket JSON／MQTT | 服务地址或主题，传递有类型信号值 |
| 录制 | Funscript 轨道与诊断 JSON Lines／CSV |

每个输出单独管理连接、启用状态与量程。绑定可以按事件、数值变化或固定频率交付。来源失效时使用绑定的备用值；关闭输入、禁用输出或急停使用整机停止。[输出与绑定](signal-pipeline.md#添加输出与绑定)

## 共用连接与多实例

桌面标签页共用实时连接，各自保留草稿。多个协议来源通过不同路径共享 HTTP 端口，各来源保留独立通道。命名桌面实例单独保存配置并选择可用监听端口。[协议路由](protocol-inputs.md) · [启动与多实例](quick-start.md#运行多个实例)

## 录制与可复用方案

录制输出将各绑定的连续有效轨迹保存为 funscript。可以下载、载入播放器，或通过录制回放作为信号来源。JSON Lines／CSV 保留原始值、转换值和有效性。整套方案导出后可复用计算、映射、轴配置和输出。[录制与方案](signal-pipeline.md#录制与观察)

## 参数图解

[参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)提供十一种可调场景，以及 3D、XZ 和等轴视图。按路径／名称搜索参数，选定读数并映射到目标轴，观察近期曲线。可以把模拟轨迹录成 funscript，或将实时值送给 WebSensa。离线副本提供模型与文件导出。

## Unity 与定位

| 方案 | 测量内容 |
| --- | --- |
| SPS 四点定位 | 通过四个距离重建 Avatar 根局部位置 |
| Contact 直接定位（SDK Beta） | Avatar 根米制位置与相对速度 |
| Shader 捕获 | 根位置、Right／Forward 轴和 AvatarScale |
| 跟随平面 | 参考 Origin／Forward／Right，用于深度、偏移和夹角 |
| Point／Handle／Pose 实验 | 参考相对位置与姿态 |

作者组件在 Avatar 构建时生成原生 Contact、约束、动画与参数。[方案选择](usage-scenarios.md) · [单位与校准](positioning.md) · [Unity 构建流程](unity-build.md)

## 配置与开发

桌面程序旁保存 `config.json`，命名实例使用独立文件夹。HTTP 和 WebSocket API 为自制工具提供工作台操作。[架构](architecture.md)

[开发与发布](development.md)说明构建和扫描维护，[验证记录](e2e-status.md)列出实际执行的自动检查及环境验收结果。
