# One Unity authoring lifecycle / 统一 Unity 作者生命周期

Sensa 的作者脚本均实现 SDK `IEditorOnly`，保留在可序列化 Runtime 程序集中；处理器、Inspector 与构建入口位于 Editor 程序集。作者宿主保持普通 GameObject，NDMF 统一读取配置后只移除作者脚本，保留参照 Transform 与生成的原生组件。

All Sensa author scripts implement SDK `IEditorOnly` and remain in the serializable Runtime assembly. Processors, Inspectors and build entry points belong to the Editor assembly. Author hosts are ordinary GameObjects; one NDMF pass consumes settings and removes the scripts while retaining reference Transforms and native generated components.

## Generation and checks / 生成与检查

依包中已有 NDMF 1.5+、MA 1.10+ 依赖，唯一生成入口使用 `Generating.BeforePlugin("nadena.dev.modular-avatar")`，创建供 MA 消费的临时资产和标准组件。`BuildContext.GetState` 保存每次构建状态。SPS 四点定位、Contact 与 Shader 根点方式共用入口，协议按 [ADR 0003](0003-experimental-contact-positioning.md) 分别保留。

With the existing NDMF 1.5+/MA 1.10+ package dependencies, the single generator uses `Generating.BeforePlugin("nadena.dev.modular-avatar")` to create temporary MA inputs and standard components. `BuildContext.GetState` owns per-build state. SPS four-anchor tracking, Contact and Shader root routes share scheduling and retain their separate [ADR 0003](0003-experimental-contact-positioning.md) protocols.

SDK 顺序 `-1026` 的回调仅检查残留作者，位于已核验的 NDMF 前段 `-11000`、Fury `-10000` 之后，以及 NDMF 优化 `-1025`、SDK 默认清理 `-1024` 之前。该回调给未执行的 NDMF 处理或后插入作者设置明确诊断；生成仍只在 NDMF 前段进行。Optimizing 中在 MA 同阶段处理后核对作者与 Contact 数量，范围限于此检查点。

The SDK callback at `-1026` checks only remaining authors. In the audited versions it follows early NDMF `-11000` and Fury `-10000`, and precedes NDMF optimization `-1025` and default SDK cleanup `-1024`. It diagnoses disabled NDMF processing or later-inserted settings while generation remains in early NDMF. An Optimizing check follows MA's same-phase work and verifies authors and Contact count at that checkpoint.

`SensaTrackingFrame` 在同一 Generating 入口读取，位于独立根点生成之后、自动 SPS 配置之前。它解析一个参照与局部偏移，在 Avatar 根下生成只跟随平移／旋转的刚性框架，再生成 Origin／Forward／Right 三个既有协议实例。生成后移除作者脚本。设计与坐标语义见 [ADR 0009](0009-following-reference-planes.md)。

`SensaTrackingFrame` is consumed by the same Generating entry after standalone root generation and before automatic SPS setup. It resolves a reference and local offsets, generates a rigid frame under the Avatar root that follows translation/rotation, then creates Origin/Forward/Right instances of the existing tracking protocol. The author script is removed after generation. See [ADR 0009](0009-following-reference-planes.md) for the design and coordinate semantics.

## Prefabs and source assets / 预制件与源资产

三种根点作者预制件接受相同的明确 Target 类型：Transform、SPS、Sensa Component 或原生 Contact。SPS 四点定位／Contact 的空碰撞通道按唯一实例名稳定派生；Shader 编码器是包内正式资产。构建副本上的生成与引用校验保持源 Avatar、预制件和项目资产可编辑。

All three root authoring prefabs accept the same explicit Target types: Transform, SPS, Sensa Component or native Contact. For SPS four-anchor tracking and Contact direct tracking, an empty collision channel is derived from the unique instance name; the Shader encoder is a packaged asset. Generation and reference validation on the build copy preserve editable source Avatars, prefabs and project assets.

官方证据、受支持最低版本及验收范围见[构建指南](../unity-build.md)。Unity EditMode 契约的实际执行与客户端验收按[验证记录](../e2e-status.md)单独记录。

See the [build guide](../unity-build.en.md) for official evidence, minimum versions and verification scope. Record actual Unity EditMode execution and client acceptance separately in the [verification record](../e2e-status.en.md).
