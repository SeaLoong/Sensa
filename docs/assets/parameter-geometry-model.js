/* Offline geometry for exploring Contact shapes and parameter meanings.
 * 离线几何模型：了解 Contact 形状与参数含义。
 * Generator evidence / 生成器证据: VRCFury 6bd33f4cb453df816c943a335e47f64e6a37e188;
 * see docs/ogb-compatibility.md for source links and runtime-scale limits.
 */
(function (root) {
  'use strict';

  const scenarios = Object.freeze([
    'socket-modern', 'socket-legacy', 'socket-touch', 'socket-frot',
    'plug-depth', 'plug-touch', 'plug-frot', 'zone', 'contact-sdk', 'sensa-sps', 'shader',
  ]);
  const spsGeometry = Object.freeze({ receiverRadius: 2, markerRadius: .001, anchorHalfSpan: .35, positionHalfRange: 2, minProximity: .001, maxProximity: .999 });
  const shaderEncoding = Object.freeze({ width: 40, height: 32, quiet: 2, marker: 2, bytes: 32, copies: 3, copyOffset: 11 });
  const anchors = Object.freeze([
    Object.freeze({ x: -.35, y: .65, z: -.35 }),
    Object.freeze({ x: .35, y: .65, z: .35 }),
    Object.freeze({ x: .35, y: 1.35, z: -.35 }),
    Object.freeze({ x: -.35, y: 1.35, z: .35 }),
  ]);
  // Stable identities across spheres, markers and parameter rows. / 球、标记与参数行共用固定身份色。
  const anchorColors = Object.freeze(['#0052d9', '#07806a', '#8b46c6', '#c63e58']);
  // Revolved reference surfaces only; these profiles never enter Contact calculations.
  // 仅供旋转生成示意表面；截面从不参与 Contact 计算。
  const plugProfile = [[0, 0], [0, .82], [.025, .92], [.07, .99], [.14, 1], [.65, .97],
    [.8, .89], [.9, .71], [.965, .42], [.995, .14], [1, 0]];
  const socketProfile = [[-.9, .44], [-.88, .62], [-.74, .8], [-.42, .94], [-.12, 1],
    [0, .99], [.035, .95], [.045, .85], [.02, .75], [-.04, .67], [-.16, .6], [-.45, .48],
    [-.72, .38], [-.88, .34], [-.9, .44]];
  const sources = Object.freeze({
    sockets: 'https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L174-L255',
    plugs: 'https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L175-L256',
    senders: 'https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs#L60-L108',
    contacts: 'https://creators.vrchat.com/common-components/contacts/',
    contactSdk: 'https://creators.vrchat.com/common-components/contacts/#advanced-proximity-parameters',
    sps: 'https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs',
    shader: 'https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/Shaders/SensaRootTelemetry.shader',
  });
  function defaultsFor(scenario = 'socket-modern') {
    if (!scenarios.includes(scenario)) throw new RangeError('Unknown scenario / 未知场景: ' + scenario);
    const positions = {
      'socket-modern': [0, 0, .35], 'socket-legacy': [0, 0, .1], 'socket-touch': [0, 0, -.1],
      'socket-frot': [0, 0, .08], 'plug-depth': [0, 0, .15], 'plug-touch': [0, 0, -.1],
      'plug-frot': [.04, 0, 0], zone: [.08, 0, 0], 'contact-sdk': [.02, 1, .15], 'sensa-sps': [.02, 1, .15], shader: [.02, 1, .15],
    };
    const [x, y, z] = positions[scenario];
    return { scenario, x, y, z, L: .2, W: .03, D: .15, senderRadius: .025,
      senderHeight: .12, zoneRadius: .1, yaw: 0, party: 'Others', senderKind: 'body',
      senderShape: 'sphere', ageMs: 0, timeoutMs: 1000, sample: 1 / 32, frame: 0, valid: true,
      vx: 0, vy: 0, vz: 0, proximitySpeed: 0,
      rightX: 1, rightY: 0, rightZ: 0, forwardX: 0, forwardY: 0, forwardZ: 1, avatarScale: 1 };
  }
  const origin = () => ({ x: 0, y: 0, z: 0 });
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const mul = (a, n) => ({ x: a.x * n, y: a.y * n, z: a.z * n });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const length = a => Math.hypot(a.x, a.y, a.z);
  const clamp = n => Math.max(0, Math.min(1, n));
  // Match HLSL round ties-to-even; this does not simulate GPU float32 intermediates.
  // 匹配 HLSL round 的半整数取偶规则，不仿真 GPU float32 中间运算。
  function roundEven(value) {
    const lower = Math.floor(value), fraction = value - lower;
    if (fraction === .5) return lower % 2 === 0 ? lower : lower + 1;
    return Math.round(value);
  }
  function encodedCell(column, row) {
    if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || column >= 40 || row < 0 || row >= 32)
      throw new RangeError('Encoding cell is outside the grid / 编码格超出图块');
    if (column < 2 || column >= 38 || row < 2 || row >= 30) return { region: 'quiet' };
    if (column < 4 || column >= 36 || row < 4 || row >= 28) return { region: 'marker' };
    const copy = Math.floor((row - 4) / 8);
    return { region: 'payload', copy, byte: (column - 4 + copy * 11) % 32, bit: (row - 4) % 8 };
  }
  function encodedBit(bytes, column, row) {
    // Native format 1 uses a bottom-left origin, white quiet cells, asymmetric
    // markers, and three offset copies of the same CRC32-protected payload.
    const cell = encodedCell(column, row);
    if (cell.region === 'quiet') return 1;
    if (row < 4) return (0xD3A69C57 >>> ((column + 28) & 31) & 1) ^ (row - 2);
    if (row >= 28) return (0x69C57D3A >>> ((column + 28) & 31) & 1) ^ (row - 28);
    if (column < 4) return (0xA5D36B >>> (row - 4) & 1) ^ (column - 2);
    if (column >= 36) return (0x6E29C7 >>> (row - 4) & 1) ^ (column - 36);
    return bytes[cell.byte] >>> cell.bit & 1;
  }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function number(input, name, fallback, minimum = -Infinity, exclusive = false) {
    const value = input[name] ?? fallback;
    if (!Number.isFinite(value) || (exclusive ? value <= minimum : value < minimum)) {
      throw new RangeError(name + ': expected a finite allowed value / 需要有效有限值');
    }
    return value;
  }
  function axisFor(yaw) {
    const radians = yaw * Math.PI / 180;
    return { x: -Math.sin(radians), y: 0, z: -Math.cos(radians) };
  }
  function sphere(id, role, center, radius, tag) {
    return { id, role, type: 'sphere', center: { ...center }, radius, tag,
      a: { ...center }, b: { ...center } };
  }
  function capsule(id, role, center, radius, height, axis, tag) {
    // Height includes both caps; short capsules degenerate to spheres.
    // 高度包含两端半球；短于直径时退化为球，不能把高度当轴段长度。
    const halfSegment = Math.max(0, height / 2 - radius);
    return { id, role, type: 'capsule', center: { ...center }, radius, height,
      effectiveHeight: Math.max(height, 2 * radius), axis: { ...axis }, tag,
      a: add(center, mul(axis, -halfSegment)), b: add(center, mul(axis, halfSegment)) };
  }
  function pointSegmentDistance(point, a, b) {
    const direction = sub(b, a), squared = dot(direction, direction);
    const t = squared ? clamp(dot(sub(point, a), direction) / squared) : 0;
    return length(sub(point, add(a, mul(direction, t))));
  }
  function segmentDistance(first, second) {
    const u = sub(first.b, first.a), v = sub(second.b, second.a), w = sub(first.a, second.a);
    const a = dot(u, u), b = dot(u, v), c = dot(v, v), d = dot(u, w), e = dot(v, w);
    const distances = [
      pointSegmentDistance(first.a, second.a, second.b), pointSegmentDistance(first.b, second.a, second.b),
      pointSegmentDistance(second.a, first.a, first.b), pointSegmentDistance(second.b, first.a, first.b),
    ];
    const determinant = a * c - b * b;
    if (determinant > Number.EPSILON * a * c) {
      const s = (b * e - c * d) / determinant, t = (a * e - b * d) / determinant;
      if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
        distances.push(length(sub(add(first.a, mul(u, s)), add(second.a, mul(v, t)))));
      }
    }
    return Math.min(...distances);
  }
  function measure(receiver, sender, type) {
    const axisDistance = segmentDistance(receiver, sender);
    const surfaceDistance = Math.max(0, axisDistance - sender.radius);
    // Only spheres use Proximity here; capsules are Constant gates.
    // 本模型仅球形 Receiver 使用 Proximity；胶囊 Receiver 均为 Constant 门控。
    const raw = type === 'constant' ? Number(axisDistance < receiver.radius + sender.radius)
      : clamp(1 - surfaceDistance / receiver.radius);
    return { raw, axisDistance, surfaceDistance,
      separation: axisDistance - receiver.radius - sender.radius };
  }
  function fitSps(proximity) {
    if (proximity.some(p => p <= spsGeometry.minProximity || p >= spsGeometry.maxProximity)) {
      return { fitValid: false, coverageReason: 'proximity-boundary', fittedPosition: null, residual: null };
    }
    const center = { x: 0, y: 1, z: 0 };
    const distances = proximity.map(p => spsGeometry.receiverRadius * (1 - p) + spsGeometry.markerRadius);
    let offset = origin();
    anchors.forEach((anchor, i) => { offset = add(offset, mul(sub(anchor, center), -(distances[i] ** 2) / (8 * spsGeometry.anchorHalfSpan ** 2))); });
    const position = add(center, offset);
    const residual = Math.sqrt(distances.reduce((sum, d, i) =>
      sum + (length(sub(position, anchors[i])) - d) ** 2, 0) / 4);
    const bounded = Math.abs(offset.x) <= spsGeometry.positionHalfRange && Math.abs(offset.y) <= spsGeometry.positionHalfRange && Math.abs(offset.z) <= spsGeometry.positionHalfRange;
    const fitValid = bounded && residual <= .01;
    return { fitValid, coverageReason: !bounded ? 'outside-coordinate-cube' : residual > .01 ? 'fit-residual' : 'ok',
      fittedPosition: fitValid ? position : null, residual };
  }
  function coverageContains(point, scenario = 'sensa-sps') {
    if (!['x', 'y', 'z'].every(key => Number.isFinite(point[key]))) return false;
    if (scenario === 'contact-sdk') return length(point) < spsGeometry.receiverRadius + spsGeometry.markerRadius;
    const half = spsGeometry.positionHalfRange;
    if (Math.abs(point.x) > half || Math.abs(point.y - 1) > half || Math.abs(point.z) > half) return false;
    if (scenario === 'shader') return true;
    const near = spsGeometry.receiverRadius * (1 - spsGeometry.maxProximity) + spsGeometry.markerRadius;
    const far = spsGeometry.receiverRadius * (1 - spsGeometry.minProximity) + spsGeometry.markerRadius;
    return anchors.every(anchor => { const distance = length(sub(point, anchor)); return distance > near && distance < far; });
  }
  function coverageRadius(direction, y = 1, slice = false) {
    const half = spsGeometry.positionHalfRange, center = { x: 0, y, z: 0 };
    if (Math.abs(y - 1) > half) return null;
    let radius = Infinity;
    for (const key of ['x', 'y', 'z']) if (direction[key] !== 0) {
      const boundary = key === 'y' ? 1 + Math.sign(direction[key]) * half : Math.sign(direction[key]) * half;
      radius = Math.min(radius, (boundary - center[key]) / direction[key]);
    }
    const far = spsGeometry.receiverRadius * (1 - spsGeometry.minProximity) + spsGeometry.markerRadius;
    for (const anchor of anchors) {
      const delta = sub(center, anchor), along = dot(delta, direction), discriminant = along * along + far * far - dot(delta, delta);
      if (discriminant < 0) return null;
      radius = Math.min(radius, -along + Math.sqrt(discriminant));
    }
    // A high/low slice can be empty even though a ray intersects an individual sphere.
    if (slice && !anchors.every(anchor => length(sub(center, anchor)) < far)) return null;
    return radius > 0 ? radius : null;
  }
  function coverageFor(point, scenario) {
    if (scenario === 'contact-sdk') {
      const radius = spsGeometry.receiverRadius + spsGeometry.markerRadius;
      const squared = radius * radius - point.y * point.y;
      const slice = squared > 0 ? Array.from({ length: 128 }, (_, index) => ({
        x: Math.sqrt(squared) * Math.cos(index * Math.PI / 64), y: point.y,
        z: Math.sqrt(squared) * Math.sin(index * Math.PI / 64),
      })) : [];
      return { kind: 'contact-sphere', center: origin(), radius, receiverRadius: spsGeometry.receiverRadius,
        containsTarget: coverageContains(point, scenario), sliceY: point.y, slice, holes: [], exclusions: [] };
    }
    const isSps = scenario === 'sensa-sps', center = { x: 0, y: 1, z: 0 }, half = spsGeometry.positionHalfRange;
    const near = spsGeometry.receiverRadius * (1 - spsGeometry.maxProximity) + spsGeometry.markerRadius;
    const far = spsGeometry.receiverRadius * (1 - spsGeometry.minProximity) + spsGeometry.markerRadius;
    const slice = [];
    if (Math.abs(point.y - 1) <= half) for (let index = 0; index < 128; index++) {
      const angle = index * Math.PI / 64, direction = { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
      const radius = isSps ? coverageRadius(direction, point.y, true) : half / Math.max(Math.abs(direction.x), Math.abs(direction.z));
      if (radius === null) break;
      slice.push(add({ x: 0, y: point.y, z: 0 }, mul(direction, radius)));
    }
    const holes = isSps ? anchors.flatMap(anchor => {
      const squared = near * near - (point.y - anchor.y) ** 2;
      return squared > 0 ? [{ center: { x: anchor.x, y: point.y, z: anchor.z }, radius: Math.sqrt(squared) }] : [];
    }) : [];
    return { kind: isSps ? 'contact-intersection' : 'encoding-cube', center, halfRange: half,
      receiverRadius: isSps ? spsGeometry.receiverRadius : null,
      nearDistance: isSps ? near : null, farDistance: isSps ? far : null,
      containsTarget: coverageContains(point, scenario), sliceY: point.y, slice, holes,
      exclusions: isSps ? anchors.map(anchor => ({ center: { ...anchor }, radius: near })) : [] };
  }
  function meaningFor(scenario, name) {
    if (scenario === 'contact-sdk') {
      if (name === 'Proximity') return [
        '选中匹配 Sender 的接近值，范围 0–1；按接收器形状中心到 Sender 最近表面的距离计算。数值越大表示越靠近；0 表示没有选中的 Sender。',
        'The selected matching Sender’s proximity, from 0 to 1, using receiver shape center to nearest Sender surface distance. Higher means closer; 0 means no selected Sender.'];
      if (name === 'Proximity_SenderType') return [
        'SDK 选中的 Sender 类别（Int）：0 无、1 自身、2 他人、3 世界。本 Sensa 预设仅匹配自身标记；1 与活动 Sample 一起确认可用位置，原点坐标也有效。离开后类别、XYZ 与速度归零。',
        'SDK selected Sender category (Int): 0 none, 1 self, 2 another avatar, 3 world. This Sensa preset matches self markers; 1 plus active Sample confirms a usable position, including the origin. Type, XYZ and velocity return to zero on exit.'];
      if (name.startsWith('Proximity_SenderLocalPosition')) {
        const axis = name.at(-1), directions = { X: ['左右', 'left/right'], Y: ['上下', 'up/down'], Z: ['前后', 'forward/back'] };
        return [`Sender 形状中点相对 Receiver 形状中点的 ${axis} 位置分量，单位米；轴向随 Receiver 旋转。此预设 Receiver 位于 Avatar 根原点，${directions[axis][0]}可取正值或负值，可用于位置与进入程度联动。`,
          `The ${axis} component from Receiver shape midpoint to Sender shape midpoint, in metres, on axes rotated with the Receiver. This preset centers the Receiver on the Avatar root; signed ${directions[axis][1]} position can guide position and depth interaction.`];
      }
      if (name === 'Proximity_SenderVelocityMagnitude') return [
        '选中双方在近似接触点处的相对速度大小，单位 m/s，始终 ≥0；包含双方旋转的角速度影响。静止时为 0，可与位置共同描述动作。',
        'Relative speed of the selected pair at an approximate contact point, in m/s, always ≥0, including angular motion from both shapes. Zero describes rest; use it alongside position.'];
      if (name.startsWith('Proximity_SenderVelocity')) return [
        `选中双方在近似接触点处的相对速度 ${name.at(-1)} 分量，单位 m/s，沿 Receiver 旋转后的轴；负值表示沿该轴负向运动。包含角速度影响，SDK 独立报告此值，位置滑条与速度滑条分别调整。`,
        `The selected pair’s relative velocity ${name.at(-1)} component at an approximate contact point, in m/s on Receiver-rotated axes; negative values move along the negative axis. It includes angular motion and is reported independently by the SDK; position and velocity sliders are separate.`];
      if (name === 'Proximity_ProximitySpeed') return [
        '基础 Proximity 每秒的变化率，单位 1/s；靠近时通常为正，远离时通常为负，进入或离开检测时可能短暂跳变。它描述接近值变化，可辅助接触联动。',
        'Change in base Proximity per second, in 1/s: usually positive on approach and negative on retreat, with possible entry or exit transients. It describes changing proximity for contact interaction.'];
      if (name === 'Radius') return [
        'Receiver 实际世界半径，单位米，允许范围 (0,3]；此预设为 2 m。用于检查检测覆盖与缩放是否受支持。',
        'The Receiver’s actual world radius in metres, allowed range (0,3]; this preset uses 2 m. Use it to check coverage and supported scaling.'];
      return [
        'Sensa 生产端活动计数：约每 50 ms 在 1/32 到 1 之间循环，停用为 0；停更超过 1000 ms 时暂停可用位置。它表示生产端持续发布，各 SDK 字段分别更新。',
        'Sensa producer activity counter: cycles from 1/32 to 1 roughly every 50 ms, and is 0 when disabled. Usable position pauses after more than 1000 ms without a change. It indicates continued publishing; SDK fields update individually.'];
    }
    if (scenario === 'socket-modern') return name.endsWith('NewRoot')
      ? ['Plug 根点越靠近 Socket 入口，数值越大。它与 NewTip 配合，用于估算根点距离、Plug 长度和进入程度。',
        'Increases as the Plug root approaches the Socket opening. Paired with NewTip, it helps estimate root distance, Plug length and depth.']
      : ['长度球以 Plug 根点为中心，半径等于 Plug 长度。它的接近值与 NewRoot 的差值帮助估算长度，再换算进入程度。',
        'The length sphere is centered on the Plug root with a radius equal to Plug length. Its proximity difference from NewRoot helps estimate length and then depth.'];
    if (scenario === 'socket-legacy') return name.endsWith('Close')
      ? ['Socket 附近的接触检测开关：匹配目标进入检测区域时为 1，离开时为 0。Sensa 据此决定何时使用 PenOthers。',
        'A contact-region switch near the Socket: 1 while a matching target overlaps the region, 0 after it leaves. Sensa uses it to gate PenOthers.']
      : ['沿 Socket 对准方向进入时，可用它观察进入深度的变化。Close 为 1 时读数参与联动。Plug 长度和侧移会影响读数；倾斜时，相同读数也可能对应不同的实际深度。',
        'Use it to follow depth changes while entering along the Socket axis, with Close=1 gating the interaction. Plug length and sideways offset affect the reading; when tilted, the same reading can correspond to different actual depths.'];
    if (scenario === 'plug-depth') return [
      '从 Plug 一侧感知 Socket 入口到根点的距离。入口越靠近根点，数值越大；对齐时可用来表现进入深度。',
      'Measures proximity from the Plug side to the Socket opening. The closer the opening is to the Plug root, the higher the value; alignment makes it useful for depth.'];
    if (scenario === 'socket-touch' || scenario === 'plug-touch') {
      const target = scenario === 'socket-touch' ? 'Socket' : 'Plug';
      const owner = name.includes('Self') ? ['自身 Avatar', 'your own Avatar'] : ['其他 Avatar', 'another Avatar'];
      return name.endsWith('Close')
        ? [`${owner[0]} 的身体接触标记进入 ${target} 的接触区域时为 1，离开时为 0。它为 Touch 提供接触确认。`,
          `1 while a body contact marker on ${owner[1]} overlaps the ${target} contact region, 0 after it leaves. It confirms contact for Touch.`]
        : [`${owner[0]} 的身体接触标记靠近 ${target} 的程度，越靠近数值越大。经过 Close 确认后的可用值可用于调节触感强度。`,
          `How closely a body contact marker on ${owner[1]} approaches the ${target}; closer gives a higher value. The Close-gated value can adjust feedback intensity.`];
    }
    if (scenario === 'socket-frot') return [
      '另一处 Socket 的入口标记靠近当前入口前方的小范围时，数值增大，可用于两处贴近时的触感联动。',
      'Increases as another Socket opening marker approaches the small region in front of this opening, for feedback when the two come close.'];
    if (scenario === 'plug-frot') return name.endsWith('Close')
      ? ['两个 Plug 的接触包络相交时为 1，分开时为 0。它为 FrotOthers 提供接触确认。',
        '1 while the two Plug contact envelopes overlap, 0 when separated. It confirms contact for FrotOthers.']
      : ['另一处 Plug 靠近当前 Plug 的程度。Close 确认接触后，可用值随靠近程度变化，适合调节贴近时的触感强度。',
        'How closely another Plug approaches this Plug. Once Close confirms contact, the gated value can adjust feedback intensity as they approach.'];
    if (scenario === 'zone') return name === 'Self'
      ? ['自己身上的身体或 Plug 标记靠近自定义区域时，数值增大，可用于该区域的局部触感。',
        'Increases as a body or Plug marker on your own Avatar approaches this custom region, for localized feedback.']
      : ['他人身上的身体或 Plug 标记靠近自定义区域时，数值增大，可用于该区域的局部触感。',
        'Increases as a body or Plug marker on another Avatar approaches this custom region, for localized feedback.'];
    if (scenario === 'sensa-sps') return name === 'Sample'
      ? ['测量组件持续采样的计数。约每 50 ms 前进一档，在 1/32 到 1 之间循环；0 表示测量停用。',
        'The measurement activity counter. It advances roughly every 50 ms, cycling from 1/32 to 1; 0 means measurement is disabled.']
      : [`根点标记到测量点 ${name} 的接近值，越近数值越大。P0–P3 一起用于还原根点的 X、Y、Z 位置。`,
        `Proximity of the root marker to anchor ${name}; closer gives a higher value. P0–P3 together reconstruct the root's X, Y and Z position.`];
    if (name === 'Frame') return ['编码时钟按 _Time×60 生成的 16 位循环计数，用于检查编码画面是否持续更新。',
      'A 16-bit cyclic encoder-clock count derived from _Time×60, used to check for updated encoded images.'];
    if (name === 'Valid') return ['解码结果的可用标志：有效数据随 Valid=1 提交；失效时发送 Valid=0，使联动停止并等待新样本。',
      'The decoded-data availability flag. Valid data is committed with Valid=1; Valid=0 stops the interaction until fresh data is available.'];
    if (/^(Right|Forward)[XYZ]$/.test(name)) return [`目标局部 ${name.startsWith('Right') ? 'X' : 'Z'} 轴在 Avatar 根坐标系中的 ${name.at(-1)} 分量；三项共同表示该轴的方向和单位长度。`,
      `The ${name.at(-1)} component of the target-local ${name.startsWith('Right') ? 'X' : 'Z'} axis in the Avatar-root frame. Its three components describe the axis direction and length per target-local unit.`];
    if (name === 'AvatarScale') return ['每个 Avatar 根局部单位对应的世界米数；可与局部位移相乘，得到沿根坐标轴的米制位移。',
      'World metres per Avatar-root local unit. Multiply a local displacement by this value for metre-based displacement along the root axes.'];
    const axes = { X: ['左右', 'left/right'], Y: ['上下', 'up/down'], Z: ['前后', 'forward/back'] };
    return [`根点相对 Avatar 根的${axes[name][0]}坐标。可将选定的两个位置校准为设备行程的起点与终点。`,
      `The root's ${axes[name][1]} coordinate relative to the Avatar root. Calibrate two chosen positions as the start and end of the device travel.`];
  }
  function evaluate(input = {}) {
    const scenario = input.scenario ?? 'socket-modern';
    if (!scenarios.includes(scenario)) throw new RangeError('Unknown scenario / 未知场景: ' + scenario);
    const defaults = defaultsFor(scenario);
    const point = { x: number(input, 'x', defaults.x),
      y: number(input, 'y', defaults.y), z: number(input, 'z', defaults.z) };
    const L = number(input, 'L', .2, 0, true), W = number(input, 'W', .03, 0, true);
    const D = number(input, 'D', .15, 0, true), zoneRadius = number(input, 'zoneRadius', .1, 0, true);
    const senderRadius = number(input, 'senderRadius', .025, 0);
    const senderHeight = number(input, 'senderHeight', .12, 0);
    const senderLength = number(input, 'senderLength', L, 0, true);
    const senderWidth = number(input, 'senderWidth', W, 0, true);
    const yaw = number(input, 'yaw', 0), axis = axisFor(yaw), ownAxis = axisFor(0);
    const requestedParty = input.party ?? 'Others';
    if (!['Self', 'Others'].includes(requestedParty)) throw new RangeError('Invalid party / 无效类别');
    const party = ['socket-legacy', 'socket-frot', 'plug-frot'].includes(scenario) ? 'Others'
      : ['contact-sdk', 'sensa-sps'].includes(scenario) ? 'Self' : requestedParty;
    const senderKind = input.senderKind ?? 'body', senderShape = input.senderShape ?? 'sphere';
    if (!['body', 'plug'].includes(senderKind) || !['sphere', 'capsule'].includes(senderShape)) {
      throw new RangeError('Invalid sender shape / 无效发送器形状');
    }
    const shapes = [], illustrations = [], values = [], points = { movingRoot: { ...point } }, metrics = {};
    const illustrate = (id, kind, root, direction, size, radius) => illustrations.push({
      id, kind, root: { ...root }, axis: { ...direction }, length: size, radius,
      profile: (kind === 'socket' ? socketProfile : plugProfile).map(([t, r]) => ({ t, r })),
    });
    const assumptions = [
      { id: 'illustration', zh: '图中用一组匹配目标演示检测形状和参数变化。', en: 'The diagram uses one matching target to explore detection shapes and changing values.' },
      { id: 'scale', zh: scenario === 'contact-sdk' ? 'SDK Beta 3.10.6-beta.2：位置与速度按 Receiver 旋转后的轴以米、米每秒报告，保持世界尺度。' : 'OGB 图形按作者缩放为 1、以米展示；SPS 四点定位和 Shader 使用 Avatar 根局部单位。', en: scenario === 'contact-sdk' ? 'SDK Beta 3.10.6-beta.2 reports position and velocity on Receiver-rotated axes in metres and metres per second, retaining world scale.' : 'OGB shapes are shown in metres at authored scale 1; SPS four-anchor tracking and Shader use Avatar-root local units.' },
      { id: 'projection', zh: ['contact-sdk', 'sensa-sps', 'shader'].includes(scenario) ? '数值按完整 XYZ 计算；二维接收轮廓是投影，绿色区域表示所选 Y 高度的切片。' : 'XZ 图把三维形状投影到平面，数值始终按完整 XYZ 距离计算。', en: ['contact-sdk', 'sensa-sps', 'shader'].includes(scenario) ? 'Values use full XYZ. Receiver outlines are projected into 2D; green shows a slice at the selected Y.' : 'The XZ view projects 3D shapes onto a plane; values always use full XYZ distances.' },
      { id: 'caps', zh: '胶囊总高度包含两端半球；本页在形状相交时将接触开关设为 1。', en: 'Capsule height includes both hemispherical caps; this guide sets the contact switch to 1 when the shapes overlap.' },
    ];
    const put = shape => { shapes.push(shape); return shape; };
    const opening = position => {
      points.socketRoot = { ...position }; points.socketOpening = { ...position };
      points.socketForward = add(position, { x: 0, y: 0, z: .1 });
      illustrate('socket', 'socket', position, { x: 0, y: 0, z: 1 }, Math.min(D, .22), Math.max(.045, W * 1.8));
    };
    const plug = (position, direction, size = L, prefix = 'plug') => {
      points[prefix + 'Root'] = { ...position }; points[prefix + 'Tip'] = add(position, mul(direction, size));
      illustrate(prefix, 'plug', position, direction, size, prefix === 'sender' ? senderWidth : W);
    };
    const envelope = () => capsule('sender-envelope', 'sender', add(point, mul(axis, senderLength / 2)),
      senderWidth, senderLength, axis, 'TPS_Pen_Close');
    const body = () => senderShape === 'capsule'
      ? capsule('sender-body', 'sender', point, senderRadius, senderHeight, axis, 'BodyContact')
      : sphere('sender-body', 'sender', point, senderRadius, 'BodyContact');
    const field = (name, receiver, sender, type = 'proximity', closeName = null, prefix = 'OGB/Orf/Example') => {
      const measured = measure(receiver, sender, type);
      const value = { name, path: prefix + '/' + name, type, receiverId: receiver.id, senderId: sender.id,
        ...measured, value: measured.raw, effective: measured.raw, closeName, emitted: true };
      values.push(value); return value;
    };
    const gated = (name, receiver, closeReceiver, sender, prefix) => {
      const gate = field(name + 'Close', closeReceiver, sender, 'constant', null, prefix);
      const value = field(name, receiver, sender, 'proximity', gate.name, prefix);
      value.effective = gate.raw ? value.raw : 0;
    };
    if (scenario === 'socket-modern') {
      opening(origin()); plug(point, axis);
      const receiver = put(sphere('receiver-root', 'receiver', origin(), 1, 'TPS_Pen_Root'));
      const tipReceiver = put(sphere('receiver-length', 'receiver', origin(), 1, 'TPS_Pen_Penetrating'));
      const sender = put(sphere('sender-root', 'sender', point, .01, 'TPS_Pen_Root'));
      const lengthSender = put(sphere('sender-length', 'sender', point, L, 'TPS_Pen_Penetrating'));
      const r = field('Pen' + party + 'NewRoot', receiver, sender);
      const t = field('Pen' + party + 'NewTip', tipReceiver, lengthSender);
      metrics.centerDistance = length(point);
      metrics.unsaturatedLengthEstimate = r.raw > 0 && r.raw < 1 && t.raw > 0 && t.raw < 1
        ? t.raw - r.raw + .01 : null;
      metrics.idealKnownLengthRadialRatio = clamp(1 - metrics.centerDistance / L);
      metrics.estimatorRequiresPriorLengthLearning = true;
      assumptions.push({ id: 'root-centred-tip', zh: 'NewTip 使用以 Plug 根点为中心的长度球。图中已知 L，用于演示距离与进入程度的关系；桌面程序先根据变化样本估算长度。', en: 'NewTip uses a length sphere centered on the Plug root. The guide uses a known L to illustrate distance and depth; the desktop first learns length from changing samples.' });
    } else if (scenario === 'socket-legacy' || scenario === 'socket-touch') {
      opening(origin());
      const receiver = put(sphere('receiver-proximity', 'receiver', { x: 0, y: 0, z: -D }, D,
        scenario === 'socket-legacy' ? 'TPS_Pen_Penetrating' : 'BodyContact'));
      const close = put(capsule('receiver-close', 'receiver', { x: 0, y: 0, z: -D / 2 }, D / 2.5, D,
        { x: 0, y: 0, z: 1 }, receiver.tag));
      const sender = put(scenario === 'socket-legacy'
        ? sphere('sender-length', 'sender', point, L, 'TPS_Pen_Penetrating') : body());
      if (scenario === 'socket-legacy') plug(point, axis);
      else points.senderRoot = { ...point };
      gated(scenario === 'socket-legacy' ? 'PenOthers' : 'Touch' + party, receiver, close, sender, 'OGB/Orf/Example');
    } else if (scenario === 'socket-frot') {
      opening(origin()); points.senderRoot = { ...point };
      illustrate('socket-other', 'socket', point, { x: 0, y: 0, z: -1 }, Math.min(D, .22), Math.max(.045, W * 1.8));
      const receiver = put(sphere('receiver-frot', 'receiver', { x: 0, y: 0, z: .05 }, .1, 'TPS_Orf_Root'));
      field('FrotOthers', receiver, put(sphere('sender-socket-root', 'sender', point, .001, 'TPS_Orf_Root')));
    } else if (scenario === 'plug-depth') {
      opening(origin()); plug(point, axis); points.senderRoot = origin();
      const receiver = put(sphere('receiver-depth', 'receiver', point, L, 'TPS_Orf_Root'));
      field('Pen' + party, receiver, put(sphere('sender-socket-root', 'sender', origin(), .001, 'TPS_Orf_Root')),
        'proximity', null, 'OGB/Pen/Example');
    } else if (scenario === 'plug-touch' || scenario === 'plug-frot') {
      plug(origin(), ownAxis); points.senderRoot = { ...point };
      const e = Math.min(W, .08), touch = scenario === 'plug-touch';
      metrics.extraRadius = touch ? e : .08;
      const receiver = put(sphere('receiver-proximity', 'receiver', origin(), touch ? L + e : L,
        touch ? 'BodyContact' : 'TPS_Pen_Close'));
      const close = put(capsule('receiver-close', 'receiver', mul(ownAxis, L / 2), W + metrics.extraRadius,
        touch ? L + 2 * e : L, ownAxis, receiver.tag));
      const sender = put(touch ? body() : envelope());
      if (!touch) plug(point, axis, senderLength, 'sender');
      gated(touch ? 'Touch' + party : 'FrotOthers', receiver, close, sender, 'OGB/Pen/Example');
    } else if (scenario === 'zone') {
      points.receiverRoot = origin(); points.senderRoot = { ...point };
      const receiver = put(sphere('receiver-zone', 'receiver', origin(), zoneRadius, 'BodyContact|TPS_Pen_Close'));
      const sender = put(senderKind === 'plug' ? envelope() : body());
      if (senderKind === 'plug') plug(point, axis, senderLength, 'sender');
      field(party, receiver, sender, 'proximity', null, 'VFH/Zone/Touch/Example');
    } else if (scenario === 'contact-sdk') {
      points.root = { ...point }; points.frameCenter = origin();
      const receiver = put(sphere('receiver-contact', 'receiver', origin(), 2, 'SensaSelf'));
      const candidates = input.senders ?? [{ ...point, vx: input.vx, vy: input.vy, vz: input.vz,
        proximitySpeed: input.proximitySpeed, senderType: 1 }];
      let chosen = null, measured = { raw: 0 };
      for (const candidate of candidates) {
        const candidatePoint = { x: number(candidate, 'x', 0), y: number(candidate, 'y', 0), z: number(candidate, 'z', 0) };
        const candidateShape = sphere('sender-contact', 'sender', candidatePoint, .001, 'SensaSelf');
        const proximity = measure(receiver, candidateShape, 'proximity');
        if ((candidate.senderType ?? 1) === 1 && proximity.raw > measured.raw) {
          chosen = { ...candidate, point: candidatePoint, shape: candidateShape }; measured = proximity;
        }
      }
      // Keep the moving marker at its actual position even after selection is lost.
      // 失去选中目标时，仍显示可拖动标记的真实位置。
      put(chosen?.shape ?? sphere('sender-contact', 'sender', point, .001, 'SensaSelf'));
      const sample = input.valid === false ? 0 : number(input, 'sample', 1 / 32);
      const ageMs = number(input, 'ageMs', 0, 0), timeout = number(input, 'timeoutMs', 1000);
      const ageLimit = Math.min(timeout > 0 ? timeout : 1000, 1000);
      const velocity = chosen ? { x: number(chosen, 'vx', 0), y: number(chosen, 'vy', 0), z: number(chosen, 'vz', 0) } : origin();
      const position = chosen?.point ?? origin();
      const active = sample > 0 && sample <= 1 && Number.isInteger(sample * 32) && ageMs <= ageLimit;
      Object.assign(metrics, { selected: !!chosen, senderType: chosen ? 1 : 0, active,
        valid: !!chosen && active, sampleAgeLimitMs: ageLimit, worldRadius: 2,
        coordinateFrame: 'AvatarRootMeters', velocity: chosen && active ? velocity : null,
        position: chosen && active ? { ...position } : null,
        reason: !chosen ? 'no-selected-sender' : !active ? 'sample-inactive-or-stale' : 'ok' });
      const entries = [['Proximity', measured.raw, 'proximity'], ['Proximity_SenderType', chosen ? 1 : 0, 'constant'],
        ...['X', 'Y', 'Z'].map(axis => ['Proximity_SenderLocalPosition' + axis, position[axis.toLowerCase()], 'coordinate']),
        ...['X', 'Y', 'Z'].map(axis => ['Proximity_SenderVelocity' + axis, velocity[axis.toLowerCase()], 'velocity']),
        ['Proximity_SenderVelocityMagnitude', length(velocity), 'speed'],
        ['Proximity_ProximitySpeed', number(chosen ?? input, 'proximitySpeed', 0), 'rate'],
        ['Radius', 2, 'radius'], ['Sample', sample, 'counter']];
      for (const [name, raw, type] of entries) values.push({ name, path: 'Sensa/Contact/Example/' + name,
        type, raw, value: raw, effective: metrics.valid || ['Radius', 'Sample'].includes(name) ? raw : null,
        receiverId: receiver.id, senderId: 'sender-contact', closeName: null, emitted: true });
      assumptions.push({ id: 'clock', zh: 'Sample 表示生产端活动；SDK 字段各自更新，位置与速度变化不刷新 Sample 的停更时间。', en: 'Sample indicates producer activity; SDK fields update individually, and position or velocity changes do not refresh Sample age.' });
    } else if (scenario === 'sensa-sps') {
      points.root = { ...point }; points.frameCenter = { x: 0, y: 1, z: 0 };
      const sender = put(sphere('sender-marker', 'sender', point, .001, 'DedicatedSelf'));
      anchors.forEach((anchor, index) => {
        field('P' + index, put(sphere('receiver-P' + index, 'receiver', anchor, spsGeometry.receiverRadius, 'DedicatedSelf')),
          sender, 'proximity', 'Sample', 'Sensa/SPS/Example');
      });
      const sample = input.valid === false ? 0 : number(input, 'sample', 1 / 32);
      const ageMs = number(input, 'ageMs', 0, 0), timeout = number(input, 'timeoutMs', 1000);
      const ageLimit = Math.min(timeout > 0 ? timeout : 1000, 1250);
      Object.assign(metrics, fitSps(values.map(v => v.raw)), { sampleAgeLimitMs: ageLimit });
      metrics.active = sample > 0 && sample <= 1 && Number.isInteger(sample * 32) && ageMs <= ageLimit;
      metrics.valid = metrics.fitValid && metrics.active;
      metrics.reason = !metrics.fitValid ? metrics.coverageReason : !metrics.active ? 'sample-inactive-or-stale' : 'ok';
      metrics.position = metrics.valid ? metrics.fittedPosition : null;
      metrics.conservativeCoverageRadius = spsGeometry.receiverRadius * (1 - spsGeometry.minProximity) + spsGeometry.markerRadius - Math.sqrt(3) * spsGeometry.anchorHalfSpan;
      values.forEach(v => { v.effective = metrics.valid ? v.raw : null; });
      values.push({ name: 'Sample', path: 'Sensa/SPS/Example/Sample', type: 'counter',
        raw: sample, value: sample, effective: sample, emitted: true, receiverId: null, senderId: null, closeName: null });
      put({ id: 'coordinate-cube', role: 'reference', type: 'box', center: { x: 0, y: 1, z: 0 }, size: { x: 4, y: 4, z: 4 } });
    } else {
      points.root = { ...point }; points.frameCenter = { x: 0, y: 1, z: 0 };
      const frameInput = number(input, 'frame', 0);
      if (!Number.isInteger(frameInput)) throw new RangeError('Frame must be an integer / Frame 必须为整数');
      const frame = ((frameInput % 65536) + 65536) % 65536;
      const ageMs = number(input, 'ageMs', 0, 0), timeout = number(input, 'timeoutMs', 1000);
      const inBounds = Math.abs(point.x) <= 2 && Math.abs(point.y - 1) <= 2 && Math.abs(point.z) <= 2;
      const encoded = {}, decoded = {};
      for (const [key, center] of [['x', 0], ['y', 1], ['z', 0]]) {
        encoded[key] = roundEven(clamp((point[key] - center + 2) / 4) * 65535);
        decoded[key] = center + encoded[key] / 65535 * 4 - 2;
      }
      const frameAgeLimitMs = Math.min(timeout > 0 ? timeout : 1000, 500);
      Object.assign(metrics, { inBounds, encoded, decodedPosition: decoded, frameAgeLimitMs,
        valid: input.valid !== false && inBounds && ageMs <= frameAgeLimitMs,
        quantizationStep: 4 / 65535, singleAxisQuantizationBound: 2 / 65535,
        spatialQuantizationBound: Math.sqrt(3) * 2 / 65535 });
      metrics.position = metrics.valid ? decoded : null;
      metrics.reason = !inBounds ? 'outside-coordinate-cube' : !metrics.valid ? 'invalid-or-stale-frame' : 'ok';
      metrics.normalized = { x: point.x / 2, y: (point.y - 1) / 2, z: point.z / 2 };
      metrics.quantized = { ...encoded }; metrics.decoded = { ...decoded };
      metrics.quantError = { ...sub(decoded, point), length: length(sub(decoded, point)) };
      metrics.sourceValid = input.valid !== false && inBounds;
      metrics.bridgeFreezeThresholdMs = 350;
      assumptions.push({ id: 'shader-round', zh: '量化采用与 HLSL round 相同的半整数取偶规则；本页显示编码前后的坐标差。', en: 'Quantization uses the same ties-to-even rule as HLSL round; this guide shows the coordinate difference before and after encoding.' });
      const right = {}, forward = {}, rawRight = {}, rawForward = {}, encodedBasis = {};
      let basisInBounds = true;
      for (const [prefix, vector, rawVector] of [['right', right, rawRight], ['forward', forward, rawForward]]) for (const axis of ['x', 'y', 'z']) {
        const key = prefix + axis.toUpperCase(), fallback = prefix === 'right' && axis === 'x' || prefix === 'forward' && axis === 'z' ? 1 : 0;
        const raw = number(input, key, fallback);
        rawVector[axis] = raw;
        basisInBounds &&= Math.abs(raw) <= 8;
        encodedBasis[key] = roundEven(Math.max(-1, Math.min(1, raw / 8)) * 32767);
        vector[axis] = encodedBasis[key] / 32767 * 8;
      }
      const scale = number(input, 'avatarScale', 1), scaleWord = roundEven(clamp(scale / 8) * 65535);
      const rightLength = length(right), forwardLength = length(forward);
      const usableBasis = (a, b) => {
        const aLength = length(a), bLength = length(b);
        const crossLength = Math.hypot(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
        return aLength > 1e-6 && bLength > 1e-6 && crossLength > aLength * bLength * 1e-4;
      };
      const basisValid = basisInBounds && usableBasis(rawRight, rawForward) && usableBasis(right, forward);
      metrics.sourceValid &&= basisValid && scale > 0 && scale <= 8 && scaleWord > 0;
      metrics.valid &&= metrics.sourceValid;
      metrics.position = metrics.valid ? decoded : null;
      if (!metrics.sourceValid && inBounds) metrics.reason = 'invalid-source-or-basis';
      Object.assign(metrics, { right, forward, rightLength, forwardLength, avatarScale: scaleWord / 65535 * 8,
        basisValid, encodedBasis, scaleWord });
      // Independent encoding preview; captured-pixel recovery remains the bridge's job.
      const bytes = [83, 78, 1, metrics.sourceValid ? 3 : 2, frame & 255, frame >>> 8];
      for (const key of ['x', 'y', 'z']) bytes.push(encoded[key] & 255, encoded[key] >>> 8);
      bytes.push(42, 0);
      for (const key of ['rightX', 'rightY', 'rightZ', 'forwardX', 'forwardY', 'forwardZ']) {
        const word = encodedBasis[key] & 65535; bytes.push(word & 255, word >>> 8);
      }
      bytes.push(scaleWord & 255, scaleWord >>> 8);
      const checksum = crc32(bytes);
      bytes.push(checksum & 255, checksum >>> 8 & 255, checksum >>> 16 & 255, checksum >>> 24);
      metrics.bytes = bytes; metrics.crc32 = checksum;
      for (const [name, value] of [['Frame', frame], ['X', decoded.x], ['Y', decoded.y], ['Z', decoded.z],
        ...['X', 'Y', 'Z'].map(axis => ['Right' + axis, right[axis.toLowerCase()]]),
        ...['X', 'Y', 'Z'].map(axis => ['Forward' + axis, forward[axis.toLowerCase()]]), ['AvatarScale', metrics.avatarScale],
        ['Valid', Number(metrics.valid)]]) {
        values.push({ name, path: 'Sensa/Shader/42/' + name, type: name === 'Valid' ? 'constant' : name === 'Frame' ? 'counter' : 'coordinate',
          raw: value, value, effective: metrics.valid || name === 'Valid' ? value : null,
          emitted: metrics.valid || name === 'Valid', receiverId: null, senderId: null, closeName: null });
      }
      put({ id: 'encoding-cube', role: 'reference', type: 'box', center: { x: 0, y: 1, z: 0 }, size: { x: 4, y: 4, z: 4 } });
    }
    // Reference roots are illustration points, not extra Contact/OSC fields.
    // 参考根点只供示意，不新增 Contact 或 OSC 参数。
    points.receiverRoot ??= scenario === 'plug-depth' ? { ...point } : origin();
    points.senderRoot ??= { ...point };
    const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const shape of shapes) {
      const positions = shape.type === 'box'
        ? [sub(shape.center, mul(shape.size, .5)), add(shape.center, mul(shape.size, .5))]
        : [shape.a, shape.b];
      const radius = shape.radius ?? 0;
      for (const position of positions) {
        bounds.minX = Math.min(bounds.minX, position.x - radius); bounds.maxX = Math.max(bounds.maxX, position.x + radius);
        bounds.minZ = Math.min(bounds.minZ, position.z - radius); bounds.maxZ = Math.max(bounds.maxZ, position.z + radius);
      }
    }
    values.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    values.forEach(value => { value.meaning = meaningFor(scenario, value.name); });
    return { scenario, party, shapes, illustrations, values, points, metrics, bounds, assumptions,
      coverage: ['contact-sdk', 'sensa-sps', 'shader'].includes(scenario) ? coverageFor(point, scenario) : null,
      parameters: { L, W, D, senderRadius, senderHeight, senderLength, senderWidth, zoneRadius, yaw }, sources };
  }

  root.SensaParameterGeometry = Object.freeze({ scenarios, defaultsFor, evaluate, sources, anchorColors, spsGeometry, shaderEncoding, coverageContains, coverageRadius, encodedBit, encodedCell });
})(globalThis);
