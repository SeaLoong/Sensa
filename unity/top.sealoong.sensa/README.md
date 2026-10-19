# Sensa Unity 资产

**简体中文** | [English](README.en.md)

本包在构建时生成 Avatar 原生 Contacts、FX 参数和约束。Sensa SPS 使用 Avatar 根坐标中的四个固定锚点，测量自己明确选中的 Socket／Plug 根中心；每目标的测量数据为 **P0、P1、P2、P3、Sample** 五个 Float。它不测世界位移、完整姿态或 GPU 形变表面。

已有 OGB／SPS 参数可直接使用桌面 OGB 映射，不必安装本包。[OGB 兼容说明](https://github.com/SeaLoong/Sensa/blob/main/docs/ogb-compatibility.md)

## 安装与配置

1. 在 VCC／ALCOM 的 Avatars 工程安装包清单要求的 VRChat SDK、Modular Avatar 与 NDMF，使用工程指定的 Unity。
2. 解压 Sensa Unity ZIP，用 Package Manager → Add package from disk 选择 `package.json`。手工解压不安装缺失的 VPM 依赖。
3. 已有 VRCFury SPS 时，在 Avatar 根添加 **Sensa → Automatic SPS Setup**，检查目标与排除列表。新组件默认 Exclusive，菜单初始 Off；Dedicated 可同时测量。
4. 也可添加 **Sensa → Fixed SPS Root Probe**，或拖入 `SensaSpsRootProbe.prefab`，明确指定 Target。实例名与 Collision Channel 必须唯一，复制作者后更换两者。
5. 预检后私有上传并穿戴新 Avatar；先保持设备输入关闭，检查实际 OSC 与诊断。

不要安装到 Worlds 工程。本包不包含 VRCFury、SPS 或付费模型。作者脚本构建后移除，运行时使用 Avatar 允许的原生组件。

## 数据与几何

唯一数据前缀是 `Sensa/SPS/<id>`，没有版本段、Self／Others 或旧路径别名。P0–P3 是 Proximity 数值，不是 XYZ 或插入比例；Sensa 使用已知几何反解根点。Sample 为 0 时无效；有效值依次为 1/32、2/32…1，约每 50 ms 推进，1.6 秒循环。四个 RawP 只声明为内部 FX 参数，不注册到表达参数列表；客户端实际 OSC 导出仍需验收。

固定锚点中心为 (0,1,0)、半跨度 0.5，Receiver 半径 2.5，专用标记半径 0.001。每目标共 4 Receiver＋1 Sender，仅本地 Self 接收。标记跟随根位置与旋转，不继承目标骨骼缩放。

坐标使用 AvatarRootLocal 局部单位；作者根缩放和 ScaleFactor 都为 1 时才对应世界米。范围中心各轴 ±1.5 仍受四球共同覆盖、非饱和和拟合一致性约束。运行时半径限制为约 `2.5 × authoredRootScale × ScaleFactor ≤ 2.999 m`；非均匀根缩放、根 ScaleConstraint 和根缩放动画构建时拒绝。内部守卫失效或菜单 Off 时 Sample 归零。

五字段限定每对象测量数据；Automatic Exclusive 另有本地、不同步且不保存的菜单 Int `Sensa/Select/<group>`，默认 0（Off），1…N 选择目标。它可能由 OSC 导出，不是测量字段。Dedicated 不生成此自动选择参数，菜单也不会启用桌面输入或连接设备。

## 在桌面使用

应用 OSC 模式，打开 **OSC → 实验诊断 → 本地点与根部**，选择唯一目标与来源，确认四路 P 和变化的 Sample。采集两个端点，检查映射草稿后保存。空间输入仍默认关闭，必须单独保存实验许可，再按设备限位启用输入。

静止 P 可以缓存，但重复收到相同 Sample 不续期；协议活性上限为 1250 ms，桌面可使用更严格超时。Sample 不是 OSC 原子批次，也不证明 Contact 同帧、无丢包或目标身份认证。任何旧 Sensa SPS 数据都不兼容，升级需重建 Avatar 与映射。

## 其他能力与验证

Point／Handle 是独立的局部骨骼／PB 实验；Pose 是配对 Root／Tip／Side 直线姿态实验。它们保留各自协议与最旧通道时效，不转换为 Sensa SPS。原生 PB Stretch＋IsGrabbed 可直接映射。Shader 捕获属于[独立链路](GPU-TRACKING.md)。

QuickStart 仅为隐藏的合成实验夹具。单元／EditMode 可验证生成器，不能证明上传后的客户端 OSC、VR 抓取、GPU／头显或硬件行为。

[自动配置与路径](AUTOMATION.md) · [依赖与边界](COMPATIBILITY.md) · [定位说明](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.md)
