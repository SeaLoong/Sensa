# OGB 与 SPS 参数兼容研究

**简体中文** | [English](ogb-compatibility.en.md)

Sensa 用一个 OGB 深度解释入口读取 Socket、Plug 的现有参数。自动选择依据是**实际参数能力**，不是 SPS／OGB 的产品名称或版本号。输出是归一化设备目标；现代 Socket 也只提供径向估算，不能据此声称获得了真实插入深度、世界坐标或变形网格位置。

本研究核对官方 OGB v1.0.0、v2.1.30，以及本次研究时 VRCFury main 的固定提交。v1.0.0 已有 Root／Tip 与旧参数回退，因此“旧版 OGB 只有一个 trigger”不是普遍成立的版本划分。[旧 OGB 实现](https://github.com/OscToys/OscGoesBrrr/blob/262164576721f12958409638851808aa662b87c7/src/main/GameDevice.ts#L68-L151)、[当前 OGB 实现](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts#L63-L150)。

## 参数与能力矩阵

下表省略 VRChat 的 `/avatar/parameters/` 前缀。实例可以是完整的多段路径；现代 VRCFury 自己会把实例名中的斜杠替换为下划线。Sensa 保留收到的完整实例父路径，不把末段相同的两个实例合并。

| 实际参数 | Sensa 的解释 | 可以得到什么 |
| --- | --- | --- |
| `OGB/Orf/<实例>/PenOthersNewRoot` 与同实例 `PenOthersNewTip` | 现代 Socket 配对 | 先在球未饱和时估长，随后求径向归一化比例 |
| `OGB/Orf/<实例>/PenOthers` | 旧 Socket 接近值 | 原始 0–1 强度；若同实例 `PenOthersClose` 存在，还要通过它 |
| `OGB/Pen/<实例>/PenOthers` | Plug 接近值 | 原始 0–1 强度，不默认反向 |
| 对应 `PenSelf...` | 自身交互的独立一组 | 不与 Others 配对；内置默认仍选择 Others |
| `TouchSelf`、`TouchOthers`、`FrotOthers` | 触摸／摩擦强度 | 与深度分开；对应 Close 的条件见下文 |

现代 Socket 的两个接收球都在 Socket 根部、半径均为 1 m。NewRoot 检测 Plug 根球；NewTip 检测以 Plug 根为中心、半径等于 Plug 长度的球，**它并不是一个位于尖端的标记**。旧 Socket 的 PenOthers 接收球则后移一个配置深度，半径也等于该深度；它不是可套用同一公式的第三个 Root／Tip 通道。[Socket 生成器](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L193-L272)。

Plug 的 PenSelf／PenOthers 接收球位于根部，半径为作者配置的 Plug 长度，检测 Socket 根标签。因此在理想对准条件下，越接近 Plug 根部值越大；不应统一添加反向。Plug 的长度球与 1 cm 根 Sender 也是根部同心球，生成时按世界尺度换算。[Plug 接收器](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L175-L255)、[Plug Sender](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs#L60-L108)、[世界尺度换算](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/HapticSenderFactory.cs#L24-L40)。

这里的单参数是 Proximity 浮点值，不是只在进入瞬间触发的 OnEnter。VRChat 的 Proximity 根据最近 Sender 表面到接收器中心的距离给值；存在多个 Sender 时，各 Receiver 各自选择最近者。[VRChat Contacts](https://creators.vrchat.com/common-components/contacts/)。

## 统一选择规则

内置深度映射使用 `sourceMode: OgbDepth`，默认路径为：

```text
OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers
```

无需再添加 Tip 或 Close 映射；它们由同一解释器读取。每次按 **OSC 来源键＋完整父路径＋Self／Others** 分组，一组只产生一个深度候选，不把现代 Root 与旧 PenOthers 当成两个强度取最大。

1. Socket 的任一现代通道为正时，使用现代配对。配对缺失、数值无效或尚未学到有效长度时给零；不以旧的高值填补。
2. 现代通道缺失或均为零时，允许旧 PenSelf／PenOthers。Orf 的 PenOthersClose 若存在且未打开，则旧 PenOthers 给零；完全没有 Close 的旧配置仍可读取。
3. Plug 使用其 PenSelf／PenOthers 原值。不会把 Plug 的路径误当作 Socket Root。
4. Tip、Close 更新也会重新评估相关深度映射。更换 Avatar、重建映射或重新启用 OSC 输入时清空估长状态，避免沿用未启用期间可能已经更换的 Plug 长度。
5. 不猜测 `Trigger`、`Depth` 等叶子别名。官方 OGB 另有原生 TPS 的 Depth_In／RootRoot 分支，但它们不等于 OGB 同名参数；本入口不将其改名拼接。自定义信号应明确选择直接映射。

前两项与官方 OGB 的能力优先顺序一致；对“只有一个正值现代通道”的情况，Sensa 额外保守地给零。官方实现有数值配对才进入现代分支。[官方选择逻辑](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts#L63-L149)。本地实现见 [OGB 地址解析](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/OgbDepthAddress.cs)、[运行时路由](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs)。

`SpsSocketDepth` 仍能读取已有配置中的现代配对；新增映射优先选择 OgbDepth。旧 Socket 接近值不会被伪造为已经按对方长度归一化的数据。不同实例的候选之后仍按轴混合规则选择，不能由此推断它们属于同一个物体。

## 现代 Socket 的估算模型

以下是 Sensa 基于生成器球形几何建立的模型，不是复制官方 OGB 的采样窗口算法。设 Root／Tip 接近值为 `pRoot`、`pTip`，Sender 根球半径为 `r = 0.01 m`。两个 Receiver 半径都是 1 m，未饱和时近似有：

```text
Plug 长度 L ≈ pTip − pRoot + r
根部中心距离 d ≈ 1 − pRoot + r
径向比例 q = clamp(1 − d / L, 0, 1)
```

只有两值有限且在 0–1 内、均高于 0.01，并且长度球尚未接近饱和时才更新长度。长度至少为 0.02 m；同一个缓存 Tip 的序号不会被重复当作新长度测量。Tip 达到饱和阈值后才输出比例；未经过可用的外部估长过程就从内部启动时给零，需要先退出再进入。

例如 `pRoot=.71, pTip=.90` 对应约 20 cm 长度；之后 `pRoot=.91, pTip=1` 对应约 10 cm 根部距离，输出约 0.5。1 cm 修正来自上游根 Sender 的真实半径；当 Root 本身饱和时，距离也被截断，不能再从信号恢复最后那段距离。见 [Sensa 估算器](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SpsDepthEstimator.cs)。

这套模型有明确边界：

- 横向偏移会增大根部距离，旋转不会由这两个同心球单独解出。径向比例不是沿 Plug 轴线的插入比例。
- 根球与长度球可能分别来自不同 Plug。OSC 来源是发送客户端身份，不是 Contact Sender 身份；如果连续换 Plug 却没有归零或新的未饱和采样，也无法可靠识别长度已变。
- 逐参数 OSC 更新没有共同 frameId；短暂合并来包和按序号去重只能减少重复采样，不能证明同帧。
- 可配置的 OSC 超时使用所选现代配对中较新的通道时间，兼容饱和值不变的增量发送。它不证明另一个值仍然物理有效；超时为零表示关闭这项超时检查。被抑制的旧值或 Close 更新不会给现代配对续期。
- SPS 视觉变形、旧 TPS／DPS 兼容、OGB Haptics 是不同能力。画面发生变形不代表一定生成或发送了这些参数。[SPS 官方说明](https://vrcfury.com/sps/)。

## 先启用 Haptics，再看参数

当前 VRCFury 的 OGB Haptics 对象默认关闭，仅在本地 Avatar 且 `OGB_ENABLED` 为真时启用；官方 OGB 每 5 秒发送一次真值。[VRCFury 启用条件](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/OgbEnabledService.cs#L16-L41)、[官方控制心跳](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/OscConnection.ts#L21-L68)。

Sensa 为此增加显式控制配置：

```json
{
  "osc": {
    "ogbControl": { "enabled": false, "host": "127.0.0.1", "port": 9000 }
  }
}
```

- 默认关闭。确认 Avatar 有 Haptics，VRChat 已启用 OSC 后，填写 **VRChat 的接收 IP／UDP 端口**，再开启 OGB 控制。只接受单播 IP 或 localhost；不把 Sensa 看到的来源发送端口当成目的地。
- 在 OSC 输入方式、OSC 接收已运行时立即发送 true，随后每 5 秒一次。硬件输入仍可保持未启用，先在参数列表确认数据。
- 关闭控制、离开 OSC 输入方式、停止监听、修改目标或正常退出时，向旧目标尝试发送 false 并停心跳。异常终止无法保证发出最后一包。
- 拒绝把控制目的地配置成 Sensa 自己的 OSC 监听端口；切换目标时先关闭旧目标。
- 状态中的 active 只表示心跳服务运行；UDP 没有应答，发送成功不等于 Avatar 确认启用。别的 OSC 程序也可能写同一个参数。

实现见 [OGB 控制服务](https://github.com/SeaLoong/Sensa/blob/main/src/Input/Osc/OgbControlService.cs)；其目标验证与配置复制由 [AppConfig](https://github.com/SeaLoong/Sensa/blob/main/src/Configuration/AppConfig.cs) 管理。

## 触摸与摩擦不等于深度

官方 OGB 对 Orf／Pen 的 TouchSelf、TouchOthers 还检查对应 TouchSelfClose／TouchOthersClose；Pen 的 FrotOthers 检查 FrotOthersClose，Orf 的 FrotOthers 直接读取。Close 通常是胶囊范围的布尔检测，用来约束宽球的接近强度。[官方触摸选择](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts#L108-L139)。

内置触摸映射使用 `sourceMode: OgbTouch`：按完整实例、来源和功能读取强度与 Close；需要 Close 的通道若缺失 Close 也给零。Close 更新会触发重算，但不能单独给旧的强度样本续期。自定义 `Direct` 仍可明确读取原始强度。

这些强度不会自动获得身份、方向或位置；应把它们路由到振动轴，不能把 Touch 作为 Root／Tip 缺失时的深度替代。

## 验证与未验证范围

[OGB 深度契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OgbDepthContracts.cs)覆盖单参数旧输入、现代优先、缺配对保护、Close、嵌套实例、来源与 Self／Others 隔离、缓存 Tip、超时与映射刷新。[触摸契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OgbTouchContracts.cs)覆盖各类 Close、跨组拒绝与直接映射保留。[控制契约](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OgbControlContracts.cs)使用虚拟时钟和独立本地 UDP 端口，检查默认关闭、5 秒周期、目标切换、最终 false、幂等停止和回环拒绝。

这些是项目逻辑与模拟传输证据。本轮未在本机运行浏览器、真实 VRChat／Unity 会话或用户硬件；它们不能证明任意 Avatar 已安装所需组件、参数正确生成或实际设备运动与画面一致。下一步验收应先检查参数，再使用隔离输出，最后由用户在明确的设备范围内确认实际效果。

本研究只引用上游源码以解释互通，不捆绑或修改上游实现。[OGB 许可](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/LICENSE)、[VRCFury 许可](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/LICENSE.md)仍适用于各自项目；本文不将它们描述为可任意复制的宽松许可。
