# Shader 捕获：从原生根点到桌面区域

**简体中文** | [English](shader-capture-research.en.md)

本页记录原生根点捕获的设计与客户端验收范围。当前链路为 **所选根点参照 → 三点蒙皮采样 → 单 Camera 图块 → 明确 ROI 解码 → OSC**，提供所选根点的位置、X/Z 两条轴向和 Avatar 世界缩放。目标可为 Avatar 内明确选择的 SPS Socket／Plug、骨骼／空物体 Transform、Sensa Component 或原生 Contact；桌面图块可见性、头显画面与端到端延迟通过实际客户端检查。

以下 Shader 上游资料核验于 2026-10-19，源码固定到所列提交；Sensa 当前结构于 2026-10-24 更新。实际命令见[GPU 指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)，接收字段见[参数字典](osc-parameters.md)，本页保留设计理由与未完成验收。

## 官方能力与本轮决策

| 问题 | 一手证据与结论 | Sensa 决策 |
| --- | --- | --- |
| Avatar 能否运行回读 C#？ | [允许组件](https://creators.vrchat.com/avatars/whitelisted-avatar-components/whitelisted-avatar-components/)包含 Camera、SkinnedMeshRenderer 等，但不允许任意自定义脚本。 | 作者组件实现 IEditorOnly；NDMF 生成原生组件并移除作者组件。上传后不运行编辑器回读器。 |
| Camera 可否留在 Avatar？ | 同一官方页面说明本地穿戴者的 Camera 允许；远端受好友、Show Avatar 等条件限制。 | 仅本地菜单启用，默认 Off；不依赖对方 Avatar 保留相机。 |
| Android 是否支持？ | [Android 限制](https://creators.vrchat.com/platforms/android/quest-content-limitations/)禁止 Avatar Camera，且只允许列出的 Mobile Shader。 | 作者构建拒绝 Android；本轮是 PC Built-in / geometry-shader 路径，Metal 也不在支持范围。 |
| 隐藏层是否能被桌面捕获？ | [图层说明](https://creators.vrchat.com/worlds/layers/)中的 MirrorReflection 仅用于镜面；世界图层表不能证明 Avatar 上传后的图层保留。 | 不把“隐藏层”当作外部捕获接口。需要实际桌面编码块；遮挡、最小化、图层变更等必须实测。 |
| 不进双眼是否等于桌面可见？ | Unity [stereoTargetEye](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/Camera-stereoTargetEye.html)和 [None](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/StereoTargetEyeMask.None.html)说明引擎的眼目标；[targetTexture](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/Camera-targetTexture.html)说明 RT 与屏幕输出。 | 相机选择 None，但 VRChat 的桌面合成、头显不显示仍是独立客户端验收项，不能承诺。 |
| 如何区分镜面/拍照？ | [VRChat Shader Globals](https://creators.vrchat.com/worlds/udon/vrc-graphics/vrchat-shader-globals/)公布 CameraMode、MirrorMode，但没有任意 Avatar 相机唯一身份 API。 | 用已公布的全局值拒绝镜面/拍照，再用每 producer 的正交远平面签名限制编码相机。这只是路由条件，不是安全身份。 |

## 为什么先实现原生根点，而不是自动读取形变模型

核对的 VRCFury 源提交为 `d048773de971881fb14c5f3b468e59ba2406a2dd`。

- [SPS 单元布局](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/SPS/common/sps_cell_layout.cginc)有目标 ID、玩家 Shader ID、根部位置/方向/缩放等，没有源几何帧序号。当前编码器时钟不能证明旧全局纹理已经刷新。
- [SpsPlayerIdService](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/Editor-Avatars/Service/SpsPlayerIdService.cs)在运行时通过 Animator 随机生成并驱动材质玩家 ID。[SpsConfigurer](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/SpsConfigurer.cs)负责材质/Resolver 绑定。只复制构建时共享材质中的 ID 不是可靠绑定。
- 适配器 `ReadRoot` 统一解析明确选择的根点参照：SPS Socket／Plug 使用其作者根点几何，骨骼／空物体 Transform、Sensa Component 与原生 Contact 使用各自的根点定义。生成的三点蒙皮采样跟随该参照；SPS 目标的形变仍由安装的 VRCFury 处理。
- 旧 `SensaGpuProbe` 仍是 EditorWindow：调用所安装 SPS 的曲线函数采样未混合中心线。它与本轮根点生产端、旧合成 PNG fixture 是三种不同证据。

未来若实现模型生产端，仍需解决运行时 ID 绑定、同一渲染阶段/源几何新鲜度、XR texture array、模型与最终网格之间的差异，不能给旧纹理套一个新编码时钟后称为新鲜模型。

## 原生生产端的具体结构

通过 **GameObject → Sensa → Shader Root Capture (Experimental)** 创建，或添加 `SensaShaderCapture.prefab`，在 `SensaShaderCapture` 中指定 `Target`、非零 `producerId` 和归一化桌面 viewport。统一的 `SensaPlugin` 在 NDMF **Generating → BeforePlugin("nadena.dev.modular-avatar")** 读取配置，调用 Shader 生成器创建：

1. 所选根点参照下的 marker，使用 `ReadRoot` 解析出的 local position／rotation。
2. Avatar 根下单位变换的 SkinnedMeshRenderer，三个顶点完全绑定 marker。原生蒙皮结果在 AvatarRootLocal 中，避免把世界米和 Avatar 缩放混算。
3. 单个 None-eye 正交 Camera，按配置 viewport 直接输出 NDC 黑白格；直接使用一套相机与编码材质。
4. 默认关闭、仅本地允许的 `Sensa ShaderCapture_<ID>` 表达菜单；选择 **Root position code／根点位置编码** 后开启 rig。菜单项文字采用构建时的编辑器语言。

边界使用原生序列化 `m_AABB` / `m_DirtyAABB`，而非仅依赖不持久化的 Renderer.localBounds override；保持每次渲染的骨骼矩阵更新。[Unity Inspector 源码](https://github.com/Unity-Technologies/UnityCsReference/blob/2022.3/Editor/Mono/Inspector/SkinnedMeshRendererEditor.cs)

上传后的测量与图块输出由生成的原生组件完成；`IEditorOnly` 作者脚本在构建副本生成完成后移除。编码器直接引用包内 `Runtime/Shaders/SensaRootTelemetry.shader`，临时网格和材质随构建引用交给 NDMF 保存，动画、参数与菜单交给 MA 合并。构建阶段与上游依据见[Unity 构建指南](unity-build.md)。

## 坐标、方向与二进制包

生成的网格包含三个绑定到同一根点的顶点：原点、局部 +X 方向 0.1 和局部 +Z 方向 0.1。几何阶段在同一个三角形内读取蒙皮后的三点，得到原点以及两条差向量，除以 0.1 后输出 `Right` 与 `Forward`。两向量保留选定根点 X/Z 轴的方向和长度，也可以用叉积求测量平面的法线；独立 Y 轴缩放需另行测量。`AvatarScale` 从编码器的对象到世界矩阵读取均匀正缩放，表示一个 Avatar 根局部单位对应多少世界米。

位置共享 `SensaFixedAnchorProtocol`：`AvatarRootLocal`，中心 (0,1,0)，每轴半范围 2。X/Z=[−2,2]，Y=[−1,3]。整个 Avatar 一起平移或转身时，局部坐标保持原含义；乘 `AvatarScale` 可换算相对位移的米数。非有限值、越界、退化轴向或不支持的世界缩放会清除有效位。

原生包为 **32 字节**，多字节数使用 little-endian，内部格式标识保持 1：

| 字节 | 内容 |
| --- | --- |
| 0–2 | `SN`、内部格式 1 |
| 3 | bit0=有效，bit1=AvatarRootLocal；有效原生包为 3 |
| 4–5 | 16 位编码时钟序号，`floor(_Time.y × 60)`，按 65536 回绕 |
| 6–11 | X/Y/Z 各 16 位无符号数，解码为 `center + (value/65535×2−1)×2` |
| 12–13 | 非零 16 位 Producer ID，用于配对选定图块 |
| 14–19 | `RightX/Y/Z`，各为有符号 16 位数，解码为 `value×8/32767` |
| 20–25 | `ForwardX/Y/Z`，同上；−32768 为非法值，零可精确表示 |
| 26–27 | `AvatarScale`，16 位无符号数，解码为 `value×8/65535`，范围 (0,8] |
| 28–31 | 前 28 字节的 CRC32 IEEE 校验值 |

几何阶段每个三角形只生成一次包和 CRC，片元阶段读取已经打包的位。位置量化步长为 `4/65535`，轴向分量为 `8/32767`，世界缩放为 `8/65535`；这些步长描述数字精度，实际误差通过已知位置和方向测量。

## 黑白图块、位移留白与缺失恢复

图块为 **40 列 × 32 行**，原生捕获至少 **160×128 物理像素**，即每格至少 4×4 像素。由外向内包含：

1. **两格白色留白**：给小幅画面移动预留空间，使定位标记和数据保持在原捕获区域内。
2. **两格定位带**：四边的非对称互补黑白图案帮助确定对齐；每边两条线可互相补充，至少三条边匹配。
3. **32×24 数据区**：同一包保存为三份 32×8 格副本。各份按 11 字节错列，令同一纵向遮挡落到不同字节。

图块全程输出纯黑或纯白。白色是布局空白，黑白定位带是稳定参照；它们保持固定是为了提高识别率。数据格的 3×3 像素必须一致，无法可靠读取的格子记为缺失。桥把本次捕获中三份副本已知且一致的位合并，只有每一位都有依据且 CRC32 通过时才接受。副本中出现已知位冲突时整帧失效，防止把跨帧数据按多数票拼接。缺失覆盖所有副本的同一位时也会失效。

桥在明确选定的 ROI 内按四分之一格步进搜索，最多向各方向移动两格。留白缓冲的是**空间位移**；渲染、桌面合成和捕获的时间延迟通过实际测量评估。缩放、旋转或透视变化后重新注册 ROI。诊断图像继续使用独立的 16×8 格／CRC-CCITT 格式，便于隔离测试。

边缘与数据冗余帮助恢复部分遮挡、灰色或混合像素造成的缺失。CRC32 检查数据完整性，Producer ID 配对目标，推进序号发现重复和冻结；这些字段各自承担明确职责。

## 桌面注册与 OSC

完整操作见[包内指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)。桥不会自动选屏幕；必须显式选择 ROI。发送屏幕 OSC 必须固定 producer ID；注册还固定坐标 profile/center/range。同 ID 的旧诊断坐标格式也会被拒绝。

有效 OSC 单 bundle 严格按 `Sensa/Shader/<非零ID>/{Frame,X,Y,Z,RightX,RightY,RightZ,ForwardX,ForwardY,ForwardZ,AvatarScale,Valid}` 顺序发送，Valid=1 是最后的提交字段。失效只向同一前缀发送 Valid=0，不重发旧 XYZ 或伪增 Frame。ID 已在路径中，坐标系固定为 AvatarRootLocal，因此删除重复 Producer／Profile 参数与路径版本段，不提供旧别名。

Frame 保留以识别冻结／重复画面，XYZ 是测量值，Valid 保留以立即宣告无效；方向向量与缩放可供计算绑定使用。ID 仍保留在二进制包里用于校验实际 ROI 中的来源。原生 ID0 无效；合成／Editor 模型诊断只能进入 `Sensa/Diagnostics/Shader/0/{Frame,X,Y,Z,Valid}`，不生成根点观察。

桌面要求同来源连续十二字段，并按 Frame 内容变化时间执行最多 500 ms 存活窗；反复重发同一 Frame 不续期。模 16 位的单调前进、同帧异值和两帧恢复由桥负责；静态 Observe 不额外宣称具有历史防重放状态。

注册文件只证明曾在显式 ROI 解码到该 native 包，不代表完成位置精度或 VR 可见性验收。桥接器仍需两个推进帧；CRC/来源/坐标系错误、同帧不同值、倒序、冻结、超时或退出均关 Valid。冻结后的原帧不会恢复，两张新的推进帧才恢复；source reset 可要求手动重启桥，不能自动换源。

## 验证证据与缺口

隔离 Python 契约检查编码／CRC／RGB、共享坐标、ID／坐标系锁定、有序十二字段、原生／诊断隔离、冻结／恢复、注册、Windows 原子替换及捕获前 CLI 拒绝；不读取桌面或操作用户设备。

Unity EditMode 契约覆盖默认关闭、单相机输出、Shader 导入、持久边界、三点蒙皮与多 Producer 绑定。图形模式另有显式像素渲染契约；当前环境没有 Unity Editor，新增契约尚待执行。实际运行修订与结果统一记录在[验证记录](e2e-status.md)。

仍须分别验收 SDK 上传保留、NDMF／VRCFury 优化交互、native 编码像素、PC／PCVR 合成、HMD 可见性、窗口缩放／遮挡／最小化、HDR／后处理／低帧率、延迟及参考位置误差。桥的默认冻结 350 ms 早于桌面 500 ms 拒绝上限，不能将后者描述为实际桥的有效期。

当前作为需显式启用的 PC 实验输入，客户端验收按上述项目记录实测结果。[定位边界](positioning.md) · [构建与发布](development.md)
