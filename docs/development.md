# 开发、验证与发布

**简体中文** | [English](development.en.md)

围绕同一个源码提交开发，先运行相关单元检查，再由 CI 验证完整浏览器流程与原生包。main 成功构建发布预览，Release 工作流以相同检查要求发布正式版。Pages 验证静态产物后再部署。

## 平时提交代码会发生什么？

| 操作 | 自动执行 |
| --- | --- |
| 提交 Pull Request | 单元测试、完整 E2E 和全部平台构建，保留下载附件，不发布 Release |
| 推送到 `main` | 同一提交的检查通过、全部产物生成后，自动发布 pre-release |
| 修改 `main` 上的文档或网页 | 构建文档站，通过站点专用 E2E 后自动部署，无需手动运行 Pages |
| 手动运行 `release.yml` | 读取最新 `main`，检查、构建并发布正式 Release；随后自动刷新文档站与 VPM |

预发布与正式版使用同一套资产矩阵：六个 Node CLI 便携包、六个 Electron Desktop 便携包、两种 Windows 架构各自的 CLI 安装器与单文件程序、Unity ZIP 和 `SHA256SUMS.txt`，共 **18 个发布附件**。自动清理保留最近 **10 个已公开 pre-release**，同时保留正式版、未公开草稿和 Git 标签。VPM 收录正式版中的 Unity 包。

| 系统与方式 | 架构 | 文件名示例 | 怎样启动 |
| --- | --- | --- | --- |
| Electron Desktop 便携版 | 六个平台：Windows／Linux／macOS × x64／ARM64 | `Sensa-<版本>-<平台>-<架构>-Desktop.zip`／`.tar.gz` | 完整解压后打开 `Sensa.exe`、`./Sensa` 或 `Sensa.app`；Windows／macOS 使用 ZIP，Linux 使用 tar.gz，在内嵌窗口显示工作台 |
| Windows CLI 安装版 | x64／ARM64 | `Sensa-<版本>-win-<架构>-Setup.exe` | 为当前用户安装到 `%LOCALAPPDATA%\Programs\Sensa`，从开始菜单启动并打开浏览器，附带离线指南、Shader 与串口／BLE 桥工具，无需管理员权限 |
| Windows CLI 单文件 | x64／ARM64 | `Sensa-<版本>-win-<架构>-SingleFile.exe` | 直接运行一个 EXE，内置 Web 界面与交互图解，无需旁边另放程序文件；Python 桥工具和完整 Markdown 指南另取安装器或便携包 |
| Windows／Linux／macOS CLI 便携版 | x64／ARM64 | `Sensa-<版本>-<平台>-<架构>.zip`／`.tar.gz` | 便携目录，完整解压后运行，附带离线指南与工具；Windows 使用 ZIP，其余系统使用 tar.gz |

[下载](https://github.com/SeaLoong/Sensa/releases/latest)直接链接到 GitHub 最新正式版入口；尚无正式版时，GitHub 会将该地址重定向到发布历史。开发预览与旧版本单独列在[发布历史](https://github.com/SeaLoong/Sensa/releases)。从所选版本的发布附件下载桌面包、Unity ZIP 与 `SHA256SUMS.txt` 校验文件。

原生 SEA 发行构建精确使用 **Node 24.22.2**，与已核验的官方许可证摘要绑定；普通 bundle-only 与源码开发允许 `engines` 声明的 24.22.2+。便携目录中的 `THIRD-PARTY-NOTICES.txt` 汇总发布依赖许可，CLI 也通过 `/THIRD-PARTY-NOTICES.txt` 提供同一内容，单文件内嵌该资源。esbuild 的 LEGAL 文件仅承担对应打包代码的声明。

当前应用构建自带 Node 运行时与网页资源；Electron 包包含同一份 CLI 服务程序，Windows 安装器与单文件格式仍属于 CLI。串口／MIDI 原生依赖内嵌在 SEA 中，运行时校验后提取到私有临时目录。CLI 配置默认在可执行文件旁，Electron 默认在用户应用数据目录的 `Sensa/config.json`；`SENSA_CONFIG_PATH` 或 `--config` 可统一指定。录制输出默认在所选配置旁的 `recordings`，可用 `SENSA_RECORDINGS_PATH` 覆盖；工作台导出由浏览器下载。升级与卸载保留用户数据，单文件请放在可写目录。程序尚无发布者代码签名。

自动预发布的资产名在版本后追加 `-preview.<运行编号>.<attempt>.<提交前八位>`；正式版不追加。发布说明先提供各系统 Electron Desktop 的 x64／ARM64 下载，再列 CLI 格式及校验文件。预发布随后列出链接到完整构建提交的 **Source**，不列变更清单。

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
| `checks.yml` | Checks | 共用的 Web／Node／Python 单元、四项目严格类型检查、Unity 元数据与 E2E 检查 |
| `codeql.yml` | CodeQL Advanced | 四语言扫描；C# 真实构建、分析质量与完整源码覆盖检查 |
| `e2e.yml` | E2E | 浏览器行为、普通截图比较；手动生成待审基线 |
| `update-e2e.yml` | Update E2E | 手动更新测试／候选图片并创建待审 PR，默认无需 AI 密钥 |
| `build.yml` | Build | 六平台 CLI 与 Electron 便携包、Windows CLI 安装器／单文件、隔离原生冒烟与 Unity 打包 |
| `release.yml` | Release | 从最新 `main` 手动发布正式版 |
| `pages.yml` | Pages | 自动构建文档、执行站点 E2E、部署页面与 VPM |

每次运行都检查本次提交，发布使用同一次运行产生的检查结果和构建产物。

## 工作流使用哪些密钥？

仓库 Actions secret `SENSA_PAT` 用于发布 Release、推送 E2E 候选分支和创建待审 PR。PR 创建后自动触发普通 CI。

默认 `screenshots` 模式直接运行完整 E2E，生成应用基线候选和八张站点审阅原图；可选 `agent` 模式额外使用 `OPENAI_API_KEY` 维护测试用例。[图片审阅流程](e2e.md#怎样手动更新-e2e)

## 发布说明怎样生成？

自动预发布首先提供本次构建的 Electron Desktop 下载链接，再列 CLI、Unity 与校验文件的准确下载链接，随后通过 **Source** 链接到完整源码提交，不生成变更清单。

正式版说明同样先提供 Desktop 下载链接，再组合 GitHub 变更记录、直接提交记录与双语下载说明：

- 从上一个正式版本到本次提交的改动、Pull Request 和贡献者信息。
- 本次版本、完整提交号、检查／构建运行链接，以及适用系统和处理器的下载说明。
- 首次启动、文档和参数图解入口，以及 `SHA256SUMS.txt` 校验文件说明。
- 本次实际验证范围。

改动标题应直接说明用户能感受到的变化。自动记录依据仓库中的提交或 PR 信息生成。

## 扫描与工作流依赖维护

Dependabot 每周检查根目录 npm、`scripts` 与 `tools/protocol-bridge` 下的 pip 清单及 GitHub Actions，保留 React 安全更新分组。应用迁移后移除旧宿主的 NuGet 更新项；Unity C# 的真实引用与完整扫描继续保留。版本更新配置与安全告警分别管理，更新依赖后还需核对具体告警状态。普通应用构建始终先生成 `npm run build:web` 资源。

浏览器任务的 Playwright 镜像同时固定版本 tag 与官方 registry 的 OCI digest。升级时同步 npm Playwright 版本与三个浏览器任务，核对官方 manifest 内容的 SHA-256 和 `Docker-Content-Digest`；格式测试不能证明摘要来源。所有产物下载显式设置摘要不匹配即失败，维持固定 Action 的现有默认保护。

只读检查和构建不保留 checkout 的 Git 凭据；仅需认证 Git 读写的 E2E proposal 发布任务保留其专用 PAT。不得将候选测试执行移入该发布任务，也不得为减少提示关闭扫描器、增加全局目录排除或降低审计门槛。

Update E2E 的 agent 与 candidates 任务执行尚未审阅的生成代码，因此设置 GitHub 服务端强制执行的 `cache-mode: none`。即使取得任务的运行时令牌，也不能读写 Actions 缓存；这与清理环境变量或只关闭某个缓存步骤不同。保留的 `setup-node` 缓存声明会由固定版本工具包按服务端有效模式跳过，运行日志须确认 `effective cache-mode 'none'`，不能把配置文本当作已运行的证明。其他可信检查的缓存、候选产物上传和独立 PAT 发布继续工作。

原生 Desktop 矩阵的六个平台任务同样设置 `cache-mode: none`，使依赖安装与源码构建无法读写 Actions 缓存；须逐个核对运行日志的有效模式。单元检查、CodeQL、Pages 和其余任务维持各自的缓存策略，产物上传继续工作。当前 CI 从事件提交固定构建源码，正式发布只从 main 选取源码；不向手动调用暴露任意 `source_ref` 输入。

CodeQL 的缓存投毒模型可能把名称含 `ref`／`commit` 的表达式判为不可信 checkout，或尚未识别服务端缓存限权。必须核对实际调用链、引用来源和有效缓存权限；仅对已确认的具体告警记录误报或已缓解理由，不增加查询／目录排除。

### C# 分析质量与高级配置

高级工作流保留 Actions、C#、JavaScript／TypeScript、Python 四种语言及原有 `/language:<语言>` 分类，使用与原默认扫描一致的默认查询集和 remote 威胁模型，不增加查询过滤。C# 使用 manual 构建：固定 SDK，以真实 Unity／VRChat 引用编译保留的 Unity 包及两个实验工具源码；Node 宿主由 JavaScript／TypeScript 扫描覆盖。外部引用先在 CodeQL 初始化前编译，仓库自身代码在初始化后重新编译。

`scripts/codeql-unity.py` 按 `.github/codeql/unity-sources.json` 中的官方来源、版本、归档摘要和引用文件摘要准备编译依赖。它只提取已锁定的 SDK 引用，不启动 Unity Editor，不使用模拟类型；静态编译不代表 Unity 测试、PlayMode、客户端或硬件验收。新增源码或程序集定义必须进入实际编译计划，不能通过目录排除降低覆盖范围。

`scripts/verify-codeql-csharp.py` 从已执行的 `Telemetry/ExtractorInformation.bqrs` 读取真实指标，要求“有调用目标的调用”和“类型已知的表达式”均不低于原有 **85%** 门槛，且 none 模式指标为零；再逐一核对 CodeQL 源码归档与当前提交的全部 Git 跟踪 C# 文件内容。构建成功、文件清单或扫描绿灯都不能替代这些验证。结果保存在 Actions 附件中的 `csharp-quality.json`。

初次部署先保留默认扫描，独立分析始终设置 `upload: never`。只有所有前置步骤成功，且非秘密仓库变量 `SENSA_CODEQL_ADVANCED` 为 `true` 时，后续官方上传步骤才发布验证过的结果。这样可在切换前检查新配置，避免默认设置启用时被 GitHub 拒绝重复上传。

管理员切换步骤：

仓库已经有验证过的 `codeql.yml`，无需使用新建工作流向导。GitHub 的 **Switch to advanced** 会先停用默认设置，再进入新建文件页面；到达该页面时可以直接退出。不要再次提交同名文件，也不要删除、改名或用生成模板覆盖现有工作流。

1. 确认同一 `main` 提交的 **CodeQL Advanced** 四语言任务成功，C# 质量与完整源码覆盖检查通过。
2. 在 **Settings → Secrets and variables → Actions → Variables** 将仓库变量 `SENSA_CODEQL_ADVANCED` 设置为 `true`。它不是密钥；更改变量不会主动启动工作流。
3. 在仓库 **Settings → Code security → CodeQL analysis → …** 检查默认设置。如果菜单仍有 **Switch to advanced**，使用该菜单的 **Disable CodeQL** 停用默认设置以允许已有工作流上传；这是 GitHub 官方的迁移步骤。若向导已完成停用，直接使用已有工作流，无需再停用一次。现有 Actions 工作流保持启用。
4. 从 Actions 手动运行 **CodeQL Advanced** 的 `main`，确认四语言的 **Upload verified CodeQL results** 均成功并完成处理，再核对新的配置状态与告警记录。任务成功但上传步骤为 skipped 仍未发布；先检查变量是否为 `true`。上传报 default setup enabled 时，默认设置尚未停用。配置接口无管理权限时，设置操作需由管理员在网页完成。

官方说明：[停用默认设置以允许 SARIF 上传](https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/troubleshoot-sarif-uploads/default-setup-enabled#disabling-default-setup-to-unblock-sarif-upload)。

Node Intiface 输出使用共享连接池和 Buttplug wire v4 编解码；浏览器适配器使用 wire v3，虚拟设备输入提供 v2／v3／v4。Node 传输聚合完整 WebSocket 消息，限制每条为 1 MiB，检查 UTF-8 和最大深度 64 的 JSON；非法数据或初始化失败会结束本次连接并清理待处理请求。隔离契约覆盖分片、多字节名称、功能映射、租约和失败清理。

React 19 的生产构建和组件 SSR 单元测试统一使用自动 JSX 转换；测试加载器同时共享 `react` 与 `react/*` 运行时，避免混入第二份 JSX／Hooks 实例。

## 失败时从哪里看？

打开对应 Actions 运行，先看失败步骤与 Job summary。E2E 的 `summary.json`／`summary.md` 分别记录通过、失败、跳过、未执行、中断和不稳定用例；达到失败上限后停止执行的用例记为未执行。具体状态见[验证记录](e2e-status.md)。截图失败时查看 expected／actual／diff，审阅有意的变化后更新基线，再运行完整普通比较。

应用 E2E、候选采集和 Pages 站点验证使用同一版本的 Playwright 容器，镜像提供浏览器及其系统依赖。共用安装脚本补齐中文字体与模拟运行时，并保留字体匹配配置。完整应用浏览器任务预算为 35 分钟，覆盖两种视口、两种语言及多标签页连接场景。

依赖安装使用 Ubuntu 官方软件源，最多尝试两次，每次限时 130 秒，结束进程另留 5 秒；APT 网络等待为 15 秒，同一下载允许重试一次，步骤总预算为 5 分钟。第二次尝试会先执行 `dpkg --configure --pending` 完成中断的包配置，并通过临时软件源将 Azure Ubuntu 镜像切换到官方 `https://archive.ubuntu.com/ubuntu`。原软件源文件、发行版、组件和签名配置保持原值；字体使用首次成功读取索引时确定的版本和 SHA-256。恢复、索引验证及安装均计入同一预算，完成后继续验证。

原生构建分别对六个平台的 CLI 与 Electron 便携程序执行隔离冒烟，核对内嵌 CLI 的提交与字节身份、实际服务地址、渲染器隔离、设备依赖加载和退出清理。Windows 另有 Shader 桥模拟回放。Windows 单文件在仅含一个 EXE 的发布目录中再次冒烟，检查 API、Web 界面与本地图解。安装器在临时目录静默安装，核对安装后的二进制与离线工具，运行隔离程序冒烟，再卸载并确认保留用户配置和录制。安装、启动和卸载仅在 Actions 的原生 Windows runner 执行，不使用真实硬件。

Windows x64／ARM64 构建另安装已固定的 BLE 输入／输出依赖，检查真实 WinRT／Bleak API 与原生缓冲区字节往返；不枚举适配器、不创建 GATT 服务或启动广播。每个平台的 `protocol-bridge-dependencies.json` 随原生测试附件上传。这项依赖检查不能代替蓝牙实机验收。

安装器由固定版本的 Inno Setup 6.7.3 构建。引导脚本从官方 GitHub Release 下载编译器安装包，先核对仓库固定的 SHA-256 与官方发布者 `Pyrsys B.V.` 的有效 Authenticode 签名，再执行。该校验确认编译工具来源，不表示 Sensa 下载文件已有代码签名。

打包与发布接收普通文件，归档路径须适用于各平台。发布要求六个 CLI 包、六个 Desktop 包、四个 Windows CLI 附加格式与 Unity 包全部齐备，逐一核对平台校验值，再建立草稿；最终加上统一 `SHA256SUMS.txt` 共 18 个附件。上传后核对文件名、大小和 SHA-256，并在公开前再次确认 Git tag 实际指向的提交。上传失败保留草稿以便排查；已公开预发布的重跑会核对现有资产，并完成剩余清理。要发布更新代码，重新启动正式发布工作流，它会读取最新 `main` 并选择新的版本。

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

### 文档图表

使用 `mermaid` 代码围栏中的 `flowchart`／`graph` 描述流程图。文档站将含图页面连接到固定版本、随站点分发的本地 Mermaid 运行时，不依赖 CDN；普通代码块保持代码显示。图表采用 strict 模式和纯文本标签，不接受图内初始化配置、HTML 标签或可点击链接。

图形渲染需要 JavaScript。每张图都保留可展开的完整源代码；禁用 JavaScript、本地脚本加载失败或单张图解析失败时仍可阅读源码，其他图分别处理。窄屏可以横向滚动，键盘可聚焦图表区域，不通过把文字缩到不可读大小来适配。修改渲染或图文后，在 Actions 验证实际可见 SVG、双语导航和窄屏访问，不能仅靠 HTML 中出现 `mermaid` 字样认定渲染成功。

侧栏提供“协议输入”和“串口与蓝牙桥”入口，工具的三份 README 按中英文两条站内路由发布，英语别名不重复生成。协议指南与完整桥工具安装说明可在文档站内互相跳转。

## 本地开发与检查

应用开发使用 Node.js 24.22.2+ 与 Python 3.12+，Actions 固定 Node 24／Python 3.14。先规划受影响检查，再执行；相同源码与工具链可复用成功记录。只有 C# CodeQL 的真实 Unity 引用编译需要 [global.json](https://github.com/SeaLoong/Sensa/blob/main/global.json) 固定的 .NET SDK `10.0.403`（`rollForward: disable`）；Node 应用与单元测试无需 .NET。

```shell
npm ci
python -X utf8 scripts/verify.py --plan
python -X utf8 scripts/verify.py
```

浏览器 E2E、截图和完整进程冒烟在 Actions 执行，隔离单元和静态检查可本地运行。设备相关检查使用临时配置与模拟传输。真实硬件、Unity／VRChat 和 World 实际交互另行验收。

### TypeScript 与运行时兼容

仓库开发使用 **Node 24.22.2 或更高版本**与固定的 **TypeScript 7.0.2**。`src/core/runtime` 实现共享 `RuntimeEngine` 与 `ApplicationFacade`，`src/core/outputs` 统一输出协调；Node CLI、Electron 与浏览器本地宿主使用同一套行为。Unity 作者及构建代码继续使用 C#。

类型化源码使用 **Oxlint 1.90.0** 和 TypeScript 编译器，既有 JavaScript 保留 ESLint。已核对的 typescript-eslint 8.72.1 peer 范围不包含 TypeScript 7，因此保留稳定编译器，不强制安装不兼容依赖。仅在 `src/websensa/WebSensa.tsx` 关闭 `jsx-a11y/prefer-tag-over-role`：其建议会把合法内联 SVG 的 `role="img"`、状态播报与控件组替换为不同语义的元素；其他配置检查继续启用，浏览器 axe／交互检查验证实际页面。

`npm run typecheck` 执行四个不输出文件的严格项目：`tsconfig.json`（共享／浏览器）、`tsconfig.node.json`（Node 宿主与领域／组件测试）、`tsconfig.electron.json`（Electron 外壳）与 `tsconfig.e2e-types.json`（真实 Node／Playwright 测试契约）。Node 项目不引入 DOM 全局，浏览器和 Electron 各自保留需要的声明。严格检查包含 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、unknown 异常、隔离模块和可擦除语法。网络数据与原生事件通过 `unknown` 和运行时校验进入类型边界。既有桌面界面 JavaScript 保留原 lint 检查，新共享核心／浏览器适配器进入严格 TypeScript 检查。

```sh
npm ci
npm run typecheck
npm test
npm run test:node
npm run build:web
```

`npm test` 包含 lint、四项目类型检查与 Web 单元；`npm run test:node` 递归运行全部 Node／领域单元，生成 `artifacts/test-results/backend/node.xml` JUnit 与 `node-source.json`，记录源码提交、Node 版本及完整测试文件摘要。共用 Checks 上传为 `tests-backend`。

核心的可擦除 TypeScript 可由 Node 24 导入，React TSX 与浏览器适配器通过 esbuild 打包。浏览器语法目标保持 **Chrome 110、Firefox 115、Safari 16**；TypeScript 使用 ES2023 标准库基线，更新的运行库 API 经兼容适配器和回退测试后再使用。设备支持检测实际可调用 API，不猜测浏览器版本或 UA；串口、蓝牙和 MIDI 还需要安全上下文与选定设备授权。缺少这些能力时，对应选项不可用，可以选择可访问的 WebSocket／HTTP 地址或桌面桥接路线。

`src/websensa/capabilities.ts` 报告实际浏览器 API 与已注册工厂，检测本身不连接或请求权限；Node 通过自身能力清单提供网络、原生串口／MIDI与桥接适配器。Electron 使用同一 Node 服务的能力，渲染进程通过 HTTP／WebSocket 调用应用，不加载原生设备模块。图解在三维不可用时保留 SVG，桌面标签页保留 SharedWorker → Web Locks／BroadcastChannel → 各页连接的回退方式。

CI 在普通 Chromium 套件和独立 Firefox／WebKit 兼容任务中检查同一份 WebSensa 构建，覆盖桌面与窄屏。兼容任务检查真实模拟服务交付、能力回退、键盘、axe 与重排，并作为发布条件。执行结果按源码提交记录。

采用维护中的稳定依赖，固定所选版本并保留 lockfile；升级时核对当前上游版本与平台要求。语法目标、API 可用性与协议行为分别检查。[适配器目录与社区拆包路线](adapter-catalog.md)

### WebSensa 与桌面实例

`npm run build:web` 构建桌面界面、WebSensa 与参数图解资源。`scripts/build-websensa.mjs` 为静态站和桌面发布构建同一 React 入口、CSS 与许可证说明。静态路径为 `websensa/`，桌面 HTTP 提供 `/websensa/`，便携文件位于 `web/websensa/`。

源码启动 CLI 使用 `npm start`，内嵌窗口使用 `npm run desktop`；`npm run build:desktop` 仅准备开发外壳，原生分发由平台构建生成。CLI 以开发工作目录中的 `config.json` 为默认配置，Electron 使用用户应用数据目录的 `Sensa/config.json`。两者可用 `SENSA_CONFIG_PATH`／`--config` 指向同一旧配置，读取兼容 PascalCase，保存统一 camelCase。

WebSensa 单元检查注入时钟、WebSocket 对端和浏览器设备 API。Actions 打开构建页面执行完整控制／脚本、共用连接与模拟 GATT 流程。图解通过明确的浏览器连接交付同一套归一化轴值。

实例检查覆盖配置归属、陈旧持有者恢复、页面存活与实际绑定后的端口分配。Actions 启动独立进程检查重复启动与命名实例。日常开发通过 `--config`、`--instance` 和 `--new-instance` 选择设置，`--open-browser false` 用于无界面运行。[用户启动选项](quick-start.md#运行多个实例)

### 可选串口与 BLE 桥工具

CLI 便携包、Windows CLI 安装器与 Electron 内嵌的 CLI 目录通过 `scripts/release.py` 的明确白名单附带 `tools/protocol-bridge` 中的 Python 源码、双语用法及依赖版本文件；安装器复用同一工具文件，Actions 逐个核对安装后的内容。该目录的可选依赖也由 Dependabot 每周维护，BLE 后端与原生 WinRT 投影分别分组更新，保留各平台标记和安全更新检查。程序不会安装 Python、虚拟串口驱动或 Python 依赖，独立单 EXE 也不嵌入解释器。需要这些工具时，从便携包、安装器或 Electron 包取得文件，在自己选择的 Python 虚拟环境安装所需依赖。`SENSA_BRIDGE_PYTHON` 与 `SENSA_BRIDGE_SCRIPT` 只从可信宿主启动环境指定解释器和脚本位置，不属于可由 WebUI 修改的设备配置。

```shell
python tools/protocol-bridge/bridge.py --check
python -m pip install -r tools/protocol-bridge/requirements-serial.txt
python -m pip install -r tools/protocol-bridge/requirements-ble-output.txt
python -X utf8 -m unittest discover -s tests/scripts -p 'test_protocol_bridge*.py'
```

Linux／macOS BLE 输入使用 Bless，Windows 输入使用原生 PyWinRT，输出使用 Bleak。工具指南列出平台权限、广播名称与 LOOB、Thrust Sync、Svakom V1、Lovense 单振动和 Youou VX001 配置。隔离 PTY／模拟 GATT／WinRT 检查验证软件行为，硬件检查使用对应 OS 与适配器。[安装与操作](../tools/protocol-bridge/README.zh-CN.md)

修改 Three.js 源码或依赖后运行 `npm run build:web`，提交可再现的 `docs/assets/parameter-geometry-3d.js` 与完整 `3d.LICENSE.txt`。修改普通 Markdown 后可直接构建站点：`npm run build:pages`，产物位于 `artifacts/pages/`。

大量参数的纯排序可单独测量：

```shell
node scripts/benchmark-osc-preview.mjs --output artifacts/performance/osc-ranking.json
```

该脚本测量纯排序耗时；浏览器中的持续更新、翻页、冻结与路径建议由 E2E 检查。

## 检查输出与共享会话

协议与传输改动使用隔离编解码、模拟传输和时钟，核对数值类型、量程、取消、停止和重连。脚本自然结束保留末值与输入启用状态；显式暂停／停止、关闭输入与急停分别覆盖停止路径，组合模式的其他来源继续运行。DG-LAB 检查配对、设备上报与 RPC／任务寿命；时间计算检查初始样本、换源、失效和时间倒退；录制检查有界存储、转义和样本时间戳。

共享会话测试分别检查同页引用计数、SharedWorker 共享、Web Locks 持有页接续、BroadcastChannel 请求关联和每标签页回退。Actions 浏览器用例打开多个页面，检查部分关闭、持有页接续和全部关闭后的重新打开；页面缓存挂起与恢复由隔离的生命周期单元测试检查。HTTP 连接池与服务器 WebSocket 预算分别观察。新增输出表单按普通截图比较与逐张审阅维护基线。[架构决策](adr/0008-signal-pipeline-and-shared-session.md) · [使用指南](signal-pipeline.md)

[架构](architecture.md) · [当前 CI 决策](adr/0005-simplified-ci-and-releases.md) · [浏览器验证](e2e.md)
