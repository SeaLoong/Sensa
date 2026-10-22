# 浏览器验证记录

**简体中文** | [English](e2e-status.en.md)

此页保留实际核对过的运行；最新进度见对应提交的 [Actions](https://github.com/SeaLoong/Sensa/actions)。检查顺序、发布和维护方式见[开发与发布](development.md)与 [E2E 维护](e2e.md)。

## Contact SDK 适配

2026-10-22，本地隔离检查已通过：Web **126 项**、后端 **434 项**、Python **228 项**，另有 Unity 包元数据检查和 **76 个文档页面**构建。新增浏览器用例覆盖 Contact 米制位置／速度校准、Depth／V0 映射、接触离开与活动冻结停止，以及双语参数图解。[功能与 SDK 依据](contact-sdk.md)

| 提交 | 范围 | 运行 | 核对结果 |
| --- | --- | --- | --- |
| `23a638a` | 文档站 E2E 与部署 | [39789193609](https://github.com/SeaLoong/Sensa/actions/runs/39789193609) | 8 项全部通过，其余结果均为 0；Contact 新图解与指南入口已检查，自动部署成功 |
| `23a638a` | 完整普通 E2E 比较 | [39789193521](https://github.com/SeaLoong/Sensa/actions/runs/39789193521) | 共 80 项：6 通过、3 失败、71 未执行，其余结果均为 0；单元通过，截图基线差异阻止后续构建／发布 |
| `23a638a` | 手动候选采集 | [39789208758](https://github.com/SeaLoong/Sensa/actions/runs/39789208758) | 共 80 项：40 通过、3 失败、37 未执行，其余结果均为 0；单元通过，失败阻止导出候选和创建 PR |

普通比较最先报告三处基线变化：帮助图从 560×582 变为 560×642（13,255 像素不同），以及新增的 `contact-root-position.png`、`contact-root-speed.png` 尚无基线。后续 71 个未执行项保留待检查状态。

候选采集发现两类测试配置需要同步：桌面／移动端速度用例使用了只启用 L0 的 UDP 配置，现改用现有纯振动 Intiface 模拟端检查 V0；英文预设数量从 3 更新为 5，并检查两项新增预设名称。完整候选和普通比较将在修正提交上重跑。

## 图片审阅与验收范围

当前已接受的截图来源仍见[截图评审记录](https://github.com/SeaLoong/Sensa/blob/c9662166cf115d5e123ef3b47dcd8bb317be1cc5/tests/e2e/__screenshots__/README.md)。本轮增加 Contact 场景和位置／速度诊断图，候选完成后逐张检查变化图片，再运行完整普通比较并更新记录。

浏览器用例使用隔离配置与模拟传输。实际 Beta SDK 的 Unity／VRChat、OSC 链路、真实 GPU 捕获、实体触屏和设备联动另行验收；Unity EditMode 契约已编写，尚未执行 Unity Editor。可访问性明细保留在各次运行报告中。

此前四点定位与 Shader 的 74 项比较、六平台构建／冒烟和自动预发布结果见[固定历史记录](https://github.com/SeaLoong/Sensa/blob/3821bc876b0e5d9bbc16c515e83754a18c555841/docs/e2e-status.md)，历史视觉评审见[存档](ui-visual-review.md)。

## 后续记录

运行完成后核对提交、链接、套件和截图模式，再从 `summary.json`／`summary.md` 或 `Browser result` 注释记录通过、失败、跳过、未执行、不稳定与中断数量。接受图片时同时记录实际审阅范围和普通比较结果。
