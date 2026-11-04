# Screenshot review / 截图审阅

The selected set contains **164 application baselines and eight site originals**. [Per-image evidence](../baseline-review.json) records each selected SHA256, candidate SHA256, capture, observation, selection reason and review chain.

当前包含 **164 张应用基线和 8 张站点原图**。[逐图记录](../baseline-review.json)保存所选与候选 SHA256、采集来源、具体观察、选择理由及审阅链。

## SPS3 Beta capture and selection / SPS3 测试版采集与选择

[Candidate 41927196979, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/41927196979/attempts/1) captured source [`c6a1ed14`](https://github.com/SeaLoong/Sensa/commit/c6a1ed14aef7e7024cf2f9c4672e8ae2333bfb8b): **254/254 passed**, each in one attempt with retry zero and every other outcome zero. The full `all` selection completed in `candidate` mode with `snapshotsCompared=false`.

本轮固定源码完整执行 **254/254 项**，逐项单次通过，retry 与其他结果均为零；完整选择，模式为 `candidate`，尚未进行普通基线比较。

All **40 changed originals were individually opened**. Root selected **25 application images and six site originals**, retaining seven application candidates with visually unchanged content and tiny raster differences, plus the desktop Chinese and narrow English guide candidates with incomplete footer captures. Retention does not establish complete-footer evidence; the narrow English prior original has the same limited footer scope. Each path records its actual observation and selection reason.

**40 张变化原图全部逐张打开审阅**。选择 **25 张应用图和 6 张站点原图**；7 张内容布局未变、仅有微小栅格差异的应用图保留旧基线。桌面中文和窄屏英文指南的本轮原图未完整采集页脚，也保留旧图；窄屏英文旧图同样只具有已显示页脚的有限范围，保留不代表完整页脚验收。逐图记录保留具体观察与选择理由。

The canonical 172-image receipt contains **31 current original-opened reviews, 132 exact-hash reuses and nine retained-source records**. All **38 documentation mirrors** and their catalog are byte-unchanged, preserving their real source `4b1d9816` / run `41905870856` / attempt `1` instead of claiming new captures. The six selected site originals show the gallery present during their own capture.

172 张图片的记录包含 **31 张本轮原图观察、132 张精确摘要复用和 9 张保留已有来源**。**38 张文档镜像及目录字节均未变**，保留真实的 `4b1d9816`／`41905870856`／attempt `1` 采集身份。6 张新选站点原图展示其采集当时的图库。

## Prior layout capture and selection / 上轮布局采集与选择

[Candidate 41905870856, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/41905870856/attempts/1) captured source [`4b1d9816`](https://github.com/SeaLoong/Sensa/commit/4b1d98167809214772a17ab02393a35311451c1f): **242/242 passed**, each in one attempt with retry zero and every other outcome zero. The full `all` selection completed in `candidate` mode with `snapshotsCompared=false`.

上述候选对固定源码完整执行 **242/242 项**，每项单次执行、retry 为零，其他结果均为零；模式为 `candidate`，`selectionComplete=true`、`snapshotsCompared=false`。

| Selection / 选择 | Count / 数量 |
| --- | ---: |
| Revised application originals accepted / 接受的新版应用原图 | 116 |
| Current site originals accepted / 接受的本轮站点原图 | 7 |
| Existing bytes retained / 保留已有图片 | 10 |
| Unchanged PNGs with exact prior hashes / 与已有摘要完全相同的未变图片 | 39 |
| Documentation mirrors synchronized / 同步的文档镜像 | 38 |

The 116 workbench images cover axis navigation, grouped parameters, modal scrolling and fixed actions, output settings, script playback, computed signals and narrow bilingual layouts. All accepted changes were individually opened by root or a delegated reviewer. Nine geometry candidates have unchanged content and dimensions with only small raster differences; their existing baselines were retained. The desktop Chinese guide candidate cuts its footer at the PNG boundary, so its earlier original was also retained. Per-file reasons identify all ten decisions.

116 张工作台图覆盖轴导航、参数分组、弹窗内部滚动与固定操作区、输出设置、脚本、计算信号和双语窄屏。所有接受的变化均由 root 或代理逐张打开。9 张几何候选仅有微小栅格差异，内容和尺寸相同；另 1 张桌面中文指南候选的页脚被 PNG 边界截断。10 项保留决定均有逐图依据。

Of the new selected images, 104 exactly match originals opened from source [`956b0264`](https://github.com/SeaLoong/Sensa/commit/956b0264a44f7e913c268498a28c797e9fb965b3). Their `exact_sha256_reuse` evidence preserves the actual [cancelled observation run 41899721755](https://github.com/SeaLoong/Sensa/actions/runs/41899721755/attempts/1), original reviewer and receipt hash. The successful current capture and execution are recorded separately. Another 19 current originals were opened directly. Together with unchanged and retained images, the per-file methods are **19 original-opened, 143 exact-hash reuses and 10 retained-source records**.

新选图片中，104 张与 956 源码下已打开的原图完整摘要相同；其 `exact_sha256_reuse` 证据保留真实的已取消观察运行、原审阅者和记录摘要，本轮成功采集及执行另记。另有 19 张本轮原图直接打开。加上未变及保留图片，逐图方法统计为 **19 张直接观察、143 张精确摘要复用、10 张保留已有来源**。

All 38 documentation mirrors match their selected application baselines byte for byte and have capture evidence for source 4b1, run 41905870856, attempt 1. Site originals retain their individual provenance and show the gallery present at their capture time; later Pages builds verify the updated gallery.

38 张文档镜像均逐字节对应所选应用基线，并具备 4b1／41905870856／attempt 1 的采集证据。站点原图保留各自来源，展示采集时的图库；后续 Pages 构建检查更新后的图库。

## Complete comparison / 完整比较

After image selection, [ordinary CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml) checks **all 254** cases for its exact pinned commit with updates disabled: `mode=comparison`, `selectionComplete=true`, `snapshotsCompared=true`, command success and zero other outcomes. Candidate capture and ordinary comparison have separate evidence; the selected-image commit's report identifies its execution result. [Verification records](../../../docs/e2e-status.en.md)

选图后的[普通 CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)对固定提交执行完整 **254 项**，关闭图片更新，要求 `mode=comparison`、完整选择、实际比较、命令成功及其他结果为零。候选采集和普通比较分别记录，图片提交的执行结果以对应报告为准。[验证记录](../../../docs/e2e-status.md)

Captures use pinned Playwright, desktop 1280×900, narrow 390×844 and separate 320 CSS px reflow checks. Device connections use isolated simulations. Physical hardware and Unity-client acceptance have their own records. [Review procedure](../../../docs/e2e.md) · [Prior receipt](https://github.com/SeaLoong/Sensa/blob/4b1d98167809214772a17ab02393a35311451c1f/tests/e2e/baseline-review.json)

采集使用固定 Playwright，覆盖桌面 1280×900、窄屏 390×844 及独立的 320 CSS px 重排检查。设备连接采用隔离模拟；实体硬件和 Unity 客户端另行验收。[审阅流程](../../../docs/e2e.md) · [上轮记录](https://github.com/SeaLoong/Sensa/blob/4b1d98167809214772a17ab02393a35311451c1f/tests/e2e/baseline-review.json)
