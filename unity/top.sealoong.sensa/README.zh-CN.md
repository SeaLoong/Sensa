# Sensa Unity 组件包

[English](README.md) | **简体中文**

Sensa 的 Unity 组件保存定位与参数设置，在 Avatar 构建时生成原生 Contact、约束、FX 动画、参数和菜单。已有 OGB/SPS 的 Avatar 也可直接在桌面应用配置映射。

[交互参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)解释几何和参数前缀；可独立浏览几何与读数，并离线打开。仓库和桌面发行包的 `docs/parameter-geometry.html` 保留离线页面。

## 安装与语言

1. 使用 VCC/ALCOM **Avatars** 工程，满足 `package.json` 的 Unity 版本和 VPM 依赖，包括 NDMF 1.5.0+ 与 Modular Avatar 1.10.0+。使用 VRCFury SPS 作者组件时另行安装官方 VRCFury。
2. 解压 Unity ZIP，在 Package Manager → **Add package from disk** 选择 `package.json`。通过 VCC/ALCOM 补齐列出的 VPM 依赖。
3. Sensa Inspector 和 **Preferences → Sensa** 提供自动、English、简体中文。显式选择按编辑器用户持久保存。自动模式优先实际编辑器界面语言，API 不可用时采用系统语言；中文变体统一简中，其他不支持的语言回退英语。
4. 编辑器菜单注册路径、序列化字段和 OSC 标识保留稳定英文 ID。Avatar 表达菜单文字采用作者**构建时**语言，不会针对每个穿戴者单独翻译。

历史 VPM 索引可能提供较旧组件包；开发预览不会更新该稳定索引，请先核对安装版本再采用当前指南。ZIP 不含 VRCFury、付费模型、Worlds SDK 或运行时 Udon。构建在副本上生成原生组件并移除作者脚本。实验工具源码应分别安装到匹配类型的工程。

## 选择测量路线

| 路线 | 配置 | 含义 |
| --- | --- | --- |
| 已有 OGB | 配置原 SPS/OGB 与桌面映射 | Touch 标量或径向深度估计；[外部兼容](https://github.com/SeaLoong/Sensa/blob/main/docs/ogb-compatibility.md) |
| SPS 四点定位 | 添加 **Sensa → Automatic SPS Setup**，或 **SPS four-anchor tracking** 并明确指定 Target | 以 Avatar 根为参照的根点位置，使用 AvatarRootLocal 制作单位 |
| Contact 直接定位（SDK Beta） | 在自动配置中选择 **Contact 直接定位（SDK Beta）**，或添加对应预制件并明确指定 Target | 专用 Sender／Receiver，输出根点米制坐标与 SDK 相对速度；需要高级接近参数 |
| Shader 根点捕获 | 添加 **Shader Root Capture (Experimental)** 或 `SensaShaderCapture.prefab`，明确指定 Target | 把 AvatarRootLocal 根点位置编码为图块，经[桌面桥](GPU-TRACKING.md)读取 |
| 独立 Point／Handle／Pose | 选择本地标记或相同通道的配对标记 | 各自拥有协议与时效规则的实验 |

三个根点预制件都接受 Avatar 内的骨骼／空物体 Transform、SPS、Sensa Component 或原生 Contact。SPS 四点定位与 Contact 实例默认为 `Root`；复制后改为唯一实例名，空碰撞通道会按实例名稳定分配。菜单创建时会填写能明确识别的选中目标，请复核 Target。

新自动组件默认“一次选择一个目标”（Exclusive），初始关闭；“分别启用目标”（Dedicated）允许同时测量。Avatar 菜单选择目标后，桌面输入仍需单独启用，设备也需单独连接。

## 构建时怎样生效

九类作者脚本均实现 `IEditorOnly`。统一的 NDMF 插件在 Generating 阶段先于 Modular Avatar 生成 Contact 与临时动画／参数／菜单，再由 MA 合并。生成后移除作者脚本，宿主对象、参照 Transform 与原生测量组件保留。宿主使用普通 GameObject；`EditorOnly` 对象标签用于会整组删除的纯编辑辅助内容。

SDK 检查点会核对作者已被处理。若关闭了 NDMF 构建处理，或其他工具较晚插入 Sensa 作者组件，构建会列出剩余类型，便于调整设置与顺序。完整阶段、官方资料和基础组件行为见[Unity 构建指南](https://github.com/SeaLoong/Sensa/blob/main/docs/unity-build.md)。

## SPS 四点定位会生成什么？

`Sensa/SPS/<id>/P0` 至 `P3` 是四个近接值；`Sample` 无效时为 0，活动时依次发布 n/32（n=1…32）。四个已知非共面锚点可重建一个局部点。共享中心 (0,1,0)、半跨度 0.35、接收半径 2、专用标记半径 0.001。只生成 Self，每个目标占五个 Contact。

在 Unity Scene 中检查绿色共同覆盖截面：只有同时落在四个接收球内的点才可能被定位，橙色小区提示测量点附近的饱和盲区。Shader 显示完整可编码方框，它没有 Contact 半径。

几何或生成组件变化后，应重新构建 Avatar，桌面程序也须使用匹配的共享协议。生成组件应整组替换。

坐标采用 Avatar 根局部单位，整体世界运动不改变它。缩放必须均匀，构建检查和内部 ScaleFactor 门禁限制世界半径；显示方框不等于保证接收范围。[几何、测量／控制参数与停止](AUTOMATION.md)

## 允许动作前先观察

在 Sensa 应用 OSC 模式，打开 **OSC → 实验诊断 → 本地点与根部**。固定真实实例／来源，检查变化的 Sample 与有效坐标，采集两个端点，再检查并保存映射草稿。实验许可默认关闭，且独立于输入启用。

Sample 反映持续发布活动；实际客户端还需核对目标、字段一致性和测量精度。缺失、无效或过期观测会停止动作。旧 Sensa SPS 路径不支持，升级后重建 Avatar 和映射。

单元、包检查和模拟传输按各自范围记录；Unity Editor、上传客户端、VR 抓取、桌面／HMD 捕获和设备响应分别验收。QuickStart 保留为内部合成实验室 fixture。

[构建流程](https://github.com/SeaLoong/Sensa/blob/main/docs/unity-build.md) · [自动配置](AUTOMATION.md) · [依赖与限制](COMPATIBILITY.md) · [Shader 捕获](GPU-TRACKING.md)
