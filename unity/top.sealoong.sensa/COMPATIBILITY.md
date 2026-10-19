# 依赖、尺度与可观测性

**简体中文** | [English](COMPATIBILITY.en.md)

Sensa SPS 只支持当前固定四锚点、专用本地根标记与五字段协议。它估计所选根点的 AvatarRootLocal 坐标，不兼容任何旧 Sensa SPS 数据，不提供任意远端 Avatar、世界位置或 GPU 网格跟踪。

## 依赖与互通

使用 Avatars 工程及 `package.json` 声明的依赖。已有 VRCFury SPS 目标须先正常配置；不支持的上游几何 API 明确失败，不按名称猜测位置，也不修改 VRCFury 源码。OGB 的外部路径和 Touch／Depth 能力独立于本包协议，仍保留互通。[OGB 研究](https://github.com/SeaLoong/Sensa/blob/main/docs/ogb-compatibility.md)

Contact 写入的是实际 FX Animator 参数，不要求全部登记为表达参数。RawP 只在 FX 中声明；测量字段 P0–P3 与 Sample 加入本地、不同步的公开表达参数。Exclusive 另有菜单控制 Int `Sensa/Select/<group>`，默认 0（Off），1…N 选择已排序目标；不同步、不保存，也可能被 OSC 导出。Dedicated 不生成此自动选择参数。真实 OSC 导出仍取决于客户端配置。[VRChat Contacts](https://creators.vrchat.com/common-components/contacts/)、[OSC 参数](https://docs.vrchat.com/docs/osc-avatar-parameters)

## 能力边界

| 输入 | 提供 | 不提供 |
| --- | --- | --- |
| Sensa SPS 四 P＋变化 Sample | 已选本地根点的 AvatarRootLocal XYZ／Distance | 世界运动、尖端、朝向、扭转、GPU 表面及原子帧 |
| 独立 Root／Tip／Side Pose | 已知配对参考下的直线姿态实验 | 混合 Sender 排除、完整 GPU 曲线 |
| OGB NewRoot／NewTip | 根同心球的长度／径向估算 | 两个独立端点或唯一方向 |
| 原生 PB Stretch／IsGrabbed | 拉伸强度及抓取门控 | XYZ／朝向 |
| Shader 根点捕获 | 独立生产端的根坐标编码 | Contact 通过即可证明其真实渲染正确 |

四个已知非共面锚点对同一点的真实距离足以确定局部 XYZ。共同刚体移动不改变这些距离，不能恢复 Avatar 的世界平移或旋转。坐标是头像根局部单位，不是任意缩放下的米；显示边界也不等于四球全覆盖。

## 半径与尺度

固定 Receiver 半径 2.5、Sender 半径 0.001。在未饱和且共同均匀缩放时，接近度满足 `p=1-(d-r)/R`，所以 `d=(1-p)R+r`；共同尺度相消。非均匀尺度或 SDK 半径限幅会破坏该模型。

VRChat 对缩放后的半径设 3 m 上限。构建拒绝非正、非均匀或过大头像根尺度，以及根 ScaleConstraint／根缩放动画。FX 内部使用 IsLocal、ScaleFactor 与选择状态，在约 2.999 m 半径限内允许活动；失效清零 Sample 和范围。目标标记跟随位置／旋转，不继承骨骼缩放。

保留当前几何，不凭未测噪声改变半径或添加滤波。较小 R 可降低同一 Proximity 误差对应的位置误差，却缩小覆盖；更宽锚点可改善远离中心的条件数，却缩小共同覆盖。低残差不是精度保证。过滤位置不能延迟 Sample=0、超时或门控停止。

## Sample 与失败关闭

公开前缀为 `Sensa/SPS/<id>`，仅 P0–P3 和 Sample。0 表示生产端未允许；n/32（n=1…32）活动值仍需几何检查。每步约 50 ms，1.6 s 循环；桌面按 Sample 的内容变化判断活性，上限 1250 ms，缺字段、非有限值、错误计数、饱和、拟合不一致或过期都不能驱动输出。

不生成 Others 或共享移动根阵列。独有 tag 与 Self 过滤缩小混合目标风险，但不是密码学身份认证。Sample 最后发布也不构成原子 OSC 包：时序差异、丢包、重复或乱序仍可能混合数据。显式实验许可仍是必要条件。

Point／Handle／Pose 是独立实验，继续按最旧参与通道判断，不把 Sample 当作它们的有效性证明。旧 Sensa SPS 配置不转换；重新构建 Avatar 并保存新映射。

## 验证范围

单元与 EditMode 检查生成坐标、内部可写参数、公开字段、菜单、缩放守卫和预算，不能替代客户端上传、真实 OSC、VR 抓取、GPU／头显、其他 Avatar 或硬件验收。世界 Udon 真值和合成图像回放不自动成为真实 Avatar 捕获证据。

[安装](README.md) · [自动配置](AUTOMATION.md) · [Shader 独立验收](GPU-TRACKING.md) · [定位说明](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.md)
