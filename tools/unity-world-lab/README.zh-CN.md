# Sensa World 实验工具

[English](README.md) | **简体中文**

无设备的 **Worlds** 测试工具，包含已知 Contact 几何、PB、原生 SPS 和合成渲染诊断。分项功能打开 `Assets/SensaLab/Functional/FunctionalLab.unity`；几何边界用例在 `Generated/SensaLab.unity`。

世界 Transform 真值和看板不等于 Avatar OSC 已接收；检查 Avatar 路线时需另行构建并穿戴测试头像。**00 START HERE** 只是保留的合成 QuickStart 测试台，不是产品安装步骤，也不要求桌面产品预设。

## 安装与语言

使用符合 SDK 的 Unity／Worlds 工程、UdonSharp，以及场景所需的官方 VRCFury。不要安装完整 Avatars 组件包。将占位符替换为自己的本地目录：

```shell
python -X utf8 scripts/install-world-lab.py "<World project>"
```

仓库模板位于 `tools/unity-world-lab/{Editor,Runtime}`，安装后管理 `Assets/SensaLab` 和所需共享源码。安装器拒绝覆盖冲突的本地修改，也不覆盖生成场景。独立世界 Git 仓库保持本地，不配置远端。

编辑器与 Sensa 作者界面共用 `auto/en-US/zh-CN` 偏好：先实际 Editor 语言，API 不可用时用系统，不支持则英语。语言选项在 **Tools → Sensa Lab → Language**；已有菜单 ID 保持英文。

新生成世界文字带本地呈现层。运行时自动读取 VRChat 当前语言并响应语言变化，中文变体归简中，其余回退英语。本地 **Sensa Lab Language** 面板提供 Auto／English／简体中文；显式选择只作用于当前客户端会话，不跨会话持久保存，也不全局同步。

已在 Worlds SDK **3.10.5** 核对 `VRCPlayerApi.GetCurrentLanguage()` 和 `OnLanguageChanged`；所装 SDK 必须暴露这些 Udon API，不假定旧版本支持。

六类动态 HUD 使用 UGUI `Text`。静态 `TextMesh` 保留原对象／名称／Transform／原文并禁用原 Renderer；编辑器生成英／中文显示子对象，运行时只切显隐，不逐帧轮询静态文字，也不访问 `TextMesh.text`。

已有打开场景可明确执行 **Tools → Sensa Lab → Refresh display language - 刷新显示语言** 绑定／升级显示；仅安装源码不会重写保存场景。语言按钮不移动 fixture、不改变测量、不发送 OSC。上传客户端的字体、布局和语言行为仍需手工验证。

## 操作

道具提供 LEFT／RIGHT／PLACE／HOME；直接抓起会退出随手模式。**08 MY AVATAR SPS** 的琥珀色 Plug 测自己的 Socket，蓝色 Socket 测自己的 Plug。Avatar 原生 SPS 和 OGB_ENABLED 必须另行启用。

几何站有复位、暂停和注入缺采样控制；可见抓取球大小不等于 Contact 半径。P1–P4、C1–C8 是采用 A0 字段的独立实验布局，不是 SPS 四点定位 P0–P3 或 TCode 辅助轴。

| 读数 | 含义 |
| --- | --- |
| Truth | 本世界可读取的参考局部 Transform |
| Decoded | 按已知几何重建的估计 |
| RMS | 拟合一致性，不是实测精度 |
| 有效／无效 | 解算／门控状态，独立于原始近接条 |
| EXPLORING | fixture 已离开复位基准 |

## 证据与限制

[能力说明](CAPABILITIES.md)区分原生标量、已知几何估计和诊断编码；[开发说明](DEVELOPMENT.md)描述生成器与报告；[相机原型](CAMERA-PROTOTYPE.md)是另一条合成实验。

发布 CI 包含单元、浏览器 E2E 与隔离原生冒烟；Unity／World PlayMode 和真实客户端需另外检查。静态、隔离单元和 EditMode 不证明 VR 抓取、上传 OSC、HMD 可见性、桌面捕获或硬件。fixture 是本地、无 Object Sync 对象，不会自动发送设备动作。输出实验保持关闭，测试时明确逐个启用。

[参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)可独立在线使用，仓库和桌面 ZIP 保留离线页面。
