import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The page uses a classic local script: no modules, DOM or network required.
// 页面使用本地经典脚本；空 vm 环境验证不依赖模块、DOM 或网络。
const source = readFileSync(new URL('../../docs/assets/parameter-geometry-model.js', import.meta.url), 'utf8');
const sandbox = vm.createContext({});
vm.runInContext(source, sandbox, { timeout: 1000 });
const model = sandbox.SensaParameterGeometry;
const evaluate = input => model.evaluate(input);
const field = (scene, name) => scene.values.find(value => value.name === name);
const shape = (scene, id) => scene.shapes.find(value => value.id === id);
const plain = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, actual + ' != ' + expected);
const nativeShader = JSON.parse(readFileSync(new URL('../fixtures/shader-native-format1.json', import.meta.url), 'utf8'));

test('offline classic model exposes fresh defaults for every scene / 离线经典模型为各场景提供独立默认值', () => {
  assert.equal(model.scenarios.length, 11);
  for (const scenario of model.scenarios) {
    const defaults = model.defaultsFor(scenario);
    assert.equal(defaults.scenario, scenario);
    const scene = evaluate(defaults);
    assert.equal(scene.scenario, scenario);
    for (const value of scene.values) {
      assert.equal(value.meaning.length, 2);
      assert.ok(value.meaning.every(text => typeof text === 'string' && text.trim()));
    }
    defaults.x = 99;
    assert.notEqual(model.defaultsFor(scenario).x, 99);
  }
  assert.deepEqual(plain(model.defaultsFor('sensa-sps')).x, .02);
  assert.equal(model.defaultsFor('sensa-sps').y, 1);
  assert.equal(model.defaultsFor('shader').z, .15);
});

test('native SPS defaults follow VRCFury generation dimensions while Sensa tracking keeps its own geometry / 原生 SPS 默认尺寸遵循 VRCFury 且 Sensa 定位使用独立几何', () => {
  // VRCFury 1.1434.0 / 6bd33f4: BakeHapticSocketsService 192–273,
  // SocketBaker 303–318, PlugBaker 72–108, BakeHapticPlugsService 180–256.
  for (const [scenario, id, radius] of [
    ['socket-modern', 'receiver-root', 1], ['socket-modern', 'receiver-length', 1],
    ['socket-modern', 'sender-root', .01], ['socket-modern', 'sender-length', .2],
    ['socket-legacy', 'receiver-proximity', .08], ['socket-legacy', 'receiver-close', .032],
    ['socket-touch', 'receiver-proximity', .08], ['socket-touch', 'receiver-close', .032],
    ['socket-frot', 'receiver-frot', .1], ['socket-frot', 'sender-socket-root', .001],
    ['plug-depth', 'receiver-depth', .2], ['plug-depth', 'sender-socket-root', .001],
    ['plug-touch', 'receiver-proximity', .23], ['plug-touch', 'receiver-close', .06],
    ['plug-frot', 'receiver-proximity', .2], ['plug-frot', 'receiver-close', .11],
    ['zone', 'receiver-zone', .1], ['contact-sdk', 'receiver-contact', 2],
    ['contact-sdk', 'sender-contact', .001], ['sensa-sps', 'receiver-P0', 2],
  ]) near(shape(evaluate({ scenario }), id).radius, radius);
  near(model.illustrationDefaults.viewHeight, 1.6);
  for (const scenario of ['socket-legacy', 'socket-touch']) {
    const scene = evaluate({ scenario });
    near(shape(scene, 'receiver-proximity').center.z, -.08);
    near(shape(scene, 'receiver-close').center.z, -.04);
    near(shape(scene, 'receiver-close').height, .08);
    near(model.defaultsFor(scenario).D, 1.6 * .05);
    // An authored positive length overrides the automatic example, as it does in VRCFury.
    near(shape(evaluate({ scenario, D: .12 }), 'receiver-proximity').radius, .12);
    near(shape(evaluate({ scenario, D: .12 }), 'receiver-close').radius, .048);
  }
  near(shape(evaluate({ scenario: 'socket-frot' }), 'receiver-frot').center.z, .05);
  near(shape(evaluate({ scenario: 'plug-touch' }), 'receiver-close').height, .26);
  near(shape(evaluate({ scenario: 'plug-frot' }), 'receiver-close').height, .2);
});

test('parameter names are alphabetical with each base before its Close partner / 参数按字典序排列且基本名在 Close 前', () => {
  for (const [scenario, names] of [
    ['socket-modern', ['PenOthersNewRoot', 'PenOthersNewTip']],
    ['socket-legacy', ['PenOthers', 'PenOthersClose']],
    ['socket-touch', ['TouchOthers', 'TouchOthersClose']],
    ['plug-frot', ['FrotOthers', 'FrotOthersClose']],
    ['sensa-sps', ['P0', 'P1', 'P2', 'P3', 'Sample']],
    ['contact-sdk', ['Proximity', 'Proximity_ProximitySpeed', 'Proximity_SenderLocalPositionX',
      'Proximity_SenderLocalPositionY', 'Proximity_SenderLocalPositionZ', 'Proximity_SenderType',
      'Proximity_SenderVelocityMagnitude', 'Proximity_SenderVelocityX', 'Proximity_SenderVelocityY',
      'Proximity_SenderVelocityZ', 'Radius', 'Sample']],
    ['shader', ['AvatarScale', 'ForwardX', 'ForwardY', 'ForwardZ', 'Frame', 'RightX', 'RightY', 'RightZ', 'Valid', 'X', 'Y', 'Z']],
  ]) assert.deepEqual(plain(evaluate({ scenario }).values.map(value => value.name)), names);
});

test('four anchor identities keep distinct immutable colors / 四个锚点身份保持独立且不可变的配色', () => {
  assert.deepEqual(plain(model.anchorColors), ['#0052d9', '#07806a', '#8b46c6', '#c63e58']);
  assert.equal(new Set(model.anchorColors).size, 4);
  assert.equal(Object.isFrozen(model.anchorColors), true);
  assert.throws(() => { model.anchorColors[0] = '#000000'; }, /read only|只读/);
  assert.equal(model.anchorColors[0], '#0052d9');
});

test('reference profiles close their surfaces and follow root, yaw and local dimensions / 示意截面闭合且遵循根点朝向与局部尺寸', () => {
  const scene = evaluate({ scenario: 'socket-modern', x: .1, y: .2, z: .3, yaw: 90, L: .6, W: .12, D: .15 });
  const plug = scene.illustrations.find(item => item.kind === 'plug');
  const socket = scene.illustrations.find(item => item.kind === 'socket');
  assert.deepEqual(plain(plug.root), { x: .1, y: .2, z: .3 });
  near(plug.axis.x, -1); near(plug.axis.y, 0); near(plug.axis.z, 0);
  near(plug.length, .6); near(plug.radius, .12);
  assert.equal(plug.profile[0].t, 0); assert.equal(plug.profile[0].r, 0);
  assert.equal(plug.profile.at(-1).t, 1); assert.equal(plug.profile.at(-1).r, 0);
  const tip = ['x', 'y', 'z'].map(axis => plug.root[axis] + plug.axis[axis] * plug.length);
  near(tip[0], -.5); near(tip[1], .2); near(tip[2], .3);
  near(Math.max(...plug.profile.map(point => point.r)) * plug.radius, .12);
  assert.deepEqual(plain(socket.profile[0]), plain(socket.profile.at(-1)));
  assert.ok(socket.profile.every(point => point.r > 0), 'Socket stays hollow instead of closing onto its axis / Socket保留中空截面');
  const secondSocket = evaluate({ scenario: 'socket-frot', x: .1, z: .2 }).illustrations.find(item => item.id === 'socket-other');
  assert.equal(secondSocket.kind, 'socket');
  assert.deepEqual(plain(secondSocket.root), { x: .1, y: 0, z: .2 });
  assert.deepEqual(plain(secondSocket.axis), { x: 0, y: 0, z: -1 });
  assert.ok(socket.profile.some(point => point.t < 0));
  assert.ok(socket.profile.some(point => point.t > 0));
  for (const surface of scene.illustrations) {
    near(Math.hypot(surface.axis.x, surface.axis.y, surface.axis.z), 1);
    assert.ok(surface.profile.length >= 6);
    assert.ok(surface.profile.every(point => Number.isFinite(point.t) && Number.isFinite(point.r) && point.r >= 0));
  }
  // A reference surface must not move or resize either of the actual Contact senders.
  // 示意表面不能改变真正 Contact 发送球的位置或半径。
  near(shape(scene, 'sender-root').radius, .01);
  near(shape(scene, 'sender-length').radius, .6);
  assert.deepEqual(plain(shape(scene, 'sender-length').center), { x: .1, y: .2, z: .3 });
  plug.profile[1].r = 99; plug.root.x = 99;
  const fresh = evaluate({ scenario: 'socket-modern', x: .1, y: .2, z: .3, yaw: 90, L: .6, W: .12 });
  assert.ok(fresh.illustrations.find(item => item.kind === 'plug').profile.every(point => point.r <= 1));
  assert.equal(fresh.illustrations.find(item => item.kind === 'plug').root.x, .1);
});

test('modern Root and NewTip observe different root-centred spheres / 现代 Root 与 NewTip 观测两个根部同心球', () => {
  const scene = evaluate({ scenario: 'socket-modern', z: .5, L: .2 });
  near(field(scene, 'PenOthersNewRoot').raw, .51);
  near(field(scene, 'PenOthersNewTip').raw, .7);
  near(scene.metrics.unsaturatedLengthEstimate, .2);
  assert.equal(shape(scene, 'receiver-root').radius, 1);
  assert.equal(shape(scene, 'receiver-length').radius, 1);
  assert.equal(shape(scene, 'sender-root').radius, .01);
  assert.equal(shape(scene, 'sender-length').radius, .2);
  assert.deepEqual(plain(shape(scene, 'sender-length').center), { x: 0, y: 0, z: .5 });
  assert.deepEqual(plain(scene.points.plugTip), { x: 0, y: 0, z: .3 });
  assert.notEqual(shape(scene, 'sender-length').center.z, scene.points.plugTip.z);
});

test('proximity uses full XYZ while yaw changes the tip but not concentric spheres / 近接按XYZ而旋转仅改变尖端参考', () => {
  const flat = evaluate({ scenario: 'socket-modern', z: .5 });
  const raised = evaluate({ scenario: 'socket-modern', z: .3, y: .4, yaw: 90 });
  near(field(raised, 'PenOthersNewRoot').raw, field(flat, 'PenOthersNewRoot').raw);
  near(field(raised, 'PenOthersNewTip').raw, field(flat, 'PenOthersNewTip').raw);
  near(raised.points.plugTip.x, -.2);
  near(raised.points.plugTip.z, .3);
  assert.equal(raised.metrics.estimatorRequiresPriorLengthLearning, true);
});

test('sender radius extends onset and saturation hides centre distance / 发送球半径扩大起始范围且饱和丢失中心距离', () => {
  const outsideRoot = evaluate({ scenario: 'socket-modern', z: 1.15, L: .2 });
  assert.equal(field(outsideRoot, 'PenOthersNewRoot').raw, 0);
  near(field(outsideRoot, 'PenOthersNewTip').raw, .05);
  const inside = evaluate({ scenario: 'socket-modern', z: .005 });
  assert.equal(field(inside, 'PenOthersNewRoot').raw, 1);
  assert.equal(inside.metrics.unsaturatedLengthEstimate, null);
});

test('legacy socket detects the length sphere and a real Close gate / 旧Socket检测长度球并使用真实Close门控', () => {
  const scene = evaluate({ scenario: 'socket-legacy', z: .1, D: .15, L: .2, party: 'Self' });
  near(field(scene, 'PenOthers').raw, 2 / 3);
  assert.equal(field(scene, 'PenOthersClose').raw, 1);
  assert.equal(shape(scene, 'sender-length').radius, .2);
  assert.equal(shape(scene, 'receiver-proximity').center.z, -.15);
  assert.equal(scene.party, 'Others');
  assert.equal(field(scene, 'PenSelf'), undefined);
  const offAxis = evaluate({ scenario: 'socket-legacy', x: .28, z: -.15, L: .2, D: .15 });
  assert.ok(field(offAxis, 'PenOthers').raw > 0);
  assert.equal(field(offAxis, 'PenOthers').effective, 0);
  assert.equal(field(offAxis, 'PenOthers').closeName, 'PenOthersClose');
});

test('socket touch separates raw proximity from the close capsule / Socket触摸区分原始近接与接近胶囊', () => {
  const scene = evaluate({ scenario: 'socket-touch', D: .15, x: .1, z: -.15, senderRadius: .025 });
  near(field(scene, 'TouchOthers').raw, .5);
  assert.equal(field(scene, 'TouchOthersClose').raw, 0);
  assert.equal(field(scene, 'TouchOthers').effective, 0);
  const largeBody = evaluate({ scenario: 'socket-touch', D: .15, x: .1, z: -.15, senderRadius: .06 });
  assert.equal(field(largeBody, 'TouchOthersClose').raw, 1);
  assert.ok(field(largeBody, 'TouchOthers').effective > 0);
});

test('plug depth is measured against a 1 mm socket root / Plug深度检测1毫米Socket根球', () => {
  const scene = evaluate({ scenario: 'plug-depth', z: .15, L: .2 });
  near(field(scene, 'PenOthers').raw, .255);
  assert.equal(shape(scene, 'sender-socket-root').radius, .001);
  assert.deepEqual(plain(shape(scene, 'sender-socket-root').center), { x: 0, y: 0, z: 0 });
  assert.deepEqual(plain(scene.points.senderRoot), { x: 0, y: 0, z: 0 });
  assert.equal(shape(scene, 'receiver-depth').center.z, .15);
  assert.ok(field(evaluate({ scenario: 'plug-depth', z: .2005, L: .2 }), 'PenOthers').raw > 0);
  assert.equal(field(evaluate({ scenario: 'plug-depth', z: .2011, L: .2 }), 'PenOthers').raw, 0);
});

test('plug touch caps the extension at 8 cm and height includes end caps / Plug手触扩展上限8厘米且高度含端帽', () => {
  const scene = evaluate({ scenario: 'plug-touch', L: .6, W: .12 });
  near(scene.metrics.extraRadius, .08);
  near(shape(scene, 'receiver-proximity').radius, .68);
  const close = shape(scene, 'receiver-close');
  near(close.radius, .2); near(close.height, .76); near(close.center.z, -.3);
  near(close.a.z, -.12); near(close.b.z, -.48);
  const beyondCap = evaluate({ scenario: 'plug-touch', L: .4, W: .02, z: -.435, senderRadius: .01 });
  const insideCap = evaluate({ scenario: 'plug-touch', L: .4, W: .02, z: -.425, senderRadius: .01 });
  assert.equal(field(beyondCap, 'TouchOthersClose').raw, 0);
  assert.equal(field(insideCap, 'TouchOthersClose').raw, 1);
});

test('capsule Sender proximity uses its nearest surface rather than its centre / 胶囊发送器按最近表面而非中心算近接', () => {
  const capsule = evaluate({ scenario: 'zone', senderShape: 'capsule', senderHeight: .4, senderRadius: .01, x: 0, z: .2 });
  const sphere = evaluate({ scenario: 'zone', senderRadius: .01, x: 0, z: .2 });
  near(field(capsule, 'Others').raw, 1);
  assert.equal(field(sphere, 'Others').raw, 0);
  const rotated = evaluate({ scenario: 'zone', senderShape: 'capsule', senderHeight: .4, senderRadius: .01, x: 0, z: .2, yaw: 90 });
  assert.equal(field(rotated, 'Others').raw, 0);
});

test('crossing capsule interiors and height offsets determine Frot Close / 两胶囊内部相交及高度偏移决定摩擦Close', () => {
  const state = { scenario: 'plug-frot', L: .6, W: .01, senderLength: .6, senderWidth: .01,
    x: .3, z: -.3, yaw: 90 };
  const crossing = evaluate(state);
  assert.equal(field(crossing, 'FrotOthersClose').raw, 1);
  near(field(crossing, 'FrotOthers').raw, 1 - .29 / .6);
  assert.equal(shape(crossing, 'sender-envelope').type, 'capsule');
  const above = evaluate({ ...state, y: .101 });
  assert.equal(field(above, 'FrotOthersClose').raw, 0);
  assert.equal(field(above, 'FrotOthers').effective, 0);
  const short = shape(evaluate({ scenario: 'plug-frot', L: .1, W: .07 }), 'receiver-close');
  near(short.effectiveHeight, .3);
  assert.deepEqual(plain(short.a), plain(short.b));
});

test('socket Frot and independent Zone keep their actual sender and gate semantics / Socket摩擦和独立Zone保留真实发送器与门控差异', () => {
  const socket = evaluate({ scenario: 'socket-frot', z: .1 });
  near(field(socket, 'FrotOthers').raw, .51);
  assert.equal(shape(socket, 'receiver-frot').center.z, .05);
  assert.equal(shape(socket, 'sender-socket-root').radius, .001);
  assert.equal(field(socket, 'FrotOthers').closeName, null);
  const zone = evaluate({ scenario: 'zone', senderKind: 'plug', x: 0, z: .05 });
  assert.equal(zone.values.length, 1);
  assert.equal(zone.values[0].path, 'VFH/Zone/Touch/Example/Others');
  assert.equal(zone.values[0].closeName, null);
  assert.equal(shape(zone, 'sender-envelope').height, .2);
  assert.equal(shape(zone, 'sender-envelope').radius, .03);
});

test('SPS fits four known noncoplanar anchors in full local XYZ / SPS由四个已知非共面锚点解局部XYZ', () => {
  const scene = evaluate({ scenario: 'sensa-sps', x: .2, y: .8, z: -.1 });
  const expected = [[-.35, .65, -.35], [.35, .65, .35], [.35, 1.35, -.35], [-.35, 1.35, .35]];
  expected.forEach(([x, y, z], index) => {
    assert.deepEqual(plain(shape(scene, 'receiver-P' + index).center), { x, y, z });
    near(field(scene, 'P' + index).raw, 1 - (Math.hypot(.2 - x, .8 - y, -.1 - z) - .001) / 2);
  });
  assert.equal(scene.values.length, 5);
  assert.equal(scene.metrics.fitValid, true);
  assert.equal(scene.metrics.valid, true);
  near(scene.metrics.position.x, .2); near(scene.metrics.position.y, .8); near(scene.metrics.position.z, -.1);
  near(scene.metrics.residual, 0);
  near(scene.metrics.conservativeCoverageRadius, 1.999 - Math.sqrt(3) * .35);
});

test('SDK Contact reports exact native leaves in metres and independent signed velocities / SDK Contact报告真实米制字段与独立有符号速度', () => {
  const scene = evaluate({ scenario: 'contact-sdk', x: -.4, y: -.3, z: .2, vx: -1, vy: 2, vz: -2, proximitySpeed: -.75 });
  assert.equal(scene.values.length, 12);
  assert.equal(scene.party, 'Self');
  assert.ok(scene.values.every(value => value.path === 'Sensa/Contact/Example/' + value.name));
  near(field(scene, 'Proximity').raw, 1 - (Math.sqrt(.29) - .001) / 2);
  assert.equal(field(scene, 'Proximity_SenderType').raw, 1);
  for (const [axis, position, velocity] of [['X', -.4, -1], ['Y', -.3, 2], ['Z', .2, -2]]) {
    near(field(scene, 'Proximity_SenderLocalPosition' + axis).raw, position);
    near(field(scene, 'Proximity_SenderVelocity' + axis).raw, velocity);
  }
  near(field(scene, 'Proximity_SenderVelocityMagnitude').raw, 3);
  near(field(scene, 'Proximity_ProximitySpeed').raw, -.75);
  assert.equal(field(scene, 'Radius').raw, 2);
  assert.equal(scene.metrics.coordinateFrame, 'AvatarRootMeters');
  assert.equal(scene.metrics.valid, true);
  assert.equal(scene.shapes.filter(shape => shape.role === 'receiver').length, 1);
  assert.deepEqual(plain(shape(scene, 'receiver-contact').center), { x: 0, y: 0, z: 0 });
  assert.equal(shape(scene, 'receiver-contact').radius, 2);
  assert.equal(shape(scene, 'sender-contact').radius, .001);
  const moved = evaluate({ scenario: 'contact-sdk', x: .5, y: .7, z: -.6, vx: -1, vy: 2, vz: -2, proximitySpeed: -.75 });
  for (const name of ['Proximity_SenderVelocityX', 'Proximity_SenderVelocityY', 'Proximity_SenderVelocityZ',
    'Proximity_SenderVelocityMagnitude', 'Proximity_ProximitySpeed']) near(field(moved, name).raw, field(scene, name).raw);
});

test('SDK Contact accepts origin and zero velocity while strictly positive proximity selects / SDK Contact原点及零速度有效且仅严格正接近值选中', () => {
  const origin = evaluate({ scenario: 'contact-sdk', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
  assert.equal(origin.metrics.valid, true);
  assert.equal(field(origin, 'Proximity').raw, 1);
  assert.deepEqual(plain(origin.metrics.position), { x: 0, y: 0, z: 0 });
  assert.equal(field(origin, 'Proximity_SenderVelocityMagnitude').effective, 0);
  const inside = evaluate({ scenario: 'contact-sdk', x: 2.0005, y: 0, z: 0 });
  assert.equal(inside.metrics.selected, true);
  near(field(inside, 'Proximity').raw, .00025);
  assert.equal(inside.coverage.kind, 'contact-sphere');
  near(inside.coverage.radius, 2.001);
  assert.equal(inside.coverage.containsTarget, true);
  for (const x of [2.001, 2.01]) {
    const outside = evaluate({ scenario: 'contact-sdk', x, y: 0, z: 0, vx: 3, vy: -2, vz: 1, proximitySpeed: -.5 });
    assert.equal(outside.metrics.valid, false);
    assert.equal(outside.metrics.selected, false);
    assert.equal(outside.metrics.active, true, 'producer activity continues outside coverage');
    assert.equal(outside.coverage.containsTarget, false);
    for (const value of outside.values.filter(value => value.name !== 'Proximity_ProximitySpeed' && !['Radius', 'Sample'].includes(value.name))) {
      assert.equal(value.raw, 0, value.name);
      assert.equal(value.effective, null, value.name);
    }
    assert.equal(field(outside, 'Sample').raw, 1 / 32);
    assert.equal(field(outside, 'Proximity_ProximitySpeed').raw, -.5, 'exit rate can transiently remain signed');
    assert.equal(outside.points.movingRoot.x, x);
  }
});

test('Shader requires usable raw and quantized axes so rounding cannot create a valid plane', () => {
  const roundedOnly = evaluate({ scenario: 'shader', rightX: .12, rightY: .57, rightZ: 0, forwardX: .24, forwardY: 1.14, forwardZ: 0 });
  const { right, forward } = roundedOnly.metrics;
  const roundedCross = Math.abs(right.x * forward.y - right.y * forward.x);
  assert.ok(roundedCross > Math.hypot(right.x, right.y) * Math.hypot(forward.x, forward.y) * 1e-4,
    'the quantized axes alone would incorrectly accept the proportional raw vectors');
  assert.equal(roundedOnly.metrics.basisValid, false);
  assert.equal(roundedOnly.metrics.valid, false);
  assert.equal(roundedOnly.metrics.bytes[3], 2);
  assert.deepEqual(plain(roundedOnly.values.filter(value => value.emitted).map(value => value.name)), ['Valid']);
  for (const rightX of [1e-7, 1e-6, 1e-5]) {
    const tiny = evaluate({ scenario: 'shader', rightX });
    assert.equal(tiny.metrics.valid, false, 'tiny raw axes or a collapsed quantized axis remain invalid: ' + rightX);
    assert.equal(tiny.metrics.position, null);
  }
});

test('SDK Contact selects the maximum strictly positive matching self Sender / SDK Contact选中严格正且最大的自身Sender', () => {
  const scene = evaluate({ scenario: 'contact-sdk', senders: [
    { x: .01, senderType: 2, vx: 99 },
    { x: 2.001, senderType: 1, vx: 99 },
    { x: -1, senderType: 1, vx: -3 },
    { x: .5, senderType: 1, vx: 4 },
  ] });
  near(field(scene, 'Proximity').raw, .7505);
  assert.equal(field(scene, 'Proximity_SenderLocalPositionX').raw, .5);
  assert.equal(field(scene, 'Proximity_SenderVelocityX').raw, 4);
  const none = evaluate({ scenario: 'contact-sdk', senders: [] });
  assert.equal(none.metrics.selected, false);
  assert.equal(field(none, 'Proximity_SenderType').raw, 0);
});

test('SDK Contact Sample clock gates stale and disabled reports independently of velocity / SDK Contact采样时钟独立门控停更与停用', () => {
  assert.equal(evaluate({ scenario: 'contact-sdk', ageMs: 1000 }).metrics.valid, true);
  assert.equal(evaluate({ scenario: 'contact-sdk', ageMs: 1001, vx: 3 }).metrics.valid, false);
  assert.equal(evaluate({ scenario: 'contact-sdk', ageMs: 1001, vx: -3, sample: 1 }).metrics.valid, false);
  assert.equal(evaluate({ scenario: 'contact-sdk', ageMs: 1001, timeoutMs: 5000 }).metrics.valid, false);
  assert.equal(evaluate({ scenario: 'contact-sdk', ageMs: 201, timeoutMs: 200 }).metrics.valid, false);
  for (const input of [{ sample: 0 }, { sample: .1 }, { valid: false }]) {
    const scene = evaluate({ scenario: 'contact-sdk', ...input });
    assert.equal(scene.metrics.selected, true);
    assert.equal(scene.metrics.active, false);
    assert.equal(scene.metrics.position, null);
    assert.equal(field(scene, 'Proximity_SenderLocalPositionY').effective, null);
  }
  assert.equal(field(evaluate({ scenario: 'contact-sdk', valid: false }), 'Sample').raw, 0);
});

test('SPS rejects near-anchor saturation and uncovered cube corners / SPS拒绝近锚点饱和与未共同覆盖的立方体角', () => {
  const blind = evaluate({ scenario: 'sensa-sps', x: -.35, y: .65, z: -.348 });
  assert.equal(blind.metrics.fitValid, false);
  assert.equal(blind.metrics.coverageReason, 'proximity-boundary');
  assert.equal(blind.metrics.position, null);
  const corner = evaluate({ scenario: 'sensa-sps', x: 1.5, y: 2.5, z: 1.5 });
  assert.equal(corner.metrics.fitValid, false);
  assert.equal(corner.metrics.position, null);
});

test('Sample validity and changing-value age are distinct from geometric fit / Sample有效性和变化寿命与几何拟合分开', () => {
  for (const sample of [0, .1, -1, 1.01]) {
    const scene = evaluate({ scenario: 'sensa-sps', sample });
    assert.equal(scene.metrics.fitValid, true);
    assert.equal(scene.metrics.active, false);
    assert.equal(scene.metrics.position, null);
    assert.equal(field(scene, 'P0').effective, null);
  }
  assert.equal(evaluate({ scenario: 'sensa-sps', ageMs: 1000 }).metrics.valid, true);
  assert.equal(evaluate({ scenario: 'sensa-sps', ageMs: 1001 }).metrics.valid, false);
  assert.equal(evaluate({ scenario: 'sensa-sps', timeoutMs: 2000, ageMs: 1250 }).metrics.valid, true);
  assert.equal(evaluate({ scenario: 'sensa-sps', timeoutMs: 2000, ageMs: 1251 }).metrics.valid, false);
  assert.equal(evaluate({ scenario: 'sensa-sps', timeoutMs: 200, ageMs: 201 }).metrics.valid, false);
  assert.equal(evaluate({ scenario: 'sensa-sps', timeoutMs: 0 }).metrics.sampleAgeLimitMs, 1000);
});

test('Shader has no Contact spheres and preserves range endpoints exactly / Shader无Contact球且保留编码范围端点', () => {
  const scene = evaluate({ scenario: 'shader', x: 2, y: -1, z: 2 });
  assert.equal(scene.shapes.length, 1);
  assert.equal(scene.shapes[0].role, 'reference');
  assert.equal(scene.shapes[0].type, 'box');
  assert.deepEqual(plain(scene.metrics.quantized), { x: 65535, y: 0, z: 65535 });
  assert.deepEqual(plain(scene.metrics.decoded), { x: 2, y: -1, z: 2 });
  assert.equal(scene.metrics.quantError.length, 0);
  assert.equal(scene.metrics.valid, true);
});

test('Shader coordinates, axes, scale and CRC32 match the independent native format-1 vector', () => {
  const scene = evaluate({ scenario: 'shader', frame: 65536 });
  assert.equal(field(scene, 'Frame').raw, 0);
  near(scene.metrics.quantizationStep, 4 / 65535);
  assert.ok(scene.metrics.quantError.length <= scene.metrics.spatialQuantizationBound);
  const reference = evaluate({ scenario: 'shader', x: 0, y: 1, z: 0, frame: 256 });
  assert.equal(reference.metrics.bytes.map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase(), nativeShader.packetHex);
  for (const [name, expected] of [['Right', nativeShader.expected.right], ['Forward', nativeShader.expected.forward]])
    for (const [index, axis] of ['X', 'Y', 'Z'].entries()) near(field(reference, name + axis).raw, expected[index]);
  near(field(reference, 'AvatarScale').raw, nativeShader.expected.avatarScale);
  assert.equal(evaluate({ scenario: 'shader', frame: 65535 }).metrics.bytes[5], 255);
});

test('Shader quantization uses nearest-even at ties and preserves adjacent bins / Shader量化半整数取偶且保留相邻区间', () => {
  const unit = 4 / 65535, delta = unit / 1024;
  // Exact half-integer inputs include both signs of the local coordinate.
  // 精确半整数输入覆盖正负局部坐标；相邻值不可用容差一并当作平局。
  for (const [x, lower, expected] of [[unit, 32768, 32768], [-unit, 32766, 32766], [0, 32767, 32768]]) {
    assert.equal((x + 2) / 4 * 65535, lower + .5);
    const scene = evaluate({ scenario: 'shader', x, y: 1, z: 0 });
    assert.equal(scene.metrics.encoded.x, expected);
    assert.deepEqual(plain(scene.metrics.bytes.slice(6, 8)), [expected & 255, expected >>> 8]);
    near(field(scene, 'X').raw, expected / 65535 * 4 - 2);
    assert.equal(evaluate({ scenario: 'shader', x: x - delta }).metrics.encoded.x, lower);
    assert.equal(evaluate({ scenario: 'shader', x: x + delta }).metrics.encoded.x, lower + 1);
  }
});

test('Shader invalidation emits only Valid and does not offer stale coordinates / Shader失效只发布Valid且不提供旧坐标', () => {
  for (const state of [{ x: 2.001 }, { valid: false }, { ageMs: 501 }]) {
    const scene = evaluate({ scenario: 'shader', ...state });
    assert.equal(scene.metrics.valid, false);
    assert.equal(scene.metrics.position, null);
    assert.deepEqual(plain(scene.values.filter(v => v.emitted).map(v => [v.name, v.raw])), [['Valid', 0]]);
  }
  assert.equal(evaluate({ scenario: 'shader', ageMs: 500 }).metrics.valid, true);
  assert.equal(evaluate({ scenario: 'shader', timeoutMs: 200, ageMs: 201 }).metrics.valid, false);
  assert.equal(evaluate({ scenario: 'shader', timeoutMs: 9000 }).metrics.frameAgeLimitMs, 500);
  assert.equal(evaluate({ scenario: 'shader', x: 2.01 }).metrics.bytes[3], 2);
  assert.equal(evaluate({ scenario: 'shader', ageMs: 501 }).metrics.bytes[3], 3);
});

test('model rejects nonfinite inputs and results do not mutate caller state / 模型拒绝非有限输入且不修改调用方状态', () => {
  for (const state of [{ x: NaN }, { L: 0 }, { W: -1 }, { D: Infinity }, { senderRadius: -1 }, { scenario: 'invented' }]) {
    assert.throws(() => evaluate(state), /finite|有限|Unknown|未知/);
  }
  const state = { scenario: 'socket-modern', x: .1, z: .3 };
  const first = evaluate(state); first.shapes[0].center.x = 9; first.points.movingRoot.x = 8;
  assert.deepEqual(state, { scenario: 'socket-modern', x: .1, z: .3 });
  assert.equal(evaluate(state).shapes[0].center.x, 0);
});


test('coverage uses all four strict distance shells and the coordinate box / 覆盖区遵循四路距离界与坐标边界', () => {
  const geometry = model.spsGeometry;
  assert.equal(geometry.receiverRadius, 2);
  assert.equal(geometry.anchorHalfSpan, .35);
  assert.equal(geometry.positionHalfRange, 2);
  const center = { x: 0, y: 1, z: 0 };
  assert.equal(model.coverageContains(center), true);
  assert.equal(model.coverageContains({ x: .35, y: .65, z: .35 }), false, 'anchor saturation is excluded');
  assert.equal(model.coverageContains({ x: 2, y: 3, z: 2 }), false, 'cube corner lacks all four ranges');
  assert.equal(model.coverageContains({ x: 2, y: 3, z: 2 }, 'shader'), true, 'Shader has no Contact coverage limit');
  assert.equal(model.coverageContains({ x: 2.001, y: 1, z: 0 }, 'shader'), false);
  assert.equal(model.coverageContains({ x: NaN, y: 1, z: 0 }), false);
  for (const y of [-1, -.25, .65, 1, 1.35, 2.25, 3]) for (const x of [-1.9, -.7, 0, .7, 1.9]) for (const z of [-1.9, -.7, 0, .7, 1.9]) {
    const point = { x, y, z }, scene = evaluate({ scenario: 'sensa-sps', ...point });
    assert.equal(scene.coverage.containsTarget, scene.metrics.fitValid, JSON.stringify(point));
  }
});

test('drawn detection boundary is computed from all receiver spheres / 可测外形由全部接收球计算', () => {
  const origin = { x: 0, y: 1, z: 0 };
  for (let i = 0; i < 40; i++) {
    const angle = i * Math.PI / 20, direction = { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
    const radius = model.coverageRadius(direction);
    assert.ok(radius > 0 && radius < 2);
    const at = factor => ({ x: origin.x + direction.x * radius * factor, y: 1, z: direction.z * radius * factor });
    assert.equal(model.coverageContains(at(.99999)), true);
    assert.equal(model.coverageContains(at(1.00001)), false);
  }
  const slice = evaluate({ scenario: 'sensa-sps', y: .65 }).coverage;
  assert.equal(slice.slice.length, 128);
  assert.equal(slice.holes.length, 2);
  assert.equal(slice.kind, 'contact-intersection');
  assert.equal(evaluate({ scenario: 'sensa-sps', y: -1 }).coverage.slice.length, 0);
  assert.equal(evaluate({ scenario: 'shader', y: -1 }).coverage.slice.length, 128);
});


test('native QR matches the independently decoded standard vector and keeps its white movement margin', () => {
  assert.deepEqual(plain(model.shaderEncoding), { width: 49, height: 49, quiet: 8, standardQuiet: 4, buffer: 4, version: 4, level: 'H', bytes: 32, blocks: 4, dataPerBlock: 9, eccPerBlock: 16 });
  const reference = evaluate({ scenario: 'shader', x: 0, y: 1, z: 0, frame: 256 });
  const qr = model.encodeQr(reference.metrics.bytes);
  assert.equal(qr.mask, 1);
  assert.deepEqual(plain(qr.scores), [767, 705, 982, 791, 874, 898, 980, 772]);
  assert.equal(reference.metrics.qrMask, qr.mask);
  assert.deepEqual(Array.from({ length: 49 }, (_, screenRow) => Array.from({ length: 49 }, (_, column) => model.encodedBit(reference.metrics.bytes, column, 48 - screenRow)).join('')), nativeShader.screenRows);
  const counts = {}, blockBits = Array.from({ length: 4 }, () => new Set());
  let buffer = 0;
  for (let column = 0; column < 49; column++) for (let row = 0; row < 49; row++) {
    const cell = model.encodedCell(column, row);
    counts[cell.region] = (counts[cell.region] || 0) + 1;
    if (cell.region === 'quiet') {
      assert.equal(model.encodedBit(reference.metrics.bytes, column, row), 1);
      buffer += Number(cell.buffer);
    } else assert.equal(model.encodedBit(reference.metrics.bytes, column, row), 1 - qr.matrix[40 - row][column - 8]);
    if (cell.region === 'data' || cell.region === 'ecc') blockBits[cell.block].add(`${cell.blockByte}/${cell.bit}`);
  }
  assert.deepEqual(counts, { quiet: 1312, finder: 147, separator: 45, format: 30, timing: 34, data: 288, ecc: 512, dark: 1, remainder: 7, alignment: 25 });
  assert.equal(buffer, 720);
  for (const block of blockBits) assert.equal(block.size, 25 * 8);
  assert.throws(() => model.encodedCell(49, 0));
  assert.throws(() => model.encodedCell(0, -1));
});

test('QR masks spread constant payloads and choose the lowest visual penalty', () => {
  for (const bytes of [Array(32).fill(0), Array(32).fill(255), Array(32).fill(128),
    Array.from({ length: 32 }, (_, i) => i), ...[0, 1, 255, 256, 65535].map(frame => evaluate({ scenario: 'shader', frame }).metrics.bytes)]) {
    const qr = model.encodeQr(bytes);
    assert.equal(qr.mask, qr.scores.indexOf(Math.min(...qr.scores)));
    const black = qr.matrix.flat().reduce((a, b) => a + b, 0) / (33 * 33);
    assert.ok(black >= .4 && black <= .6, `black coverage: ${black}`);
    assert.equal(qr.codewords.length, 100);
    // Function patterns are fixed while both the data and correction symbols carry changes.
    assert.deepEqual(plain(qr.matrix.slice(0, 7).map(row => row.slice(0, 7))), [
      [1, 1, 1, 1, 1, 1, 1], [1, 0, 0, 0, 0, 0, 1], [1, 0, 1, 1, 1, 0, 1],
      [1, 0, 1, 1, 1, 0, 1], [1, 0, 1, 1, 1, 0, 1], [1, 0, 0, 0, 0, 0, 1], [1, 1, 1, 1, 1, 1, 1],
    ]);
  }
});

test('QR caching follows byte contents and callers cannot mutate a cached matrix', () => {
  const bytes = evaluate({ scenario: 'shader', frame: 1 }).metrics.bytes;
  const before = model.encodeQr(bytes), again = model.encodeQr([...bytes]);
  assert.equal(again, before);
  assert.throws(() => { before.matrix[0][0] = 0; }, /read only/);
  bytes[4] ^= 1;
  const after = model.encodeQr(bytes);
  assert.notEqual(after, before);
  assert.notDeepEqual(plain(after.codewords), plain(before.codewords));
  const changedEcc = after.codewords.slice(36).filter((value, i) => value !== before.codewords[36 + i]);
  assert.ok(changedEcc.length >= 12, 'changing a data byte affects the RS correction symbols');
  for (const invalid of [[], Array(32).fill(256), Array(32).fill(-1), Array(32).fill(.5), Array(32).fill(NaN)])
    assert.throws(() => model.encodeQr(invalid), /32 bytes/);
});

test('Shader axis samples preserve shear and reject degenerate directions or unusable unit scale', () => {
  const valid = evaluate({ scenario: 'shader', rightX: 2, rightY: .5, forwardX: .5, forwardZ: 1.5, avatarScale: 2 });
  assert.equal(valid.metrics.valid, true);
  near(field(valid, 'RightX').raw, 2, 8 / 32767);
  near(field(valid, 'AvatarScale').raw, 2, 8 / 65535);
  for (const input of [{ rightX: 0 }, { forwardX: 1, forwardZ: 0 }, { rightX: 8.1 }, { avatarScale: 0 }, { avatarScale: 8.1 }]) {
    const invalid = evaluate({ scenario: 'shader', ...input });
    assert.equal(invalid.metrics.valid, false, JSON.stringify(input));
    assert.deepEqual(plain(invalid.values.filter(value => value.emitted).map(value => value.name)), ['Valid']);
    assert.equal(invalid.metrics.position, null);
  }
});
