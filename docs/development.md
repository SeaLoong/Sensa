# 开发、验证与发布

**简体中文** | [English](development.en.md)

CI 先执行单元测试和完整浏览器 E2E 比较，全部通过后构建、打包和发布。自动预发布与手动正式版使用相同的检查要求。构建或测试失败时停止发布；测试成功也不代表真实客户端或设备已经验收。

## 平时提交代码会发生什么？

| 操作 | 自动执行 |
| --- | --- |
| 提交 Pull Request | 单元测试、完整 E2E 和全部平台构建，保留下载附件，不发布 Release |
| 推送到 `main` | 同一提交的检查通过、全部产物生成后，自动发布 pre-release |
| 修改 `main` 上的文档或网页 | 构建文档站，通过站点专用 E2E 后自动部署，无需手动运行 Pages |
| 手动运行 `release.yml` | 读取最新 `main`，检查、构建并发布正式 Release；随后自动刷新文档站与 VPM |

预发布与正式版都包含 Windows／Linux／macOS 的 x64 和 ARM64 程序，以及 Unity ZIP。自动清理仅保留最近 **10 个已公开 pre-release**，不删除正式版、未公开草稿或 Git 标签。VPM 只收录正式版中的 Unity 包。

## 怎样发布正式版？

1. 打开 GitHub 的 [Actions → 正式发布工作流](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml)。
2. 点击 **Run workflow**，使用 `main`。
3. `version` 留空即可自动选择版本；需要指定版本时填写 `0.5.0` 这样的版本号。
4. 执行工作流，等待检查、构建和发布完成，再从 [Releases](https://github.com/SeaLoong/Sensa/releases) 下载。

不需要提前创建标签，也不需要逐个平台操作。工作流开始时解析最新 `main` 的完整提交号，此后所有检查、平台产物、Unity 包和 Release 都使用该提交；执行期间的新提交留给下一次发布。

默认版本取仓库版本与已存在正式标签中的最高版本：仓库版本更高时使用仓库版本，否则将最高正式版本的补丁号加一。例如已有 `v0.4.0` 时，下次自动发布 `v0.4.1`。手动版本必须高于已有正式版本，不能覆盖已发布版本。所选版本只写入本次构建目录，不自动修改或提交 `main` 中的版本文件。

## 工作流各负责什么？

| 文件 | 责任 |
| --- | --- |
| `ci.yml` | PR／main 的自动检查与构建；main 自动预发布 |
| `checks.yml` | 共用的 Web／.NET／Python 单元、Unity 元数据与 E2E 检查 |
| `e2e.yml` | 浏览器行为、普通截图比较；手动生成待审基线 |
| `update-e2e.yml` | 手动更新测试／候选图片并创建待审 PR，默认无需 AI 密钥 |
| `build.yml` | 共用的六平台桌面构建、隔离原生冒烟与 Unity 打包 |
| `release.yml` | 从最新 `main` 手动发布正式版 |
| `pages.yml` | 自动构建文档、执行站点 E2E、部署页面与 VPM |

每次运行只依据本次提交的必要检查和构建结果，不使用旧任务的通过状态替代当前检查，也不维护跨提交的验证接续规则。

## 工作流使用哪些密钥？

仓库 Actions secret `SENSA_PAT` 用于发布 Release，以及推送 E2E 候选分支、创建待审 PR。PR 创建后自动触发普通 CI。密钥只传给这些写入步骤，单元测试、浏览器测试和可选 Codex 代理均不接收。若使用 fine-grained PAT，授权 Sensa 仓库的 Contents、Pull requests 和 Workflows 写入权限。Workflows 用于发布固定提交：构建期间若默认分支的工作流文件发生变化，[GitHub 创建 Release 的规则](https://docs.github.com/en/rest/releases/releases#create-a-release)要求此权限；classic PAT 对应 `repo` 与 `workflow` scope。密钥缺失时停止写入，不在日志中输出其内容。

默认 E2E 截图更新不需要 AI 密钥。只有 `agent` 模式额外使用 `OPENAI_API_KEY`。外部代理调用工作流时使用自身已获授权的 GitHub 身份，不能读取 Actions 中保存的 secret，也不需要把密钥复制到对话中。

## 发布说明怎样生成？

发布说明自动组合 GitHub 的变更记录与固定的双语使用信息：

- 从上一个正式版本到本次提交的改动、Pull Request 和贡献者信息；预发布不充当正式版的比较起点。
- 本次版本、完整提交号、检查／构建运行链接，以及适用系统和处理器的下载说明。
- 首次启动、文档和参数图解入口，以及 `SHA256SUMS.txt` 校验文件说明。
- 本次实际验证范围；不把模拟传输或浏览器测试表述为真实设备验收。

改动标题应直接说明用户能感受到的变化。自动记录引用仓库中的提交或 PR 信息，不推断没有记录的功能或性能结论。

## 失败时从哪里看？

打开对应 Actions 运行，先看失败步骤与 Job summary。E2E 的 `summary.json`／`summary.md` 区分通过、失败、跳过、未执行、中断和不稳定用例；具体状态见[验证记录](e2e-status.md)。失败上限之后未执行的用例不能算通过。截图失败应查看 expected／actual／diff，只有审过的有意变化才能更新基线；不能用生成候选图片代替普通比较通过。

只有单元测试、完整普通 E2E、原生检查和全部下载包都成功，工作流才发布 Release。原生构建在隔离配置中启动生成的程序做冒烟，Windows 另有 Shader 桥模拟回放，不连接用户硬件。发布先建立草稿，再上传并核对文件名、大小和 SHA-256；上传失败保留未公开草稿。同一正式版本不会覆盖已公开的 Release。要发布更新代码，应重新启动正式发布工作流，让它重新读取最新 `main`。

## 文档站与 VPM

[文档站](https://sealoong.github.io/Sensa/)随 `main` 的文档和网页修改自动构建，通过站点 E2E 后部署。正式发布成功后自动刷新 VPM，因此不需要另外手动运行 Pages。页面部署使用已检查的同一份静态产物，正式包刷新仍读取当前 `main` 文档。

VPM 构建保留已校验的正式包与历史下载。网络错误或摘要不一致会使部署失败；只有确实没有正式包时才显示暂无 VPM 包。预发布不会进入正式 VPM 索引。

## 本地开发与检查

需要 Node.js 24、Python 3.12+ 和 [global.json](https://github.com/SeaLoong/Sensa/blob/main/global.json) 指定的 .NET SDK。先规划受影响检查，再执行；相同源码与工具链可复用本地成功记录。

```shell
npm ci
python -X utf8 scripts/verify.py --plan
python -X utf8 scripts/verify.py
```

浏览器 E2E、截图和完整进程冒烟在 Actions 执行，不在本机伪造 CI 环境。隔离单元和静态检查可本地运行。设备相关检查使用临时配置与模拟传输，不操作用户硬件；Unity／VRChat 和 World 实际交互需另行安排。

修改 Three.js 源码或依赖后运行 `npm run build:web`，提交可再现的 `docs/assets/parameter-geometry-3d.js` 与完整 `3d.LICENSE.txt`。普通 Markdown 不需要重建该文件。`npm run build:pages` 的站点产物位于 `artifacts/pages/`。

大量参数的纯排序可单独测量：

```shell
node scripts/benchmark-osc-preview.mjs --output artifacts/performance/osc-ranking.json
```

该脚本不包含浏览器渲染或布局，不能作为实际帧率；持续更新、翻页、冻结与路径建议由 E2E 检查。

[架构](architecture.md) · [当前 CI 决策](adr/0005-simplified-ci-and-releases.md) · [浏览器验证](e2e.md)
