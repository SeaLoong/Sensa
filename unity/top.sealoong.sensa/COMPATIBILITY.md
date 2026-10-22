# 依赖与测量边界

**简体中文** | [English](COMPATIBILITY.en.md)

采用 `package.json` 的依赖，包括 NDMF 1.5.0+ 与 Modular Avatar 1.10.0+。VRCFury SPS 是可选的目标作者集成；明确选择骨骼／空物体 Transform、Sensa 或原生 Contact 根点时，可独立于 VRCFury 使用。适配器检查所选根点支持的几何，外部 OGB 路径保留其上游含义。

作者设置由统一 NDMF 插件生成，再交给 MA 合并。全部作者脚本实现 `IEditorOnly`，在构建副本中完成处理后移除；宿主与生成组件保留。SDK 检查会报告尚未处理的作者配置，便于恢复 NDMF 构建处理或调整后插入工具。具体顺序与官方依据见[构建指南](https://github.com/SeaLoong/Sensa/blob/main/docs/unity-build.md)。

## 各路线能观测什么

| 输入 | 测量 | 参照与用途 |
| --- | --- | --- |
| 四点定位 | 所选单根的 AvatarRootLocal 制作单位坐标 | 四个固定 Receiver 与一个专用自身根点 Sender |
| Contact 直接定位（SDK Beta） | 所选单根的 AvatarRootMeters 位置及 m/s 接触点相对速度 | 一个 Receiver 与一个专用自身根点 Sender；使用 SDK 高级 Proximity 参数 |
| 配对 Root／Tip／Side Pose | 已知配对框架内的直线姿态实验 | 布局明确的配对标记 |
| OGB NewRoot／NewTip | 根球长度／径向估计 | 同实例近接配对与校准后的深浅趋势 |
| 原生 PB Stretch／IsGrabbed | 拉伸强度与抓取门控 | PhysBone 参数的标量联动 |
| 原生 Shader 根点 | AvatarRootLocal 制作单位下的根 Transform 编码 | 独立渲染器与桌面捕获桥 |

四点定位通过四个已知非共面锚点到同一点的距离确定位置；共同平移或旋转保持这些距离，坐标使用 Avatar 根的制作局部单位。可测区域是接收器共同覆盖与坐标边界内的有效区域。Contact 直接定位报告发送形状中点相对零偏移 Avatar 根 Receiver 的位移，各轴随根旋转，保留物理米单位。根点静止时，只要接触、类型和活动有效，零坐标或零速度也可保持有效。

## 半径与缩放

四点定位的球形近接未饱和且使用共同均匀缩放时，`p=1−(d−r)/R`，所以 `d=(1−p)R+r`；在局部单位中共同缩放消去。此处 R=2、r=0.001。非均匀缩放或 SDK 半径截断会破坏模型。

两种根点方案都遵循 VRChat 的 3 m 世界半径上限。构建要求正数均匀根缩放，并检查已知根缩放动画／约束。IsLocal、ScaleFactor 与选择门控在停用时关闭 Contact 并清零该方案的公开值，使 Receiver 保持在约 2.999 m 内。Contact 的 `Radius` 报告包含制作缩放与 ScaleFactor 的实际世界半径；标记跟随所选根点，不继承目标骨骼缩放。

四点距离解算中，接收半径减小可降低同等近接误差引起的坐标误差，但会失去覆盖；扩大锚距改善部分条件数，同时缩小共同覆盖。评估精度时同时记录半径、几何条件和实测误差。低残差用于检查测量一致性；滤波保留即时失效和停止行为。[官方 Contact](https://creators.vrchat.com/common-components/contacts/)

## 参数与生命周期

四点定位保留 `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`，共五个本地、不同步的 Float 表达参数，RawP 留在 FX。Contact 直接定位使用 `Sensa/Contact/<id>/` 下十个原生报告字段，加上 `Radius` 和 `Sample`，共十二个公开字段；`Proximity_SenderType` 为 Int，其余十一个为 Float。SDK 所需的 `Proximity_CollisionTag_<tag>` Bool 在 FX 中声明，停用时复位，位于公开表达参数契约之外；客户端 OSC 可见性另行检查。Exclusive 另有不同步、不保存的 Int 菜单选择器。[完整含义](AUTOMATION.md)。

两种方案均要求同来源实例字段完整、Sample 合法且持续变化。四点定位另检查未饱和值与拟合一致性，Sample 默认寿命为 1000 ms、上限 1250 ms；Contact 要求 Proximity 为正、SenderType=1、数值有限且 Radius／位置边界受支持，Sample 寿命最多 1000 ms。较短的正数输入超时可进一步收紧两者时效。缺失、无效或过期观测会停止相关动作，Contact 的零坐标和零速度仍可有效。Sample 表示生产端活动，专用标签与 Self 过滤用于选择期望的自身根点；原生 Contact 报告未提供时间戳、序号或稳定 Sender ID。

Point／Handle／Pose 仍用独立协议和最旧参与通道时效。旧 Sensa SPS 应重建头像与映射，不做转换。

## 语言与验收

编辑器语言仅改变呈现，偏好保存在用户设置而非 Avatar 数据。菜单注册路径、序列化字段、枚举值和 OSC 标识保留英文 ID。Avatar 菜单标题使用作者构建时语言，不是按客户端运行时翻译。

EditMode 契约覆盖生成几何、可写 FX、参数、菜单、缩放门控和预算。本次新增的作者生命周期和定位契约尚未在 Unity Editor 中执行；SDK 安装包／程序集核验与隔离测试按各自记录的范围提供依据，实际 Unity／VRChat 客户端 OSC、渲染和硬件验收另行安排。

[安装](README.zh-CN.md) · [自动配置](AUTOMATION.md) · [Shader 验收](GPU-TRACKING.md) · [参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)
