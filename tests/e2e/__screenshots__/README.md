# Screenshot baseline review / 截图基线评审

The current set contains **110 PNGs**: 55 desktop and 55 narrow-layout images. [Candidate run 39696164927](https://github.com/SeaLoong/Sensa/actions/runs/39696164927) generated changes from source `c698c70177cc9b746567e12c59860d9217bf49c4`; [PR #15](https://github.com/SeaLoong/Sensa/pull/15) contains image commit `2b850c4ffd2ae476bb7cbdd914575d69d8d4900f`.

当前共 **110 张 PNG**，桌面与窄屏各 55 张。上述候选运行和 PR 记录本次图片的来源与提交。

## Inspected changes / 已审阅变化

Coding assistants individually inspected all **55 changed PNGs** on 2026-10-22 (China Standard Time): **27 desktop and 28 narrow-layout images**. The remaining 55 images retain their previous bytes and review history.

代码助手于 2026-10-22（北京时间）逐张审阅全部 **55 张变化图片**：桌面 27 张、窄屏 28 张；其余 55 张沿用原图片和评审记录。

- **40 parameter diagrams**: SPS2, SPS1, Plug Touch, Sensa SPS and Shader × Chinese/English × XZ/orbit × desktop/narrow layout. Full parameter names, alphabetical rows with shorter prefixes first, selected-parameter meanings, wrapping, controls, labels and footers are readable. NewTip is shown as a length sphere centered on the Plug root. Sensa SPS shows four radius-2 receiver regions and their shared green coverage; Shader shows the edge markers and central payload.
- **15 application images**: `english-help`, `fixed-root-position`, `help-workflow`, `osc-mappings-page`, `paired-pose`, `recording-controls` and `shader-root-position` in both viewports, plus narrow-layout `pb-calibration`. Updated help, source explanations, mapping labels and recording instructions fit their panels.
- Review used the [V1–V6 criteria](../../../docs/ui-quality.en.md): hierarchy, type, grouping, color, alignment and bilingual reflow. No new visual issues were found in the changed images.

- **40 张参数图**：SPS2、SPS1、Plug Touch、Sensa SPS、Shader × 中英文 × XZ／可旋转视图 × 桌面／窄屏。完整参数名、按字典序且短前缀在前的行名、选中参数的含义、换行、控件、标签和页脚均可读。NewTip 的长度球以 Plug 根点为中心；Sensa SPS 显示四个半径为 2 的接收范围及绿色共同覆盖区域；Shader 显示边缘标记和中央数据区。
- **15 张应用图**：上述七组应用图片的双视口版本，以及窄屏 `pb-calibration`。更新后的帮助、来源说明、映射标签和录制提示在面板内正常排版。
- 按 [V1–V6](../../../docs/ui-quality.md)检查层级、字体、分组、配色、对齐和双语重排，变化图片中未发现新的视觉问题。

## Browser evidence / 浏览器运行

Candidate run **39696164927** passed all **74 cases** and successfully exported the images and created PR #15. The full normal comparison in [39697659875](https://github.com/SeaLoong/Sensa/actions/runs/39697659875/job/119559195039) also passed **74/74**, with image updates disabled and `selectionComplete=true`, `snapshotsCompared=true`. Expected failures, failures, flaky outcomes, skips, unrun and interrupted cases were all zero in both runs. Comparison used PR merge commit `6df338efbef7d349d4db277015f2ea88cf596ccc`, whose Git tree matches image commit `2b850c4` exactly. The changed images were accepted after individual inspection and this comparison.

候选运行 **39696164927** 的 **74 项全部通过**，图片导出及 PR 创建成功。运行 **39697659875** 的完整普通比较也 **74/74 通过**，图片更新关闭，`selectionComplete=true`、`snapshotsCompared=true`；两次运行的预期失败、失败、不稳定、跳过、未执行和中断均为 0。普通比较使用 PR 合并提交 `6df338efbef7d349d4db277015f2ea88cf596ccc`，其 Git 树与图片提交 `2b850c4` 完全一致。变化图片经逐张审阅及本次比较后接受。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844; additional automated 320 CSS px reflow checks. / 另有 320 CSS px 自动重排检查。
- Execution / 执行: browsers and screenshot generation run in GitHub Actions; review reads the resulting PNGs. / 浏览器与截图生成在 GitHub Actions 执行，评审读取实际生成的 PNG。
- Coverage / 范围: simulated browser behavior and visual layouts. Unity/VRChat, physical touchscreens, real GPU capture and hardware interactions receive separate acceptance checks. Accessibility details remain in each run's report. / 本次覆盖模拟浏览器行为和页面布局；Unity／VRChat、实体触屏、真实 GPU 捕获和设备交互另行验收。可访问性明细保留在各次运行报告。

See the [current verification record](../../../docs/e2e-status.en.md), [E2E maintenance flow](../../../docs/e2e.en.md) and [earlier visual review](../../../docs/ui-visual-review.en.md).

参见[当前验证记录](../../../docs/e2e-status.md)、[E2E 维护流程](../../../docs/e2e.md)和[历史视觉评审](../../../docs/ui-visual-review.md)。
