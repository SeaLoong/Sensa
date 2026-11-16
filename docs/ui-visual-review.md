# 工作台视觉评审

**简体中文** | [English](ui-visual-review.en.md)

本轮检查输入、映射与变换、轴配置、输出四个独立页面及双语窄屏布局。旧版参数图解的完整评审移至[固定历史记录](https://github.com/SeaLoong/Sensa/blob/8eff42a03462566a61e37c97737fede0e973c59b/docs/ui-visual-review.md)。

## 已核对的截图

[完整候选运行 43929566450](https://github.com/SeaLoong/Sensa/actions/runs/43929566450) 对源码 `27f569770c2eb13b6555a158f4f6e8d8302cf846` 执行 310 项测试，全部首次通过，无失败、跳过或未执行项。该运行采集候选，并未执行普通基线比较。

- 164 张应用基线中，78 张变化图与此前逐图审阅记录的 SHA-256 完全一致，按原观察记录选入；80 张不变图保留。
- 六张参数图解仅有 6～18 个像素的栅格差异，保留原基线，不据此改动接受阈值。
- 文档中的 40 个截图引用对应 38 个唯一文件，均核对本次采集附件、源码与 SHA-256，并同步镜像。
- 本次续接额外打开桌面输入、桌面轴映射和中文窄屏计算编辑器原图复查。输入页不再混入输出卡片；映射页保留统一保存区；窄屏计算字段按列排列，视口下方内容需要滚动。

逐图观察、选取来源与摘要见 [baseline-review.json](https://github.com/SeaLoong/Sensa/blob/8a029cb8bc2624b25ed28274022c2fbb63a0a814/tests/e2e/baseline-review.json)，文档采集证明见 [catalog-capture-review.json](https://github.com/SeaLoong/Sensa/blob/8a029cb8bc2624b25ed28274022c2fbb63a0a814/tests/e2e/catalog-capture-review.json)。旧站点原图仍是历史证据，不作为本次页面验收。

## 引导后续修复

源码 `0419e4f1f855acd920adbb9ad747bf827c85d832` 修正了场景定位和反向焦点：OSC 映射步骤指向轴映射预设，手动／脚本／协议指向常用变换；从引导容器按 Shift+Tab 可到最后一个控件。双语快速开始及浏览器断言同步更新。

[后续完整候选](https://github.com/SeaLoong/Sensa/actions/runs/43934966519) 用于检查这些改变后的高亮图和键盘行为。完成前不将旧引导截图视为新行为的证明。最终是否通过，以当前 PR 提交的普通完整比较为准，见[验证记录](e2e-status.md)。

## 范围

截图只证明所示状态与视口，不证明折叠内容、全部表单、读屏、高对比或真实 400% 缩放。候选生成、静态检查与模拟传输均不能替代真实设备、Unity／VRChat、HMD 或机械停止验收。
