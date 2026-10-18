# Reviewed CI screenshots / 已审阅 CI 截图

The current baseline contains **52 PNGs**: 26 desktop and 26 narrow-screen captures. Source: [successful review-only run 39142189036](https://github.com/SeaLoong/Sensa/actions/runs/39142189036), commit `d6f1f6f611b6904861d3f0c3371f34a997ada069`. All 32 functional executions passed, with no skips, flaky retries or run errors, before acceptance.

当前基线包含 **52 张 PNG**：桌面和窄屏各 26 张。来源为上述成功候选任务及提交；全部 32 次功能执行通过，没有跳过、重试通过或运行错误后才接受图片。

The three-page workbench, native controls, both languages, output targets/stops, calibration and dialogs were visually reviewed. The saved-mapping indicator, narrow range labels and Hub framing were corrected before this set was accepted. Forty-four files matched the preceding reviewed candidate byte-for-byte; all eight changed images were reviewed again.

已检查三页工作台、原生控件、双语、输出目标与停止状态、校准和对话框。接受前修复了映射保存标志、窄屏范围标签和 Hub 取景。44 张与上一轮已审候选逐字节相同，其余 8 张再次逐张审阅。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844.
- Captures and browser execution run only in GitHub Actions. No local screenshots or E2E were generated. / 截图与浏览器执行仅在 GitHub Actions，没有本地生成截图或运行 E2E。
- Timestamp and CI PTY text alone are hidden; target values, gates and errors remain visible. / 仅隐藏时间戳与 CI 伪终端文本，目标值、门控与错误保持可见。
- Viewport shots show the current screen; table columns may require internal horizontal scrolling and dialogs show their current scroll region. These images do not certify physical phones, other browser engines, Unity, VRChat or hardware. / 视口图展示当前屏幕，表格列可能需要内部横滚，对话框只展示当前滚动区域；图片不证明真手机、其他浏览器引擎、Unity、VRChat 或硬件行为。

Ordinary CI must compare committed PNGs with snapshot updates disabled. A prerelease requires a passing full comparison for its exact SHA; a review-only baseline run cannot supply that evidence. Failed runs' partial captures are not baselines. See [the workflow guide](../../../docs/e2e.md).

普通 CI 必须关闭基线更新并比较已提交 PNG。预发布须通过同一 SHA 的正常全量比较，候选生成任务不能提供该证明；失败任务的部分图片不能作为基线。详见上述指南。
