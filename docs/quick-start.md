# 第一次使用

**简体中文** | [English](quick-start.en.md)

先验证软件链路，再接设备。Sensa 不刷写或校准固件；TCode 串口为 **115200、8N1**。需要能上传的 PC Avatar 和自己的测试世界；当前没有公共世界链接。已有 FullFlow 环境可参考[实验流程](lab-workflow.md)。

## 1. 启动 Sensa，保持输出为空

从 [Releases](https://github.com/SeaLoong/Sensa/releases) 下载对应系统和 CPU 的桌面包，完整解压后运行 `Sensa.exe` 或 `./Sensa`，打开 `http://127.0.0.1:5086`。无需另装 .NET。

先不添加设备。顶栏输入关闭，打开 OSC 页。

## 2. 准备 Avatar 与世界

1. 在 VCC 的 Avatars 项目安装 Modular Avatar／NDMF，将 Unity 包解压到 `Packages/top.sealoong.sensa`，目录内直接包含 `package.json`。
2. 在 Humanoid Avatar 根添加 **Sensa → Quick Start World Receiver**，通过 SDK 私有上传并穿戴新版 Avatar。它自动在右手骨骼原点生成 Depth 与 Active 接收器及 Animator 参数；无需 SPS、相机、Python 或其他玩家安装组件。
3. 打开世界工程的 `Assets/SensaLab/Functional/FunctionalLab.unity`，使用 SDK Build & Test 或自己的私有上传版本。出生点旁的 **00 START HERE** 是测试台。
4. VRChat 开启 OSC 和 Contacts。Sensa 默认接收 UDP 9001；避免其他程序占用同一端口。

QuickStart 只验证接收链路，不会把 Avatar 自动改造成 SPS Avatar。使用已生成的 `FullFlow.unity` 时已有组件，不要重复添加。

## 3. 核对实际参数

在控制页选择 OSC 并应用输入方式。在 OSC → 映射中用**链路测试**替换草稿，保存；只保留 Depth 和 Active 两条映射。保存后输入仍关闭。

参数页搜索 `Sensa/QuickStart`。测试台点击五档，再按 STOP：

| 操作 | Sensa 实际接收 |
| --- | --- |
| 0／25／50／75／100% | Active=1；Depth≈0／.25／.5／.75／1 |
| STOP | Active=0，门控关闭 |
| TOUCH | 右手腕靠近青色球时 Depth 增大 |

输出为空时，可以启用输入核对逻辑 L0 五档。TOUCH 对准的是右手骨骼原点，通常在手腕；桌面用户可直接点击阶梯按钮。RESET 会复位并停止；离台超过 3 米或 60 秒到期也会关闭测试。

世界的 Expected 只是预期值。必须与 Sensa 实际参数对照；世界显示变化不证明 Avatar 已生成组件或 OSC 已送达。

## 4. 接设备，仅测小行程

1. 关闭输入。设置中创建轴配置，选择 **OSR 首次测试 · L0 小行程**：仅 L0，逻辑 0–100% 对应 TCode 400–600，速度上限 100。先核对这些值符合自己的硬件标定。
2. 控制页添加串口输出，选择实际端口并绑定该配置；网络固件使用正确 UDP／TCP 目标。保存、启用并连接。
3. 检查实际模式与映射，启用输入，再点五档。发送目标应约为 **400、450、500、550、600**，取整可差 1。
4. 按世界 STOP，确认 Active=0；再关闭输入。卡片只显示目标，不证明机械到位；停止不等于回中或物理断电。

## 换成日常输入

停止输入，选择[当前五项预设](presets.md)之一，或添加实际参数。替换后保存；不要残留 QuickStart Active 门控。原生 SPS 需要实际启用 Haptics／OSC，部分 Avatar 还要求 `OGB_ENABLED=true`。VRCFury Socket 径向估算和 Plug 近接都不是任意姿态下的准确插入深度。

PB 拉伸可直接使用原生 Stretch＋IsGrabbed。Contact 位置估计默认关闭，不能把四个距离样本直接当可靠定位；见[定位原理与限制](positioning.md)。

## 无数据或不动

按顺序检查：新 Avatar 已穿戴 → VRChat OSC／Contacts 开启 → 实际模式为 OSC → 监听端口正确 → 使用来源正确 → 映射已保存 → 门控有效 → 输出已连接 → 输入已启用。

普通标量超时默认关闭，因 VRChat 静止时可能不重发。测试台的自动停止也依赖客户端发出 Active=0；结束后主动关闭输入。查看[使用指南](guide.md)排查传输与配置。

[首页](../README.md) · [世界工具](../tools/unity-world-lab/README.md) · [Avatar 工具](../tools/unity-avatar-lab/README.md)
