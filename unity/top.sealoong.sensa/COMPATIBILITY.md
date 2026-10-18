# 依赖与可观测性边界

**简体中文** | [English](COMPATIBILITY.en.md)

默认根部方案改为固定 Avatar 根参考框、专用小球和四路 Self 距离。它能在已知几何及有效生产端条件下估计**所选根点的 AvatarRootLocal 坐标**；不是任意远端 Avatar、世界位置或 GPU 网格跟踪。桌面实验空间输入仍默认关闭。

## 依赖与上游互通

使用 VCC／ALCOM 的 Avatars 工程及其锁定的 Unity、VRChat SDK、Modular Avatar 和 NDMF；精确依赖见 `package.json`。SPS 作者目标另需正确安装 VRCFury。手动解压不会安装缺失依赖。生成器须把 Contact／PB 参数写入实际 FX Animator，只有表达参数名字不足以驱动参数。

主要目标是 PC Avatar。SPS 形变正常不代表 OGB Haptics 已启用或存在目标参数；已有 OGB 数据可以不安装本包，直接使用桌面统一入口。现代 Socket、旧单接近值与 Plug 的能力不同，OGB_ENABLED 控制也有单独前提。[OGB 兼容研究](https://github.com/SeaLoong/Sensa/blob/main/docs/ogb-compatibility.md)、[VRCFury SPS](https://vrcfury.com/sps/)。

固定根作者通过上游作者几何或明确原生 Contact 的 Root Transform 选择 CPU 根中心。上游几何 API 不受支持时显式失败，不按名称猜位置；不修改 VRCFury 源码或反推出 Shader 形变。不能仅按 TPS／DPS／SPS 版本名承诺所有 Avatar 或 Quest 可测。

## 信息与能力

| 可用信息 | 可以得到 | 仍缺少 |
| --- | --- | --- |
| 新固定四锚点＋专用 Self 根球＋Profile／Valid／Scale／Heartbeat | 所选根点在固定 Avatar 根参考框中的 XYZ／Distance | 世界运动、尖端、朝向、扭转、GPU 表面；原子数据帧 |
| 固定根 Others 诊断 | 检查接收链路，Valid 始终为零 | 唯一远端身份；输出许可 |
| 旧 SharedRoot 移动八阵列 | 相对移动参考框的候选球心诊断 | 固定坐标、运动映射和共同 Sender 身份 |
| Root／Tip／Side | 在可信同帧点假设下的直线姿态实验 | 混合 Sender 排除、GPU 曲线和真实扭转 |
| OGB NewRoot／NewTip | 根部同心球的长度／径向估算 | 两个独立端点和唯一方向 |
| 原生 PB Stretch／IsGrabbed | 拉伸强度及抓取门控 | XYZ 和朝向 |

固定四锚点是在**已知参考坐标系中**定位一个点。Avatar 整体的刚体移动会同时移动参考框，不能从相对距离恢复世界平移或旋转。AvatarRootLocal 是局部单位；仅当作者根缩放与 ScaleFactor 都为 1 时才等于世界米。±1.5 的显示范围也不保证全体积都在四个 Receiver 的共同有效区域内。

## 几何、缩放与身份

四个非共面锚点对同一个点的真实距离足以唯一确定相对 XYZ。新方案不再让接收器跟随 Socket，也不使用多个对方标准 Root 球拼成一个点。它增加一个独有通道的 Self 标记，固定接收框并使用已知 0.001 半径；默认每目标五个 Contacts。构建检查通道／实例重复和最终预算。

Receiver 半径为 2.5 个 Avatar 根局部单位。作者根应正值均匀缩放；运行时守卫限制世界半径低于约 2.999 m，避免超过 VRChat 3 m 上限。过大 ScaleFactor 使 Contacts 停用、Valid 与范围归零。已知根缩放动画或 Avatar 根 ScaleConstraint 在构建时拒绝，因为 ScaleFactor 不能描述任意自定义根缩放。[VRChat Contacts](https://creators.vrchat.com/common-components/contacts/)。

专用 Self 通道减少普通多 Sender 混拼，但仍依赖正确作者和实际生成结果。官方 Proximity 每个 Receiver 选择自己的最近 Sender；为其他 Avatar 开启 Others 或复用通道后，四点／八点都不能证明它们来自同一个对象。旧标准根八路数据缺少新 Profile 时不会升级成固定根坐标；SharedRootArray 仍只做旧式诊断。

## 心跳与失败关闭

新路径的 `Profile=1`、`Valid`、`Scale`、`Heartbeat` 位于 `Sensa/SpsRoot/v1/<实例>/Self/`，四路范围在 `Root/A0..A3`。缺配置、缺范围、饱和、错误 Profile、无效缩放许可或心跳过期均不提供可映射根点。Others 的 Valid=0；桌面仅允许唯一有效的 Self 点并要求显式实验许可。

生产端约每 0.05 秒复制 Raw 范围并推进 32 步 i/31 心跳计数（约 1.6 秒循环），允许静止参数保持缓存；桌面默认心跳时效为 1 秒，协议上限 1.25 秒。**这不是同批坐标或 frameId**，不能证明每个 UDP 范围包都到达、未乱序或同一物理时刻采样。普通 Point／Handle／Pose 使用最旧参与通道时效，不套用这个生产端心跳放宽规则。

低残差和两点校准只是模型一致性与映射证据。可靠的更强链路仍需可信生产者、明确目标／参考／标定、同批 XYZ、frameId、valid 和存活检查；当前固定 Contact 协议不能冒充该链路。

## 验证范围

静态、合成解算与 Unity EditMode 可以检查导入、生成几何、参数、菜单、缩放守卫和预算；不能替代上传后客户端 OSC、真实 VR 抓取、多 Avatar 混合、GPU／头显或用户硬件验收。先保持设备输入关闭，观察实际参数与诊断，再在明确限位下验收；报告所用 Avatar、缩放、客户端与实际数据。

Shader 捕获属于独立数据通路，不能由 Contact 拟合通过推导其画面或导出正确；按 [Shader 指南](GPU-TRACKING.md) 单独检查。

[安装](README.md) · [自动配置与路径](AUTOMATION.md) · [定位说明](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.md)
