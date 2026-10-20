# 综合 Avatar fixture

**简体中文** | [English](FULL-FLOW.en.md)

打开 `Assets/SensaAvatarLab/Generated/FullFlow.unity`。它结合授权底模／道具、Sensa 测量、独立 PB 把手、合成传输 fixture 和可选渲染实验。上传保持 Private。[准备与语言](README.zh-CN.md)

## 先摆放，再测量

**Sensa Test Props** 集中 Home/reset、Left hand、Right hand、Place in world。先随手移动道具，放置后相对它移动；拾取／放置是本地、不保存状态。可见性只改辅助显示，不改变测量或输入许可。

原生 SPS／道具开关、**SPS OSC**（OGB_ENABLED）、**Measure plug／Measure this socket**、Shader 选择和桌面输入相互独立。菜单采用作者生成时语言，下文英文名用于标识对应 fixture 操作。

Socket 白色中心和 +Z 表示入口／向内方向；Root／Tip／Side 是配对参考标记。辅助 P1–P4、C1–C8 属于使用 A0 字段的独立 Point／Pose 实验，**不是**固定 SPS 的 P0–P3、TCode 辅助轴或 Contact 半径示意。固定根参数必须单独按其协议观察。

## 路线分开检查

Sensa 保持无输出、输入关闭；应用 OSC 模式、启用接收并观察实际参数。每次切换都替换完整映射草稿，不累计上项门控。

| 路线 | Avatar／世界操作 | 检查内容 |
| --- | --- | --- |
| PB | 放置参考架，抓白球、拉伸、松开 | 实际 Stretch 与 IsGrabbed 门控；标量 PB 不依赖 XYZ |
| 原生 SPS | 开启 SPS 与 OGB_ENABLED，移动已启用 Plug／Socket | 实际 Self／Others 路径；饱和前学习根／长度通道，再看径向估计 |
| 固定 SPS 根点 | 选择自己的根测量 | `Sensa/SPS/<id>/P0…P3` 与变化 `Sample`，Avatar 根局部坐标 |
| 独立本地点／Pose | 相对选中参考移动，或使用相同 LabPair 标记 | 独立实验估计、最旧通道时效，默认无动作许可 |
| 合成 Shader | 开启编码、破坏 CRC、冻结／关闭 | 诊断 Frame／XYZ／Valid 传输，不是 SPS 测量 |
| QuickStart | 使用实验室五档后 STOP | 仅合成 Depth／Active fixture；不要求或提供产品预设 |

原生 SPS 应固定实际实例／来源，不依据世界道具外观猜 Self／Others。世界 **08 MY AVATAR SPS** 提供琥珀色 Plug 和蓝色 Socket，但看板不证明 Avatar OSC 已接收。

固定 SPS 还需明确实验许可、两点校准和单独启用输入。单根不是姿态或直接设备行程。[当前包契约](../../unity/top.sealoong.sensa/AUTOMATION.md)

## Shader 与证据

FullFlow 可上传的 Shader fixture 默认关闭，产生合成 (.25,−.5,.75) 编码，不会变成实际 SPS 形变读取器。编辑器 GPU Model Probe 与组件包原生根 Transform 捕获是[不同路径](../../unity/top.sealoong.sensa/GPU-TRACKING.md)。

图像桥诊断命名空间不能校准原生根观测；CRC、前进帧和恢复验证传输。客户端相机保留、桌面 ROI、HMD 可见性及延迟仍需独立验收。

生成／升级命令保护已有资产。校验对克隆预处理，记录 Contact、FX 声明、菜单和默认关闭状态；明确的 SDK 构建仅生成本地包，不上传。读取实际修订的报告，不复制历史计数。

自动集成、PlayMode 和截图仅在 CI 执行。之后若手动试设备，应通过主 Sensa 指南确认真实校准、限位和停止；发送目标不是机械回读。不得把授权模型或独立工程资产提交到这里。
