# Avatar 分项能力

**简体中文** | [English](CAPABILITIES.en.md)

综合交互使用 [FullFlow](FULL-FLOW.md)，隔离路线使用 `Assets/SensaAvatarLab/Capabilities/`。源码与生成菜单语言见 [README](README.zh-CN.md)。

| 场景 | 隔离内容 | 边界 |
| --- | --- | --- |
| Contact | 四路本地点 Point | 已知 fixture 几何，不证明远端身份 |
| PB | 原生 Stretch／IsGrabbed | 强度与门控，没有 XYZ |
| PBContact | PB 目标与 Point／Handle 采样 | 实验局部位置，仍需抓取／时效门控 |
| SPS | 原生 VRCFury Socket／Plug 与 OGB | 必须启用 OGB_ENABLED 和实际目标 |
| SPSContact | 原生 SPS 与 Sensa 测量 | SPS 四点定位／本地点／Pose 字段分离，不能混为一个阵列 |
| Shader | 合成编码与 CRC／冻结恢复 | 诊断传输，不是实际根点 |
| SPSShader | SPS 模型与编辑器采集相机 | Avatar 外部相机不上传 |

Contact／PB／参数数量以当前预处理报告为准，依赖版本和启用能力会影响总量。不能按 Exclusive 菜单当前选中数推算注册 Contact 开销。

## 参考操作

fixture 位置参数 `Sensa/Lab/Fixture`：0=基准、1=Near、2=Offset、3=Far outside。原生 SPS 与 Sensa 目标选择独立。特定同头像 SPS fixture 刻意禁用 Hip Avoidance，不改变无关原模型。

已知 20 cm Plug 的现代 Self Root／Tip 几何参考：Outside≈.77/.96，Near≈.89/1，Offset≈.875836/1。半径修正的径向估计约 40% 和 32.9%；饱和仍让最后一厘米不可观测。这是 fixture／模型参考，不是客户端精度实测。

PB 把手允许抓取，禁止碰撞和摆姿；可见球体不等于碰撞或测量半径。真实自身／他人权限与手部交互仍须客户端检查。

## 在 Sensa 观察

保持输入关闭、输出为空并应用 OSC 模式。原生 PB 使用实际 Stretch／IsGrabbed 路径。OGB 选择准确外部家族和来源，启用原生 haptics 参数，在未饱和位置学习配对长度。SPS 四点定位 只有 `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`，根观测需要校准和明确实验许可。

独立 Point／Handle／Pose 不继承 SPS 四点定位缓存或 Sample 语义。合成／编辑器图像只使用 `Sensa/Diagnostics/Shader/0/{Frame,X,Y,Z,Valid}`，不会变成可映射原生根。原生 `Sensa/Shader/<非零 ID>` 是独立[生产端与注册流程](../../unity/top.sealoong.sensa/GPU-TRACKING.md)。

检查实验头像时，应核对生成组件、可写参数、预算、Shader 和默认关闭状态。发布 CI 运行单元检查和浏览器 E2E；头像的 Unity 构建、EditMode 和客户端行为仍须另外检查。SDK 打包完成也不表示上传、VR 抓取、真实图像捕获或硬件行为已经验收。

[世界能力](../unity-world-lab/CAPABILITIES.md) · [几何图解](https://sealoong.github.io/Sensa/parameter-geometry.html)
