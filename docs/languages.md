# 语言与自动识别

**简体中文** | [English](languages.en.md)

Sensa 提供简体中文和 English。语言只改变界面说明，不改 OSC 路径、参数名、数值文化、设备协议或用户输入的名称。用户数据和诊断原文不会被猜测翻译。

## 浏览器应用与参数图解

按以下顺序使用第一个受支持的语言：

1. URL 的明确 `?lang=`。
2. 当前来源的 `localStorage["sensa.locale"]` 明确选择。
3. 按顺序检查完整 `navigator.languages`，再检查 `navigator.language`。
4. 没有匹配项时使用 English。

大小写和下划线会规范化；`en_GB` 等英语地区值归为 `en-US`，`zh-TW`／`zh-Hant`／`zh-HK` 等中文归为 `zh-CN`，显示简体译文。不支持的条目继续尝试下一优先级；不是把任意未知地区误判为中文。存储不可读／不可写时仍可运行，明确选择在当前页面有效。

手动切换会保存规范语言；若 URL 已有 lang，同时更新该值，避免刷新后旧 URL 覆盖新选择。切换不重置映射草稿、脚本、参数场景、坐标或选中项，也不发送设备动作。浏览器存储按来源隔离，应用、Pages 与 file 页面不保证共享偏好。

[在线参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)独立于 Sensa，自动识别并支持 [English](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US)／[中文](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)。发行包内的同一 HTML 可离线使用，浏览器可能限制 file 页的持久存储。

## 文档入口

- 根及工具的 `README.md` 是英文正文，`README.zh-CN.md` 是完整中文，`README.en.md` 仅作英文入口别名。
- 普通指南继续使用 `*.md` 中文、`*.en.md` 英文；源码路径不因默认入口变化而批量改名。
- [文档站](https://sealoong.github.io/Sensa/)将这些文件渲染为 `/en/` 与 `/zh-CN/` 路由。明确语言路径优先于自动识别，语言切换跳转对应文档。
- 应用内图解链接仍指向本地随包 HTML 并携带当前语言。在线图解的文档链接进入本站；本机 file 页面保留相邻 Markdown 链接。

## Unity 编辑器与 Avatar 菜单

Sensa 编辑器提供 **Auto／English／简体中文**，明确偏好存于 Unity EditorPrefs。Auto 优先编辑器实际 UI 语言；无法读取时用系统语言，不支持的语言回退 English。简繁中文均显示简体。语言不改变序列化字段、资产身份或协议参数。

Avatar Expression Menu 的文字在**构建时**按编辑器所选语言生成。它不是上传后逐玩家自动翻译；修改语言后需要重新构建／上传，已有用户资产也不会因偏好切换自动重写。

## World Lab 本地语言

World Lab 用 `VRCPlayerApi.GetCurrentLanguage()` 和 `OnLanguageChanged` 自动选择本地语言；不支持时回退英语，中文变体显示简中。**Sensa Lab Language** 面板提供 Auto／English／简体中文；明确选择通过本地玩家标签优先于自动识别，仅作用于当前客户端会话，不跨会话持久保存、不全局同步，也不发 OSC 或设备指令。

实际 API 签名已在 Worlds SDK **3.10.5** 核对；安装的 SDK 必须暴露这些 Udon 语言 API，不假定更老版本支持。

六类动态 HUD 用 UGUI `Text` 翻译已知界面短语，保留英文测量／状态源和技术标识。静态 `TextMesh` 使用另一条路径：编辑器保留原对象、Transform、身份和原文，禁用原 Renderer，生成英／中文显示子对象。运行时只用 `SetActive` 切换子对象，不读写 `TextMesh.text`，也不逐帧轮询静态文字。

**Tools → Sensa Lab → Refresh display language - 刷新显示语言** 明确升级打开的场景。**Validate localization (Editor only)** 只做 Udon 编译与纯编辑器呈现断言，不生成用户实验场景、不进入 PlayMode、不操作设备。源码、编译和 EditMode 结果不等于上传 VRChat、客户端字体／布局或 HMD 可读性验收。

## 维护规则

新增用户文本应同步中英；标识符与原始异常保留原文。测试分别验证规范化、优先级、存储受限与切换保留状态；实际浏览器结论以对应 CI 报告为准。[开发流程](development.md) · [使用指南](guide.md)
