# 定位：能测什么，何时必须停止

**简体中文** | [English](positioning.en.md)

四个已知、非共面的锚点到**同一点**的距离足以确定局部 XYZ。问题不在“四”太少，而在普通 Contact 参数不一定来自已知同一点、共同参考框或同一时刻。Sensa 因此将固定根点、Shader 与旧配对实验分开，空间驱动默认关闭。

| 方案 | 位置含义 | 有效性依据 |
| --- | --- | --- |
| Sensa SPS | 自己选定根中心的 AvatarRootLocal | 专用标记、固定锚点、几何一致、变化 Sample |
| Shader | 编码根中心的 AvatarRootLocal | 二进制／ROI 校验、有序坐标包、变化 Frame |
| 独立 Point／Handle／Pose | 相应参考框的局部估计 | 最旧参与通道、几何／抓取条件；不升级成固定 SPS |
| OGB Root／Tip | 径向接近比例 | 同实例配对与估长；不是 XYZ |

单点没有姿态、世界运动、尖端或最终 GPU 表面。命令也没有设备回读。[方案选择](usage-scenarios.md) · [交互模型](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)

## 固定 SPS 的几何

Avatar 根为固定参考，c=(0,1,0)、h=.5：

| 锚点 | 坐标 |
| --- | --- |
| P0 | (-.5,.5,-.5) |
| P1 | (.5,.5,.5) |
| P2 | (.5,1.5,-.5) |
| P3 | (-.5,1.5,.5) |

四个 Receiver 半径 R=2.5；专用根标记半径 r=.001，只跟随明确选择的根中心。局部近接与距离关系在未饱和区为：

```text
p = clamp(1 - max(0,d-r)/R, 0, 1)
d = R(1-p)+r
q = -Σ((aᵢ-c)dᵢ²)/(8h²)
position = c+q
```

不能省略 r，把 Sender 表面距离当中心距。接收要求严格 .001<p<.999、RMS 距离残差≤.01，以及 X/Z=[−1.5,1.5]、Y=[−.5,2.5]。残差只是模型一致性，不是误差上界或身份认证。[共享几何](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs) · [解算](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/FixedAnchorReconstruction.cs)

有效区域是四球交集扣除饱和／阈值边界，**不覆盖整个显示立方体**。锚点附近也有饱和孔。扩大接收半径会放大同一近接噪声，并减少缩放余量，不是无代价的优化。[推导和取舍](fixed-anchor-research.md)

## 五字段与活性

每对象只有 `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}` 五个测量 Float。RawP 只在 FX；本地采样状态先复制四路 P，再写 Sample。Sample=0 是停用／无效；有效时约每 50 ms 循环 n/32，n=1…32，名义周期 1.6 s。

静止 P 可缓存；**Sample 内容必须变化**。重复同值只更新接收时间，不续期 ChangedAt。运行时默认 1000 ms；正数 InputTimeoutMs 可替代，解码上限仍为 1250 ms。缺字段、非法步值、Sample=0、冻结、超时或拟合失败都会失效。这不是严格 20 Hz、原子 Contact 帧或物理传感器活性证明。

没有旧 v1、Root／SharedRoot、A0–A3 或 Profile／Scale／Valid／Heartbeat 别名。独立 Point／Pose 协议不参与补齐。每对象五测量也不表示整个 Avatar 只有五参数：Exclusive 可生成本地 Int 菜单 `Sensa/Select/<group>`，默认 0=Off；它不是测量，且可能被 OSC 导出。

## 缩放与参考框

共同刚体运动不改变局部距离；共同均匀尺度在距离比中消去。局部单位仅在作者／运行时尺度均为 1 时等于世界米。专用标记不继承目标骨骼尺度；构建拒绝非正、非均匀根尺度、根 ScaleConstraint 与已知根缩放动画。

SDK 的世界 Contact 半径上限是 3 m。FX 用 IsLocal／ScaleFactor 在 `2.5×authorScale×ScaleFactor` 超过约 2.999 m 前停用并清零。该保护不能消除所有客户端时序风险，也不是对恶意相同 tag 的认证。[官方 Contacts](https://creators.vrchat.com/common-components/contacts/)

## Shader 根点

原生蒙皮点与单 Camera 编码所选根 Transform，范围与固定 SPS 相同，但**没有 Contact 触发半径**。桥显式锁定 ROI／非零 ID，校验内部格式、坐标位、CRC 和模 65536 向前帧；默认 350 ms 冻结失效，启动／恢复需两帧推进。

有效 OSC 一个 bundle 按 `Sensa/Shader/<id>/{Frame,X,Y,Z,Valid}` 发送，Valid=1 最后；失效仅发 Valid=0。桌面要求同来源连续序列、有限范围内 XYZ、整数 Frame，以及内容变化年龄≤500 ms（正数更短配置优先）。桌面窗口是拒绝上限，不能说 350–500 ms 期间实际桥仍有效。

Producer 已在路径，Profile 固定在命名空间，故公开字段不重复；二进制 ID／坐标标志／CRC／Frame 仍必要。诊断 `Sensa/Diagnostics/Shader/0` 不生成点。图块编码在推进也不证明最终网格或其他 Shader 全局纹理新鲜。[Shader 证据](shader-capture-research.md) · [设置指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)

## 旧 Point／Handle／Pose

这些保留实验使用，各自参考框是 ReferenceLocal，不与上述固定坐标混拼。所有参与通道取最旧更新时间，默认 1000 ms 或正数输入超时；Handle 包括抓取值。多目标／配对歧义不能由另一目标的新值续期。低残差仍不证明共同 Sender／同帧。

三标记可构造局部姿态，但没有外部世界参考就观测不到整体世界运动。普通 Proximity 的最近 Sender 选择尤其容易破坏“每路是同一点”的假设；不应通过插值或平滑掩盖失效。

## 从观察到输出

固定对象／来源，采集 X／Y／Z／距原点的两端，预览后替换草稿并保存。保存关闭输入。再分别允许实验空间输入并启用实际 OSC；许可不会由看到参数、校准或解除急停自动获得。

失效停止且不能回退旧同轴标量。精度、延迟和停止行为须在真实客户端单独测量；EditMode／模拟包／浏览器图像不证明上传、Contact／OSC、桌面／头显捕获或机械动作。[参数字典](osc-parameters.md) · [操作指南](guide.md)
