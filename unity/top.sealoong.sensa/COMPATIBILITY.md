# 依赖与可观测性边界

**简体中文** | [English](COMPATIBILITY.en.md)

Sensa 的 Contact 阵列是实验估计器，不是通用远端定位系统。当前桌面默认关闭空间输入；标准 Root／SharedRoot 一直只做诊断。[完整定位说明](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.md)

## 依赖

使用 VCC／ALCOM 管理的 Avatars 工程，按项目锁定的 Unity、VRChat SDK、Modular Avatar 和 NDMF 版本安装；精确声明见 `package.json`。SPS 另外需要正确安装的 VRCFury。手动复制包不会安装缺失的 VPM 依赖。新 Contact／PB 参数还必须由生成器写入实际 Animator，不能只登记到表达参数清单。

主要目标为 PC Avatar。SPS Shader 正常形变不证明存在需要的 Root Contacts，不能据版本名承诺所有旧 TPS／DPS／SPS 或 Quest 都可测。需要同意交互、启用 Sender 和实际 OSC 参数；查看接收值，而非仅观察形变。[VRCFury SPS 说明](https://vrcfury.com/sps/)

## 能力由信息决定

| 可用信息 | 能做什么 | 无法据此保证 |
| --- | --- | --- |
| 标准小球 Root | 在球模型假设下拟合候选根部位置 | 同一个人、真实尖端、朝向、扭转、准确插入比例 |
| Root／Tip／Side 标记 | 在三个可信同帧点假设下估计直线姿态 | 混合 Sender 排除、GPU 曲线表面 |
| OGB NewRoot／NewTip | 同心球的长度／径向估算 | 两个独立端点或唯一方向 |
| 只有近接标量／旧灯光 | 根据实际生成器解释标量 | 通用单侧 XYZ |
| 原生 PB Stretch／IsGrabbed | 拉伸标量及抓取门控 | 位置／朝向 |

现代 VRCFury 的“NewTip”长度球仍以根部为中心。旋转轴线不会改变同心球距离；额外 Receiver 不能补出缺失朝向。实际路径见[预设指南](https://github.com/SeaLoong/Sensa/blob/main/docs/presets.md)，不要套用旧身体部位／角度／反向模板。

## Contact 阵列条件

探针须具有正确尺寸、参考框和正值均匀缩放，命名唯一，预算包含全部插件。近接饱和、缺路、错误半径或混合来源都会使拟合无效；即使残差为零，也可能是多 Sender 鬼点。官方 Proximity 每路选择最近匹配 Contact，并不提供共同目标身份。[VRChat Contacts](https://creators.vrchat.com/common-components/contacts/)

Root 通常是八路；Point／Handle 是四路；Pose 是三组八路。四个非共面锚点的同点真实距离足够相对 XYZ，当前短板是测量语义与同步，不能用八点替代身份协议。输出使用最旧通道时效、默认 1 秒；增量 OSC 静止值可能过期。

## 研究路线

可靠后续方案应从可信生产者的同批 XYZ、明确目标／参考／标定、frameId、valid 和存活检查开始，当前未实现。拟合 Capsule 或短基线 Root／Front 仍存在退化、噪声、扭转和混合目标问题；不作为已支持功能。Shader 模型快照也是独立实验，尚无通用实时客户端表面跟踪链。

Editor 合成／构建检查不能替代上传后 VRChat、真实 VR 抓取、GPU／头显或设备验收。先不接设备记录数据，结果以实际环境报告为准。

[安装](README.md) · [自动配置](AUTOMATION.md) · [Shader 实验](GPU-TRACKING.md)
