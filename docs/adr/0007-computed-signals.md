# Reusable computed signals before mapping / 映射前的可复用计算信号

计算信号将多个 OSC 参数、有效定位指标、常量或其他计算组合为一个原始数值。配置使用具名定义和有界无环依赖图：最多 64 个计算、每项 16 个输入、引用深度 16 层；保存时检查重复标识、缺失引用和循环。运行时按依赖顺序复用中间结果，再沿用现有 `SignalChannelProcessor` 的校准／曲线和 `SignalMixer` 的角色融合。加权平均在融合之前完成；零权重输入不参与求值，配置中的引用仍须有效。

Computed signals combine OSC values, validated tracking metrics, constants or other computations into one raw value. Named definitions form a bounded acyclic dependency graph: at most 64 calculations, 16 inputs each and 16 reference levels. Saving validates duplicate identifiers, missing references and cycles. Runtime reuses intermediate results in dependency order, then retains the existing `SignalChannelProcessor` calibration/curves and `SignalMixer` role fusion. Weighted averaging happens before fusion. Zero-weight inputs do not participate in evaluation, while their configured references must remain valid.

实时映射与已保存配置的界面预览共用后端求值器。结果保留参与输入的同一 OSC 来源、相容空间参照与最旧样本时间；缺失、歧义、过期、模型失效或非法运算会沿依赖链传播。计算有效期默认 0，沿用来源规则，适配仅变化时发送的普通 OSC 参数；正数额外限制参与样本年龄。空间输入始终保留模型的 Sample／Frame 与实验许可检查。坐标框和量纲标记用于拒绝已知不相容空间指标，乘除后结果单位仍按实际公式解释。

Live mappings and saved-configuration previews share the backend evaluator. Results retain one contributing OSC source, compatible spatial references and the oldest sample time. Missing, ambiguous, expired or model-invalid inputs and invalid arithmetic propagate through dependencies. Computation validity defaults to zero, following source rules for ordinary change-only OSC; positive values add a contributing-sample age limit. Spatial input always retains its model's Sample/Frame and experimental-permission checks. Coordinate-frame and quantity tags reject known incompatible spatial metrics; interpret units after multiplication or division according to the actual formula.

活动计算失效时停止输出并保留输入启用状态；有效新样本可恢复联动。关闭输入、配置保存、来源切换与急停继续使用原有控制规则，计算恢复不解除急停，也不重新启用已关闭输入。[操作与例子](../computed-signals.md) · [控制入口](0001-control-and-input-activation.md)

An invalid active computation stops outputs while retaining input activation; new valid samples can resume linkage. Disabling input, saving configuration, switching sources and emergency stop keep their existing control rules. Computation recovery does not clear emergency stop or reactivate disabled input. [Operation and examples](../computed-signals.en.md) · [Control boundary](0001-control-and-input-activation.md)
