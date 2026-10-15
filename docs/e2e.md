# WebUI 端到端与截图测试

E2E 只在 GitHub Actions 的固定 Playwright Linux 容器运行。本机不启动浏览器测试，不连接真实设备。`npm run e2e:ci` 在非 GitHub Actions 环境会拒绝运行。

测试启动真实 Sensa 后端和实际 WebUI，使用临时配置。通过 UI 切换输入、保存、校准、播放脚本、启用输出和急停；不会 mock 掉 Sensa 的 HTTP/WS API。外部输入与设备是本地回环模拟器：

- OSC UDP：QuickStart 五档与门控、FT、SPS Root/Tip、PB 四点采样和抓取状态。
- 手动滑条、funscript 文件上传与播放；录制及导出。
- TCode UDP/TCP 接收器、Linux PTY 串口（含 D0/D1/D2 查询）、Buttplug v4 WebSocket 模拟服务器。
- OSCQuery HTTP 目录和 OSC Hub 目的端。

UI 截图与模拟设备收到的协议命令都要通过。仅截图不能证明真实命令已发出，也不能证明急停已发送；协议断言覆盖这部分。测试矩阵同时运行 1280×900 桌面和 390×844 窄视口；后者检查移动布局，不冒充手机真机。截图前移开鼠标并等待悬浮提示消失。串口测试不覆盖 Windows COM 驱动；真实蓝牙、机械设备、Unity/VRChat 客户端和 HMD 仍在此套件之外。

## 日常修改

1. 本地只跑静态检查、单元测试，提交推送。
2. 查看 `Validate and preview` 中的 `e2e / browser`。E2E 失败、取消或未运行，六平台构建和预发布都不会继续。正式桌面发布同样依赖 E2E。
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

这是一套主要使用流程的回归矩阵，不是对所有配置组合和真实硬件行为的穷尽证明。新增功能时应补对应输入、协议断言、UI 操作和截图检查点；不要仅增加一张空页面截图。
