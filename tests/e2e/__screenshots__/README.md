# Reviewed CI screenshots / 已审阅 CI 截图

Current baselines contain **70 PNGs**, 35 each for desktop and narrow layouts. Source: [successful candidate 39180559599](https://github.com/SeaLoong/Sensa/actions/runs/39180559599), commit `c4ab8d26725c2e6c81de5ab65f6a0913af92d02f`. All 50 executions passed with zero skips, flaky retries or run errors before acceptance.

当前基线包含 **70 张 PNG**，桌面与窄屏各 35 张。来源为上述成功候选及提交；接受前全部 50 次执行通过，无跳过、重试通过或运行错误。

All 70 initial diagnostic images were individually reviewed against V1–V6. Each later set was compared byte for byte, and changed images plus eight complete fixed/Shader root status/calibration viewports were reassessed. The first failing candidate was not accepted: narrow status overflow and calibration overlap were fixed, followed by intact unit labels, a dash for Shader's unmeasured fit residual, and fixed-shape monospaced timestamps to prevent column drift.

按 V1–V6 逐张审阅首轮 70 张诊断图；后续各轮逐字节比较，变化图及固定根／Shader 根的八张完整状态／校准视口另行复评。首轮失败候选未接受：先修正窄屏状态溢出及校准重叠，再修正单位断词，将 Shader 未测量的拟合残差显示为破折号，并用定长等宽时间消除列漂移。

Captures cover TDesign proportions, hierarchy, alignment, manual/script control, OSC gates/mappings, recording, Help and bilingual layouts. Root workflows are protocol simulations; attachments explicitly identify them as fixtures, not Unity/GPU capture. Bounded root images omit some selection/status/calibration content; raw viewports and actual text-containment assertions supply those samples.

图片覆盖 TDesign 比例、层级、对齐、手动／脚本控制、OSC 门控／映射、录制、帮助与双语布局。根点流程是协议模拟，附件明确区分夹具与真实 Unity／GPU 捕获。局部根点图不含完整选择／状态／校准内容，另以原始视口和实际文字容纳断言核对。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844.
- Browser execution and screenshot generation are GitHub Actions only. / 浏览器执行与截图生成仅在 GitHub Actions。
- Only unstable timestamps and CI PTY text are hidden; targets, gates and errors remain visible. / 仅遮蔽不稳定时间戳与 CI 伪终端文本，目标、门控和错误保持可见。
- Workspace content scrolls below the persistent header. Images cannot prove offscreen columns, closed disclosures or every dialog field. / 正文在常驻顶栏下独立滚动；图片不证明视口外列、折叠项或全部弹窗字段。
- Raw views show dismissible notifications briefly covering some secondary bottom content. All 56 incomplete axe node occurrences remain recorded. / 原始视口存在可关闭通知短暂覆盖底部次要内容；保留全部 56 次 axe incomplete 节点出现。
- No questionnaire aesthetics score, complete WCAG conclusion, physical-phone, VRChat/HMD or hardware certification is implied. / 不提供问卷审美分、完整 WCAG 结论、实体手机、VRChat／HMD 或硬件认证。

See the [visual review](https://github.com/SeaLoong/Sensa/blob/main/docs/ui-visual-review.en.md) and [workflow](../../../docs/e2e.en.md). Ordinary CI compares these PNGs with updates disabled. Prereleases require a passing full comparison for the exact candidate SHA; generation alone supplies no release comparison proof.

详见[视觉评审](https://github.com/SeaLoong/Sensa/blob/main/docs/ui-visual-review.md)与[流程](../../../docs/e2e.md)。普通 CI 关闭更新比较本组图片；预发布要求同一候选 SHA 通过完整比较，生成任务本身不能提供发布比较证明。
