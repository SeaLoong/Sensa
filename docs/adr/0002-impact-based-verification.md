# Impact-based verification and preview gates / 按影响验证与预发布门槛

同一个保守变更计划决定本地检查与 CI 范围：未知路径或无法确定差异时全量验证；文档或纯测试变更不发布产品。成功的本地检查按源码与工具链内容保存 receipt，相关内容改变或检查失败后失效。浏览器 E2E、完整进程 smoke 与截图只在 GitHub Actions 运行，预发布要求同一候选提交通过 E2E 比较。仅保留最近十个已发布预发布，稳定版与草稿不在自动删除范围内，Git tag 保留。

One conservative change plan drives local checks and CI. Unknown paths or unavailable diffs require full verification; documentation and test-only changes do not publish products. Successful local checks have receipts keyed by source and toolchain content, invalidated by relevant changes or failure. Browser E2E, full-process smoke and screenshots run only in GitHub Actions; preview publication requires a passing comparison for the same candidate commit. Keep the ten most recent published prereleases; preserve stable releases, drafts and Git tags.
