# Avatar 能力矩阵

打开 `Assets/SensaAvatarLab/Capabilities/` 下的对应场景。每个场景只有一种主要输入链路，底模相同便于控制变量；不是把同一套功能换几个位置。原 Exclusive/Shared 场景保留作完整组合与共享性能对照。

| 场景 | 最终 Contact | Sensa 接收器 | 实验 PB | 操作和预期 |
| --- | --- | --- | --- | --- |
| Contact | 5 | 4 | 0 | 菜单 Baseline/Near/Offset/Far outside；`Sensa/Point/v1/LabContact/Self/Root/A0..A3`；Baseline XYZ=(0,0,.1) |
| PB | 0 | 0 | 1 | 抓取/拉伸/松手；`Sensa/Lab/PB_IsGrabbed` 和 `_Stretch`；静止 false/0，无 XYZ 定位 |
| PBContact | 5 | 4 | 1 | 抓把手，观察 `Sensa/Handle/v1/LabCombined/Self/`；四路坐标 + 抓取门控，松手失效 |
| SPS | 25 | 0 | 0 | 启用 SPS 的 FixtureSocket，先 Outside 学习长度，再 Near/Offset；真实 OGB 参数与 20 cm SPS 表面 |
| SPSContact | 38 | 12 | 0 | 同上，再选择 Sensa Fixture 的 Plug；本地点相对 Socket：Outside Z≈−.04、Near Z≈.08、Offset X≈−.06/Z≈.08 |
| Shader | 0 | 0 | 0 | Sensa Shader 菜单默认 Off；合成 XYZ=(.25,−.5,.75)，`Corrupt shader CRC` 注入错误；恢复需两帧新数据，不含真实 SPS 测量 |
| SPSShader | 25 | 0 | 0 | 真实 SPS + 场景外的编辑器采集 Camera；用 GPU Probe 导出实际模型 PNG，再接图像桥 |

表中的 PB 只统计实验把手，不包含 Chocolat 原本的头发/衣物 PhysBone。原模型动骨不在此次碰撞修改范围内。

进入 Play Mode，选择 GestureManager，在 Inspector 操作对应菜单。Contact/SPS 用 `Sensa/Lab/Fixture` 控制固定刺激位置；默认 0，Near=1、Offset=2、Far outside=3。SPS 菜单与刺激位置菜单是两个独立开关；SPSContact 还需要选择 Sensa 的测量对象。

**原生 SPS OSC 还要打开 `Enable SPS OSC (local)`**，它设置 VRCFury 的 `OGB_ENABLED`。仅打开 VRChat OSC 或 Socket 不能代替这个开关。自测自己的 Plug 时选择 Sensa 的 Self 预设，不要选 Others。烘焙后的原生 Contact 参数另列在报告的 `contactParameters`，不一定全部出现在 Expression Parameters 列表中。

这三个 SPS 几何夹具的 Plug 特意关闭 Hip Avoidance，允许同一 Avatar、髋部挂载的已知配对互测；原棒棒糖道具与日常 Avatar 的设置不因此改变。

20 cm 基准的 Self NewRoot/NewTip 预期：Outside 约 `.77/.96`，Near 约 `.89/1`，Offset 约 `.875836/1`。Sensa 已补偿原生 1 cm Root Sender 半径，因此学习长度后 Near 约 40%、Offset 约 32.9%。Root 完全饱和时，最后 1 cm 内的距离不可观测，保守输出约 95%，不能据此证明已到几何端点。

PB-only 没有碰撞器或 Contact，不能从其 Stretch 推断完整位置；PBContact 才用四路 Contact 重建位置。所有新实验把手明确允许抓取、禁止碰撞，保持非零抓取半径。真实 VR 抓取和交互权限仍需要客户端手动验证。

## 连接 Sensa

开启 VRChat OSC，先保持 Sensa 输出列表为空，应用 OSC 输入。Contact 选本地点预设；PB 选“实验 · PB 原生拉伸”；PBContact 选 PB 把手预设；SPS 选普通 Socket 预设。必须限定实际实例与来源，不能把不同场景的数据混合。新增实例 ID 以 `Validation/capability-matrix.json` 和实际参数工作台为准。

图像链路、精确预期数值、取图区域和冻结门控说明见 Sensa 仓库 `tools/unity-world-lab/CAPABILITIES.md`。桥接脚本为 `scripts/shader-osc-bridge.py`，输出 `Sensa/Lab/Shader/{X,Y,Z,Frame,Valid}`。

SPSShader 的采集 Camera 在 Avatar 根以外，**不会上传**。当前真实 SPS→PNG 依赖编辑器 GPU Probe；Shader 场景可上传的 Camera 装置只生成合成测试码。SDK 允许构建并不证明 VRChat 客户端一定保留相机，也不证明头显看不到图块。

## 重建与检查

- **Create capability matrix**：首次生成七个场景，拒绝覆盖已有修改。
- **Validate capability matrix**：执行完整 SDK/NDMF/VRCFury 预处理；检查各场景组件数量、SPS Shader 和 PB 配置，写 `Validation/capability-matrix.json`。
- 原 Exclusive 的 SDK 打包菜单可以重建更新后的完整组合 Avatar；新矩阵的预处理结果不等于每个场景都单独打过 `.vrca`。
- **Build Shader with SDK (no upload)** 可单独构建合成图像 Avatar；**Inspect Shader SDK bundle** 检查打包后的相机、默认 Off 选择和本地 CRC 故障参数。它仍不验证 VRChat 客户端的相机保留或头显可见性。

所有 Avatar 与 World 保持私人测试用途，当前不自动上传。模型和本地工程不推送到公开仓库。
