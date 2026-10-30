# Screenshot review / 截图审阅

The current set contains **164 application baselines and eight site-review originals**. [Candidate 40996282389, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/40996282389/attempts/1) captured source `197af206bafda79b12160929251101aeca30214d`: **218/218 passed**, every other outcome zero, `suite=all`, `mode=candidate`, `selectionComplete=true`, `snapshotsCompared=false`. Independent Firefox/WebKit compatibility executed **8/8** cases for the same source.

当前包含 **164 张应用基线和 8 张站点原图**。上述固定源码完整候选 **218/218 通过**，其余结果均为 0；同源码的独立 Firefox／WebKit 兼容检查 **8/8 通过**。候选采集与审图分别记录，普通比较仍使用已选基线。

## Image and source checks / 图片与来源核对

Image-only commit [`73780b4058e64e7275328ec3dc6d3393b9ab3c45`](https://github.com/SeaLoong/Sensa/commit/73780b4058e64e7275328ec3dc6d3393b9ab3c45) has the candidate source as its sole parent. Its 31 changed PNGs comprise **20 application baselines, eight site originals and three documentation mirrors**. The binary patch SHA-256 is `ecaf9dc59a8d628ab9a7cfe46f6b25f2ed4cf7635e3b12b5adc1e3e058a811a0`; [baseline-review.json](../baseline-review.json) records its exact three-directory command, official artifact receipts and every selected image hash.

图片提交的唯一父提交为候选源码，只改变 **31 张 PNG**：20 张应用基线、8 张站点原图及 3 张文档图。38 张文档图片均逐字节对应已选应用基线，其中其余 35 张字节未变；文档图库清单使用本次采集的源码、运行与 attempt。

Root individually opened all **22 changed application originals**: **20 were accepted**, while two OSC Hub images were rejected because the forwarded target lost its resolved endpoint and healthy last-send status. Those two retain the previously reviewed source images and their original hash/evidence chain. A delegated reviewer individually opened all **eight new site originals**; root approved that review. The other **142 application images** exactly match their prior per-image visual evidence. The tracked review classifications are **28 original-opened, 142 exact-hash reuses and two retained-source images**; no unviewed change was accepted.

Root 逐张打开 **22 张变更应用原图**，接受其中 **20 张**。两张 OSC Hub 候选丢失已转发目标的实际地址与正常发送状态，因此拒绝该变化，保留旧图及其摘要和逐图审阅链。代理逐张打开 **8 张新站点原图**，经 root 确认采用。其余 **142 张应用图**与既有逐图证据摘要完全相同。当前逐图分类为 **28 张已打开原图、142 张精确摘要复用、2 张保留旧图**。

Supplemental receipts cover **eight diagram originals** and **12 WebSensa/compatibility originals**, each individually opened and matched to the current official reports. The latter twelve visible captures are English. These supplemental images are separate from the 172 tracked review PNGs.

另有 **8 张图表原图**及 **12 张 WebSensa／兼容性原图**逐张打开，并核对本次官方报告字节；后者的可见界面均为英语。这些附加图片不计入上述 172 张跟踪图片。

The eight site originals capture source197 with its then-existing gallery. They document that capture, rather than a later documentation commit or final online Pages deployment. The 38 selected documentation PNGs separately retain their own application-capture provenance.

8 张站点原图呈现候选 197 当时的图库，来源不改写为后续文档提交或最终线上 Pages；38 张文档 PNG 单独保留应用截图的真实来源。

## Ordinary comparison / 普通比较

For each exact pinned source, ordinary CI must execute **all 218** current cases with screenshot updates disabled, `mode=comparison`, `selectionComplete=true`, `snapshotsCompared=true`, a successful command and zero other outcomes. Candidate success and visual review do not replace that gate. The matching [CI run](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml) summary and artifacts identify actual comparison and native-build results; [verification records](../../../docs/e2e-status.en.md) distinguish capture provenance from accepted historical snapshots.

每个固定源码的普通 CI 必须执行当前完整 **218 项**：关闭截图更新，模式为 comparison，完整选择与实际图片比较均为 true，命令成功，其余结果为 0。候选与审图不替代该门槛。对应 [CI 运行](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)摘要及附件记录实际比较和原生构建；[验证记录](../../../docs/e2e-status.md)区分图片来源与已验收历史快照。

## Scope and history / 范围与历史

Captures use Playwright 1.64.1, `zh-CN`/`en-US`, `Asia/Shanghai`, desktop 1280×900 and narrow 390×844, with separate 320 CSS px reflow checks. Device connections use isolated simulations. Physical-device, vendor-cloud and Unity-client outcomes are recorded separately.

图片使用固定 Playwright、双语与上海时区，覆盖桌面和窄屏，并有独立 320 CSS px 重排检查。连接使用隔离模拟传输；实体设备、厂商云和 Unity 客户端结果单独记录。

[Previous per-image review / 上轮逐图记录](https://github.com/SeaLoong/Sensa/blob/197af206bafda79b12160929251101aeca30214d/tests/e2e/baseline-review.json)
