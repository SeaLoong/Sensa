# Sensa

**简体中文** · [English](README.md) · [打开 WebSensa](https://sealoong.github.io/Sensa/websensa/) · [下载](https://github.com/SeaLoong/Sensa/releases/latest) · [文档站](https://sealoong.github.io/Sensa/) · [参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)

[![CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)
[![E2E](https://github.com/SeaLoong/Sensa/actions/workflows/e2e.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/e2e.yml)
[![Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml)
[![Release](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml/badge.svg)](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml)

**把手动控制、脚本和实时信号放进同一个工作台。**

移动滑条、播放 funscript，或读取实时参数。按需要调整结果，再同时送给多个设备和应用。每个连接、量程和目标都能在工作台里查看与配置。

## 选择运行方式

| | WebSensa | Node.js CLI | Electron |
| --- | --- | --- | --- |
| 启动 | [在浏览器打开](https://sealoong.github.io/Sensa/websensa/) | 运行 Sensa，在浏览器打开工作台 | 运行 Sensa Desktop，打开内嵌工作台 |
| 数值来源 | 手动控制、funscript、计算、录制回放与参数图解 | 手动、脚本、OSC、定位、设备协议、反馈与录制回放 | 与 CLI 共用本地服务和输入能力 |
| 连接方式 | 浏览器可用的 WebSocket、HTTP、串口、蓝牙和 MIDI | 串口、UDP／TCP、Intiface、设备 API、OSC、DG-LAB、MIDI、HTTP／WebSocket 与 MQTT | 与 CLI 共用设备与网络适配器 |
| 适合用途 | 快速控制、播放脚本、随开随用 | 应用转发、后台服务与独立实例 | 用桌面窗口操作本地服务 |

三种方式共用 TypeScript 核心与 React 工作台。Electron 启动随包 Node CLI 作为服务；WebSensa 使用浏览器适配器，在页面内运行同一应用。[架构](docs/architecture.md) · [WebSensa 指南](docs/websensa.md) · [本地版首次使用](docs/quick-start.md)

![Sensa 组合输入运行界面](docs/screenshots/desktop/combined-input-zh-CN.png)

[窄屏界面](docs/screenshots/mobile/combined-input-zh-CN.png) · [更多运行画面](docs/screenshots.md)

## 建立你需要的流程

| 目标 | 从这里开始 |
| --- | --- |
| 立即控制设备或播放脚本 | [WebSensa](docs/websensa.md) |
| 将网站／播放器的控制转发到 OSR 等设备 | [协议输入与设备桥](docs/protocol-inputs.md) |
| 混合数值、平滑响应或添加触发条件 | [计算信号](docs/computed-signals.md) |
| 一个结果同时连接多个设备或应用 | [多条输出绑定](docs/signal-pipeline.md#同一个结果连接多个输出) |
| 录下交互，之后再次播放 | [录制与回放](docs/signal-pipeline.md#录制与观察) |
| 使用 VRChat 参数或 Avatar 位置 | [按目标选择方案](docs/usage-scenarios.md) |

流程可以直接把来源连到输出。需要融合、曲线、平滑、几何计算或定时效果时，再添加计算。同一结果可以连接多个输出，各自使用合适的量程与更新节奏。

## 启动桌面工作台

1. [下载](https://github.com/SeaLoong/Sensa/releases/latest)最新正式版；当前 Node.js／Electron 构建先发布到[开发预览](https://github.com/SeaLoong/Sensa/releases)。内嵌窗口选择 Electron Desktop 压缩包，浏览器／后台服务选择 CLI；Windows CLI 另有安装器和单 EXE。按电脑选择 x64 或 ARM64。[全部格式](docs/quick-start.md#1-启动)
2. 运行 Sensa。CLI 自动在浏览器打开工作台并显示实际地址，Electron 则在自身窗口打开工作台。
3. 添加输出、选择来源、保存并连接。启用输入后，即可移动滑条或播放脚本。

多个浏览器标签页共用本地服务连接。再次打开同一配置会复用运行中的实例；独立命名实例分别保存配置并协调端口。[启动与多实例](docs/quick-start.md#运行多个实例)

## 连接设备与应用

| 目标 | 连接方式 |
| --- | --- |
| TCode／OSR／SR6 | 串口、UDP 或 TCP，配合各轴配置 |
| Intiface／Buttplug 设备 | Central 设备发现与功能映射 |
| Handy／Lovense／Autoblow／VacuGlide | 设备 API、实时控制或同步脚本 |
| 蓝牙／虚拟串口设备 | [协议桥工具](tools/protocol-bridge/README.zh-CN.md) |
| VRChat／OSC 应用 | OSC 参数、发现与转发 |
| DG-LAB | DG-LAB 4 APP 配对、强度与波形任务 |
| MIDI／自动化／自制服务 | MIDI CC、HTTP JSON、WebSocket JSON 与 MQTT |
| 文件 | Funscript 轨道、JSON Lines 与 CSV |

Sensa 也能接收其他应用原本发给设备的控制。典型路径为 **网站 → Sensa 虚拟 Buttplug 设备 → TCode → OSR**。多个 HTTP 输入可以共用端口，用不同路径区分。[协议示例](docs/protocol-inputs.md)

## 图解、录制与复用

[参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)支持移动目标、比较读数与查看检测范围；同一图解也随桌面程序提供，可离线使用。

录制输出将选定信号保存为可复用的 funscript。完成的轨道可以载入播放器、作为计算来源回放，整套交互也可以导出为方案。[信号流程指南](docs/signal-pipeline.md)

制作自己的 Avatar 时，[Unity 组件包](unity/top.sealoong.sensa/README.zh-CN.md)提供 SPS 四点定位、Contact 直接定位（SDK Beta）、Shader 捕获与跟随参考平面。[方案选择](docs/usage-scenarios.md) · [定位与校准](docs/positioning.md)

## 文档与开发

[工作台指南](docs/guide.md) · [功能参考](docs/features.md) · [OSC 参数字典](docs/osc-parameters.md) · [语言设置](docs/languages.md) · [开发与发布](docs/development.md) · [验证记录](docs/e2e-status.md)

[开发预览](https://github.com/SeaLoong/Sensa/releases)提供当前 main 构建，包括 Node.js／Electron 迁移。下载按钮始终打开最新正式版。新运行时可读取已有配置，保存时统一写入 camelCase 格式。Unity 组件包继续使用 C#，通过 VCC／ALCOM 的 VPM 仓库提供正式版。main 检查通过后自动发布预览并更新网站，Release 工作流用于正式发布。

[MIT 许可](LICENSE) · [术语表](GLOSSARY.md)
