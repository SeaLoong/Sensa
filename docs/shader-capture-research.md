# Shader 根点捕获：实现与研究记录

**简体中文** | [English](shader-capture-research.en.md)

核验日期：2026-10-19。结论：本轮增加的是 **SPS Socket/Plug 根部 Transform → 原生蒙皮 → Shader 编码 → 用户明确选择的桌面区域 → OSC**。它采样头像根局部坐标，不采样最终形变网格。原生生产端已实现；Unity 构建、实际上传、客户端窗口与 PCVR 合成结果需要各自验收，不能从 Python 测试推导。

## 官方能力与本轮决策

| 问题 | 一手证据与结论 | Sensa 决策 |
| --- | --- | --- |
| Avatar 能否运行回读 C#？ | [允许组件](https://creators.vrchat.com/avatars/whitelisted-avatar-components/whitelisted-avatar-components/)包含 Camera、SkinnedMeshRenderer 等，但不允许任意自定义脚本。 | 作者组件实现 IEditorOnly；NDMF 生成原生组件并移除作者组件。上传后不运行编辑器回读器。 |
| Camera 可否留在 Avatar？ | 同一官方页面说明本地穿戴者的 Camera 允许；远端受好友、Show Avatar 等条件限制。 | 仅本地菜单启用，默认 Off；不依赖对方 Avatar 保留相机。 |
| Android 是否支持？ | [Android 限制](https://creators.vrchat.com/platforms/android/quest-content-limitations/)禁止 Avatar Camera，且只允许列出的 Mobile Shader。 | 作者构建拒绝 Android；本轮是 PC Built-in / geometry-shader 路径，Metal 也不在支持范围。 |
| 隐藏层是否能被桌面捕获？ | [图层说明](https://creators.vrchat.com/worlds/layers/)中的 MirrorReflection 仅用于镜面；世界图层表不能证明 Avatar 上传后的图层保留。 | 不把“隐藏层”当作外部捕获接口。需要实际桌面编码块；遮挡、最小化、图层变更等必须实测。 |
| 不进双眼是否等于桌面可见？ | Unity [stereoTargetEye](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/Camera-stereoTargetEye.html)和 [None](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/StereoTargetEyeMask.None.html)说明引擎的眼目标；[targetTexture](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/Camera-targetTexture.html)说明 RT 与屏幕输出。 | 相机选择 None，但 VRChat 的桌面合成、头显不显示仍是独立客户端验收项，不能承诺。 |
| 如何区分镜面/拍照？ | [VRChat Shader Globals](https://creators.vrchat.com/worlds/udon/vrc-graphics/vrchat-shader-globals/)公布 CameraMode、MirrorMode，但没有任意 Avatar 相机唯一身份 API。 | 用已公布的全局值拒绝镜面/拍照，再用正交远平面签名隔离两相机。这只是路由条件，不是安全身份。 |

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
3. 根点编码 Shader、256×128 线性 Point-filter RT、正交编码 Camera。
4. 第二个 None-eye Camera 和全 viewport 编码呈现网格。输出不是编辑器 PNG 读取器。
5. 默认关闭、仅本地允许的 `Sensa ShaderCapture_<ID>` 表达菜单；选择 `SPS root code / SPS 根点编码` 后才开启 rig。

边界使用原生序列化 `m_AABB` / `m_DirtyAABB`，而非仅依赖不持久化的 Renderer.localBounds override；保持每次渲染的骨骼矩阵更新。[Unity Inspector 源码](https://github.com/Unity-Technologies/UnityCsReference/blob/2022.3/Editor/Mono/Inspector/SkinnedMeshRendererEditor.cs)

所有上传后运行的测量/输出组件都是原生组件；编辑器 builder、MA/NDMF 构建过程并不是 Avatar 运行时脚本。两个生成 Shader 存放在 `Assets/SensaShaderCapture`，已有不同内容时构建停止，不覆盖用户文件。

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

序号证明编码画面在推进，不证明最终网格、动画状态或其他 Shader 全局纹理同步。黑白编码有抗颜色偏移校验，但 CRC 不是认证，也不是误差上界。

## 桌面注册与 OSC

完整操作见[包内指南](../unity/top.sealoong.sensa/GPU-TRACKING.md)。桥不会自动选屏幕；必须显式选择 ROI。发送屏幕 OSC 必须固定 producer ID；注册还固定坐标 profile/center/range。同 ID 的旧诊断坐标格式也会被拒绝。

有效 OSC bundle 按顺序发送 `Sensa/Shader/v1/<ID>/{Valid,Frame,X,Y,Z,Producer,Profile}`；原生 Profile=1。无效时只发送 `Valid=0,Producer,Profile`，不重发旧 XYZ，保留相同目标前缀。旧 synthetic/Editor PNG 的 ID=0、Profile=0 只供解码/预览，不是根点运动输入。

注册文件只证明曾在显式 ROI 解码到该 native 包，不代表完成位置精度或 VR 可见性验收。桥接器仍需两个推进帧；CRC/来源/坐标系错误、同帧不同值、倒序、冻结、超时或退出均关 Valid。冻结后的原帧不会恢复，两张新的推进帧才恢复；source reset 可要求手动重启桥，不能自动换源。

## 验证与未完成验收

- 本轮 isolated Python `test_shader_bridge.py`：18 项通过。覆盖编码/CRC/RGB、源无效与越界标志、共享坐标范围、来源/profile 锁定、无效 OSC、顺序、冻结/恢复、Windows 文件原子替换、注册校验和 CLI 提前拒绝。未调用桌面捕获或用户设备。
- 统一 Unity EditMode 中最终 native capture 3 项、fixed-root 9 项共 12/12 通过，零跳过；证据为 artifacts/verification/fixed-root-counter-native-editmode.xml。Native 契约覆盖默认关闭、相机/RT/Shader 编译、持久边界、局部蒙皮几何及多 producer 相机绑定，不含 PlayMode 或实际客户端。
- 必须另验：真实 SDK 上传后保留、NDMF/VRCFury 优化交互、实际 native 编码、PC desktop 与 PCVR 合成、头显是否可见、窗口缩放/遮挡/最小化、HDR/后处理/低帧率、延迟及位置参考误差。没有这些证据前保持实验 opt-in，不称可靠世界定位或真实网格跟踪。
