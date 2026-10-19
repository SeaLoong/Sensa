# 从真实输入开始

**简体中文** | [English](quick-start.en.md)

Sensa 的日常输入是手动、funscript、已有 OGB／SPS 参数，或自己生成的坐标采集组件。合成阶梯只属于开发测试，不是需要安装的使用方案。

## 启动与设备基准

1. 从 [Releases](https://github.com/SeaLoong/Sensa/releases) 下载对应系统／CPU 的桌面包，完整解压后运行 `Sensa.exe` 或 `./Sensa`；无需另装 .NET。
2. 打开 `http://127.0.0.1:5086`，保持输入关闭。先无输出观察逻辑，再添加符合固件的 TCode 串口／UDP／TCP，或连接已启动的 Intiface Central。
3. 给 TCode 输出绑定符合真实机械标定的轴配置。小范围预设的数值不代表你的硬件安全行程；Intiface 只执行其设备声明的特征。
4. 在“控制”应用手动，核对单次目标、方向和停止行为。连续发送跟随滑条调整，不会自动往返。关闭输入发送停止；急停锁定后需要显式解除、重新启用。

输出卡片是命令目标，不能证明机械到位；UDP 本地连接状态没有远端应答。

## 已有 SPS／OGB Avatar

1. VRChat 开启 OSC；在 Sensa 应用 OSC，默认监听 `127.0.0.1:9001`。
2. 打开“接收与转发设置 → OGB 参数启用”，按需启用向实际 VRChat 接收地址发送 `OGB_ENABLED`；常见控制地址为 `127.0.0.1:9000`。保存后输入仍关闭。心跳发送状态不代表客户端已确认。
3. 参数页核对真实 `OGB/Orf/...` 或 `OGB/Pen/...`。选择“OGB / SPS · 深度”或“OGB / SPS · 振动”，替换草稿；固定实际对象和来源后检查量程并保存。
4. 深度入口自动识别现代 Root／Tip 或旧单接近参数；触碰入口检查同对象 Close 门控。Intiface 振动默认 V0，深度转振动需要明确选择 L0。
5. 再启用输入。现代径向估算需先从外部接近完成估长；不把它当作精确插入深度。只要现有参数可用，这条路通常无需 Sensa Unity 包。

参数能力、优先规则和上游证据见 [OGB 兼容说明](ogb-compatibility.md)。

## 要直接测根点坐标

- **Sensa SPS：** 在自己的 Avatar 安装 Unity 包，使用 Fixed SPS Root Probe 明确选择 Socket／Plug 根；固定四锚点、自有小标记及有效性元数据由构建器生成。在“实验诊断”的根点面板选目标、采集两端、替换草稿并保存。明确允许实验空间输入后才能启用。
- **Shader 捕获：** 生成原生 Shader Root Capture，固定 producer ID，显式选择可见编码图块区域并配置桌面桥。原生有效坐标同样在根点面板校准；诊断传输有独立命名空间，不提供空间坐标。隐藏层不保证进入桌面截图。[字段与半径](osc-parameters.md)。

两条坐标路都以 Avatar 根局部单位输出；它们不是世界定位、设备回读或变形表面测量。[方案对照](usage-scenarios.md) · [定位与缩放](positioning.md) · [Shader 安装](../unity/top.sealoong.sensa/GPU-TRACKING.md)

## 其他输入与排查

funscript 导入生成单 L0 时间线，支持循环／倍速／定位，不含音视频同步。原生 PB 使用实际前缀的 Stretch＋IsGrabbed，内置 MyPB 只是需要替换的占位符。

没有输出时依次检查实际模式、监听口、真实参数、来源、已保存映射、门控、输出连接和输入许可。保存配置／更换输入或脚本后重新检查许可。普通标量可能只在变化时发送，不用固定转发频率伪造传感器新鲜度。

[使用指南](guide.md) · [三个映射模板](presets.md) · [功能参考](features.md)
