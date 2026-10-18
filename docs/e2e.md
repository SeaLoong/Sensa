# WebUI 端到端与截图测试

**简体中文** | [English](e2e.en.md)

E2E 只在 GitHub Actions 的固定 Playwright Linux 容器运行。本机不启动浏览器测试，不连接真实设备。`npm run e2e:ci` 在非 GitHub Actions 环境会拒绝运行。

测试启动真实 Sensa 后端和实际 WebUI，使用临时配置。通过 UI 切换输入、保存、校准、播放脚本、启用输出和急停；不会 mock 掉 Sensa 的 HTTP/WS API。外部输入与设备是本地回环模拟器：

- OSC UDP：QuickStart 五档与门控、FT、SPS Root/Tip、PB 四点采样和抓取状态。
- 手动滑条、funscript 文件上传与播放；录制及导出。
- TCode UDP/TCP 接收器、Linux PTY 串口（含 D0/D1/D2 查询）、Buttplug v4 WebSocket 模拟服务器。
- OSCQuery HTTP 目录和 OSC Hub 目的端。

UI 截图与模拟设备收到的协议命令都要通过。仅截图不能证明真实命令已发出，也不能证明急停已发送；协议断言覆盖这部分。测试矩阵同时运行 1280×900 桌面和 390×844 窄视口；后者检查移动布局，不冒充手机真机。截图前移开鼠标并等待悬浮提示消失。串口测试不覆盖 Windows COM 驱动；真实蓝牙、机械设备、Unity/VRChat 客户端和 HMD 仍在此套件之外。

## 日常修改

1. 本地只跑静态检查、单元测试，提交推送。
2. 查看 `Validate and preview` 中的 `e2e / browser`。E2E 失败、取消或未运行，六平台构建和预发布都不会继续。桌面 tag 发布和 Unity tag 发布同样依赖 E2E；Unity 的手动只读打包验证不发布，因此不重复启动浏览器。
3. 下载 `e2e-report`，打开 HTML 报告，检查 expected / actual / diff、失败截图、trace、服务日志和 `mock-wire.json`。
4. 若行为或布局错误，修代码。若是确认过的预期 UI 改动，才生成候选基线。

## 在 CI 生成候选基线

在 GitHub Actions 打开 **WebUI E2E and screenshots → Run workflow**，选择修改所在分支，勾选 `update_snapshots`。也可在本地执行以下命令，它们只触发远端任务：

```shell
npm run e2e:request
npm run e2e:baselines
# 指定分支
gh workflow run e2e.yml --ref <分支> -f update_snapshots=true
```

候选基线任务仍执行真实功能断言，但不发布 Release，也不自动写回 Git。只有整次任务成功后，才下载 `e2e-baselines`；逐张检查后将 desktop/mobile 目录复制到 `tests/e2e/__screenshots__/`，与对应代码一起提交。然后等待普通 CI 使用新基线比较通过。

正常比较使用 `updateSnapshots: none`，缺少基线也会失败。请勿在普通 CI 使用 `--update-snapshots`，也不要复制失败任务的部分截图来消除红色。

Playwright、Chromium 容器版本、视口、语言和时区固定。截图只隐藏发送时间、OSC 时间戳和运行时串口地址，不隐藏轴目标、门控、错误或校准值。更新 Playwright 版本时，要同时更新容器版本并重新审阅全部基线。

超过屏幕高度的区域会在 CI 中实际滚动并分段拍摄视口，保存为 `*-part-1.png` 等文件；避免把滚动容器裁掉的空白区域当成有效基线。较小的面板和对话框直接截图。

这是一套主要使用流程的回归矩阵，不是对所有配置组合和真实硬件行为的穷尽证明。新增功能时应补对应输入、协议断言、UI 操作和截图检查点；不要仅增加一张空页面截图。

## 已纳入的回归矩阵

九项主要流程、三项英文流程和两项输入安全流程分别在桌面、窄屏运行，共 28 个场景。模拟对端按 worker 复用，每个场景仍有独立的临时配置和程序进程；模式切换与脚本替换不续动、暂停定位和停止语义都有独立断言。英文覆盖浏览器默认语言、切换与持久化、草稿不丢失、切换不发控制请求、PB 校准/模拟输出/松手停止，以及预设帮助和文档链接。正常 CI 不重试失败测试；累计三项失败会提前停止，后续未运行不能算通过。

| 流程 | 行为断言和截图 |
| --- | --- |
| 手动与录制 | 四个模拟传输的启用、滑条目标、funscript 导出、急停命令、恢复不自动启动 |
| QuickStart / FT | 五档真实 UDP 值、TCP/UDP 输出量程、FT 默认隐藏与显示、Active 门控停止 |
| PB 校准 | 四点样本、两端采集、替换旧门控、保存关输入、刷新持久化、松手停止 |
| 原生 SPS | Root/Tip 长度学习、径向偏移估计与输出目标 |
| Funscript | 文件上传、循环设置、播放/暂停、关键帧步进、卸载 |
| 配对 Pose | 24 路样本、空间可视化、生成映射、丢失一个标记后停止 |
| 配置与帮助 | 帮助和预设筛选、输出改名、新增/删除、重复地址拒绝保存、轴配置保存 |
| OSCQuery / Hub | HTTP 目录、界面开启轮询回退、真实 UDP 转发、界面停止轮询 |
| 会话与输入关闭 | 无 Cookie 拒绝访问、跨源拒绝、关闭输入时不能向模拟设备发运动命令 |

OSCQuery LISTEN、所有曲线/轴组合、网络硬故障和每一种设备固件不在这 28 个场景中；已有单元测试及各平台 HTTP/WS/Shader 冒烟继续保留，后续按实际问题补覆盖。
