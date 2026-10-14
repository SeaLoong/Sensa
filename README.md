# Sensa

把 VRChat 的 OSC 参数或动作脚本转换为 Intiface / TCode 设备控制，使用浏览器完成配置和预览。

[下载开发预览版](https://github.com/SeaLoong/Sensa/releases) · **[OSR 首次使用](docs/quick-start.md)** · [测试道具与标记](docs/lab-interaction.md) · [使用指南](docs/guide.md) · [选择预设](docs/presets.md)

刚买 OSR？先按首次使用指南，用自己的 Avatar 和测试世界验证信号，再连接设备。入门组件自动配置，无需 SPS、手动摆放、摄像机或 Python。设备仍需支持相应 TCode 固件并完成硬件校准。

## 开始使用

1. 下载与你的系统、处理器对应的压缩包，解压到可写目录。
2. Windows 运行 `Sensa.exe`；Linux/macOS 在解包目录运行 `./Sensa`。保留整个目录，不需要另装 .NET。
3. 打开 **http://127.0.0.1:5086**。
4. 添加输出，设置允许的行程和速度；选择手动、OSC 或脚本输入。
5. 先查看预览并校准，确认方向和范围后再打开输入开关。

输出卡片显示最近发送的目标，不是设备位置传感器的实测值。随时可以关闭输入或点击“停止输出”。

## 下载哪个文件？

| 你的电脑 | 文件名中的平台 |
| --- | --- |
| Windows，Intel / AMD | `win-x64.zip` |
| Windows，ARM 处理器 | `win-arm64.zip` |
| Linux，Intel / AMD | `linux-x64.tar.gz` |
| Linux，ARM64 | `linux-arm64.tar.gz` |
| Mac，Intel | `osx-x64.tar.gz` |
| Mac，Apple 芯片 | `osx-arm64.tar.gz` |

预览版由通过全部检查的 main 提交自动发布，可能继续调整功能。macOS 预览包是命令行程序，尚未签名公证。Unity 资产是另一个以 `top.sealoong.sensa-` 开头的 ZIP，不是桌面程序。

## 按你的需求阅读

- **连接设备、设置 OSC、校准和排错** → [Sensa 使用指南](docs/guide.md)
- **不知道选哪个预设** → [预设选择说明](docs/presets.md)
- **想在 Avatar 上增加位置测量或 PB 手柄** → [Unity 安装与配置](unity/top.sealoong.sensa/README.md)
- **想先在测试世界体验** → [测试世界操作说明](tools/unity-world-lab/README.md)
- **从源码构建或了解 CI** → [开发文档](docs/development.md)

普通 SPS 参数映射不要求安装 Sensa 的 Unity 资产；只有额外的位置测量功能需要它。WebUI 的“使用帮助”也可随时查阅操作步骤。
