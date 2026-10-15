# Reviewed CI screenshots

Current bilingual baseline: 61 PNGs, reviewed 2026-10-16 (Asia/Shanghai).

当前中英双语基线包含 61 张 CI 截图。来源：[38802342060](https://github.com/SeaLoong/Sensa/actions/runs/38802342060)，提交 `48d860c4b705d4615dbe9bc11eb91f417374e639`。24 项测试全部通过后，审阅桌面与窄屏截图；普通比较任务 [38803164260](https://github.com/SeaLoong/Sensa/actions/runs/38803164260) 随后通过，六平台及预发布也成功。英文截图使用 `en-US`，中文使用 `zh-CN`，其他环境保持如下。

The current set comes from successful run 38802342060, commit `48d860c4b705d4615dbe9bc11eb91f417374e639`, after all 24 cases passed. Desktop/narrow screenshots were reviewed, then ordinary comparison run 38803164260 passed, followed by six native builds and prerelease. English captures use `en-US`; Chinese uses `zh-CN`.

Initial baseline history (43 PNGs):

- Source: [successful CI baseline run 38797097163](https://github.com/SeaLoong/Sensa/actions/runs/38797097163), commit `4a1c3815df822c74f7eaf78c3a7ec44c96349b50`.
- 18 functional cases passed before acceptance. Desktop and narrow-layout images were inspected, including real scroll segments and the narrow parameter table's right edge.
- Playwright / Chromium image: `mcr.microsoft.com/playwright:v1.64.1-noble`; locale `zh-CN`; timezone `Asia/Shanghai`; desktop 1280×900, narrow viewport 390×844.
- No local E2E or local screenshot generation was used. These are actual CI captures, not recreated illustrations.

To change a baseline, generate a new successful review-only run, inspect the screenshots/diffs, and commit the intentional changes. Ordinary CI must compare against committed PNGs with snapshot updates disabled. See [the workflow](../../../docs/e2e.md).
