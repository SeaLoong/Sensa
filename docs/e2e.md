# E2E 与截图审阅

**简体中文** | [English](e2e.en.md)

浏览器 E2E、自动截图与完整进程冒烟仅在 GitHub Actions；不要在本机运行或伪造 CI 环境。日常本地检查使用 `scripts/verify.py` 的影响计划和 receipt。

## 测什么

E2E 启动真实 Sensa 与真实 WebUI，每个场景使用独立临时配置。设备和外部服务用回环模拟器：OSC UDP、TCode UDP／TCP、Linux PTY 串口、Buttplug WebSocket 和 OSCQuery。HTTP／WS 控制不替换为假实现。

回归重点包括控制／OSC／设置导航、手动与录制、QuickStart 五档和门控、FT 前缀、预设与映射、脚本暂停／定位、轴配置与冲突、输入切换／脚本替换许可、实验默认阻断／显式开启／过期停止、双语持久化和草稿保留。功能判断同时核对界面状态与模拟传输命令；截图不能单独证明设备停止。

桌面 1280×900 与窄屏 390×844 使用固定 Playwright Linux 容器、字体、语言和时区。窄视口不等于真手机；PTY 不等于 Windows 驱动。Unity、上传后 VRChat、头显和真实硬件不在这套浏览器验证内。[测试源码](https://github.com/SeaLoong/Sensa/tree/main/tests/e2e)、[固定环境](https://github.com/SeaLoong/Sensa/blob/main/playwright.config.js)

## 正常变更

1. 运行受影响本地静态／单元检查，提交推送。
2. 查看必要主 CI 的浏览器比较；没有未完成产品验证时，纯文档／纯单元测试不会重复产品链。
3. 失败时下载 `e2e-report`，检查 expected／actual／diff、trace、服务日志和 `mock-wire.json`。
4. 行为错误修实现；只有已审阅且有意的视觉变化才更新基线。不要重试掩盖失败。

普通比较禁止自动更新基线，缺少基线同样失败。预发布只接受同一候选 SHA 的正常全量比较，候选基线任务不提供发布凭据。

## 生成候选基线

重做布局或基本控件时，在 GitHub Actions 手动运行 **WebUI E2E and screenshots**，设置 `update_snapshots=true`：

```shell
gh workflow run e2e.yml --ref <branch> -f update_snapshots=true
```

这是远端生成命令。等待功能断言通过，再下载 `e2e-baselines` 并逐张核对布局、可读性、溢出、展开区、对话框和错误状态。下载 artifact 不等于批准；失败任务的部分截图不能直接作为基线。

审阅后将相应 desktop／mobile PNG 放入 `tests/e2e/__screenshots__/`，与实现一起提交。再由普通全量比较确认。候选任务不发布 Release，也不会自动写回 Git。

截图只遮蔽不稳定时间／运行地址，不隐藏输出目标、门控或错误。超高区域按真实滚动位置分段捕获；Playwright／容器升级需要重新审阅。实际测试结果和图像结论以对应提交的 Actions 报告为准。

[开发流程](development.md) · [架构](architecture.md)
