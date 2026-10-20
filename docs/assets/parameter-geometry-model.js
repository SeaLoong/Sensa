/* Pure offline geometry, not a runtime measurement or VRChat simulator.
 * 离线纯几何示意，不是运行时测量或 VRChat 仿真器。
 * Generator evidence / 生成器证据: VRCFury 6bd33f4cb453df816c943a335e47f64e6a37e188;
 * see docs/ogb-compatibility.md for source links and runtime-scale limits.
 */
(function (root) {
  'use strict';

  const scenarios = Object.freeze([
    'socket-modern', 'socket-legacy', 'socket-touch', 'socket-frot',
    'plug-depth', 'plug-touch', 'plug-frot', 'zone', 'sensa-sps', 'shader',
  ]);
  const anchors = Object.freeze([
    Object.freeze({ x: -.5, y: .5, z: -.5 }),
    Object.freeze({ x: .5, y: .5, z: .5 }),
    Object.freeze({ x: .5, y: 1.5, z: -.5 }),
    Object.freeze({ x: -.5, y: 1.5, z: .5 }),
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
    sps: 'https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs',
    shader: 'https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Editor/SensaRootTelemetry.shader.txt',
  });
  function defaultsFor(scenario = 'socket-modern') {
    if (!scenarios.includes(scenario)) throw new RangeError('Unknown scenario / 未知场景: ' + scenario);
    const positions = {
      'socket-modern': [0, 0, .35], 'socket-legacy': [0, 0, .1], 'socket-touch': [0, 0, -.1],
      'socket-frot': [0, 0, .08], 'plug-depth': [0, 0, .15], 'plug-touch': [0, 0, -.1],
      'plug-frot': [.04, 0, 0], zone: [.08, 0, 0], 'sensa-sps': [.02, 1, .15], shader: [.02, 1, .15],
    };
    const [x, y, z] = positions[scenario];
    return { scenario, x, y, z, L: .2, W: .03, D: .15, senderRadius: .025,
      senderHeight: .12, zoneRadius: .1, yaw: 0, party: 'Others', senderKind: 'body',
      senderShape: 'sphere', ageMs: 0, timeoutMs: 1000, sample: 1 / 32, frame: 0, valid: true };
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
    if (proximity.some(p => p <= .001 || p >= .999)) {
      return { fitValid: false, coverageReason: 'proximity-boundary', fittedPosition: null, residual: null };
    }
    const center = { x: 0, y: 1, z: 0 };
    const distances = proximity.map(p => 2.5 * (1 - p) + .001);
    let offset = origin();
    anchors.forEach((anchor, i) => { offset = add(offset, mul(sub(anchor, center), -(distances[i] ** 2) / 2)); });
    const position = add(center, offset);
    const residual = Math.sqrt(distances.reduce((sum, d, i) =>
      sum + (length(sub(position, anchors[i])) - d) ** 2, 0) / 4);
    const bounded = Math.abs(offset.x) <= 1.5 && Math.abs(offset.y) <= 1.5 && Math.abs(offset.z) <= 1.5;
    const fitValid = bounded && residual <= .01;
    return { fitValid, coverageReason: !bounded ? 'outside-coordinate-cube' : residual > .01 ? 'fit-residual' : 'ok',
      fittedPosition: fitValid ? position : null, residual };
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
      : scenario === 'sensa-sps' ? 'Self' : requestedParty;
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
      { id: 'illustration', zh: '单一匹配 Sender 的几何示意，不是实测或 VRChat 运行时仿真。', en: 'One matching Sender: geometry illustration, not a measurement or VRChat runtime simulation.' },
      { id: 'scale', zh: 'OGB 假定构建缩放为 1，以米示意；Sensa 空间量使用根局部单位，不推断动态缩放。', en: 'OGB assumes build scale 1 with metre illustrations; Sensa spatial values use root-local units. Dynamic scaling is not inferred.' },
      { id: 'projection', zh: '数值按完整 XYZ 算距离；XZ 图只作投影，不是 Y 切片。', en: 'Values use full XYZ distances. The XZ drawing is a projection, not a Y slice.' },
      { id: 'caps', zh: '胶囊高度包含端帽；恰好相切的 Constant 边界不作客户端时序承诺。', en: 'Capsule height includes caps. Exact Constant tangency is not a client timing guarantee.' },
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
      assumptions.push({ id: 'root-centred-tip', zh: 'NewTip 观测根中心长度球，不是尖端；理想径向比例不等于运行时已完成估长。', en: 'NewTip observes a root-centered length sphere, not the tip; the ideal ratio does not imply runtime length learning.' });
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
    } else if (scenario === 'sensa-sps') {
      points.root = { ...point }; points.frameCenter = { x: 0, y: 1, z: 0 };
      const sender = put(sphere('sender-marker', 'sender', point, .001, 'DedicatedSelf'));
      anchors.forEach((anchor, index) => {
        field('P' + index, put(sphere('receiver-P' + index, 'receiver', anchor, 2.5, 'DedicatedSelf')),
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
      metrics.conservativeCoverageRadius = 2.5 - Math.sqrt(3) * .5;
      values.forEach(v => { v.effective = metrics.valid ? v.raw : null; });
      values.push({ name: 'Sample', path: 'Sensa/SPS/Example/Sample', type: 'counter',
        raw: sample, value: sample, effective: sample, emitted: true, receiverId: null, senderId: null, closeName: null });
      put({ id: 'coordinate-cube', role: 'reference', type: 'box', center: { x: 0, y: 1, z: 0 }, size: { x: 3, y: 3, z: 3 } });
    } else {
      points.root = { ...point }; points.frameCenter = { x: 0, y: 1, z: 0 };
      const frameInput = number(input, 'frame', 0);
      if (!Number.isInteger(frameInput)) throw new RangeError('Frame must be an integer / Frame 必须为整数');
      const frame = ((frameInput % 65536) + 65536) % 65536;
      const ageMs = number(input, 'ageMs', 0, 0), timeout = number(input, 'timeoutMs', 1000);
      const inBounds = Math.abs(point.x) <= 1.5 && Math.abs(point.y - 1) <= 1.5 && Math.abs(point.z) <= 1.5;
      const encoded = {}, decoded = {};
      for (const [key, center] of [['x', 0], ['y', 1], ['z', 0]]) {
        encoded[key] = roundEven(clamp((point[key] - center + 1.5) / 3) * 65535);
        decoded[key] = center + encoded[key] / 65535 * 3 - 1.5;
      }
      const frameAgeLimitMs = Math.min(timeout > 0 ? timeout : 1000, 500);
      Object.assign(metrics, { inBounds, encoded, decodedPosition: decoded, frameAgeLimitMs,
        valid: input.valid !== false && inBounds && ageMs <= frameAgeLimitMs,
        quantizationStep: 3 / 65535, singleAxisQuantizationBound: 1.5 / 65535,
        spatialQuantizationBound: Math.sqrt(3) * 1.5 / 65535 });
      metrics.position = metrics.valid ? decoded : null;
      metrics.reason = !inBounds ? 'outside-coordinate-cube' : !metrics.valid ? 'invalid-or-stale-frame' : 'ok';
      metrics.normalized = { x: point.x / 1.5, y: (point.y - 1) / 1.5, z: point.z / 1.5 };
      metrics.quantized = { ...encoded }; metrics.decoded = { ...decoded };
      metrics.quantError = { ...sub(decoded, point), length: length(sub(decoded, point)) };
      metrics.sourceValid = input.valid !== false && inBounds;
      metrics.bridgeFreezeThresholdMs = 350;
      assumptions.push({ id: 'shader-round', zh: '量化半整数取偶，与 HLSL round 一致；不仿真 GPU float32 中间运算。', en: 'Quantization ties round to even, matching HLSL round; GPU float32 intermediates are not simulated.' });
      // Independent illustrative binary encoding, not captured pixels or CRC authentication.
      // 独立的示意二进制编码，不是实际捕获像素，CRC 也不认证身份。
      const bytes = [83, 78, 1, metrics.sourceValid ? 3 : 2, frame & 255, frame >>> 8];
      for (const key of ['x', 'y', 'z']) bytes.push(encoded[key] & 255, encoded[key] >>> 8);
      bytes.push(42, 0);
      let crc = 65535;
      for (const byte of bytes) {
        crc ^= byte << 8;
        for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 32768 ? 0x1021 : 0)) & 65535;
      }
      bytes.push(crc & 255, crc >>> 8); metrics.bytes = bytes;
      for (const [name, value] of [['Frame', frame], ['X', decoded.x], ['Y', decoded.y], ['Z', decoded.z],
        ['Valid', Number(metrics.valid)]]) {
        values.push({ name, path: 'Sensa/Shader/42/' + name, type: name === 'Valid' ? 'constant' : name === 'Frame' ? 'counter' : 'coordinate',
          raw: value, value, effective: metrics.valid || name === 'Valid' ? value : null,
          emitted: metrics.valid || name === 'Valid', receiverId: null, senderId: null, closeName: null });
      }
      put({ id: 'encoding-cube', role: 'reference', type: 'box', center: { x: 0, y: 1, z: 0 }, size: { x: 3, y: 3, z: 3 } });
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
    return { scenario, party, shapes, illustrations, values, points, metrics, bounds, assumptions,
      parameters: { L, W, D, senderRadius, senderHeight, senderLength, senderWidth, zoneRadius, yaw }, sources };
  }

  root.SensaParameterGeometry = Object.freeze({ scenarios, defaultsFor, evaluate, sources, anchorColors });
})(globalThis);
