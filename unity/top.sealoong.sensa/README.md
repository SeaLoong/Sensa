# Sensa Unity 资产

为 Avatar 添加额外的位置测量、配对姿态或可抓取 PB 手柄。只使用现有 SPS OSC 参数时，不必安装本包。

## 安装

1. 使用 VCC/ALCOM 打开 **Avatars** 项目，不要安装到 Worlds 项目。
2. 安装 VRChat Avatars SDK、Modular Avatar 及其 NDMF 依赖。使用 SPS 自动配置时，还需先装好 VRCFury 并配置原本的 SPS。
3. 解压 Sensa Unity ZIP，在 Package Manager 中选择 **Add package from disk**，指向其中的 `package.json`；也可选择本仓库的同名文件。
4. 选择 Avatar 根对象，添加 **Sensa → Automatic SPS Setup**。

当前验证环境和完整依赖说明见 [兼容性指南](COMPATIBILITY.md)。Unity 版本优先跟随 VCC 对该项目的要求。

## 选择你需要的功能

| 需求 | 配置 |
| --- | --- |
| 观察普通 SPS Plug 根部 | 选择自己的 Socket，开启 Socket Root Tracking；仅用于诊断 |
| 多个 Socket 轮流测量 | Exclusive；需要节省注册数量时可用 SharedRootArray，但只支持根部诊断 |
| 抓取手柄控制位移 | 选择 Plug，开启 Create Plug Grab Handles |
| 测自己 Plug 相对自己 Socket | Local Plug Tip Tracking，并指定 Local Reference Socket |
| 配对完整参考姿态 | Socket 开 Paired Socket Tracking；对端 Plug 开 Paired Plug Markers，Pair Channel 一致 |

默认扫描整个 Avatar。只使用部分目标时，关闭 Discover All，把对象放进 Selected Targets。点击“检查目标、自动位置与 Contact 开销”确认选择无误。

构建/上传时自动生成原生组件，不需要逐个摆放触点。进入 VRChat 后，Sensa 目标菜单默认 Off；选择所需目标，同时检查 SPS 自己的菜单。两者不会自动同步。

## 在 Sensa 中观察

开启 VRChat OSC，在 Sensa 应用 OSC 输入方式，先保持输入开关关闭。到“空间诊断”检查实例、来源和有效性。本地点/PB 可到“量程校准”采集两个端点；普通根部 XYZ 不是完整行程。

不依赖 SPS 的骨骼测量可使用 **Local Bone or PB Probe**：选择本地 Target 和 Reference，或开启 Create Grab Handle。每个探针使用唯一名称，整个测量层级保持正值均匀缩放。

[高级配置与原理](AUTOMATION.md) · [Shader 实验边界](GPU-TRACKING.md)
