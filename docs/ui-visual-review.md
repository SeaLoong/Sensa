# WebUI 视觉评审记录

**简体中文** | [English](ui-visual-review.en.md)

日期：2026-10-19。依据[视觉审美准则 V1–V6](ui-quality.md)，由代码助手检查已有 CI 图片并结合源码复核。这是对指定画面的设计评审，不是参与者问卷或用户偏好结论，没有 VisAWI 分数。

## 证据与范围

- 修改前：`11894004aceb16ae2e48bdca25203a5d84f25d41` 中保存的 52 张基线。
- 修改后：`27567f9f159a8e0fd78d161e73a1141dbb963e43`；[候选 CI 39149689652](https://github.com/SeaLoong/Sensa/actions/runs/39149689652) 的 `e2e-baselines` 与 `e2e-report`。
- 接受 56 张 PNG：桌面 1280×900、窄屏 390×844 各 28 张；中英文、控制／OSC／设置、目标与停止、脚本、校准、帮助及配置弹窗。
- 先对照查看原候选的 52 张及同名旧图，再复评最终候选的 19 张变化／新增图；其余 37 张逐字节一致。脚本主控与选项分别截图，避免长区域尾部未绘制。
- 自动报告另保留 320 CSS px 的重排证据，以及待判断节点的未遮罩视口图、位置、样式和滚动信息；该采样发生在 axe 分析之后，并非原子快照。

## 发现、修改与复评

| 准则 | 原问题与修改 | 已见证据与结论 |
| --- | --- | --- |
| V1 层级与注意力 | 手动发送位于低频参数之后；改为三主轴后直接发送，斜率／速度独立折叠。参数表把值移到路径之后、来源之前 | `control-page`、`manual-ready`、`english-manual`、`osc-parameters`：任务顺序明确，窄屏可先看到参数和值；已见画面符合 |
| V2 字体与数字 | 标题、辅助文字、主值接近同权；强化标题、L0 和输出目标字级，采用稳定数字与贴近的单位，时长显式 ms，舍入负零显示为 0.0 | 手动／输出、暂停脚本、两点校准与 Pose：数字和单位可区分且未裁字；已见画面符合 |
| V3 分组与留白 | 两个低频展开项分散；合为紧凑分组。字段、区块与页脚维持一致邻近关系 | 控制、展开映射、Hub、设置及弹窗：组内紧、组间疏；已见画面符合 |
| V4 配色与语义 | 过浅文字、焦点和必要控件边界难辨；提高这些对比度，装饰边界仍轻。禁用操作采用中性色，蓝色用于操作／选择，红色用于急停／危险 | 正常／禁用／冲突／停止、英文脚本空状态：颜色角色一致；空轨迹说明不再随整块透明度变淡；已见画面符合 |
| V5 对齐与精工 | 英文校准按钮长度拉散端点读数；改为稳定标签／数值／操作列，小屏允许按钮另行 | `pb-calibration`、`english-calibration`：起点与终点数值列对齐，长英文按钮自然换行；字段、滑条和弹窗页脚一致；已见画面符合 |
| V6 双语与窄屏 | 长脚本截图尾部缺少实际仍存在的选项，属于证据缺损；改为主控／选项分段捕获 | `english-script`／`english-script-options`、`script-paused-keyframe`／`script-options` 完整无灰块。中英文可见弹窗未见横溢；折叠内部及未展示的表格右列仍未全部评估 |

这些结论只对应列出的状态。没有阻断或主要视觉问题遗留在已审画面；不能将它外推为所有状态、浏览器或用户均认可。

## 前后画面对照

| 状态 | 修改前 | 修改后 |
| --- | --- | --- |
| 窄屏英文手动 | [旧图](https://github.com/SeaLoong/Sensa/blob/11894004aceb16ae2e48bdca25203a5d84f25d41/tests/e2e/__screenshots__/mobile/english-manual.png) | [当前图](https://github.com/SeaLoong/Sensa/blob/e3dc3af95150dc1c43fcb320cf3b3489dfaba1a0/tests/e2e/__screenshots__/mobile/english-manual.png) |
| 窄屏参数表 | [旧图](https://github.com/SeaLoong/Sensa/blob/11894004aceb16ae2e48bdca25203a5d84f25d41/tests/e2e/__screenshots__/mobile/osc-parameters.png) | [当前图](https://github.com/SeaLoong/Sensa/blob/e3dc3af95150dc1c43fcb320cf3b3489dfaba1a0/tests/e2e/__screenshots__/mobile/osc-parameters.png) |
| 英文校准 | [旧图](https://github.com/SeaLoong/Sensa/blob/11894004aceb16ae2e48bdca25203a5d84f25d41/tests/e2e/__screenshots__/mobile/english-calibration.png) | [当前图](https://github.com/SeaLoong/Sensa/blob/e3dc3af95150dc1c43fcb320cf3b3489dfaba1a0/tests/e2e/__screenshots__/mobile/english-calibration.png) |
| 英文脚本 | [旧图](https://github.com/SeaLoong/Sensa/blob/11894004aceb16ae2e48bdca25203a5d84f25d41/tests/e2e/__screenshots__/mobile/english-script.png) | [主控](https://github.com/SeaLoong/Sensa/blob/e3dc3af95150dc1c43fcb320cf3b3489dfaba1a0/tests/e2e/__screenshots__/mobile/english-script.png) · [选项](https://github.com/SeaLoong/Sensa/blob/e3dc3af95150dc1c43fcb320cf3b3489dfaba1a0/tests/e2e/__screenshots__/mobile/english-script-options.png) |

修改后图片链接固定到首次接受本轮基线的提交，后续评审另记；生成来源为上述候选提交与 CI 附件。

## 自动底线与人工判断

候选 40 次执行全部通过：无跳过、重试通过或运行错误。四组扫描覆盖 32 个状态，相关规则子集的 violation 为零；四组行为检查各完成 13 项，另有四项扫描不启用输入的检查。报告保留完整 incomplete，不能把它改写为“全部无障碍通过”。

首轮发现的对话框反向 Tab 环绕问题已修复；前后边界的焦点 JSON 证明焦点留在弹窗。急停／解除保留草稿，解除不恢复输入，Escape 取消且焦点回到入口。另一轮发现测试未显式应用 OSC，已补监听准备，没有放宽断言。失败任务的部分图片未接受为基线。

incomplete 中的 ×／☆ 按符号功能名称与实际画面审阅，不为迎合字符串比较而把符号塞进名称；这符合 [W3C 对符号标签的解释](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html#symbolic-text-characters)。`nonBmp` 或被遮挡而无法求背景不是实测零对比度。通知文字的已见深底白字可读；表格右侧时间列及部分英文来源 IP 在当前横向位置被裁切，右滚后的可见性仍未评估。最终附件共 73 次 incomplete 节点出现（跨状态重复）：40 次符号名称、16 次星号对比度待判断、5 次通知背景重叠、8 次时间戳裁切、4 次英文来源裁切；不将它们汇总为审美分或伪造全部通过。

普通 main CI 仍须关闭基线更新，比较当前提交的全部图片；候选生成不能提供预发布所需的比较 SHA。[基线来源与限制](https://github.com/SeaLoong/Sensa/blob/e3dc3af95150dc1c43fcb320cf3b3489dfaba1a0/tests/e2e/__screenshots__/README.md)

## 剩余限制

未开展真实用户 VisAWI 调查、读屏／语音输入、所有悬停与焦点位置、真实 400% 缩放、实体手机或其他浏览器引擎的完整评审。配置弹窗重点是 UDP 和首轴可见区域，不代表全部设备细项与十二轴均逐屏看过。Unity／VRChat 和硬件行为不由这些截图证明。

后续改动继续按 V1–V6 留下截图区域、问题、修改理由与复评结果；未评估项不自动继承通过。
