# Project workflow / 项目工作流

- After each completed, validated change, commit and push the main Sensa repository. / 每个完成并验证的改动都提交并推送主 Sensa 仓库。
- Keep unrelated changes out of commits; report actual checks and unverified Unity/hardware behavior. / 提交不夹带无关改动；交付时记录实际验证及未验证的 Unity／硬件行为。
- Keep documentation and tool configuration portable: use repository-relative paths, environment variables or placeholders; discover local installations at runtime. / 文档与工具配置使用仓库相对路径、环境变量或占位符；本机安装位置在运行时解析。
- For optional local checks, use `python -X utf8 scripts/verify.py --plan`, then `scripts/verify.py` for affected checks. Reuse valid receipts; use `--force` only for a justified rerun. Read `docs/development.md` when changing CI, packaging or publication. / 可选本地检查先规划再执行，复用有效凭据；仅有理由重跑时使用 `--force`。修改 CI、打包或发布时阅读开发文档。
- CI runs source/unit checks, then full browser E2E for the same pinned commit, then native builds and isolated smoke before publication. Pages verifies its built site before automatic deployment. Never describe mocks or build success as real hardware or Unity-client acceptance. / CI 先运行源码与单元检查，再对同一固定提交执行完整浏览器 E2E，之后构建原生包并隔离冒烟，通过后发布；Pages 检查构建的站点后自动部署，模拟与构建成功不等于真实硬件或 Unity 客户端验收。
- Browser E2E, screenshots, full-process smoke and World PlayMode run only in GitHub Actions; isolated local unit/static/EditMode checks are allowed. Update E2E assertions and current-run evidence with behavior changes. Baseline candidates require image review and a normal full comparison; never auto-approve image changes. / 浏览器 E2E、截图、完整进程冒烟及 World PlayMode 仅在 Actions 运行，本地允许隔离单元、静态与 EditMode 检查；行为变化同步更新 E2E 和本次证据，基线候选须审图并通过普通完整比较，不能自动接受图片变化。
- Main pushes automatically publish development previews and deploy GitHub Pages. Stable releases are initiated through `release.yml` with optional version override, resolve latest main once and pin every archive to that commit. No manual tag push is needed. / main 推送自动预发布并部署 Pages；正式版通过 release.yml 手动发起，可选指定版本，一次确定最新 main 并固定全部构建，不需要手动推送标签。
- Retain ten published prereleases; preserve stable releases, drafts and Git tags. Branch pushes and automatic previews are authorized; do not initiate a stable publication on the user's behalf without an explicit request to publish. / 只保留十个已发布预发布，保留正式版、草稿和 Git tag；分支推送与自动预览已授权，未经明确发布指令不代用户执行正式发布。
- Device tests use isolated configuration and mock transports, never the user's hardware. The independent Unity world repository remains local without a remote or pushes. / 设备测试使用隔离配置和模拟传输，禁止激活用户硬件；独立 Unity 世界仓库保持本地，不配置远端或推送。
- During initial development, update internal protocols in place without version bumps or compatibility branches solely for development changes; preserve external SPS/OSC interoperability. / 初期开发原位更新内部协议，不仅为开发改动升级版本或增加兼容分支；保留外部 SPS／OSC 互通。

## Code and documentation search

For mechanism discovery across code or documentation, use the `xerj-sensa` MCP search tools when available; read `docs/agents/xerj.md` before the first search or when setting up or troubleshooting the service. Use `rg` for exact text/file lookup and verify retrieved passages against the current source before editing.

## Agent skills / 代理技能

### Issue tracker / 问题追踪

Issues/specs live in GitHub Issues for `SeaLoong/Sensa`; read `docs/agents/issue-tracker.md` before ticket operations. / 问题与规格位于 GitHub，操作工单前阅读追踪说明。

### Triage labels / 分诊标签

Use the five canonical labels; read `docs/agents/triage-labels.md` before triage. / 使用五个规范标签，分诊前阅读标签说明。

### Domain docs / 领域文档

Use root `GLOSSARY.md` and `docs/adr/`; read `docs/agents/domain.md` before exploration. / 使用根术语表与 ADR；探索代码前阅读领域说明。
