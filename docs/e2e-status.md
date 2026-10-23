# 验证记录

**简体中文** | [English](e2e-status.en.md)

本页记录当前改动的实际检查结果。完整历史保存在[固定版本记录](https://github.com/SeaLoong/Sensa/blob/b23451a7e67627c2ea4ac4c8fdb5cc436e8ab640/docs/e2e-status.md)；工作流操作见[开发与发布](development.md)与 [E2E 维护](e2e.md)。

## 本轮范围

2026-10-24（北京时间），本轮完善了自身 Avatar 的跟随参考平面、七种空间计算、Unity Tracking Frame、Shader 偏移与多编码块读取，以及 Windows 安装器和单文件发布。文档与参数图解同步说明 SPS 默认尺寸、坐标单位、当前 SDK Beta 和双方 Avatar 的配对姿态。WebUI、文档站与实际运行图片一并更新。

## 隔离检查

| 范围 | 实际结果 |
| --- | --- |
| .NET 单元 | **758 项通过**，涵盖空间计算、来源与时效、路由、启动行为 |
| Web 单元 | **220 项通过**，包含空间预设、安装器下载选择与离线语言恢复 |
| Python／脚本 | **306 项通过**，包含 QR 恢复、发布与依赖安装 |
| 文档站 | **92 条路由**构建通过；逐页链接和截图来源由构建检查 |
| Unity 静态检查 | 包元数据、57 份 C# 语法，以及引用实际 Unity／SDK 程序集的隔离 API 类型检查通过 |
| Windows 单文件静态发布 | x64 发布目录仅有 `Sensa.exe`，已核对内嵌资源；运行与安装结果见后续原生 CI |

API 类型检查包含部分生成器边界替身。Tracking Frame 新增 17 项参数化 EditMode 契约，等待 Editor 内执行。

## 浏览器与站点

| 固定源码 | 运行 | 实际结果 |
| --- | --- | --- |
| `15adf70d` | [Pages 40032994999](https://github.com/SeaLoong/Sensa/actions/runs/40032994999/attempts/1) | **14/14 通过并部署**；8 张站点图复用相同摘要的已审阅原图，38 张文档公开图片匹配清单 |
| `e62d8f23`（PR #25 合并快照） | [完整普通比较 40031563312](https://github.com/SeaLoong/Sensa/actions/runs/40031563312/attempts/1) | **115 通过、1 失败**，其余结果为 0；移动端离线图解刷新后语言丢失，原生构建与发布跳过 |
| `71f63460` | [Pages 40032441894](https://github.com/SeaLoong/Sensa/actions/runs/40032441894/attempts/1) | **14/14 通过并部署**；38 张文档原图的公开内容与清单摘要一致 |
| `b23451a7` | [Pages 40028882502](https://github.com/SeaLoong/Sensa/actions/runs/40028882502/attempts/1) | **14/14 通过并部署**，其余结果为 0 |
| `b23451a7` | [更新基线前的 CI 40028882526](https://github.com/SeaLoong/Sensa/actions/runs/40028882526/attempts/1) | **1 通过、3 失败、112 未执行**；两项旧计算编辑器布局差异，一项新增空间计算图片缺少基线；构建与发布跳过 |
| `b23451a7` | [完整候选 40028896056](https://github.com/SeaLoong/Sensa/actions/runs/40028896056/attempts/1) | **116/116 通过**，其余结果为 0；164 张应用图片与 8 张站点原图已导出到 [PR #25](https://github.com/SeaLoong/Sensa/pull/25) |

Pages 为 `suite=site`、`mode=comparison`、`runner=passed`、`selectionComplete=false`、`snapshotsCompared=true`，命令成功。八张站点原图均已审阅；仅 SHA-256 相同的图片复用此前逐张观察。公开首页、中英文首次使用、深层 Unity 文档及 CSS／JS 已与该构建清单核对，六项资源均返回 200 且摘要一致。测试覆盖实际样式、响应式图片、语言切换、失效资源回退与安装器链接发现。

更新基线前的应用比较为 `suite=all`、`mode=comparison`、`runner=failed`、`selectionComplete=true`、`snapshotsCompared=true`；除表中结果外其余计数为 0。完整套件现为 **116 项**，包含双语桌面／窄屏、空间计算、跟随平面、共享会话与站点用例。候选图片在逐张审阅后导入，并以关闭图片更新的完整普通比较确认。

候选固定源码 `b23451a7e67627c2ea4ac4c8fdb5cc436e8ab640`，原始图片提交 `d59f94453d38e93a113ef10fcedecd30d51492ac`；`runner=passed`、命令成功、完整选择为 true、图片比较为 false。172 张图片均已审阅：109 张复用相同 SHA-256 的既有观察，63 张新字节原图逐张打开。SPS 四点与 Contact 的 12 张图解需补清首句半径单位／图示缩放条件，正在修正后重采；布局与 QR 图样未发现阻断。文档已发布其中 **38 张审阅通过的原图**，包含中英文手动与空间输入组；应用新基线仍待修正后的候选与完整比较。

[图片审阅与来源](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md) · [运行界面](screenshots.md)

## 本轮遇到的问题与修复

PR #25 的普通比较实际记录：离线图解切换中文后会话值为 `zh-CN`，刷新后变为 `null`，页面恢复英语。文件页现将手动语言同时保存在当前浏览历史项，刷新时优先读取会话值，缺失时从历史项恢复并回填；HTTP 页面继续使用会话存储。三个新增单元测试通过，E2E 保留原断言并增加主动清空文件会话、刷新恢复和存储受限检查，等待后续完整运行验证。

源码 `71f6346` 的[候选 40032454295](https://github.com/SeaLoong/Sensa/actions/runs/40032454295) 在后端单元阶段为 **757 通过、1 失败**，浏览器阶段跳过。测试在同一 `UdpClient` 上并发接收两个包，导致共享缓冲区竞争；已改为顺序接收并保留一秒时限、地址无序断言和虚拟时钟清理。修正后完整后端 **758/758 通过**，该用例同一构建重复 **10/10 通过**。

- 源码 `0c1ad2c` 的 [CI 40025345270](https://github.com/SeaLoong/Sensa/actions/runs/40025345270) 与[候选 40025349090](https://github.com/SeaLoong/Sensa/actions/runs/40025349090) 通过 Web 检查，随后因 SDK 自动选择 10.0.402 而在锁定还原报 `NU1004`；后端测试和浏览器未执行。SDK 已固定为 10.0.401，后续单元检查成功。
- 同源码的 [Pages 40025344984](https://github.com/SeaLoong/Sensa/actions/runs/40025344984) 为 **12 通过、2 失败**。安装器测试再次导航到同一页面时未重载，改为显式重载后，[Pages 40026115999](https://github.com/SeaLoong/Sensa/actions/runs/40026115999) **14/14 通过并部署**；八张原图已逐张审阅。该源码的 [CI 40026116151](https://github.com/SeaLoong/Sensa/actions/runs/40026116151) 仍遇旧基线差异：**1 通过、3 失败、112 未执行**。
- [候选 40026140751](https://github.com/SeaLoong/Sensa/actions/runs/40026140751) 的 attempt 1、2 均在 Azure Ubuntu 镜像下载字体时超时；浏览器未启动，各结果计数均为 0，`runner=not-run`、命令跳过、完整选择与图片比较均为 false。现有安装流程在第二次尝试使用官方 HTTPS 镜像，并核对相同字体版本与 SHA-256；[CI 40028882526](https://github.com/SeaLoong/Sensa/actions/runs/40028882526) 已实际从首次超时恢复，61.2 MB 字体下载用时 4 秒，继续执行浏览器。
- 源码 `8d92eff` 的 CI 单元检查成功；其 CI、Pages 与候选随后主动取消，统一转到安装器测试修复后的源码。

## Unity 与实机范围

Unity Editor **2022.3.22f1** 的版本命令已运行成功，Windows Mono 支持及独立 Avatar／World 工程已安装。Avatar 使用 SDK **3.10.6-beta.3**、MA **1.18.7**、NDMF **1.14.8**、VRCFury **1.1434.0**；World 使用 SDK **3.10.5**。已同步本轮 185 个 Avatar／51 个 World 管理文件；各工程两次离线 VPM 安装的包内容一致，工具、锁定版本、源文件摘要与本地工程远端配置已检查。

实际批处理导入连接许可服务后，以 **“No valid Unity Editor license found”** 退出。Editor 编译、NDMF 构建、EditMode、Shader GPU 捕获、VRChat／HMD 和实际硬件仍待对应环境验证。浏览器图片展示实际运行的 WebUI，设备连接和测量数据使用隔离模拟；Unity 包检查验证分发结构。
