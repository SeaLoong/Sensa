# 固定 SPS 四点：推导、取舍与证据

**简体中文** | [English](fixed-anchor-research.en.md)

当前 Sensa SPS 的模型是固定 Avatar 根参考框、四个已知锚点和一个明确选定的专用根标记。每对象的公开测量契约只有 `Sensa/SPS/<id>/P0…P3` 与 `Sample`。不包含版本段、额外元数据组合、远端接收组或旧数据兼容；独立 Point／Handle／Pose 不属于这个模型。

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

共享定义是 [SensaFixedAnchorProtocol.cs](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs)。中心 c=(0,1,0)、h=0.5，P0–P3 分别为：

```text
(-.5,.5,-.5), (.5,.5,.5), (.5,1.5,-.5), (-.5,1.5,.5)
```

三个相对 P0 的锚点差向量行列式为 2，非零。平方距离差给出三个独立线性约束：

```text
2(aᵢ-a₀)·position = |aᵢ|²-|a₀|²+d₀²-dᵢ²
```

正四面体的对称性还给出 `q=-Σ((aᵢ-c)dᵢ²)/(8h²)`，位置为 c+q。中心到四点距离均为 sqrt(0.75)，使用 R=2.5、r=.001 时，四个理想 Proximity 均约 0.653989838。解算再检查四球残差、共同覆盖及局部范围；端点饱和不能反解为精确距离。

共同刚体变换不改变相对距离；共同均匀尺度在 `(s*d-s*r)/(s*R)` 中相消。因此位置属于 AvatarRootLocal，不是世界坐标；SDK 的 3 m 半径限幅或非均匀尺度会破坏这个消去关系。

## 为什么保持 R=2.5、h=0.5

以下是模型分析，不是客户端精度测量。令距离雅可比每行为 `Jᵢ=(position-aᵢ)/dᵢ`。中心处 `JᵀJ=(4/3)I`，二范数条件数为 1。假设独立等方差 Proximity 噪声 σp，用当前闭式解一阶传播得到每轴标准差 `sqrt(3)Rσp/2`；较大 R 会放大同一数值噪声，不能声称半径越大越准。

| 相对中心 Z 偏移 1.5 | 最远距离 | 距离雅可比条件数 |
| --- | --- | --- |
| h=0.5 | 2.121320 | 3.741657 |
| h=0.75 | 2.487469 | 2.516611 |

加宽锚点改善这个离中心位置的条件数，但几乎耗尽 2.5 的覆盖余量。将 R 改成 2.0 虽减少数值误差放大，却连当前 h=0.5 的该位置都无法覆盖；将 R 推向 3 又减少可用 Avatar 缩放余量。没有真实根轨迹、噪声和缩放分布能证明替代方案整体更优，所以保持当前值。

有效体积是四球非饱和交集，不是中心各轴 ±1.5 的完整立方体。小球落在某锚点过近处也会饱和而被拒绝。残差阈值 0.01 只检测模型不一致，不是位置误差上界。四个约束没有足够冗余来可靠识别任意坏通道或认证 Sender。

本轮不加滤波。后续若有实测，应分别评估抖动、条件数和延迟，在验证后过滤位置；Sample=0、超时和门控不能经过平滑后才停止。

## 五字段生产链

四个 RawP 仅存在实际 FX Animator，不加入 MA 表达参数；公开 P0–P3 与 Sample 是本地不同步 Float。官方 Contact 可直接写 Animator 参数，OSC 导出由客户端配置决定，故“内部”不等于隐私保证。[OSC 参数](https://docs.vrchat.com/docs/osc-avatar-parameters)

活动状态每约 50 ms 先复制四个 P，再写 `Sample=n/32`（n=1…32）。这些值可由二进制 Float 精确表示；0 专用于停用或守卫失效，1.6 s 完整周期大于 1250 ms 活性窗，降低二值计数采样别名。桌面按内容变化判断，重复同值不续期，静止 P 可缓存。此计数不是原子批次，也不证明物理 Contact 没有冻结或 UDP 没有丢包。

构建拒绝非正／非均匀根尺度、根 ScaleConstraint 与已知根缩放动画。FX 内部使用 IsLocal、ScaleFactor 和选择状态限制 `2.5*authoredRootScale*ScaleFactor` 在约 2.999 m 内，失效关闭 Contacts 并清零。专用标记跟随选中根中心，不继承骨骼尺度；没有共享移动根阵列或远端数据升级路线。

五字段不表示整个 Avatar 的表达参数总数。Automatic Exclusive 另有菜单控制 `Sensa/Select/<group>`：本地不同步、不保存的 Int，显式默认 0，0 为 Off、1…N 选择已排序目标；超出范围保持或回到 Off。此控制可按配置由 OSC 导出，不是测量值；Dedicated 不生成该自动选择参数。独立 Shader 作者的 `Sensa/Select/ShaderCapture_<id>` 也属于 0／1 控制。

## 当前证据与未验证部分

冻结后的包在真实 Unity 2022.3.22f1 nographics EditMode 中一次 **65/65 通过，零失败／跳过**，报告为忽略的 `artifacts/verification/sps-five-fields-editmode.xml`。包含 P0–P3／Sample、内部 RawP 可写但不在最终表达列表、NDMF、固定几何、缩放边界、选择、未知策略拒绝、独立 Point／Pose 和原生 Shader 作者回归。生成 Shader 导入无编译错误，不等于验证实际 GPU 输出。

独立生成器单元合同验证已有 .meta 身份保留、新预制件类型与明确 Target；AvatarLab 变体改为 Exclusive／Dedicated，独立实验标签不改。后续工具死分支与说明清理只作编辑／静态检查，不冒充完整 AvatarLab 工程或场景验收。

没有运行本地 E2E、完整进程冒烟、截图、PlayMode 或设备。客户端 Contacts 精度、采样顺序、约束／动画时序、OSC、真实 GPU／头显和硬件仍需分别验收。[定位契约](positioning.md)
