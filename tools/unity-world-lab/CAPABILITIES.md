# 能力测试与 Sensa 联动

打开 **Assets/SensaLab/Functional/FunctionalLab.unity**。原 `Generated/SensaLab.unity` 保留作几何边界回归；新场景按信号来源划分实验，不把多个位置点算作多个系统。

在 ClientSim 中关闭菜单、点击 Game 视图后走到测试台。按钮文字表示功能：Rest、Near、Offset、Outside、Freeze。PB-only/PB+Contact 主要通过真实抓取操作，只有 Freeze 读数按钮；纯传输台另有 ToggleOutput。测量、暂停和导出均不连接设备。

## 每站测什么

| 站 | 信号与操作 | 预期结果 | 与 Sensa 的关系 |
| --- | --- | --- | --- |
| 01 Contact only | 抓白球或选 Near/Offset/Outside；没有 PB | 四路 SDK Proximity 与看板公式结果一致，误差应低于 0.0001 | 对应 Avatar Contact 场景的 `Sensa/Point/v1/LabContact/Self/Root/A0..A3`；世界看板自身不发送 OSC |
| 02 PB only | 抓取、拉伸、松开球；没有 Contact | 静止 IsGrabbed=false、Stretch=0；抓住为 true，拉伸会变化；没有 XYZ 重建 | Avatar PB 场景使用 `Sensa/Lab/PB_IsGrabbed` 与 `_Stretch`，选“实验 · PB 原生拉伸”预设 |
| 03 PB + Contact | 抓取 PB 目标，四接收器测其位置 | PB 状态与 A0–A3 同时变化；松手后运动映射应失效 | Avatar PBContact 场景的 `Sensa/Handle/v1/LabCombined/Self/`，使用 PB 把手预设并校准 |
| 04 原生 SPS | 真实 VRCFury Plug/Socket；先 Rest/Outside，再 Near、Offset | 20 cm 长度、原生球形近接与轴向真值见下表；偏移时两种深度不同 | Avatar SPS 场景使用真正的 `OGB/Orf/FixtureSocket/...` 参数，选择普通 SPS Socket 预设 |
| 05 SPS + PB + Contact | PB 驱动真实 SPS Plug，Contact 测 PB 点；可移动 Socket | 三种读数可同时观察；先释放 PB 回到静止，再按预设比较；自由抓取时基准会改变 | 原 Exclusive Avatar 是完整组合；独立能力 Avatar 用于先排除单一系统问题 |
| 06 Shader 传输 | 合成 XYZ=(.25,-.5,.75)，不断改变帧号；Freeze/ToggleOutput/Corrupt | 解码误差小于 0.00004；冻结超过 350 ms 后 Valid=0；Corrupt 注入真实 CRC 错误 | 可通过 PNG 或精确屏幕区域 → Python 桥 → Sensa；明确不是 SPS 测量 |
| 07 SPS Shader | 真实 SPS Shader、Socket 偏移、GPU 中心线采集 | 长度约 .2 m；Offset 入口相对根部位移约 (.06,0,.12) m | 编辑器 GPU Probe → 连续编码 PNG → 桥 → Sensa；不是可上传的 Avatar C# 脚本 |

原生 SPS 台使用**已知本台 Plug 的实际 SPS Sender**和 SDK `CalculateProximity`，以避免多个实验台混入来源；不是任意远端目标识别实现。World 的 Udon 数值不会自动变成 Avatar OSC。看板上的世界 Transform 是测试真值，不能当作 Avatar 运行时能力。

### Contact 基准（半径 1 mm，接收器 0.35 m）

| 位置，米 | A0 | A1 | A2 | A3 |
| --- | --- | --- | --- | --- |
| Baseline (0,0,.10) | .48541 | .48541 | .73483 | .73483 |
| Near (0,0,.05) | .60593 | .60593 | .75874 | .75874 |
| Offset (.06,0,.10) | .40627 | .51463 | .79683 | .60286 |
| Outside (0,0,.60) | 0 | 0 | 0 | 0 |

### SPS 基准（20 cm Plug，根部到 Socket 的距离）

| 操作 | Socket 相对 Plug 根的位置 | SDK 带符号近接，米 | 轴向深度真值 | 径向近似深度 |
| --- | --- | --- | --- | --- |
| Rest / Outside | (0,0,.24) | +.04 | 0 | 0 |
| Near | (0,0,.12) | −.08 | .400 | .400 |
| Offset | (.06,0,.12) | −.06584 | .400 | .32918 |

SDK 近接为距离量，不是 OGB 的归一化行程。Avatar 普通 SPS 预设仍需先在未饱和位置学习长度；旧参数、新 Root/Tip 配对和 Shader 模型不是同一种量。SPS Shader 采集是未混合模型中心线，不能证明最终表面网格精度。

Avatar 的原生 haptics 必须打开实验菜单 `Enable SPS OSC (local)`（`OGB_ENABLED=true`）；测试自己身上的 Plug 时选 Self。Sensa Root/Tip 估算已补偿原生 1 cm Root Sender 半径；Root 饱和后的最后 1 cm 不能准确解出，因此保持保守估计。

## PB 抓取与碰撞

实验把手设置 `Allow Grabbing=True`、`Allow Posing=False`、`Allow Collision=False`，碰撞器列表为空，可见球没有 Unity Collider。PB 的正半径用于抓取判定，不能为了关闭碰撞把它设为零。Contact Sender/Receiver 是测量组件，并不是会推开动骨的物理碰撞器。

自动检查验证了配置和静止读数；真实抓取仍需手动测试，并检查 VRChat 自交互/对他人交互权限。这里的动骨使用 VRChat PhysBone，不要求安装旧 Dynamic Bone。

## 图像桥接操作

先使用没有任何输出设备的 Sensa 配置，应用 OSC 输入。脚本不会连接或启用硬件。

仓库提供 `tools/unity-world-lab/sensa-preview.json`。在单独 PowerShell 中设置 `$env:SENSA_CONFIG_PATH` 为该文件绝对路径，再运行解压目录的 `Sensa.exe`，打开 `http://127.0.0.1:5087`。它没有输出设备。先关闭其他占用 UDP 9001 的监听程序；应用 OSC 输入后，多个来源并存时在参数工作台固定桥接来源。

```powershell
python -m pip install -r scripts/requirements-capture.txt
# 离线检查一帧；不传 --port 就不会发送网络数据
python scripts/shader-osc-bridge.py --image "D:/VRChatProjects/Sensa Test World/Validation/functional/sps-telemetry.png"
# 读取 GPU Probe 连续更新的 PNG，明确指定本机 Sensa 的 OSC 端口
python scripts/shader-osc-bridge.py --image "D:/VRChatProjects/Sensa Test World/Validation/sps-telemetry.png" --watch --duration 300 --port 9001
# 或读取完整代码区域，坐标为桌面物理像素；示例数字需要按实际区域修改
python scripts/shader-osc-bridge.py --region 0 900 256 128 --watch --port 9001
```

脚本支持被拉伸的矩形图块，但必须包含完整 16×8 网格、每个格子至少 4×4 像素。不支持自动找码或透视校正。启动及故障恢复均需两帧新的递增序号才置 Valid=1；旧帧和重复帧不能恢复门控。同一帧号的 XYZ 改变也会失效。冻结、乱序、CRC 错误、退出均关闭 Valid；进程被强杀或网络断开时还要依靠 Sensa 的断流停止设置。

桌面发行包现已附带桥接脚本、Pillow 依赖清单和无设备预览配置，可在解压目录执行上述命令。Windows x64 CI 使用真实 GPU 生成的固定 PNG，检查 CRC 故障停用、旧帧拒绝、两帧恢复及最终冻结停止。

示例配置将断流停止设为 500 ms；仍应固定桥接来源，避免其他程序的数据影响测试。采集窗口重开、帧计数重置后，重新启动桥接以建立新的帧序基线。

在参数工作台看 `Sensa/Lab/Shader/{X,Y,Z,Frame,Valid}`。可选择“实验 · Shader 图像桥接 Z”预设；它只是 0–0.2 m 的位移模板：Z=.12 映射为 60%，**不是**上表的 40% SPS 插入深度。实际运动范围需重新校准。

### 真正 SPS 模型怎样接到 PNG

1. 在 World/Avatar 的 SPS Shader 场景进入 Play Mode，让 VRCFury 烘焙并正常渲染 SPS。
2. 打开 **Tools → Sensa → SPS GPU Model Probe (Experimental)**，选择非立体 Camera、对应烘焙 Resolver Renderer 和表面 Renderer。
3. 勾选“连续导出实验 PNG”，设置输出文件，点击“检查依赖并采集下一帧”。该 Camera 必须持续渲染。
4. 外部脚本使用 `--image ... --watch --port ...`，在 Sensa 检查 Valid 与 XYZ。暂停渲染后应失效。

编码的是“入口减去中心线根部”的世界轴位移，范围每轴 ±1 m；超范围或 GPU 数据无效会输出无效包。此链路目前需要 Unity 编辑器，尚未实现上传 Avatar 后自动读取真实 SPS 模型并导出编码图像。纯 Camera 合成码可用于测试客户端的相机保留、截图与可见性，但不能冒充真实 SPS 数据。

固定窗口区域减少了转头时代码位置改变的问题，但 CRC/帧号不能证明画面绝无延迟。真实 VRChat 相机裁剪、窗口遮挡、缩放、重投影和头显不可见性仍需验证。

## 自动验证和报告

菜单 **Tools → Sensa Lab → Validate capability world in Play Mode** 检查各系统、Near/Offset、PB 碰撞配置、真实 SPS GPU 采样并导出 PNG。看 `Validation/functional/results.json`、`sps-gpu.json` 和 `sensa-bridge.json`。最后一份是两帧真实 GPU PNG 重放到隔离 Sensa 的端到端结果，不是实时 VR 抓取结果。

参考：[VRChat PhysBones](https://creators.vrchat.com/common-components/physbones/)、[VRCFury SPS](https://vrcfury.com/sps/)。
