# 开发与验证

**简体中文** | [English](development.en.md)

需要 Node.js 24、Python 3.12+ 和 [global.json](https://github.com/SeaLoong/Sensa/blob/main/global.json) 指定的 .NET SDK。架构与使用流程见[架构契约](architecture.md)，完整功能见[功能说明](features.md)。

## 按影响验证

首次准备依赖后，用同一入口规划和执行本地检查：

```shell
npm ci
python -X utf8 scripts/verify.py --plan
python -X utf8 scripts/verify.py
```

默认比较 HEAD 与工作区，包含暂存、未暂存和未跟踪文件。已提交变更可指定 `--base <ref>`；`--all` 选择所有本地检查；只有明确需要重跑时使用 `--force`。用 `--dotnet <绝对路径>` 覆盖 SDK，默认优先项目隔离的 `artifacts/toolchain/dotnet/`，否则使用 PATH。

成功检查的 receipt 保存在 `artifacts/verification/`，指纹包含对应源码、命令和工具链。相关内容相同会复用；相关文件改变、验证期间源码改变或检查失败都不会产生可复用成功结果。不要为了更新进度重复运行已经覆盖同一内容的检查。

| 改动 | 必要本地检查 | GitHub Actions |
| --- | --- | --- |
| 文档 | 双语、链接和资源约束 | 同样的文档检查；不运行 E2E、不发布 |
| Web 单元测试 | Web lint、接口契约、构建 | Web 检查；不发布 |
| 后端单元测试 | 后端契约 | 后端检查；不发布 |
| E2E／截图基线 | 对应静态／单元检查 | 必要的完整截图比较；不发布产品 |
| 产品、打包、协议 | 受影响接口检查 | 候选比较及必要六平台构建／隔离冒烟 |
| 未知路径／无法取得差异 | 保守全量本地检查 | 保守全量验证 |

规则由 [ci-plan.py](https://github.com/SeaLoong/Sensa/blob/main/scripts/ci-plan.py) 的一个 interface 同时供本地与 CI 使用，具体路径分类以该实现和契约测试为准。Python 全套包含文档检查，不会额外重复该检查。后端契约用 `SkipWebBuild=true`，因此不依赖 Node 或生成 bundle；正常 publish 仍构建并包含 Web 资源。

本地入口只打印需要的 E2E、原生冒烟与发布计划，不执行它们。浏览器 E2E、完整进程 smoke、自动截图与 World PlayMode 套件都有 CI-only 保护。不要伪造 GitHub Actions 环境绕过这些限制。

## CI 和预发布

PR 和 main push 首先计算变更计划，只运行受影响的检查。普通契约测试集中执行一次，六种原生构建不再各重复 npm 与后端单元测试；它们验证自包含程序和隔离的 HTTP／WebSocket／OSC 行为。Windows 使用 ZIP，Linux/macOS 使用保留执行位的 tar.gz。

产品候选必须通过当前提交的全量 E2E 截图比较，再进行必要的 Windows／Linux／macOS x64、ARM64 构建。预发布工作流核对 E2E 输出 SHA 与候选 SHA 一致，候选基线生成任务不提供该证明。截图只在 CI 比较，更新和人工审阅见 [E2E 指南](e2e.md)。

main 的验证按提交保留，不会被后续纯文档 push 取消；PR 会取消同 ref 的过期任务。自动预发布发布与清理串行执行。仅影响产品且全部门槛通过的 main push 自动发布；纯文档、纯测试与普通手动验证不发布。

需要显式全量验证时可以手动运行 `ci.yml`；需要单独检查浏览器时运行 `e2e.yml`。不要在已有必要 CI 仍运行时重复派发同一提交：

```shell
gh workflow run ci.yml --ref main
gh workflow run e2e.yml --ref main -f update_snapshots=false
```

预发布先建立 draft，上传六个桌面包、Unity ZIP 和统一校验文件，核对远端附件名称、状态、大小、SHA-256 和目标提交后才公开。单文件上传最多三次；失败保留未公开草稿。

发布后分页读取所有 release，以发布时间排序，只保留最近 **10 个已发布 prerelease**，包括手工版本的预发布。每次删除前重新核对数字 ID、tag、目标、发布时间和状态；稳定版、草稿与 Git tag 不删除。独立清理入口是 `publish-preview.py --prune-only`，它会真实删除旧预发布，只在已授权的保留任务中运行。

稳定版仍需要明确请求的 `v*`／`unity-v*` tag；本轮不改基础版本或内部协议版本。预览不进入稳定 VPM 索引。依赖更新仍保留 React/React DOM 配套分组，更新不代表自动合并。

## 本机开发与 Unity

开发 UI 可以手工 `dotnet run --project src/Sensa.csproj`；运行设备控制前先选择隔离配置或确认自己的输出。只构建产物可使用 `dotnet publish`。包含完整进程冒烟的 `build-platform.py` 是 CI 入口，不在本机运行。

Unity 编译和 EditMode 单元测试可在独立工程手工运行。公开 CI 的 Unity 元数据检查不能替代 NDMF、Udon、ClientSim 或真实客户端验收；独立世界工程保持本地，不推送。

安装器先验证全部受管源码和 manifest，再写入，保留用户场景、生成资产和本地修改。不要通过覆盖冲突来“修复”安装：

```shell
python scripts/install-world-lab.py "<World project>"
python scripts/install-avatar-lab.py "<Avatar project>" --tests
```

`validate-labs.py` 有六套验证。`world-editor`、`world-functional`、`world-geometry`、`world-offset` 会涉及图形／PlayMode／截图，仅供有 Unity 和授权资源的 Actions runner；`avatar-tests` 是 EditMode，`avatar-build` 检查本地 SDK bundle，不上传。原场景哈希、新鲜报告、零退出码与明确成功都必须满足，XML 不能为空或含失败／跳过；默认每套 900 秒，输出目录不得复用。

所有设备测试只使用临时配置和模拟 transport。真实 VRChat OSC、VR 抓取、头显可见性、实时 GPU 捕获及设备动作需另行验收，未执行项不得写成通过。失败排查先读报告中的真实原因，保留最后观测值；不要重发输入或重跑整个测试掩盖失败。历史记录见[CI 失败核对](ci-failure-audit.md)。
