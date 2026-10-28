# 验证记录

**简体中文** | [English](e2e-status.en.md)

本页记录固定源码已经完成的检查，不把历史结果当作后续改动的验收。较早的失败定位、修复过程和原始检查范围保存在[固定历史记录](https://github.com/SeaLoong/Sensa/blob/0bf1a8e95ff5f191dec03603c28fb983e3b69ad1/docs/e2e-status.md)。当前源码的结果请查看 [main 分支 CI 运行](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml?query=branch%3Amain)。工作流操作见[开发与发布](development.md)与 [E2E 维护](e2e.md)。

## 已归档验收：0bf1a8e9（2026-10-29）

固定源码为 [`0bf1a8e95ff5f191dec03603c28fb983e3b69ad1`](https://github.com/SeaLoong/Sensa/commit/0bf1a8e95ff5f191dec03603c28fb983e3b69ad1)。[主分支 CI 40768992258，attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/40768992258/attempts/1) 已依次完成单元、完整普通浏览器比较、六平台构建与隔离冒烟、Unity 打包及预览发布。

| 范围 | 该固定源码的实际结果 |
| --- | --- |
| Web 单元 | **240/240 通过**，失败和跳过为 0 |
| .NET 单元 | **1081/1081 通过**，独立核对全部 TRX 执行结果，失败和跳过为 0 |
| Python／脚本 | **389/389 通过**，失败和跳过为 0 |
| 完整普通 E2E | **144/144 通过**，桌面／窄屏各 72 次，含 28 次协议执行；失败、跳过、未执行、中断、flaky 与重试均为 0 |
| 原生构建／冒烟 | Windows、Linux、macOS 的 x64／ARM64 **六平台全部通过**；另完成 Unity 包 |
| Windows 分发形式 | 两种架构的便携、单文件、安装后程序全部通过；安装／重装／卸载及配置／录制保留通过 |
| 真实 Windows 依赖 | 两种架构的 WinRT／Bleak 八个命名空间导入及 `01f40064` 缓冲区往返通过；未枚举适配器、创建 GATT 服务或广播 |
| 发布文件 | [开发预览版 #210](https://github.com/SeaLoong/Sensa/releases/tag/preview-210-1-0bf1a8e9) 的 **12 个文件**实际字节匹配官方 SHA-256 与 `SHA256SUMS.txt`；六份 BUILD-INFO、54 份桥工具文件和 169 份 Unity 源码匹配固定构建来源（仅允许计划内的 Unity 版本改写） |

普通 E2E 报告为 `suite=all`、`mode=comparison`、`selectionComplete=true`、`snapshotsCompared=true`，命令及比较验证步骤均成功。原始结果逐项核对为 144 个唯一执行、每项一次尝试。候选截图成功、单独站点过滤检查或旧源码的 116 项结果均不能代替这一完整比较。

## 协议、输入输出与停止检查

该提交覆盖 Buttplug v3/v4、TCode TCP／UDP／串口、Intiface WSDM、JSON HTTP／WebSocket 和厂商兼容输入，以及厂商实时／脚本输出、Intiface 显式执行器映射与可选串口／BLE 桥。[操作范围与限制](protocol-inputs.md)

单元与集成检查使用真实回环 HTTP／WebSocket、隔离 PTY、模拟串口／BLE／WinRT 和注入时钟，覆盖单来源控制会话、原子命令批次、每轴时长、到达后租约、断线／非法 TCode、停止屏障、配置回滚、脚本取消和关机。绑定失效的 `StopValue` 与整机停止分别验证：位置轴的停止值是备用目标，可能产生运动；关闭输入、停用输出与急停走整机停止路径。

浏览器协议检查覆盖网站／播放器到模拟 TCode、控制会话竞争、组合计算、双语配置、旋转设备映射，以及脚本准备阻塞时的停止／急停和迟到结果不续动。两份 Contact 附件均完成丢失、冻结与停止断言；截图阶段明确保持 0.210 m/s，后续冻结 Sample 阶段实际发送 10 种不同速度。实际 SDK 客户端、网站、厂商云和硬件仍需独立验收。

## 图片审阅与文档站

[完整候选 40756483229，attempt 1](https://github.com/SeaLoong/Sensa/actions/runs/40756483229/attempts/1) 固定 `aea5ef3f`，实际 144/144 通过，candidate 模式不作图片比较。导出补丁、原图提交 `30a8dd6d` 与全部 172 张 PNG 摘要匹配。13 张新原图逐张打开审阅；10 张复用本轮已打开且字节相同的原图，149 张复用既有逐图记录中的相同摘要。38 张文档图片同步采用该候选，其中 4 张字节变化。[逐图审阅凭据](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json)

上述普通主分支比较实际使用这些已审图片，八张站点原图仍与已审候选逐字节相同。Contact 测试只固定截图阶段的输入，后续活动冻结与停止断言仍完整执行；未放宽图片门槛、删除安全断言或增加重试。

[Pages 40768992056](https://github.com/SeaLoong/Sensa/actions/runs/40768992056) 固定同一 `0bf1a8e9`，构建、站点比较和部署成功：**14/14** 通过，96 条路由、149 项资源。构建／线上清单来源一致，38 张文档图片及选取的 9 个 HTML／JS／CSS 资源实际字节与摘要一致。站点报告为 `suite=site`、`selectionComplete=false`、`snapshotsCompared=true`；它证明已部署站点，不能计为完整应用覆盖。

[截图来源与审阅流程](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md) · [运行画面](screenshots.md)

## 静态分析与扫描边界

同源码的 [CodeQL 40768992078](https://github.com/SeaLoong/Sensa/actions/runs/40768992078) 已完成四语言上传及结果处理。C# manual 构建独立核对 **240/240** Git 跟踪源码，调用目标和类型识别均为 **100%**，低质量诊断为 0，原有 85% 门槛保留。完整 SARIF 身份与原始数据流和已审主分支 `aea5ef3f` 一致。

扫描成功不等于 GitHub 告警已关闭，也不能据此推断不可访问面板的当前告警数或开关状态。扫描配置、测试覆盖和审计门槛保持原要求；具体告警处置以各条记录与证据为准。[扫描配置与迁移](development.md#扫描与工作流依赖维护)

## Unity 与实机范围

保存的实验工程记录锁定 Avatar SDK／Base **3.10.6-beta.3**、MA **1.18.7**、NDMF **1.14.8**、VRCFury **1.1434.0**；World 锁定 SDK／Base **3.10.5**，不含 Avatar SDK。World 保持本地仓库，无远端或推送。vrc-get 1.9.3 的上游摘要、重复解析的包文件摘要及受管理实验文件曾逐项核对，详情见固定历史记录。

最新保留的 Unity Editor 2022.3.22f1 隔离 EditMode 尝试因 **“No valid Unity Editor license found”**／`License is not active (com.unity.editor.headless)` 退出：**执行 0 项，17 项 Tracking Frame 源码用例未运行**，未生成 NUnit XML。这是该次尝试的证据，不代表当前许可状态或后续导入已通过。真实 Unity 导入、NDMF 构建、World PlayMode、Shader GPU 捕获、VRChat／HMD、蓝牙与其他硬件均未验收。

CodeQL 的真实 Unity／SDK 引用编译、包结构检查、模拟进程和浏览器检查各自验证其范围。发布文件可下载、依赖可导入或模拟停止通过，均不能替代对应实体设备的行程、方向、时延和停止验收。后续源码以其自身 Source 提交的 [CI 运行](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml)和附件为准。
