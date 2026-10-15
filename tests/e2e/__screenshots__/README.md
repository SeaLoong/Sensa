# Reviewed CI screenshots

Initial baseline: 43 PNGs, reviewed 2026-10-16 (Asia/Shanghai).

- Source: [successful CI baseline run 38797097163](https://github.com/SeaLoong/Sensa/actions/runs/38797097163), commit `4a1c3815df822c74f7eaf78c3a7ec44c96349b50`.
- 18 functional cases passed before acceptance. Desktop and narrow-layout images were inspected, including real scroll segments and the narrow parameter table's right edge.
- Playwright / Chromium image: `mcr.microsoft.com/playwright:v1.64.1-noble`; locale `zh-CN`; timezone `Asia/Shanghai`; desktop 1280×900, narrow viewport 390×844.
- No local E2E or local screenshot generation was used. These are actual CI captures, not recreated illustrations.

To change a baseline, generate a new successful review-only run, inspect the screenshots/diffs, and commit the intentional changes. Ordinary CI must compare against committed PNGs with snapshot updates disabled. See [the workflow](../../../docs/e2e.md).
