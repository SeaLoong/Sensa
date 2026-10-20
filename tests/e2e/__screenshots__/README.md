# Reviewed CI screenshots / 已审阅 CI 截图

Current baselines contain **110 PNGs**, 55 each for desktop and narrow layouts. Source: [successful candidate 39467342379](https://github.com/SeaLoong/Sensa/actions/runs/39467342379), commit `7096282a24cc2c68e363d70accd56cd3ac0fd6ee`. All **58 executions** passed on retry 0 with zero skips, flaky retries or run errors before acceptance.

当前基线包含 **110 张 PNG**，桌面与窄屏各 55 张，来源为上述成功候选及提交。接受前 **58 次执行**均首次通过，无跳过、重试通过或运行错误。

The existing 70 application images remain byte-identical. The 40 parameter diagrams were reviewed against V1–V6: modern Socket, legacy Socket, Plug Touch, Sensa SPS and Shader × two languages × XZ/orbit × two viewports. Four English isometric SVG diagnostics were also inspected; they are attachments rather than goldens. Compared with the previous 98-image set, 28 parameter images changed and 12 orbit views were added. The earlier diagnostic candidate was not accepted.

原有 70 张应用图逐字节不变。按 V1–V6 复评 40 张参数图：现代 Socket、旧 Socket、Plug Touch、Sensa SPS、Shader × 双语 × XZ／可旋转视图 × 两视口。另审阅四张英文立体 SVG 诊断图，它们是附件而非基线。相对前一组 98 图，28 张参数图更新，新增 12 张可旋转视图；此前诊断候选未接受。

The guide now shares four anchor colours across spheres, labels and rows, offers target dragging separately from camera orbit, and explains instance-prefix/leaf composition. Revolved Socket/Plug references retain real model scale. Review corrected labels obscuring these surfaces and low-contrast selected anchor backgrounds, then linked displaced root/tip tags back to their actual points. Final representative orbit images explicitly use XZ movement and reset target parameters; deliberate zoom may crop geometry.

图解以四个固定颜色关联锚点球、标签和参数行，区分目标拖动与相机旋转，并说明实例前缀和行名的拼接。Socket／Plug 旋转体示意保留模型比例。复评修正文字遮住实体，以及选中锚点底色对比不足，并用细引线将偏移的根点／端点标签连回真实位置。最终代表三维图明确选择 XZ 移动平面并复位目标参数；用户主动放大可按预期裁切。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844; additional automated 320 CSS px reflow. / 另有 320 CSS px 自动重排检查。
- Browsers and screenshots run only in GitHub Actions. Independent local-file guide cases share a software WebGL2 worker pool; application cases retain their original browser configuration. / 浏览器和截图仅在 GitHub Actions；独立文件图解用例共用软件 WebGL2 worker 池，应用用例保留原浏览器配置。
- Actual geometry/matrices, ray-plane dragging, locked axes, bounds/steps, cancellation, context loss and disposal supplement screenshots. Active anchor text contrast is checked separately from application axe scans. / 真实几何／矩阵、射线平面拖动、锁轴、范围／步长、取消、上下文丢失和释放检查补充静态图片；锚点文字对比度与应用 axe 扫描分别记录。
- The 40 application axe states detect zero violations in the selected subset; all 56 incomplete node occurrences remain recorded (32 label, 24 contrast). These scans do not cover the standalone guide. / 应用 40 个 axe 状态在规则子集中未检测到违规，保留 56 次 incomplete 节点出现（标签 32、对比度 24）；扫描不覆盖独立图解。
- The application scrolls below a persistent header; the guide scrolls as a normal document. Images do not prove offscreen columns or closed content. / 应用正文在常驻顶栏下独立滚动，图解按普通文档滚动；图片不证明视口外列或折叠内容。
- Diagrams and root flows are simulations, without a questionnaire score, complete WCAG conclusion, physical-phone, Unity/VRChat/HMD, real GPU capture or hardware certification. / 图解与根点流程为模拟，不提供问卷分数、完整 WCAG 结论、实体手机、Unity／VRChat／HMD、真实 GPU 捕获或硬件认证。

See the [visual review](../../../docs/ui-visual-review.en.md) and [workflow](../../../docs/e2e.en.md). Ordinary CI compares these PNGs with updates disabled. Publication requires a passing full comparison at the exact candidate SHA; generation alone provides no comparison proof.

详见[视觉评审](../../../docs/ui-visual-review.md)和[流程](../../../docs/e2e.md)。普通 CI 关闭更新比较本组图片；发布要求同一候选 SHA 通过完整比较，生成任务本身不提供比较证明。
