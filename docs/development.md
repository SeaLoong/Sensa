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

下表的 CI 范围适用于**没有未完成产品验证**的情况；普通 main push 还会自动接续之前尚未完成的产品验证，规则见下一节。

| 改动 | 必要本地检查 | GitHub Actions |
| --- | --- | --- |
| 文档 | 双语、链接、路径隐私和资源约束 | 同样的文档检查；不运行 E2E、不发布 |
| Web 单元测试 | Web lint、接口契约、构建 | Web 检查；不发布 |
| 后端单元测试 | 后端契约 | 后端检查；不发布 |
| E2E／截图基线 | 对应静态／单元检查 | 必要的完整截图比较；不发布产品 |
| 产品、打包、协议 | 受影响接口检查 | 候选比较及必要六平台构建／隔离冒烟 |
| 未知路径／无法取得差异 | 保守全量本地检查 | 保守全量验证 |

路径分类由 [ci-plan.py](https://github.com/SeaLoong/Sensa/blob/main/scripts/ci-plan.py) 的同一 interface 供本地与 CI 使用，具体范围以实现和契约测试为准。本地 `verify.py` 只使用工作区差异与内容缓存，不读取 GitHub 状态；CI 另外结合负责产品验证的实际执行状态，判断是否需要接续。Python 全套包含文档检查，不会额外重复该检查。后端契约用 `SkipWebBuild=true`，因此不依赖 Node 或生成 bundle；正常 publish 仍构建并包含 Web 资源。

本地入口只打印需要的 E2E、原生冒烟与发布计划，不执行它们。浏览器 E2E、完整进程 smoke、自动截图与 World PlayMode 套件都有 CI-only 保护。不要伪造 GitHub Actions 环境绕过这些限制。

## CI 和预发布

CI 只保留以下三个 workflow；普通检查和六平台构建内联在 `ci.yml`，不再各建可复用入口。

| Workflow | 工作场景与范围 | 工作内容与边界 |
| --- | --- | --- |
| `ci.yml` | PR、main push；手动全量验证；供标签发布复用 | 统一规划、受影响接口检查、E2E、必要平台构建及 main 自动预览。PR／手动运行不发布；复用输入 `release_target=app/unity` 仅接受对应 `v*/unity-v*` tag push，不直接发布标签版本。 |
| `e2e.yml` | 由 CI 复用；手动浏览器比较或候选基线生成 | 只负责真实应用的浏览器全量场景、截图比较和报告。仅手动 `update_snapshots=true` 生成待人工审阅基线，不提供比较成功 SHA，不发布、不运行六平台矩阵。 |
| `release.yml` | 显式 `v*`／`unity-v*` tag push | 复用 CI 验证同一提交，发布对应桌面／Unity 标签包。桌面标签要求六平台构建；Unity 标签只构建 Unity 包，不触发六桌面平台。仅成功发布的 Unity 稳定包更新 VPM Pages；无 PR、main 或手动入口。 |

PR 和 main push 先计算变更计划。没有未完成产品验证时，只运行当前差异影响的检查；main 自动接续尚未完成的产品验证，不要求特殊提交消息或手工 override。执行依赖和发布门槛如下：

| Job／阶段 | 依赖与必要内容 |
| --- | --- |
| `plan` | 计算路径影响及 main owner 接续；手动运行选择全量，标签复用选择对应发布目标。 |
| `validate` | 等待 plan，集中执行受影响的 Web、后端、Python、文档、依赖审计和 Unity 元数据检查；普通产品候选同时打包 Unity 资产。 |
| `e2e` | 等待 plan，与 validate 并行；需要时执行当前提交的全量截图比较。 |
| `platforms` | 等待 plan 和 validate，按计划执行 Windows／Linux／macOS x64、ARM64 的六平台构建、隔离冒烟与归档；不等待 E2E，不重复普通接口测试。 |
| main `prerelease` | 必须是需发布的 main push，且 validate、E2E、platforms 全部成功，E2E 比较 SHA 等于当前候选 SHA。 |
| 标签 `release`／`pages` | release 必须等复用 CI 成功、E2E 比较 SHA 与标签 SHA 一致、对应包构建成功；pages 还要求 Unity 稳定包发布成功。 |

接口检查与浏览器比较并行，原生构建在接口检查通过后即可开始；公开产物必须汇合所有必要结果。候选基线生成不算截图比较证明。截图只在 CI 比较，更新和人工审阅见 [E2E 指南](e2e.md)。原生构建验证自包含程序和隔离的 HTTP／WebSocket／OSC 行为；Windows 使用 ZIP，Linux/macOS 使用保留执行位的 tar.gz。

main 的产品验证有明确负责的执行（owner），合并 workflow 后继续识别原有 validate／platforms／browser 证据名称。后续纯文档 push 遇到 owner 仍在运行时，只继承待完成记录，不取消或重复启动必要产品 CI。后续文档执行自己的 success 不能清除这项记录；必须核对 owner 所有必要 jobs 的实际成功结果。记录 artifact 只表达验证意图，不证明执行通过；缺失 artifact、未知状态或必要 job 被 skipped 都按未完成保守处理。

上一产品验证失败后，修复测试或 Playwright 的普通 main push 会自动在**当前提交**补齐必要产品全链，包括对应检查、全量 E2E、原生构建／隔离冒烟及满足门槛后的预发布，不能因修复只改了测试而漏掉产品验证。无需改变提交消息或手动标记产品改动。没有待接续产品验证时，纯文档、纯测试不发布；普通手动验证也不发布。

PR 会取消同 ref 的过期任务；main 必要产品验证保留。main 预览与桌面／Unity 标签发布及清理共用 `sensa-preview-publication` 队列，使用 `queue: max` 保留等待任务；已公开相同提交或更新自动候选时，旧候选跳过打包与发布。运行中的必要 CI 沿用负责关系，避免重复运行。[GitHub 并发队列规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)。恢复规则与实际结果判定见 [ci-plan.py](https://github.com/SeaLoong/Sensa/blob/main/scripts/ci-plan.py)。

需要显式全量验证时手动运行 `ci.yml`；只检查浏览器或准备人工审阅基线时使用 `e2e.yml`。Unity 手动验证也使用 `ci.yml`。不要在已有必要 CI 仍运行时重复派发同一提交：

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

所有设备测试只使用临时配置和模拟 transport。真实 VRChat OSC、VR 抓取、头显可见性、实时 GPU 捕获及设备动作需另行验收，未执行项不得写成通过。失败排查先读报告中的真实原因，保留最后观测值；不要重发输入或重跑整个测试掩盖失败。实际结果以对应提交的 Actions 报告为准。
