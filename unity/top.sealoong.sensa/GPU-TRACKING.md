# SPS Shader 根点捕获与模型诊断

**简体中文** | [English](GPU-TRACKING.en.md)

本包提供两条不同用途的路径：**原生根点捕获**生成可随 Avatar 构建的组件，用于实验性桌面桥接；**SPS GPU Model Probe**只在 Unity 编辑器中采样形变模型。旧合成编码场景和 PNG 回放只验证传输，不代表真实 SPS 根点或模型已在客户端测通。

官方能力、源代码核验与协议设计见[研究记录](https://github.com/SeaLoong/Sensa/blob/main/docs/shader-capture-research.md)。两条路径都不提供最终可见网格或可信玩家身份，也不能把根点变化直接当作设备行程。

## 原生根点路径

流程：实际 Socket/Plug 根部 → 原生单骨骼蒙皮点 → 编码 Shader → RenderTexture → 桌面呈现相机 → 明确选择的捕获区域 → Python 桥 → Sensa OSC。

作者端 `SensaShaderCapture` 是 IEditorOnly。NDMF 构建时读取安装版本 VRCFury 的根部位置/旋转，生成 Camera、SkinnedMeshRenderer、MeshRenderer、材质与 RT，并移除作者组件。上传后不运行普通 MonoBehaviour 回读器、EditorWindow 或 Udon。不需要把 VRCFury Shader 源码复制到包中。

### 设置

1. 安装[包依赖](COMPATIBILITY.md)及官方 VRCFury SPS。使用 PC、Built-in Render Pipeline 和支持 geometry shader 的图形后端；Android、Metal 不支持此路径。先不要配置硬件输出。
2. 在 Avatar 内添加 **Sensa → Shader Root Capture (Experimental)**。将 `Sps Target` 指向包含一个 VRCFury SPS Socket 或 Plug 的对象。位置来自适配器的实际根部 API，不使用近接 Contact 半径估计。
3. 设置唯一的 `Producer Id`（1–65535），例如 42；此值必须与桌面桥固定值相同。它只是本地协议标识，不是 VRC 用户身份。
4. `Desktop Viewport` 是归一化屏幕区域，默认 (0,0,0.25,0.125)。需要先在实际客户端找到完整黑白图块，再确定桌面像素 ROI；不要直接把这四个归一化值传给 Python。
5. 正常构建 Avatar。生成 Shader 位于 `Assets/SensaShaderCapture`。若已有不同内容，构建会停止：先确认文件所有权，备份并移走旧生成文件再重试，不会覆盖用户编辑。
6. 表达菜单 **Sensa ShaderCapture_42 → SPS root code / SPS 根点编码** 显式启用。默认 **Off**，只有本地穿戴者允许开启；关闭菜单会停止 rig。
7. 分别确认 PC 桌面窗口是否出现图块、VR 双眼是否出现不希望的画面。None-eye Camera 表达 Unity 眼目标设置，不能代替 VRChat 的实际合成验收。不存在“任意隐藏层都能被桌面抓到”的保证。

多 producer 使用各自的相机/材质签名，桥仍必须固定目标 ID。镜面、拍照相机或第三方相机不能仅凭视觉相似就作为有效来源。

### 坐标

原生包为 `AvatarRootLocal`：中心 (0,1,0)，每轴半范围 1.5；X/Z 位于 [−1.5,1.5]，Y 位于 [−0.5,2.5]。单位为头像根局部单位，只有作者与运行时根缩放均为 1 时才直接等于米。世界平移/转身不等于局部根点移动；该路径不输出全局世界坐标。非有限值或超范围会输出无效位。

### 捕获与注册

在主 Sensa 仓库运行，使用安装了 Pillow 的 Python 环境。以下命令是操作示例，`LEFT TOP WIDTH HEIGHT` 必须替换为完整图块的**物理像素**区域；宽至少 64、高至少 32，允许多显示器负坐标。

```shell
python -X utf8 scripts/shader-osc-bridge.py --region LEFT TOP WIDTH HEIGHT --producer-id 42 --save-registration capture.json
```

首次命令只解码并保存显式区域/ID/profile，不发送 OSC。若解码失败，调整 ROI、窗口大小、缩放或编码呈现后重试。保存成功只证明曾解到一个符合条件的包，不代表精度或 PCVR 验收通过。注册文件固定坐标 profile，不能手改成另一坐标系复用。

使用实际 Sensa OSC 接收端口，明确启动转发：

```shell
python -X utf8 scripts/shader-osc-bridge.py --registration capture.json --watch --port 9001 --duration 300
```

也可明确提供 `--region ... --producer-id 42 --watch --port ...`。省略端口只观察解码。脚本不自动选屏幕、不注入游戏、不读进程内存、不连接设备，也不替用户激活 Sensa 输入。移动窗口、改变分辨率或显示缩放后，应重新检查并注册 ROI。

在 OSC 参数工作台核对 `Sensa/Shader/v1/42/{Valid,Frame,X,Y,Z,Producer,Profile}`。真实根点 profile 为 1，Producer 必须为 42；旧合成/Editor PNG profile 为 0、ID 为 0，只作诊断预览。之后按 Sensa 的实验空间输入许可与两点校准流程配置映射；只在坐标、方向和停止行为通过检查后显式允许输入。不会自动回退 OGB。

### 新鲜度与恢复

- 桥检查 16×8 格式、RGB 黑白阈值、CRC、来源和坐标 profile。固定 ID 后，同 ID 的旧诊断格式也拒绝。
- 初始等待两个推进序号。重复画面不会续鲜；同一序号却变化的坐标、倒序、无效源位或身份变化均关闭 Valid。
- 默认冻结超时 0.35 秒，可明确用 `--timeout` 调整（0.05–5 秒）。恢复需两张新的推进帧；原来的好帧不能重新开门。生产端序号重置时可能需要手动重启桥。
- 有效 bundle 顺序固定为 Valid、Frame、X、Y、Z、Producer、Profile。无效/退出只发 Valid=0、Producer、Profile，不再发送旧 XYZ。
- 序号是渲染编码时钟，不是最终网格/动画求解时戳。CRC 不认证玩家身份；它也不能证明底层模型纹理没有旧值。

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

本轮隔离 Python 编码/注册/新鲜度/OSC 契约 18 项通过。统一 Unity EditMode 中原生捕获 3 项通过：生成组件/Shader 编译、持久渲染边界、根部移动/旋转/缩放后的局部蒙皮数学和多 producer 相机绑定；没有执行本机桌面捕获、PlayMode、真实 Avatar 上传、VR 客户端或硬件。

后续客户端需逐项记录：实际图块、已知移动量误差、窗口缩放/遮挡/最小化、HDR/后处理/抗锯齿、低帧率、桌面延迟、头显可见性、SDK/优化器保留情况。现有 CI 的旧 Profile0 PNG 回放仅证明传输/冻结恢复，输入始终关闭；模拟 Profile1 OSC 也不能代替真实 GPU 采集。
