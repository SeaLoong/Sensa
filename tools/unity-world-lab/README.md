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

打开 `Assets/SensaLab/Generated/SensaLab.unity`，进入 Play Mode / ClientSim。新增区域位于场景前方 Z=4–9 m，11 个编号站分三排摆放，配有独立地面和不透明看板。每站显示 SDK 四路近接值、参考坐标 Truth、解算坐标 Decoded、残差与预期结果。小方块可暂停/恢复该站读数；所有测试不输出设备命令。

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
