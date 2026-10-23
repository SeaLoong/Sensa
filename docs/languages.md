# 语言与自动识别

**简体中文** | [English](languages.en.md)

Sensa 提供简体中文和 English。语言切换用于界面说明；OSC 路径、参数名、数值格式、设备协议和用户输入的名称保持原有值与格式。用户数据和诊断消息按原文显示，便于核对来源。

## 浏览器应用与参数图解

按以下顺序使用第一个受支持的语言：

1. URL 的明确 `?lang=`。
2. 当前来源的 `localStorage["sensa.locale"]` 明确选择。
3. 按顺序检查完整 `navigator.languages`，再检查 `navigator.language`。
4. 没有匹配项时使用 English。

大小写和下划线会规范化；`en_GB` 等英语地区值归为 `en-US`，`zh-TW`／`zh-Hant`／`zh-HK` 等中文归为 `zh-CN`，显示简体译文。遇到其他语言时继续尝试下一优先级。存储不可读／不可写时，明确选择仍在当前页面有效。

手动切换会保存规范语言；若 URL 已有 lang，同时更新该值，让刷新后的页面沿用新选择。切换时保留映射草稿、脚本、参数场景、坐标、选中项和设备状态。浏览器存储按来源隔离，应用、Pages 与 file 页面分别保存自己的偏好。

[在线参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)独立于 Sensa，自动识别并支持 [English](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US)／[中文](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)。发行包内的同一 HTML 可离线使用，浏览器可能限制 file 页的持久存储。

## 文档入口

- 根及工具的 `README.md` 是英文正文，`README.zh-CN.md` 是完整中文，`README.en.md` 仅作英文入口别名。
- 普通指南继续使用 `*.md` 中文、`*.en.md` 英文；源码路径不因默认入口变化而批量改名。
- [文档站](https://sealoong.github.io/Sensa/)将这些文件渲染为 `/en/` 与 `/zh-CN/` 路由。明确语言路径优先于自动识别，语言切换跳转对应文档。
- 应用内图解链接仍指向本地随包 HTML 并携带当前语言。在线图解的文档链接进入本站；本机 file 页面保留相邻 Markdown 链接。

## Unity 编辑器与 Avatar 菜单

Sensa 编辑器提供 **Auto／English／简体中文**，明确偏好存于 Unity EditorPrefs。Auto 优先编辑器实际 UI 语言；无法读取时用系统语言，其他语言回退 English。简繁中文均显示简体，序列化字段、资产身份和协议参数保持原有内容。

Avatar Expression Menu 的文字在**构建时**按编辑器所选语言生成，上传后各玩家看到同一套菜单。要更新菜单语言，请修改编辑器偏好后重新构建／上传；已有用户资产保留原样。

## World Lab 本地语言

World Lab 用 `VRCPlayerApi.GetCurrentLanguage()` 和 `OnLanguageChanged` 自动选择本地语言；其他语言回退英语，中文变体显示简中。**Sensa Lab Language** 面板提供 Auto／English／简体中文。明确选择通过本地玩家标签优先于自动识别，作用范围是当前玩家的客户端会话；新会话重新按自动识别选择。其他玩家的语言和 OSC／设备状态保持各自原有状态。

实际 API 签名已在 Worlds SDK **3.10.5** 核对；安装时请确认 SDK 提供这些 Udon 语言 API。更老版本的兼容性需单独核验。

六类动态 HUD 用 UGUI `Text` 翻译已知界面短语，保留英文测量／状态源和技术标识。静态 `TextMesh` 由编辑器生成英／中文显示子对象，同时保留原对象、Transform、身份和原文，并禁用原 Renderer。运行时通过 `SetActive` 切换显示子对象，静态文本内容在编辑器生成时确定。

**Tools → Sensa Lab → Refresh display language - 刷新显示语言** 用于升级打开场景的语言显示。**Validate localization (Editor only)** 的检查范围是 Udon 编译与纯编辑器呈现断言，保留用户实验场景、播放状态和设备状态。上传 VRChat 后，还需检查客户端字体、布局和 HMD 可读性，并单独记录结果。

## 维护规则

新增用户文本应同步中英，标识符与原始异常保留原文。CI 通过隔离单元和浏览器 E2E 检查语言规范化、优先级、存储受限与状态保留；具体结论以对应提交的实际报告为准。字体和布局通过实际页面审阅确认。[开发与发布](development.md) · [使用指南](guide.md)
