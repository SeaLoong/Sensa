# Sensa

**简体中文** · [English](README.md) · [文档站](https://sealoong.github.io/Sensa/) · [参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html) · [下载](https://github.com/SeaLoong/Sensa/releases)

[![CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)

**让设备跟随 VRChat 交互或 funscript 动作脚本。** Sensa 在你的电脑上运行，通过浏览器配置输入和设备。它支持 TCode 串口／UDP／TCP，以及 Intiface／Buttplug。界面显示准备发送给设备的位置或强度。

## 第一次使用：先检查方向和行程

1. 下载 Windows、Linux 或 macOS 的 x64／ARM64 压缩包并解压。
2. 运行 Sensa，打开 **http://127.0.0.1:5086**。新会话的输入和输出默认关闭。
3. 添加输出，核对目标，**启用该输出**后连接。Intiface 默认连接已有服务，需要先独立启动 Central。
4. 应用**手动**、启用输入，发送小目标检查方向／量程。关闭输入后准备 OSC 或 funscript；应用新方式，准备好再重新启用。

保留急停入口。解除急停不会恢复输入；保存配置、更换实际模式或替换脚本后须重新启用。界面位置是**命令目标，不是硬件回读**。

[首次使用](docs/quick-start.md) · [工作台指南](docs/guide.md) · [功能参考](docs/features.md)

## 我应该选择哪种接入方式？

| 路线 | 提供什么 | 主要限制 |
| --- | --- | --- |
| **已有 OGB / SPS** | 读取 Avatar 已有的接近、触摸和深度相关参数 | 无需修改 Avatar；通常只能估算深度，不能获得三维位置 |
| **Sensa SPS** | 在自己的 Avatar 上添加测量组件，计算所选根点相对 Avatar 的三维位置 | 需要重新构建 Avatar；目标必须处于有效检测区域 |
| **Shader 捕获** | 将根点位置画成黑白编码图块，由桌面程序读取 | PC 实验方案；需要图块完整可见，真实 VRChat／头显效果尚待验证 |

这里的“根点”是你在 Unity 中选定的 Socket／Plug 起点。“相对 Avatar 的位置”会随该点在 Avatar 内移动而变化，整个 Avatar 一起走动或转身时则保持不变。Sensa SPS 和 Shader 都需要先观察坐标、校准范围，再启用实验空间输入；详细参数放在[定位说明](docs/positioning.md)中。

[方案选择](docs/usage-scenarios.md) · [OSC 字典](docs/osc-parameters.md) · [定位与限制](docs/positioning.md) · [OGB 兼容](docs/ogb-compatibility.md)

## 不接设备也能理解参数

[独立参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)无需启动 Sensa 或连接设备。十个模拟场景展示接收器、发送器、Socket／Plug 参考外形、固定锚点和 Shader 编码；可旋转 3D、在指定平面拖点，也可使用精确滑条和 SVG 投影。

发行包包含 `docs/parameter-geometry.html` 及本地资源，可离线打开。页面自动识别浏览器语言并保存明确选择，也支持 [?lang=zh-CN](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN) 和 [?lang=en-US](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US)。

## Unity 与发布

能编辑自己 Avatar 的用户，可以安装 [Unity 组件包](unity/top.sealoong.sensa/README.zh-CN.md)，添加根点测量或 Shader 捕获。只读取已有 OGB 参数时无需安装。Avatar／World 实验工具供开发与验证使用，需要自己的授权资源。

[Releases](https://github.com/SeaLoong/Sensa/releases)提供桌面预览版与 Unity ZIP。使用 VCC／ALCOM 安装时，**VPM 只提供已发布的 Unity 正式版**；预览版需要从 Releases 单独下载。请按实际安装版本阅读对应说明。

[文档站](https://sealoong.github.io/Sensa/)独立随 main 发布，不等待 Unity 稳定版。[语言规则](docs/languages.md)

## 开发与证据

参见[架构](docs/architecture.md)、[验证流程](docs/development.md)、[E2E 状态](docs/e2e-status.md)和[已归档视觉评审](docs/ui-visual-review.md)。本机先用 `python -X utf8 scripts/verify.py --plan` 规划，再运行 `scripts/verify.py`。浏览器 E2E、截图、完整进程冒烟与 World PlayMode 仅在 Actions；设备测试使用模拟传输。

几何、作者生成与模拟线包检查不能证明真实 VRChat Contacts、客户端捕获、头显可见性、定位准确度或机械动作。

[MIT 许可](LICENSE) · [术语表](GLOSSARY.md)
