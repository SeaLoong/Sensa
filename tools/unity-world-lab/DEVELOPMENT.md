# 世界实现与验证

**简体中文** | [English](DEVELOPMENT.en.md)

[安装与语言](README.zh-CN.md)。受管源位于仓库相对路径 `tools/unity-world-lab/{Editor,Runtime}`，生成场景／资产位于目标工程 `Assets/SensaLab`。安装保护本地修改和已有场景；独立工程保持本地、不设置 Git 远端。

## 呈现与运行时边界

编辑器语言影响工具界面和新生成标题。世界自动语言使用 `VRCPlayerApi.GetCurrentLanguage()` 与 `OnLanguageChanged`，已在 Worlds SDK 3.10.5 核对；安装的 SDK 必须暴露这些 Udon API，不假定旧版本兼容。本地玩家标签的会话偏好优先，语言不同步。

六类动态 HUD 通过 UGUI `Text` 翻译已知短语，保留英文状态／测量源。所核 SDK 的 Udon 不暴露 `TextMesh.text`，因此静态 TextMesh 保留原名／Transform／ID／原文并禁用原 Renderer，由编辑器生成英／中文显示子对象；运行时只用 `SetActive` 切显隐，不逐帧轮询静态文字。

本地化保留原对象、参数路径、事件方法、诊断 JSON 键和 fixture 状态；用户名称和未知技术文本保持原文。

运行时 Udon 只用 SDK 支持的 API，不反射编辑器类型、不创建任意库对象。静态／烘焙 Avatar 标签是作者资产，需明确重新生成或升级，不是运行时翻译。

原生 SDK CalculateProximity 对明确已知 Sender 采样。Udon GPU 回读验证 CRC、报告本地年龄／回调滞后，不是外部捕获延迟。PhysBone 站将抓取、原生标量和局部几何分开；实际 Avatar OSC 仍需另行上传并穿戴头像。

## 材质隔离

Shader 与几何站通过禁用、无网格 Renderer 的 `Renderer.material` 获取独立运行时编码材质。Udon 不能使用 `new Material(...)`，序号／CRC 写入不得修改共享资产。

明确执行 **Upgrade isolated encoder materials** 更新旧场景绑定；临时验证检查实例隔离与材质内容恢复。生成器和几何检查不得覆盖原场景，也不能静默补造缺少的站点。

## 独立 Point 几何用例

以下十一项采用独立本地点框架，**不是**固定 SPS P0–P3：

| 用例 | 基准 | 预期 |
| --- | --- | --- |
| Front | (.02,−.03,.10) | 有效 |
| Behind | Z=−.10 | 有效，不镜像 |
| Lateral | X=.13、Y=−.05 | 有效 |
| No contact | Z=.60 | 无效 |
| Saturation | Sender 在接收器中心 | 无效 |
| Wrong radius | Sender .04，而非 .001 | 按固定模型拒绝 |
| Scale ×2 | 参考框均匀缩放 | 局部坐标不变 |
| Rotated frame | (15°,35°,10°) | 局部坐标不变 |
| Missing P4 | 明确缺少 A3 | 无效 |
| Beyond fit volume | Z=.26 | 即便有值仍无效 |
| Origin | 原点 | 有效 |

Case 09 的 −1 是注入缺数据，不是 SDK 近接断言。各用例使用独立标签和明确 Sender；低残差或已知 fixture 身份不证明多人客户端行为。

抓取后探索，复位恢复基准，暂停冻结读数，Missing P4 注入／恢复缺路。辅助标记显示中心，不是物理 Contact 半径；控制和位置本地有效，无 Object Sync。

## 检查与报告

**Tools → Sensa Lab → Validate localization (Editor only)** 只做 Udon 编译与纯编辑器呈现检查，不生成用户实验场景、不进入 PlayMode、不操作设备。结果以实际修订的报告为准，不是客户端、字体／字形或 HMD 验收。

本机可运行包单元／EditMode。自动世界 PlayMode、完整进程冒烟、浏览器检查和全部截图仅在 Actions；不能把历史采集菜单当本机自动化替代。手动私有客户端探索是独立活动。

历史 `Validation/` 报告包含几何、材质隔离、本地控制事件和模拟移动。临时烘焙场景引用 VRCFury 临时资产，必要时应重建。脚本事件不模拟真人抓取，模拟控制器移动也不证明真实键盘／HMD。

`tests/Sensa.Tests/Fixtures/unity-point-cases.json` 保存已记录 SDK 样本，用于离线解算一致性；该 fixture 的小误差阈值不是实时精度上界。以实际修订的凭据和日志为准，不沿用历史测试总数或 PNG 名称。

桌面校准观察数据并生成草稿，不启用输入。固定根与 Shader 各用自己的单位和时效；观测无效时保留端点，但不能生成有效动作目标。

仍需真实客户端测试：语言／字体覆盖、抓取／松开、快速切换、多个同标签 Sender、缩放、OSC 丢包／乱序、相机／Shader 保留、HMD 可见性与物理校准。工具不会自动连接设备或上传。

[能力](CAPABILITIES.md) · [主验证策略](https://github.com/SeaLoong/Sensa/blob/main/docs/development.md)
