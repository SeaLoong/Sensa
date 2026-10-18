# Reviewed CI screenshots / 已审阅 CI 截图

Current baselines contain **60 PNGs**, 30 each for desktop and narrow layouts. Source: [successful candidate 39165087201](https://github.com/SeaLoong/Sensa/actions/runs/39165087201), commit `3a21e8f7b65e057ac9a4adb89dc6c6da16e799b0`. All 40 executions passed with zero skips, flaky retries or run errors before acceptance.

当前基线包含 **60 张 PNG**，桌面与窄屏各 30 张。来源为上述成功候选及提交；接受前全部 40 次执行通过，无跳过、重试通过或运行错误。

Every image was reviewed against V1–V6 for TDesign component proportions, typography, button hierarchy, shared edges, flat rows, dialogs, script states and bilingual narrow layouts. The successful candidate's 60 PNGs are byte-identical to the 60 images individually reviewed in diagnostic run 39164298454. That earlier failed run was not accepted; its navigation failure was fixed and the complete suite passed before accepting this set.

按 V1–V6 逐张检查 TDesign 组件比例、字号、按钮层级、共享边缘、扁平行、弹窗、脚本及双语窄屏。成功候选的 60 张图与诊断运行 39164298454 已逐张审阅的画面逐字节相同；此前失败任务没有被接受，导航错误修复且完整套件通过后才接受本组图片。

Script transport/options and OSC receiving/forwarding use bounded captures. The workspace scrolls below the persistent header. Captures must fit its real client bounds; no styles or functional content are hidden to repair framing.

脚本主控／选项、OSC 接收／转发分段捕获。正文在常驻顶栏下方独立滚动，截图必须完整容纳于真实滚动区域，不隐藏样式或功能内容修补取景。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844.
- Browser execution and screenshot generation are GitHub Actions only. / 浏览器执行与截图生成仅在 GitHub Actions。
- Only unstable timestamps and CI PTY text are hidden; targets, gates and errors remain visible. / 仅遮蔽不稳定时间戳与 CI 伪终端文本，目标、门控和错误保持可见。
- Viewport images do not show every table column, dialog field or closed disclosure. / 视口图不证明全部表格列、弹窗字段或折叠内容。
- Reports retain incomplete axe findings. Images provide no questionnaire aesthetics score or complete accessibility, physical-phone, Unity or hardware certification. / 报告保留 axe incomplete；图片不提供问卷审美分、完整无障碍、真手机、Unity 或硬件认证。

See the [visual review](https://github.com/SeaLoong/Sensa/blob/main/docs/ui-visual-review.en.md) and [workflow](../../../docs/e2e.en.md). Ordinary CI compares these PNGs with updates disabled. Prereleases require a passing full comparison for the exact candidate SHA; a generation run supplies no release comparison proof.

详见[视觉评审](https://github.com/SeaLoong/Sensa/blob/main/docs/ui-visual-review.md)与[流程](../../../docs/e2e.md)。普通 CI 关闭更新比较本组图片；预发布要求同一候选 SHA 通过完整比较，生成任务不能提供发布比较证明。
