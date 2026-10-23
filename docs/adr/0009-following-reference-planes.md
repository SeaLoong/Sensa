# Following reference planes / 跟随参考平面

## Geometry / 几何含义

位置、距离和姿态分别描述不同的观测。Contact 的球心随其参考 Transform 移动；球形接近值描述径向距离。确定方向需要额外的独立测量，例如三个定位点、Shader 的两条实测轴，或局部参考下的三点姿态。SPS 四点定位和 Shader 保留 AvatarRootLocal；Contact 直接定位保留 AvatarRootMeters。

Position, distance and orientation describe different observations. A Contact sphere follows its reference Transform, while spherical proximity reports radial separation. Orientation requires independent measurements such as three tracked points, the two measured Shader axes or the existing three-marker pose in a local reference. SPS four-anchor tracking and Shader retain AvatarRootLocal; Contact direct tracking retains AvatarRootMeters.

给定测量点 `P`、参考原点 `O` 和单位法线 `n`，深度为 `dot(P−O,n)`，平面内偏移为 `length((P−O)−n·depth)`。动态定位可提供 `O` 和 `n`，从而同时适用于测量点移动、参考平面移动或双方共同移动。法线长度在计算时归一化，输出单位沿用位置单位。方向与法线的夹角为 0～180°；方向相对平面的有符号夹角为 −90～90°。

For measured point `P`, reference origin `O` and unit normal `n`, depth is `dot(P−O,n)` and in-plane offset is `length((P−O)−n·depth)`. Live tracking can supply `O` and `n`, covering movement of the point, the reference plane or both. Calculations normalize the normal and retain the position unit. Direction-to-normal angle is 0–180°; signed direction-to-plane angle is −90–90°.

## Authoring / Unity 配置

`SensaTrackingFrame` 是构建时使用的 `IEditorOnly` 作者组件。它以所选目标的平移和旋转建立刚性参考，生成 Origin、Forward、Right 三个测量点，使用既有 SPS 四点或 Contact 协议。`Forward−Origin` 定义虚拟平面的正法线；`Right−Origin` 定义横向。各点保留同一坐标框和不同实例名，沿用原有有效性、采样活动与覆盖范围检查。

`SensaTrackingFrame` is an `IEditorOnly` build-time authoring component. A rigid reference follows the selected target's translation and rotation and generates Origin, Forward and Right measurement points through the existing SPS four-anchor or Contact protocol. `Forward−Origin` defines the virtual plane's positive normal; `Right−Origin` defines its lateral direction. Points share a coordinate frame and use distinct instance names, retaining existing validity, sampling-activity and coverage checks.

根点和跟随平面用于同一 Avatar 内的相对测量，配置时选取具有共同原点的目标与参考。跨 Avatar 的孔口互动使用双方配对的 `SensaPoseSocket`／`SensaPosePlug`：本机 Socket 读取 Others 的三标记距离，在自身局部参照中解算现有深度、孔口偏移及姿态指标，并保留拟合、时效、倾角和孔口条件。OSC 来源与坐标框标签用于检查协议相容性；共同原点由作者配置确定。

Root tracking and following planes measure relative geometry within one Avatar; authoring selects targets and references with a shared origin. Cross-avatar aperture interaction uses paired `SensaPoseSocket`/`SensaPosePlug` components: the local Socket reads the three Others markers' ranges and reconstructs existing depth, aperture-offset and pose metrics in its own reference, retaining fit, freshness, tilt and aperture conditions. OSC provenance and coordinate-frame tags check protocol compatibility; authoring establishes the shared origin.

Shader 保留 32 字节测量包与 QR 纠错布局。作者可设置测量原点和轴向；同一读屏进程读取多个编码块并通过同一个 OSC 来源发布，使目标与参考测量可以参与共同计算。它报告的 X/Z 轴来自实际采样三角形。取其中一轴为法线时，定义的是垂直于该轴的工作平面；需要实际采样平面时，使用两轴叉积。非均匀缩放和剪切下，这两个定义可能得到不同结果。

Shader retains the 32-byte measurement packet and QR error-correction layout. Authors can configure the measured origin and axes. One reader process captures multiple tiles and publishes them through one OSC source, allowing target and reference measurements in a shared calculation. Reported X/Z axes come from the actual sampled triangle. Treating one as a normal defines a working plane perpendicular to that axis; their cross product defines the actual sampled plane. Non-uniform scale and shear can produce different results for these two definitions.

## Evaluation / 求值

计算图提供两点距离、法线定义的平面深度／偏移、双轴定义的平面深度／偏移，以及方向夹角和平面夹角。界面按 XYZ 分组配置，跟随平面模板生成可编辑的计算草稿。方向、位置、角度和速度保留各自用途；计算核对坐标框、同一来源和时效，并沿依赖链传播无效状态。零方向或共线双轴得到无效结果。保存配置与启用输入继续使用原有控制流程。

The calculation graph provides point distance, plane depth/offset from a normal, plane depth/offset from two axes, vector angle and plane angle. The editor groups XYZ components and creates editable calculation drafts from a following-plane template. Directions, positions, angles and velocities retain their roles; calculations check frames, shared provenance and freshness, propagating invalidity through dependencies. Zero directions or collinear axes produce invalid results. Saving and input activation retain the existing control workflow.

[配置与例子](../computed-signals.md) · [Configuration and examples](../computed-signals.en.md) · [Unity 定位](../positioning.md) · [Unity tracking](../positioning.en.md)
