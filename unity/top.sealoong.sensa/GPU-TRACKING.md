# Shader 根点捕获与 SPS 模型诊断

**简体中文** | [English](GPU-TRACKING.en.md)

**Shader 根点捕获**把 Unity 中所选根点的位置、两条轴向和 Avatar 缩放画成黑白图块，再由桌面桥读取为 OSC 参数。位置可用于空间映射，轴向可用于计算朝向和运动关系，缩放可用于将根局部位移换算为米。此方案面向 PC，按下面步骤确认捕获和校准结果后启用输入。

[包安装与语言](README.zh-CN.md) · [交互图解](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN) · [编码与官方依据](https://github.com/SeaLoong/Sensa/blob/main/docs/shader-capture-research.md)

## 配置 Avatar

流程：**选定根点 → 三点蒙皮采样 → 黑白图块 → 桌面区域捕获 → OSC → Sensa 计算与输出**。

`SensaShaderCapture` 保存作者设置并实现 `IEditorOnly`。NDMF 在 MA 合并前读取 Target 的根点位置和旋转，生成一个 Camera、三顶点 SkinnedMeshRenderer 和编码材质，再移除作者脚本。上传后的采样由这些标准渲染组件完成。[构建流程](https://github.com/SeaLoong/Sensa/blob/main/docs/unity-build.md)

1. 安装[包依赖](COMPATIBILITY.md)。选择 SPS 作者目标时安装官方 VRCFury。使用 PC、Built-in Render Pipeline 和支持 geometry shader 的图形后端；Android 与 Metal 采用其他输入方式。
2. 从 **GameObject → Sensa → Shader Root Capture (Experimental)** 创建，或添加 `SensaShaderCapture.prefab`。将 `Target` 指向当前 Avatar 内的骨骼／空物体 Transform、SPS Socket／Plug、Sensa Component 或原生 Contact。
3. 设置唯一的 `Producer Id`（1–65535），例如 42。桌面桥使用相同 ID 配对该图块。
4. `Desktop Viewport` 是归一化屏幕区域，默认 (0,0,0.25,0.2)。在实际客户端找到完整图块后，再确定对应的桌面物理像素区域。
5. 正常构建 Avatar 或使用 NDMF 处理后预览。构建引用包内 `Runtime/Shaders/SensaRootTelemetry.shader`，临时网格与材质随构建保存。更新包和桌面桥后重新构建并注册捕获区域。
6. 在表达菜单 **Sensa ShaderCapture_42** 选择根点编码项。菜单默认关闭，由本地穿戴者开启；标题跟随作者构建时选择的语言。
7. 检查 PC 桌面图块及 VR 双眼画面。生成相机使用 `None` 眼目标，实际桌面合成和头显可见性在 VRChat 中分别确认。

多图块各用独立 ID、相机和材质签名。为每个图块分别配置捕获区域和桥进程。

## 读取哪些数据？

| 参数 | 含义与用法 |
| --- | --- |
| `X / Y / Z` | 所选根中心在 Avatar 根局部坐标中的位置；X/Z=[−2,2]，Y=[−1,3] |
| `RightX / RightY / RightZ` | 根点局部 +X 轴在 Avatar 根坐标中的向量；向量长度反映该轴缩放 |
| `ForwardX / ForwardY / ForwardZ` | 根点局部 +Z 轴在同一坐标中的向量；与 Right 的叉积可求测量平面法线 |
| `AvatarScale` | 每个 Avatar 根局部单位对应的世界米数，范围 (0,8] |
| `Frame` | 约 60 Hz 的编码时钟序号，用于发现重复与冻结 |
| `Valid` | 1 提交完整有效包；0 使当前测量失效 |

Right／Forward 各分量范围为 [−8,8]，使用同一个三角形的原点、+X 和 +Z 三个蒙皮点计算。它们保留两条轴的方向与长度；独立 Y 轴缩放需要另行测量。整个 Avatar 共同走动或转身时，根局部坐标保持相对含义。相对位移乘 `AvatarScale` 可换算为米。超范围、退化轴向或不支持的世界缩放会使包失效。

在 Sensa 中，根点面板可选择位置、轴向分量或 AvatarScale 做校准映射。需要组合计算时，在“流程”中选择定位测量（SensaPoint），填写根点路径如 `Sensa/Shader/42/**` 并选择指标，再绑定输出。该来源沿用完整包、帧时效和输入启用检查。[参数解释](https://github.com/SeaLoong/Sensa/blob/main/docs/osc-parameters.md) · [信号流程](https://github.com/SeaLoong/Sensa/blob/main/docs/signal-pipeline.md)

## 捕获与注册

使用安装了 Pillow 的 Python，在主仓库运行以下命令。将 `LEFT TOP WIDTH HEIGHT` 替换为完整图块的**物理像素**区域，包含外围白色留白。原生图块为 **40×32 格，至少 160×128 像素**。区域宽高决定每格大小，因此应框住图块的原定完整尺寸；多显示器可使用负坐标。

```shell
python -X utf8 scripts/shader-osc-bridge.py --region LEFT TOP WIDTH HEIGHT --producer-id 42 --save-registration capture.json
```

此命令先检查解码并保存区域、ID 和坐标定义。成功后，把 `--port` 改为实际 Sensa OSC 接收端口，启动转发：

```shell
python -X utf8 scripts/shader-osc-bridge.py --registration capture.json --watch --port 9001 --duration 300
```

省略端口可只观察解码。窗口尺寸、分辨率或显示缩放变化后重新注册。桥读取明确选定的区域，由 Sensa 工作台控制实际输入启用。

在 OSC 工作台核对 `Sensa/Shader/42/` 下的十二个字段。有效 bundle 顺序为 **Frame → X/Y/Z → RightX/Y/Z → ForwardX/Y/Z → AvatarScale → Valid=1**。Valid 最后提交；失效或退出时发送 Valid=0。先观察数值和停止行为，再校准映射并启用输入。

## 留白与冗余怎样帮助识别？

图块由外向内是**两格白色留白、两格黑白定位带、三份错列的数据副本**。外围留白给小幅画面移动预留空间，固定定位带帮助重新对齐；中间 32×24 格数据区存放同一份 32 字节包的三个副本。

桥在捕获区域内最多搜索各方向两格平移。无法可靠读出的格子记为缺失，可由本次捕获中其他副本的一致位补齐；全部位都有依据且 CRC32 通过后才接受。任何已知位冲突或所有副本都缺少同一位时，该帧失效。这让部分遮挡或混合像素有机会恢复，同时保持跨帧冲突检查。

留白缓冲空间位移，`Frame` 负责检测画面推进。默认超过 **350 ms** 未推进就失效，启动和恢复需要**两个新的推进帧**；同帧数据改变、倒序和来源变化也会失效。桌面另外检查十二字段连续性与最多 500 ms 的 Frame 变化年龄。图块缩放、旋转或透视变化后重新注册；端到端时间延迟通过实际测量确认。

内部诊断 PNG 使用独立的 16×8 格和 `Sensa/Diagnostics/Shader/0/{Frame,X,Y,Z,Valid}`，用于编码与传输测试。

## 编辑器 SPS 模型探针

此路径保留研究用途，未接成上传后的模型生产链。它读取 SPS2 `_VFGridFinal`，调用安装版本 `sps_deform_walk_chain`，输出**未混合中心线**、长度、入口和 `firstSegmentStrength`；不是最终网格表面。

1. 安装官方 VRCFury SPS2；依赖摘要针对源提交 `d048773de971881fb14c5f3b468e59ba2406a2dd`。使用 PC Built-in、非 XR/非立体相机，支持 ARGBFloat 和 AsyncGPUReadback。
2. 在正常 SPS 构建预览/Play Mode 中，让生成的 Resolver 和表面实际渲染。打开 **Tools → Sensa → SPS GPU Model Probe (Experimental)**，选择对应 Camera、BakedSpsPlug Resolver Renderer 和同一 Plug 的 Surface Renderer。
3. **检查依赖并采集下一帧**会核对安装 include 的规范化 SHA256，自动读取材质/MaterialPropertyBlock 身份；未知依赖、身份不一致、编译错误或十秒无相机渲染会停止。不会下载或捆绑 VRCFury 实现。
4. 生成文件位于 `Assets/SensaGpuDiagnostics`，只用于编辑器探针。可检查 33 个点、导出 `sensa.sps-gpu-model.v1` JSON；连续 PNG 是这个编辑器读取器的输出，不是 Avatar 原生生产证据。

SPS 运行时玩家 Shader ID 由 Animator 驱动，构建时材质值可能为零。全局纹理也可能保留旧帧；探针的魔数/ID 校验或新编码时钟无法证明源模型新鲜。Socket 根点本身不能识别正在使用它的 Plug，旧 TPS/DPS 也不自动提供 SPS2 Resolver。

离线分析（标准库，不捕获桌面、不发 OSC）：

```shell
python -X utf8 scripts/analyze-gpu-capture.py capture.json
python -X utf8 scripts/analyze-gpu-capture.py capture.json --aperture-radius 0.04 --min-incidence-degrees 10
```

输出采样弧长、入口后材料比例/弧长比例、平面偏移、采样弦方向和入射角。可拒绝部分混合、退化段、反向、多次/相切穿越及显式孔径外穿越。`usable` 只描述诊断分析条件，不等于设备可用。16/32 段弧长差不是误差上界；圆孔/中心线模型不计截面厚度或最终顶点效果。

## 验证范围

在支持 geometry shader 的 PC Built-in Unity Editor 中，打开 Test Runner → EditMode，明确选择 `UnityBox.Sensa.Tests.ShaderCapturePixelContracts` 运行图形测试。该类使用独立 RenderTexture 检查实际黑白像素、三副本、CRC32、方向和缩放；测试标记为 `Explicit`，普通无图形运行不会将其计作 GPU 验证。当前云环境没有 Unity Editor，新增 EditMode 和图形契约尚待执行。


编码／注册／新鲜度契约覆盖十二字段顺序和诊断隔离；Unity EditMode 契约覆盖单相机配置、Shader 导入／编译、持久边界、局部蒙皮数学和多 producer 绑定。实际检查的修订与结果以验证凭据为准，不沿用历史测试总数。nographics Shader 导入不能证明真实 GPU 像素输出、本机桌面捕获、PlayMode、Avatar 上传、VR 客户端或硬件。

后续客户端需逐项记录：实际图块、已知移动量误差、窗口缩放/遮挡/最小化、HDR/后处理/抗锯齿、低帧率、桌面延迟、头显可见性、SDK/优化器保留情况。CI 的内部诊断 PNG 回放仅证明独立命名空间中的传输／冻结恢复，输入始终关闭；模拟原生 OSC 也不能代替真实 GPU 采集。
