# One current root contract and explicit spatial permission / 单一当前根点契约与明确空间许可

固定 SPS 只支持无版本路径中的 P0–P3 与合并有效性／采样活动的 Sample；Unity／桌面共享唯一几何，删除旧八路、移动参考、Others 和协议别名，减少错误组合与重复常量字段。静止距离允许缓存，并以内容变化的 Sample 判断生产端活动；这是对 delta-only 实用性的取舍，不证明 Contact 同帧或无丢包，内部缩放门禁仍必须保留。Shader 用独立原生命名空间、同来源完整五字段与变化 Frame，诊断另行隔离；独立 Point／Handle／Pose 保留各自时效，所有空间映射仍需实验许可与输入启用，失效即停止，任何 CRC、ID 或残差都不是所有者认证或世界真值。[参数与限制](../osc-parameters.md)

Fixed SPS supports only unversioned P0–P3 and Sample combining validity with sampling activity. Unity/desktop share one geometry; old eight-range, moving-reference, Others and alias branches are removed to avoid mixed models and repeated constants. Stationary ranges may be cached while changing Sample proves producer activity, trading atomicity claims for usable delta-only input; internal scale guards remain essential. Shader uses a separate native namespace, five complete same-source fields and a changing Frame, with diagnostics isolated; independent Point/Handle/Pose retain their own age rules, and every spatial mapping still requires explicit experimental/input permission and stops on invalidity—CRC, identity and residual are neither owner authentication nor world truth. [Parameters and limits](../osc-parameters.en.md)

## Coverage and image alignment / 覆盖范围与画面对齐

定位接收球统一采用 2 m 半径，测量点沿各坐标轴偏移 ±0.35 m，点间距约 0.990 m。SDK 的 3 m 世界半径上限仍限制可用根缩放。有效区域必须满足全部距离测量、未饱和与解算边界，不能把单个接收球或坐标立方体当作完整覆盖区域。固定 SPS 与 Shader 的根点坐标边界统一为相对中心 (0, 1, 0) 各轴 ±2 m；Shader 无 Contact 接收球，单独展示其编码边界。

Positioning receivers use a 2 m radius with measurement points offset ±0.35 m along each coordinate axis, giving approximately 0.990 m between points. The SDK's 3 m world-radius limit still constrains usable root scaling. Usable coverage requires every distance measurement, unsaturated values and the reconstruction bounds; neither one receiver sphere nor the coordinate cube represents full coverage. Fixed SPS and Shader root coordinates allow ±2 m per axis relative to (0, 1, 0). Shader has no Contact receiver spheres, so its encoding bounds are shown separately.

原生 Shader 图块把定位图案移到数据区外的边缘。冗余边缘用于检测小幅截取偏移，CRC 用于拒绝损坏的数据；不根据上一帧猜测或填补坐标。边缘定位不能修复渲染延迟、跨帧混合或冻结，仍须通过完整包校验与帧变化检查。诊断 PNG 保留独立的实验编码，不作为真实客户端捕获证据。

The native Shader tile places alignment patterns along the edges outside its payload. Redundant edges detect small capture offsets, and CRC rejects damaged data; coordinates are never guessed or filled from an earlier frame. Alignment does not repair render delay, mixed frames or freezes, so complete-packet validation and changing-frame checks remain required. Diagnostic PNGs retain their separate lab encoding and do not establish real-client capture.
