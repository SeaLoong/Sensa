# 浏览器验证记录

**简体中文** | [English](e2e-status.en.md)

此页记录实际核对过的浏览器运行，不是实时仪表盘。当前 CI 要求单元测试与完整普通 E2E 通过后再构建和发布；文档站另有站点 E2E。最新状态以当前提交的 [Actions](https://github.com/SeaLoong/Sensa/actions) 为准，操作见[开发与发布](development.md)。

## 已记录的运行

最近一次核对下列记录：2026-10-22 07:13（北京时间）。这些是相应提交的结果，不能替代新提交的检查。

| 提交 | 验证范围 | 运行 | 当时观察到的结果 |
| --- | --- | --- | --- |
| `6a9941f` | 应用完整普通浏览器比较 | [39691447010](https://github.com/SeaLoong/Sensa/actions/runs/39691447010) | 共 74 项：11 通过、3 失败、60 未执行；其他结果均为 0。仍为下方 3 个旧截图基线差异；构建与发布未执行 |
| `6a9941f` | 文档站 E2E 与自动部署 | [39691446947](https://github.com/SeaLoong/Sensa/actions/runs/39691446947) | 8 项全部通过，其他结果均为 0；站点构建与部署成功 |
| `b3fc2db` | 应用完整普通浏览器比较 | [39690646114](https://github.com/SeaLoong/Sensa/actions/runs/39690646114) | 共 74 项：11 通过、3 失败、60 未执行；预期失败、不稳定、跳过和中断均为 0。失败为下方 3 个旧截图基线差异；后续未执行用例不算通过，发布已阻止 |
| `b3fc2db` | 文档站 E2E 与自动部署 | [39690646060](https://github.com/SeaLoong/Sensa/actions/runs/39690646060) | 8 项全部通过，其他结果均为 0；站点构建与部署成功，确认窄屏表格测试修正有效 |
| `b3fc2db` | 手动 E2E 候选采集 | [39690660505](https://github.com/SeaLoong/Sensa/actions/runs/39690660505) | 共 74 项：72 通过、2 失败，其他结果均为 0，无未执行项。桌面和窄屏的离线 Three.js 几何用例均出现预期 `1.8`、实际 `1.88` 的断言差异；候选未导出，未创建维护分支或 PR，未接受图片 |
| `6356a89` | 文档站 E2E | [39690227009](https://github.com/SeaLoong/Sensa/actions/runs/39690227009) | 8 项中 6 通过、2 失败，无跳过或未执行；窄屏测试误以为开发指南的两列表格会溢出。改用定位指南的真实超宽表格后，后续 `b3fc2db` 运行通过 |
| [`330ba6e`](https://github.com/SeaLoong/Sensa/commit/330ba6e6e58b431c038e80db1a692f89fb9c8f1c) | 应用接口与完整浏览器比较 | [39680217981](https://github.com/SeaLoong/Sensa/actions/runs/39680217981) | 接口检查成功；浏览器任务失败，公开注释列出下方 3 个截图比较失败；完整计数与未执行范围未读取 |
| [`330ba6e`](https://github.com/SeaLoong/Sensa/commit/330ba6e6e58b431c038e80db1a692f89fb9c8f1c) | 文档站构建、浏览器导航与部署 | [39680217958](https://github.com/SeaLoong/Sensa/actions/runs/39680217958) | 整体成功；具体用例数未读取 |
| `6aa31cb` | 应用接口与浏览器比较 | [39677023629](https://github.com/SeaLoong/Sensa/actions/runs/39677023629) | 整体失败；未取得完整失败用例、数量和图片，原因未全部确认 |
| `6aa31cb` | 文档站构建与浏览器导航 | [39677023513](https://github.com/SeaLoong/Sensa/actions/runs/39677023513) | 整体成功，不代表应用截图或真实设备通过 |
| `c713db3` | 应用接口与浏览器比较 | [39669246139](https://github.com/SeaLoong/Sensa/actions/runs/39669246139) | 整体失败 |

## 已定位但未审图的差异

最新来源：[6a9941f 的浏览器任务公开注释](https://github.com/SeaLoong/Sensa/actions/runs/39691447010/job/119538579292)。与此前 `b3fc2db`、`330ba6e` 报告的差异一致；以下是断言报告，未据此接受基线。

| 桌面图片 | 当时报告 |
| --- | --- |
| `english-help.png` | 旧基线 560×622，实际 560×662；12,061 像素不同 |
| `paired-pose.png` | 1,123 像素不同 |
| `help-workflow.png` | 旧基线 560×492，实际 560×562；13,084 像素不同 |

本页不推断未执行用例通过，也不使用历史图片审阅替代其他提交的结果。完整的旧图片评审范围见[视觉评审存档](ui-visual-review.md)。

## 后续结果怎样更新？

检查和 E2E 结束后，先核对本次提交、运行链接、套件和截图模式，再记录 `summary.json`／`summary.md` 或对应 `Browser result` 注释中的实际通过、失败、跳过、未执行和中断范围。只有取得报告才填数量；审过 actual／expected／diff 后才能记录图片接受。维护工作流产生的候选 PR 与普通比较分别记录，不把“已生成候选”写成通过。[运行与维护流程](e2e.md)
