# Simplified CI and releases / 简化 CI 与发布

**Status: accepted. / 状态：已接受。**

The user requested a single manually started stable-release workflow based on latest main, while retaining automatic pre-releases and automatic documentation deployment. Unit tests and E2E must participate in CI before publication. Versions default to automatic patch selection with an explicit override. This replaces the complex impact/continuation rules in [ADR 0002](0002-impact-based-verification.md); the standalone bilingual-site decision in [ADR 0004](0004-standalone-bilingual-documentation.md) remains.

`ci.yml` runs PR/main checks and builds, publishing only automatic main pre-releases. `release.yml` uses workflow_dispatch, resolves latest main once and pins every job to that commit. Shared `checks.yml` runs units and a full normal comparison through `e2e.yml`. After success, `build.yml` produces six desktop archives and one Unity ZIP, with isolated native-binary smoke checks and Windows shader-bridge mock replay. Publication requires successful current-commit checks, normal E2E comparison and every build; no earlier owner records or cross-commit continuation state are used.

Stable releases use one `vX.Y.Z` tag for the complete artifact set. Automatic selection uses the repository version if above existing stable versions; otherwise it increments the highest stable patch. Explicit versions must exceed existing stable versions. Versions apply inside build workspaces without source-history writeback. Legacy stable Unity packages remain readable in VPM.

Release notes combine changes/contributors since the previous stable release with bilingual installation/download guidance, commit/run links, checksums and actual verification scope. Browser/mock results are not hardware acceptance. Drafts become public only after complete remote asset verification. Retain ten published pre-releases, preserving stable releases, drafts and tags. Pages builds and checks its static artifact with site E2E before automatic deployment; stable publication refreshes VPM automatically.

Manual `update-e2e.yml` maintenance generates candidate images and a review PR, then runs ordinary branch CI without writing to main or merging automatically. Default screenshot mode requires no AI key; optional agent mode uses a repository `OPENAI_API_KEY` secret to maintain E2E tests. Candidate generation and ordinary comparison remain separate evidence.

Trusted Release publication and E2E branch/PR steps use the repository `SENSA_PAT` secret; the new PR automatically triggers normal CI. Read-only checks, candidate capture and the Codex agent do not receive this token. External callers dispatch through their own authorized GitHub identity; Actions secrets are not exposed to them.

用户要求只需手动运行一个工作流，就能从最新 main 发布正式版，同时保留自动预发布和自动文档部署。单元测试与 E2E 必须在 CI 中通过后才能发布。版本默认自动选择下一个补丁号，也可明确指定。此决策替代 [ADR 0002](0002-impact-based-verification.md) 中复杂的影响规划与验证接续规则；[ADR 0004](0004-standalone-bilingual-documentation.md) 的独立双语文档站仍然保留。

`ci.yml` 为 PR／main 执行检查与构建，只在 main 自动预发布。`release.yml` 通过 workflow_dispatch 启动，解析一次最新 main，全部任务固定使用该提交。共用 `checks.yml` 执行单元测试，并通过 `e2e.yml` 完成全量普通比较；成功后 `build.yml` 生成六个桌面压缩包与 Unity ZIP，执行隔离原生进程冒烟及 Windows Shader 桥模拟回放。发布必须取得当前提交的检查、普通 E2E 和所有构建成功，不使用旧 owner 记录或跨提交接续状态。

正式版使用统一 `vX.Y.Z` 标签。仓库版本高于全部正式版时使用该版本，否则增加最高正式版的补丁号；指定版本须高于已有正式版。只在构建目录应用版本，不回写源历史。VPM 继续读取历史 Unity 正式包。

发布说明组合上一正式版以来的改动与贡献者、双语安装下载信息、提交／运行链接、校验值与实际验证范围，不把浏览器或模拟结果当作硬件验收。远端完整资产核对成功后才公开草稿；只清理超出最近十个的已公开预发布，保留正式版、草稿和标签。Pages 构建静态产物并通过站点 E2E 后自动部署，正式发布后自动刷新 VPM。

手动 `update-e2e.yml` 生成候选图片与待审 PR，再运行维护分支的普通 CI，不直接写入 main 或自动合并。默认截图模式不需要 AI 密钥；可选代理模式使用仓库 `OPENAI_API_KEY` secret 维护 E2E 测试。候选生成与普通比较分别记录，不能互相替代。

受信任的 Release 发布以及 E2E 分支推送、PR 创建步骤使用仓库 `SENSA_PAT` secret；新 PR 自动触发普通 CI。只读检查、候选采集和 Codex 代理不接收该令牌。外部调用者使用自身已获授权的 GitHub 身份启动工作流，不能读取 Actions 中的密钥。
