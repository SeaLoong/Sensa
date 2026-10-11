# Sensa

Unity 预制件的依赖、单侧 SPS 安装步骤和定位能力边界见 [兼容性指南](unity/top.sealoong.sensa/COMPATIBILITY.md)。

Shader 形变采样的实验工具与游戏内桥接设计见 [GPU 定位指南](unity/top.sealoong.sensa/GPU-TRACKING.md)。

**VRChat SPS/OGB/TPS 触点感知桥接，驱动 Intiface/TCode 物理设备。**

Sensa 将 VRChat 的 OSC 触点参数实时映射到 Intiface（Buttplug）与 TCode（串口/UDP/TCP）物理输出设备。

## 仓库结构

```
Sensa/
├── src/                              ← C# 核心程序（ASP.NET Web API）
│   ├── Program.cs                    ← 入口点
│   ├── Sensa.csproj                  ← .NET 10 项目
│   ├── Sensa.sln                     ← 解决方案
│   ├── Configuration/                ← AppConfig 与输出设备配置模型
│   ├── Hosting/                      ← ASP.NET 宿主、WebSocket 管理
│   ├── Input/                        ← OSC 输入（UDP 接收、OSCQuery、转发）
│   ├── Motion/                       ← 运动帧与轴模型
│   ├── Outputs/                      ← Intiface 与 TCode 输出适配器
│   ├── Recording/                    ← 运动录制（funscript 导出）
│   ├── Runtime/                      ← 运动运行时与信号处理
│   ├── Signals/                      ← 信号映射与流水线
│   └── web/                          ← 前端 SPA（React + MUI，esbuild 预编译）
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
npm ci
dotnet run --project src/Sensa.csproj
```

浏览器打开 http://127.0.0.1:5086。

### Unity VPM 包

Unity 包提供 `SensaComponent` 组件，在上传头像时自动生成 VRChat Contact/PhysBone 组件：

- **Socket（被插入方）**：深度探测环、角度传感器、OGB 兼容参数路径
- **Plug（插入方）**：TPS 碰撞发送器、自探测支持
- **辅助信号**：额外的 PhysBone、Contact 或已有参数输入

### 安装 VPM 包

**一键添加：** 访问 [Sensa VPM 包源](https://sealoong.github.io/Sensa/) 点击「添加到 VCC」按钮。

或手动添加：
1. 打开 VCC / ALCOM → **Settings** → **Package Sources** → **Add**
2. 输入地址：`https://sealoong.github.io/Sensa/vpm.json`
3. 添加后在项目中搜索并安装 **Sensa** 包

> Unity 包通过 `unity-vX.Y.Z` tag 发布。ZIP 保存在 GitHub Release，Pages 提供 VPM 版本索引。

## 系统要求

- **.NET 10 SDK**（版本见 `global.json`；编译源码）
- **Node.js 24**（编译前端，先运行 `npm ci`）
- **Unity 2022.3+** 与 VRChat SDK 3.7+（使用 Unity 包）
- **Windows**（串口枚举依赖 WMI 与注册表）

## 许可

MIT

## OSC 映射与参数预览

新增“空间定位”面板与 Sensa Pose v1 配套 Unity 资产，显示入孔比例、偏移、姿态、采样完整度和拟合残差。安装、几何约定与实际限制见 [Unity 包说明](unity/top.sealoong.sensa/README.md#sensa-pose-v1-空间定位实验性)。
参数工作台支持置顶、候选/已映射/阵列筛选、仅冻结预览、参数含义说明和添加映射草稿。置顶参数保存在当前浏览器，不受 FT 默认过滤影响。

预览默认隐藏 VRCFaceTracking Unified Expressions `v2/` 面部参数（含自定义前缀、二进制位后缀）和常见旧版眼口参数。
“显示 FT”可以展开；已被当前映射命中的 FT 参数始终显示。过滤仅影响展示，不丢弃或阻断这些参数的映射和转发。
目录保留最多 4096 个参数/来源组合、32 个来源，来源五分钟无活动后在后续收包时清理；活跃来源的稳定参数不会因其他参数更新而消失。
页面按“已映射 → 已知触觉路径 → 关键词/相似名称 → 其他参数”排序，以路径维持稳定顺序。
名称推断会标注“可能是目标参数”，不会自动创建映射。搜索与每批 100 行的展示可用于查看大型目录。

一个映射可以用分号列出多个路径，例如 `OGB/Orf/**/PenOthers;Custom/Depth`。
`*` 匹配一个路径段，`**` 匹配零个或多个段。所有命中参数参与融合，同轴选用校准后强度更高的信号，不相加。
已保存路径不会被升级过程自动改写；选择新预设后需“保存并应用映射”。

- **VRCFury SPS Socket 新深度**：使用 `PenOthersNewRoot/NewTip` 与 `PenSelfNewRoot/NewTip`。同来源、同孔位配对，先从外部靠近以估算长度；没有可靠校准时输出零。UI 的“实时输入”是原始参数值，配对模式不显示单参数预估位置。
- **VRCFury SPS Plug 深度**：根部接收器值越大表示越深，默认不反向。旧 Sensa 尖端接收器仍可使用旧 OGB Plug 预设。
- **OGB Socket**：`OGB/Orf/**/...` 兼容旧的孔位/实例层级，不再要求固定 `Main`。
- **触碰与摩擦**：Touch/Frot 对应 V0。Close 接触开关和 NewRoot/NewTip 距离值不是普通深度别名。
- **Sensa 辅助信号**：新版 Unity 参数包含角色段，例如 `Sensa/Main/Aux0/Vibrate`。PhysBone 使用对应后缀。`GateEnable` 无值或关闭时停止输出，多条门控规则需要全部开启；`DepthOverride` 替代普通 Depth。已有自定义参数需手动填写路径和角色。

参数依据：[VRCFury SPS](https://vrcfury.com/sps/)、[VRCFury Socket 生成源码](https://github.com/VRCFury/VRCFury/blob/d048773de971881fb14c5f3b468e59ba2406a2dd/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs)、[VRCFT 参数](https://docs.vrcft.io/docs/tutorial-avatars/tutorial-avatars-extras/parameters)、[二进制参数](https://docs.vrcft.io/docs/tutorial-avatars/tutorial-avatars-extras/parameters/types/binary)。
SPS2 的形变与触觉数据是不同功能，须启用 VRCFury 的 Haptics/OGB 功能才能获得相应 OSC 接触参数。

## 控制与访问

- 新配置默认只监听本机 OSC。局域网输入须显式改为 `0.0.0.0`，可填写允许的来源 IP。
- 输入开关关闭会发送停止命令。连接设备不再自动回中；解除急停后必须重新启用输入。
- 手动/脚本输出只保留最新待发送姿态。TCP 与 Intiface 有发送超时，UDP 在输入激活期间每秒重发完整状态以缓解丢包。
- OSC“断流停止”默认关闭：VRChat 可能只在值变化时发送，静止不能直接当作断线。持续发送的来源可配置超时，触发后需要手动解除急停。
- 配置更新会先停用输入、停止输出，再应用配置；需要重新启用输入。配置使用原子替换，失败会返回错误。损坏的旧配置会备份为 `.invalid-*`。
- WebUI 本机访问自动建立 HttpOnly 会话；HTTP/WS 校验 Host、Origin 和凭证。局域网访问必须在启动前设置 `SENSA_ACCESS_TOKEN`，浏览器认证框的用户名任意、密码为该值；API 也支持 Bearer。局域网 HTTP 不提供传输加密，需要远程使用时由 HTTPS 反向代理终止 TLS，并保持原始 Host/Origin。
- 配置默认存放在可执行文件旁的 `config.json`；升级时保留它。可用 `SENSA_CONFIG_PATH` 指定其他可写位置。
- 自包含 Windows 包包含 .NET 运行时，不包含 `intiface-engine.exe`。使用 Intiface Central 时关闭“管理引擎进程”；使用独立引擎时将其放在 Sensa 可执行文件旁。
- 页面支持录制 L0 和导出 funscript。录制上限为 100000 帧，达到上限自动停止。

## 验证与发布

```bash
npm ci
npm test
dotnet restore tests/Sensa.Tests/Sensa.Tests.csproj --locked-mode
dotnet test tests/Sensa.Tests/Sensa.Tests.csproj -c Release --no-restore
python scripts/release.py check-unity
python scripts/smoke.py --dll bin/Sensa/Release/net10.0/Sensa.dll
```

冒烟测试使用临时配置、临时端口和无设备实例，从其他工作目录启动，覆盖认证、Origin、并发 WS 消息、FT 参数洪流和 NaN 拒绝。
前端构建不再在浏览器运行 Babel。依赖版本及 NuGet/npm 锁文件已提交，GitHub Actions 固定到提交 SHA，Dependabot 每周检查更新。

发布流程：

1. Windows 程序更新根 `package.json` 的版本（同步 lock），推送 `vX.Y.Z` tag；Unity 包更新 `unity/top.sealoong.sensa/package.json`，推送 `unity-vX.Y.Z` tag。
2. Windows 流程执行测试、审计、自包含 `win-x64` 发布及发布包冒烟，生成 ZIP 和 SHA256。独立的 Release job 才拥有写权限。
3. Unity 流程校验清单、固定 GUID 与宏定义，生成 ZIP、SHA256 和 `vpm-package.json`。本仓库不包含 Unity 编辑器/许可证；这项静态校验不代替真实 Unity 导入、SDK 编译与头像上传测试，打 Unity 正式 tag 前需完成这些测试。
4. 稳定 Unity Release 发布后，Pages 从已发布 Release 重建索引，逐个验证包摘要。历史 Pages ZIP 在迁移期会验证并复制，损坏/缺失时中止部署，不生成指向不存在包的清单。
5. 含预发布后缀的 tag 创建 prerelease，不进入稳定 VPM 源。相同 tag 的 Release 已存在时拒绝覆盖；Pages 失败可单独手动运行 `Release Unity package` 的索引部署。

在 GitHub 仓库 Settings → Pages 选择 **GitHub Actions**，并允许 `github-pages` environment 部署。首次从旧 VPM 源迁移时，已丢失的旧 ZIP 需要先恢复，流程不会伪造历史包。
工作流文件提交并推送后才会在 GitHub 生效；本地构建不会创建 tag 或远程 Release。
