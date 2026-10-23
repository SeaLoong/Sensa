# Screenshot baseline review / 截图基线评审

The set contains **150 PNGs**, 75 desktop and 75 narrow-layout images. This update selects **32 images**: 12 new and 20 changed, 16 per viewport. **118 existing PNGs** retain their previous bytes, 59 per viewport. All selected images preserve raw candidate bytes. [Previous accepted review](https://github.com/SeaLoong/Sensa/blob/99c50b970e5a9b93595b134ebf4bd07d614c3276/tests/e2e/__screenshots__/README.md).

当前共 **150 张 PNG**，桌面／窄屏各 75 张。本轮选择 **32 张图片**：12 张新增、20 张变化，各视口 16 张；**118 张既有图片**保留原字节，各视口 59 张。所选图片均保留原始候选字节。此前接受记录见上述固定历史。

## Capture and review provenance / 采集与审阅来源

[Candidate run 39970420334, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/39970420334/attempts/1) pinned source `99c50b970e5a9b93595b134ebf4bd07d614c3276` and passed **104/104 cases**, every other outcome zero; `runner=passed`, command succeeded, `selectionComplete=true`, `snapshotsCompared=false`. It exported raw image head `93591a267cecd4220c98085fccb866697403c309` to [PR #21](https://github.com/SeaLoong/Sensa/pull/21).

候选固定上述源码，完整 **104/104 通过**，其余结果均为 0；浏览器及命令均成功，完整选择、候选模式。原始图片共 **38 张新增／变化**：12 张新增、26 张变化。

Coding assistants performed the image review on **2026-10-23 (Beijing time)**.

代码助手于 **2026-10-23（北京时间）**完成图片审阅。

Review covers all **38 changed candidates**: **26 are byte-identical** to images already opened in the earlier [PR #20 candidate](https://github.com/SeaLoong/Sensa/pull/20), raw head `85171eb4df14ab7ba286d6837eda98afff08949c`; **12 images with fresh bytes were individually opened** at original detail. The earlier review opened all 36 of that run's changed images. Hash comparison carries forward those observations; fresh inspection covers eight plan/format captures, three desktop workbench images and one narrow Contact image.

本次覆盖全部 **38 张变化候选**：**26 张与此前已逐张打开的图片字节相同**，复用既有观察；**12 张新字节图片按原图逐张打开复审**。旧轮已打开全部 36 张变化图片。本次新审包括八张方案／格式图、三张桌面工作台图和一张窄屏 Contact 图。

## Selected visible scope / 所选可见范围

| Images / 图片 | Count / 数量 | Visible review scope / 可见审阅范围 |
| --- | --- | --- |
| `pipeline-funscript-default-{zh-CN,en-US}` × desktop/narrow | 4 | Recording-format field only: label and selected funscript option. / 仅录制格式字段的标签与所选 funscript 选项。 |
| `pipeline-hysteresis-settings-{zh-CN,en-US}` × desktop/narrow | 4 | `.computed-signal__settings`: visible hysteresis settings, values and labels. / 仅设置区域内可见的迟滞字段、数值和标签。 |
| `pipeline-plan-preview-{zh-CN,en-US}` × desktop/narrow | 4 | Full import-preview dialog: revised copy, counts/types, activation explanation and actions. / 完整导入预览弹窗：修正文案、计数与类型、启用状态说明及操作。 |
| Existing workbench images / 既有工作台图片 | 20 | Ten per viewport: control page, English toolbar, Chinese/English computed editors, OSC mappings, gate stop, landmark loss, UDP settings, output conflict and Settings. / 每视口十张：控制页、英文顶栏、中英文计算编辑、OSC 映射、门控停止、定位点失效、UDP 设置、输出冲突和设置页。 |

The four funscript crops establish only the format field visually. Behavior assertions separately check independent tracks, millisecond/position actions, validity segments, downloads, signal replay and loading into the script player. Full recording settings, file lists and collapsed controls remain outside those crops' visual scope.

四张 funscript 截图的视觉结论限于格式字段。独立轨道、毫秒／位置动作、有效片段、下载、信号回放和载入脚本播放器由行为断言分别检查。完整录制设置、文件列表及折叠内容按各自实际画面评估。

## Unrelated variations restored / 恢复原图的无关变化

These six images retain accepted baseline bytes. Earlier byte-identical candidates reuse their individual inspection; both latest Contact images were opened again with their baselines.

下列六张恢复已接受的基线字节。与旧候选字节相同的图片复用逐张审阅，两张最新 Contact 图已重新打开并对照基线。

| Image / 图片 | Observed difference / 实际变化 |
| --- | --- |
| `desktop/english-help.png` | 36 rounded-edge pixels / 圆角边缘 36 像素 |
| `desktop/recording-restart.png` | 17 pixels at the upper-left corner / 左上角 17 像素 |
| `desktop/parameter-geometry-contact-sdk-orbit-en-US.png` | 6 pixels, maximum RGB-channel difference 1 / 6 像素，最大 RGB 通道差值 1 |
| `desktop/contact-root-position.png` | 220 pixels; live Z velocity/speed 0.200→0.210 m/s / 实时 Z 速度与速率 0.200→0.210 m/s，220 像素 |
| `mobile/contact-root-position.png` | 180 pixels; live speed 0.250→0.260 m/s / 实时速率 0.250→0.260 m/s，180 像素 |
| `mobile/parameter-geometry-plug-touch-en-US.png` | 5 antialias pixels, maximum RGB-channel difference 6 / 5 个抗锯齿像素，最大 RGB 通道差值 6 |

The earlier SPS, Shader and SPS1 diagram variations already match accepted baseline bytes in this candidate. The fresh Chinese computed-editor and output-conflict images retain latest candidate bytes: their differences from the previous candidate are respectively eight and four pixels, maximum channel difference 1, while preserving the intended navigation, copy and independent-binding controls.

旧轮的 SPS、Shader 与 SPS1 图解微差在本次候选中已与基线字节相同。新审的中文计算编辑与输出冲突图保留最新候选：相对旧候选分别仅有 8／4 个像素变化，最大通道差值为 1；有意更新的导航、文案和独立绑定控件完整保留。

## Visual observations / 视觉观察

No new blocking or major [V1–V6](../../../docs/ui-quality.en.md) issue was found in reviewed visible regions. Four-workspace navigation and source/computation controls have clear grouping; numbers, units and field alignment remain readable. The expanded output-conflict dialog retains its warning and disabled save action. Updated plan counts/types and actions are legible in Chinese/English at both viewports; format-field crops and hysteresis settings fit their captured regions. Off-crop content is outside these observations.

已审可见区域未发现新增阻断或主要 [V1–V6](../../../docs/ui-quality.md) 问题。四工作区导航与来源／计算控件分组清楚，数字、单位和字段对齐保持可读；扩展后的输出冲突弹窗保留警告及禁用保存状态。方案计数、类型和操作在中英文及两视口均清楚，格式字段与迟滞设置在所截区域内完整显示。裁剪范围外的内容按未评估记录。

## Full normal comparison / 完整普通比较

[Normal run 39974409441, attempt 2](https://github.com/SeaLoong/Sensa/actions/runs/39974409441/attempts/2) passed **104/104 cases**, every other outcome zero, with image updates disabled, `runner=passed`, command succeeded, `selectionComplete=true` and `snapshotsCompared=true`. Pinned source `767344ec3cb29914c85b79b9351aeab8665838ec` has exactly the same Git tree (`b1bbe40e37ad11aab35bb48ae18f838401ae9fd0`) as reviewed PR head `2432709a2d5b95789ed0bc2417e4eee75a26911e`. **The baselines are accepted after individual image inspection and this full normal comparison.**

上述第 2 次尝试 **104/104 通过**，其余结果均为 0；关闭图片更新，浏览器及命令均成功，`selectionComplete=true`、`snapshotsCompared=true`。固定源码的 Git 树与已审 PR 提交完全一致，**本轮基线经逐张审阅及完整普通比较后接受**。

Attempt 1 pinned the same source but dependency installation exited 100 on both bounded attempts. Browsers did not run: total/executed and all outcome counters were zero, `runner=not-run`, command skipped, `selectionComplete=false`, `snapshotsCompared=false`. Attempt 2 reran failed jobs on that unchanged source and completed the comparison above.

第 1 次尝试固定同一源码，两次有界依赖安装均以 100 退出；浏览器未执行，总计／执行数及全部结果计数均为 0，`runner=not-run`、命令跳过，两个比较标记均为 false。第 2 次尝试仅重跑失败任务，在相同源码上完成上述比较。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844, plus automated 320 CSS px reflow checks.
- Execution / 执行: browser cases and image generation run in Actions; review reads actual exported PNGs. / 浏览器和图片生成在 Actions 执行，审阅读取实际导出的 PNG。
- Scope / 范围: isolated browser behavior and visible image regions; Unity/VRChat, GPU capture and hardware receive separate verification. / 本轮为隔离浏览器行为与图片可见区域，Unity／VRChat、GPU 捕获和硬件另行验证。

[Current verification / 当前验证](../../../docs/e2e-status.en.md) · [中文记录](../../../docs/e2e-status.md) · [E2E maintenance / E2E 维护](../../../docs/e2e.en.md)
