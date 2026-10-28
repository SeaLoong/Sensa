# Screenshot review / 截图审阅

The current set contains **164 application baselines and eight site-review originals**. [Candidate 40756483229, attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/40756483229/attempts/1) captured source `aea5ef3f0b60a0b3cde957de4e1a3b45b80bdc4f`: **144/144 passed**, every other outcome zero, `suite=all`, `mode=candidate`, `selectionComplete=true`, `snapshotsCompared=false`.

当前包含 **164张应用基线和8张站点原图**。上述固定源码的候选完整 **144/144通过**，其余结果均为0；候选采集不等于普通截图比较。

## Image and source checks / 图片与来源核对

[PR#34](https://github.com/SeaLoong/Sensa/pull/34) contains raw capture commit `30a8dd6d2e7d756b97197bf13dc1f8f7d4e4838d`, whose sole parent is the source above. The export patch SHA-256 is `49e69e04d1327b0f57785618c6355d1be15b6104142661c40a5940b04284cc10`. Both official artifact digests, the proposal manifest, all 172 PNGs and the remote Git tree matched.

Root individually opened **13 changed originals**. Another **10 images** (both settings views and all eight site originals) exactly matched images individually opened earlier in this task. The remaining **149** exactly matched the prior per-image review. [baseline-review.json](../baseline-review.json) records each current hash, observation and whether its visual evidence was opened or reused. No image was accepted merely because capture succeeded.

逐张打开了 **13张变更原图**；两视口设置页及8张站点原图，共 **10张**，与本轮刚审阅的原图摘要完全相同，复用对应观察。其余 **149张**与既有逐图审阅的摘要完全一致。逐图记录保留当前摘要、观察和复用依据。

The intentional settings change adds the protocol-input card below the existing axis/log panels. Both viewports retain readable spacing. Other recaptured values/timestamps, profile dialogs, Contact panels and geometry views were checked individually. The 38 selected documentation captures now use this candidate's source/run/attempt: four image bytes changed and 34 were identical.

设置页有意在轴配置和日志下增加协议输入卡片；两个视口的排布可读。其余重新采集的数值／时间、轴配置窗口、Contact面板与图解逐张检查通过。文档选用的38张图片同步到本次来源：4张字节变化，34张相同。

## Ordinary comparison remains required / 仍须普通比较

Before merging, CI must execute **all 144** cases for its exact pinned source with screenshot updates disabled, `mode=comparison`, `selectionComplete=true`, `snapshotsCompared=true`, successful command and zero other outcomes. Candidate success and this visual record do not replace that evidence. Read the corresponding CI job summary and [current verification record](../../../docs/e2e-status.en.md).

合并前须对CI固定源码执行完整 **144项普通比较**：关闭截图更新，完整选择与实际图片比较均为true，命令成功，其余结果为0。候选通过和审图记录均不能替代此证据；实际结果见对应CI摘要及[验证记录](../../../docs/e2e-status.md)。

## Scope and history / 范围与历史

Captures use the pinned Playwright 1.64.1 image, `zh-CN`/`en-US`, `Asia/Shanghai`, desktop 1280×900 and narrow 390×844, plus 320 CSS px reflow checks. Transports are isolated simulations. Visual/browser checks do not establish Unity GPU, VRChat/HMD, vendor-cloud or physical-device acceptance.

图片来自固定浏览器与隔离模拟传输；审图和浏览器比较不代表Unity GPU、VRChat/HMD、厂商云或实体设备验收。

[Previous per-image review / 上轮逐图记录](https://github.com/SeaLoong/Sensa/blob/aea5ef3f0b60a0b3cde957de4e1a3b45b80bdc4f/tests/e2e/baseline-review.json)
