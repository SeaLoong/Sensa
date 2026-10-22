# Screenshot baseline review / 截图基线评审

The set contains **134 PNGs**: 67 desktop and 67 narrow-layout images. The current computed-signal update selects **14 new/changed images**, seven per viewport. The remaining **120 PNGs** retain their existing bytes. Earlier SPS naming, Contact and parameter-diagram reviews remain in the [previous record at `bf22484`](https://github.com/SeaLoong/Sensa/blob/bf224841e904abe3af51044b117b75f19a8e76ff/tests/e2e/__screenshots__/README.md).

当前共 **134 张 PNG**，桌面与窄屏各 67 张。本轮计算信号改进选择 **14 张新增／变化图片**，各视口 7 张；另外 **120 张**保留原字节。此前 SPS 命名、Contact 与参数图解的审阅见上述固定历史。

## Capture and individual inspection / 采集与逐张审阅

[Candidate run 39838949791, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39838949791/attempts/1) generated images from source `9dc7de27645fb484fa52711656bf31b05ff3f84a`, passing **88/88 cases**, every other outcome zero. It used complete selection, `selectionComplete=true` and candidate mode with `snapshotsCompared=false`. Original image head `ea15168fd5c238e9fc894d09cac4454ef5d37f66` proposed 19 new/changed PNGs in [PR #18](https://github.com/SeaLoong/Sensa/pull/18).

Coding assistants individually opened **all 19 new/changed candidate PNGs** on **2026-10-23 (Beijing time)**, checking [V1–V6](../../../docs/ui-quality.en.md). Comparisons with previous images also covered the five unrelated changes restored below. The selected 14 images retain their candidate bytes:

- **12 new computation images**: editor, input choices and settings × Chinese/English × desktop/narrow layout. Names, operations, inputs, weights, validity settings, saved-result state and map/save actions remain readable.
- **2 updated mappings pages**: desktop and narrow layout. The computation area and explicit input-type controls preserve the mapping workflow and responsive field layout.

上述候选采集固定同一源码，**88/88 通过**，其余结果均为 0；完整选择，`selectionComplete=true`、`snapshotsCompared=false`。原图片提交向 PR #18 提议 19 张新增／变化图。代码助手于 **2026-10-23（北京时间）**逐张打开全部 **19 张候选**并按 V1–V6 审阅，同时对照了下述五张无关变化的旧图。实际选择 **12 张新增计算编辑器／输入／设置图与 2 张映射页图**，各视口 7 张，保留候选字节。

## Unrelated variations retained from the previous set / 恢复原图的无关变化

| Image | Observed difference | Selection |
| --- | --- | --- |
| `desktop/english-help.png` | 36 edge pixels; text, layout and controls unchanged | Restore previous bytes |
| `mobile/contact-root-position.png` | Live relative Z velocity and speed changed from 0.250 to 0.200 m/s, 198 pixels; position and layout unchanged | Restore previous bytes |
| `mobile/parameter-geometry-contact-sdk-zh-CN.png` | Four edge/text pixels; content unchanged | Restore previous bytes |
| `mobile/parameter-geometry-socket-modern-en-US.png` | Two edge/text pixels; content unchanged | Restore previous bytes |
| `mobile/parameter-geometry-socket-modern-orbit-zh-CN.png` | One edge/text pixel; content unchanged | Restore previous bytes |

以上五张已恢复原基线：桌面英文帮助仅 36 个边缘像素变化；窄屏 Contact 图仅实时速度 0.25→0.20 m/s，共 198 像素；其余三张参数图分别只有 4、2、1 个像素变化，文字、图形与布局保持一致。筛选提交为 `7644507`，同时包含已通过单元检查的语言标签刷新 `5c32f38` 与通配符零段兼容 `b176897`。

## Visual observations / 视觉观察

V1–V6 review found no new blocking or major issue. Main tasks, draft/saved-result status and actions have a clear order; input/weight groups and settings remain distinct; numeric units, field alignment and focusable controls stay readable in both languages and viewports. Long content scrolls within the normal page flow. English counts currently show `1 mappings` (existing) and `1 calculations` (new), a wording detail retained for follow-up.

V1–V6 检查未发现新增阻断或主要问题。主任务、草稿／已保存结果与操作的层级清楚；输入、权重与设置分组明确；数值单位、字段对齐和控件在中英及两种视口均可读。长页面正文正常滚动。英文计数仍为 `1 mappings`（既有）与 `1 calculations`（新增），记录为后续文案细节。

## Full normal comparison / 完整普通比较

Full normal comparison of filtered head `7644507` remains pending. The selected images have completed individual inspection; **final baseline acceptance is pending** until the filtered application passes complete normal comparison with image updates disabled, `selectionComplete=true` and `snapshotsCompared=true`.

筛选提交 `7644507` 的完整普通比较尚待完成。已选择的图片均经过逐张审阅；待筛选后应用关闭图片更新、完成 `selectionComplete=true`、`snapshotsCompared=true` 的完整普通比较后，再最终接受本轮基线。

The earlier [normal run 39838933199](https://github.com/SeaLoong/Sensa/actions/runs/39838933199) on `9dc7de2` reported **8 passed, 3 failed and 77 unrun** out of 88, every other outcome zero, with `snapshotsCompared=true`. Failures were two new baseline files missing and the existing mappings-page image changing; it did not complete the suite. The initial [candidate run 39837678118](https://github.com/SeaLoong/Sensa/actions/runs/39837678118/attempts/1) on `9e700cf` reported **2 passed, 3 failed and 83 unrun**, every other outcome zero; field locators were corrected from textbox-role lookup to labels while preserving behavior assertions.

此前 `9dc7de2` 的普通运行总计 88 项，**8 通过、3 失败、77 未执行**，其余结果均为 0，`snapshotsCompared=true`；失败为两张新增基线缺失与原映射页变化，套件未完整执行。首轮 `9e700cf` 候选为 **2 通过、3 失败、83 未执行**，其余结果均为 0；已将字段定位从 textbox 角色改为标签，保留原有行为断言。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844, with additional automated 320 CSS px reflow checks.
- Execution / 执行: browser tests and image generation run in GitHub Actions; image inspection reads those actual PNGs. / 浏览器与截图生成在 Actions 执行，审阅读取上述实际 PNG。
- Scope / 范围: isolated browser behavior and static visual review. Unity Editor, VRChat, real GPU capture and hardware interactions receive separate acceptance. / 本次覆盖隔离浏览器与静态图，Unity Editor、VRChat、真实 GPU 捕获与设备联动分别验收。

[Current verification / 当前验证](../../../docs/e2e-status.en.md) · [中文记录](../../../docs/e2e-status.md) · [E2E maintenance / E2E 维护](../../../docs/e2e.en.md)
