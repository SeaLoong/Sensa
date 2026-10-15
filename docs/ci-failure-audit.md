# GitHub Actions 失败记录核对

**简体中文** | [English](ci-failure-audit.en.md)

2026-10-15 通过 GitHub API 查询全部 `status=failure` 运行，共 7 条；分别检查了日志、job 步骤、check annotations，以及对应分支的最新结果。旧运行固定对应旧提交，修复后不会自动更改其红色状态。

| 原失败运行 | 实际失败点 | 修复与当前处理 |
| --- | --- | --- |
| [38709823100](https://github.com/SeaLoong/Sensa/actions/runs/38709823100) | 预发布附件上传 HTTP 408 | `75c938b` 改为逐附件有限重试，核对远端大小、状态、SHA-256 后公开；后续预发布已成功 |
| [38457867283](https://github.com/SeaLoong/Sensa/actions/runs/38457867283) | React 单独升级导致 `ERESOLVE`；同一运行 Windows ARM 的 SDK 安装另有 CLR 崩溃 | React 与 React DOM 已成组更新；本次另为 Windows ARM SDK 安装增加一次恢复尝试，随后必须通过 SDK 检查和完整测试 |
| [38457828668](https://github.com/SeaLoong/Sensa/actions/runs/38457828668) | React DOM 单独升级导致 `ERESOLVE` | 两个旧依赖 PR 已被 Dependabot 关闭，由[成组 PR #12](https://github.com/SeaLoong/Sensa/pull/12)替代；该 PR 七项校验/构建均通过 |
| [38453980123](https://github.com/SeaLoong/Sensa/actions/runs/38453980123) | macOS `PUT /api/input/mode` WebSocket 超时 | `769f1ae` 修复 OSC 重绑定时 UDP 读取的取消/等待；后续 Intel、ARM macOS 原生冒烟均通过 |
| [38452634527](https://github.com/SeaLoong/Sensa/actions/runs/38452634527) | 同一 macOS 输入方式切换超时 | 同上；不是靠增大等待时间认定已修复 |
| [38451096732](https://github.com/SeaLoong/Sensa/actions/runs/38451096732) | 干净环境缺少 `artifacts/release-notes.txt` 父目录；另有 macOS 超时 | `6abbc4e` 创建目录，macOS 修复同上；打包回归与原生冒烟已覆盖 |
| [28191293931](https://github.com/SeaLoong/Sensa/actions/runs/28191293931) | 旧 VPM 工作流在“部署到 GitHub Pages”返回 404 | 运行日志已过期（410），但 check annotations 保留了“Ensure GitHub Pages has been enabled”错误。当前 Pages API 显示 `build_type=workflow`；旧 `vpm-publish.yml` 已移除，现工作流增加 Pages 前置检查 |

## 2026-10-16：Windows PNG 连续更新冲突

[38805336815](https://github.com/SeaLoong/Sensa/actions/runs/38805336815) 的 WebUI E2E 已通过，但 Windows x64 Shader PNG 回放在替换 frame.png 时出现 WinError 5。修复读取端的 Windows 删除/重命名共享，并让回放使用与 Unity File.Replace 一致的 ReplaceFileW；不能把 Path.replace 在 Windows 上的行为当成同一个原语。没有重跑整个测试或放宽门控断言。新增文件级单元测试保持旧帧句柄打开并连续替换 20 次，核对旧/新内容隔离和句柄释放；完整回放仍只在 CI 运行。[Windows 共享标志说明](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew)。

## 本次补齐的处理

- Windows ARM 失败发生在安装脚本的 PowerShell/CLR 启动阶段，代码为 `3221225477`、`0x80131506`，与 [.NET 上游问题 #131636](https://github.com/dotnet/runtime/issues/131636) 相符。一次 SDK 安装恢复尝试是对上游偶发故障的缓解，不能声称根除了 CLR 崩溃。第二次失败仍使 job 失败；编译和测试不会重跑或忽略失败。
- `Validate and preview` 增加手动入口。要验证最新代码，在 Actions 选择该工作流、Run workflow、选择 main；不要重跑旧失败运行来验证新代码。手动运行只产生构建工件，不发布预发布版本。
- `Validate and release Unity package` 手动运行只做单元测试、Unity 包校验和带 `manual` 标识的打包，上传工件供检查。它不会创建正式 Release、tag 或部署 VPM。
- 带预览标识的 Unity 包现在输出 `stable=false`；回归测试已验证此前会误报 `stable=true`。正式 `unity-v*` tag 仍按原有授权要求触发发布；只有正式包发布成功才更新 Pages。
- Pages 部署前显式检查配置，不自动修改仓库开关。没有正式包时不部署空 VPM 索引。

当前提交的结果可看 [main 工作流](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml?query=branch%3Amain)；手动 Unity 包检查见 [Unity 工作流](https://github.com/SeaLoong/Sensa/actions/workflows/release-unity.yml)。本次不会为改掉历史红色记录而删除运行，或发布未经要求的正式版本。
