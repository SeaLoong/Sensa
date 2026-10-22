# Screenshot baseline review / 截图基线评审

The set contains **122 PNGs**: 61 desktop and 61 narrow-layout images. [Candidate run 39792231646](https://github.com/SeaLoong/Sensa/actions/runs/39792231646) generated images from source `8e77ba4998daf5fbb61d48e5d608bb40a1b820d5`. [PR #16](https://github.com/SeaLoong/Sensa/pull/16) contains image commit `9166f82e4142bc38748bb9bb7dd70bd2383e7f5e`.

当前共 **122 张 PNG**，桌面与窄屏各 61 张。上述运行与 PR 记录图片来源；本轮新增 12 张、修改 44 张。

## Inspected changes / 已审阅变化

Coding assistants individually opened all **56 changed PNGs** on **2026-10-22 (China Standard Time)**: 28 desktop and 28 narrow-layout images. The remaining **66 PNGs** retain their bytes and [previous review history](https://github.com/SeaLoong/Sensa/blob/c9662166cf115d5e123ef3b47dcd8bb317be1cc5/tests/e2e/__screenshots__/README.md).

代码助手于 **2026-10-22（北京时间）**逐张打开并审阅全部 **56 张变化图片**：桌面与窄屏各 28 张；其余 **66 张**字节未变，沿用上述历史评审。

- **48 parameter diagrams**: Contact SDK, four-anchor tracking, SPS2, SPS1, Plug Touch and Shader × Chinese/English × XZ/orbit × desktop/narrow layout. Full parameter names, alphabetical ordering, selected-field explanations, values, units, controls and footers remain readable. The introduction keeps its spacing and adds links by use.
- **8 application images**: Contact position, Contact speed, Chinese help and English help in both viewports. Contact diagnostics show metre coordinates, receiver radius, relative velocity, speed and proximity change rate. Help includes both tracking methods and the SDK guide.
- Review followed [V1–V6](../../../docs/ui-quality.en.md). Contact shows one radius-2 Receiver, the tracked Sender midpoint and green coverage; four-anchor tracking retains the four colored anchors and their shared coverage; Shader retains its edge markers. Long names wrap within their column, and all values and actions remain visible.
- **Accepted layout detail:** desktop Contact velocity readouts wrap `m/s` onto a separate line immediately below the components. The value and unit remain legible. No blocking or major visual issue was found in the changed images.

- **48 张参数图**：上述六组场景 × 中英文 × XZ／可旋转视图 × 桌面／窄屏。完整参数名、字典序、选中字段解释、数值、单位、控件和页脚均可读；介绍正文保留间距并增加按用途导航。
- **8 张应用图**：位置诊断、速度诊断、中文帮助和英文帮助的双视口版本。Contact 诊断展示米制坐标、接收半径、相对速度、速率与接近值变化率；帮助包含两种定位方式及 SDK 指南。
- 按 [V1–V6](../../../docs/ui-quality.md)检查。Contact 显示单个半径 2 的 Receiver、跟踪的 Sender 中点及绿色覆盖；四点定位保留四色锚点与共同覆盖；Shader 保留边缘定位图案。长参数名在自身列内换行，读数与操作均完整可见。
- **接受的排版细节：**桌面 Contact 三轴速度的 `m/s` 单独换行，紧随分量下方，读数与单位仍清楚可见。本轮变化图片中未发现阻断或主要视觉问题。

## Browser evidence / 浏览器运行

Candidate run **39792231646** passed **80/80 cases** and exported the images to PR #16, with `selectionComplete=true`, `snapshotsCompared=false`; expected failures, failures, flaky outcomes, skips, unrun and interrupted cases were all zero. The normal full comparison is [39794320594](https://github.com/SeaLoong/Sensa/actions/runs/39794320594/attempts/2), using PR merge commit `1d46aa95e8512912fd97333b368bcf717aaf675e`. Its Git tree matches image commit `9166f82` exactly. Attempt 2 passed **80/80**, with image updates disabled, `selectionComplete=true` and `snapshotsCompared=true`; every other outcome was zero. The images are accepted after individual inspection and this full comparison. All six native builds/smoke checks, Windows Shader bridge replay and Unity packaging also passed. Attempt 1 reached the dependency-install time limit before browser cases ran; the retry used the same source and image bytes.

候选运行 **39792231646** 的 **80 项全部通过**，图片已导出至 PR #16，`selectionComplete=true`、`snapshotsCompared=false`；预期失败、失败、不稳定、跳过、未执行和中断均为 0。完整普通比较为上述运行，使用 PR 合并提交 `1d46aa95e8512912fd97333b368bcf717aaf675e`，Git 树与图片提交 `9166f82` 完全一致。第 2 次尝试 **80/80 通过**，图片更新关闭，`selectionComplete=true`、`snapshotsCompared=true`，其余结果均为 0。图片经逐张审阅及此次完整比较后接受。六平台构建／隔离冒烟、Windows Shader 桥回放与 Unity 打包也均通过。第 1 次尝试在执行浏览器用例前达到依赖安装时限；重试使用相同源码和图片字节。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844; additional automated 320 CSS px reflow checks. / 另有 320 CSS px 自动重排检查。
- Execution / 执行: browsers and screenshot generation run in GitHub Actions; visual review reads those actual PNGs. / 浏览器与截图生成在 Actions 执行，视觉评审读取这些实际 PNG。
- Scope / 范围: isolated browser behavior and static visual layouts. Beta SDK Unity/VRChat, actual OSC publishing, physical touchscreens, real GPU capture and hardware interactions receive separate acceptance checks. Unity EditMode contracts are written and have not been executed in Unity Editor. Accessibility details remain in each run's report. / 本次覆盖隔离浏览器行为与静态布局；Beta SDK Unity／VRChat、实际 OSC 发布、实体触屏、真实 GPU 捕获与设备交互另行验收。Unity EditMode 契约已编写，尚未在 Unity Editor 执行；可访问性明细保留在各次报告。

See the [current verification record](../../../docs/e2e-status.en.md), [E2E maintenance flow](../../../docs/e2e.en.md) and [earlier visual review](../../../docs/ui-visual-review.en.md).

参见[当前验证记录](../../../docs/e2e-status.md)、[E2E 维护流程](../../../docs/e2e.md)和[历史视觉评审](../../../docs/ui-visual-review.md)。
