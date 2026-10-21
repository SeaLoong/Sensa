# 依赖与测量边界

**简体中文** | [English](COMPATIBILITY.en.md)

采用 `package.json` 的依赖，另行配置官方 VRCFury SPS。不支持的几何 API 会明确失败，不猜测摆放、不修改上游源码。外部 OGB 互通与 Sensa 不兼容旧版的内部 SPS 协议是两件事。

## 各路线能观测什么

| 输入 | 提供 | 不能证明 |
| --- | --- | --- |
| 固定 P0–P3 与变化 Sample | 所选单根的 AvatarRootLocal 坐标 | 世界运动、方向、扭转、尖端或 GPU 表面 |
| 配对 Root／Tip／Side Pose | 已知配对框架内的直线姿态实验 | 唯一 Sender 身份或完整弯曲网格 |
| OGB NewRoot／NewTip | 根球长度／径向估计 | 两个独立测得的端点 |
| 原生 PB Stretch／IsGrabbed | 拉伸强度与抓取门控 | XYZ 或姿态 |
| 原生 Shader 根点 | 根 Transform 编码，独立渲染／桥接 | Contact 测试通过不等于真实客户端采集通过 |

四个已知非共面锚点到同一点的真实距离可确定局部位置；共同刚体运动不改变距离。坐标是局部单位，不是任意缩放下的世界米。±2 显示方框不保证共享接收范围。

## 半径与缩放

球形近接未饱和且使用共同均匀缩放时，`p=1−(d−r)/R`，所以 `d=(1−p)R+r`；在局部单位中共同缩放消去。此处 R=2、r=0.001。非均匀缩放或 SDK 半径截断会破坏模型。

VRChat 限制缩放后的世界半径为 3 米。构建拒绝无效根缩放及已知根缩放动画／约束；内部 IsLocal／ScaleFactor／选择门禁在无效时清零 P／Sample，使 Receiver 保持在约 2.999 米内。标记不继承目标骨骼缩放。

接收半径减小可降低同等近接误差引起的坐标误差，但会失去覆盖；扩大锚距改善部分条件数，同时缩小共同覆盖。不把未经测量的滤波／半径修改称为精度改进。低残差只说明一致性；滤波不得延迟失效或停止门禁。[官方 Contact](https://creators.vrchat.com/common-components/contacts/)

## 参数与生命周期

测量契约只有 `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`，没有旧别名、移动共享阵列或 Others 分支。Float 测量字段是本地、不同步表达参数；RawP 留在内部 FX。Exclusive 另有不同步、不保存的 Int 菜单选择器，[完整含义](AUTOMATION.md)。

Sample=0、非法计数、缺失／非有限值、饱和、拟合不一致或过期均不能驱动动作。合法变化计数只证明发布活动，不证明 Contact 原子采样、UDP 无丢包或所有权。独有标签和 Self 过滤减少混杂，但不认证身份。

Point／Handle／Pose 仍用独立协议和最旧参与通道时效。旧 Sensa SPS 应重建头像与映射，不做转换。

## 语言与验收

编辑器语言仅改变呈现，偏好保存在用户设置而非 Avatar 数据。菜单注册路径、序列化字段、枚举值和 OSC 标识保留英文 ID。Avatar 菜单标题使用作者构建时语言，不是按客户端运行时翻译。

EditMode 检查生成几何、可写 FX、参数、菜单、缩放门禁和预算，不证明上传 OSC、VR 抓取、远端头像、桌面／HMD 渲染或硬件。世界 Transform 真值和合成回放不能代替实际 Avatar 捕获证据。

[安装](README.zh-CN.md) · [自动配置](AUTOMATION.md) · [Shader 验收](GPU-TRACKING.md) · [参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)
