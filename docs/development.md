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

预发布与正式版都包含 Windows 安装器、Windows 单文件程序、六个平台的便携压缩包，以及 Unity ZIP。自动清理保留最近 **10 个已公开 pre-release**，同时保留正式版、未公开草稿和 Git 标签。VPM 收录正式版中的 Unity 包。

| 系统与方式 | 架构 | 文件名示例 | 怎样启动 |
| --- | --- | --- | --- |
| Windows 安装版（推荐） | x64／ARM64 | `Sensa-<版本>-win-<架构>-Setup.exe` | 为当前用户安装到 `%LOCALAPPDATA%\Programs\Sensa`，从开始菜单启动并打开浏览器，附带离线指南和 Shader 桥工具，无需管理员权限 |
| Windows 单文件 | x64／ARM64 | `Sensa-<版本>-win-<架构>-SingleFile.exe` | 直接运行一个 EXE，内置 Web 界面与交互图解，无需旁边另放程序文件；Python Shader 桥和完整 Markdown 指南另取安装器或便携包 |
| Windows／Linux／macOS 便携版 | x64／ARM64 | `Sensa-<版本>-<平台>-<架构>.zip`／`.tar.gz` | 便携目录，完整解压后运行，附带离线指南与工具；Windows 使用 ZIP，其余系统使用 tar.gz |

[下载](https://github.com/SeaLoong/Sensa/releases/latest)直接链接到 GitHub 最新正式版入口；尚无正式版时，GitHub 会将该地址重定向到发布历史。开发预览与旧版本单独列在[发布历史](https://github.com/SeaLoong/Sensa/releases)。从所选版本的发布附件下载桌面包、Unity ZIP 与 `SHA256SUMS.txt` 校验文件。

所有桌面格式均为自包含程序，无需另装 .NET。Windows 单文件的原生库由 .NET 提取到缓存，Web 内容直接从程序集读取；配置 `config.json` 与“录制输出”的 `recordings` 默认保存在程序旁，环境变量可覆盖。工作台导出的 funscript 使用系统文档目录的 `Sensa/recordings`。升级安装与卸载保留用户生成的数据。单文件请放在可写文件夹。安装器和程序尚未作代码签名，Windows 可能显示发布者或信誉提示。

自动预发布的资产名在版本后追加 `-preview.<运行编号>.<attempt>.<提交前八位>`；正式版不追加。发布说明优先提供本次构建的 Windows x64／ARM64 安装器附件链接。预发布随后列出链接到完整构建提交的 **Source**，不列变更清单。

## 怎样发布正式版？

1. 打开 GitHub 的 [Actions → Release](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml)。
2. 点击 **Run workflow**，使用 `main`。
3. `version` 留空即可自动选择版本；需要指定版本时填写 `0.5.0` 这样的版本号。
4. 执行工作流，等待检查、构建和发布完成，从工作流结果中的发布链接下载本次版本；[下载](https://github.com/SeaLoong/Sensa/releases/latest)直接打开最新正式版。

工作流自动创建标签并构建全部平台。开始时确定最新 `main` 的完整提交号，此后所有检查、平台产物、Unity 包和 Release 都使用该提交；执行期间的新提交留给下一次发布。

默认版本取仓库版本与已存在正式标签中的最高版本：仓库版本更高时使用仓库版本，否则将最高正式版本的补丁号加一。例如已有 `v0.4.0` 时，下次自动发布 `v0.4.1`。手动版本须高于已有正式版本。版本调整在本次构建目录内完成，仓库中的版本文件保持原值。

## 工作流各负责什么？

| 文件 | Actions 名称 | 责任 |
| --- | --- | --- |
| `ci.yml` | CI | PR／main 的自动检查与构建；main 自动预发布 |
| `checks.yml` | Checks | 共用的 Web／.NET／Python 单元、Unity 元数据与 E2E 检查 |
| `e2e.yml` | E2E | 浏览器行为、普通截图比较；手动生成待审基线 |
| `update-e2e.yml` | Update E2E | 手动更新测试／候选图片并创建待审 PR，默认无需 AI 密钥 |
| `build.yml` | Build | 共用的六平台便携包、Windows 安装器／单文件、隔离原生冒烟与 Unity 打包 |
| `release.yml` | Release | 从最新 `main` 手动发布正式版 |
| `pages.yml` | Pages | 自动构建文档、执行站点 E2E、部署页面与 VPM |

每次运行都检查本次提交，发布使用同一次运行产生的检查结果和构建产物。

## 工作流使用哪些密钥？

仓库 Actions secret `SENSA_PAT` 用于发布 Release、推送 E2E 候选分支和创建待审 PR。PR 创建后自动触发普通 CI。

默认 `screenshots` 模式直接运行完整 E2E，生成应用基线候选和八张站点审阅原图；可选 `agent` 模式额外使用 `OPENAI_API_KEY` 维护测试用例。[图片审阅流程](e2e.md#怎样手动更新-e2e)

## 发布说明怎样生成？

自动预发布首先提供本次构建的 Windows x64／ARM64 安装器下载链接，再列出其余格式与校验文件的准确下载链接，随后通过 **Source** 链接到完整源码提交，不生成变更清单。

正式版说明同样先提供安装器下载链接，再组合 GitHub 变更记录、直接提交记录与双语下载说明：

- 从上一个正式版本到本次提交的改动、Pull Request 和贡献者信息。
- 本次版本、完整提交号、检查／构建运行链接，以及适用系统和处理器的下载说明。
- 首次启动、文档和参数图解入口，以及 `SHA256SUMS.txt` 校验文件说明。
- 本次实际验证范围。

改动标题应直接说明用户能感受到的变化。自动记录依据仓库中的提交或 PR 信息生成。

## 失败时从哪里看？

打开对应 Actions 运行，先看失败步骤与 Job summary。E2E 的 `summary.json`／`summary.md` 分别记录通过、失败、跳过、未执行、中断和不稳定用例；达到失败上限后停止执行的用例记为未执行。具体状态见[验证记录](e2e-status.md)。截图失败时查看 expected／actual／diff，审阅有意的变化后更新基线，再运行完整普通比较。

应用 E2E、候选采集和 Pages 站点验证使用同一版本的 Playwright 容器，镜像提供浏览器及其系统依赖。共用安装脚本补齐中文字体与模拟运行时，并保留字体匹配配置。完整应用浏览器任务预算为 35 分钟，覆盖两种视口、两种语言及多标签页连接场景。

依赖安装使用 Ubuntu 官方软件源，最多尝试两次，每次限时 130 秒，结束进程另留 5 秒；APT 网络等待为 15 秒，同一下载允许重试一次，步骤总预算为 5 分钟。第二次尝试会先执行 `dpkg --configure --pending` 完成中断的包配置，并通过临时软件源将 Azure Ubuntu 镜像切换到官方 `https://archive.ubuntu.com/ubuntu`。原软件源文件、发行版、组件和签名配置保持原值；字体使用首次成功读取索引时确定的版本和 SHA-256。恢复、索引验证及安装均计入同一预算，完成后继续验证。

原生构建使用隔离配置启动六个平台的便携程序做冒烟，Windows 另有 Shader 桥模拟回放。Windows 单文件在仅含一个 EXE 的发布目录中再次冒烟，检查 API、Web 界面与本地图解。安装器在临时目录静默安装，核对安装后的二进制与离线工具，运行隔离程序冒烟，再卸载并确认保留用户配置和录制。安装、启动和卸载仅在 Actions 的原生 Windows runner 执行，不使用真实硬件。

安装器由固定版本的 Inno Setup 6.7.3 构建。引导脚本从官方 GitHub Release 下载编译器安装包，先核对仓库固定的 SHA-256 与官方发布者 `Pyrsys B.V.` 的有效 Authenticode 签名，再执行。该校验确认编译工具来源，不表示 Sensa 下载文件已有代码签名。

打包与发布接收普通文件，归档路径须适用于各平台。发布要求六个便携包、四个 Windows 附加格式与 Unity 包全部齐备，逐一核对各平台的校验值，再建立草稿。上传后核对文件名、大小和 SHA-256，并在公开前再次确认 Git tag 实际指向的提交。上传失败保留草稿以便排查；已公开预发布的重跑会核对现有资产，并完成剩余清理。要发布更新代码，重新启动正式发布工作流，它会读取最新 `main` 并选择新的版本。

如果 **Update E2E** 已推送候选分支、随后创建 PR 失败，处理步骤报告的问题后选择 **Re-run failed jobs**。发布任务会核对分支的父提交和完整文件树，复用成功候选所在 attempt 的分支；已有草稿 PR 的仓库、源码 SHA 与评审状态相符时，会直接返回该 PR。分支内容变更或评审已关闭时需要先检查。完整重跑候选任务会生成新的 attempt，便于单独审阅。测试补丁在独立任务中执行，发布任务只重新应用已核对文件。候选图片与断言改动仍需审阅，并通过全量普通比较。

## 文档站与 VPM

[文档站](https://sealoong.github.io/Sensa/)随 `main` 的文档和网页修改自动构建，通过站点 E2E 后部署。正式发布成功后自动刷新 VPM。页面部署使用已检查的同一份静态产物，正式包刷新时读取当前 `main` 文档。

Pages 分为三个任务：

1. **Build** 在原生 runner 上固定最新 `main`，使用 GitHub CLI 收集正式 VPM 包并构建文档，上传本次构建的 Pages 归档。
2. **Verify** 在固定 Playwright 容器中检出同一提交，按产物 ID 下载归档，核对完整性、解包路径和站点清单中的提交，再对这份产物运行站点 E2E。
3. **Deploy** 等待构建与验证通过，部署已检查的同一份归档。

三个任务的预算依次为 10、15、10 分钟。归档名称包含运行编号和构建 attempt，便于重跑时定位同一份产物；Pages 归档和验证附件均保留 14 天。

站点审阅原图由完整候选运行的 `site.spec.js` 生成。导出器按固定名称收集桌面／窄屏的中英文首页和首次使用指南，核对来源、构建清单与 SHA-256，再写入八个固定 `__review__/site` 路径。PR 提供按提交固定的图片链接，便于在 GitHub 逐张检查。原图用于人工审阅；普通基线比较与站点行为检查继续执行。

VPM 构建保留已校验的正式包与历史下载。网络错误或摘要不一致会使部署失败；确实没有正式包时显示暂无 VPM 包。

## 本地开发与检查

需要 Node.js 24、Python 3.12+ 和 [global.json](https://github.com/SeaLoong/Sensa/blob/main/global.json) 指定的 .NET SDK。先规划受影响检查，再执行；相同源码与工具链可复用本地成功记录。

.NET SDK 固定为 `10.0.401`，并设置 `rollForward: disable`。Actions 和本地从仓库目录运行时都使用这一精确版本。升级 SDK 时同步更新包锁文件，并检查便携和单文件构建。依赖恢复保持锁定模式。

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
