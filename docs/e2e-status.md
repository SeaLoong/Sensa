# 浏览器验证记录

**简体中文** | [English](e2e-status.en.md)

此页保留实际核对过的运行；最新进度见对应提交的 [Actions](https://github.com/SeaLoong/Sensa/actions)。流程见[开发与发布](development.md)与 [E2E 维护](e2e.md)。

## SPS 四点定位命名

2026-10-23（北京时间），公开名称统一为“SPS 四点定位”与“SPS four-anchor tracking”，覆盖应用帮助、根点类型、参数图解、Unity 菜单和双语文档。界面文字变化的候选采集、逐张图片审阅与完整普通比较完成后，将在此记录实际运行。

## Unity 作者组件与构建流程

2026-10-23（北京时间），本地隔离检查通过：Web **126 项**、Python **230 项**、Unity 包元数据和 **80 个文档页面**构建；**46 个 C# 文件**通过 C# 9 语法解析。此项解析只检查语法，Unity Editor 编译、EditMode 执行与客户端验收仍待完成。[实现、配置与官方依据](unity-build.md)

站点 E2E 已加入双语构建指南入口、语言切换、构建时机与官方资料链接检查，并在运行报告附上两种语言的指南截图。本轮沿用已审阅的 122 张比较基线。

| 提交 | 范围 | 运行 | 核对结果 |
| --- | --- | --- | --- |
| `d7246c1` | 完整普通比较与六平台构建 | [39817899186](https://github.com/SeaLoong/Sensa/actions/runs/39817899186) | **80/80 通过**，其余结果均为 0；完整选择、普通截图比较；六平台构建／隔离冒烟、Windows Shader 桥回放及 Unity 打包均通过 |
| `d7246c1` | 文档站检查与自动部署 | [39817899027](https://github.com/SeaLoong/Sensa/actions/runs/39817899027) | **8/8 通过**，其余结果均为 0；双语构建指南、官方资料入口与窄屏布局检查通过，自动部署成功 |

完整比较关闭图片更新，`selectionComplete=true`、`snapshotsCompared=true`。站点专用选择独立记为 8 项。首轮 [Pages 39817289697](https://github.com/SeaLoong/Sensa/actions/runs/39817289697) 在 `46db6f8` 上为 **6/8 通过、2 项失败**，其余结果均为 0：新增断言把正确的相对链接按完整路径查找。修正后按可见名称找到链接，再验证点击后地址。旧版完整运行 [39817289668](https://github.com/SeaLoong/Sensa/actions/runs/39817289668) 已在修正提交推送后主动取消，其浏览器结果不计作完整验收。

## Contact SDK 适配

2026-10-22，本地隔离检查通过：Web **126 项**、后端 **434 项**、Python **228 项**，另有 Unity 包元数据检查和 **76 个文档页面**构建。[功能与官方 SDK 依据](contact-sdk.md)

| 提交 | 范围 | 运行 | 核对结果 |
| --- | --- | --- | --- |
| `8e77ba4` | 完整候选采集 | [39792231646](https://github.com/SeaLoong/Sensa/actions/runs/39792231646) | **80/80 通过**，其余结果均为 0；完整选择，候选模式，图片导出及 PR #16 创建成功 |
| `1d46aa9` | 完整普通比较与六平台构建 | [39794320594](https://github.com/SeaLoong/Sensa/actions/runs/39794320594/attempts/2) | **80/80 通过**，其余结果均为 0；第 2 次尝试完成完整普通比较，六平台构建／隔离冒烟、Windows Shader 桥回放与 Unity 打包均通过 |
| `8e77ba4` | 文档站检查与自动部署 | [39792230278](https://github.com/SeaLoong/Sensa/actions/runs/39792230278) | **8/8 通过**，其余结果均为 0；Contact 图解／指南入口已检查，自动部署成功 |

完整应用用例覆盖 Contact 米制位置、静止零速与速度量程校准，Depth／V0 的实际模拟传输输出，接触离开及活动计数冻结后的停止。参数图解检查完整十二字段、排序、独立位置／速度控件、边界与 Sample 失效，并保留 SPS 四点定位及 Shader 回归。站点专用选择独立记为 8 项。

## 图片审阅

候选提交 `9166f82` 共 **122 张 PNG**。代码助手已逐张打开并审阅 **56 张新增／变化图片**：桌面与窄屏各 28 张，包含 48 张双语参数图及 8 张应用图；其余 66 张字节未变。未发现阻断或主要视觉问题。桌面速度单位单独换行的排版细节已记录。[图片来源与评审](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md)

普通比较使用的 PR 合并提交 `1d46aa95e8512912fd97333b368bcf717aaf675e`，其 Git 树与图片提交 `9166f82e4142bc38748bb9bb7dd70bd2383e7f5e` 完全一致。此次普通比较关闭图片更新，`selectionComplete=true`、`snapshotsCompared=true`，基线已通过逐张审阅与完整比较。第 1 次尝试在依赖安装阶段达到 25 分钟上限，浏览器用例未执行；第 2 次尝试使用相同提交并通过。后续浏览器／候选工作流已为安装步骤设置 5 分钟预算、30 秒网络等待和 2 次重试。

## 验收范围

浏览器用例使用隔离配置与模拟传输。实际 Beta SDK 的 Unity／VRChat、OSC 发布、真实 GPU 捕获、实体触屏和设备联动另行验收；Unity EditMode 契约已编写，尚未执行 Unity Editor。可访问性明细保留在各次运行报告中。

本轮首轮失败及修正依据见[固定记录](https://github.com/SeaLoong/Sensa/blob/3eb67db15cbf36c31e69ada8bafa3a46d9d6f02c/docs/e2e-status.md)：速度用例改用纯振动模拟端，英文预设检查同步为五项，新增图片经过本轮采集与审阅。此前 74 项套件及发布见[历史验证](https://github.com/SeaLoong/Sensa/blob/3821bc876b0e5d9bbc16c515e83754a18c555841/docs/e2e-status.md)，更早视觉评审见[存档](ui-visual-review.md)。

## 后续记录

运行完成后核对提交、链接、套件和截图模式，再从 `summary.json`／`summary.md` 或 `Browser result` 注释记录通过、失败、跳过、未执行、不稳定与中断数量。接受图片时同时记录实际审阅范围和普通比较结果。
