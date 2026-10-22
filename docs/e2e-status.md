# 浏览器验证记录

**简体中文** | [English](e2e-status.en.md)

此页保留实际核对过的运行；最新进度见对应提交的 [Actions](https://github.com/SeaLoong/Sensa/actions)。检查顺序、发布和维护方式见[开发与发布](development.md)与 [E2E 维护](e2e.md)。

## Contact SDK 适配验证

2026-10-22 本轮本地隔离检查已通过：Web 126 项、后端 434 项、Python 228 项，另有 Unity 包元数据检查和 76 个文档页面构建。新增的浏览器用例覆盖 Contact 米制坐标／速度校准、接触离开与活动冻结停止，以及双语参数图解。浏览器运行与新截图尚待 Actions 验证、审阅；实际 Beta SDK 的 Unity／VRChat 与 OSC 链路另行验收。[功能与 SDK 依据](contact-sdk.md)

## 此前已核对的 CI

最近核对：2026-10-22 08:24（北京时间）。

| 提交 | 范围 | 运行 | 已核对的结果 |
| --- | --- | --- | --- |
| `c698c70` | 手动 E2E 候选采集 | [39696164927](https://github.com/SeaLoong/Sensa/actions/runs/39696164927) | 74 项全部通过，其余结果均为 0；导出成功，并自动创建[草稿 PR #15](https://github.com/SeaLoong/Sensa/pull/15) |
| `6df338e`（PR 合并提交） | 完整普通 E2E、构建与冒烟 | [39697659875](https://github.com/SeaLoong/Sensa/actions/runs/39697659875) | 74 项全部通过，其余结果均为 0；完整选择与截图比较均已确认，图片更新关闭；单元、六平台构建与隔离冒烟、Unity 打包全部通过 |
| `c966216` | 文档站 E2E 与自动部署 | [39699172306](https://github.com/SeaLoong/Sensa/actions/runs/39699172306) | 8 项全部通过，其余结果均为 0；自动部署成功 |
| `c966216` | 完整 CI | [39699172451](https://github.com/SeaLoong/Sensa/actions/runs/39699172451) | Web 与后端单元通过；发行包离线文档检查发现下方评审链接指向未打包的测试目录，E2E／构建／发布停止。链接已改为固定提交的在线记录，待下一次 CI 确认 |

候选运行使用图片更新模式；普通比较关闭图片更新，独立核对全部用例。PR 合并提交 `6df338e` 的 Git 树与图片提交 `2b850c4` 完全一致。`SENSA_PAT` 已实际完成推送候选分支、创建 PR，PR 事件自动启动普通 CI。

## 本轮图片评审

代码助手逐张审阅了 PR #15 的 **55 张变化图**：桌面 27 张、窄屏 28 张。包括 40 张双语参数图，以及帮助、映射、录制和根点相关的 15 张应用图。完整基线保留 110 张 PNG，其余 55 张逐字节不变。

已核对完整参数名、字典序与短前缀顺序、参数含义、长文本换行、控件和图形标签。SPS1／SPS2 的标题和解释、Sensa SPS 的四球共同覆盖区、Shader 的边缘标记与数据区均显示清楚，变化图中未发现新的视觉问题。图片经逐张审阅及完整普通比较后接受。详细来源与范围见[截图评审记录](https://github.com/SeaLoong/Sensa/blob/c9662166cf115d5e123ef3b47dcd8bb317be1cc5/tests/e2e/__screenshots__/README.md)。

此前普通比较在旧基线上首先报告帮助、映射和录制三处差异；本轮候选包含这些有意的文案变化。早期容器 Git 导出及可选任务依赖条件问题已由本轮成功导出、创建 PR 的运行确认修复。较早的运行记录保留于[固定历史版本](https://github.com/SeaLoong/Sensa/blob/c698c70177cc9b746567e12c59860d9217bf49c4/docs/e2e-status.md)，历史图片评审见[视觉评审存档](ui-visual-review.md)。

## 怎样继续维护记录？

完成运行后核对提交、运行链接、套件和截图模式，再从 `summary.json`／`summary.md` 或 `Browser result` 注释记录通过、失败、跳过、未执行、不稳定与中断数量。接受图片时同时记录实际审阅范围和普通比较结果。

本轮覆盖模拟浏览器行为、页面布局和文档导航。Unity／VRChat、真实 GPU 捕获、实体触屏和设备交互另行验收；可访问性明细保留在各次运行报告中。
