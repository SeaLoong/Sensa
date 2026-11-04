# 验证记录

**简体中文** | [English](e2e-status.en.md)

每项结果对应明确的源码、运行与 attempt。[当前 CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml) · [Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml) · [CodeQL](https://github.com/SeaLoong/Sensa/actions/workflows/codeql.yml) · [开发与检查](development.md)

## SPS3 Beta 兼容更新：c6a1ed14

源码 [`c6a1ed14`](https://github.com/SeaLoong/Sensa/commit/c6a1ed14aef7e7024cf2f9c4672e8ae2333bfb8b)，[候选运行 41927196979](https://github.com/SeaLoong/Sensa/actions/runs/41927196979/attempts/1)，attempt 1：

| 检查 | 实际结果 |
| --- | --- |
| 本地 Web／Node／Python 单元 | **440／1607／455 项通过** |
| 完整浏览器候选 | **254/254 项通过**，逐项单次执行，retry 为零，其他结果均为零 |
| 图片审阅 | **接受 25 张应用图和 6 张站点原图**；7 张应用候选仅有栅格差异、2 张指南候选未完整采集页脚，均保留旧图 |
| 文档图库 | **38 张镜像**与所选基线继续逐字节一致，保留原有 4b1／41905870856 采集来源 |

新增 22 项运行时单元和 12 项浏览器用例，覆盖公开 OGB 几何、来源／实例／Self／Others 隔离、估长与超时停止，以及 Socket 根标记 1 mm／0 mm 切换、窄屏和双语重绘、录制与脚本导出。[SPS3 使用说明](sps3.md)

候选使用 `snapshotsCompared=false`。选图后的[普通 CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)对固定图片提交执行完整 **254 项**比较，要求完整选择、实际比较、命令成功和其他结果为零；其报告另行记录六个平台的原生程序检查与预览发布。[逐图记录](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json)

本轮新增 37 项 Unity Editor 源用例（20 项根点兼容、17 项 GPU 数据与配置），尚未在 Unity 中执行。SPS3 探针使用真实 Unity 2022.3.22f1 头文件和 14 个固定上游依赖，经 DXC v1.9.2609 编译 `vert`／`frag` 两个 SM6 入口通过，使用 `sampler2D=sampler` 兼容宏；这是独立 HLSL 静态检查，Unity ShaderLab 导入和 GPU／VRChat 运行仍按各自实测记录。

## 布局更新与审图：4b1d9816

源码 [`4b1d9816`](https://github.com/SeaLoong/Sensa/commit/4b1d98167809214772a17ab02393a35311451c1f)，[候选运行 41905870856](https://github.com/SeaLoong/Sensa/actions/runs/41905870856/attempts/1)，attempt 1：

| 检查 | 实际结果 |
| --- | --- |
| Web／Node／Python | **431／1585／454 项通过** |
| 完整浏览器候选 | **242/242 通过**，每项单次执行，零失败、跳过、重试或未执行 |
| Pages | [34/34 通过并部署](https://github.com/SeaLoong/Sensa/actions/runs/41905627911)，167 项资源核对一致 |
| CodeQL | [四语言成功处理](https://github.com/SeaLoong/Sensa/actions/runs/41905628046)，35 条结果及 69 条数据流与上一源码无语义变化；扫描配置保持启用 |
| 逐图选择 | 接受 **116 张应用图、7 张站点原图**，9 张几何图及 1 张站点图保留旧图，候选分别存在微小栅格变化和采集裁边 |
| 文档图库 | **38 张镜像**与所选应用基线字节一致，采集来源为本轮固定源码与运行 |

新增布局回归覆盖双语轴切换、独立草稿、模式与限位保存、固定弹窗框架、正文滚动、地址与短端口对齐、长表单保存／取消及键盘焦点。完整套件还检查 390 和 320 CSS px 窄屏。

本轮为候选采集模式，`snapshotsCompared=false`。选图后，普通 CI 对图片提交完整执行 **242 项比较**，要求关闭基线更新、`selectionComplete=true`、`snapshotsCompared=true`、命令成功及其他结果为零。该固定提交的普通比较、六平台原生检查和预览结果记录在对应 [CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml) 报告中；更新图库后的部署记录在对应 [Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml) 运行中。

## 该轮布局的图片证据

[逐图记录](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json)保存 164 张应用基线和 8 张站点原图的所选摘要、候选摘要、具体观察、选择理由与历史链。其中 104 张新选图片按完整 SHA256 复用 956 源码下已打开的原图观察，保留其真实的[已取消运行](https://github.com/SeaLoong/Sensa/actions/runs/41899721755/attempts/1)及观察来源；当前成功采集／执行单独记录。其余新选图片已直接打开。站点原图保留采集当时的图库，后续部署检查更新后的文档图片。[图片审阅说明](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md) · [审阅流程](e2e.md)

## 布局更新前的已验收快照：665753a6

源码 [`665753a6`](https://github.com/SeaLoong/Sensa/commit/665753a6403d534de9a227844e8eb0d99ebbe6a2)，[CI #257](https://github.com/SeaLoong/Sensa/actions/runs/41884479633)，attempt 1，12 个作业全部成功：

| 检查 | 实际结果 |
| --- | --- |
| Web／Node／Python | **427／1585／454 项通过** |
| 完整普通浏览器比较 | **226/226 通过**，单次执行，其他结果为零 |
| 独立 Firefox／WebKit 兼容检查 | **8/8 通过** |
| Pages | [34/34 通过并部署](https://github.com/SeaLoong/Sensa/actions/runs/41884479336) |
| 原生包 | Windows、Linux、macOS，各 x64／ARM64 构建及隔离 CLI／Electron 检查通过 |
| 发布 | [开发预览 #257](https://github.com/SeaLoong/Sensa/releases/tag/preview-257-1-665753a6)，18 个公开资产 |

## 验证范围

自动套件覆盖回环 HTTP／WebSocket、隔离 PTY、模拟串口／BLE／WinRT、协议协商与任务生命周期、停止顺序、脚本／录制、计算映射、共享标签页、双语布局、下载和离线资源。原生检查运行实际打包程序，使用临时配置和模拟传输。

实体设备、厂商云、Unity 客户端和 VRChat／HMD 单独验收。已有 Unity Editor 2022.3.22f1 记录止于许可证验证，实际执行零项测试；17 项 Tracking Frame 源用例未执行，未产生 NUnit XML。

具体 GitHub 告警处置与扫描执行分别核对；当前无法访问的面板状态保持未知。[历史迁移候选](https://github.com/SeaLoong/Sensa/actions/runs/40996282389/attempts/1) · [更早的完整比较](https://github.com/SeaLoong/Sensa/actions/runs/40783839713)
