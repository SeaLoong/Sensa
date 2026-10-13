# Sensa Unity world laboratory

This is a device-free PC Worlds test harness. Open `Generated/SensaLab.unity`.

- Enter Play Mode / ClientSim to animate the root marker, calculate actual SDK Contact proximity, and run Udon GPU readback with CRC validation.
- The left small cube pauses motion; the right cube toggles the desktop-output experiment. Desktop output is OFF by default.
- The third cube toggles the camera-only prototype. Read `CAMERA-PROTOTYPE.md` before trying it; do not enable both output experiments together.
- GPU readback is deliberately throttled to every six Update frames. The board reports decoded age and maximum callback lag; these are local Udon diagnostics, not external capture latency.
- The local bone/PB station shows a grabbable sphere, native PhysBone state, target coordinates and four native Contact samples. The automated run verifies its readout; actual player grabbing remains a client test.
- The SPS2 Plug/Socket station uses installed VRCFury authoring components and is baked by its normal world build/play hook. Legacy compatibility remains enabled.
- The paired three-marker sender can stimulate a compatible test avatar, but a world is not a substitute for uploading and wearing that avatar.
- The visible telemetry panel is deliberately visible for inspection. The separate desktop-output prefab is the experiment for a non-stereo fixed viewport, not a proven invisible avatar bridge.

Use `Tools > Sensa Lab > Run editor GPU validation` to write `Validation/editor-results.json`, `telemetry.png`, `camera-output.png`, and `world-preview.png` in the project root. It executes GPU rendering, packet CRC checks, camera rotations, SDK proximity calculations, and the optional SPS adapter's shader compilation/invalid-source checks. These are not HMD tests.

`Tools > Sensa > SPS GPU Model Probe (Experimental)` opens the model readback window. Select the baked Resolver and surface material after SPS has baked. It reads an unblended model centerline, not final mesh geometry.

`Tools > Sensa Lab > Run Play Mode validation (straight)` and `(offset and tilted)` bake a temporary scene and run a 12-second ClientSim check with real Udon readback and real SPS GPU sampling. Reports are in `Validation/` and `Validation/offset/`. The harness temporarily disables VRCFury's second Play Mode rebuild after explicitly baking, and restores the previous preference on exit. Use these menu entries for reproducible SPS tests; the original authoring scene remains unchanged. `Generated/BakedPlayValidation.unity` is a disposable preview referencing VRCFury temporary assets; rebuild it through the menu, not as a standalone permanent scene.

The world project is a separate, local-only Git repository. No remote is configured. Library/Temp/Logs/Builds are excluded. Installed package sources are recorded locally for reproducibility. Optional packages under `DisabledPackages~` are preserved but not loaded: their Harmony versions conflicted with SDK/UdonSharp during initial generation.

Source of truth: `F:/Code/Sensa/tools/unity-world-lab` and the shared Sensa GPU probe/protocol. Sync with `python -X utf8 scripts/install-world-lab.py "D:/VRChatProjects/Sensa Test World"`. The installer refuses to overwrite locally modified owned source files; generated scene assets are not overwritten by the sync. The scene generator also refuses to overwrite an existing scene.

Still requiring client validation: HMD visibility, avatar camera behavior, remote interactions, capture latency, minimized/occluded windows, Spout, and device calibration. No real device outputs are enabled by this harness.


## 新增四点定位测试区

打开 `Assets/SensaLab/Generated/SensaLab.unity`，进入 Play Mode / ClientSim。新增区域位于场景前方 Z=4–9 m，11 个编号站分三排摆放，配有独立地面和不透明看板。每站显示 SDK 四路近接值、参考坐标 Truth、解算坐标 Decoded、残差与预期结果。每站白球可抓取移动，左/中/右三个方块分别重置、暂停/恢复、切换 A3 缺采样；所有测试不输出设备命令。

| Case | 场景 | 预期 |
| --- | --- | --- |
| 01 Front | (0.02, -0.03, 0.10) 局部位置 | 有效，解算接近 Truth |
| 02 Behind | Z=-0.10 | 有效，负 Z 不被镜像成正 Z |
| 03 Lateral | X=0.13、Y=-0.05 | 有效，横向偏移可以分辨 |
| 04 No contact | Z=0.60 | 无效，采样超出接触范围 |
| 05 Saturated | Sender 位于一个接收器中心 | 无效，该路达到 1 |
| 06 Wrong radius | Sender 半径 40 mm | 无效，不能按固定 1 mm 解算 |
| 07 Scale x2 | 参考框架统一缩放 2 倍 | 有效，局部 Z 仍为 0.10 |
| 08 Rotated frame | 参考框架旋转 (15°,35°,10°) | 有效，局部坐标保持一致 |
| 09 Missing A3 | 测试程序将 A3 标记为缺失 | 无效，不猜测缺失采样 |
| 10 Beyond fit volume | Z=0.26 | 即便四路有值仍拒绝，超出解算范围 |
| 11 Origin | 位于参考原点 | 有效，XYZ 接近 0 |

Case 09 的 -1 是明确注入的缺采样标记，不是声称 SDK 会返回负近接值。各站使用独立标签；本测试直接调用指定 Sender 的 `CalculateProximity`，不证明多玩家最近 Sender 选择或身份隔离。所有尺寸按参考局部单位解释，残差不是实测精度保证。

### 重现与自动检查

1. 主仓库执行 `python -X utf8 scripts/install-world-lab.py "D:/VRChatProjects/Sensa Test World"` 同步自有源码。
2. Unity 菜单 `Tools > Sensa Lab > Add point geometry cases` 添加测试区。已有区不会重复生成，用户修改的位置不被重置。
3. `Validate point geometry cases` 运行原生 SDK 编辑器测量，写入 `Validation/point-cases.json` 与世界总览/近景截图。
4. `Run Play Mode validation (straight)` 运行 ClientSim，除了原 SPS/GPU/PB 检查，还要求 11 块 Udon 状态板全部报告预期结果；报告为 `Validation/point-cases-playmode.json`。
5. 桌面测试资源 `tests/Sensa.Tests/Fixtures/unity-point-cases.json` 保存实际 SDK 样本。后端回归逐 case 检查有效性，且有效样本必须与记录坐标相差小于 0.1 mm。这个阈值仅用于同一离线测试数据的一致性，不能外推为客户端定位精度。

需要手工补测的场景：真实玩家抓取/松开 PB；上传头像后快速切换多个 SPS 目标；多个玩家同时进入同标签接触范围；不同 Avatar 缩放；真实 OSC 丢包和镜头/Shader 裁剪。编辑器和 ClientSim 通过不能代替这些验证。

## 页面诊断与截图说明

OSC 页面新增 XZ/YZ 投影与三步校准卡片。投影网格显示 ±25 cm 范围，仅用于观察局部位置，不表示整个方框都是有效采样区。

- 选择测量对象和 X/Y/Z/距原点，分别采集 0% 与 100%。例：Z=10 cm 为起点、5 cm 为终点，Z=7.5 cm 应预览为 50%。
- 量程方向自动识别；范围之外的预览限制到 0–100%，同时显示提示。
- 无效采样隐藏位置点和百分比，禁用采集，保留已记录的端点。生成已有端点的草稿不等于启用输出。
- 目标消失时要求重新选择，不自动把其他目标作为原目标。切换轴或手动选择新目标会清除旧端点。
- 窄屏将三步卡片纵向排列，按钮扩展为整行。

截图保存在测试世界 `Validation/`：`ui-calibration-ready.png`（正常与反向量程）、`ui-calibration-invalid.png`（无效输入）、`ui-calibration-narrow.png`（420 px 窄屏）、`point-cases-world.png`（世界总览）、`point-case-detail.png`（单站近景）。UI 截图使用隔离临时配置和模拟 OSC，不是物理设备或 Avatar 实测；输入保持关闭。


## 测试世界详细操作路线

本地项目为 `D:/VRChatProjects/Sensa Test World`，仅做本地 Git 回溯，不设置 remote。请用项目指定的 Unity 2022.3.22f1 打开；这里是 Worlds SDK 项目，不安装完整的 Avatar Sensa 包。源码同步脚本只管理 `Assets/SensaLab`，不会下载 SDK、替换场景或改 Git 远程。

### 区域和可见数据

| 区域 | 可以操作什么 | 能看什么 | 不代表什么 |
| --- | --- | --- | --- |
| 中央 Contact/运动站 | 左侧小方块暂停/恢复轨迹 | 真实 SDK 近接值与已知移动坐标 | 不是对端玩家 OSC 身份测试 |
| 左侧 SPS2 站 | 用专用 Play Mode 验证入口烘焙；偏移用例增加横移与倾角 | Resolver 有效性、入口模型、33 点曲线采样 | 不是最终网格/真实设备行程 |
| 本地 PB 站 | 抓住白色小球、移动、松开 | IsGrabbed、Stretch、局部 XYZ 与四路近接值 | 自动测试没有替真人完成抓取 |
| 11 个几何 case | 抓取目标球；重置、暂停、切换缺采样 | 四路条形图、真值/解算坐标、残差、位置向量、基准/探索状态 | 不是整个头像上传链路，也不证明多人隔离 |
| 编码/相机站 | 开关对应实验输出；不要同时启用两种输出实验 | CRC、序号、回读年龄和回调滞后；编码图块 | 不是已验证的头显隐藏区或桌面传输延迟 |

### 11 个 case 的交互

1. 进入 Play Mode / ClientSim，走到 Z=4–9 m 的三排看板。先确认各板报告 EXPECTED RESULT。
2. 抓取白球，改变前后/横向位置。白球是为了便于抓取的可见把手，它的可见尺寸和 Unity Collider 不等于测量 Sender 的 1 mm 半径。不要用把手外观推断接触几何。
3. 看四条 A0–A3 条形图：正常读数为蓝色，0/1 或缺路标记为红色/空条。SDK 距离值不是单独的行程；四路必须一起解算。
4. Truth 是世界里可直接读取的本地 Transform 真值；Decoded 是用四路值重建的位置。位置向量有效时为绿色、无效时为红色。RMS 在无法完整拟合时显示 n/a，低残差也不保证真实客户端精度。
5. 移动或改变缺路条件后显示 EXPLORING，表示离开了该 case 的初始基准，不应再把原来的预期有效性当成当前动作的答案。
6. **左方块 Reset**：放下目标并恢复原位置/缺路配置；**中方块 Pause**：冻结读数并显示 PAUSED，再点恢复；**右方块 Missing A3**：切换缺采样注入。Case 09 初始就是缺 A3，切换后可以观察恢复。
7. 再点 Reset 回到基准，确认 EXPECTED RESULT。操作为本地验证，未加入 Object Sync，因此不应要求其他玩家看到相同的球位置。

### 应怎样验证，而不是只看“通过”

- 编辑器 `Validate point geometry cases` 核对 11 个基准、11 个 Pickup/Rigidbody 配置、22 个复位/故障按钮、四路读数条和位置向量引用，并导出截图/JSON。
- ClientSim `Run Play Mode validation (straight)` 运行所有状态板，再对第一站实际发送 Udon 自定义事件，验证缺路→无效/空条、重置→有效、暂停/恢复→明确状态。结果 `point-cases-playmode.json` 中有 `controlsPassed`。
- 这些事件测试验证 Udon 控制逻辑，不模拟 VR 手柄抓取/投掷。真实用户抓取、PCVR 手势与双人交互应手动测试。
- 桌面使用固定 SDK JSON 作解算回归；测试世界不会自动向你的硬件或 Sensa 发送运动。若做 OSC 端到端测试，应使用隔离配置与模拟传输，或单独上传测试头像。

交互 API 依据：[VRChat VRC Pickup](https://creators.vrchat.com/worlds/components/vrc_pickup/)；Pickup 同对象需要 Rigidbody/Collider，跨玩家同步则另需 Object Sync。本测试故意保持本地控制，便于复现实验。

### 移动和可触及布局

`LabPlayability.Apply` 保持测量几何不变，只调整地面、出生点、家具、看板和按钮。`LabLocomotion` 通过 SDK 设置行走 2 m/s、跑动 4 m/s、侧移 2 m/s、跳跃冲量 3.5 和重力 1，并在本地重生后重新应用。

Play Mode 自动验证先调用 ClientSim 的 `CloseMenu`，再临时将控制器的输入依赖替换为 `ClientSimInputBase` 测试实现，驱动一秒前进及一次跳跃；结束后恢复原输入。报告记录真实控制器运动，不能据此宣称实际键盘、手柄或 VRChat 客户端已测试。此测试适配当前安装的 Worlds SDK，升级 SDK 后应重新检查控制器输入接口。

`playability-layout.json` 检查 11 个操作点的地面射线、站立胶囊空间与 0.85–1.15 m 按钮高度；`locomotion-playmode.json` 保存速度、移动距离、跳跃高度及菜单状态。默认菜单打开时不能移动是模拟器的正常行为，手动体验应先关闭菜单并让 Game 视图获得焦点。
