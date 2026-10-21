# Sensa Avatar 实验工具

[English](README.md) | **简体中文**

本地、无设备的作者测试工具，用于独立检查 SPS、PB、Contact 和渲染链路。综合 fixture 使用 `Assets/SensaAvatarLab/Generated/FullFlow.unity`；隔离问题使用[能力场景](CAPABILITIES.md)。它不是最低开销的日常 Avatar，也不证明上传客户端已验证。

[参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)可在不加载 Avatar 或设备的情况下解释几何；仓库和桌面 ZIP 保留离线 HTML。

## 安装到自己的工程

1. 准备 **Avatars** 工程，使用 SDK 支持的 Unity、官方 VRCFury、Modular Avatar／NDMF，以及授权模型所需 Shader。
2. fixture 模板要求 `Assets/Amatousagi/Chocolat/Chocolat.prefab` 和 `Assets/SeaLoong/SPS_Lollipop/SPS_Lollipop.prefab`；请自行导入授权资源，本仓库不分发它们。
3. 关闭 Unity，在 Sensa 仓库执行：

```shell
python -X utf8 scripts/install-avatar-lab.py "<Avatar project>" --tests
```

4. 重新打开并执行 **Tools → Sensa Avatar Lab → Create authoring scenes**。已有场景和本地修改的受管源码受到保护，不会静默覆盖。

模板源位于 `tools/unity-avatar-lab/Editor`，安装源码和生成资产位于 `Assets/SensaAvatarLab`。工程保持本地，不将授权模型、纹理、日志或凭据推到 Sensa。工具不执行上传。

## 语言与菜单

编辑器工具自动优先采用 Editor 界面语言，API 不可用时用系统语言；不支持的语言回退英语。显式 English／简体中文偏好本地持久保存，入口以安装后的 Sensa 编辑器语言控件为准。

菜单路径保留稳定英文 ID，便于自动化调用。生成的 Avatar 菜单和烘焙可见文字使用作者／构建时语言；更改偏好不会让已上传 Avatar 按每个穿戴者单独翻译。用户对象名、实例名和参数 ID 不变。

## 选择 fixture

| 场景 | 用途 |
| --- | --- |
| Generated/FullFlow.unity | [综合交互路线](FULL-FLOW.md) |
| Generated/Exclusive.unity | 每次一个测量目标，初始关闭 |
| Generated/Dedicated.unity | 同时独立测量；在 Sensa 固定准确来源 |
| Capabilities/* | Contact、PB、SPS 和 Shader 分项 |
| Capabilities/QuickStart.unity | 隐藏合成传输 fixture，不是产品入门路线 |

原生 SPS、OGB_ENABLED、测量选择、道具可见性和桌面输入相互独立。棒棒糖和合成 Shader 初始关闭。安装 Gesture Manager 后可用它预览，但不能代替真实客户端抓取或 OSC。

## 检查与边界

包 EditMode 检查几何、参数、选择和作者行为。SDK 预处理使用克隆；明确的 **Build … with SDK (no upload)** 命令生成本地包。`Validation/` 报告和 `Builds/` 包只对应所记录修订，不自动代表当前结果。

发布 CI 执行单元、浏览器 E2E 和隔离原生冒烟；Avatar 的 Unity／EditMode／PlayMode 与私有客户端行为需另行检查。切换路线前保持输入关闭、输出为空，工具不会连接硬件或自动上传。

[FullFlow](FULL-FLOW.md) · [能力矩阵](CAPABILITIES.md) · [Unity 包](../../unity/top.sealoong.sensa/README.zh-CN.md)
