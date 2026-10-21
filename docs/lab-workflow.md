# 内部实验室工作流

**简体中文** | [English](lab-workflow.en.md)

Avatar／World Lab 用于开发场景和核对测量行为。日常接入可先选[OGB、固定 SPS 根点或 Shader](usage-scenarios.md)。使用自己的 Unity 工程和授权资源，通过 SDK 构建与私有上传。初始保持输入关闭、输出为空。

## 准备和入口

| 工程／应用 | 入口 |
| --- | --- |
| Avatar | `Assets/SensaAvatarLab/Generated/FullFlow.unity`，SDK 私有上传 |
| World | `Assets/SensaLab/Functional/FunctionalLab.unity`，SDK Build & Test／私有上传 |
| VRChat | 穿戴对应 Avatar，确认 OSC／Contacts 与所需自身交互权限 |
| Sensa | 检查实际 OSC 监听与来源；默认 9001 |

FullFlow 已包含内部 QuickStart 与实验组件，不重复添加。道具位置、SPS 启用、测量选择和设备许可是独立状态。[道具菜单](lab-interaction.md)

## 一次只验证一个问题

| 阶段 | 要观察的内容 | 验证方式 |
| --- | --- | --- |
| 合成标量 | START HERE 五档／STOP、手腕 QuickStart 的参数和控制条件 | 比较各档数值，确认 STOP 与条件关闭后的停止 |
| 原生 PB | Stretch 拉伸值与 IsGrabbed 抓取状态 | 抓取后拉伸，松手确认动作停止 |
| OGB / SPS | SPS2 · PenOthersNewRoot / PenOthersNewTip，或 SPS1 · PenOthers / PenOthersClose | 固定对象与来源，先分开再靠近，检查深浅趋势和 Close 接近状态 |
| 固定根点 | 专用根、P0–P3、变化 Sample 和两端校准 | 沿单轴移动，检查局部坐标方向及样本失效后的停止 |
| Shader | 原生图块、捕获区域、对象 ID、CRC 与推进 Frame | 移动所选根，检查解码位置；遮住或冻结图块，检查失效 |

合成阶梯按实际参数**手动配置** Depth／GateEnable。完成实验后，将这些路径和条件替换为实际联动参数。PB 模板中的 MyPB 使用 Avatar 上的 PhysBone 前缀。

OGB 使用深度或振动模板；根据 Avatar 设置开启发往 VRChat 接收端的 OGB 心跳。固定根通过 Dedicated／Exclusive 生成，使用 `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}` 五字段。

原生 Shader 是单 Camera、真实 CPU 根与非零 ID，经明确 ROI 发 `Sensa/Shader/<id>`。FullFlow 合成码和 Editor Model Probe PNG 使用 `Sensa/Diagnostics/Shader/0` 检查编码、捕获和传输。[Shader 指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)

## 换场景与时间检查

关闭输入，清理上一组映射／门控，保存，核对实际模式、来源、有效性，再明确启用。分别核对以下采样时间规则：

- 旧 Point／Handle／Pose 检查最旧参与通道，Handle 包括抓取。
- 固定 SPS 检查变化 Sample，默认 1000 ms、上限 1250 ms；静止 P 可缓存。
- Shader 桥默认 350 ms 冻结，桌面 Frame 变化上限 500 ms。

`tools/unity-world-lab/sensa-preview.json` 为内部预览配置了 500 ms。检查时同时记录样本变化时间、几何残差和实际设备行程。[定位条件](positioning.md)

## 世界交互与语言

08 MY AVATAR SPS 的琥珀 WORLD PLUG 可接近自己的 Socket，蓝框 WORLD SOCKET 接收自己的 Plug。World Contact 可能触发 Self／Others；世界 Expected／图条显示几何预期；将它与 Sensa 中实际收到的参数对照检查。

世界文字使用 VRChat 当前语言，并响应语言变化；本地面板可在 Auto／English／简体中文之间切换，明确选择仅对当前玩家会话生效。已有场景需刷新显示语言，上传客户端的字体和布局仍需手动检查。Avatar 菜单文字是构建时语言，不会逐玩家自动翻译。[语言边界](languages.md)

## 证据记录

记录提交、Unity／SDK／客户端版本、对象／来源、真实路径、变化年龄、停止行为及是否使用模拟。按 Editor、SDK bundle、ClientSim 和实际客户端分别记录结果，便于追踪 Contacts／OSC、抓取、捕获、精度和设备动作在哪一步发生变化。

CI 运行单元、浏览器 E2E 与隔离进程检查；开发者按验证目标安排 Unity／World PlayMode 和实际客户端检查。设备相关自动检查使用模拟传输。[开发与发布](development.md) · [Avatar 工具](../tools/unity-avatar-lab/README.zh-CN.md) · [World 工具](../tools/unity-world-lab/README.zh-CN.md)
