# Sensa Unity 组件包

[English](README.md) | **简体中文**

在 VRChat Avatar 构建时生成原生 Contact、约束、FX 参数和可选根点编码渲染组件。已有 OGB/SPS 参数可直接使用桌面映射，不必安装本包。

[交互参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)解释几何和参数前缀；它是独立离线示意，不连接 OSC 或设备。仓库和桌面发行包的 `docs/parameter-geometry.html` 保留离线页面。

## 安装与语言

1. 使用 VCC/ALCOM **Avatars** 工程，满足 `package.json` 的 Unity 版本和 VPM 依赖。使用 VRCFury SPS 作者组件时另行安装官方 VRCFury。
2. 解压 Unity ZIP，在 Package Manager → **Add package from disk** 选择 `package.json`。这不会自动安装缺少的 VPM 依赖。
3. Sensa Inspector 和 **Preferences → Sensa** 提供自动、English、简体中文。显式选择按编辑器用户持久保存。自动模式优先实际编辑器界面语言，API 不可用时采用系统语言；中文变体统一简中，其他不支持的语言回退英语。
4. 编辑器菜单注册路径、序列化字段和 OSC 标识保留稳定英文 ID。Avatar 表达菜单文字采用作者**构建时**语言，不会针对每个穿戴者单独翻译。

历史 VPM 索引可能提供较旧组件包；开发预览不会更新该稳定索引，请先核对安装版本再采用当前指南。ZIP 不含 VRCFury、付费模型、Worlds SDK 或运行时 Udon。构建后移除作者组件。实验工具源码应分别安装到匹配类型的工程。

## 选择测量路线

| 路线 | 配置 | 含义 |
| --- | --- | --- |
| 已有 OGB | 配置原 SPS/OGB 与桌面映射 | Touch 标量或径向深度估计；[外部兼容](https://github.com/SeaLoong/Sensa/blob/main/docs/ogb-compatibility.md) |
| 四点定位 | 添加 **Sensa → Automatic SPS Setup**，或 **Four-anchor tracking** 并明确指定 Target | 所选根点的 AvatarRootLocal 坐标，不是尖端、姿态或世界位置 |
| Contact 直接定位（SDK Beta） | 在自动配置中选择 **Contact 直接定位（SDK Beta）**，或添加对应预制件并明确指定 Target | 专用 Sender／Receiver，输出根点米制坐标与 SDK 相对速度；需要高级接近参数 |
| 原生根点编码 | 添加 **Shader Root Capture (Experimental)** | 独立[相机／桌面桥](GPU-TRACKING.md)，不靠 Contact 三角解算 |
| 独立 Point／Handle／Pose | 选择本地标记或相同通道的配对标记 | 各自拥有协议与时效规则的实验 |

新自动组件默认“一次选择一个目标”（Exclusive），初始关闭；“分别启用目标”（Dedicated）允许同时测量。Avatar 菜单选择目标后，桌面输入仍需单独启用，设备也需单独连接。

## 固定 SPS 会生成什么？

`Sensa/SPS/<id>/P0` 至 `P3` 是四个近接值；`Sample` 无效时为 0，活动时依次发布 n/32（n=1…32）。四个已知非共面锚点可重建一个局部点。共享中心 (0,1,0)、半跨度 0.35、接收半径 2、专用标记半径 0.001。只生成 Self，每个目标占五个 Contact。

在 Unity Scene 中检查绿色共同覆盖截面：只有同时落在四个接收球内的点才可能被定位，橙色小区提示测量点附近的饱和盲区。Shader 显示完整可编码方框，它没有 Contact 半径。

几何或生成组件变化后，应重新构建 Avatar，桌面程序也须使用匹配的共享协议。生成组件应整组替换。

坐标采用 Avatar 根局部单位，整体世界运动不改变它。缩放必须均匀，构建检查和内部 ScaleFactor 门禁限制世界半径；显示方框不等于保证接收范围。[几何、测量／控制参数与停止](AUTOMATION.md)

## 允许动作前先观察

在 Sensa 应用 OSC 模式，打开 **OSC → 实验诊断 → 本地点与根部**。固定真实实例／来源，检查变化的 Sample 与有效坐标，采集两个端点，再检查并保存映射草稿。实验许可默认关闭，且独立于输入启用。

Sample 变化只说明发布活动，不证明 Contact 同帧、所有者身份或实测精度。缺失、无效或过期观测会停止动作。旧 Sensa SPS 路径不支持，升级后重建 Avatar 和映射。

单元／EditMode 与模拟传输不能代替上传客户端、VR 抓取、桌面／HMD 捕获或硬件验收。QuickStart 仅保留为隐藏的合成实验室 fixture，不是产品推荐路线。

[自动配置](AUTOMATION.md) · [依赖与限制](COMPATIBILITY.md) · [Shader 捕获](GPU-TRACKING.md)
