# SPS 四点定位：依据与取舍

**简体中文** | [English](fixed-anchor-research.en.md)

四个固定锚点距离用于重建 Avatar 局部根位置。本页说明 SPS 四点定位的方程、接收覆盖与采样模型，包括当前半径 2 和各轴 ±0.35 偏移。先用覆盖模型选择布置，再在 Sensa 校准得到的位置。

操作看[方案](usage-scenarios.md)，接收条件看[定位](positioning.md)，逐字段规则看[字典](osc-parameters.md)。本页记录固定来源、数学推导和待实测假设；客户端精度需要通过已知轨迹测量并另行记录。

## 一手依据

[官方 Contacts](https://creators.vrchat.com/common-components/contacts/) 说明 Proximity 使用 Sender 最近点、多个 Sender 取最近者，并限制缩放后半径为 3 m。网页未给出线性方程；本次检查安装的 VRChat SDK 3.10.5 ContactManager／CollisionScene 实现，检查副本与包内 VRC.Dynamics.dll 的 SHA-256 相同：

`672093e0c2a52a035979f1ff66478389949f42ffcf7daba5edd8b8da718629a3`

由该实现推导，两个球的中心距离为 d 时：

```text
p = 1-clamp(max(0,d-r)/R,0,1)
d = R(1-p)+r    # only outside saturation
```

反解需要已知球形 Sender 的半径，并在距离中补回该半径。根位置解析参考固定版本的 VRCFury [Socket](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs)／[Plug baker](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs) 的作者局部姿态。Sensa 添加半径为 0.001 的专用小球，并使用独立 tag，使发送几何与解算公式对应。

## 四点代数

共享定义是 [SensaFixedAnchorProtocol.cs](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs)。中心 c=(0,1,0)、h=0.35，P0–P3 分别为：

```text
(-.35,.65,-.35), (.35,.65,.35), (.35,1.35,-.35), (-.35,1.35,.35)
```

三个相对 P0 的锚点差向量行列式为 0.686，非零。平方距离差给出三个独立线性约束：

```text
2(aᵢ-a₀)·position = |aᵢ|²-|a₀|²+d₀²-dᵢ²
```

正四面体的对称性还给出 `q=-Σ((aᵢ-c)dᵢ²)/(8h²)`，位置为 c+q。中心到四点距离均为 √3×0.35≈0.606218，使用 R=2、r=.001 时，四个理想 Proximity 均约 0.697391109。解算再检查四球残差、共同覆盖及局部范围。端点饱和值对应一段距离范围，解算只接受未饱和区间。

共同刚体变换保留相对距离，共同均匀尺度在 `(s*d-s*r)/(s*R)` 中相消，因此解算得到 AvatarRootLocal 坐标。该关系要求各方向等比缩放，且接收半径保持在 SDK 的 3 m 世界半径上限内。

## 为什么采用 R=2、h=0.35？

这里 R 是单个接收球的半径，h 是测量点沿每条坐标轴偏离布局中心的距离；两者是独立尺寸。当前 R=2、h=0.35，测量点到中心的直线距离为 √3h≈0.606，任意两点之间为 2√2h≈0.990，均使用 Avatar 根局部制作单位。根缩放为 1 时，这些距离分别对应米。[尺寸说明](positioning.md)解释这些尺寸与最终可测范围的关系。

四个测量点采用非共面布局。接收半径固定时，缩短点间距可以扩大四个球的共同覆盖，也会影响远离中心时的解算条件。当前半径 2 在覆盖和 SDK 缩放余量之间提供一组取舍。作者端与桌面共用同一套几何；调整尺寸时需要同步生成与解算规则。

标记半径 r=.001、严格 .001<p<.999 时，有效中心距离为 .003<d<1.999。实际区域是四个距离球壳的交集，再与每轴 ±2 的坐标方框相交。外侧边界内可容纳半径 `1.999−√3×.35≈1.392782` 的中心球，测量点附近的小饱和孔需从中扣除。这里描述空间覆盖；接受样本时还会检查采样活动与缩放条件。

| 接收半径，同为 h=.35，制作单位 | 中心外边界参考半径，制作单位 | 作者根缩放为 1 时约可容纳的均匀缩放 |
| --- | --- | --- |
| 1，对照值 | 0.394 | 2.999 倍 |
| 2，当前采用 | 1.393 | 1.4995 倍 |

表中的半径 1 用于比较取舍；当前共享协议固定使用半径 2，提供更大的共同覆盖。适合具体 Avatar 和运动轨迹的布局仍需通过实际测量评估。

令距离雅可比每行为 `Jᵢ=(position-aᵢ)/dᵢ`。中心处 `JᵀJ=(4/3)I`，二范数条件数为 1。假设四路 Proximity 噪声相互独立、各路标准差均为 σp，中心处一阶传播的每轴标准差为 `sqrt(3)Rσp/2`；当前 R=2 时约为 `1.732σp`，单位为 Avatar 根局部制作单位。这是给定噪声假设下的模型估计，实测精度需另行记录。点间距较小时，离开中心后的解算条件可能变差，因此客户端测量应覆盖实际运动轨迹。

0.01 残差阈值用于检查四个距离与解算模型的一致性；实际误差上界需要用已知轨迹测定。现有冗余用于残差检查，识别具体故障通道和认证发送者还需额外信息。当前解算直接处理样本，Sample 无效、超时或动作条件关闭时立即停止，失效按原始时刻生效。

## 五字段生产链

四个 RawP 使用仅供 FX Animator 的内部声明；根点测量的 MA 表达参数声明为公开 P0–P3 与 Sample，均为本地不同步 Float。官方 Contact 可直接写 Animator 参数，实际 OSC 导出范围由客户端配置决定，可在客户端逐项核对。[OSC 参数](https://docs.vrchat.com/docs/osc-avatar-parameters)

活动状态每约 50 ms 先复制四个 P，再写 `Sample=n/32`（n=1…32）。这些值可由二进制 Float 精确表示；0 专用于停用或守卫失效，1.6 s 完整周期大于 1250 ms 活性窗，降低二值计数采样别名。桌面按内容变化计时，静止 P 可缓存，相同 Sample 保留原有变化时间。Sample 反映生产端 Animator 持续活动；Contact 自身刷新、四路同步程度和 UDP 丢包需在客户端分别核对。

构建要求正值均匀根缩放，并检查作用于 Avatar 根的 ScaleConstraint 与已知缩放动画。FX 内部使用 IsLocal、ScaleFactor 和选择状态限制 `2*authoredRootScale*ScaleFactor` 在约 2.999 m 内，失效关闭 Contacts 并清零。专用标记跟随选中根中心，尺寸由 Avatar 根缩放决定。每个根点使用自己的固定测量组，按已配置的自身目标解算。

五字段描述每个 SPS 根点的测量输出。Automatic Exclusive 另有菜单控制 `Sensa/Select/<group>`：本地不同步、不保存的 Int，显式默认 0，0 为 Off、1…N 选择已排序目标；超出范围保持或回到 Off。这个参数用于选择测量目标，可按配置由 OSC 导出。Dedicated 为各目标生成专用测量组，省去该自动选择参数。独立 Shader 作者的 `Sensa/Select/ShaderCapture_<id>` 使用 0／1 控制。

## 已有证据的范围

历史 Unity nographics EditMode 运行检查过作者组件、P0–P3／Sample、内部 RawP 与最终表达列表、NDMF、几何、缩放／选择守卫、未知策略拒绝和独立实验回归。忽略路径 `artifacts/verification/sps-five-fields-editmode.xml` 等报告属于当时修订，新检出中可能不存在；引用结果时需对应原报告和提交。当前半径 2 的几何及生成器变更仍需执行相应 Unity Editor 检查与真实客户端测量。当前 CI 运行单元、E2E 和原生模拟检查，分别覆盖数学、契约和模拟传输；GPU 像素输出另行验证。具体次数和版本以每份实际报告及提交为准。

生成器契约还检查 .meta 身份、预制件作者类型与明确 Target。AvatarLab 使用 Exclusive／Dedicated，独立实验标签保留。工具与文档变更完成后，场景验收需按实际生成物另行执行。

待客户端与硬件实测的项目包括：上传后 Contacts 的误差分布、采样时序、约束／FX、真实 OSC、GPU／HMD 和设备行为。测量时保存根轨迹、尺度、丢包／年龄、模型残差及相对已知轨迹的实际误差，便于分别评估一致性和定位精度。[验证规则](development.md)
