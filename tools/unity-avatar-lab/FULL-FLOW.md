# 用一个测试 Avatar 验证流程

打开 **`Assets/SensaAvatarLab/Generated/FullFlow.unity`**。这是日常验收入口：Chocolat 底模、原 SPS 棒棒糖、手部 Socket、Sensa 定位、可抓 PB、入门接收器及可选 Shader 编码装置都已配置。无需从分项场景手动拼装。上传时保持 **Private**。

原 QuickStart 和七个能力场景继续用于隔离问题。FullFlow 的额外组件较多，适合功能验收，不是最低开销的日常 Avatar 模板。

## 先确认软件和世界

运行 Sensa，打开 VRChat OSC，开启 Sensa OSC 接收，选择 OSC 并点击“应用输入方式”。首次测试输出列表保持为空。每次切换下面的测试模式，都先关闭输入，替换成该项需要的映射，保存后再启用；不要叠加上一项的门控。

测试世界主场景为 `Assets/SensaLab/Functional/FunctionalLab.unity`。世界里摆放的 PB/Contact/SPS 工程实验不直接变成你的 Avatar 参数；你自己的入门接收器或 Avatar 组件才是 OSC 来源。

## 按这个顺序测试

| 步骤 | 在 Avatar / 世界中做什么 | 在 Sensa 看什么 |
| --- | --- | --- |
| 1. 完整接收链路 | 在世界 START HERE 点 0/25/50/75/100%，再点 STOP；无需打开 SPS | 导入“入门 · 测试世界 → 我的 Avatar”。Depth 约为对应比例，Active=1；STOP 后 Active=0、门控关闭 |
| 2. 自己的 PB | 找到腰前偏右的小球，抓住并移动、拉伸、松开。测试把手无实体碰撞 | 导入“Sensa PB 把手 · Z 位移”，限定 `Sensa/Handle/v1/LabHandle/Self/` 和自己的来源；观察四路坐标、IsGrabbed、Stretch。先在量程校准里采集两端；松手应失效 |
| 3. SPS 自身交互 | 启用棒棒糖道具；打开 `Enable SPS OSC (local)`，选择左手或左前臂 SPS Socket；把自己的道具靠近该 Socket | 先选择 SPS Socket **仅自身**预设，查看实际 OGB 路径。根/长度成对参数先在未饱和位置采样以学习长度，再靠近；偏轴时结果是径向近似 |
| 4. 额外定位 | 在 `Sensa Lab` 子菜单选择 Plug 测量，参考左手 Socket；移动道具 | 使用本地点预设并校准。该量测是自己的 Plug 相对参考 Socket 的位置；与原生 SPS 信号分开比较 |
| 5. 配对/根部诊断 | `Sensa Lab` 切到相应 Socket。配对通道为 `LabPair` | 标准 SPS Root 是诊断；配对 Pose 必须有匹配的 Root/Tip/Side 标记。其他人只有默认 SPS 时不要期待配对姿态有效 |
| 6. Shader 图像传输 | `Sensa Shader` 选择 `Synthetic code (not SPS data)`；再切换 `Corrupt shader CRC` 检查故障 | 使用显式配置的图像桥接脚本查看 XYZ/Frame/Valid。合成值是 (.25, -.5, .75) 米；CRC 错误应令 Valid=0，恢复需要两个前进帧。结束后 Shader 选择 Off |
| 7. 设备 | 前面通过后，使用仅 L0 小行程轴配置连接正确设备，再重复第 1 项 | 五档目标约 400/450/500/550/600。卡片是发送目标，不能当作机械实际位置；STOP 和输入关闭应停止发送 |

Shader 装置**默认 Off**，保持现有实验性质：它测试合成码图像传输，不代表真实 SPS 形变自动驱动设备。SDK 是否在实际客户端保留摄像机、VR 视野是否完全不可见、抓图区域与延迟，仍需客户端测试。图像桥接说明在 `Assets/SensaAvatarLab/CAPABILITIES.md` 和主仓库 `tools/unity-world-lab/CAPABILITIES.md`。

## 菜单与默认状态

`Sensa Lab` 是测量目标选择，`Sensa Shader` 是图像实验开关，二者默认 Off，不保存。它们不代替原道具/SPS 开关。`Enable SPS OSC (local)` 控制 OGB_ENABLED；它本身也不是 Sensa 输入或设备开关。原底模的表情、服装菜单保留，多个菜单项可能被 MA/VRCFury 分页。

独立 `LabHandle` 不受 `Sensa Lab` 目标选择影响，抓取门控只在抓住时允许本地点映射生效。QuickStart 接收器也独立于目标选择，只在测试世界对应刺激附近收到信号。

## 构建与验收

- **Tools → Sensa Avatar Lab → Create full-flow test avatar**：从已有 Exclusive 和 Shader 作者场景生成 FullFlow；拒绝覆盖已存在的 FullFlow。
- **Validate full-flow test avatar**：检查 SDK 完整预处理、Contact 预算、PB 抓取/无碰撞、菜单、关闭默认值和每个 Sensa 接收参数的 Animator 声明；保存 `Validation/full-flow.json`、`avatar-FullFlow.png`。
- **Build FullFlow with SDK (no upload)**：生成 `Builds/Sensa-Chocolat-FullFlow.vrca`，读取真实上传包重复参数/组件检查，保存 `Validation/sdk-full-flow-*.json`。

没有自动连接设备或上传 Avatar。SDK 包检查通过不等于已在 VRChat 验证 OSC、VR 抓取或硬件动作。实际客户端试验请从步骤 1 开始记录结果；分项失败再切回对应的单能力场景排查。

本轮本地构建记录：109 个 Contact，40 位网络参数，两个默认关闭的实验摄像机；Sensa 接收器和 PB 的所需 Animator 参数无缺失，测试把手允许抓取且禁止碰撞。23 项 Unity 包测试通过，包含独立本地点/PB 参数可写性回归。
