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

PR 和 main 推送运行校验及六种原生平台构建，每个平台执行后端测试、自包含程序启动和隔离 HTTP/WS/OSC 冒烟，再生成压缩包。Windows 使用 ZIP，Linux/macOS 使用保留执行位的 tar.gz。

只有 main 推送且所有检查成功，才自动生成新的 prerelease，带六个桌面包、Unity ZIP 和统一校验文件。预发布 tag 使用运行编号/尝试编号/commit 标识，不移动已有版本。先以 draft 上传完整文件，再公开；PR 无发布权限。

开发预览标识不修改参数协议或项目基础版本。预览 Unity 包不进入 VPM 稳定索引。正式发布仍由明确的 v* / unity-v* tag 触发。

Unity 编译、NDMF、Udon 和 ClientSim 使用独立本地项目验证；GitHub CI 中的 Unity 校验不能代替这些检查。测试世界保持本地 Git，不推送大型工程。测试只使用隔离配置、模拟接收器，不连接真实硬件。

技术参考：[自动生成与几何解算](../unity/top.sealoong.sensa/AUTOMATION.md)、[Shader 实验](../unity/top.sealoong.sensa/GPU-TRACKING.md)、[世界测试实现](../tools/unity-world-lab/DEVELOPMENT.md)。
