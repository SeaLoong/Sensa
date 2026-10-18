# SPS Shader 形变数据：实验探针与游戏内桥接设计

**简体中文** | [English](GPU-TRACKING.en.md)

状态：已验证 Worlds 中的 GPU 渲染、ClientSim 回读、真实 SPS2 模型采样及编码 PNG→外部解码→隔离 Sensa OSC。Editor Probe 支持连续导出 PNG；可上传的纯相机装置仍只生成合成测试码。尚无完整的游戏内真实 SPS 捕获桥接或设备输出，也未验证 PCVR 头显可见性。

具体场景、预期值和命令见[能力测试与联动说明](https://github.com/SeaLoong/Sensa/blob/main/tools/unity-world-lab/CAPABILITIES.md)。连续 PNG 编码入口相对中心线根部的世界轴位移，并非最终网格或直接行程。外部脚本验证 CRC、递增帧序及冻结超时；这些检查仍不能保证底层 Resolver 数据与画面绝对同步。

Contact 解算同样只是默认禁止运动输出的实验估计，不能作为缺失身份、同帧或真实网格信息的可靠回退。[定位说明](https://github.com/SeaLoong/Sensa/blob/main/docs/positioning.md)

## 哪些数据值得读取

SPS2 的 `_VFGridFinal` 是渲染阶段的 Shader 数据纹理。所核对版本的 Plug Resolver 提供根部坐标系、模型长度、目标路径点、路径切线与方向；形变代码利用这些数据沿曲线采样。相比单个 Contact 的径向距离，它能表达弯曲路径。

但它仍不是最终可见网格：顶点还会经过烘焙数据、激活权重、混合、半径调整、自定义材质处理等步骤。探针调用安装版本的 `sps_deform_walk_chain`，输出**未混合模型中心线**和 `firstSegmentStrength`，不复制一套近似曲线算法，也不宣称测到真实表面。`_SPS_Overrun` 从所选表面材质复制。

## 单侧角色与兼容边界

| 本地 / 对方 | 可行的信息来源 | 边界 |
| --- | --- | --- |
| 本地 SPS2 Plug / 对方 SPS2 Socket | 本地 Plug Resolver 选择的路径 | 对方不必装 Sensa；需实际渲染、标签/通道匹配且路径有效 |
| 本地 SPS2 Plug / 对方旧 Socket | 本地 Resolver 的旧版兼容解析 | 取决于旧版标记/灯光是否可见及兼容选项；不能承诺覆盖所有版本 |
| 本地 Socket / 对方 SPS2 Plug | 未来可研究筛选指向本地 Socket 的远端 Resolver | 本次未实现自动发现；不能用最近对象替代身份匹配；渲染裁剪/多个目标会影响可用性 |
| 本地 Socket / 对方旧 TPS/DPS Plug | 通常没有对方 SPS2 Resolver 可读 | 无法仅安装一个读取 SPS2 纹理的 Shader 就恢复对方旧 Shader 的最终形变；Contact 也只能保留为默认关闭的实验估计 |
| 任一侧 Shader 被屏蔽、未渲染或数据纹理不可用 | 无可靠模型数据 | 必须报告无效，不能继续使用最后一帧驱动设备 |

知道某个 Socket 的位置也不等于知道哪个 Plug 正在使用它。远端 Resolver 自动发现需以 Socket/Resolver 标识与路径关联筛选，避免同名、多对象、复制头像混入。Shader ID 不是可验证的玩家账号身份。

## 为什么不能直接用头像 AsyncGPUReadback 发 OSC

Shader 计算运行在 GPU，不会反向更新骨骼、Contact、Animator Float。VRChat 的 `VRCAsyncGPUReadback` 是**世界 Udon**接口；不能把 Udon 或普通 MonoBehaviour 回读脚本挂到头像上，指望上传后继续执行。OSC 头像参数也不是任意 GPU 纹理的导出接口。

因此这里的 EditorWindow 只能在 Unity 编辑器中运行。世界内原型可以另做 Udon 回读，但需要世界作者配合，而且 GPU→Udon 并不自动获得通用 UDP/OSC 发送能力。

## 编辑器实验安装

1. 满足 [Unity 包依赖](COMPATIBILITY.md)。额外通过官方渠道安装 VRCFury SPS2。适配器核对源版本为 `d048773de971881fb14c5f3b468e59ba2406a2dd`。
2. 仅支持 PC、Built-in Render Pipeline、非 XR/非立体 Camera、ARGBFloat 和 AsyncGPUReadback。先不要连接硬件。
3. 使用 SPS 正常的构建预览/Play Mode，让生成后的 Resolver 与表面材质实际出现在渲染场景中；仅选择上传前的作者组件不够。让测试 Socket 和 Plug 同时可见。
4. 打开 `Tools > Sensa > SPS GPU Model Probe (Experimental)`。指定正在渲染的 Camera、`BakedSpsPlug` 对应的 Resolver Renderer 和同一 Plug 的 Surface Renderer，工具自动读取关联材质及 Renderer 属性覆盖。VRCFury 的身份可能由 Animator 写入 MaterialPropertyBlock，仅读共享材质会得到零值。身份属性必须一致；多材质对象需确认选中的是对应 SPS 表面。
5. 点击“检查依赖并采集下一帧”。工具比对所依赖 SPS include 文件的规范化 SHA256；不匹配时停止。它不会修改、下载或内嵌 VRCFury 源码。不要自行删除校验来绕过未知版本。
6. 首次生成 `Assets/SensaGpuDiagnostics/SpsGpuProbe.shader`。模板在包中以 `.shader.txt` 保存，所以未安装 VRCFury 的普通 Sensa 项目不会因可选 include 缺失而报 Shader 编译错误。若生成路径有不同内容，工具停止，不覆盖用户编辑。
7. Shader 编译失败会停止采集。成功后等待所选相机渲染，单次读取 36×1 的线性浮点纹理；10 秒内相机未渲染则超时。33 点快照显示在 Scene 视图，可导出 `sensa.sps-gpu-model.v1` JSON。

生成的诊断 Shader 只用于该编辑器实验，不要分配到头像渲染器或发布为游戏内组件。结束实验后可以自行删除 `Assets/SensaGpuDiagnostics`；不会影响 Sensa 触点预制件。若移除 VRCFury，也需移除这个引用其 include 的生成文件。

### 采集限制

- 读取的是指定相机渲染结束时的全局 SPS 纹理。代码保持原相机尺寸用于 SPS 格子寻址，不能按 36×1 的回读尺寸解码原纹理。
- 校验单元魔数、协议版本、目标 ID、长度、方向与有限值；这些检查**不证明纹理新鲜度**。全局纹理可能保留旧帧或受其他相机影响，当前快照不是连接存活证据。
- 支持读取 Renderer 全局及逐材质 MaterialPropertyBlock；采集等待期间身份变化会拒绝结果。XR texture array、动态分辨率及多相机交错尚无可靠性保证。使用简单单相机测试场景验证，不能据此接通硬件。
- `firstSegmentStrength` 小于 1 时，未混合中心线与最终视觉结果可能不一致。即使等于 1，顶点级额外效果仍可能不同。
- 第一路径点/方向是 Resolver 的模型入口；可能包含半径偏移等处理，不能直接视为模型表面的真实接触平面。

## 离线分析

在主仓库执行（Python 标准库即可）：

```powershell
python -X utf8 scripts/analyze-gpu-capture.py path/to/sensa-gpu-capture.json
```

工具拒绝无效协议、缺点、NaN、非单位法线、部分混合、相切、共面、反向及多次穿越。输出包括：

- `polylineLengthMeters`：33 点折线弧长，曲率大时低估真实曲线长度。
- `materialFractionAfterPlane`：采样材料坐标在入口平面之后的比例；不是设备行程。
- `sampledArcAfterPlaneMeters`：交点后折线弧长。
- `entryPlaneOffsetMeters`：交点距离入口中心的偏移；没有自动判断真实孔口范围。

`usable` 仅表示满足单次模型平面穿越的分析条件。输出始终标记 `diagnosticOnly`，不发送 OSC，不改变 Sensa 映射，也不接管现有输出。该脚本可处理显式导出的本地 JSON，不会捕获桌面。

## 游戏内可继续实现的桥接

### 本次改进：曲线方向、孔径与采样诊断

离线分析器现在另外输出交点处采样弦方向 `entryTangent`、与入口平面的夹角 `incidenceDegrees`（90° 为垂直进入）、交点后弧长占采样总弧长比例 `sampledArcFractionAfterPlane`，以及 16 段与 32 段折线弧长之差 `coarseToFineArcDifferenceMeters`。材料参数比例与几何弧长比例不再需要混为同一个值。塌缩为零长度的段会拒绝分析，因为该处没有有效方向。

可显式提供校准后的孔径与最小入射角，例如：

```powershell
python -X utf8 scripts/analyze-gpu-capture.py capture.json --aperture-radius 0.04 --min-incidence-degrees 10
```

默认不猜测 Socket 孔径；显式指定后，中心线在圆孔之外穿越平面、或者入射角过浅，`usable` 会变为 false。半径用世界米，这仍是中心线/圆形入口模型，未计入截面厚度或复杂入口形状。对于折线顶点上的交点，方向取交点后那段弦的方向，不冒充解析曲线切线或最终网格法线。

粗细采样弧长差只能提示采样敏感度，**不是误差上界**：两个采样密度都可能遗漏更小尺度弯曲。后续提高采样数应同步升级 GPU 布局、回读器和协议，而不是插值已有 33 点后宣称增加精度。

### Shader 数据如何离开 GPU，以及时序为什么仍是边界

当前实验按指定相机渲染完成事件读取该相机产生的 SPS 数据纹理，通过目标/玩家 Shader 标识找到 Resolver 单元，调用安装版本的 SPS 曲线函数，在 36×1 浮点纹理中写入头、入口位置/方向和 33 个中心线点，再异步回读到编辑器。世界测试可使用 Udon 的 GPU 回读；头像上传后不能运行这个编辑器 C# 回读逻辑。[VRChat AsyncGPUReadback](https://creators.vrchat.com/worlds/udon/vrc-graphics/asyncgpureadback/)是世界 Udon 能力。

若未来接入桌面编码图块，可靠性需要同时处理：固定输出坐标、帧边界标记/长度/CRC、生产序号、超时停用和跨相机隔离。CRC 只能排除部分损坏，无法识别“完整但过期的一帧”。即使编码器给图块写了当前帧号，源 SPS 纹理如果仍是旧帧，图块也会把旧几何重新包装成新包；必须有源数据新鲜度或同一渲染阶段的保证。当前尚无这一完整桥接保证，新增几何指标不能解决它。

PB/Contact 不经过屏幕图块，因此避免窗口区域随转头移动的那类问题；Shader 中心线则能提供 PB/Contact 看不到的模型形变。二者测量对象不同，不能用 PB 的抓取点冒充渲染曲线，也不能以 GPU 模型快照保证真实设备时序。

本仓库 `tools/unity-world-lab` 已提供相机→RenderTexture→固定视口的原生组件实验预制件生成器，及世界 Udon 的编码/回读测试。编辑器旋转和 CRC 测试已通过；外部程序直接读取隐藏 RenderTexture、头像上传后头显不可见、Spout/窗口捕获时序均未因此得到验证。

候选客户端链路为：**本地 Shader 读取模型 → 编码图块 → 用户指定桌面区域 → 解码 → Sensa 独立输入源**。其中精确区域/PNG 解码与 OSC 诊断桥已实现，真实 GPU PNG 重放已经端到端验证；上传 Avatar 内的真实 SPS→图块生产端尚未接通。编辑器连续采集和 Avatar 的合成码测试必须分开理解。

编码图块应包含协议版本、目标标识、有效标志、帧序号、校验码和量化坐标；帧序号只反映编码器更新，还需确认底层 Resolver 数据没有陈旧。优先使用黑白分块、留白和冗余校验，不直接把浮点 RGBA 当作桌面截图字节。必须测试 HDR、后处理、抗锯齿、缩放、镜像、VR 双眼、窗口遮挡、最小化与低帧率。

桌面桥接需要明确选择捕获窗口/区域，并提供图块检测预览和随时停止；不注入游戏、不读取进程内存、不自动捕获全部屏幕。解码错误、目标变化、冻结/超时必须丢弃并停止精确输入，禁止静默回退 OGB。先记录延迟/丢帧，确认链路后才加入专门的输入模式与校准 UI。

精度验收应比较已知移动量、横移、倾角、弯曲、Pullout 混合和 Guided Path。至少将“Contact 直线估计”“模型曲线估计”“视觉网格参考”分开记录，才能判断形变数据到底改善了多少；不可用低拟合残差代替实际误差。

## 参考资料

- [VRCFury SPS2 官方说明](https://vrcfury.com/sps/)
- [SPS Resolver 数据布局](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/SPS/resolver/sps_resolver_payload.cginc)
- [SPS 形变与混合过程](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/SPS/deform/sps_deform_main.cginc)
- [VRChat 世界 Udon GPU 回读接口](https://creators.vrchat.com/worlds/udon/vrc-graphics/asyncgpureadback/)
- [VRChat Shader 屏蔽与回退](https://creators.vrchat.com/avatars/shader-fallback-system/)

依赖接口随 VRCFury 版本变化。项目只附带自己的适配器与依赖摘要，不附带第三方实现；安装和使用 VRCFury 应遵循其自身许可。
