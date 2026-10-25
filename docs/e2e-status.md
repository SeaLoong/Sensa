# 验证记录

**简体中文** | [English](e2e-status.en.md)

本页记录当前改动的实际检查结果。完整历史保存在[固定版本记录](https://github.com/SeaLoong/Sensa/blob/b23451a7e67627c2ea4ac4c8fdb5cc436e8ab640/docs/e2e-status.md)；工作流操作见[开发与发布](development.md)与 [E2E 维护](e2e.md)。

## 本轮范围

截至 2026-10-25（北京时间），本轮完善了自身 Avatar 的跟随参考平面、七种空间计算、Unity Tracking Frame、Shader 偏移与多编码块读取，以及 Windows 安装器和单文件发布。文档与参数图解同步说明 SPS 默认尺寸、坐标单位、当前 SDK Beta 和双方 Avatar 的配对姿态。WebUI、文档站与实际运行图片一并更新。

## 隔离检查

| 范围 | 实际结果 |
| --- | --- |
| .NET 单元 | **770 项通过**，涵盖空间计算与量纲、来源与时效、路由、启动行为 |
| Web 单元 | **220 项通过**，包含空间预设、安装器下载选择与离线语言恢复 |
| Python／脚本 | **308 项通过**，包含 QR 恢复、发布、依赖安装与安装器清理回归 |
| 文档站 | **92 条路由**构建通过；逐页链接和截图来源由构建检查 |
| Unity 静态检查（旧环境） | 包元数据、57 份 C# 语法，以及引用实际 Unity／SDK 程序集的隔离 API 类型检查通过 |
| Windows 单文件静态发布（旧环境） | x64 发布目录仅有 `Sensa.exe`，已核对内嵌资源；运行与安装结果见后续原生 CI |

API 类型检查包含部分生成器边界替身。Tracking Frame 新增 17 项参数化 EditMode 契约，等待 Editor 内执行。

## 浏览器与站点

| 固定源码 | 运行 | 实际结果 |
| --- | --- | --- |
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

完整普通比较测试了 `b0c08cb02e1352b9ad0cfcc7e279e71cad6f7fdc`，即 main `d3bcf1701ee114271cafa285cb382532e851ccaf` 与该候选的合并快照。报告为 `suite=all`、`mode=comparison`、`runner=passed`、`selectionComplete=true`、`snapshotsCompared=true`，命令成功，完整 **116 项通过**。候选同样完整选择，模式为 `candidate`、图片比较为 false。接受的 164 张应用基线与 8 张站点原图已完成逐图审阅及当前应用代码的完整比较；后续源码改动仍需对应提交的检查。

当前 Pages `40035927862` 使用与构建一致的清单，包含 **92 条路由与 145 项资产**。含清单在内的 **146 项公开资源**均返回 HTTP 200，内容与 SHA-256 全部匹配。Pages 结果为 `suite=site`、`mode=comparison`、`runner=passed`、`selectionComplete=false`、`snapshotsCompared=true`，命令成功。38 张文档图片已依据本次候选刷新来源清单并逐张核对摘要：2 张图片字节变化，36 张与此前相同；来源统一记录为 `5d60f782`／`40035585736` attempt 1。上述 146 项公开资源核对属于刷新前的 `d3bcf17` 部署，新提交部署结果仍待检查。

[图片审阅与来源](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md) · [运行界面](screenshots.md)

## 本轮遇到的问题与修复

PR #25 的普通比较实际记录：离线图解切换中文后会话值为 `zh-CN`，刷新后变为 `null`，页面恢复英语。文件页现将手动语言同时保存在当前浏览历史项，刷新时优先读取会话值，缺失时从历史项恢复并回填；HTTP 页面继续使用会话存储。三个新增单元测试通过，E2E 保留原断言并增加主动清空文件会话、刷新恢复和存储受限检查；上述完整候选与普通比较现已通过这些检查。

空间计算的输入检查现按位置与方向支持的物理量判断，修正加速度、角速度等导数被误认作位置的问题。新增 12 项回归覆盖真实求导链、未知量纲、合法实例名称和速度向量方向；完整后端 **770/770 通过**。发布说明新增本次构建的安装器下载链接，仍省略预览版变更清单；完整 Python **306/306 通过**。

源码 `71f6346` 的[候选 40032454295](https://github.com/SeaLoong/Sensa/actions/runs/40032454295) 在后端单元阶段为 **757 通过、1 失败**，浏览器阶段跳过。测试在同一 `UdpClient` 上并发接收两个包，导致共享缓冲区竞争；已改为顺序接收并保留一秒时限、地址无序断言和虚拟时钟清理。修正后完整后端 **758/758 通过**，该用例同一构建重复 **10/10 通过**。

- 源码 `0c1ad2c` 的 [CI 40025345270](https://github.com/SeaLoong/Sensa/actions/runs/40025345270) 与[候选 40025349090](https://github.com/SeaLoong/Sensa/actions/runs/40025349090) 通过 Web 检查，随后因 SDK 自动选择 10.0.402 而在锁定还原报 `NU1004`；后端测试和浏览器未执行。SDK 已固定为 10.0.401，后续单元检查成功。
- 同源码的 [Pages 40025344984](https://github.com/SeaLoong/Sensa/actions/runs/40025344984) 为 **12 通过、2 失败**。安装器测试再次导航到同一页面时未重载，改为显式重载后，[Pages 40026115999](https://github.com/SeaLoong/Sensa/actions/runs/40026115999) **14/14 通过并部署**；八张原图已逐张审阅。该源码的 [CI 40026116151](https://github.com/SeaLoong/Sensa/actions/runs/40026116151) 仍遇旧基线差异：**1 通过、3 失败、112 未执行**。
- [候选 40026140751](https://github.com/SeaLoong/Sensa/actions/runs/40026140751) 的 attempt 1、2 均在 Azure Ubuntu 镜像下载字体时超时；浏览器未启动，各结果计数均为 0，`runner=not-run`、命令跳过、完整选择与图片比较均为 false。现有安装流程在第二次尝试使用官方 HTTPS 镜像，并核对相同字体版本与 SHA-256；[CI 40028882526](https://github.com/SeaLoong/Sensa/actions/runs/40028882526) 已实际从首次超时恢复，61.2 MB 字体下载用时 4 秒，继续执行浏览器。
- 源码 `8d92eff` 的 CI 单元检查成功；其 CI、Pages 与候选随后主动取消，统一转到安装器测试修复后的源码。

## 原生构建与发布

[CI 40037674549](https://github.com/SeaLoong/Sensa/actions/runs/40037674549/attempts/1) 在完整普通比较通过后继续执行原生构建，**六个平台任务中五项通过**。**Windows x64 与 ARM64** 的便携版、单文件和安装后程序冒烟报告均通过；x64 安装器还完整通过首次安装、重装、卸载及配置／录制保留检查。ARM64 已执行这些操作，但临时目录清理删除 `unins000.exe` 时出现 `PermissionError`；日志虽显示最终卸载成功，最终安装器证明仍缺失。清理现最多等待 10 秒，让卸载程序删除自身可执行文件，原有文件删除与用户数据保留断言继续执行。新增两项回归及原有集成覆盖通过：打包测试 **13/13**，完整 Python **308/308**。修正仍待新的原生 CI 结果，预览任务已跳过，因此该运行不能证明完整分发已发布。Linux／macOS 冒烟与 Windows 合成 Shader 回放通过；回放不代表 GPU 捕获或真实设备验收。

## Unity 与实机范围

以下安装证据来自旧环境：Unity Editor **2022.3.22f1** 的版本命令成功，Windows Mono 支持与独立 Avatar／World 工程已安装；Avatar 使用 SDK **3.10.6-beta.3**、MA **1.18.7**、NDMF **1.14.8**、VRCFury **1.1434.0**，World 使用 SDK **3.10.5**。包内容、语法与隔离 API 检查，以及上表中的 x64 单文件静态发布，均为历史观察。

旧环境的实际批处理导入以 **“No valid Unity Editor license found”** 退出。恢复后的机器未找到这些 Editor 安装或工程，目前恢复工作仅核验了官方 SDK ZIP。Editor 编译、NDMF 构建、17 项 Tracking Frame EditMode、Shader GPU 捕获、VRChat／HMD 和实际硬件仍未验证。浏览器图片展示实际运行的 WebUI，连接与测量采用隔离模拟；Unity 包元数据检查验证分发结构。
