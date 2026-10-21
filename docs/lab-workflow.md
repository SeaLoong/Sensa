# 内部实验室工作流

**简体中文** | [English](lab-workflow.en.md)

Avatar／World Lab 是开发与验证工具，不是公开安装路线。实际使用先选[OGB、固定 SPS 根点或 Shader](usage-scenarios.md)。仓库不附付费模型、不提供公共世界、不自动上传；使用自己的工程与授权资源，初始保持输入关闭、输出为空。

## 准备和入口

| 工程／应用 | 入口 |
| --- | --- |
| Avatar | `Assets/SensaAvatarLab/Generated/FullFlow.unity`，SDK 私有上传 |
| World | `Assets/SensaLab/Functional/FunctionalLab.unity`，SDK Build & Test／私有上传 |
| VRChat | 穿戴对应 Avatar，确认 OSC／Contacts 与所需自身交互权限 |
| Sensa | 检查实际 OSC 监听与来源；默认 9001 |

FullFlow 已包含内部 QuickStart 与实验组件，不重复添加。道具位置、SPS 启用、测量选择和设备许可是独立状态。[道具菜单](lab-interaction.md)

## 一次只验证一个问题

| 阶段 | 要观察的事实 | 不能推导 |
| --- | --- | --- |
| 合成标量 | START HERE 五档／STOP、手腕 QuickStart 的实际参数和门控 | 正式 SPS／位置精度 |
| 原生 PB | 实际 Stretch／IsGrabbed，松手关门 | Contact XYZ |
| OGB / SPS | 实际对象、来源、Root／Tip 或旧近接及 Close | 任意姿态的准确插入深度 |
| 固定根点 | 专用根、P0–P3、变化 Sample、两端校准和失效停止 | 同帧／世界坐标 |
| Shader | 实际 native 图块／ROI／ID／CRC／推进 Frame | 合成码等于生产捕获 |

合成阶梯按实际参数**手动配置** Depth／GateEnable；没有“链路测试”或 QuickStart 内置预设。不要把它的 Active 门控留到正式映射。PB 模板的 MyPB 要换真实前缀，不再使用 `Sensa/Lab/PB` 占位说法。

OGB 使用深度／振动统一模板，不按 Socket／Plug 再拆预设；需要时明确开启到 VRChat 接收端的 OGB 心跳。固定根通过 Dedicated／Exclusive 生成，协议只有 `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`；旧独立 Point／Pose 不是其前置条件。

原生 Shader 是单 Camera、真实 CPU 根与非零 ID，经明确 ROI 发 `Sensa/Shader/<id>`。FullFlow 合成码、Editor Model Probe PNG 仅走 `Sensa/Diagnostics/Shader/0` 的传输诊断，不生成位置输入。[Shader 指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)

## 换场景与时间检查

关闭输入，清理上一组映射／门控，保存，核对实际模式、来源、有效性，再明确启用。不要把全部空间数据统一成“最旧一秒”：

- 旧 Point／Handle／Pose 检查最旧参与通道，Handle 包括抓取。
- 固定 SPS 检查变化 Sample，默认 1000 ms、上限 1250 ms；静止 P 可缓存。
- Shader 桥默认 350 ms 冻结，桌面 Frame 变化上限 500 ms。

`tools/unity-world-lab/sensa-preview.json` 的 500 ms 是内部预览的明确配置，不是所有路线默认值。低残差不证明共同 Sender、同帧或正确设备行程。[定位条件](positioning.md)

## 世界交互与语言

08 MY AVATAR SPS 的琥珀 WORLD PLUG 可接近自己的 Socket，蓝框 WORLD SOCKET 接收自己的 Plug。World Contact 可能触发 Self／Others；世界 Expected／图条是几何预期，不是 Avatar OSC 回执，以 Sensa 实际参数为准。

世界文字使用 VRChat 当前语言，并响应语言变化；本地面板可在 Auto／English／简体中文之间切换，明确选择仅对当前玩家会话生效。已有场景需刷新显示语言，上传客户端的字体和布局仍需手动检查。Avatar 菜单文字是构建时语言，不会逐玩家自动翻译。[语言边界](languages.md)

## 证据记录

记录提交、Unity／SDK／客户端版本、对象／来源、真实路径、变化年龄、停止行为及是否使用模拟。Editor、SDK bundle、ClientSim 只证明各自边界；真实上传、Contacts／OSC、VR 抓取、桌面／HMD 图块、准确度和机械动作分别验收。

CI 运行单元、浏览器 E2E 与隔离进程检查，不代替实验室的 Unity／World PlayMode 和实际客户端检查。后者由开发者按需另行安排，设备相关自动检查使用模拟传输。[开发与发布](development.md) · [Avatar 工具](../tools/unity-avatar-lab/README.zh-CN.md) · [World 工具](../tools/unity-world-lab/README.zh-CN.md)
