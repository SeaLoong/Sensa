# Reviewed CI screenshots / 已审阅 CI 截图

The current baseline contains **56 PNGs**: 28 desktop and 28 narrow-screen captures. Source: [successful review-only run 39149689652](https://github.com/SeaLoong/Sensa/actions/runs/39149689652), commit `27567f9f159a8e0fd78d161e73a1141dbb963e43`. All 40 executions passed with no skips, flaky retries or run errors before acceptance.

当前基线包含 **56 张 PNG**：桌面和窄屏各 28 张。来源为上述成功候选任务及提交；全部 40 次执行通过，没有跳过、重试通过或运行错误后才接受图片。

The V1–V6 review checked hierarchy, type/numerals, grouping, semantic color, alignment and bilingual narrow layouts. Thirty-seven files match the earlier reviewed candidate byte-for-byte; all 19 changed/new images were reassessed. Script controls and options use separate captures after long captures omitted their tails. No failed job's partial capture set was accepted. See the [visual review](../../../docs/ui-visual-review.en.md).

已按 V1–V6 检查层级、字体数字、分组、色彩语义、对齐和双语窄屏。37 张与前一已审候选逐字节相同，其余 19 张变化／新增图已复评。长脚本截图曾漏尾部，因此主控与选项分段捕获；未接受失败任务的部分图集。详见[视觉评审](../../../docs/ui-visual-review.md)。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844.
- Browser execution and screenshot generation are GitHub Actions only. / 浏览器执行和截图生成仅在 GitHub Actions。
- Only timestamps and CI PTY text are hidden. Targets, gates and errors remain visible. / 仅隐藏时间戳与 CI 伪终端文本；目标、门控和错误保持可见。
- Viewport images show their current view. Tables may scroll internally, dialogs show their visible scroll region, and collapsed details do not prove their interiors. / 视口图只展示当前画面；表格可内部横滚，对话框展示可见滚动区域，折叠图不证明内部内容。
- Automated reports preserve incomplete rules separately from violations. Images are not a beauty score, complete accessibility certificate, physical-device test or hardware feedback. / 自动报告分别保留待判断规则与违规；图片不是审美分、完整无障碍认证、真机测试或硬件反馈。

Ordinary CI must compare committed PNGs with snapshot updates disabled. A prerelease requires a passing full comparison for its exact SHA; a review-only generation run cannot supply it. See [the workflow guide](../../../docs/e2e.en.md).

普通 CI 必须关闭基线更新并比较已提交 PNG。预发布须通过同一 SHA 的正常全量比较，候选生成不能提供该证明。详见[流程指南](../../../docs/e2e.md)。
