# Shader 捕获：从原生根点到桌面区域

**简体中文** | [English](shader-capture-research.en.md)

Shader 捕获把 Avatar 上一个选定位置的测量结果画成 QR 图块。桌面程序读取你选定的屏幕区域（ROI），还原位置、X/Z 两条轴向与 Avatar 世界缩放，再通过 OSC 交给 Sensa。目标可为 Avatar 内明确选择的 SPS Socket／Plug、骨骼／空物体 Transform、Sensa Component 或原生 Contact；桌面图块可见性、头显画面与端到端延迟通过实际客户端检查。

以下 Shader 上游资料核验于 2026-10-19，源码固定到所列提交；Sensa 当前结构于 2026-10-24 更新。实际命令见[GPU 指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)，接收字段见[参数字典](osc-parameters.md)，本页说明实现选择、数据格式与客户端验收方法。

## 官方能力与本轮决策

| 问题 | 一手证据与结论 | Sensa 决策 |
| --- | --- | --- |
| 上传后由什么组件工作？ | [允许组件](https://creators.vrchat.com/avatars/whitelisted-avatar-components/whitelisted-avatar-components/)列出可保留的 Camera、SkinnedMeshRenderer 等组件。自定义作者脚本用于构建阶段。 | 作者组件实现 IEditorOnly；NDMF 生成标准组件并移除作者组件，上传后由标准组件完成采样与编码。 |
| Camera 可否留在 Avatar？ | 同一官方页面说明本地穿戴者的 Camera 允许；远端受好友、Show Avatar 等条件限制。 | 使用本地穿戴者的相机，由本地菜单启用，默认 Off。 |
| Android 是否支持？ | [Android 限制](https://creators.vrchat.com/platforms/android/quest-content-limitations/)禁止 Avatar Camera，且只允许列出的 Mobile Shader。 | 作者构建拒绝 Android；本轮是 PC Built-in / geometry-shader 路径，Metal 也不在支持范围。 |
| 图层如何影响捕获？ | [图层说明](https://creators.vrchat.com/worlds/layers/)将 MirrorReflection 用于镜面；Avatar 上传后的图层保留情况需要客户端确认。 | 读取实际桌面中的编码块，测试遮挡、最小化与图层变化时的结果。 |
| 怎样检查桌面与头显输出？ | Unity [stereoTargetEye](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/Camera-stereoTargetEye.html)和 [None](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/StereoTargetEyeMask.None.html)说明引擎的眼目标；[targetTexture](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/Camera-targetTexture.html)说明 RT 与屏幕输出。 | 相机选择 None；分别在 VRChat 中检查桌面合成结果和双眼画面，记录实际可见性。 |
| 如何区分镜面/拍照？ | [VRChat Shader Globals](https://creators.vrchat.com/worlds/udon/vrc-graphics/vrchat-shader-globals/)公布 CameraMode、MirrorMode。 | 根据模式排除镜面/拍照，再按每个 producer 的正交远平面签名选择编码相机。这些条件用于画面路由；来源身份由选定目标与注册配置共同管理。 |

## 根点测量与形变模型

核对的 VRCFury 源提交为 `d048773de971881fb14c5f3b468e59ba2406a2dd`。

- [SPS 单元布局](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/SPS/common/sps_cell_layout.cginc)有目标 ID、玩家 Shader ID、根部位置/方向/缩放等，未提供源几何帧序号。模型新鲜度需要单独的几何更新时间或采集证据，编码器时钟用于检查图块输出是否推进。
- [SpsPlayerIdService](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/Editor-Avatars/Service/SpsPlayerIdService.cs)在运行时通过 Animator 随机生成并驱动材质玩家 ID。[SpsConfigurer](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/SpsConfigurer.cs)负责材质/Resolver 绑定。读取该模型需要跟踪运行时生成的 ID。
- 适配器 `ReadRoot` 统一解析明确选择的根点参照：SPS Socket／Plug 使用其作者根点几何，骨骼／空物体 Transform、Sensa Component 与原生 Contact 使用各自的根点定义。生成的三点蒙皮采样跟随该参照；SPS 目标的形变仍由安装的 VRCFury 处理。
- 旧 `SensaGpuProbe` 仍是 EditorWindow：调用所安装 SPS 的曲线函数采样未混合中心线。根点捕获、编辑器模型探针与合成 PNG fixture 分别检查根点采样、模型计算和编解码链路。

未来的模型采集需要同时处理运行时 ID、渲染阶段、几何更新时间和 XR texture array，并对照最终网格验证。几何更新时间与编码时钟分别记录，才能判断收到的是哪一次模型更新。

## 原生生产端的具体结构

通过 **GameObject → Sensa → Shader Root Capture (Experimental)** 创建，或添加 `SensaShaderCapture.prefab`，在 `SensaShaderCapture` 中指定 `Target`、非零 `producerId` 和归一化桌面 viewport。统一的 `SensaPlugin` 在 NDMF **Generating → BeforePlugin("nadena.dev.modular-avatar")** 读取配置，调用 Shader 生成器创建：

1. 所选根点参照下的 marker，使用 `ReadRoot` 解析出的 local position／rotation。
2. Avatar 根下单位变换的 SkinnedMeshRenderer，三个顶点完全绑定 marker。原生蒙皮结果按 AvatarRootLocal 解释，AvatarScale 提供到世界米的换算。
3. 单个 None-eye 正交 Camera，按配置 viewport 直接输出 NDC 黑白格；直接使用一套相机与编码材质。
4. 默认关闭、仅本地允许的 `Sensa ShaderCapture_<ID>` 表达菜单；选择 **Root position code／根点位置编码** 后开启 rig。菜单项文字采用构建时的编辑器语言。

边界通过原生序列化字段 `m_AABB` / `m_DirtyAABB` 持久保存，骨骼矩阵在每次渲染时更新。[Unity Inspector 源码](https://github.com/Unity-Technologies/UnityCsReference/blob/2022.3/Editor/Mono/Inspector/SkinnedMeshRendererEditor.cs)

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

图块使用标准 **QR Code Model 2，Version 4、H 纠错等级**。33×33 格主体承载一个 32 字节测量包，外围每边保留 8 格白色：其中 4 格为 QR 静区，另外 4 格给画面位移预留空间。完整图块为 **49×49 格**，捕获区域至少 **196×196 物理像素**。

从画面中可以辨认出三个角上的定位方框、交替黑白的时序线和右下角较小的校正标记。它们帮助读取程序确定图块的位置、方向和格子间距。两处格式信息保存纠错等级与掩码编号，采用 BCH 校验保护。

32 字节包以 Byte mode 写入 QR 数据区，加上模式、长度、结束与填充后得到 36 个数据码字。编码器将其分成 **4 组，每组 9 个数据码字和 16 个 Reed–Solomon 校验码字**，共 100 个码字，再按 QR 规则交织放入图中。一个码字就是一个字节。数据位经过掩码处理，编码器比较全部 8 种掩码，选择长连续色块、2×2 同色区域、类似定位标记的图案和黑白比例得分更好的一个，因此静止或接近零的数值也能形成清楚的黑白纹理。

纠错可以同时处理读错的字节与位置已知的缺失字节。**每组满足 `2e+s≤16` 时可以恢复**，其中 e 是错误字节数，s 是缺失字节数。例如，一组可以修复 8 个错误字节，或 16 个缺失字节，或 4 个错误与 8 个缺失字节。连续遮挡影响哪些组、覆盖多少码字，要由具体位置决定；定位标记也需要有足够可读内容。

桌面桥在所选 ROI 中扫描定位方框，重新确定采样位置。灰色或不能可靠判断的格子会让相应码字成为缺失，随后执行分组纠错、QR 格式检查和完整包 CRC32 校验。读取始终使用本次捕获；生产者 ID 与 Frame 推进检查继续负责目标配对和时效。局部混帧若被纠回同一个完整包，重复的 Frame 也不会延长有效期，仍按最近一次推进时间判断是否超时。

外围留白缓冲**空间位移**：在名义注册区域中平移最多 4 格，仍能保留标准 4 格静区。解码支持平面旋转、镜像和缩放；窗口尺寸变化后重新框选完整图块，可以保持足够的每格像素数。透视变形与端到端延迟按实际捕获条件测量。独立实验诊断图像沿用 16×8 格／CRC-CCITT 格式。

几何阶段每个测量三角形只生成一次 QR 模块，片元阶段读取最终黑白值。协议与标准 QR 库交叉核对；自动检查和实际 GPU／客户端验收分别记录在[验证记录](e2e-status.md)。

## 桌面注册与 OSC

完整操作见[包内指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)。先选择要读取的屏幕区域，并用 Producer ID 配对该图块。注册文件保存区域、目标 ID、坐标系、中心和范围；原生测量与实验诊断分别按各自的数据格式检查。

有效 OSC 单 bundle 严格按 `Sensa/Shader/<非零ID>/{Frame,X,Y,Z,RightX,RightY,RightZ,ForwardX,ForwardY,ForwardZ,AvatarScale,Valid}` 顺序发送，Valid=1 是最后的提交字段。失效只向同一前缀发送 Valid=0，不重发旧 XYZ 或伪增 Frame。对象 ID 由路径表达，坐标系固定为 AvatarRootLocal。

Frame 保留以识别冻结／重复画面，XYZ 是测量值，Valid 保留以立即宣告无效；方向向量与缩放可供计算绑定使用。ID 仍保留在二进制包里用于校验实际 ROI 中的来源。原生 ID0 无效；合成／Editor 模型诊断只能进入 `Sensa/Diagnostics/Shader/0/{Frame,X,Y,Z,Valid}`，不生成根点观察。

桌面要求同来源连续十二字段，并按 Frame 内容变化时间执行最多 500 ms 存活窗；反复重发同一 Frame 不续期。模 16 位的单调前进、同帧异值和两帧恢复由桥负责；桌面 Observe 负责当前完整包及变化时间检查。

注册文件保存成功解码时的 ROI、Producer ID 和坐标配置。启动或恢复读取需要两个连续推进帧；CRC、来源或坐标系错误，以及同帧不同值、倒序、冻结、超时或退出，都会将 Valid 置为 0。冻结后收到两个新的推进帧才恢复；生产端重置后可按提示重新启动桥。位置精度与 VR 可见性按下方客户端项目验证。

## 验证证据与缺口

隔离 Python 契约检查编码／CRC／RGB、共享坐标、ID／坐标系锁定、有序十二字段、原生／诊断隔离、冻结／恢复、注册、Windows 原子替换及捕获前 CLI 拒绝；不读取桌面或操作用户设备。

Unity EditMode 契约覆盖默认关闭、单相机输出、Shader 导入、持久边界、三点蒙皮与多 Producer 绑定。图形模式另有显式像素渲染契约；具体执行状态见验证记录，像素渲染契约需要可用的 Unity 图形环境。实际运行修订与结果统一记录在[验证记录](e2e-status.md)。

客户端验收包括 SDK 上传保留、NDMF／VRCFury 优化交互、原生编码像素、PC／PCVR 合成、HMD 可见性、窗口缩放／遮挡／最小化、HDR／后处理／低帧率、延迟及参考位置误差。桥在画面冻结 350 ms 后默认关闭有效性；Sensa 桌面端另以 500 ms 为接收数据的存活上限。

当前作为需显式启用的 PC 实验输入，客户端验收按上述项目记录实测结果。[定位边界](positioning.md) · [构建与发布](development.md)
