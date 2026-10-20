# Shader 捕获：从原生根点到桌面区域

**简体中文** | [English](shader-capture-research.en.md)

本研究区分能实现的生产链和不能据此承诺的客户端行为。当前实现是 **所选 SPS 根 Transform → 原生蒙皮点 → 单 Camera 图块 → 明确 ROI 解码 → OSC**，不采样最终形变网格。隐藏渲染层并不自动成为桌面捕获接口。

以下一手资料核验于 2026-10-19，源码固定到所列提交；新版本需要重新核对。实际命令见[GPU 指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)，接收字段见[参数字典](osc-parameters.md)，本页保留设计理由与未完成验收。

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
- 本轮直接调用适配器 `ReadRoot`，读取安装版本 Socket/Plug 的实际作者根部位置/旋转，生成跟随该根部的单骨骼采样点。不复制 VRCFury Shader 或另写近似形变算法。
- 旧 `SensaGpuProbe` 仍是 EditorWindow：调用所安装 SPS 的曲线函数采样未混合中心线。它与本轮根点生产端、旧合成 PNG fixture 是三种不同证据。

未来若实现模型生产端，仍需解决运行时 ID 绑定、同一渲染阶段/源几何新鲜度、XR texture array、模型与最终网格之间的差异，不能给旧纹理套一个新编码时钟后称为新鲜模型。

## 原生生产端的具体结构

`SensaShaderCapture` 提供目标对象、非零 `producerId`、归一化桌面 viewport。独立 NDMF builder 生成：

1. Socket/Plug 根部下的 marker；使用 `ReadRoot` 的 local position/rotation。
2. Avatar 根下单位变换的 SkinnedMeshRenderer，单顶点完全绑定 marker。原生蒙皮结果在 AvatarRootLocal 中，避免把世界米和 Avatar 缩放混算。
3. 单个 None-eye 正交 Camera，按配置 viewport 直接输出 NDC 黑白格；不再生成 RT、Quad、第二相机或显示 Shader。
4. 默认关闭、仅本地允许的 `Sensa ShaderCapture_<ID>` 表达菜单；选择 `SPS root code / SPS 根点编码` 后才开启 rig。

边界使用原生序列化 `m_AABB` / `m_DirtyAABB`，而非仅依赖不持久化的 Renderer.localBounds override；保持每次渲染的骨骼矩阵更新。[Unity Inspector 源码](https://github.com/Unity-Technologies/UnityCsReference/blob/2022.3/Editor/Mono/Inspector/SkinnedMeshRendererEditor.cs)

所有上传后运行的测量/输出组件都是原生组件；编辑器 builder、MA/NDMF 构建过程并不是 Avatar 运行时脚本。生成的根点 Shader 存放在 `Assets/SensaShaderCapture`，已有不同内容时构建停止，不覆盖用户文件。

## 坐标与二进制包

共享 `SensaFixedAnchorProtocol`：`AvatarRootLocal`，中心 (0,1,0)，每轴半范围 1.5。有效范围 X/Z=[−1.5,1.5]、Y=[−0.5,2.5]。单位是头像根局部单位；只有作者根缩放与运行时缩放均为 1 时才直接等于米。越界/非有限值清除有效位，不把夹紧值伪装为真实位置。

16 列 × 8 行黑白格，16 字节：

| 字节 | 内容 |
| --- | --- |
| 0–2 | SN、内部格式 1 |
| 3 | bit0=有效，bit1=AvatarRootLocal；原生有效包为 3 |
| 4–5 | 16-bit little-endian 渲染编码序号，约 60 Hz 时钟 |
| 6–11 | X/Y/Z 各 16-bit，解码为 center + normalized × 1.5 |
| 12–13 | 非零 16-bit producer ID；不是玩家账号身份 |
| 14–15 | 前 14 字节的 CRC-CCITT，初值 0xffff |

geometry 阶段为每个蒙皮点构造一次 16 字节和 CRC，打包成 nointerpolation uint4；fragment 仅取对应位，不再逐像素算 CRC。该改动减少重复计算，不代表已经测得客户端性能提升。

量化步长为 3/65535≈0.00004578 局部单位，每轴最大舍入误差为半步；这不是总位置误差。半范围 1.5 是固定坐标边界，不是 Contact 接收半径，不增加第二套半径配置。SN 内部格式 1 是二进制布局标识，不是 OSC 路径版本或旧协议兼容分支。

序号证明编码画面在推进，不证明最终网格、动画状态或其他 Shader 全局纹理同步。黑白编码有抗颜色偏移校验，但 CRC 不是认证。

## 桌面注册与 OSC

完整操作见[包内指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)。桥不会自动选屏幕；必须显式选择 ROI。发送屏幕 OSC 必须固定 producer ID；注册还固定坐标 profile/center/range。同 ID 的旧诊断坐标格式也会被拒绝。

有效 OSC 单 bundle 严格按 `Sensa/Shader/<非零ID>/{Frame,X,Y,Z,Valid}` 顺序发送，Valid=1 是最后的提交字段。失效只向同一前缀发送 Valid=0，不重发旧 XYZ 或伪增 Frame。ID 已在路径中，坐标系固定为 AvatarRootLocal，因此删除重复 Producer／Profile 参数与路径版本段，不提供旧别名。

Frame 保留以识别冻结／重复画面，XYZ 是测量值，Valid 保留以立即宣告无效；五项各有用途。ID 仍保留在二进制包里用于校验实际 ROI 中的来源。原生 ID0 无效；合成／Editor 模型诊断只能进入 `Sensa/Diagnostics/Shader/0/{Frame,X,Y,Z,Valid}`，不生成根点观察。

桌面要求同来源连续五字段，并按 Frame 内容变化时间执行最多 500 ms 存活窗；反复重发同一 Frame 不续期。模 16 位的单调前进、同帧异值和两帧恢复由桥负责；静态 Observe 不额外宣称具有历史防重放状态。

注册文件只证明曾在显式 ROI 解码到该 native 包，不代表完成位置精度或 VR 可见性验收。桥接器仍需两个推进帧；CRC/来源/坐标系错误、同帧不同值、倒序、冻结、超时或退出均关 Valid。冻结后的原帧不会恢复，两张新的推进帧才恢复；source reset 可要求手动重启桥，不能自动换源。

## 验证证据与缺口

隔离 Python 契约检查编码／CRC／RGB、共享坐标、ID／坐标系锁定、有序五字段、原生／诊断隔离、冻结／恢复、注册、Windows 原子替换及捕获前 CLI 拒绝；不读取桌面或操作用户设备。

Unity EditMode 检查默认 Off、单相机直接输出、Shader 导入、持久边界、蒙皮坐标与多 producer 绑定；对应忽略报告为 `artifacts/verification/sps-five-fields-editmode.xml`。nographics 导入／生成不是实际 GPU 渲染，具体数量以原报告为准。

仍须分别验收 SDK 上传保留、NDMF／VRCFury 优化交互、native 编码像素、PC／PCVR 合成、HMD 可见性、窗口缩放／遮挡／最小化、HDR／后处理／低帧率、延迟及参考位置误差。桥的默认冻结 350 ms 早于桌面 500 ms 拒绝上限，不能将后者描述为实际桥的有效期。

完成这些前保持实验 opt-in，不承诺可靠世界定位、真实网格跟踪或客户端性能提升。[定位边界](positioning.md) · [验证流程](development.md)
