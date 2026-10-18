# Project workflow / 项目工作流

- After each completed, validated change, commit and push the main Sensa repository. / 每个完成并验证的改动都提交并推送主 Sensa 仓库。
- Keep unrelated changes out of commits; report actual checks and unverified Unity/hardware behavior. / 提交不夹带无关改动；交付时记录实际验证及未验证的 Unity／硬件行为。
- Use `python -X utf8 scripts/verify.py --plan`, then `scripts/verify.py` for affected local checks. Reuse valid receipts; use `--force` only for a justified rerun. Read `docs/development.md` when changing tests, CI, packaging or release behavior. / 先规划再执行受影响检查，复用有效凭据；仅有理由重跑时使用 `--force`。修改测试、CI、打包或发布时阅读开发文档。
- Browser E2E, full-process smoke, screenshots and World PlayMode suites run only in GitHub Actions. Local static checks, isolated unit tests and Unity EditMode are allowed. Inspect required CI comparisons and image diffs; baseline changes need review. / 浏览器 E2E、完整进程冒烟、截图和世界 PlayMode 仅在 Actions 运行；本机允许静态、隔离单元及 Unity EditMode。核对必要的 CI 比较和差异图，基线变更必须审阅。
- Main pushes automatically inherit or recover unfinished product verification. Documentation/test-only skips apply only when none is outstanding; intent artifacts and a successor documentation success cannot replace actual required owner-job success. Read `docs/development.md` for continuation rules. / main 自动继承或恢复未完成的产品验证；只有没有待接续验证时才按纯文档／测试跳过产品链。意图 artifact 或后续文档 success 不能替代 owner 必要 jobs 的真实成功；接续规则见开发文档。
- Prereleases require a passing full E2E comparison for the candidate commit. Retain ten published prereleases; preserve stable releases, drafts and Git tags. Branch pushes and automatic main previews are authorized; stable tags/publication need an explicit request. / 预发布要求候选提交通过全量 E2E 比较，只保留十个已发布预发布，保留稳定版、草稿和 Git tag。分支推送及 main 自动预览已授权，稳定发布仍需明确请求。
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
