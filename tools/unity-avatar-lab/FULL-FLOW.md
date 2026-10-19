# 用一个测试 Avatar 验证流程

**简体中文** | [English](FULL-FLOW.en.md)

从上传到软件预览的统一步骤见 [Avatar / 世界 / Sensa 联动路线](https://github.com/SeaLoong/Sensa/blob/main/docs/lab-workflow.md)。切换测试应替换整套草稿；保存配置会关闭输入，检查后需要重新开启。

打开 **`Assets/SensaAvatarLab/Generated/FullFlow.unity`**。这是日常验收入口：Chocolat 底模、原 SPS 棒棒糖、手部 Socket、Sensa 定位、可抓 PB、入门接收器及可选 Shader 编码装置都已配置。无需从分项场景手动拼装。上传时保持 **Private**。

原 QuickStart 和七个能力场景继续用于隔离问题。FullFlow 的额外组件较多，适合功能验收，不是最低开销的日常 Avatar 模板。

## 先摆好测试道具

打开 Avatar 菜单 **Sensa Test Props**。Palm Socket、Forearm Socket、PB handle、Shader rig 都有同样四个选项：

| 菜单 | 效果 |
| --- | --- |
| Home / reset | 回到初始位置 |
| Left hand / Right hand | 跟随左手或右手；拿到想放的位置 |
| Place in world | 固定在当前位置；走开后目标留在原地 |
| Visible labels / probes | 显示或隐藏辅助标记，不改变测量开关 |

棒棒糖沿用自己的 **SPS_Lollipop → LeftHand / RightHand / Fixed / Off**，入口也收进 Sensa Test Props。移动目标不会自动开启 SPS、测量或 Sensa 输出。

常用开关也集中在这里：根菜单 **SPS OSC** 启用原生 haptics 参数，**Measure plug** 选择 Plug 定位；Socket 子菜单的 **Measure this socket** 直接选择该 Socket 测量。Shader rig 内有合成码输出与 CRC 故障开关。原来的 Sensa Lab / Sensa Shader 菜单仍可用，控制的是同一组参数。

方便的自测方式：Socket 放在左手，移动到面前后选 **Place in world**；棒棒糖选 RightHand，右手拿它靠近固定 Socket。测 PB 时也可以把参考架放到面前，再抓小球。新增放置状态不保存，换 Avatar 后回到初始位置。

Socket 的白色中心和金色 +Z 线表示入口及其方向；旁边有目标名称。Plug 的 ROOT / TIP / SIDE 是配对标记位置。四点本地/PB 阵列显示 **P1–P4**，八点 Socket 阵列显示 **C1–C8**。同一布局内第一到第四个颜色为红、蓝、绿、黄；小球直径不是 Contact 接收半径。辅助标记不代表接收器已启用。

**此处 P/C 编号是独立 Point／Pose 实验探针**，不是 TCode A0/A1/A2 辅助输出，也不是 Sensa SPS 协议的 P0–P3。两种布局的原始 OSC 字段都从 A0 编号，但空间位置不同，不可混用。Sensa 参数工作台按协议类型显示 P 或 C。选择 Measure plug 后，Palm 参考框自动显示 P1–P4，Plug 把手也显示对应 P 阵列；选择 Socket 测量时恢复 C1–C8。同一 Socket 的 Root/Tip/Side 三组八点采样共享 C 阵列位置，以完整路径区分。

QuickStart 是绑定右手腕的链路检查，保持该绑定以匹配世界阶梯台；台上的测试球可以左右手持有或放置。它不是另一个待摆放的 SPS Socket。

## 先确认软件和世界

运行 Sensa，打开 VRChat OSC，开启 Sensa OSC 接收，选择 OSC 并点击“应用输入方式”。首次测试输出列表保持为空。每次切换下面的测试模式，都先关闭输入，替换成该项需要的映射，保存后再启用；不要叠加上一项的门控。

测试世界主场景为 `Assets/SensaLab/Functional/FunctionalLab.unity`。世界里摆放的 PB/Contact/SPS 工程实验不直接变成你的 Avatar 参数；你自己的入门接收器或 Avatar 组件才是 OSC 来源。

出生区左侧新增 **08 MY AVATAR SPS**：琥珀色世界 Plug 用于碰你的 Avatar Socket，蓝框世界 Socket 用于接你的 Avatar Plug。两者都可拿取，也有 LEFT / RIGHT / PLACE / HOME 控制。启用 Avatar 原生 SPS 与 OGB_ENABLED，再在 Sensa 看实际 OGB 接收值。世界 Contact 可能同时触发 Self/Others，因此请固定实际收到的实例路径。不要把世界本地读数当成 Avatar OSC。

## 按这个顺序测试

| 步骤 | 在 Avatar / 世界中做什么 | 在 Sensa 看什么 |
| --- | --- | --- |
| 1. 完整接收链路 | 在世界 START HERE 点 0/25/50/75/100%，再点 STOP；无需打开 SPS | 导入“链路测试”。Depth 约为对应比例，Active=1；STOP 后 Active=0、门控关闭 |
| 2. 自己的 PB | 在 Sensa Test Props 选择 PB handle，放到面前后抓白球，移动、拉伸、松开；把手无实体碰撞 | 优先将实际 Handle_Stretch 映射到 Depth、Handle_IsGrabbed 映射到 GateEnable；使用原生 PB 标量，不依赖四点定位。P1–P4 仅用于实验诊断 |
| 3. SPS 自身交互 | 启用棒棒糖道具；打开 `Enable SPS OSC (local)`，选择左手或左前臂 SPS Socket；把自己的道具靠近该 Socket | 复制“SPS Socket · 径向估算”草稿，将实际 OGB 路径改为 PenSelfNewRoot；同源 NewTip 自动配对。根/长度成对参数先在未饱和位置采样以学习长度，再靠近；偏轴时结果是径向近似 |
| 4. 额外定位 | 在 `Sensa Lab` 子菜单选择 Plug 测量，参考左手 Socket；移动道具 | OSC → 实验诊断查看 ReferenceLocal 候选估计；默认不驱动输出，不能当作世界或 GPU 表面位置 |
| 5. 固定 SPS 根部／配对姿态 | `Sensa Lab` 选择自己的 Socket／Plug；配对通道为 `LabPair` | 固定根发布 P0–P3 与变化的 Sample 五个 Float，得到 Avatar 根局部坐标；配对 Pose 仍是独立实验。两者都需明确实验许可，单根点不提供姿态或直接行程 |
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
