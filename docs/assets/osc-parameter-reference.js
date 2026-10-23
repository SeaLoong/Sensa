/* Shared, offline parameter explanations for the explorer and workbench.
 * 官方测量定义、生成器约定与 Sensa 协议分别注明来源；联动建议按数值含义解释。
 */
(function (root) {
  'use strict';

  const fury = 'https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/';
  const sensa = 'https://github.com/SeaLoong/Sensa/blob/main/';
  const sources = {
    contacts: { label: ['VRChat 官方：Contacts', 'VRChat: Contacts'], url: 'https://creators.vrchat.com/common-components/contacts/', kind: 'official-doc' },
    beta: { label: ['VRChat SDK 3.10.6-beta.2', 'VRChat SDK 3.10.6-beta.2'], url: 'https://github.com/vrchat/packages/releases/tag/3.10.6-beta.2', kind: 'official-sdk' },
    sockets: { label: ['VRCFury：Socket 参数生成', 'VRCFury: Socket parameter generation'], url: fury + 'Editor-Avatars/Service/BakeHapticSocketsService.cs#L174-L273', kind: 'generator-source' },
    plugs: { label: ['VRCFury：Plug 参数生成', 'VRCFury: Plug parameter generation'], url: fury + 'Editor-Avatars/Service/BakeHapticPlugsService.cs#L175-L256', kind: 'generator-source' },
    senders: { label: ['VRCFury：Plug 检测形状', 'VRCFury: Plug detection shapes'], url: fury + 'Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs#L60-L108', kind: 'generator-source' },
    receiverTypes: { label: ['VRCFury：Receiver 参数类型', 'VRCFury: Receiver parameter types'], url: fury + 'Editor-Avatars/Service/HapticContactsService.cs#L41-L66', kind: 'generator-source' },
    zones: { label: ['VRCFury：独立触摸区', 'VRCFury: independent Touch Zones'], url: fury + 'Editor-Avatars/Feature/VRCFuryHapticTouchReceiverBuilder.cs#L21-L49', kind: 'generator-source' },
    versions: { label: ['VRCFury：能力版本标记', 'VRCFury: capability-version markers'], url: fury + 'Editor-Avatars/Service/BakeHapticVersionsService.cs#L16-L29', kind: 'generator-source' },
    enabled: { label: ['VRCFury：Haptics 启用条件', 'VRCFury: Haptics enable condition'], url: fury + 'Editor-Avatars/Service/OgbEnabledService.cs#L16-L41', kind: 'generator-source' },
    heartbeat: { label: ['OGB：启用请求与心跳', 'OGB: enable requests and heartbeat'], url: 'https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/OscConnection.ts#L21-L68', kind: 'consumer-source' },
    ogbVersions: { label: ['OGB：能力版本识别', 'OGB: capability-version recognition'], url: 'https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/main.ts#L108-L120', kind: 'consumer-source' },
    ogb: { label: ['OGB：参数读取与深浅换算', 'OGB: parameter reading and depth conversion'], url: 'https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts#L63-L149', kind: 'consumer-source' },
    contactProtocol: { label: ['Sensa：Contact 参数协议', 'Sensa: Contact parameter protocol'], url: [sensa + 'docs/contact-sdk.md', sensa + 'docs/contact-sdk.en.md'], kind: 'sensa-protocol' },
    positioning: { label: ['Sensa：定位与坐标定义', 'Sensa: positioning and coordinate definitions'], url: [sensa + 'docs/positioning.md', sensa + 'docs/positioning.en.md'], kind: 'sensa-protocol' },
    dictionary: { label: ['Sensa：OSC 参数字典', 'Sensa: OSC parameter reference'], url: [sensa + 'docs/osc-parameters.md', sensa + 'docs/osc-parameters.en.md'], kind: 'sensa-protocol' },
    shader: { label: ['Sensa：Shader 编码与桥接协议', 'Sensa: Shader encoding and bridge protocol'], url: [sensa + 'docs/shader-capture-research.md', sensa + 'docs/shader-capture-research.en.md'], kind: 'sensa-protocol' },
    raycast: { label: ['VRChat 官方：Raycast 参数', 'VRChat: Raycast parameters'], url: 'https://creators.vrchat.com/avatars/avatar-components/raycast/#raycast-parameters', kind: 'official-doc' },
    builtins: { label: ['VRChat 官方：内建 Animator 参数', 'VRChat: built-in Animator parameters'], url: 'https://creators.vrchat.com/avatars/animator-parameters/#built-in-parameters', kind: 'official-doc' },
    scaling: { label: ['VRChat 官方：Avatar 缩放参数', 'VRChat: Avatar scaling parameters'], url: 'https://creators.vrchat.com/avatars/animator-parameters/#avatar-scaling-parameters', kind: 'official-doc' },
    physbones: { label: ['VRChat 官方：PhysBone 参数', 'VRChat: PhysBone parameters'], url: 'https://creators.vrchat.com/common-components/physbones/#options', kind: 'official-doc' },
  };
  const definitionLabels = {
    sdk: ['VRChat SDK 说明', 'VRChat SDK definition'],
    fury: ['VRCFury 生成定义', 'VRCFury generated definition'],
    ogb: ['OGB 参数约定', 'OGB parameter convention'],
    sensa: ['Sensa 协议说明', 'Sensa protocol definition'],
  };
  const unitless = ['无量纲', 'Dimensionless'];
  const booleanRange = ['0／1（false／true）', '0 / 1 (false / true)'];
  const axes = { X: ['左右', 'left/right'], Y: ['上下', 'up/down'], Z: ['前后', 'forward/back'] };
  const entry = (name, origin, data) => ({ name, definitionLabel: definitionLabels[origin], ...data });
  const proximity = data => ({ valueType: 'Float', range: '0–1', unit: unitless, ...data });
  const gate = data => ({ valueType: 'Bool', range: booleanRange, unit: unitless, ...data });
  const constant = data => ({ valueType: 'Float', range: '0 / 1', unit: unitless, ...data });

  function contact(name) {
    const common = { sources: [sources.beta, sources.contacts, sources.contactProtocol] };
    if (name === 'Proximity') return entry(name, 'sdk', proximity({ ...common,
      title: ['接近程度', 'Proximity'],
      summary: ['表示专用根点标记离接收区域中心有多近，数值越大表示越靠近。', 'Shows how close the dedicated root marker is to the receiver region’s center; higher means closer.'],
      definition: ['Proximity Receiver 按 Sender 最近表面到接收形状中心的距离输出 0–1。多个匹配目标同时出现时，选择接近值严格大于零且最大的 Sender。', 'A Proximity Receiver reports 0–1 from the nearest Sender surface to the receiver shape center. Among matching targets, it selects the Sender with the greatest strictly positive proximity.'],
      usage: ['可表示接近强度；读取具体位置或速度时，同时使用 SenderType、Radius 与活动 Sample 确认这组测量可用。', 'Use it for approach intensity. Combine SenderType, Radius and active Sample when reading the associated position or velocity.'],
    }));
    if (name === 'Proximity_SenderType') return entry(name, 'sdk', { ...common,
      valueType: 'Int', range: ['0 无目标；1 自身；2 他人；3 世界', '0 none; 1 self; 2 another avatar; 3 world'], unit: unitless,
      title: ['当前目标的类别', 'Selected target category'],
      summary: ['说明 SDK 当前选中的匹配目标来自哪里。Sensa 专用根点使用自身 Avatar 的目标。', 'Identifies where the SDK’s selected matching target comes from. Sensa’s dedicated root marker belongs to the local Avatar.'],
      definition: ['SDK 以 0 表示没有选中的 Sender，1 表示自身 Avatar，2 表示其他 Avatar，3 表示世界 Sender。没有目标时，报告的位置和速度归零。', 'The SDK reports 0 for no selected Sender, 1 for the local Avatar, 2 for another Avatar, and 3 for a world Sender. Position and velocity reports return to zero when there is no selected target.'],
      usage: ['Sensa Contact 根点以类型 1 配合活动 Sample 判断测量有效性，原点坐标和静止零速度也能正常使用。', 'Sensa Contact roots use type 1 together with active Sample to determine validity, including an origin position or zero velocity at rest.'],
    });
    const position = /^Proximity_SenderLocalPosition([XYZ])$/.exec(name);
    if (position) {
      const axis = position[1], direction = axes[axis];
      return entry(name, 'sdk', { ...common, valueType: 'Float', range: ['带符号坐标；受当前 Radius 覆盖范围约束', 'Signed coordinate within the current Radius coverage'], unit: 'm',
        title: [`${axis} 方向位置`, `${axis} position`],
        summary: [`表示目标相对接收器的${direction[0]}位置；正、负值表示该轴的两个方向。`, `The target’s ${direction[1]} position relative to the receiver; positive and negative values indicate opposite directions along the axis.`],
        definition: [`SDK 报告 Sender 形状中点相对 Receiver 形状中点的 ${axis} 位移，旋转到 Receiver 坐标轴，保留物理米单位。Sensa 专用 Receiver 位于 Avatar 根原点，各轴随 Avatar 根旋转。`, `The SDK reports the ${axis} displacement from Receiver shape midpoint to Sender shape midpoint, rotated into Receiver axes and retaining physical metres. Sensa’s dedicated Receiver sits at the Avatar root origin and follows its rotated axes.`],
        usage: [`可将所选${direction[0]}方向的两个位置校准为联动起点与终点，也可与同坐标框的其他位置计算间距。`, `Calibrate two positions along this ${direction[1]} axis as interaction endpoints, or calculate separation from other positions in the same coordinate frame.`],
      });
    }
    const velocity = /^Proximity_SenderVelocity([XYZ])$/.exec(name);
    if (velocity || name === 'Proximity_SenderVelocityMagnitude') {
      const axis = velocity?.[1], magnitude = !axis;
      return entry(name, 'sdk', { ...common, valueType: 'Float', range: magnitude ? ['≥0；静止为 0', '≥0; 0 at rest'] : ['带符号速度；静止为 0', 'Signed velocity; 0 at rest'], unit: 'm/s',
        title: magnitude ? ['相对运动速率', 'Relative speed'] : [`${axis} 方向相对速度`, `${axis} relative velocity`],
        summary: magnitude ? ['表示双方在近似接触点处相对运动的快慢。', 'Shows how quickly the pair moves relative to one another near their contact point.'] : [`表示双方沿 Receiver ${axis} 轴相对运动的方向与快慢。`, `Shows the direction and rate of relative movement along Receiver axis ${axis}.`],
        definition: magnitude ? ['SDK 报告近似接触点处 Sender 相对 Receiver 的速度模长，包含双方旋转带来的角运动影响。零值表示此处相对静止。', 'The SDK reports the magnitude of Sender velocity relative to Receiver at an approximate contact point, including angular motion from both shapes. Zero indicates relative rest there.'] : [`SDK 报告近似接触点处 Sender 相对 Receiver 的 ${axis} 速度分量，使用 Receiver 旋转后的坐标轴，包含角运动影响。负值表示沿该轴负向运动。`, `The SDK reports the ${axis} component of Sender velocity relative to Receiver at an approximate contact point, on Receiver-rotated axes and including angular motion. Negative values move along the negative axis.`],
        usage: magnitude ? ['适合按运动快慢校准振动等强度。位置可在静止时保持，速率则回到零速端点。', 'Calibrate movement speed to an intensity such as vibration. A position can remain held at rest while speed returns to its zero-speed endpoint.'] : ['可按往返方向分别设置响应，或将三个同单位分量通过“向量长度”合成为速率。', 'Use the movement direction to vary a response, or combine the three components with Magnitude to obtain speed.'],
      });
    }
    if (name === 'Proximity_ProximitySpeed') return entry(name, 'sdk', { ...common,
      title: ['接近值的变化速度', 'Rate of proximity change'], valueType: 'Float', range: ['带符号；读数稳定时为 0', 'Signed; 0 when the reading is steady'], unit: '1/s',
      summary: ['表示接近程度每秒增加或减少多少：正值为增加，负值为减少。', 'Shows how much proximity increases or decreases each second: positive for increasing and negative for decreasing.'],
      definition: ['SDK 按相邻帧 Proximity 的差除以时间间隔求变化率。进入或离开接收区时可能出现短暂变化。', 'The SDK divides the change in Proximity between frames by elapsed time. Entry into or exit from the receiver region may produce a transient.'],
      usage: ['可分别校准靠近与退出时的动作强度，使用接近值／秒的量程；m/s 的相对速度使用自己的量程。', 'Calibrate approach and retreat intensity using a proximity-units-per-second range. Relative velocity in m/s uses its own range.'],
    });
    if (name === 'Radius') return entry(name, 'sensa', { sources: [sources.contactProtocol, sources.contacts],
      title: ['当前检测半径', 'Current detection radius'], valueType: 'Float', range: '0 < Radius ≤ 3', unit: 'm',
      summary: ['表示接收球当前实际覆盖的世界半径，随 Avatar 缩放更新。', 'The receiving sphere’s current physical world radius, updated with Avatar scaling.'],
      definition: ['Sensa 将制作时的接收半径换算为当前世界米制半径并发布为 Radius。它用于覆盖与缩放检查；有效范围受 SDK 的 3 m 半径上限约束。', 'Sensa converts the authored receiver radius into its current world radius in metres and publishes Radius. It supports coverage and scaling checks, within the SDK’s 3 m radius limit.'],
      usage: ['用来理解目标能被检测的范围；位置联动仍选择 X／Y／Z 或 Distance 指标。', 'Use it to understand detection coverage; select X/Y/Z or Distance for position interaction.'],
    });
    if (name === 'Sample') return activity(name, 'contact');
    return null;
  }

  function activity(name, family) {
    const contactFamily = family === 'contact';
    return entry(name, 'sensa', { sources: [contactFamily ? sources.contactProtocol : sources.dictionary],
      title: ['测量更新活动', 'Measurement activity'], valueType: 'Float', range: ['0 停用；n/32，n=1…32', '0 inactive; n/32, n=1…32'], unit: ['循环计数', 'Cyclic counter'],
      summary: ['循环变化表示测量组件仍在发布更新，0 表示测量停用或失效。', 'A changing cyclic value indicates that the measurement component keeps publishing; 0 indicates disabled or invalid measurement.'],
      definition: ['Sensa 目标每 50 ms 将计数推进一档，从 1/32 到 1 循环。桌面按值最后变化的时间检查活动，重复同一个值沿用原变化时间。', 'Sensa aims to advance one counter step every 50 ms, cycling from 1/32 to 1. The desktop checks time since the value last changed; repeated identical values retain that change time.'],
      usage: contactFamily ? ['与完整 Contact 字段和 Self 类型共同判断位置与速度是否可用，保持静止也可通过活动计数确认更新持续。', 'Together with complete Contact fields and Self type, it determines usable position and velocity. Activity can keep advancing while the target rests.'] : ['与 P0–P3 四路距离共同判断根点位置是否可用。活动、覆盖与几何检查共同决定坐标有效性。', 'Use it with all four P0–P3 measurements to determine usable root position. Activity, coverage and geometry checks establish coordinate validity together.'],
    });
  }

  function ogb(side, name) {
      const socket = side === 'Orf', baseSources = [socket ? sources.sockets : sources.plugs, sources.receiverTypes, sources.contacts];
    const modern = /^Pen(Self|Others)New(Root|Tip)$/.exec(name);
    if (socket && modern) {
      const rootMarker = modern[2] === 'Root', own = modern[1] === 'Self';
      return entry(name, 'fury', proximity({ sources: [sources.sockets, sources.senders, sources.ogb, sources.contacts],
        title: rootMarker ? ['SPS2 根部接近值', 'SPS2 root proximity'] : ['SPS2 长度球接近值', 'SPS2 length-sphere proximity'],
        summary: rootMarker ? ['表示 Plug 根部的小球标记离 Socket 根中心有多近。', 'Shows how close the small Plug-root marker is to the Socket root center.'] : ['表示以 Plug 根为球心、半径等于 Plug 长度的球体离 Socket 根中心有多近。', 'Shows how close a sphere centered at the Plug root, with radius equal to Plug length, is to the Socket root center.'],
        definition: rootMarker ? [`VRCFury 在 Socket 根中心生成 R=1 的 Proximity Receiver，读取${own ? '自身' : '其他 Avatar'} Plug 的根部 Sender。固定生成器的根部 Sender 半径为 0.01 m。实际检测尺寸随生成布置与缩放确定。`, `VRCFury generates an R=1 Proximity Receiver at the Socket root, reading the ${own ? 'local Avatar’s' : 'other Avatar’s'} Plug-root Sender. The pinned generator uses a 0.01 m root Sender radius. Effective detection dimensions follow the generated arrangement and scale.`] : [`VRCFury 在 Socket 根中心生成 R=1 的 Proximity Receiver，读取${own ? '自身' : '其他 Avatar'} Plug 的长度球 Sender。该球以根部为中心，半径等于生成时的 Plug 长度 L。`, `VRCFury generates an R=1 Proximity Receiver at the Socket root, reading the ${own ? 'local Avatar’s' : 'other Avatar’s'} Plug length-sphere Sender. The sphere is centered at the root and has radius equal to the generated Plug length L.`],
        usage: ['同一来源、同一 Socket 和同一 Self／Others 类别的 NewRoot 与 NewTip 配对，可估算 Plug 长度并换算进入深浅；再按实际动作校准范围。', 'Pair NewRoot and NewTip from the same source, Socket and Self/Others category to estimate Plug length and derive entry depth; calibrate the range against the actual movement.'],
      }));
    }
    const legacy = /^Pen(Self|Others)(Close)?$/.exec(name);
    if (legacy && (!legacy[2] || socket) && !(socket && legacy[1] === 'Self' && legacy[2])) {
      const close = !!legacy[2], historic = socket && legacy[1] === 'Self';
      const data = { sources: historic ? [sources.ogb, sources.contacts] : [...baseSources, sources.ogb],
        title: close ? ['SPS1 有效接近区开关', 'SPS1 proximity-region gate'] : [socket ? 'SPS1 进入深浅趋势' : 'Plug 进入深浅趋势', socket ? 'SPS1 entry-depth trend' : 'Plug entry-depth trend'],
        summary: close ? ['匹配目标进入这组检测范围时为 1，离开时为 0。', '1 while a matching target occupies this detection region; 0 after it leaves.'] : ['对齐靠近时，可把变化理解为进入深浅的趋势，再用实际两端动作校准。', 'During aligned approach, its change can indicate entry depth; calibrate it with the actual movement endpoints.'],
        definition: historic ? ['官方 OGB 消费端直接读取历史 Orf/PenSelf 的数值。实际检测区域和量程按发布该参数的 Avatar 组件设置确定。', 'The OGB consumer directly reads the historical Orf/PenSelf value. The publishing Avatar component determines the actual detection geometry and range.'] : close ? ['VRCFury 为 Socket 的对应 Plug 标签生成 Constant 胶囊接收器，参数声明为 Float。有效检测区域内存在匹配 Contact 时输出 1，离开后输出 0。', 'VRCFury generates a Constant capsule receiver for the Socket’s matching Plug tag and declares a Float parameter. It reports 1 while a matching Contact occupies its effective region and 0 after it leaves.'] : socket ? ['VRCFury 在 Socket 入口内侧生成 Proximity Receiver，检测以 Plug 根为中心、半径为长度 L 的 Sender 球。输出由检测几何与相对位置共同决定。', 'VRCFury generates a Proximity Receiver inside the Socket opening, detecting a Sender sphere centered at the Plug root with radius L. Detection geometry and relative position determine the reading.'] : ['VRCFury 在 Plug 根中心生成半径为 Plug 长度 L 的 Proximity Receiver，检测对应类别的 Socket 根标记。', 'VRCFury generates a Proximity Receiver at the Plug root with radius equal to Plug length L, detecting the matching category of Socket-root marker.'],
        usage: close ? ['作为配对 Pen 参数的生效条件，例如映射到 GateEnable，让动作跟随有效检测区的进入和离开。', 'Use it as the validity gate for the companion Pen parameter, such as GateEnable, so interaction follows entry into and exit from the detection region.'] : socket && !historic ? ['与同一实例、同类别的 Close 配对，再将校准后的深浅趋势映射为目标行程。', 'Pair it with Close from the same instance and category, then map the calibrated depth trend to target travel.'] : ['可直接校准进入深浅的两个端点，再按需要设置方向与曲线。', 'Calibrate the two depth endpoints directly, then set direction and curve as needed.'],
      };
      if (historic) data.valueType = ['数值；类型以发布方为准', 'Numeric; type follows the publisher'];
      return entry(name, historic ? 'ogb' : 'fury', close ? constant(data) : proximity(data));
    }
    const touch = /^(Touch|Frot)(Self|Others)(Close)?$/.exec(name);
    if (touch) {
      const rubbing = touch[1] === 'Frot', close = !!touch[3];
      if (rubbing && (touch[2] !== 'Others' || socket && close)) return null;
      return entry(name, 'fury', (close ? constant : proximity)({ sources: baseSources,
        title: close ? ['接触区域开关', 'Contact-region gate'] : rubbing ? ['贴近与摩擦强度', 'Close-contact and rubbing intensity'] : ['身体触碰强度', 'Body-touch intensity'],
        summary: close ? ['表示匹配目标是否进入对应的触碰或摩擦检测区。', 'Indicates whether a matching target occupies the corresponding touch or rubbing detection region.'] : rubbing ? ['表示附近匹配 Socket 或 Plug 标记的靠近程度，可用于擦过时的触感。', 'Shows proximity of a matching Socket or Plug marker, useful for feedback as it passes nearby.'] : ['表示匹配身体部位靠近这个触碰区域的程度。', 'Shows how closely a matching body part approaches this touch region.'],
        definition: close ? ['VRCFury 使用 Constant 胶囊接收器，并声明 Float 参数提供 0／1 区域状态。SDK 按碰撞标签和 Self／Others 筛选目标，区域中存在匹配 Contact 时输出 1。', 'VRCFury uses a Constant capsule receiver and declares a Float parameter for a 0/1 region state. The SDK filters by collision tags and Self/Others and reports 1 while a matching Contact occupies the region.'] : rubbing ? (socket ? ['Socket FrotOthers 的 Proximity 球位于根前方 0.05 m、半径 0.1 m，检测其他 Avatar 的 Socket 根标签。尺寸按实际生成与缩放解释。', 'Socket FrotOthers uses a Proximity sphere 0.05 m in front of the root with radius 0.1 m, detecting another Avatar’s Socket-root tag. Effective dimensions follow generation and scaling.'] : ['Plug FrotOthers 的 Proximity 球以 Plug 根为中心、半径等于长度 L，检测其他 Plug 的包络 Sender，并提供 Close 区域开关。', 'Plug FrotOthers uses a Proximity sphere at the Plug root with radius L, detecting another Plug’s envelope Sender and providing a Close region gate.']) : [`VRCFury 使用 Proximity Receiver 检测${socket ? 'Head／Hand／Foot／Finger 等按类别配置的' : 'Hand／Foot／Finger'}身体标签。检测中心、半径及对应的 Close 区域由 Socket 或 Plug 的生成设置确定。`, `VRCFury uses a Proximity Receiver for ${socket ? 'body tags such as Head/Hand/Foot/Finger, according to category' : 'Hand/Foot/Finger body tags'}. Socket or Plug generation settings determine its center, radius and companion Close region.`],
        usage: close ? ['与同一对象、同类别的 Touch 或 Frot 强度配对，控制何时采用接触强度。', 'Pair it with Touch or Frot intensity from the same object and category to control when the intensity applies.'] : !rubbing || !socket ? ['可校准为振动等强度，配合同一实例和类别的 Close 作为接触条件。', 'Calibrate it to an intensity such as vibration, using Close from the same instance and category as the contact condition.'] : ['可直接校准为贴近或擦过时的振动强度。', 'Calibrate it directly to vibration intensity for close approach or passing contact.'],
      }));
    }
    return null;
  }

  function spatial(family, name, marker, anchor) {
    if (family === 'SPS' && name === 'Sample') return activity(name, 'sps');
    const fixed = family === 'SPS';
    return entry(name, 'sensa', proximity({ sources: [sources.positioning, sources.dictionary, sources.contacts],
      title: fixed ? [`测量点 ${name} 的接近读数`, `Anchor ${name} proximity`] : [`${marker} 标记的 A${anchor} 接近读数`, `${marker} marker: A${anchor} proximity`],
      summary: ['数值越大，表示目标标记越靠近这个接收器的中心。', 'Higher values indicate that the target marker is closer to this receiver’s center.'],
      definition: fixed ? ['Sensa 在四个已知位置放置 P0–P3 接收器，读取同一个 SPS Socket／Plug 根点标记的接近程度。按已知半径换算距离后，四路读数共同解算 Avatar 根局部位置。', 'Sensa places P0–P3 receivers at four known positions, measuring one SPS Socket/Plug root marker. Known radii convert proximity into distance; all four measurements reconstruct position in Avatar-root local coordinates.'] : family === 'Pose' ? ['Sensa 在参考对象内为 Root／Tip／Side 三个标记分别读取八路接近测量。完整测量组先解算各标记的位置，再建立位置与朝向；长度按参考对象局部单位解释。', 'Sensa reads eight proximity measurements for each Root/Tip/Side marker in the reference frame. The complete group reconstructs marker positions and then pose; lengths use reference-local units.'] : ['Sensa 在参考对象内读取四路已知几何的接近测量，用完整测量组解算点的位置；长度按参考对象的局部单位解释。', 'Sensa reads four proximity measurements with known geometry in the reference frame, reconstructing point position from the complete group; lengths use reference-local units.'],
      usage: ['在映射或计算信号中选择解算后的 X／Y／Z、Distance 等指标，再校准实际希望联动的移动范围。', 'Select reconstructed metrics such as X/Y/Z or Distance in a mapping or computed signal, then calibrate the intended movement range.'],
    }));
  }

  function shader(name) {
    const common = { sources: [sources.shader, sources.dictionary] };
    if (/^(Right|Forward)[XYZ]$/.test(name)) {
      const localAxis = name.startsWith('Right') ? 'X' : 'Z', component = name.at(-1);
      return entry(name, 'sensa', { ...common, valueType: 'Float', range: '−8–8',
        unit: ['根局部单位／目标局部单位', 'Root-local units per target-local unit'],
        title: [`目标 ${localAxis} 轴 · ${component} 分量`, `Target ${localAxis} axis · ${component} component`],
        summary: [`目标局部 ${localAxis} 轴在 Avatar 根坐标系中的 ${component} 分量。`, `The ${component} component of the target-local ${localAxis} axis in the Avatar-root frame.`],
        definition: ['Sensa 用目标原点及局部 X、Z 方向各 0.1 单位的三个渲染采样点形成三角形。两条边除以 0.1，得到 RightXYZ 与 ForwardXYZ；它们保留方向、轴长和斜切，使用有符号 16 位量化。', 'Sensa forms a triangle from three render samples: the target origin and points 0.1 local units along X and Z. Dividing the two edges by 0.1 gives RightXYZ and ForwardXYZ, preserving axis direction, length and shear with signed 16-bit quantization.'],
        usage: ['在“定位测量”中选择分量用于映射，或用计算信号组合三项向量；完整包有效性检查持续适用。两条向量共同描述目标 X／Z 平面。', 'Select a Tracking measurement component for mappings, or combine its three components in a computed signal, retaining complete-packet validity checks. The two vectors describe the target X/Z plane.'],
      });
    }
    if (name === 'AvatarScale') return entry(name, 'sensa', { ...common, valueType: 'Float', range: '(0, 8]',
      unit: ['米／根局部单位', 'Metres per root-local unit'], title: ['Avatar 根单位缩放', 'Avatar-root unit scale'],
      summary: ['每个 Avatar 根局部单位对应的世界米数。', 'World metres per Avatar-root local unit.'],
      definition: ['Sensa 将 Avatar 根的单位缩放量化为 16 位无符号数，桥接后通过 AvatarScale 发布。XYZ 保持根局部坐标，AvatarScale 提供它们与世界米数之间的比例。', 'Sensa quantizes the Avatar-root unit scale as an unsigned 16-bit value and the bridge publishes it as AvatarScale. XYZ retain root-local coordinates; AvatarScale provides their conversion to world metres.'],
      usage: ['通过定位测量读取 AvatarScale，用计算信号将局部位移乘以它，可得到沿 Avatar 根坐标轴的米制位移；单位换算使用同一有效包中的缩放。', 'Read AvatarScale through Tracking measurement, then multiply local displacement by it in a computed signal for metre-based displacement along the Avatar-root axes, using scale from the same valid packet.'],
    });
    if (/^[XYZ]$/.test(name)) return entry(name, 'sensa', { ...common, valueType: 'Float', unit: ['Avatar 根局部单位', 'Avatar-root local units'],
      range: name === 'Y' ? '−1–3' : '−2–2', title: [`根点 ${name} 坐标`, `Root ${name} coordinate`],
      summary: [`表示根点相对 Avatar 根的${axes[name][0]}位置。`, `The root’s ${axes[name][1]} position relative to the Avatar root.`],
      definition: ['Avatar 渲染组件将根点局部坐标量化到编码画面，桥接程序校验并解码后通过 OSC 发布。当前坐标框为 AvatarRootLocal，中心 (0,1,0)，各轴半范围为 2。', 'Avatar render components quantize root-local coordinates into an encoded image. The bridge validates and decodes that image for OSC. The current AvatarRootLocal frame is centered at (0,1,0), with half-range 2 on each axis.'],
      usage: ['可把两个期望位置校准为目标行程端点，也可在同坐标框中组合计算；有效性同时使用 Frame 与 Valid 检查。', 'Calibrate two intended positions as target-travel endpoints or combine values in the same coordinate frame, with Frame and Valid establishing validity.'],
    });
    if (name === 'Frame') return entry(name, 'sensa', { ...common, valueType: ['Float（整数序号）', 'Float (integer sequence)'], unit: ['编码计数', 'Encoder count'], range: '0–65535',
      title: ['编码画面序号', 'Encoded-frame sequence'],
      summary: ['序号持续前进，表示桥接程序正在接收更新的编码画面。', 'An advancing sequence indicates that the bridge is receiving updated encoded images.'],
      definition: ['Sensa 通过 _Time×60 的编码时钟生成 16 位循环计数。桥接与桌面使用其变化检查编码画面更新，达到上限后回到 0；计数节奏由编码时钟决定。', 'Sensa derives a cyclic 16-bit count from the _Time×60 encoder clock. The bridge and desktop use changes to check for updated encoded images; the count wraps to 0 and follows the encoder clock.'],
      usage: ['用于检查编码活动，与同一批坐标、Right／Forward 向量、AvatarScale 和 Valid 一起读取。', 'Check encoder activity alongside the coordinates, Right/Forward vectors, AvatarScale and Valid from the same update.'],
    });
    if (name === 'Valid') return entry(name, 'sensa', gate({ ...common, valueType: ['Float（0／1 标记）', 'Float (0/1 flag)'], range: '0 / 1',
      title: ['坐标更新可用标记', 'Coordinate-update validity'],
      summary: ['1 提交一组完整可用坐标，0 表示当前坐标失效并停止相关联动。', '1 commits a complete usable coordinate update; 0 invalidates it and stops the associated interaction.'],
      definition: ['桥接程序按 Frame、X、Y、Z、RightX、RightY、RightZ、ForwardX、ForwardY、ForwardZ、AvatarScale、Valid 顺序发布有效更新，以 Valid=1 完成提交。失效时发布 Valid=0；恢复需要完整的 12 字段包和更新的 Frame。', 'The bridge publishes a valid update in Frame, X, Y, Z, RightX, RightY, RightZ, ForwardX, ForwardY, ForwardZ, AvatarScale, Valid order, committing with Valid=1. It publishes Valid=0 on invalidation; recovery requires the complete 12-field packet and a fresh Frame.'],
      usage: ['结合编码活动、坐标范围、有效的两条轴向量和单位缩放，判断整组数据何时可以驱动动作。', 'Use encoder activity, coordinate bounds, two usable axis vectors and unit scale to determine when the packet can drive interaction.'],
    }));
    return null;
  }

  function raycast(name, field) {
    const data = { sources: [sources.raycast, sources.dictionary] };
    if (field === 'Hit') return entry(name, 'sdk', gate({ ...data,
      title: ['射线是否命中', 'Raycast hit state'],
      summary: ['表示当前射线是否碰到了可检测表面。', 'Indicates whether the current ray intersects a detectable surface.'],
      definition: ['VRCRaycast 的 Hit 参数在命中时为 true，未命中时为 false。Sensa 从所选原点沿本地 +Z 发射射线。', 'VRCRaycast reports Hit=true on a hit and false on a miss. Sensa casts from the selected origin along local +Z.'],
      usage: ['适合作为 GateEnable 条件，只在命中有效时采用配套的 Ratio 或 Distance。', 'Use it as GateEnable so the companion Ratio or Distance applies while a hit is valid.'],
    }));
    const ratio = field === 'Ratio';
    return entry(name, 'sdk', { ...data, valueType: 'Float', unit: ratio ? unitless : 'm', range: ratio ? '0–1' : ['0～配置的最大距离', '0 to configured maximum distance'],
      title: ratio ? ['命中距离比例', 'Hit-distance ratio'] : ['到命中表面的距离', 'Distance to the hit surface'],
      summary: ratio ? ['表示命中点处于射线量程的哪个位置：0 为起点，1 为量程末端。', 'Shows where the hit lies within the ray’s range: 0 at the start, 1 at maximum distance.'] : ['表示射线原点到命中表面的实际距离，单位为米。', 'The physical distance in metres from ray origin to the hit surface.'],
      definition: ratio ? ['VRCRaycast 将命中距离除以最大距离，输出 0–1。Sensa 当前采用 DoNothing 未命中行为：未命中时保留最近命中距离，首次命中前为 0。', 'VRCRaycast divides hit distance by maximum distance to report 0–1. Sensa currently uses DoNothing on a miss: the latest hit distance is retained, with 0 before the first hit.'] : ['VRCRaycast 报告原点到命中点的世界距离。Sensa 关闭 ApplyTransformScale，以米配置量程；DoNothing 未命中行为保留最近读数，首次命中前为 0。', 'VRCRaycast reports world distance from origin to hit point. Sensa disables ApplyTransformScale and configures its range in metres; DoNothing retains the latest reading on a miss, with 0 before the first hit.'],
      usage: ['配合对应的 Hit 确认当前命中，再将距离校准为位置或接近强度；需要越近越强时可设置反向。', 'Confirm the current hit with the companion Hit value, then calibrate distance to position or proximity intensity; invert the mapping when closer should produce a stronger response.'],
    });
  }

  function builtin(name) {
    const common = { sources: [sources.builtins] };
    const velocity = /^Velocity([XYZ])$/.exec(name);
    if (velocity || name === 'VelocityMagnitude') {
      const axis = velocity?.[1];
      return entry(name, 'sdk', { ...common, valueType: 'Float', unit: 'm/s', range: axis ? ['带符号速度', 'Signed velocity'] : '≥0',
        title: axis ? [`玩家 ${axis} 方向移动速度`, `Player ${axis} movement velocity`] : ['玩家移动速率', 'Player movement speed'],
        summary: axis ? [`表示玩家${axes[axis][0]}方向的移动速度。`, `The player’s ${axes[axis][1]} movement velocity.`] : ['表示玩家整体移动的快慢。', 'How quickly the player moves overall.'],
        definition: ['VRChat 内建 Animator 参数使用 m/s 表示玩家运动；X 为横向，Y 为垂直，Z 为前向，Magnitude 为速度模长。可接收哪些参数由 Avatar 配置与实际 OSC 发布决定。', 'VRChat built-in Animator parameters describe player movement in m/s: X is sideways, Y vertical, Z forward, and Magnitude is total speed. Avatar configuration and actual OSC publication determine which parameters are received.'],
        usage: ['可按行走、升降或整体移动的强弱设置响应。局部 Contact 交互读取专用 Contact 的相对速度字段。', 'Vary a response with walking, vertical movement or overall movement intensity. Dedicated Contact relative-velocity fields describe local Contact interaction.'],
      });
    }
    const states = {
      Grounded: { ...gate({}), title: ['玩家着地状态', 'Player grounded state'], summary: ['true 表示玩家当前着地。', 'True while the player is grounded.'], definition: ['官方内建 Grounded Bool 表示玩家是否处于着地状态。', 'The built-in Grounded Bool indicates whether the player is grounded.'], usage: ['可作为着地动作的条件，配合其他数值决定强度。', 'Use it as a condition for grounded interactions, with other values setting intensity.'] },
      IsLocal: { ...gate({}), title: ['本机 Avatar 状态', 'Local Avatar state'], summary: ['true 表示这是本机用户佩戴的 Avatar。', 'True for the Avatar worn by the local user.'], definition: ['官方 IsLocal 用于区分本机用户与远端 Avatar 的 Animator 执行状态。', 'The built-in IsLocal distinguishes the local user’s Avatar from remote Avatars in Animator execution.'], usage: ['可用于理解本地生成与采样条件，动作强度继续读取对应测量值。', 'Use it to understand local generation and sampling conditions; measurement values provide interaction intensity.'] },
      AFK: { ...gate({}), title: ['用户暂离状态', 'User away state'], summary: ['true 表示 VRChat 将用户判定为暂离或当前不可用。', 'True when VRChat considers the user away or unavailable.'], definition: ['官方 AFK Bool 表示当前用户的暂离状态；具体判定由客户端处理。', 'The built-in AFK Bool reports the user’s away state, as determined by the client.'], usage: ['可作为暂停或切换联动状态的条件。', 'Use it as a condition to pause or switch interaction state.'] },
      Upright: { ...proximity({}), title: ['身体直立程度', 'Upright amount'], summary: ['接近 1 表示直立，接近 0 表示俯卧。', 'Near 1 means upright; near 0 means prone.'], definition: ['官方 Upright Float 在 0（俯卧）到 1（直立）之间表示玩家的直立程度。', 'The built-in Upright Float ranges from 0 for prone to 1 for upright.'], usage: ['可按站立与俯身姿态调整动作范围或强度。', 'Vary interaction range or intensity between upright and lowered postures.'] },
      Voice: { ...proximity({}), title: ['麦克风音量', 'Microphone loudness'], summary: ['表示麦克风声音的当前强弱。', 'The current loudness of microphone audio.'], definition: ['官方 Voice Float 在 0–1 之间报告麦克风音量。', 'The built-in Voice Float reports microphone loudness from 0 to 1.'], usage: ['可根据声音强弱设置强度响应，并按实际接收音量校准。', 'Vary intensity with voice loudness and calibrate against the received range.'] },
      AngularY: { valueType: 'Float', range: ['带符号值；按实际接收校准', 'Signed value; calibrate against received data'], unit: ['官方文档未注明', 'Not specified in the official documentation'], title: ['Y 轴旋转速度', 'Y-axis angular velocity'], summary: ['描述玩家绕 Y 轴转向的方向与快慢。', 'Describes the direction and rate of turning around the player’s Y axis.'], definition: ['官方定义为 Y 轴角速度，文档未给出单位；正负数值和量程以实际接收结果校准。', 'The official definition is Y-axis angular velocity. Its unit is unspecified in the documentation; calibrate sign and range against received data.'], usage: ['可按转向动作设置响应，先采集希望使用的两个端点。', 'Vary a response with turning, after capturing the intended endpoints.'] },
      VRMode: { valueType: 'Int', range: ['0 桌面；1 VR', '0 desktop; 1 VR'], unit: unitless, title: ['客户端交互模式', 'Client interaction mode'], summary: ['表示用户使用桌面模式还是 VR 模式。', 'Indicates whether the user is in desktop or VR mode.'], definition: ['官方 VRMode Int 以 0 表示非 VR，1 表示 VR。', 'The built-in VRMode Int is 0 outside VR and 1 in VR.'], usage: ['可作为选择不同联动配置的条件。', 'Use it as a condition for selecting different interaction settings.'] },
      Viseme: { valueType: 'Int', range: ['口型编号 0–14；Jawbone／Jawflap 模式音量 0–100', 'Viseme index 0–14; loudness 0–100 in Jawbone/Jawflap mode'], unit: unitless, title: ['口型或下颌驱动值', 'Viseme or jaw-drive value'], summary: ['根据 Avatar 的口型配置，表示当前口型编号或下颌音量驱动。', 'Depending on Avatar lip-sync settings, this is the current viseme index or jaw loudness drive.'], definition: ['官方 Viseme Int 在 Viseme 模式下为 0–14 的口型编号；Jawbone／Jawflap 模式下改为 0–100 的音量值。', 'The built-in Viseme Int is an index from 0 to 14 in Viseme mode, or a loudness value from 0 to 100 in Jawbone/Jawflap mode.'], usage: ['先确认 Avatar 的口型模式，再选择按口型条件或音量强弱驱动响应。', 'Confirm the Avatar’s lip-sync mode, then choose a viseme condition or loudness-driven response.'] },
    };
    if (states[name]) return entry(name, 'sdk', { ...common, ...states[name] });
    if (['ScaleFactor', 'ScaleFactorInverse', 'EyeHeightAsMeters', 'EyeHeightAsPercent'].includes(name)) {
      const meter = name === 'EyeHeightAsMeters', inverse = name === 'ScaleFactorInverse', percent = name === 'EyeHeightAsPercent';
      return entry(name, 'sdk', { sources: [sources.scaling], valueType: 'Float', unit: meter ? 'm' : unitless, range: meter ? ['当前眼高', 'Current eye height'] : percent ? ['默认眼高 0.2–5 m 对应 0–1', '0–1 for the default 0.2–5 m eye-height limits'] : '>0',
        title: meter ? ['当前眼高', 'Current eye height'] : percent ? ['眼高范围比例', 'Eye-height range fraction'] : inverse ? ['缩放比例的倒数', 'Inverse scale factor'] : ['Avatar 缩放比例', 'Avatar scale factor'],
        summary: meter ? ['表示 Avatar 当前缩放下的眼高，单位为米。', 'The Avatar’s eye height at its current scale, in metres.'] : percent ? ['表示当前眼高相对 0.2–5 m 默认眼高区间的比例。', 'Current eye height expressed relative to the default 0.2–5 m eye-height range.'] : inverse ? ['当前缩放比例的倒数；放大为 2 倍时约为 0.5。', 'The inverse of current scale; approximately 0.5 at twice the default height.'] : ['当前高度与 Avatar 默认高度的比值；2 表示默认高度的两倍。', 'Current height divided by the Avatar’s default height; 2 means twice the default height.'],
        definition: meter ? ['官方 EyeHeightAsMeters Float 报告当前眼高（米）。', 'The built-in EyeHeightAsMeters Float reports current eye height in metres.'] : percent ? ['官方 EyeHeightAsPercent 将眼高在 0.2 m 到 5 m 之间归一化：值=(眼高−0.2)/(5−0.2)。', 'The built-in EyeHeightAsPercent normalizes eye height between 0.2 m and 5 m: value=(height−0.2)/(5−0.2).'] : inverse ? ['官方 ScaleFactorInverse 等于 1/ScaleFactor。', 'The built-in ScaleFactorInverse equals 1/ScaleFactor.'] : ['官方 ScaleFactor 等于当前 Avatar 高度除以默认高度。例如默认 1 m、当前 2 m 时为 2。', 'The built-in ScaleFactor is current Avatar height divided by default height; a default height of 1 m at a current height of 2 m gives 2.'],
        usage: ['可用于理解缩放条件或计算比例。位置与检测覆盖的单位继续按各自参数的坐标定义读取。', 'Use it to understand scaling conditions or calculate a ratio. Read position and detection coverage according to their own coordinate definitions.'],
      });
    }
    return null;
  }

  function describe(path) {
    const contactPath = /^Sensa\/Contact\/[^/]+\/([^/]+)$/.exec(path);
    if (contactPath) return contact(contactPath[1]);
    const ogbPath = /^OGB\/(Orf|Pen)\/.+\/([^/]+)$/.exec(path);
    if (ogbPath) {
      const value = ogb(ogbPath[1], ogbPath[2]);
      if (value) return value;
    }
    const zone = /^VFH\/Zone\/Touch\/.+\/(Self|Others)$/.exec(path);
    if (zone) return entry(zone[1], 'fury', proximity({ sources: [sources.zones, sources.contacts],
      title: ['独立区域触碰强度', 'Independent Touch Zone intensity'],
      summary: [`表示${zone[1] === 'Self' ? '自身' : '其他 Avatar'}的身体或 Plug 标记靠近这个自定义触摸区的程度。`, `Shows how closely a body or Plug marker from ${zone[1] === 'Self' ? 'the local Avatar' : 'another Avatar'} approaches this custom Touch Zone.`],
      definition: ['VRCFury 在作者选定对象上生成球形 Proximity Receiver，半径由区域设置确定，并随对象缩放。区域直接发布 Self／Others 强度。', 'VRCFury generates a spherical Proximity Receiver on the authored object. Its configured radius follows object scaling, and it directly publishes Self/Others intensity.'],
      usage: ['可直接校准为该区域的振动或触感强度，适合单独布置的局部接触区。', 'Calibrate it directly to local vibration or feedback intensity for an independently placed contact zone.'],
    }));
    const fixed = /^Sensa\/SPS\/[^/]+\/(P[0-3]|Sample)$/.exec(path);
    if (fixed) return spatial('SPS', fixed[1]);
    const probe = /^Sensa\/(Point|Handle|Pose)\/v1\/.+\/(Root|Tip|Side)\/A([0-7])$/.exec(path);
    if (probe && (probe[1] === 'Pose' || probe[2] === 'Root' && Number(probe[3]) < 4)) return spatial(probe[1], 'A' + probe[3], probe[2], probe[3]);
    const handle = /^Sensa\/Handle\/v1\/.+\/(Handle_IsGrabbed|Handle_Stretch)$/.exec(path);
    if (handle) {
      const grabbed = handle[1] === 'Handle_IsGrabbed';
      return entry(handle[1], 'sensa', (grabbed ? gate : proximity)({ sources: [sources.dictionary, sources.physbones],
        title: grabbed ? ['PB 把手抓取状态', 'PhysBone handle grab state'] : ['PB 把手拉伸程度', 'PhysBone handle stretch'],
        summary: grabbed ? ['表示当前是否正在抓取这个 PhysBone 把手。', 'Indicates whether this PhysBone handle is currently grabbed.'] : ['表示 PhysBone 把手被拉伸到设置范围内的程度。', 'Shows how far the PhysBone handle is stretched within its configured range.'],
        definition: grabbed ? ['Sensa 将对应 PhysBone 的抓取状态发布到 Handle_IsGrabbed，并以抓取条件控制把手位置测量的有效性。', 'Sensa exposes the corresponding PhysBone grab state as Handle_IsGrabbed, using grab state to control handle-position validity.'] : ['Sensa 将对应 PhysBone 的归一化拉伸读数发布到 Handle_Stretch；范围由作者的 PhysBone 拉伸设置确定。', 'Sensa exposes the corresponding PhysBone normalized stretch reading as Handle_Stretch; the author’s PhysBone stretch settings determine its range.'],
        usage: grabbed ? ['可作为把手位置联动的条件；松开后停止按抓取位置驱动动作。', 'Use it as a condition for handle-position interaction, stopping grab-position-driven motion after release.'] : ['可将拉伸强弱校准为动作行程或强度。', 'Calibrate stretch amount to target travel or intensity.'],
      }));
    }
    const captured = /^Sensa\/Shader\/[^/]+\/([^/]+)$/.exec(path);
    if (captured) return shader(captured[1]);
    const ray = /^Sensa\/.+\/Aux\d+\/[^/]+_(Hit|Ratio|Distance)$/.exec(path);
    if (ray) return raycast(path.split('/').at(-1), ray[1]);
    if (path === 'OGB_ENABLED') return entry(path, 'ogb', gate({ sources: [sources.enabled, sources.heartbeat],
      title: ['Avatar Haptics 启用请求', 'Avatar Haptics enable request'],
      summary: ['用于请求 Avatar 启用 OGB／SPS 接触参数发布。', 'Requests that the Avatar enable OGB/SPS contact-parameter publication.'],
      definition: ['OGB 控制端向 Avatar 的 OGB_ENABLED Bool 写入 true，并以心跳维持。Sensa 在明确配置控制目标后执行对应的启用与停用请求。', 'The OGB controller writes true to the Avatar’s OGB_ENABLED Bool and maintains a heartbeat. Sensa performs enable and disable requests for explicitly configured control targets.'],
      usage: ['在需要上游发布接触参数时配置该请求，随后观察实际收到的 Pen／Touch／Frot 读数。', 'Configure this request when the Avatar requires it to publish contacts, then inspect the received Pen/Touch/Frot readings.'],
    }));
    if (/^(?:VFH\/Version\/\d+|OGB\/(?:Pen|Orf)\/.+\/Version\/\d+)$/.test(path)) return entry(path.split('/').at(-1), 'ogb', gate({
      sources: [sources.versions, sources.ogbVersions],
      valueType: path === 'VFH/Version/10' ? 'Bool' : ['历史能力标记；类型以发布方为准', 'Historical capability marker; type follows the publisher'],
      range: path === 'VFH/Version/10' ? booleanRange : ['版本号位于参数路径中', 'Version number is part of the parameter path'],
      title: ['Haptics 能力版本标记', 'Haptics capability-version marker'],
      summary: ['帮助接收软件识别 Avatar 提供的 Haptics 参数能力。', 'Helps receiving software identify the Avatar’s Haptics parameter capabilities.'],
      definition: ['VRCFury／OGB 通过版本标记路径约定所支持的参数能力，具体版本号包含在参数路径中。', 'VRCFury/OGB use version-marker paths to advertise supported parameter capabilities, with the version number in the path.'],
      usage: ['用于识别输入能力；联动强度读取实际接触或定位参数。', 'Use it to identify input capabilities; contact and tracking parameters provide interaction intensity.'],
    }));
    return builtin(path);
  }

  function lookup(path, language = 'zh-CN') {
    if (typeof path !== 'string' || path.length > 2048 || path.includes('*')) return null;
    const normalized = path.replace(/^\/avatar\/parameters\//, '');
    const value = describe(normalized);
    if (!value) return null;
    const english = /^en(?:-|$)/i.test(language), translate = text => Array.isArray(text) ? text[english ? 1 : 0] : text;
    const localized = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'sources')
      .map(([key, text]) => [key, translate(text)]));
    localized.sources = value.sources.map(source => ({ label: translate(source.label), url: translate(source.url), kind: source.kind }));
    return localized;
  }

  root.SensaOscParameterReference = Object.freeze({ lookup });
})(globalThis);
