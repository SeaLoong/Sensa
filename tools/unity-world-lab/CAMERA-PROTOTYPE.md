# Camera-only prototype / 纯相机实验

这是用于验证渲染通路的测试图案，不是已完成的 SPS 数据桥接。

`Generated/CameraOnlyPrototype.prefab` 包含两个原生 Unity Camera、一个 RenderTexture、两个显示对象及其 Shader/Material，没有 Udon 或普通 C# 运行时脚本。根对象默认停用。

- Private capture camera：把测试编码图案写入 256×128 RenderTexture。
- Desktop presenter：读取该纹理，尝试在桌面左下角固定区域显示；`stereoTargetEye=None`，Shader 排除立体/镜像渲染。
- 编码中的帧序号由 Shader 测试时钟产生，不证明 SPS 数据源的新鲜度；XYZ 是合成测试值。
- 相机使用固定投影特征识别测试通路和 Layer 22 分隔对象。这不是 VRChat 提供的可靠相机身份接口，Avatar 上传后可能需要调整 Layer/Culling Mask。不要修改世界或他人对象的层级来迎合本实验。

世界场景中第三个方块控制该实验。第二个方块是另一套世界 Udon 数据输出实验；不要同时启用两套输出相机。头显内是否可见、是否覆盖桌面、是否受 VR 合成影响，尚需 VRChat 客户端实测。

先在设备输出断开的情况下：静止→快速转头→转身背对交互区域→打开镜子→改变窗口大小→关闭实验。检查头显和桌面两路画面，记录是否出现编码、固定区域是否变化、关闭后是否还有残留。

若要转移到独立 Avatars 项目，用 `Tools > Sensa Lab > Export camera-only prototype` 生成 `Exports/Sensa-CameraOnly-Experimental.unitypackage`。不要把整个 Worlds 项目的 SDK/Udon 包混装到头像项目。本包只作为相机实验，导入后先保持关闭；仅在自己的客户端启用，不应通过同步开关在其他玩家客户端开启相机。

已验证：Unity 2022.3.22f1 / AMD RX 6750 XT 上实际 Camera→RT→Presenter GPU 渲染及旋转后的 CRC 解码。未验证：Avatar SDK 构建/上传、PCVR 头显隔离、外部软件捕获时序、跨客户端行为。不可把编辑器中通过的非立体测试表述为已经实现“头显完全不可见”。
