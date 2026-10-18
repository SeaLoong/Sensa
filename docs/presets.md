# 映射预设

**简体中文** | [English](presets.en.md)

内置目录只保留五种常见输入。预设生成草稿；检查实际参数、来源和方向后保存，再明确启用输入。它不会连接设备，也不替代设备校准。

| 预设 | 用途 | 输入路径 |
| --- | --- | --- |
| 链路测试 | 测试世界到自己 Avatar 的接收链路；Active 门控 | `Sensa/QuickStart/Depth`、`Sensa/QuickStart/Active` |
| SPS Socket · 径向估算 | VRCFury 根部／长度球的归一化径向估算 | `OGB/Orf/*/PenOthersNewRoot`，自动读取同源同实例 NewTip |
| SPS Plug · 近接 | VRCFury Plug 根部近接；默认不反向 | `OGB/Pen/*/PenOthers` |
| OGB · 触碰振动 | 他人触碰／摩擦映射到 V0 | `OGB/Orf/*/TouchOthers`、`FrotOthers` 及对应 `OGB/Pen/*/` 路径 |
| PB · 拉伸 | 原生 PhysBone Stretch，IsGrabbed 门控 | `Sensa/Lab/PB_Stretch`、`Sensa/Lab/PB_IsGrabbed`；实际使用须替换 |

## 先确认生成器

现代 VRCFury 把 Socket 的 OSC ID、Plug 名称中的 `/` 替换为 `_`，因此各占一个路径段。Socket 的现代成对参数是 `PenOthersNewRoot`／`PenOthersNewTip`，自身交互对应 `PenSelfNewRoot`／`PenSelfNewTip`。运行时映射 NewRoot 即可，NewTip 由同一来源、同一实例读取。自身交互可复制草稿后改成实际 Self 路径。[Socket 生成源码](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L180-L274)

VRCFury Plug 的 `PenOthers`／`PenSelf` 接收器在根部，半径等于长度；不应套用旧尖端接收器的默认反向。[Plug 生成源码](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L176-L242)

Sensa 传统作者组件采用 `OGB/Orf/<类型>/<实例>/...`，部分旧 Avatar 使用其他路径；这些不能冒充现代 VRCFury 的通用预设。请从参数列表添加实际路径。旧身体部位固定路径、通用 Angle 原始近接组合和默认反向 Plug 模板已移除。

## 径向估算的边界

NewTip 是根部同心的长度球，不是物理尖端。先从外部靠近，在长度球未饱和时学习长度，再计算径向比例；侧向偏移和倾斜仍会改变结果。它不是世界坐标、轴向插入深度或形变表面的真值。更换目标后应重新学习；参数缺失或异常不能靠增加旧别名补齐。定位的完整边界见[定位说明](positioning.md)。

## 自定义与轴配置

可以替换／追加预设、编辑单条映射，或把当前映射保存成自定义预设。内置项可复制，不能直接覆盖。删除推荐模板不会删除已经保存的用户映射；旧空间映射默认被实验开关阻断。

映射决定“输入是什么、送到哪一轴”；轴配置决定每个输出的限位、反向、速度、锁定和忽略。首次 OSR 测试使用小行程轴配置，并核对设备中位。不要在映射与输出两处重复反向。

没有默认 Contact 定位预设。Point、Handle、Pose 留作高级实验，必须显式开启实验输入；标准 Root／SharedRoot 仅诊断。原生 PB 拉伸不需要重建 XYZ。

[使用指南](guide.md) · [首次测试](quick-start.md) · [功能参考](features.md)
