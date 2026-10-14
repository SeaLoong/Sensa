# Sensa Avatar 测试工程工具

**需要一个 Avatar 验证完整流程：打开 `Assets/SensaAvatarLab/Generated/FullFlow.unity`，按 [FullFlow 使用步骤](FULL-FLOW.md)操作。** 已组合入门接收器、原生 SPS、定位、可抓 PB 与默认关闭的 Shader 合成码实验。原来的分项场景用于排错。

FullFlow 新增 **Sensa Test Props**：Socket、PB 参考架和 Shader 架都可切换原位、左手、右手、世界固定；棒棒糖沿用自己的左右手/Fixed 菜单。目标带名称、轴向和同色探针标记，可统一隐藏。生成新 FullFlow 时自动配置；已有场景使用 **Upgrade FullFlow hand and world controls**。标记文字烘焙为静态网格，避免被 VRChat 移除。

**新用户链路使用 `Assets/SensaAvatarLab/Capabilities/QuickStart.unity`。** 它是 Chocolat 加一个 Quick Start World Receiver，无 SPS/PB/Shader 夹具；适配测试世界出生点旁 START HERE。步骤见 [OSR 首次使用](https://github.com/SeaLoong/Sensa/blob/main/docs/quick-start.md)。

生成入口 **Tools → Sensa Avatar Lab → Create first-run avatar**；验证入口 **Validate first-run avatar**；离线上传包构建入口 **Build Quick Start with SDK (no upload)**。生成报告 `Validation/quick-start-avatar.json`，确认两个本地、非保存、默认 0 的参数和右手接收器。已有场景不会被覆盖。SDK 构建并不等于已经上传或验证真实 OSC/硬件。

Contact、PB、SPS 与 Shader 的独立/组合场景见[能力矩阵](CAPABILITIES.md)，优先按该文档逐项测试。原 Exclusive/Shared 保留作完整组合对照。

为独立 Avatars 项目生成两套 Chocolat 测试场景，使用现成的 SPS 棒棒糖道具、两个可见 Socket 标记和 Sensa 自动配置。工具不上传 Avatar，也不包含模型或付费资源。

## 准备

1. 使用 Unity 2022.3.22f1 与 Avatars SDK；安装 VRCFury、Modular Avatar/NDMF、lilToon，以及 SPS 道具需要的着色器。
2. 自行导入已获得授权的 Chocolat 1.02 与 SPS_Lollipop。当前场景模板读取 `Assets/Amatousagi/Chocolat/Chocolat.prefab` 和 `Assets/SeaLoong/SPS_Lollipop/SPS_Lollipop.prefab`。
3. 关闭 Unity，在 Sensa 仓库运行 `python scripts/install-avatar-lab.py "你的 Avatar 项目" --tests`，然后重新打开项目。
4. 选择 **Tools → Sensa Avatar Lab → Create authoring scenes**。已有场景不会被覆盖。

本机项目为 `D:/VRChatProjects/Sensa Test Avatar`，采用本地 Git。不要将模型、纹理或该项目推送到 Sensa 的公开仓库。

## 两套场景

| 场景 | 用途 |
| --- | --- |
| `Assets/SensaAvatarLab/Generated/Exclusive.unity` | 独占选择、Socket 根部与配对姿态、Plug 本地点与 PB 手柄 |
| `Assets/SensaAvatarLab/Generated/Shared.unity` | 两个 Socket 共享根部接收器阵列；不生成配对 Socket 阵列 |

左手与左前臂的蓝色框标出 Socket；棒棒糖保留原道具菜单及手部绑定。另有独立 PB 把手。SPS 菜单、道具开关和 Sensa 测量选择是独立控制，Sensa 选择默认 Off。测量自己的棒棒糖时选择 Plug；仅观察外部目标根部时选择 Socket。配对姿态需对端匹配的 `LabPair` 标记。

独立 `LabHandle` 不受目标选择菜单控制；抓住它即可观察自己的四路坐标，松手会使 PB 映射门控失效。棒棒糖自身默认关闭，需要先在道具菜单启用。

安装 Gesture Manager 的项目会自动在场景中放置模拟器。进入 Play Mode，选中 GestureManager，在 Inspector 中操作道具/SPS/Sensa 菜单。它便于检查开关和动画；真实远端玩家接触、OSC 导出和 VR 抓取仍需要客户端测试。已有场景可通过 **Add emulator to existing scenes** 补上模拟器。

## 验证

- **Validate full build callbacks**：克隆作者模型，执行 SDK 完整预处理回调，检查 NDMF/VRCFury/Sensa 合并后的 Contact、参数、Shader 和组件。不会把烘焙副本覆盖回作者场景。
- **Build Exclusive with SDK (no upload)**：使用 SDK 公共 Build API 生成本地 `.vrca`，不调用上传 API。需要打开 SDK 面板；构建失败看 `Validation/sdk-build-error.txt`。
- Unity Test Runner 的 EditMode 测试用于包内几何、共享、NDMF 和 GPU 探针回归。

结果在项目 `Validation/`，本地构建包在 `Builds/`。预处理通过、SDK 打包通过、真实 VRChat/OSC 测试是不同层次；报告不能代替客户端实测。运行自动检查时不要连接真实输出设备。

命令行首次运行应先用 `-executeMethod SensaAvatarLab.AvatarLab.Warmup`（不加 `-quit`）等待 VRCFury 临时包初始化。`ValidateBuilds` 为同步检查，可加 `-quit`；`BuildWithSdk` 为异步构建，会自行退出，不加 `-quit`。安装了 Editor Toolbox 2.0.2 时，工具只在 batch 模式跳过其依赖可见工具栏的更新回调。

包测试使用 `-runTests -testPlatform EditMode -testFilter UnityBox.Sensa.Tests -executeMethod SensaAvatarLab.AvatarLab.PrepareTests -testResults Validation/unity-tests.xml`；不加 `-quit`，由 Test Runner 完成后退出。

上传前登录 SDK，并保持 Avatar 为 **Private**。对应测试 World 也只允许私人测试，不公开、不发布到 Community Labs。
