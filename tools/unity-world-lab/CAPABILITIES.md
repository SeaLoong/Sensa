# 世界能力与传输

**简体中文** | [English](CAPABILITIES.en.md)

[安装、语言与交互](README.zh-CN.md)。FunctionalLab 将下列路线分开；看板是世界局部观测，不证明 Avatar OSC 已接收。

| 测试站 | 观测 | 不能证明 |
| --- | --- | --- |
| Contact | 对明确 Sender 的四路 SDK 样本 | 多玩家 Sender 身份 |
| PB | 可抓把手的 IsGrabbed 与 Stretch | XYZ 或设备物理回读 |
| PB + Contact | 局部拟合与抓取门控 | 共同原子采样 |
| 原生 SPS | 实际 fixture Plug／Socket 与 OGB 几何 | 未上传头像时不能证明 Avatar 参数已接收 |
| SPS + PB + Contact | 独立标量和局部读数 | 不能混为同一深度信号 |
| Shader 传输 | 合成 XYZ、前进帧、CRC／冻结故障 | SPS 根或模型采集 |
| SPS Shader | 编辑器未混合中心线与入口 | 最终可见网格或可上传任意 C# 读取器 |

原生 SPS 站使用已知 Sender 和 SDK CalculateProximity。世界真值来自工具拥有 fixture；这项能力不能外推到任意 Avatar。

## 已知几何参考

独立 Point fixture 使用半径 0.001 的 Sender、半径 2 的 Receiver，以及各轴偏移 ±0.35 的四面体布局。生成器和解码器共同读取 `SensaPoseProtocol`；数值以当前场景的实际接近值为准。该场景围绕独立参考对象布局，不使用 SPS 四点定位 的 AvatarRootLocal 坐标或 Sample 计数。

已知 20 cm SPS Plug 中，Socket 位于 (0,0,.24)、(0,0,.12)、(.06,0,.12) 分别代表 Outside、Near、Offset。Near／Offset 的轴向真值都是 40%，径向估计约为 40%／32.9%。OGB 归一化、SDK 有符号距离、根解码与模型位移不是同一量。

另行启用原生 **SPS OSC／OGB_ENABLED**，固定实际路径和来源；严格接触边界或完全饱和值不保证可用的运行时估计。

## 诊断图像桥

使用隔离 Sensa 配置，保持**输出为空、输入关闭**；转发前启用 OSC 接收并应用 OSC 模式。`sensa-preview.json` 使用 WebUI 5087，需明确将 `SENSA_CONFIG_PATH` 指向所选文件；下列 9001 只是接收端口示例。

```shell
python -m pip install -r scripts/requirements-capture.txt
python -X utf8 scripts/shader-osc-bridge.py --image "<World project>/Validation/sps-telemetry.png"
python -X utf8 scripts/shader-osc-bridge.py --image "<World project>/Validation/sps-telemetry.png" --watch --duration 300 --port 9001
```

省略 `--port` 只解码，不发 OSC。完整 16×8 网格每格至少 4×4 像素；支持矩形拉伸，不支持自动发现或透视矫正。

启动／恢复需要两个新的前进帧。重复／过期帧、同序号改变 XYZ、CRC／顺序故障和冻结不能重新开门，退出会清零有效性。强杀／丢网还需要 Sensa 输入超时；生产端序号重置后可能要重启桥。

只观察 `Sensa/Diagnostics/Shader/0/{Frame,X,Y,Z,Valid}`；这是诊断传输，不是可映射原生根或校准来源。非零 `Sensa/Shader/<id>` 使用独立[原生根注册](../../unity/top.sealoong.sensa/GPU-TRACKING.md)。移除公开 Producer／Profile 不等于移除二进制 ID、坐标模式、Frame 或 CRC。

实际编辑器模型 PNG 需要已烘焙 Resolver／表面和正在渲染的非立体相机，通过 **Tools → Sensa → SPS GPU Model Probe (Experimental)** 采集。其入口减根的世界轴位移不等于轴向插入；世界可上传相机实验仍是合成数据。

## 报告与验收

需要检查实验场景时，使用对应修订的 `Validation/` 报告核对组件、样本、CRC 和冻结恢复。诊断时保持输入关闭、输出为空。发布 CI 运行单元检查和浏览器 E2E；它们不能代替此世界的 Unity／ClientSim／PlayMode 检查，也不证明原生图像捕获或硬件运动已经验收。

PB 抓取权限、多语字体／HMD 可读性、上传 OSC、相机保留、镜面、HDR／AA、捕获延迟及多人行为仍须真实客户端验收。

[开发说明](DEVELOPMENT.md) · [相机实验](CAMERA-PROTOTYPE.md) · [图解](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)
