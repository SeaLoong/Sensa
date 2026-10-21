# Former impact-based verification / 原按影响验证方案

**Status: superseded by [ADR 0005](0005-simplified-ci-and-releases.md). / 状态：已由 [ADR 0005](0005-simplified-ci-and-releases.md) 替代。**

The former design selected tests from changed paths and carried unfinished product-verification records across main pushes. Desktop and Unity packages also used separate tag-triggered publication paths. These rules coupled documentation, testing and publication through additional execution-state tracking.

The current design keeps unit tests, full E2E comparison and necessary native checks, but uses a direct pipeline for the selected commit. Automatic main pre-releases and manually started stable releases share those checks. Stable publication resolves latest main and selects a version automatically unless overridden. ADR 0005 defines the current operation; this file explains the replaced complexity without retaining old workflow commands.

原方案按改动路径选择测试，并在 main 后续提交中接续未完成的产品验证；桌面与 Unity 还通过不同标签入口发布。这些规则需要额外追踪任务状态，增加了文档、测试与发布之间的协调成本。

当前方案保留单元测试、完整 E2E 比较和必要原生检查，改为针对所选提交直接执行。main 自动预发布与手动正式版共用检查；正式发布从最新 main 开始，默认自动选择版本，也可覆盖。操作以 ADR 0005 为准；本页只解释被替代的复杂性，不保留旧流程命令。
