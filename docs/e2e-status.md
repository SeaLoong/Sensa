# 浏览器验证记录

**简体中文** | [English](e2e-status.en.md)

此页保留实际核对过的运行；最新进度见对应提交的 [Actions](https://github.com/SeaLoong/Sensa/actions)。流程见[开发与发布](development.md)与 [E2E 维护](e2e.md)。

## OSC 参数释义与官方来源

2026-10-23（北京时间），图解新增逐项参数说明，工作台详情使用同一套双语定义，提供数值范围、实际参数类型、单位、联动用法和来源。定义区分 VRChat 官方 SDK、VRCFury／OGB 与 Sensa 协议；核对并修正了 Close／Shader 的 Float 传输类型、SPS2 长度球、历史 PenSelf、速度量纲和 Raycast 未命中行为。[参数说明与来源](osc-parameters.md)

本地隔离检查已通过：Web **143 项**、.NET **497 项**、Python **237 项**、Unity 包元数据，以及 **84 个文档页面**构建。完整浏览器套件仍为 88 项，扩展断言覆盖全部图解字段、双语来源、工作台详情、折叠／焦点保持及窄屏滚动。已逐张打开全部 55 张新增／变化候选，选择 52 张：48 张图解全页与 4 张详情窗口；3 张无关实时读数／边缘变化恢复旧基线。当前共 138 张 PNG，另外 86 张既有图片保留原字节。未发现新增阻断或主要视觉问题；逐张审阅和关闭图片更新的完整普通比较均已通过，本轮基线已接受。[逐张审阅记录](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md)

| 提交 | 范围 | 运行 | 核对结果 |
| --- | --- | --- | --- |
| `280c838` | 完整候选采集 | [39853817326，第 1 次尝试](https://github.com/SeaLoong/Sensa/actions/runs/39853817326/attempts/1) | **88/88 通过**，其余结果均为 0；`selectionComplete=true`、`snapshotsCompared=false`，导出至 PR #19 |
| `280c838` | 首轮普通比较（未完成） | [39853785392](https://github.com/SeaLoong/Sensa/actions/runs/39853785392) | **35 通过、3 失败、50 未执行**，其余结果均为 0；完整选择、普通截图比较；失败为新增详情基线缺失与两张图解全页有意变化 |
| `280c838` | 文档站检查与自动部署 | [39853785382](https://github.com/SeaLoong/Sensa/actions/runs/39853785382) | **8/8 通过**，其余结果均为 0；站点专用选择，`selectionComplete=false`、`snapshotsCompared=true`，自动部署成功 |
| `b141d8e` | 筛选后完整普通比较 | [39856717268，第 2 次尝试](https://github.com/SeaLoong/Sensa/actions/runs/39856717268/attempts/2) | **88/88 通过**，其余结果均为 0；`selectionComplete=true`、`snapshotsCompared=true`，关闭图片更新 |
| `b141d8e` | 六平台构建与隔离冒烟完成 | [39856717268，第 3 次尝试](https://github.com/SeaLoong/Sensa/actions/runs/39856717268/attempts/3) | 全部六平台构建／隔离冒烟、Windows Shader 桥回放与 Unity 打包通过；复用已通过的完整浏览器比较，PR 不发布预览 |

候选、首轮 main 普通比较与站点运行固定源码 `280c8387762e60b4ae12c97faee6de41c3e2eaf0`，原候选图片提交 `71e1de8eeb88f1c7c4f4132e5be63495c270a2a0`。来源复核同时将 PhysBone 参考链接更新为官方当前页面。

普通比较固定源码 `b141d8e25a75f0d7c60ccf46c301d80c8ca874e4`，Git 树与已审阅 PR #19 提交 `7aca23ab071c4b4bb330437c2ede19b3f9ab5bed` 完全一致。第 1 次尝试在依赖安装的两次 130 秒预算后以 124 退出，浏览器未执行，报告总计／执行数为 0，`selectionComplete=false`、`snapshotsCompared=false`。第 2 次尝试在同一提交上重跑失败任务，安装成功后完整通过。 第 2 次尝试的六平台构建／打包均成功，Windows x64 后续 Shader 桥回放步骤以 1 退出，API 注释没有提供具体原因；第 3 次尝试仅重跑失败任务，在相同源码上通过，其他成功结果保持不变。

## 计算信号

2026-10-23（北京时间），本轮新增多输入计算、可复用中间结果与映射界面。当前本地隔离检查通过：Web **134 项**、Python **237 项**、.NET **497 项**，以及 **84 个文档页面**构建。路径前缀缓存、通配符刷新与零段匹配兼容均有回归检查，切换语言时的定位输入标签同步更新。计算与映射中的三点姿态孔口偏移现按参考对象的局部单位标注。[功能与操作](computed-signals.md)

| 提交 | 范围 | 运行 | 核对结果 |
| --- | --- | --- | --- |
| `9e700cf` | 完整候选采集 | [39837678118，第 1 次尝试](https://github.com/SeaLoong/Sensa/actions/runs/39837678118/attempts/1) | 总计 **88 项：2 通过、3 失败、83 未执行**；预期失败、不稳定、跳过、中断均为 0；完整选择、候选模式，`snapshotsCompared=false` |
| `9e700cf` | 文档站检查与自动部署 | [39837667830](https://github.com/SeaLoong/Sensa/actions/runs/39837667830) | **8/8 通过**，其余结果均为 0；站点专用选择，`selectionComplete=false`、`snapshotsCompared=true`，自动部署成功 |
| `9dc7de2` | 完整候选采集 | [39838949791，第 1 次尝试](https://github.com/SeaLoong/Sensa/actions/runs/39838949791/attempts/1) | **88/88 通过**，其余结果均为 0；`selectionComplete=true`、`snapshotsCompared=false`，图片导出至 PR #18 |
| `9dc7de2` | 普通比较（未完成） | [39838933199](https://github.com/SeaLoong/Sensa/actions/runs/39838933199) | 总计 **88 项：8 通过、3 失败、77 未执行**；其余结果均为 0；完整选择，`snapshotsCompared=true`；失败为两张新增基线缺失与原映射页图片变化 |
| `9dc7de2` | 文档站检查与自动部署 | [39838933002，第 2 次尝试](https://github.com/SeaLoong/Sensa/actions/runs/39838933002/attempts/2) | **8/8 通过**，其余结果均为 0；站点专用选择，`selectionComplete=false`、`snapshotsCompared=true`，自动部署成功 |
| `36c09a1` | 完整普通比较 | [39841973847](https://github.com/SeaLoong/Sensa/actions/runs/39841973847) | **88/88 通过**，其余结果均为 0；`selectionComplete=true`、`snapshotsCompared=true`，关闭图片更新 |
| `e4ab679` | main 完整普通比较 | [39844928808](https://github.com/SeaLoong/Sensa/actions/runs/39844928808) | 总计 **88 项：87 通过、1 失败**，其余结果均为 0；完整选择、普通截图比较；Contact 速度用例等待布尔状态超时，发布停止 |
| `e4ab679` | 文档站检查与自动部署 | [39844928814](https://github.com/SeaLoong/Sensa/actions/runs/39844928814) | **8/8 通过**，其余结果均为 0；站点专用选择，`selectionComplete=false`、`snapshotsCompared=true`，自动部署成功 |
| `a322cfa` | 修正后 main 完整比较与六平台构建 | [39847830729](https://github.com/SeaLoong/Sensa/actions/runs/39847830729) | **88/88 通过**，其余结果均为 0；完整普通比较、六平台构建／隔离冒烟和 Unity 打包通过，自动预发布成功 |
| `a322cfa` | 修正后文档站检查与部署 | [39847830590](https://github.com/SeaLoong/Sensa/actions/runs/39847830590) | **8/8 通过**，其余结果均为 0，自动部署成功 |

初次候选与站点运行固定源码 `9e700cfebb9436a2cd99fbd25d0c50d9c06150a1`。候选失败来自新增 E2E 对 `input[list]` 使用 textbox 角色定位，导致中英文加权平均与 SPS 路径断言找不到字段；现已改为按字段标签定位，保留原有行为断言。第二轮候选、旧版普通比较和该站点运行固定源码 `9dc7de27645fb484fa52711656bf31b05ff3f84a`；Pages 第 1 次尝试在依赖安装阶段达到 10 分钟上限，浏览器未执行，第 2 次尝试使用同一提交并完成部署。

main 运行 `39844928808` 固定源码 `e4ab6795c07bcc47b26facd27b5410e0733d5ff5`，完整执行了 88 项。唯一失败是既有 Contact 速度用例的布尔状态等待，原注释没有断言位置。后续审查发现一条可成立的保存竞态：GET 已能读取新映射时，浏览器保存仍可能未结束，实验设置按钮却允许再次保存。现统一配置按钮的忙状态，Contact 用例同时等待浏览器完成保存；初始化检查显示完整观察结果，失败摘要保留实际断言位置和堆栈。原失败保留记录；修正提交 `a322cfac23bf10a8c946e5e719ef37691a5c6a60` 已通过完整比较并发布 [preview-137-1-a322cfac](https://github.com/SeaLoong/Sensa/releases/tag/preview-137-1-a322cfac)。

PR #18 原图片提交 `ea15168fd5c238e9fc894d09cac4454ef5d37f66` 产生 **19 张新增／变化候选**，代码助手已逐张打开全部 19 张。实际选择 **14 张**：12 张计算编辑器、输入与设置图，覆盖中英和桌面／窄屏；另有 2 张映射页图。5 张无关变化恢复原字节：桌面英文帮助 36 个边缘像素，窄屏 Contact 位置图的实时速度 0.25→0.20 m/s（198 像素），以及三张参数图的 4／2／1 个像素波动。当前共 **134 张 PNG**，桌面／窄屏各 67 张；14 张选择图各占 7 张，另外 **120 张**保留原字节。

新界面按 V1–V6 检查可读，未发现新增阻断或主要视觉问题；英文计数仍显示 `1 mappings`（既有）和 `1 calculations`（新增），长页面正文正常滚动。筛选提交 `7644507` 同时包含语言标签刷新 `5c32f38` 与通配符零段兼容 `b176897`。完整普通比较固定源码 `36c09a18f649bd0dc61cf1222160254e3ef2d0a2`，Git 树与 PR 提交 `d2044c669eab1506dc92aaaf157dece3734c2327` 完全一致。本轮基线经逐张审阅及完整普通比较后接受。[逐张审阅记录](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md)

## SPS 四点定位命名

2026-10-23（北京时间），公开名称统一为“SPS 四点定位”与“SPS four-anchor tracking”，覆盖应用帮助、根点类型、参数图解、Unity 菜单和双语文档。

本地隔离检查通过：Web **126 项**、Python **237 项**、Unity 包元数据及 **80 个文档页面**构建。新增安装脚本测试使用模拟 APT，核对软件源选择、重试和失败退出。

| 提交 | 范围 | 运行 | 核对结果 |
| --- | --- | --- | --- |
| `dcdb7fa` | 完整候选采集 | [39821880631，第 2 次尝试](https://github.com/SeaLoong/Sensa/actions/runs/39821880631/attempts/2) | **80/80 通过**，其余结果均为 0；完整选择，候选模式，图片已导出至 PR #17 |
| `12dab3f` | 筛选后完整普通比较 | [39825612644，第 2 次尝试](https://github.com/SeaLoong/Sensa/actions/runs/39825612644/attempts/2) | **80/80 通过**，其余结果均为 0；完整选择、普通截图比较，`snapshotsCompared=true` |
| `dcdb7fa` | 文档站检查与自动部署 | [39821827672](https://github.com/SeaLoong/Sensa/actions/runs/39821827672) | **8/8 通过**，其余结果均为 0；新名称和双语构建指南检查通过，自动部署成功 |

PR #17 的原图片提交 `a5e3173` 产生 47 张变化候选，代码助手已逐张打开全部 47 张。实际选择 **44 张有意文案变化**：40 张参数图与 4 张帮助图，桌面／窄屏各 22 张。3 张仅有实时速度读数或边缘抗锯齿波动的 Contact 图片恢复原基线，另外 **78 张**保留原字节。新名称、Socket／Plug 根点说明、单位、长参数与控件均可读，未发现新增阻断或主要视觉问题。[逐张审阅范围与既有细节](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md)

筛选后图片提交为 `6787b0f20cdc44e5bbc08b7054cccb7c810ca563`，Git 树与普通比较使用的 `12dab3f00fbb05f6e97b34b3f3d1a5864ab48d55` 一致。本轮基线经逐张审阅与完整普通比较后接受，图片更新关闭，`selectionComplete=true`、`snapshotsCompared=true`。候选首轮、最初的 main 比较与 PR 普通比较首轮均在依赖安装阶段达到 5 分钟上限，浏览器未执行；重试分别固定各自的同一提交。共用安装脚本现在只刷新所需 Ubuntu 索引，并以两次有界尝试控制等待；具体预算见[开发与发布](development.md)。

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

## Contact SDK 图片审阅

候选提交 `9166f82` 共 **122 张 PNG**。代码助手已逐张打开并审阅 **56 张新增／变化图片**：桌面与窄屏各 28 张，包含 48 张双语参数图及 8 张应用图；其余 66 张字节未变。未发现阻断或主要视觉问题。桌面速度单位单独换行的排版细节已记录。[图片来源与评审](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md)

普通比较使用的 PR 合并提交 `1d46aa95e8512912fd97333b368bcf717aaf675e`，其 Git 树与图片提交 `9166f82e4142bc38748bb9bb7dd70bd2383e7f5e` 完全一致。此次普通比较关闭图片更新，`selectionComplete=true`、`snapshotsCompared=true`，基线已通过逐张审阅与完整比较。第 1 次尝试在依赖安装阶段达到 25 分钟上限，浏览器用例未执行；第 2 次尝试使用相同提交并通过。当前安装策略见[开发与发布](development.md)。

## 验收范围

浏览器用例使用隔离配置与模拟传输。实际 Beta SDK 的 Unity／VRChat、OSC 发布、真实 GPU 捕获、实体触屏和设备联动另行验收；Unity EditMode 契约已编写，尚未执行 Unity Editor。可访问性明细保留在各次运行报告中。

本轮首轮失败及修正依据见[固定记录](https://github.com/SeaLoong/Sensa/blob/3eb67db15cbf36c31e69ada8bafa3a46d9d6f02c/docs/e2e-status.md)：速度用例改用纯振动模拟端，英文预设检查同步为五项，新增图片经过本轮采集与审阅。此前 74 项套件及发布见[历史验证](https://github.com/SeaLoong/Sensa/blob/3821bc876b0e5d9bbc16c515e83754a18c555841/docs/e2e-status.md)，更早视觉评审见[存档](ui-visual-review.md)。

## 后续记录

运行完成后核对提交、链接、套件和截图模式，再从 `summary.json`／`summary.md` 或 `Browser result` 注释记录通过、失败、跳过、未执行、不稳定与中断数量。接受图片时同时记录实际审阅范围和普通比较结果。
