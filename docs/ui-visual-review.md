# WebUI 扁平化视觉评审

**简体中文** | [English](ui-visual-review.en.md)

日期：2026-10-19。本轮按用户的扁平化与对齐要求重新评审，取代前一版视觉记录。代码助手依据 [V1–V6](ui-quality.md) 检查已有 CI 图片与源码；没有真实参与者问卷、审美总分或用户偏好结论。

## 证据

- 修改前：`98f749d0325f80a4c3061130eac5fcf66b3eb74a`，56 张基线。
- 修改后生成源码：`2e810bea36847d43a5378a0dc405078cfd2c3701`；[成功候选 39158984066](https://github.com/SeaLoong/Sensa/actions/runs/39158984066) 的 `e2e-baselines`／`e2e-report`。
- 接受 60 张 PNG：桌面 1280×900、窄屏 390×844 各 30 张。先逐张对照首轮 58 张与旧图，再复评最终 16 张变化／新增图；其余 44 张逐字节相同。
- 图片固定保存于 `a69116a8777e569710d5e37a47d8e6ce4900e9a7`。另实际审阅最终报告的 26 张未遮罩诊断视口及节点位置、样式与滚动信息；这是 axe 分析后采样，并非原子快照。

## 发现、修改与复评

| 准则 | 具体修改 | 已见画面结论 |
| --- | --- | --- |
| V1 层级 | 主导航并入顶栏；输出由多层卡片改为名称／目标／操作行，普通启用采用次要按钮；空脚本先显示导入入口 | 控制、OSC、空载／已载入脚本的任务主次明确；保留许可与急停，已见范围符合 |
| V2 字体与数字 | 滑条只保留一个可编辑数值，标签和数值同排，滑条下方通宽；单位 ms／× 紧邻数值 | 三主轴同宽、数值和滑条基线一致；直接填写 500 后发送目标仍为 500，已见范围符合 |
| V3 分组与留白 | 白色平面与浅分隔线替代外层圆角卡片／阴影；预设管理独占下一行，脚本低频选项收紧 | 预设展开不挤首行，输出详情跨整行；倍率／循环与高级选项形成独立组，已见范围符合 |
| V4 色彩 | 蓝色用于主要动作／选择，中性用于普通配置，红色用于急停／危险；保留必要边界和键盘焦点 | 正常、禁用、冲突与停止状态可辨；没有新增装饰强色，已见范围符合 |
| V5 对齐 | 顶栏与正文共享宽度／边距；表单常用控件共享高度，范围标签在上且端点等宽，输出对应列稳定 | 主轴、输出行、映射、端点和校准几何契约通过；已见弹窗正文与页脚共边，符合 |
| V6 双语窄屏 | 英文顶栏有明确分组，长 OSC 页签完整换行；帮助缩短；脚本和接收／转发按有界功能区捕获 | 两语言脚本 Loop、Hub 与保存均完整，无此前尾部缺损／顶栏混入。英文帮助第二步仍有 `script.` 单词末行，但可读、无裁切；不宣称全部换行已完美 |

这些是指定画面的判断。未见阻断或主要生产界面视觉问题；不外推到未展示状态，也不以自动检查代替美感判断。

## 前后对照

| 状态 | 修改前 | 本轮 |
| --- | --- | --- |
| 桌面控制 | [旧图](https://github.com/SeaLoong/Sensa/blob/98f749d0325f80a4c3061130eac5fcf66b3eb74a/tests/e2e/__screenshots__/desktop/control-page.png) | [扁平工作台](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/desktop/control-page.png) |
| 窄屏手动 | [旧图](https://github.com/SeaLoong/Sensa/blob/98f749d0325f80a4c3061130eac5fcf66b3eb74a/tests/e2e/__screenshots__/mobile/english-manual.png) | [单一编辑数值](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/mobile/english-manual.png) |
| 轴配置 | [旧图](https://github.com/SeaLoong/Sensa/blob/98f749d0325f80a4c3061130eac5fcf66b3eb74a/tests/e2e/__screenshots__/desktop/profile-settings.png) | [端点等宽](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/desktop/profile-settings.png) |
| 脚本 | [旧图](https://github.com/SeaLoong/Sensa/blob/98f749d0325f80a4c3061130eac5fcf66b3eb74a/tests/e2e/__screenshots__/mobile/script-paused-keyframe.png) | [主控](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/mobile/script-paused-keyframe.png) · [倍率／循环／选项](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/mobile/script-options.png) |
| OSC 设置 | [旧图](https://github.com/SeaLoong/Sensa/blob/98f749d0325f80a4c3061130eac5fcf66b3eb74a/tests/e2e/__screenshots__/mobile/osc-hub.png) | [接收](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/mobile/osc-receiver-settings.png) · [转发与保存](https://github.com/SeaLoong/Sensa/blob/a69116a8777e569710d5e37a47d8e6ce4900e9a7/tests/e2e/__screenshots__/mobile/osc-hub.png) |

首轮功能虽已通过，图片仍暴露脚本尾部缺损和 Hub 混入顶栏；原始诊断图确认控件实际存在。调整为有界分区、收紧 Hub 地址／端口布局，并通过真实滚动定位后，本轮图片证据完整。没有用隐藏样式或内容修补取景。

## 自动底线与剩余范围

候选 40 次执行全部通过，无跳过、重试通过或运行错误。四组 axe 扫描共 32 状态，相关规则子集 violation 为零；四组行为各完成 16 检查。另沿用既有中英校准场景验证端点布局，手动场景验证数字输入后的真实 mock 传输。

最终 incomplete 保留 69 次节点出现（跨状态重复）：40 次符号名称、16 次星号对比度、3 次通知背景重叠、8 次时间戳裁切、2 次窄屏 OSCQuery 复选框被常驻顶栏部分遮挡。已见符号功能名称合理，星号与深底白字通知清楚；时间列右滚后显示、两个遮挡样本的完整命中区域仍待评估。它们不能被改写为完整 WCAG 通过。

尚未完成真实读屏／语音输入、全部焦点位置与悬停、实际 400% 缩放、实体手机、其他浏览器，以及全部十二轴／设备配置变体的逐屏评审。Unity／VRChat 和硬件行为不由截图证明。

普通 main CI 仍须在当前提交关闭基线更新并完整比较，才可用于自动预发布。[验证流程](e2e.md)
