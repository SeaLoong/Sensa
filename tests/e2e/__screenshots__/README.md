# Reviewed CI screenshots / 已审阅 CI 截图

Current baselines contain **98 PNGs**, 49 each for desktop and narrow layouts. Source: [successful candidate 39451877629](https://github.com/SeaLoong/Sensa/actions/runs/39451877629), commit `44e63a6f561aa6eaf0d0f0555cbecfad6965e55c`. All **58 executions** passed on retry 0 with zero skips, flaky retries or run errors before acceptance.

当前基线包含 **98 张 PNG**，桌面与窄屏各 49 张，来源为上述成功候选及提交。接受前 **58 次执行**均首次通过，无跳过、重试通过或运行错误。

The existing 70 application images remain byte-identical. The 28 new parameter diagrams were individually reviewed against V1–V6: five representative XZ scenarios × two languages × two viewports (20), plus SPS/Shader orbit views × two languages × two viewports (8). Four English isometric diagnostic views were also reviewed; they are report attachments, not goldens. Earlier failed or superseded candidates were not accepted.

原有 70 张应用图逐字节不变。按 V1–V6 逐张审阅新增 28 张参数图：五个代表 XZ 场景 × 双语 × 两视口，共 20 张；SPS／Shader 可旋转视图 × 双语 × 两视口，共 8 张。另审阅四张英文立体 SVG 诊断图，保存在报告附件，不属于基线。此前失败或已被替代的候选未接受。

Review corrected SVG label sizing and axis collisions, aligned control rows, and fitted the 3D camera to real geometry and viewport proportions. The final Shader cube is complete at default/reset and narrow sizes. Pixel, object-matrix, camera, context-loss/fallback and disposal checks supplement images; user zoom may intentionally crop geometry.

复评修正 SVG 字号、坐标轴标签冲突、控件行对齐，并按真实几何和视口比例设置 3D 相机。最终 Shader 立方体在默认／复位和窄屏下完整入镜。像素、对象矩阵、相机、上下文丢失／回退与释放检查补充静态图片；用户主动放大仍可按预期裁切。

- Environment / 环境: `mcr.microsoft.com/playwright:v1.64.1-noble`, `zh-CN` / `en-US`, `Asia/Shanghai`, 1280×900 / 390×844; additional automated 320 CSS px reflow. / 另有 320 CSS px 自动重排检查。
- Browser execution and screenshot generation run only in GitHub Actions. Real WebGL2 uses an isolated software-rendering worker pool for the orbit cases. / 浏览器执行与截图生成仅在 GitHub Actions；旋转视图在独立软件渲染 worker 池中使用真实 WebGL2。
- Application captures retain targets, gates and errors; only unstable timestamps and CI PTY text are hidden. / 应用图保留目标、门控与错误，仅遮蔽不稳定时间戳及 CI 伪终端文本。
- The application workspace scrolls below its persistent header; the standalone guide scrolls as a normal document. Images do not prove offscreen or closed content. / 应用正文在常驻顶栏下独立滚动；独立图解按普通文档滚动，图片不证明视口外或折叠内容。
- The 40 application axe states detected zero violations in the selected rule subset; all 56 incomplete node occurrences remain recorded (32 label, 24 contrast). These scans do not cover the standalone guide. / 应用 40 个 axe 状态在规则子集中未检测到违规；保留 56 次 incomplete 节点出现（标签 32、对比度 24），扫描范围不包含独立图解。
- Root workflows and parameter diagrams are simulations. No questionnaire score, complete WCAG conclusion, physical-phone, VRChat/HMD, real GPU capture or hardware certification is implied. / 根点流程及参数图解为模拟，不提供问卷分数、完整 WCAG 结论、实体手机、VRChat／HMD、真实 GPU 捕获或硬件认证。

See the [visual review](../../../docs/ui-visual-review.en.md) and [workflow](../../../docs/e2e.en.md). Ordinary CI compares these PNGs with updates disabled. Prereleases require a passing full comparison at the exact candidate SHA; generation alone supplies no comparison proof.

详见[视觉评审](../../../docs/ui-visual-review.md)与[流程](../../../docs/e2e.md)。普通 CI 关闭更新比较本组图片；预发布要求同一候选 SHA 通过完整比较，生成任务本身不提供比较证明。
