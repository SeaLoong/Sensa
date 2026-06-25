# Sensa

**VRChat SPS/OGB/TPS 触点感知桥接，驱动 Intiface/TCode 物理设备。**

Sensa 将 VRChat 的 OSC 触点参数实时映射到 Intiface（Buttplug）与 TCode（串口/UDP/TCP）物理输出设备。

## 仓库结构

```
Sensa/
├── src/                              ← C# 核心程序（ASP.NET Web API）
│   ├── Program.cs                    ← 入口点
│   ├── Sensa.csproj                  ← .NET 9 项目
│   ├── Sensa.sln                     ← 解决方案
│   ├── Configuration/                ← AppConfig 与输出设备配置模型
│   ├── Hosting/                      ← ASP.NET 宿主、WebSocket 管理
│   ├── Input/                        ← OSC 输入（UDP 接收、OSCQuery、转发）
│   ├── Motion/                       ← 运动帧与轴模型
│   ├── Outputs/                      ← Intiface 与 TCode 输出适配器
│   ├── Recording/                    ← 运动录制（funscript 导出）
│   ├── Runtime/                      ← 运动运行时与信号处理
│   ├── Signals/                      ← 信号映射与流水线
│   └── Web/                          ← 前端 SPA（React + MUI）
│
└── unity/top.sealoong.sensa/         ← VPM 包（Unity 侧头像配置）
    ├── package.json                  ← VPM 清单
    ├── Runtime/                      ← SensaComponent（MonoBehaviour）
    └── Editor/                       ← 编辑器 UI 与 NDMF/SDK 预处理回调
```

## 组件

### Sensa（C# 程序）

核心程序以 ASP.NET Web API 运行，功能包括：

- 监听 VRChat OSC 头像参数（默认 UDP 9001 端口）
- 通过 OSCQuery（mDNS 广播 + HTTP 轮询）自动发现 OSC 源
- 通过可配置映射与曲线处理信号
- 驱动物理设备：
  - **Intiface/Buttplug**（WebSocket → intiface-engine 或 Intiface Central）
  - **TCode 串口**（COM 口控制 OSR2/SR6 等设备）
  - **TCode UDP/TCP**（网络 TCode）
- 提供 Web 界面用于配置、手动控制和实时监控

#### 快速启动

```bash
cd src
dotnet run
```

浏览器打开 http://127.0.0.1:5086。

### Unity VPM 包

Unity 包提供 `SensaComponent` 组件，在上传头像时自动生成 VRChat Contact/PhysBone 组件：

- **Socket（被插入方）**：深度探测环、角度传感器、OGB 兼容参数路径
- **Plug（插入方）**：TPS 碰撞发送器、自探测支持
- **辅助信号**：额外的 PhysBone、Contact 或已有参数输入

通过 VCC / ALCOM 添加此仓库源即可安装。

## 系统要求

- **.NET 9 SDK**（运行 C# 程序）
- **Unity 2022.3+** 与 VRChat SDK 3.7+（使用 Unity 包）
- **Windows**（串口枚举依赖 WMI 与注册表）

## 许可

MIT
