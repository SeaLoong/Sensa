# 三个内置映射模板

**简体中文** | [English](presets.en.md)

模板减少重复配置，不授予输入许可，也不保证 Avatar 已生成参数。先看真实来源／地址，再选择模板并检查方向、量程与门控。[方案选择](usage-scenarios.md)

| 模板 ID | 用途 | 默认输出 |
| --- | --- | --- |
| `ogb-depth` | 现代 Socket 径向估算、旧 Socket 或 Plug 近接 | Depth → L0 |
| `ogb-touch` | Touch／Frot 或独立 VFH Touch Zone | V0 |
| `native-pb-stretch` | 原生 PB Stretch＋IsGrabbed | Depth＋GateEnable |

## OGB / SPS · 深度

默认读取 Others，路径别名为：

```text
OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers
```

OgbDepth 从同来源、完整实例与 Self／Others 类别寻找辅助现代 NewTip。现代正值存在时优先配对；缺另一通道、没有可靠估长样本时给零，不用旧高值掩盖。现代均零／缺失才回退旧近接；Socket 的旧 Close 若存在则参与门控。Plug 原值不统一反向。

NewTip 是根部长度球；结果是径向比例，不是通用轴向插入或 XYZ。实际对象需要先分开再靠近，改变 Avatar／映射／重新启用会清除学习。[几何和限制](ogb-compatibility.md)

## OGB / SPS · 振动

```text
OGB/Orf/**/TouchOthers;OGB/Orf/**/FrotOthers;OGB/Pen/**/TouchOthers;OGB/Pen/**/FrotOthers;VFH/Zone/Touch/**/Others
```

OgbTouch 为普通 Touch 配对同实例 Close；Plug Frot 也需要 Close。Socket Frot 和独立 VFH Zone 直接读取，不虚构不存在的 Close。若 Intiface 接收振动，确认其来源为 V0；L0 转振动必须另行明确选择。

## 原生 PB · 拉伸

模板使用 `MyPB_Stretch` 和 `MyPB_IsGrabbed`。把 MyPB 换成实际 PhysBone 参数前缀；抓取打开 GateEnable，松手应关门。它是标量信号，不提供局部 XYZ，也不要求 Contact 解算。

## 应用与自定义

“替换”移除当前映射，“追加”保留它们；两者都先修改草稿。检查实际路径和角色后保存，配置保存会关闭输入，再明确启用。需 Self 时修改实际类别，不混接不同对象的辅助值。

可保存／移除自定义预设。内部 QuickStart 阶梯、旧 Point／Pose、Shader 诊断均没有内置模板；合成夹具应手动配置，不作为正式方案。实验根点应使用面板的两端校准生成映射。[映射操作](guide.md) · [参数字典](osc-parameters.md)
