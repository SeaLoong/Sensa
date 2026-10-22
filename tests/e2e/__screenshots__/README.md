# Screenshot baseline review / 截图基线评审

The set contains **138 PNGs**, 69 desktop and 69 narrow-layout images. This OSC-reference update selects **52 new/changed images**, 26 per viewport; **86 existing PNGs** retain their previous bytes. [Previous computed-signal review](https://github.com/SeaLoong/Sensa/blob/280c8387762e60b4ae12c97faee6de41c3e2eaf0/tests/e2e/__screenshots__/README.md).

当前共 **138 张 PNG**，桌面／窄屏各 69 张。本轮参数释义选择 **52 张新增／变化图片**，各视口 26 张；另外 **86 张既有图片**保留原字节。此前计算信号等审阅见上述固定历史。

## Capture and individual inspection / 采集与逐张审阅

[Candidate run 39853817326, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39853817326/attempts/1) pinned source `280c8387762e60b4ae12c97faee6de41c3e2eaf0` and passed **88/88 cases**, every other outcome zero, with complete selection, `selectionComplete=true` and `snapshotsCompared=false`. Raw image head `71e1de8eeb88f1c7c4f4132e5be63495c270a2a0` proposed 55 new/changed PNGs in [PR #19](https://github.com/SeaLoong/Sensa/pull/19).

Coding assistants individually opened **all 55 new/changed candidates** at original detail on **2026-10-23 (Beijing time)**, checking [V1–V6](../../../docs/ui-quality.en.md). All 52 selected images preserve the candidate bytes:

| Selected images | Count | Visible review scope |
| --- | --- | --- |
| Parameter explorer: SPS2, SPS1, Plug Touch, SPS four-anchor, Contact SDK and Shader × XZ/orbit × Chinese/English × desktop/narrow | 48 | Actual parameter names, diagrams, values and the new explanation/source section; expanded selected-field definitions, ranges, types, units and usage; long-text wrapping |
| Workbench Contact relative-speed details × Chinese/English × desktop/narrow | 4 | Parameter path, SDK definition, Float type, m/s, range and interaction usage; source links and scrolling body with fixed actions |

代码助手于 **2026-10-23（北京时间）**逐张以原图打开全部 **55 张候选**，按 V1–V6 检查。选择的 **48 张图解**覆盖六种场景、两种投影、两种语言与两种视口；**4 张工作台详情**展示相对速率定义、Float、m/s、范围、用途和来源。52 张均保留候选原字节。折叠卡片仅核对可见的名称与摘要，其内部定义由数据契约及展开操作断言检查。

## Unrelated variations restored / 恢复原图的无关变化

Each candidate and its previous image was opened for these three comparisons:

| Image | Observed difference | Selection |
| --- | --- | --- |
| `desktop/contact-root-position.png` | Live relative Z velocity and speed 0.200→0.210 m/s, 220 pixels; position and layout unchanged | Restore previous bytes |
| `desktop/english-help.png` | 36 pixels at the rounded lower edge; text and controls unchanged | Restore previous bytes |
| `mobile/contact-root-position.png` | Live relative Z velocity and speed 0.250→0.200 m/s, 198 pixels; position and layout unchanged | Restore previous bytes |

以上三张均实际打开新旧图对照后恢复旧字节；变化仅为实时速度读数或圆角边缘像素。

## Visual observations / 视觉观察

No new blocking or major V1–V6 issue was found. Chinese/English text, full parameter names, facts and source links wrap without horizontal overflow in narrow layouts. Selected cards explain the actual parameter and attribute definitions to the SDK, VRCFury or Sensa. The workbench retains a scrolling body and fixed header/actions; the English source list continues below the initial mobile view and is reachable by scrolling, as asserted in E2E. Only the changing receive-time element is masked in the four workbench images; the magenta mask is expected in candidate PNGs. Collapsed definitions are not counted as visually inspected.

未发现新增阻断或主要视觉问题。长参数、事实说明与来源在窄屏正常换行；SDK、VRCFury 和 Sensa 的定义归属清楚。工作台正文独立滚动，标题和操作固定；手机英文来源列表可滚动查看，E2E 检查链接滚动后处于可见区域。四张详情图仅遮罩动态接收时间，候选中的品红色块为预期遮罩。折叠内容不计作视觉已读。

## Full normal comparison / 完整普通比较

**Pending:** the reviewed selection still requires a complete normal comparison with image updates disabled before acceptance.

**待完成：**此处记录了实际审图范围；关闭图片更新的完整普通比较通过后再接受本轮基线。

The initial [main comparison 39853785392](https://github.com/SeaLoong/Sensa/actions/runs/39853785392), on source `280c838`, reported **35 passed, 3 failed and 50 unrun** out of 88; every other outcome zero, `selectionComplete=true`, `snapshotsCompared=true`. Failures were one missing new detail baseline and two intentionally taller explorer pages. This incomplete run is not acceptance.

首轮 main 普通比较总计 88 项：**35 通过、3 失败、50 未执行**，其余结果均为 0，完整选择、普通截图比较。失败来自一张新增详情基线缺失和两张图解全页新增释义后的高度变化。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844, plus automated 320 CSS px reflow checks.
- Execution / 执行: browser tests and image generation run in GitHub Actions; inspection reads those actual PNGs. / 浏览器与截图生成在 Actions 执行，审阅读取实际 PNG。
- Scope / 范围: isolated browser behavior and static visual review; Unity Editor, VRChat, GPU capture and hardware receive separate acceptance. / 本轮为隔离浏览器和静态图验证；Unity、VRChat、GPU 与硬件分别验收。

[Current verification / 当前验证](../../../docs/e2e-status.en.md) · [中文记录](../../../docs/e2e-status.md) · [E2E maintenance / E2E 维护](../../../docs/e2e.en.md)
