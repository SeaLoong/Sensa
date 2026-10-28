# 验证记录

**简体中文** | [English](e2e-status.en.md)

本页按阶段记录实际检查结果；历史运行不能代替新源码的验证。完整历史保存在[固定版本记录](https://github.com/SeaLoong/Sensa/blob/b23451a7e67627c2ea4ac4c8fdb5cc436e8ab640/docs/e2e-status.md)；工作流操作见[开发与发布](development.md)与 [E2E 维护](e2e.md)。

## 外部协议输入与设备桥接（2026-10-29）

新增 Buttplug v3/v4、TCode TCP／UDP／串口、Intiface WSDM、JSON HTTP／WebSocket 与厂商兼容输入；输出补齐厂商实时／同步脚本及 Intiface 显式执行器映射。虚拟串口与 BLE 桥使用独立可选工具，随便携包和 Windows 安装器提供。[配置、协议范围与限制](protocol-inputs.md)

本地完整检查实际通过 **238 项 Web、1081 项 .NET、389 项 Python**，无失败或跳过；另复用内容一致的 Unity 元数据成功记录。检查包含真实回环 HTTP／WebSocket、模拟串口／BLE、注入时钟、来源租约、每轴时长、停止屏障、事务回滚、长脚本和关机取消。补充回归明确区分绑定失效时的配置停止值与整机停止，并检查非法 TCode 行关闭后仅新会话可恢复。模拟与元数据检查不代表真实设备、厂商云或 Unity 客户端验收。

新增浏览器检查覆盖双语配置、Buttplug v3/v4 到模拟 TCode、来源权限、组合计算、长时间准备任务的停止／急停及旋转设备映射；两个视口共增加 28 次执行。浏览器完整普通比较和六平台原生冒烟在 Actions 运行，原生冒烟增加无设备 TCode 输入时长检查。对应下载包的结果以其 Source 提交的 [CI 运行](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)及附件为准，不能使用下方旧提交的 116 项结果证明这些新增功能。

## 历史范围

截至 2026-10-25（北京时间），本轮完善了自身 Avatar 的跟随参考平面、七种空间计算、Unity Tracking Frame、Shader 偏移与多编码块读取，以及 Windows 安装器和单文件发布。文档与参数图解同步说明 SPS 默认尺寸、坐标单位、当前 SDK Beta 和双方 Avatar 的配对姿态。WebUI、文档站与实际运行图片一并更新。

## 隔离检查

| 范围 | 实际结果 |
| --- | --- |
| .NET 单元 | **771 项通过**，涵盖空间计算与量纲、来源与时效、路由、启动行为及输出失效与回放查询的并发回归 |
| Web 单元 | **213 项通过**，包含空间预设、正式版优先的下载解析、缓存与语言恢复 |
| Python／脚本 | **309 项通过**，包含 QR 恢复、全部发布文件直链、依赖安装与安装器清理回归 |
| 文档站 | **92 条路由**构建通过；逐页链接和截图来源由构建检查 |
| Unity 静态检查（旧环境） | 包元数据、57 份 C# 语法，以及引用实际 Unity／SDK 程序集的隔离 API 类型检查通过 |
| Windows 单文件静态发布（旧环境） | x64 发布目录仅有 `Sensa.exe`，已核对内嵌资源；运行与安装结果见后续原生 CI |

API 类型检查包含部分生成器边界替身。Tracking Frame 新增 17 项参数化 EditMode 契约，等待 Editor 内执行。

## 浏览器与站点

| 固定源码 | 运行 | 实际结果 |
| --- | --- | --- |
| `cfff63be` | [完整普通比较 40198534823](https://github.com/SeaLoong/Sensa/actions/runs/40198534823/attempts/1) | **115 通过、1 失败**，其余结果为 0；移动端中文录制回放用例的状态查询超时；原生构建与发布未执行 |
| `cfff63be` | [Pages 40198534814](https://github.com/SeaLoong/Sensa/actions/runs/40198534814/attempts/1) | **14/14 通过并部署**；147 项公开资源摘要匹配，8 张站点原图逐张审阅通过 |
| `91ff9596`（PR #27 合并快照） | [完整普通比较 40196463228](https://github.com/SeaLoong/Sensa/actions/runs/40196463228/attempts/1) | **116/116 通过**，其余结果为 0；完整选择，关闭更新后比较截图，随后六个平台构建通过 |
| `50bcf723` | [Pages 40198080506](https://github.com/SeaLoong/Sensa/actions/runs/40198080506/attempts/1) | **12 通过、2 失败**；禁用安装器按钮失去链接语义，辅助名称被提示文字覆盖；部署跳过，未采集审阅图 |
| `ba0a9cc8` | [完整普通比较 40193128489](https://github.com/SeaLoong/Sensa/actions/runs/40193128489/attempts/1) | **116/116 通过**，其余结果为 0；固定 main 提交，完整选择，关闭更新后比较截图 |
| `ba0a9cc8` | [Pages 40193128498](https://github.com/SeaLoong/Sensa/actions/runs/40193128498/attempts/1) | **14/14 通过并部署**，其余结果为 0；146 项公开资源匹配构建，包含刷新后的 38 张文档图片 |
| `d3bcf170` | [Pages 40035927862](https://github.com/SeaLoong/Sensa/actions/runs/40035927862/attempts/1) | **14/14 通过并部署**，其余结果为 0；构建与验证清单一致，146 项公开资源的内容与摘要匹配 |
| `b0c08cb0`（main `d3bcf17` 与 PR #26 合并快照） | [完整普通比较 40037674549](https://github.com/SeaLoong/Sensa/actions/runs/40037674549/attempts/1) | **116/116 通过**，其余结果为 0；截图更新关闭 |
| `5d60f782` | [完整候选 40035585736](https://github.com/SeaLoong/Sensa/actions/runs/40035585736/attempts/1) | **116/116 通过**，其余结果为 0；164 张应用 PNG 与 8 张站点原图导出到 [PR #26](https://github.com/SeaLoong/Sensa/pull/26) |
| `5d60f782` | [Pages 40035211768](https://github.com/SeaLoong/Sensa/actions/runs/40035211768/attempts/1) | **14/14 通过并部署**；站点图与公开文档资源均核对通过 |
| `15adf70d` | [完整候选 40033013628](https://github.com/SeaLoong/Sensa/actions/runs/40033013628/attempts/1) | **114 通过、2 失败**，其余结果为 0；桌面与窄屏均遇下述离线语言问题，未接受候选 |
| `15adf70d` | [Pages 40032994999](https://github.com/SeaLoong/Sensa/actions/runs/40032994999/attempts/1) | **14/14 通过并部署**；8 张站点图复用相同摘要的已审阅原图，38 张文档公开图片匹配清单 |
| `e62d8f23`（PR #25 合并快照） | [完整普通比较 40031563312](https://github.com/SeaLoong/Sensa/actions/runs/40031563312/attempts/1) | **115 通过、1 失败**，其余结果为 0；移动端离线图解刷新后语言丢失，原生构建与发布跳过 |
| `71f63460` | [Pages 40032441894](https://github.com/SeaLoong/Sensa/actions/runs/40032441894/attempts/1) | **14/14 通过并部署**；38 张文档原图的公开内容与清单摘要一致 |
| `b23451a7` | [Pages 40028882502](https://github.com/SeaLoong/Sensa/actions/runs/40028882502/attempts/1) | **14/14 通过并部署**，其余结果为 0 |
| `b23451a7` | [更新基线前的 CI 40028882526](https://github.com/SeaLoong/Sensa/actions/runs/40028882526/attempts/1) | **1 通过、3 失败、112 未执行**；两项旧计算编辑器布局差异，一项新增空间计算图片缺少基线；构建与发布跳过 |
| `b23451a7` | [完整候选 40028896056](https://github.com/SeaLoong/Sensa/actions/runs/40028896056/attempts/1) | **116/116 通过**，其余结果为 0；164 张应用图片与 8 张站点原图已导出到 [PR #25](https://github.com/SeaLoong/Sensa/pull/25) |

本次接受的候选固定源码 `5d60f782313c9d6291bf9a32fa68394b63a1136e`，图片提交为 `a53b8e18cf1a3da710f368b3ae5a32c6cd71204d`。导出补丁、清单与全部 172 张 PNG 的 SHA-256 已核对一致。新环境中重新逐张打开了全部原图，未复用缺失的历史审阅凭据；修正后的图解明确区分 SPS 根局部单位、Contact 米制与图示缩放条件。[逐图审阅凭据](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json)保留观察和摘要。

完整普通比较测试了 `b0c08cb02e1352b9ad0cfcc7e279e71cad6f7fdc`，即 main `d3bcf1701ee114271cafa285cb382532e851ccaf` 与该候选的合并快照。报告为 `suite=all`、`mode=comparison`、`runner=passed`、`selectionComplete=true`、`snapshotsCompared=true`，命令成功，完整 **116 项通过**。候选同样完整选择，模式为 `candidate`、图片比较为 false。接受的 164 张应用基线与 8 张站点原图已完成逐图审阅及当前应用代码的完整比较；后续 main 运行 `40193128489` 在 `ba0a9cc8b543db003372509457f399e50169ae83` 同样完成 **116/116** 普通比较，命令成功，完整选择与截图比较标志均为 true，随后启动六个平台原生任务。之后的源码改动仍需对应提交的检查。

已验证的 Pages `40193128498` 固定 main `ba0a9cc8`，使用与构建一致的清单，包含 **92 条路由与 145 项资产**。含清单在内的 **146 项公开资源**均返回 HTTP 200，内容与 SHA-256 全部匹配。Pages 结果为 `suite=site`、`mode=comparison`、`runner=passed`、`selectionComplete=false`、`snapshotsCompared=true`，命令成功。38 张文档图片已依据本次候选刷新来源清单并逐张核对摘要：2 张图片字节变化，36 张与此前相同；来源统一记录为 `5d60f782`／`40035585736` attempt 1。上述 146 项公开资源核对属于已部署的 `ba0a9cc8` 构建，刷新后的 38 张文档图片全部核对通过；此前 `d3bcf17` 部署保留为独立历史结果。

[图片审阅与来源](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md) · [运行界面](screenshots.md)

## 本轮遇到的问题与修复

`cfff63be` 的完整比较中，移动端中文录制回放用例首次状态查询未返回，并非反复读取到“未播放”。源码检查发现输出失效操作持有协调器锁等待目标锁，而目标解析录制回放时持有目标锁等待协调器锁；这条锁反转可使状态查询一并阻塞，与失败现象一致。隔离回归受控重现了旧实现阻塞回放查询，且失败后完整释放线程。输出失效现先取得目标快照，释放协调器锁后逐个处理，并跳过已释放目标；修复后相关路由检查 **36/36**、完整后端 **771/771** 通过。原 E2E 断言与时限保持不变，新的普通比较仍需验证修复后的提交。

2026-10-26（北京时间），下载方式按用户反馈简化：首页只有一个“下载”按钮，首页与文档都直接链接 GitHub 的 `/releases/latest`；具体版本的 Release 正文提供其附件直链。已移除自建下载页、浏览器版本查询与缓存选择。新增浏览器断言覆盖普通链接在禁用 JavaScript、GitHub API 不可达时仍能直接导航；首个正式版通过 `release.yml` 执行完整检查后发布。此前下载选择器与禁用按钮修复属于已替代的历史实现。

PR #25 的普通比较实际记录：离线图解切换中文后会话值为 `zh-CN`，刷新后变为 `null`，页面恢复英语。文件页现将手动语言同时保存在当前浏览历史项，刷新时优先读取会话值，缺失时从历史项恢复并回填；HTTP 页面继续使用会话存储。三个新增单元测试通过，E2E 保留原断言并增加主动清空文件会话、刷新恢复和存储受限检查；上述完整候选与普通比较现已通过这些检查。

空间计算的输入检查现按位置与方向支持的物理量判断，修正加速度、角速度等导数被误认作位置的问题。新增 12 项回归覆盖真实求导链、未知量纲、合法实例名称和速度向量方向；完整后端 **770/770 通过**。发布说明新增本次构建的安装器下载链接，仍省略预览版变更清单；完整 Python **306/306 通过**。

源码 `71f6346` 的[候选 40032454295](https://github.com/SeaLoong/Sensa/actions/runs/40032454295) 在后端单元阶段为 **757 通过、1 失败**，浏览器阶段跳过。测试在同一 `UdpClient` 上并发接收两个包，导致共享缓冲区竞争；已改为顺序接收并保留一秒时限、地址无序断言和虚拟时钟清理。修正后完整后端 **758/758 通过**，该用例同一构建重复 **10/10 通过**。

- 源码 `0c1ad2c` 的 [CI 40025345270](https://github.com/SeaLoong/Sensa/actions/runs/40025345270) 与[候选 40025349090](https://github.com/SeaLoong/Sensa/actions/runs/40025349090) 通过 Web 检查，随后因 SDK 自动选择 10.0.402 而在锁定还原报 `NU1004`；后端测试和浏览器未执行。SDK 已固定为 10.0.401，后续单元检查成功。
- 同源码的 [Pages 40025344984](https://github.com/SeaLoong/Sensa/actions/runs/40025344984) 为 **12 通过、2 失败**。安装器测试再次导航到同一页面时未重载，改为显式重载后，[Pages 40026115999](https://github.com/SeaLoong/Sensa/actions/runs/40026115999) **14/14 通过并部署**；八张原图已逐张审阅。该源码的 [CI 40026116151](https://github.com/SeaLoong/Sensa/actions/runs/40026116151) 仍遇旧基线差异：**1 通过、3 失败、112 未执行**。
- [候选 40026140751](https://github.com/SeaLoong/Sensa/actions/runs/40026140751) 的 attempt 1、2 均在 Azure Ubuntu 镜像下载字体时超时；浏览器未启动，各结果计数均为 0，`runner=not-run`、命令跳过、完整选择与图片比较均为 false。现有安装流程在第二次尝试使用官方 HTTPS 镜像，并核对相同字体版本与 SHA-256；[CI 40028882526](https://github.com/SeaLoong/Sensa/actions/runs/40028882526) 已实际从首次超时恢复，61.2 MB 字体下载用时 4 秒，继续执行浏览器。
- 源码 `8d92eff` 的 CI 单元检查成功；其 CI、Pages 与候选随后主动取消，统一转到安装器测试修复后的源码。

## 原生构建与发布

PR #27 的 [CI 40196463228](https://github.com/SeaLoong/Sensa/actions/runs/40196463228/attempts/1) 在合并快照 `91ff9596ae89a6bd09f47c0341b40291851eadd2` 上完成单元、**116/116** 普通比较、**全部六个平台**及 Unity 打包。Windows x64 与 ARM64 的便携、单文件、安装后程序和安装／重装／卸载、配置／录制保留均通过；ARM64 最终成功标记在卸载器自删除与临时目录清理后写出，证明清理修复已通过原生验证。Windows x64 明确安装 Pillow **13.0.0**，合成 Shader PNG 回放通过。本地同样使用 Pillow 13.0.0 完成 **309 项**脚本检查。PR 已合并；该 PR 运行按规则跳过发布，包含下载改动的最终 main 仍需独立 CI 与自动预览验证。

main `ba0a9cc8` 的 [CI 40193128489](https://github.com/SeaLoong/Sensa/actions/runs/40193128489/attempts/1) 完成上述 **116/116** 浏览器比较后，五个平台任务与 Unity 打包通过。Windows x64 的便携、单文件、安装后程序以及安装／重装／卸载和数据保留检查均通过。ARM64 在打包步骤持续约 15 分钟后主动中断；运行最终为 **cancelled**，未上传 ARM64 报告，终止后日志接口返回 `BlobNotFound`，因此无法确定停滞的具体子步骤，也不能将该运行记为原生验证或发布成功。后续检查继续使用新的 runner，未基于缺失日志推测并修改程序。

[CI 40037674549](https://github.com/SeaLoong/Sensa/actions/runs/40037674549/attempts/1) 在完整普通比较通过后继续执行原生构建，**六个平台任务中五项通过**。**Windows x64 与 ARM64** 的便携版、单文件和安装后程序冒烟报告均通过；x64 安装器还完整通过首次安装、重装、卸载及配置／录制保留检查。ARM64 已执行这些操作，但临时目录清理删除 `unins000.exe` 时出现 `PermissionError`；日志虽显示最终卸载成功，最终安装器证明仍缺失。清理现最多等待 10 秒，让卸载程序删除自身可执行文件，原有文件删除与用户数据保留断言继续执行。新增两项回归及原有集成覆盖通过：打包测试 **13/13**，完整 Python **308/308**。修正仍待新的原生 CI 结果，预览任务已跳过，因此该运行不能证明完整分发已发布。Linux／macOS 冒烟与 Windows 合成 Shader 回放通过；回放不代表 GPU 捕获或真实设备验收。

## Unity 与实机范围

新环境已从官方模板恢复独立 Avatar／World 工程。Avatar 锁定 SDK／Base **3.10.6-beta.3**、MA **1.18.7**、NDMF **1.14.8**、VRCFury **1.1434.0**；World 锁定 SDK／Base **3.10.5** 与 VRCFury **1.1434.0**，不含 Avatar SDK。World 保持本地仓库，无远端或推送。vrc-get **1.9.3** 已与上游摘要核对；重复离线解析后，Avatar 的 **4654** 个包文件和 World 的 **5250** 个包文件逐项 SHA-256 一致，并同步 **185／51** 个受管理实验文件。

Unity Editor **2022.3.22f1** 与 Windows Mono 支持已按官方文件大小和 MD5 校验后安装。`-version` 成功返回版本，动态库检查未发现缺失项。这台 Debian 13 主机不在该 Editor 文档列出的 Ubuntu 桌面支持范围内。上表的旧环境语法／API 检查仍是历史证据，不能视为新工程导入通过。

新环境已实际尝试隔离运行 Avatar 的 `TrackingFrameContracts` EditMode 检查。许可客户端连接成功，但 Editor 在 **0.52 秒后以退出码 1** 报告 **“No valid Unity Editor license found”** 和 `License is not active (com.unity.editor.headless)`。**执行 0 项，17 项源码用例未运行**，未生成 NUnit XML；这确认了当前许可阻断，与旧环境的同类失败分开记录。Editor 导入与编译、NDMF 构建、Tracking Frame EditMode、Shader GPU 捕获、VRChat／HMD 和实际硬件均未验收。浏览器图片展示实际运行的 WebUI，连接与测量采用隔离模拟；Unity 包元数据检查验证分发结构。
