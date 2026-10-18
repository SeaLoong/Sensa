# Reviewed CI screenshots / 已审阅 CI 截图

Current baselines contain **64 PNGs**, 32 each for desktop and narrow layouts. Source: [successful candidate 39171343844](https://github.com/SeaLoong/Sensa/actions/runs/39171343844), commit `b1e1cf9e649a96b43f65be55ae7db4043cb7719d`. All 44 executions passed with zero skips, flaky retries or run errors before acceptance.

当前基线包含 **64 张 PNG**，桌面与窄屏各 32 张。来源为上述成功候选及提交；接受前全部 44 次执行通过，无跳过、重试通过或运行错误。

Every image was reviewed against V1–V6 for TDesign proportions, hierarchy, alignment, workflow status, mapping saves, help, recording and bilingual layouts. Of the 60 diagnostic images individually reviewed in failed run 39170374413, 59 are byte-identical to this successful set. The changed desktop mapping image and four new recording images were separately reviewed. The failed run was not accepted; its native-field test locator and connected Intiface routing were fixed before the complete suite passed.

按 V1–V6 逐张检查 TDesign 比例、层级、对齐、流程状态、映射保存、帮助、录制及双语布局。失败诊断运行 39170374413 的 60 张图已逐张审阅，其中 59 张与本成功候选逐字节相同；变化的桌面映射图及四张新增录制图另行审阅。此前失败任务没有被接受，原生字段测试定位器和已连接 Intiface 路由修复后才通过完整套件。

Manual controls, script transport/options, recording and OSC receiving/forwarding use bounded captures. The workspace scrolls below the persistent header. Captures must fit its real client bounds; no functional content is hidden to repair framing. The tight English manual capture does not prove complete focus-ring painting; raw viewport evidence supplies that sample.

手动、脚本主控／选项、录制及 OSC 接收／转发采用分段捕获。正文在常驻顶栏下方独立滚动，截图必须容纳于真实滚动区域，不隐藏功能内容修补取景。英文手动局部图边界较紧，不证明完整焦点环绘制；该项另看原始视口采样。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844.
- Browser execution and screenshot generation are GitHub Actions only. / 浏览器执行与截图生成仅在 GitHub Actions。
- Only unstable timestamps and CI PTY text are hidden; targets, gates and errors remain visible. / 仅遮蔽不稳定时间戳与 CI 伪终端文本，目标、门控和错误保持可见。
- Viewport images do not show every table column, dialog field or closed disclosure. / 视口图不证明全部表格列、弹窗字段或折叠内容。
- Reports retain incomplete axe findings. Images provide no questionnaire aesthetics score or complete accessibility, physical-phone, Unity or hardware certification. / 报告保留 axe incomplete；图片不提供问卷审美分、完整无障碍、真手机、Unity 或硬件认证。

See the [visual review](https://github.com/SeaLoong/Sensa/blob/main/docs/ui-visual-review.en.md) and [workflow](../../../docs/e2e.en.md). Ordinary CI compares these PNGs with updates disabled. Prereleases require a passing full comparison for the exact candidate SHA; a generation run supplies no release comparison proof.

详见[视觉评审](https://github.com/SeaLoong/Sensa/blob/main/docs/ui-visual-review.md)与[流程](../../../docs/e2e.md)。普通 CI 关闭更新比较本组图片；预发布要求同一候选 SHA 通过完整比较，生成任务不能提供发布比较证明。
