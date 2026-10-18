# Reviewed CI screenshots / 已审阅 CI 截图

Current baselines contain **60 PNGs**, 30 each for desktop and narrow layouts. Source: [successful candidate 39158984066](https://github.com/SeaLoong/Sensa/actions/runs/39158984066), commit `2e810bea36847d43a5378a0dc405078cfd2c3701`. All 40 executions passed with zero skips, flaky retries or run errors before acceptance.

当前基线包含 **60 张 PNG**，桌面与窄屏各 30 张。来源为上述成功候选及提交；接受前全部 40 次执行通过，无跳过、重试通过或运行错误。

The flat workbench was reviewed against V1–V6: header/content keylines, output rows, single editable values, endpoint columns, dialogs, script states and bilingual narrow layouts. All 58 first-candidate images were reviewed; 44 are byte-identical in the final candidate and all 16 changed/new images were reassessed.

按 V1–V6 检查扁平工作台的顶栏／正文边缘、输出行、单一编辑数值、端点列、弹窗、脚本及双语窄屏。首轮 58 张已逐张审阅；最终 44 张逐字节相同，其余 16 张变化／新增图均已复评。

Script transport and playback options are bounded separately, including loaded and empty states. OSC receiving and forwarding use separate captures; Hub host/port share a narrow-screen row. Real scrolling places bounded captures below the sticky header where they fit. No styles or functional content are hidden to repair framing.

脚本主控与播放选项分段，包含空载与已载入状态；OSC 接收与转发分别捕获，Hub 地址／端口在窄屏同排。有界区域通过真实滚动放在常驻顶栏下方，不隐藏样式或功能内容修补截图。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844.
- Browser execution and screenshot generation are GitHub Actions only. / 浏览器执行和截图生成仅在 GitHub Actions。
- Only unstable timestamps and CI PTY text are hidden; targets, gates and errors remain visible. / 仅遮蔽不稳定时间戳与 CI 伪终端文本，目标、门控和错误保持可见。
- Viewport pictures show the current view; table columns may scroll internally, dialog contents may extend below their visible region and closed details do not prove their interiors. / 视口图只展示当前画面；表格可内部横滚，弹窗内容可超出可见区域，折叠图不证明内部。
- Incomplete axe results remain in reports. These images provide neither an aesthetics score nor complete accessibility, physical-phone, Unity or hardware certification. / 报告保留 axe incomplete；图片不提供审美分、完整无障碍、真手机、Unity 或硬件认证。

See the [visual review](https://github.com/SeaLoong/Sensa/blob/main/docs/ui-visual-review.en.md) and [workflow guide](../../../docs/e2e.en.md). Ordinary CI compares these PNGs with updates disabled; prereleases require a passing full comparison for the exact candidate SHA. A generation run supplies no release comparison proof.

详见[视觉评审](https://github.com/SeaLoong/Sensa/blob/main/docs/ui-visual-review.md)与[流程指南](../../../docs/e2e.md)。普通 CI 关闭更新比较本组图片；预发布要求同一候选 SHA 通过完整比较，生成任务不能提供发布比较证明。
