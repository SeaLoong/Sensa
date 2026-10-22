# Screenshot baseline review / 截图基线评审

The set contains **122 PNGs**: 61 desktop and 61 narrow-layout images. The current update accepts **44 intentional changes** for “SPS 四点定位 / SPS four-anchor tracking”. The remaining **78 PNGs** retain their existing bytes and [previous review history](https://github.com/SeaLoong/Sensa/blob/dcdb7faa8a8a381cf248368cd9d4a07a1ffdedb9/tests/e2e/__screenshots__/README.md).

当前共 **122 张 PNG**，桌面与窄屏各 61 张。本轮选择 **44 张有意的文案变化**；另外 **78 张**保留原字节及上述历史评审。

## Capture and individual inspection / 采集与逐张审阅

[Candidate run 39821880631, attempt 2](https://github.com/SeaLoong/Sensa/actions/runs/39821880631/attempts/2) generated images from source `dcdb7faa8a8a381cf248368cd9d4a07a1ffdedb9`, passing **80/80 cases** in candidate mode. Image commit `a5e3173ec7a49dfe4eac6a0c44db28f818914638` proposed 47 changed PNGs in [PR #17](https://github.com/SeaLoong/Sensa/pull/17).

Coding assistants individually opened **all 47 new candidate PNGs** on **2026-10-23 (Beijing time)**, checking [V1–V6](../../../docs/ui-quality.en.md). Three Contact images contained only live-speed or edge-antialias variation; `6787b0f20cdc44e5bbc08b7054cccb7c810ca563` restores their original baselines. The 44 selected images keep the candidate bytes:

- **40 parameter diagrams**: Plug Touch, SPS four-anchor tracking, Shader, SPS1 and SPS2 × Chinese/English × XZ/orbit × desktop/narrow layout. New names, Socket/Plug root explanations, parameter ordering, units, controls and footer wrapping remain readable.
- **4 help dialogs**: Chinese and English in both viewports. Root tracking now names SPS four-anchor tracking and describes the Socket/Plug root measurement; the main actions and emergency stop remain clear.

上述第 2 次候选采集 **80/80 通过**，原图片提交向 PR #17 提议 47 张变化图片。代码助手于 **2026-10-23（北京时间）**逐张打开全部 **47 张新候选图**。其中 3 张 Contact 图仅有实时速度读数或坐标轴边缘抗锯齿波动，筛选提交恢复其原基线；实际选择 **40 张参数图与 4 张帮助图**，桌面与窄屏各 22 张。新名称、Socket／Plug 根点说明、参数排序、单位、控件与页尾换行均可读，未发现新增阻断或主要视觉问题。

## Full normal comparison / 完整普通比较

[Run 39825612644, attempt 2](https://github.com/SeaLoong/Sensa/actions/runs/39825612644/attempts/2) passed **80/80 cases** on the filtered PR tree, with image updates disabled, `selectionComplete=true` and `snapshotsCompared=true`; every other outcome is zero. Its pinned source is `12dab3f00fbb05f6e97b34b3f3d1a5864ab48d55`, whose Git tree matches filtered image head `6787b0f20cdc44e5bbc08b7054cccb7c810ca563` exactly. The baselines are accepted after individual inspection and this full normal comparison.

上述第 2 次运行针对筛选后的 PR，关闭图片更新，完整普通比较 **80/80 通过**，其余结果均为 0。固定提交的 Git 树与筛选后的图片提交完全一致，`selectionComplete=true`、`snapshotsCompared=true`。本轮基线经逐张审阅及此次完整比较后接受。

Candidate attempt 2 has `selectionComplete=true`, `snapshotsCompared=false`; every outcome other than passed is zero. Attempt 1 and the initial main comparison reached the five-minute dependency-install limit before browser cases ran. The retry preserves the same source and browser/font environment.

第 2 次候选采集为完整选择，候选模式不作普通图片比较，其余结果均为 0。第 1 次候选与最初的 main 比较在依赖安装阶段达到 5 分钟上限，浏览器未执行；重试使用相同源码与浏览器／字体环境。

## Existing layout details / 既有排版细节

Old-image comparisons confirm these details predate this naming change: SPS XZ P1/P3 labels sit close together; compact anchor coordinates use one decimal; Shader `ID 42` can wrap on narrow layouts. The parameter tables and three-dimensional views retain the full values and labels; exact anchor geometry remains in the protocol and positioning guide.

旧图对照确认以下细节为此前已有：SPS 平面图 P1／P3 标签较近、紧凑锚点坐标仅显示一位小数、窄屏 Shader 的 `ID 42` 可能分行。参数表与三维视图保留完整读数和标记，精确锚点几何见协议与定位指南。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844, with additional automated 320 CSS px reflow checks.
- Execution / 执行: browser tests and image generation run in GitHub Actions; image inspection reads those actual PNGs. / 浏览器与截图生成在 Actions 执行，审阅读取上述实际 PNG。
- Scope / 范围: isolated browser behavior and static visual review. Unity Editor, VRChat, real GPU capture and hardware interactions receive separate acceptance; Unity EditMode contracts are written and remain unexecuted. / 本次覆盖隔离浏览器与静态图，Unity Editor、VRChat、真实 GPU 捕获与设备联动分别验收；Unity EditMode 契约已编写，尚未执行。

[Current verification / 当前验证](../../../docs/e2e-status.en.md) · [中文记录](../../../docs/e2e-status.md) · [E2E maintenance / E2E 维护](../../../docs/e2e.en.md)
