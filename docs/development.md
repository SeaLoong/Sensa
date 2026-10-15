# 开发与验证

需要 Node.js 24、Python 3.12+ 和 `global.json` 指定的 .NET SDK。

```shell
npm ci
npm test
dotnet restore tests/Sensa.Tests/Sensa.Tests.csproj --locked-mode
dotnet test tests/Sensa.Tests/Sensa.Tests.csproj -c Release
python -m unittest discover -s tests/scripts
python scripts/release.py check-unity
```

本机开发：`dotnet run --project src/Sensa.csproj`。跨平台自包含构建使用 `scripts/build-platform.py --runtime <RID>`；RID 为 win/linux/osx 的 x64 或 arm64 组合。只在对应平台运行生成的程序。

## CI 与发布

WebUI 端到端和截图比较只在 CI 运行，基线更新、模拟设备与失败排查见 [E2E 指南](e2e.md)。预发布必须等待 E2E 比较通过；候选截图生成任务不会发布。

历史失败的具体日志、原因和对应处理见 [CI 失败核对记录](ci-failure-audit.md)。可以在 GitHub 手动运行 `Validate and preview` 检查 main；手动运行 `Validate and release Unity package` 只验证并打包 Unity 预览工件，不创建 Release 或部署 VPM。

PR 和 main 推送运行校验及六种原生平台构建，每个平台执行后端测试、自包含程序启动和隔离 HTTP/WS/OSC 冒烟，再生成压缩包。Windows 使用 ZIP，Linux/macOS 使用保留执行位的 tar.gz。

基础校验通过后才启动六个平台构建。React 与 React DOM 的版本更新和安全更新分别成组提交，避免只升级其中一个导致 `npm ci` 的 peer dependency 冲突；分组规则见 [GitHub 官方说明](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#groups)。这不自动合并依赖升级。

排查失败时先看出错步骤：`npm ci / ERESOLVE` 是依赖配套问题，HTTP 408 是上传超时，应用冒烟失败则查看 `tests-<平台>` 附件中的 `smoke/service.log` 和 `smoke/result.json`。OSC 断言会在限定时间内等待实际状态，并在失败时输出最后观测值；不会重发输入或重跑整个测试来掩盖失败。历史红色运行记录不会因修复而消失，应核对提交和最新运行。

只有 main 推送且所有检查成功，才自动生成新的 prerelease，带六个桌面包、Unity ZIP 和统一校验文件。预发布 tag 使用运行编号/尝试编号/commit 标识，不移动已有版本。先以 draft 上传完整文件，再公开；PR 无发布权限。

附件逐个上传，单个失败最多尝试三次；公开前核对 GitHub 上的附件名称、上传状态、大小和 SHA-256，以及草稿对应的提交。上传超时、附件不完整或校验失败时保留草稿，不公开残缺版本。

开发预览标识不修改参数协议或项目基础版本。预览 Unity 包不进入 VPM 稳定索引。正式发布仍由明确的 v* / unity-v* tag 触发。

Unity 编译、NDMF、Udon 和 ClientSim 使用独立本地项目验证；GitHub CI 中的 Unity 校验不能代替这些检查。测试世界保持本地 Git，不推送大型工程。测试只使用隔离配置、模拟接收器，不连接真实硬件。

技术参考：[自动生成与几何解算](../unity/top.sealoong.sensa/AUTOMATION.md)、[Shader 实验](../unity/top.sealoong.sensa/GPU-TRACKING.md)、[世界测试实现](../tools/unity-world-lab/DEVELOPMENT.md)。

## 本地 Unity 套件

先关闭要测试的项目，安装对应的测试工具源码。测试会创建临时烘焙场景、报告和截图；请先记录自己的场景修改。不要同时手动打开同一个项目。GPU 测试需要图形设备，脚本不会使用 `-nographics`。

```powershell
python scripts/install-world-lab.py "D:/VRChatProjects/Sensa Test World"
python scripts/install-avatar-lab.py "D:/VRChatProjects/Sensa Test Avatar" --tests
python scripts/validate-labs.py --unity "D:/Unity/2022.3.22f1/Editor/Unity.exe" --world "D:/VRChatProjects/Sensa Test World" --suite world-functional --suite world-geometry --suite world-offset
python scripts/validate-labs.py --unity "D:/Unity/2022.3.22f1/Editor/Unity.exe" --avatar "D:/VRChatProjects/Sensa Test Avatar" --suite avatar-tests --suite avatar-build
```

| 套件 | 检查内容 |
| --- | --- |
| `world-editor` | GPU 编码边界序号、CRC、图像缩放、相机旋转和原生 Contact，检查编辑器测试未改写编码材质 |
| `world-functional` | 15 个能力状态、原生 SPS、Contact/PB、Shader 编码、手持/世界放置和材质隔离 |
| `world-geometry` | 11 个几何 case、缺采样/重置按钮、移动跳跃、实际 SPS GPU 读取与材质隔离 |
| `world-offset` | 偏移/倾斜 Socket 下重跑几何与 GPU 测试 |
| `avatar-tests` | Unity 包的 EditMode 自动测试；零测试、失败或跳过均不算通过 |
| `avatar-build` | 通过 SDK 构建 FullFlow 本地包，再检查实际包内容、参数、动画器与探针；不会上传 |

结果默认写入 `artifacts/lab-validation/<时间和随机标识>/summary.json`，每个套件有独立 `unity.log`、`launcher.log` 和本次报告副本。可以指定 `--output <新目录>`；为防混入旧结果，不允许复用已有目录。每项默认最多 900 秒，可用 `--timeout` 调整。脚本等待 Unity 实际退出，要求退出码为 0、报告为本次生成且明确通过，并核对世界原场景文件未被改写；遇到失败停止后续套件。超时只终止脚本启动的进程，日志保留用于排查。

如果某项没有运行或报告过期，不能当作通过。CI 的静态 Unity 包检查、编辑器构建和 ClientSim 均不覆盖真实 VRChat OSC、VR 抓取、头显可见性或设备行为；这些仍需手工验证。
