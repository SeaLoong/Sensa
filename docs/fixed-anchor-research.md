# 固定 SPS 四锚点：依据与取舍

**简体中文** | [English](fixed-anchor-research.en.md)

本研究回答三个问题：为什么四个距离能解一个根点、为何采用 2 m 接收半径与各轴 ±0.35 m 的测量点偏移、以及测量组件能提供怎样的采样证据。结论已落实为固定 Avatar 根参考、明确根标记与 `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`；不是继续尝试从任意四个普通近接值猜位置。

操作看[方案](usage-scenarios.md)，接收门槛看[定位](positioning.md)，逐字段规则看[字典](osc-parameters.md)。这里保留固定来源、推导与尚未测量的假设；不把模型分析写成真实客户端精度报告。

## 一手依据

[官方 Contacts](https://creators.vrchat.com/common-components/contacts/) 说明 Proximity 使用 Sender 最近点、多个 Sender 取最近者，并限制缩放后半径为 3 m。网页未给出线性方程；本次检查安装的 VRChat SDK 3.10.5 ContactManager／CollisionScene 实现，检查副本与包内 VRC.Dynamics.dll 的 SHA-256 相同：

`672093e0c2a52a035979f1ff66478389949f42ffcf7daba5edd8b8da718629a3`

由该实现推导，两个球的中心距离为 d 时：

```text
p = 1-clamp(max(0,d-r)/R,0,1)
d = R(1-p)+r    # only outside saturation
```

这要求已知球形 Sender 的半径，不可将普通长度球当作点。根位置解析参考固定版本的 VRCFury [Socket](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs)／[Plug baker](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs) 的作者局部姿态；Sensa 自己添加半径 0.001、独有 tag 的小球，不复用不同用途的原 Sender 几何。

## 四点代数

共享定义是 [SensaFixedAnchorProtocol.cs](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs)。中心 c=(0,1,0)、h=0.35，P0–P3 分别为：

```text
(-.35,.65,-.35), (.35,.65,.35), (.35,1.35,-.35), (-.35,1.35,.35)
```

三个相对 P0 的锚点差向量行列式为 0.686，非零。平方距离差给出三个独立线性约束：

```text
2(aᵢ-a₀)·position = |aᵢ|²-|a₀|²+d₀²-dᵢ²
```

正四面体的对称性还给出 `q=-Σ((aᵢ-c)dᵢ²)/(8h²)`，位置为 c+q。中心到四点距离均为 √3×0.35≈0.606218，使用 R=2、r=.001 时，四个理想 Proximity 均约 0.697391109。解算再检查四球残差、共同覆盖及局部范围；端点饱和不能反解为精确距离。

共同刚体变换不改变相对距离；共同均匀尺度在 `(s*d-s*r)/(s*R)` 中相消。因此位置属于 AvatarRootLocal，不是世界坐标；SDK 的 3 m 半径限幅或非均匀尺度会破坏这个消去关系。

## 为什么采用 R=2、h=0.35？

这里 R 是单个接收球的半径，h 是测量点沿每条坐标轴偏离布局中心的距离；两者是独立尺寸。旧布局 R=2.5、h=0.5，不表示它只有 0.5 m 接收范围。测量点到中心的直线距离为 √3h，任意两点之间为 2√2h；旧值分别约 0.866 m 和 1.414 m。[尺寸对照](positioning.md#25-m05-m-和可测范围有什么区别)用表格区分了这些距离。

新默认值将接收半径从 2.5 降为 2 局部米，将四面体半跨度从 0.5 缩短为 0.35。点间距为 2√2h≈0.990 m；在接收半径相同时，缩短间距可扩大四个接收球的共同覆盖，同时保留非共面布局。新 2 m 接收器的绝对覆盖仍小于原 2.5 m 方案，此次调整优先降低数值噪声放大并保留更多缩放余量。实现使用一套共享几何，不能只改作者端半径而让桌面按另一套值解码。

标记半径 r=.001、严格 .001<p<.999 时，有效中心距离为 .003<d<1.999。实际区域是四个距离球壳的交集，再与每轴 ±2 的坐标方框相交。外侧边界内可容纳半径 `1.999−√3×.35≈1.392782` 的中心球，但测量点附近的小饱和孔仍被排除。这只是空间覆盖，不保证采样和缩放检查同时通过。

| 接收半径，同为 h=.35 | 中心外边界参考半径 | 作者根缩放为 1 时约可容纳的均匀缩放 |
| --- | --- | --- |
| 1 m | 0.394 m | 2.999 倍 |
| 2 m，当前采用 | 1.393 m | 1.4995 倍 |

1 m 用于说明取舍，不是当前可选的协议预设。相比表中的 1 m 对照，2 m 提供明显更大的共同覆盖，但不代表已证明它对所有 Avatar 和运动轨迹最优。

令距离雅可比每行为 `Jᵢ=(position-aᵢ)/dᵢ`。中心处 `JᵀJ=(4/3)I`，二范数条件数为 1。假设四路 Proximity 噪声独立且等方差 σp，中心处一阶传播的每轴标准差为 `sqrt(3)Rσp/2`。R 从 2.5 降到 2，可将这一模型下的噪声增益降低 20%；它不是实测精度提升。缩短点间距会降低离中心位置的条件，因此后续客户端测试必须覆盖实际运动轨迹。

0.01 残差阈值检测模型不一致，不能给出实际误差上界。四个约束没有足够冗余来可靠识别任意坏通道或认证发送者。本轮不加滤波：Sample 无效、超时或动作条件不满足时，应立即停止，不能通过平滑延迟失效。

## 五字段生产链

四个 RawP 仅存在实际 FX Animator，不加入 MA 表达参数；公开 P0–P3 与 Sample 是本地不同步 Float。官方 Contact 可直接写 Animator 参数，OSC 导出由客户端配置决定，故“内部”不等于隐私保证。[OSC 参数](https://docs.vrchat.com/docs/osc-avatar-parameters)

活动状态每约 50 ms 先复制四个 P，再写 `Sample=n/32`（n=1…32）。这些值可由二进制 Float 精确表示；0 专用于停用或守卫失效，1.6 s 完整周期大于 1250 ms 活性窗，降低二值计数采样别名。桌面按内容变化判断，重复同值不续期，静止 P 可缓存。此计数不是原子批次，也不证明物理 Contact 没有冻结或 UDP 没有丢包。

构建拒绝非正／非均匀根尺度、根 ScaleConstraint 与已知根缩放动画。FX 内部使用 IsLocal、ScaleFactor 和选择状态限制 `2*authoredRootScale*ScaleFactor` 在约 2.999 m 内，失效关闭 Contacts 并清零。专用标记跟随选中根中心，不继承骨骼尺度；没有共享移动根阵列或远端数据升级路线。

五字段不表示整个 Avatar 的表达参数总数。Automatic Exclusive 另有菜单控制 `Sensa/Select/<group>`：本地不同步、不保存的 Int，显式默认 0，0 为 Off、1…N 选择已排序目标；超出范围保持或回到 Off。此控制可按配置由 OSC 导出，不是测量值；Dedicated 不生成该自动选择参数。独立 Shader 作者的 `Sensa/Select/ShaderCapture_<id>` 也属于 0／1 控制。

## 已有证据的范围

历史 Unity nographics EditMode 运行检查过作者组件、P0–P3／Sample、内部 RawP 与最终表达列表、NDMF、几何、缩放／选择守卫、未知策略拒绝和独立实验回归。忽略路径 `artifacts/verification/sps-five-fields-editmode.xml` 等报告属于当时修订，新检出中可能不存在，不能据此认定本轮 2 m 几何已通过 Unity。变更后的 Unity 生成器仍需新的 Unity CI 和真实客户端测量；本轮隔离测试只覆盖各自数学或契约。生成 Shader 导入无错误也不等于 GPU 像素输出。具体次数和版本以每份实际报告及提交为准。

生成器契约还检查 .meta 身份、预制件作者类型与明确 Target。AvatarLab 使用 Exclusive／Dedicated，独立实验标签保留；工具死分支／文档清理不冒充完整场景验收。

尚未由这些证据确定：上传后 Contacts 的误差分布、采样时序、约束／FX、真实 OSC、GPU／HMD 和硬件行为。后续实测需保存根轨迹、尺度、丢包／年龄和误差，不以低残差代替真实误差。[验证规则](development.md)
