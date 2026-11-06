# 按使用目标选择方案

**简体中文** | [English](usage-scenarios.en.md)

选择驱动设备的来源：**VRChat／SPS／OGB 交互**、**funscript 播放**、**手动控制**，或其他应用的指令。[操作引导](quick-start.md)会连接第一个输出并准备输入。[设备与连接](devices.md)说明 OSR／TCode 与 Intiface 的选择。

## 播放 funscript 或手动控制

在**操作引导**中选择对应场景，或使用场景快捷入口。播放文件时，打开**控制 → 脚本**，选择脚本并应用输入方式，打开**输入启用**后点击**播放**。使用滑条时，选择**手动**，使用与设备匹配的动作轴；位置往复动作使用 L0，默认 Intiface 振动来源使用 V0。[浏览器、来源轴与播放器步骤](websensa.md#手动控制与脚本)

## VRChat 参数与定位

实时接收 VRChat OSC 使用桌面版。Avatar 已有 SPS／OGB 时，先使用下面的公开接触参数，无需添加 Sensa 自定义定位组件。

## 已有 OGB / SPS

1. 在 VRChat 启用 OSC。选择**VRChat / SPS 联动**场景，或打开 **OSC** 查看收到的参数。Sensa 常用接收端口为 **9001**，以实际监听地址为准。
2. 需要时，在 OSC 设置中展开 **OGB 参数启用**，打开**向 VRChat 启用 OGB 参数**并保存。VRChat 接收端口通常为 **9000**。
3. 打开**场景预设 → VRChat / OSC 映射**，选择 **OGB / SPS · 深度**控制 L0，或 **OGB / SPS · 振动**控制 V0。**追加到映射草稿**保留现有映射，**替换映射草稿**替换现有映射。在**OSC → 映射**中选择要使用的对象／来源，检查预览并校准量程与方向，再点击**保存更改**。
4. 需要时将输入方式应用为 **OSC**。确认输出已启用，使用向导时完成检查，再打开**输入启用**，先做一次小幅交互并观察响应。

SPS2／SPS3 公开 Root／Tip 参数配对估计深度趋势。先分开物体，再沿预期方向靠近，让学习过程收集样本。SPS1 使用深度与附近区域读数。所选预设会说明所需通道，[SPS3 指南](sps3.md)介绍公开通道设置。[预设步骤](presets.md) · [OGB 参数含义与限制](ogb-compatibility.md)

## Contact 直接定位（SDK Beta）

适合需要米制根点位置与相对速度的 Avatar 作者。需要支持高级 Proximity 的 SDK 与 Sensa Contact 组件。[Contact 设置](contact-sdk.md) · [校准](positioning.md)

## SPS 四点定位

适合需要测量 SPS Socket／Plug 根点相对 Avatar 位置的作者。添加 Unity 定位组件，检查共同检测区域，再到 Sensa 校准。[Unity 设置](../unity/top.sealoong.sensa/README.zh-CN.md) · [位置、缩放与采样条件](positioning.md)

## Shader 根编码与区域捕获

通过读取 Avatar 画面中的编码图块，测量根点位置、方向轴与缩放。这是需要 PC 画面的实验方案。[捕获设置](../unity/top.sealoong.sensa/GPU-TRACKING.md) · [技术参考](shader-capture-research.md)

## 让参考平面跟随身体动作

相对手掌、胸部等不断变化的身体朝向测量动作，需要定位标记与跟随参考平面。[Unity 设置](unity-build.md#创建随骨骼移动的参考平面) · [计算示例](computed-signals.md#让平面跟随-avatar-动作)

这些空间方案需要先检查有效读数、校准并启用实验定位，再启用当前输入。[参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)可以直观看懂几何关系。

## 其他输入与工具

- 网站／播放器 → OSR：[协议输入与桥工具](protocol-inputs.md)。
- 多个输入、平滑或多个输出：[信号流程](signal-pipeline.md)。
- 将交互保存为 funscript：[录制与回放](signal-pipeline.md#录制与观察)。
- PhysBone、OSC 发现或自定义映射：[预设](presets.md)与 [OSC 参数字典](osc-parameters.md)。

[全部指南](start.md) · [工作台地图](guide.md) · [功能参考](features.md)
