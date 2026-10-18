# TDesign WebUI 视觉与交互评审

**简体中文** | [English](ui-visual-review.en.md)

日期：2026-10-19。本轮依据用户选定的 TDesign 方向，替换此前的扁平工作台记录。代码助手按 [V1–V6](ui-quality.md) 检查源码与真实 CI 画面；没有参与者问卷、综合审美分或用户偏好结论。

## 证据

- 修改前：`fb6e169539b054ddba2de8bb22741945f3561526`，60 张基线。
- 生成源码：`3a21e8f7b65e057ac9a4adb89dc6c6da16e799b0`；[成功候选 39165087201](https://github.com/SeaLoong/Sensa/actions/runs/39165087201) 的 `e2e-baselines`／`e2e-report`。
- 接受 60 张 PNG：桌面 1280×900、窄屏 390×844 各 30 张。此前诊断运行的 60 张已逐张审阅；本成功候选全部逐字节相同，并复看最终关键画面。此前失败运行没有被接受。
- 图片固定保存于 `611822ef91a619e1b1185b9856155ea9d7681964`。另实际审阅本候选 22 张未遮罩原始诊断视口及 18 份节点信息，包含四组正文焦点画面；这些是分析后采样，并非原子快照。

## 发现与复评

| 准则 | 本轮改动 | 已见结果 |
| --- | --- | --- |
| V1 层级 | 输入方式改分段选择，应用按钮与其同组；按钮统一实心／线框／文字形式；载入脚本后更换为次要、播放为主要动作 | 控制、脚本、配置的主次可辨，急停独立可达；已见范围符合 |
| V2 字体与比例 | 常用控件从 38 收至 32 px，文字统一 14／22，辅助文字 12／20，常规／强调使用 400／600；数字框从 80 px 起并按内容扩宽 | 三主轴数字与滑条同列，单位、脚本时间与输出目标完整；已见范围符合 |
| V3 分组与留白 | 浅灰页面与单层白色工作面、24 px 主间隔；内部输出、映射、Hub 保持扁平行，低频内容展开 | 分段输入、主操作与高级设置有清楚分组，没有多层卡片／重阴影；已见范围符合 |
| V4 色彩与状态 | TDesign 品牌蓝、中性灰和功能色阶；必要边界与小字／实心按钮按对比度采用较深值，状态保留文字 | 正常、选中、禁用、冲突与急停可区分；不是仅以官方 token 推断美观或可读 |
| V5 对齐与细节 | 顶栏和正文共享宽度、滚动条预留；原生表单、滑条、复选框／开关、标签、表格和弹窗统一状态；SVG 关闭图标 | 主轴、输出对应列、映射、端点、校准和弹窗边缘检查通过；已见范围符合 |
| V6 双语与窄屏 | 英文操作自然换行，短端口列与长地址分配不同宽度；保留独立正文滚动、触控命中尺寸及强制配色回退 | 已见中英控制、脚本、接收／转发、帮助与弹窗完整；真实触屏及系统高对比仍未评估 |

这些结论仅适用于指定画面，未见新的阻断或主要视觉问题。长弹窗、参数表横向滚动与未展开内容不由首屏图片完整证明。

## 前后对照

| 状态 | 修改前 | TDesign 版本 |
| --- | --- | --- |
| 桌面控制 | [旧图](https://github.com/SeaLoong/Sensa/blob/fb6e169539b054ddba2de8bb22741945f3561526/tests/e2e/__screenshots__/desktop/control-page.png) | [本轮](https://github.com/SeaLoong/Sensa/blob/611822ef91a619e1b1185b9856155ea9d7681964/tests/e2e/__screenshots__/desktop/control-page.png) |
| 窄屏手动 | [旧图](https://github.com/SeaLoong/Sensa/blob/fb6e169539b054ddba2de8bb22741945f3561526/tests/e2e/__screenshots__/mobile/english-manual.png) | [本轮](https://github.com/SeaLoong/Sensa/blob/611822ef91a619e1b1185b9856155ea9d7681964/tests/e2e/__screenshots__/mobile/english-manual.png) |
| 英文顶栏 | [旧图](https://github.com/SeaLoong/Sensa/blob/fb6e169539b054ddba2de8bb22741945f3561526/tests/e2e/__screenshots__/mobile/english-toolbar.png) | [本轮](https://github.com/SeaLoong/Sensa/blob/611822ef91a619e1b1185b9856155ea9d7681964/tests/e2e/__screenshots__/mobile/english-toolbar.png) |
| 输出弹窗 | [旧图](https://github.com/SeaLoong/Sensa/blob/fb6e169539b054ddba2de8bb22741945f3561526/tests/e2e/__screenshots__/mobile/udp-settings.png) | [本轮](https://github.com/SeaLoong/Sensa/blob/611822ef91a619e1b1185b9856155ea9d7681964/tests/e2e/__screenshots__/mobile/udp-settings.png) |
| 脚本选项 | [旧图](https://github.com/SeaLoong/Sensa/blob/fb6e169539b054ddba2de8bb22741945f3561526/tests/e2e/__screenshots__/mobile/english-script-options.png) | [本轮](https://github.com/SeaLoong/Sensa/blob/611822ef91a619e1b1185b9856155ea9d7681964/tests/e2e/__screenshots__/mobile/english-script-options.png) |

## 交互正确性

正文独立于顶栏滚动，绝对定位的辅助说明归属正文包含块，避免扩张文档滚动边界。快速 End 键滚动后切换工作区曾让旧动画继续推动新页面；现在按工作区重建正文滚动容器，切断旧动画，保留上层草稿和运行状态。四组导航检查均保持新页滚动为零，输入方式和输入许可不受浏览影响。

候选 40 次执行全部通过，零跳过、重试通过或运行错误。四组 axe 扫描共 32 状态，相关规则子集 violation 为零；四组行为各完成 16 检查，另四项扫描期间不启用输入的检查通过。20 项 320 CSS px 重排检查均通过：文档高度 800，正文位于顶栏下方且无横向溢出。普通复选框的关联文字点击、Space、原生语义及浏览器强制配色检查均通过。

## 自动检查与未评估范围

incomplete 保留 **51 次节点出现**（跨状态重复）：28 次通知／置顶符号名称，12 次星号对比度，4 次弹窗标题／急停背景计算，4 次来源与 2 次时间戳裁切，1 次通知背景重叠。已见符号功能名称合理，弹窗、急停和通知清楚，四组正文焦点环四边完整；表格右滚后的裁切内容仍未评估。这不是完整 WCAG 通过结论。

未完成真实读屏／语音输入、全部悬停与焦点位置、实际 400% 缩放、实体手机／粗指针、系统高对比、其他浏览器，以及所有十二轴／设备配置变体的逐屏评审。Unity／VRChat 和硬件行为不由截图证明。

普通 main CI 仍需关闭基线更新，完整比较当前提交，成功后才可用于自动预发布。[验证流程](e2e.md)
