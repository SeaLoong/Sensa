# Sensa

**简体中文** · [English](README.md) · [文档站](https://sealoong.github.io/Sensa/) · [参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html) · [下载](https://github.com/SeaLoong/Sensa/releases)

[![CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)

**把虚拟交互和 funscript 轨迹转换为设备控制目标。** Sensa 是本机桌面服务，浏览器工作台支持 TCode 串口／UDP／TCP，以及 Intiface／Buttplug。

## 先建立一个明确的小量程闭环

1. 下载 Windows、Linux 或 macOS 的 x64／ARM64 压缩包并解压。
2. 运行 Sensa，打开 **http://127.0.0.1:5086**。新会话的输入和输出默认关闭。
3. 添加输出，核对目标，**启用该输出**后连接。Intiface 默认连接已有服务，需要先独立启动 Central。
4. 应用**手动**、启用输入，发送小目标检查方向／量程。关闭输入后准备 OSC 或 funscript；应用新方式，准备好再重新启用。

保留急停入口。解除急停不会恢复输入；保存配置、更换实际模式或替换脚本后须重新启用。界面位置是**命令目标，不是硬件回读**。

[首次使用](docs/quick-start.md) · [工作台指南](docs/guide.md) · [功能参考](docs/features.md)

## 按实际数据选择方案

| 路线 | 提供什么 | 主要限制 |
| --- | --- | --- |
| **已有 OGB / SPS** | 现代 Root／Tip 径向估算、旧近接与触摸强度 | 外部互通，不是 XYZ 或通用准确插入深度 |
| **Sensa SPS** | 固定 P0–P3 和专用标记，重建所选根点的 Avatar 根局部位置 | 仅自己的 Avatar；覆盖、缩放和采样仍属实验限制 |
| **Shader 捕获** | 原生根点编码、明确桌面区域与校验桥输出根坐标 | PC 实验；真实 VRChat／HMD 捕获尚未验收 |

Sensa SPS 每对象有五个测量字段：`Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`。四个已知非共面锚点到同一点的距离足以定位；任意四个近接值不能证明目标身份或共同采样帧。Shader 使用 `Sensa/Shader/<id>/{Frame,X,Y,Z,Valid}`，测根 Transform，不测最终形变网格。两者都需要实验许可与校准映射。

[方案选择](docs/usage-scenarios.md) · [OSC 字典](docs/osc-parameters.md) · [定位与限制](docs/positioning.md) · [OGB 兼容](docs/ogb-compatibility.md)

## 不接设备也能理解参数

[独立参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)无需启动 Sensa 或连接设备。十个模拟场景展示接收器、发送器、Socket／Plug 参考外形、固定锚点和 Shader 编码；可旋转 3D、在指定平面拖点，也可使用精确滑条和 SVG 投影。

发行包包含 `docs/parameter-geometry.html` 及本地资源，可离线打开。页面自动识别浏览器语言并保存明确选择，也支持 [?lang=zh-CN](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN) 和 [?lang=en-US](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US)。

## Unity 与发布

[Unity 作者包](unity/top.sealoong.sensa/README.zh-CN.md)在构建时生成允许上传的原生 Avatar 组件，不在上传后运行任意 C#。Avatar／World 实验工具为可选开发设施，需要自己的授权资源。

[Releases](https://github.com/SeaLoong/Sensa/releases)提供桌面预览与 Unity ZIP。**VPM 只收录 Unity 正式包**，保留已校验历史版本及归档。GitHub 当前没有稳定 Release 不等于历史 VPM 不存在；只有没有可验证包时才显示不可用，预览和当前开发不自动成为 VPM 正式版。

[文档站](https://sealoong.github.io/Sensa/)独立随 main 发布，不等待 Unity 稳定版。[语言规则](docs/languages.md)

## 开发与证据

参见[架构](docs/architecture.md)、[验证流程](docs/development.md)和[视觉审阅](docs/ui-visual-review.md)。本机先用 `python -X utf8 scripts/verify.py --plan` 规划，再运行 `scripts/verify.py`。浏览器 E2E、截图、完整进程冒烟与 World PlayMode 仅在 Actions；设备测试使用模拟传输。

几何、作者生成与模拟线包检查不能证明真实 VRChat Contacts、客户端捕获、头显可见性、定位准确度或机械动作。

[MIT 许可](LICENSE) · [术语表](GLOSSARY.md)
