# 三个映射模板

**简体中文** | [English](presets.en.md)

模板描述已存在的参数，不负责安装或生成 SPS。SPS Socket／Plug 的 haptics 共用 OGB 命名；合成阶梯与固定部位别名不再作为内置方案。Sensa SPS 和 Shader 坐标必须选择实际生产端并校准，不能用通配模板猜测坐标量程。

| 模板 | 解释器 | 实际输入 |
| --- | --- | --- |
| OGB / SPS · 深度 | `OgbDepth` | 同来源、完整实例、Self／Others 下的现代 Root／Tip 或旧单接近值 |
| OGB / SPS · 振动 | `OgbTouch` → V0 | Touch／Frot 与其所需的 Close 门控 |
| PhysBone · 拉伸 | Direct＋GateEnable | `MyPB_Stretch`、`MyPB_IsGrabbed`；将 MyPB 换成实际前缀 |

## OGB 的新旧兼容

深度默认匹配 Others：

```text
OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers
```

不需要再把 Tip／Close 添加为独立输出映射。Socket 任一现代通道为正时优先配对；缺另一通道或未估长时为零，不跳到旧的大值。现代通道均零或没有时回退旧 PenOthers；旧 Socket Close 若存在还需开放。Plug 读取自身近接值，不统一反向。旧版并不必然只有一个触发器，官方 OGB v1 已有两种能力；检测实际参数比判断版本更准确。

触碰默认匹配：

```text
OGB/Orf/**/TouchOthers;OGB/Orf/**/FrotOthers;OGB/Pen/**/TouchOthers;OGB/Pen/**/FrotOthers
```

TouchSelf／Others 需同对象对应 Close；Plug FrotOthers 需其 Close，Socket FrotOthers 直接使用。缺门控时不会把原始近接误当触碰。若确实需要原始数值，可以明确改为 Direct。

`**` 仅用于发现完整实例；日常控制应固定对象、来源，Self 与 Others 不能交叉配对。Sensa 在同一组内去重，不把新旧信号重复融合。详细规则与固定上游源码见 [OGB 兼容研究](ogb-compatibility.md)。

## 使用和保存

1. 先在参数页确认真实路径。需要时显式启用 `OGB_ENABLED` 心跳。
2. 选择模板，“替换草稿”后核对路径、角色和范围；追加模板时检查已有门控。
3. 保存映射会关闭输入；准备状态会区分已保存配置与草稿。
4. 检查实际来源与输出特征后再启用。振动默认发往 V0；Intiface 要将深度用于振动时，明确选择 L0。
5. 内置模板不能直接覆盖；复制为自定义模板后修改。

原生 PB 的标量校准与坐标端点校准不同；不要给普通 Stretch 凭空添加 XYZ。坐标路线见 [使用方案](usage-scenarios.md) 和 [定位协议](positioning.md)。
