# SPS 自动生成与五字段协议

**简体中文** | [English](AUTOMATION.en.md)

Automatic SPS Setup 读取已有 Socket／Plug 作者几何，生成自己的专用标记与固定锚点，不修改原 SPS。只支持当前 `Sensa/SPS/<id>` 契约，不保留旧模式、共享移动阵列或协议回退。

## 目标与选择

在 Avatar 根添加 **Sensa → Automatic SPS Setup**。Discover All 发现所有支持的 VRCFury 作者；Selected Targets 限制目标，Excluded Targets 优先。每目标只属于一个自动组。

| 能力 | 基础成本与含义 |
| --- | --- |
| 固定 SPS 根部定位 | 每个 Socket／Plug 四个 Receiver＋一个专用 Sender |
| Paired Socket Tracking | Root／Tip／Side 各八个 Receiver，独立配对姿态实验 |
| Paired Plug Markers | 三个配对标记，不是 GPU 尖端 |
| Local Plug Tip Tracking | 参考 Socket 下四点阵列与未形变尖端标记 |
| Create Plug Grab Handles | 独立 PB 把手与抓取门控 |

仅保留 Dedicated（同时测量）与 Exclusive（一次选择一个、初始 Off）。Exclusive 减少活动对象，不减少注册 Contact 总数。未知序列化策略直接拒绝。额外能力及其他插件计入总预算；Local Plug Tip 需要明确参考 Socket，只有一个候选时可自动采用。

只测一个对象可用 Fixed SPS Root Probe 或 `SensaSpsRootProbe.prefab`。菜单 **GameObject → Sensa → Fixed-anchor SPS Root Probe** 创建同一作者。Target 初始为空，必须明确选择真实 SPS／Sensa／原生 Contact 根；复制预制件后设置唯一实例名和通道。ReadRoot 解析 CPU Transform 中心，不推测 GPU 形变。

## 固定几何

共享来源是 `Runtime/SensaFixedAnchorProtocol.cs`，P0–P3 顺序固定：

| 点 | AvatarRootLocal |
| --- | --- |
| P0 | (-0.5, 0.5, -0.5) |
| P1 | (0.5, 0.5, 0.5) |
| P2 | (0.5, 1.5, -0.5) |
| P3 | (-0.5, 1.5, 0.5) |

Receiver 半径 2.5，标记半径 0.001；锚点固定在 Avatar 根下，小球通过 ParentConstraint 跟随目标位置与旋转，共用头像根均匀缩放。只接收自己专用 tag 的小球，不生成 Others 接收组。

## 公开数据与内部 FX

| 路径 | 含义 |
| --- | --- |
| `Sensa/SPS/<id>/P0…P3` | 四个 Float Proximity，不是 XYZ |
| `Sensa/SPS/<id>/Sample` | 0 无效；n/32（n=1…32）为活动计数 |

活动状态每约 0.05 秒先复制四个内部 RawP 到 P0–P3，再提交 Sample；完整循环 1.6 秒。RawP、IsLocal、ScaleFactor 只参与内部 FX；RawP 不登记表达参数。Exclusive 另登记本地、不同步且不保存的表达参数 Int `Sensa/Select/<group>`，默认 0（Off），1…N 选择已排序目标，超出范围回到 Off；Dedicated 不生成此自动选择参数。它是可由 OSC 导出的菜单控制，不是五字段测量值，也不会启用桌面输入或连接设备。不要将 FX-only 理解为安全边界或客户端导出隐私保证。

头像根必须正值均匀缩放；已知根缩放动画／ScaleConstraint 构建时拒绝。内部 ScaleFactor 守卫在 Receiver 世界半径超过约 2.999 m 时关闭 Contacts，清零 P 和 Sample；未选中或非本地时同样无效。此守卫仍保留，删掉公开 Scale 不等于取消缩放检查。

## 桌面与实验限制

应用 OSC 模式，选择唯一实例与来源；四路 P 需完整、未饱和且符合模型，Sample 需合法并持续变化。静止距离可以缓存；协议活动时效上限 1250 ms，重发相同 Sample 不续期。0、失效或超时停止输出，但 Sample 不是同帧或无丢包证明。

在根点面板采集两端，替换并保存映射；实验许可及输入启用仍须分别明确操作。旧 Sensa SPS 路径不转换，升级后重建 Avatar 和映射。Point／Handle／Pose 的独立实验不使用此放宽规则。

[安装](README.md) · [依赖与边界](COMPATIBILITY.md) · [独立 Shader 捕获](GPU-TRACKING.md)
