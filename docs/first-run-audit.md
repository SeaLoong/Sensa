# 首次使用检查记录（2026-10-14）

用户操作见 [OSR 首次使用](quick-start.md)。本文件记录验证范围，不作为用户操作清单。

| 环节 | 检查结果与改进 | 验证边界 |
| --- | --- | --- |
| 下载/启动 | 原有六平台发布流程；首次无输出时增加入门入口 | 本轮验证 Web 构建；各平台看对应 CI |
| 设备连接 | 新增只发 L0 的 400–600 小行程轴模板，其他轴忽略 | 固定 115200 串口；没有真实 OSR 测试，不保证任意固件兼容 |
| Avatar 安装 | 原默认 Automatic SPS Setup 只做诊断；新增无字段 Quick Start World Receiver，自动放在右手骨骼 | 要求 Humanoid、正确右手和视点、均匀正缩放；需要 SDK 和 MA/NDMF |
| Avatar 编译 | 新建独立 QuickStart 场景，SDK 预处理与离线 .vrca 构建；补上自动 FX 参数控制器，实际 Animator 必须包含 Depth/Active | 没有上传；真实客户端可能有 Contacts 权限、加载或时序差异 |
| 世界交互 | 新增 START HERE：五档阶梯、TOUCH 球、Stop、Reset、60 秒期限、离台/换 Avatar 停止 | 世界显示期望值；不能读取客户端 OSC 或设备到位状态 |
| Contact 数值 | ClientSim 运行实际 Udon，使用 SDK CalculateProximity 测量世界参考接收器；五档误差小于 0.000002 | 参考接收器验证数值链路，不等于上传 Avatar 的实际值 |
| Sensa 映射 | 专用两条映射：Depth、Active 门控；回归测试读取实际发货 JSON | 使用模拟输出和内存 OSC store，不接硬件 |
| 输出限制 | 五档目标约 400/450/500/550/600，只有 L0；尚未收到 Active 或 Active=0 时不允许发送 | TCode 是目标命令；没有机械位置反馈；忽略轴不会回中 |
| 日常 SPS | 与入门试验分开；普通 SPS 优先使用原生 OGB 参数，不要求 Sensa 定位组件 | OGB_ENABLED/原生 Haptics 必须开启；偏轴的准确度限制仍在 |
| 断流 | 明确增量 OSC 与默认无超时的关系，世界 Stop 不是物理断电 | 客户端异常退出可能丢失 Active=0；没有把世界计时冒充硬件失联保护 |

自动检查：73 项 .NET 测试、12 项 Web 测试、25 项 Python 测试；Web lint 与 bundle 构建；21 项 Unity 包测试；原七类世界的 15 个状态回归。Unity 报告分别保存在本地世界 `Validation/quick-start`、Avatar `Validation/quick-start-avatar.json` 和 `Validation/sdk-quick-start-*.json`。

加严上传包检查后发现，仅有 Expression Parameters 声明不足以证明参数能在 Animator 中被写入。入门组件现已自动合并包含 Float Depth、Bool Active 的 FX 控制器。检查器通过真实 Animator 读取构建后的 RuntimeAnimatorController，不依赖编辑器类型转换。

下一次客户端验收应使用自己的私有上传：先保持 Sensa 输出为空，对照五个稳态点和 Stop；再在已经按厂商要求校准的设备上选择小行程配置，核对方向和停止。只有完成这一步，才可宣称该硬件、该 Avatar 的完整链路实测可用。当前不宣称所有 OSR 都“零配置开箱即用”。
