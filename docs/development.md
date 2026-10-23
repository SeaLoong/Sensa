# 开发、验证与发布

**简体中文** | [English](development.en.md)

CI 先执行单元测试和完整浏览器 E2E 比较，通过后构建、打包和发布。自动预发布与手动正式版使用相同的检查要求，任何必要步骤失败都会停止发布。

## 平时提交代码会发生什么？

| 操作 | 自动执行 |
| --- | --- |
| 提交 Pull Request | 单元测试、完整 E2E 和全部平台构建，保留下载附件，不发布 Release |
| 推送到 `main` | 同一提交的检查通过、全部产物生成后，自动发布 pre-release |
| 修改 `main` 上的文档或网页 | 构建文档站，通过站点专用 E2E 后自动部署，无需手动运行 Pages |
| 手动运行 `release.yml` | 读取最新 `main`，检查、构建并发布正式 Release；随后自动刷新文档站与 VPM |

预发布与正式版都包含 Windows／Linux／macOS 的 x64 和 ARM64 程序，以及 Unity ZIP。自动清理保留最近 **10 个已公开 pre-release**，同时保留正式版、未公开草稿和 Git 标签。VPM 收录正式版中的 Unity 包。

## 怎样发布正式版？

1. 打开 GitHub 的 [Actions → Release](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml)。
2. 点击 **Run workflow**，使用 `main`。
3. `version` 留空即可自动选择版本；需要指定版本时填写 `0.5.0` 这样的版本号。
4. 执行工作流，等待检查、构建和发布完成，再从 [Releases](https://github.com/SeaLoong/Sensa/releases) 下载。

工作流自动创建标签并构建全部平台。开始时确定最新 `main` 的完整提交号，此后所有检查、平台产物、Unity 包和 Release 都使用该提交；执行期间的新提交留给下一次发布。

默认版本取仓库版本与已存在正式标签中的最高版本：仓库版本更高时使用仓库版本，否则将最高正式版本的补丁号加一。例如已有 `v0.4.0` 时，下次自动发布 `v0.4.1`。手动版本须高于已有正式版本。版本调整在本次构建目录内完成，仓库中的版本文件保持原值。

## 工作流各负责什么？

| 文件 | Actions 名称 | 责任 |
| --- | --- | --- |
| `ci.yml` | CI | PR／main 的自动检查与构建；main 自动预发布 |
| `checks.yml` | Checks | 共用的 Web／.NET／Python 单元、Unity 元数据与 E2E 检查 |
| `e2e.yml` | E2E | 浏览器行为、普通截图比较；手动生成待审基线 |
| `update-e2e.yml` | Update E2E | 手动更新测试／候选图片并创建待审 PR，默认无需 AI 密钥 |
| `build.yml` | Build | 共用的六平台桌面构建、隔离原生冒烟与 Unity 打包 |
| `release.yml` | Release | 从最新 `main` 手动发布正式版 |
| `pages.yml` | Pages | 自动构建文档、执行站点 E2E、部署页面与 VPM |

每次运行都检查本次提交，发布使用同一次运行产生的检查结果和构建产物。

## 工作流使用哪些密钥？

仓库 Actions secret `SENSA_PAT` 用于发布 Release、推送 E2E 候选分支和创建待审 PR。PR 创建后自动触发普通 CI。

默认 `screenshots` 模式直接运行 E2E 并生成候选图片；可选 `agent` 模式额外使用 `OPENAI_API_KEY` 维护测试用例。

## 发布说明怎样生成？

每次提交产生的自动预发布只显示一行 **Source**，链接到本次构建使用的完整源码提交。

正式版的发布说明自动组合 GitHub 变更记录、直接提交记录与双语下载说明：

- 从上一个正式版本到本次提交的改动、Pull Request 和贡献者信息。
- 本次版本、完整提交号、检查／构建运行链接，以及适用系统和处理器的下载说明。
- 首次启动、文档和参数图解入口，以及 `SHA256SUMS.txt` 校验文件说明。
- 本次实际验证范围。

改动标题应直接说明用户能感受到的变化。自动记录依据仓库中的提交或 PR 信息生成。

## 失败时从哪里看？

打开对应 Actions 运行，先看失败步骤与 Job summary。浏览器与候选工作流共用字体／模拟运行时安装脚本，只读取 Ubuntu 软件源，保留原字体包与字体匹配配置。安装分为最多两次尝试，每次限时 130 秒，结束进程另留 5 秒；APT 网络等待为 15 秒，同一下载允许重试 1 次，步骤总预算仍为 5 分钟。第二次尝试会先执行 `dpkg --configure --pending` 完成中断的包配置，恢复过程也计入同一预算。恢复或安装失败会阻止后续测试，可重试该次运行。Pages 在原生 runner 上保留 GitHub CLI，浏览器系统依赖与中文字体通过固定 Ubuntu 源配置安装，采用相同的包配置恢复、两次 130 秒尝试和 5 分钟步骤预算；无界面浏览器以当前 runner 用户单独下载，步骤上限为 3 分钟，连接等待上限为 30 秒。Pages 构建任务总预算为 15 分钟。完整浏览器任务预算为 35 分钟，覆盖两种视口、两种语言及多标签页连接场景。E2E 的 `summary.json`／`summary.md` 分别记录通过、失败、跳过、未执行、中断和不稳定用例；具体状态见[验证记录](e2e-status.md)。达到失败上限后的用例记为未执行。截图失败时查看 expected／actual／diff，审阅有意的变化后更新基线，再运行完整普通比较。

原生构建使用隔离配置启动生成的程序做冒烟，Windows 另有 Shader 桥模拟回放。打包与发布接收普通文件，归档路径须适用于各平台。发布先建立草稿，上传后核对文件名、大小和 SHA-256，并在公开前再次确认 Git tag 实际指向的提交。上传失败保留草稿以便排查；已公开预发布的重跑会核对现有资产，并完成剩余清理。要发布更新代码，重新启动正式发布工作流，它会读取最新 `main` 并选择新的版本。

如果 **Update E2E** 已推送候选分支、随后创建 PR 失败，处理步骤报告的问题后选择 **Re-run failed jobs**。发布任务会核对分支的父提交和完整文件树，复用成功候选所在 attempt 的分支；已有草稿 PR 的仓库、源码 SHA 与评审状态相符时，会直接返回该 PR。分支内容变更或评审已关闭时需要先检查。完整重跑候选任务会生成新的 attempt，便于单独审阅。测试补丁在独立任务中执行，发布任务只重新应用已核对文件。候选图片与断言改动仍需审阅，并通过全量普通比较。

## 文档站与 VPM

[文档站](https://sealoong.github.io/Sensa/)随 `main` 的文档和网页修改自动构建，通过站点 E2E 后部署。正式发布成功后自动刷新 VPM。页面部署使用已检查的同一份静态产物，正式包刷新时读取当前 `main` 文档。

VPM 构建保留已校验的正式包与历史下载。网络错误或摘要不一致会使部署失败；确实没有正式包时显示暂无 VPM 包。

## 本地开发与检查

需要 Node.js 24、Python 3.12+ 和 [global.json](https://github.com/SeaLoong/Sensa/blob/main/global.json) 指定的 .NET SDK。先规划受影响检查，再执行；相同源码与工具链可复用本地成功记录。

```shell
npm ci
python -X utf8 scripts/verify.py --plan
python -X utf8 scripts/verify.py
```

浏览器 E2E、截图和完整进程冒烟在 Actions 执行，隔离单元和静态检查可本地运行。设备相关检查使用临时配置与模拟传输。真实硬件、Unity／VRChat 和 World 实际交互另行验收。

修改 Three.js 源码或依赖后运行 `npm run build:web`，提交可再现的 `docs/assets/parameter-geometry-3d.js` 与完整 `3d.LICENSE.txt`。修改普通 Markdown 后可直接构建站点：`npm run build:pages`，产物位于 `artifacts/pages/`。

大量参数的纯排序可单独测量：

```shell
node scripts/benchmark-osc-preview.mjs --output artifacts/performance/osc-ranking.json
```

该脚本测量纯排序耗时；浏览器中的持续更新、翻页、冻结与路径建议由 E2E 检查。

## 检查输出与共享会话

协议与传输改动使用隔离编解码、模拟传输和时钟，核对数值类型、量程、取消、停止和重连。DG-LAB 检查配对、设备上报与 RPC／任务寿命；时间计算检查初始样本、换源、失效和时间倒退；录制检查有界存储、转义和样本时间戳。

共享会话测试分别检查同页引用计数、SharedWorker 共享、Web Locks 持有页接续、BroadcastChannel 请求关联和每标签页回退。Actions 浏览器用例打开多个页面，检查部分关闭、持有页接续和全部关闭后的重新打开；页面缓存挂起与恢复由隔离的生命周期单元测试检查。HTTP 连接池与服务器 WebSocket 预算分别观察。新增输出表单按普通截图比较与逐张审阅维护基线。[架构决策](adr/0008-signal-pipeline-and-shared-session.md) · [使用指南](signal-pipeline.md)

[架构](architecture.md) · [当前 CI 决策](adr/0005-simplified-ci-and-releases.md) · [浏览器验证](e2e.md)
