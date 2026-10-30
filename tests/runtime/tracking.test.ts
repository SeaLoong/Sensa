import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { OscParameterStore, type OscSource } from '../../src/core/protocols/osc.ts';
import { addPoint, crossPoint, fitFixedAnchors, fitLocalTetrahedron, fitMarker, fixedAnchors, fixedAnchorProtocol,
  getMetric, getPoseMetric, isSampleActive, observePoses, observeTracking, pointAnchorIndices, pointLength, poseAnchors,
  poseMatches, poseProtocol, scalePoint, shaderFields, subtractPoint, trackingMatches, type PosePoint } from '../../src/core/runtime/tracking.ts';

const point = (x = 0, y = 0, z = 0): PosePoint => ({ x, y, z });
const source = (key: string): OscSource => ({ key, label: key, persistentId: null, address: '127.0.0.1', port: 9000 });
const near = (actual: number, expected: number, tolerance = .00003): void => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const samples = (position: PosePoint, radius = poseProtocol.markerRadius): number[] => poseAnchors.map(anchor => Math.fround(1 - (pointLength(subtractPoint(position, anchor)) - radius) / 2));
function publishPoint(store: OscParameterStore, position: PosePoint, prefix = 'Sensa/Point/v1/a/Self', sender = source('one')): void {
  const ranges = samples(position);
  for (const [i, index] of pointAnchorIndices.entries()) store.set(`${prefix}/Root/A${i}`, ranges[index] ?? NaN, sender, 'Float');
}
function publishPose(store: OscParameterStore, root: PosePoint, tip: PosePoint, side: PosePoint, sender = source('one')): void {
  for (const [marker, position] of [['Root', root], ['Tip', tip], ['Side', side]] as const)
    samples(position).forEach((value, i) => store.set(`Sensa/Pose/v1/a/Self/${marker}/A${i}`, value, sender, 'Float'));
}
function publishFixed(store: OscParameterStore, position: PosePoint, counter = 1 / 32, sender = source('one')): void {
  fixedAnchors.forEach((anchor, i) => store.set(`Sensa/SPS/a/P${i}`, Math.fround(1 - (pointLength(subtractPoint(position, anchor)) - fixedAnchorProtocol.markerRadius) / 2), sender, 'Float'));
  store.set('Sensa/SPS/a/Sample', counter, sender, 'Float');
}
function publishShader(store: OscParameterStore, id = '1', values: Record<string, number> = {}, interrupt = false): void {
  const frame: Record<string, number> = { Frame: 1, X: .1, Y: 1, Z: -.2, RightX: 1, RightY: 0, RightZ: 0,
    ForwardX: 0, ForwardY: 0, ForwardZ: 1, AvatarScale: 1, Valid: 1, ...values };
  for (const field of shaderFields) {
    store.set(`Sensa/Shader/${id}/${field}`, frame[field] ?? NaN, source('one'), 'Float');
    if (interrupt && field === 'RightX') store.set('Unrelated', .2, source('one'), 'Float');
  }
}
function publishContact(store: OscParameterStore, values: Record<string, number> = {}): void {
  const frame = { Proximity: .6, Proximity_SenderType: 1, Proximity_SenderLocalPositionX: .1, Proximity_SenderLocalPositionY: .2,
    Proximity_SenderLocalPositionZ: -.3, Proximity_SenderVelocityX: 1, Proximity_SenderVelocityY: -2, Proximity_SenderVelocityZ: 3,
    Proximity_SenderVelocityMagnitude: Math.sqrt(14), Proximity_ProximitySpeed: -.4, Sample: 1 / 32, Radius: 2, ...values };
  for (const [leaf, value] of Object.entries(frame)) store.set(`Sensa/Contact/a/${leaf}`, value, source('one'), 'Float');
}
function random(seed: number): () => number { let state = seed; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; }; }

test('pure tracking protocol agrees with the shipped Unity public constants and anchor order', () => {
  const unity = (file: string): string => readFileSync(new URL(`../../unity/top.sealoong.sensa/Runtime/${file}.cs`, import.meta.url), 'utf8');
  assert.match(unity('SensaPoseProtocol'), /PointPrefix = "Sensa\/Point\/v1"/);
  assert.match(unity('SensaPoseProtocol'), /HandlePrefix = "Sensa\/Handle\/v1"/);
  assert.match(unity('SensaPoseProtocol'), /AnchorHalfSpan = 0\.35f/);
  assert.match(unity('SensaPoseProtocol'), /ReceiverRadius = 2f/);
  assert.match(unity('SensaFixedAnchorProtocol'), /MaximumSampleAgeMs = 1250/);
  assert.match(unity('SensaContactProtocol'), /MaximumSampleAgeMs = 1000/);
  assert.match(unity('SensaContactProtocol'), /CoordinateFrame = "AvatarRootMeters"/);
  assert.deepEqual(pointAnchorIndices, [0, 3, 5, 6]);
  assert.deepEqual(fixedAnchors[0], point(-Math.fround(.35), 1 - Math.fround(.35), -Math.fround(.35)));
  for (let i = 1; i <= 32; i++) assert.equal(isSampleActive(i / 32), true);
  for (const value of [0, -.1, 1.01, NaN, Infinity, .01]) assert.equal(isSampleActive(value), false);
});

test('current two-metre arrays recover known positions and unknown marker radius', () => {
  for (const position of [point(1.1, .2, -.3), point(-.7, -.8, .6), point(0, 0, 1.38), point(.012, .009, .03)]) {
    const full = samples(position), tetra = fitLocalTetrahedron(pointAnchorIndices.map(i => full[i] ?? NaN));
    assert.ok(tetra.valid, tetra.reason); assert.ok(pointLength(subtractPoint(tetra.position, position)) < .00001);
    const fitted = fitMarker(full); assert.ok(fitted.valid, fitted.reason); assert.ok(pointLength(subtractPoint(fitted.position, position)) < .00003);
  }
  for (const radius of [.001, .007, .015]) {
    const result = fitMarker(samples(point(-.04, .02, -.16), radius));
    assert.ok(result.valid, result.reason); near(result.radius, radius);
  }
});

test('preserved historical SDK captures keep their original geometry and cannot validate current receivers', () => {
  const replay = (raw: number[]) => {
    const values = raw.map(Math.fround), halfSpan = .06, radius = .35, marker = .001;
    const anchors = [point(-halfSpan, -halfSpan, -halfSpan), point(halfSpan, halfSpan, -halfSpan),
      point(halfSpan, -halfSpan, halfSpan), point(-halfSpan, halfSpan, halfSpan)];
    if (values.length !== 4 || values.some(value => !Number.isFinite(value) || value <= .00001 || value >= .99999)) return { valid: false, position: point() };
    const distances = values.map(value => radius * (1 - value) + marker);
    let position = point();
    for (const [i, anchor] of anchors.entries()) position = addPoint(position, scalePoint(anchor, -((distances[i] ?? NaN) ** 2)));
    position = scalePoint(position, 1 / (8 * halfSpan * halfSpan));
    const residual = Math.sqrt(anchors.reduce((sum, anchor, i) => sum + (pointLength(subtractPoint(position, anchor)) - (distances[i] ?? NaN)) ** 2, 0) / 4);
    return { valid: residual <= .002 && pointLength(position) <= .245, position };
  };
  const captured = JSON.parse(readFileSync(new URL('../fixtures/unity-point.json', import.meta.url), 'utf8')) as { schema: string; samples: number[]; position: { x: number; y: number; z: number } };
  assert.equal(captured.schema, 'sensa.point-lab.v1');
  const result = replay(captured.samples); assert.equal(result.valid, true);
  assert.ok(pointLength(subtractPoint(result.position, captured.position)) < .0001);
  assert.equal(fitLocalTetrahedron(captured.samples).valid, false);
  const cases = JSON.parse(readFileSync(new URL('../fixtures/unity-point-cases.json', import.meta.url), 'utf8')) as { cases: { name: string; samples: number[]; expectedValid: boolean; position: PosePoint }[] };
  assert.equal(cases.cases.length, 11);
  for (const row of cases.cases) {
    const fit = replay(row.samples); assert.equal(fit.valid, row.expectedValid, row.name);
    if (fit.valid) assert.ok(pointLength(subtractPoint(fit.position, row.position)) < .0001, row.name);
  }
});

test('tetrahedron covers 300 independent synthetic positions; bounded noise remains bounded', () => {
  const next = random(9271);
  for (let i = 0; i < 300; i++) {
    const expected = point((next() - .5) * .2, (next() - .5) * .2, (next() - .5) * .2), full = samples(expected);
    const fit = fitLocalTetrahedron(pointAnchorIndices.map(index => full[index] ?? NaN));
    assert.ok(fit.valid, fit.reason); assert.ok(pointLength(subtractPoint(fit.position, expected)) < .000001);
  }
  const noise = random(712);
  for (let i = 0; i < 150; i++) {
    const expected = point((noise() - .5) * .06, (noise() - .5) * .06, (noise() - .5) * .3);
    const fit = fitMarker(samples(expected).map(value => value + (noise() - .5) * .0004));
    assert.ok(fit.valid, fit.reason); assert.ok(pointLength(subtractPoint(fit.position, expected)) < .003);
  }
});

test('missing, nonfinite, saturated and inconsistent ranges never assert a valid reconstruction', () => {
  for (const bad of [[], [.5, .5, .5], [NaN, .5, .5, .5], [1, .5, .5, .5]]) assert.equal(fitLocalTetrahedron(bad).valid, false);
  for (const bad of [new Array<number>(7).fill(.5), new Array<number>(8).fill(0), new Array<number>(8).fill(Infinity)]) assert.equal(fitMarker(bad).valid, false);
  const inconsistent = samples(point(.01, .02, .1)); inconsistent[3] = (inconsistent[3] ?? 0) + .15;
  assert.equal(fitMarker(inconsistent).valid, false);
  const out = samples(point(0, 0, poseProtocol.positionRadius + .02)); assert.equal(fitMarker(out).valid, false);
  assert.equal(fitLocalTetrahedron(pointAnchorIndices.map(i => out[i] ?? NaN)).valid, false);
  assert.equal(fitMarker(samples(poseAnchors[0] ?? point())).valid, false);
});

test('point producers retain source, party, the oldest timestamp and handle grab state', () => {
  let now = 100; const store = new OscParameterStore(() => now);
  publishPoint(store, point(.01, .02, .1));
  const first = observeTracking(store.snapshotEntries(), null, now, 1000)[0]; assert.ok(first?.valid); assert.equal(first.coordinateFrame, 'ReferenceLocal');
  near(getMetric(first, 'Z') ?? NaN, .1); assert.equal(getMetric(first, 'VelocityX'), undefined); assert.ok(trackingMatches(first, 'Sensa/Point/**'));
  now = 1200; store.set('Sensa/Point/v1/a/Self/Root/A0', .7, source('one'), 'Float');
  assert.equal(observeTracking(store.snapshotEntries(), null, now, 1000)[0]?.valid, false);
  const others = new OscParameterStore(() => 100); publishPoint(others, point(), 'Sensa/Point/v1/a/Others');
  assert.equal(observeTracking(others.snapshotEntries(), null, 100)[0]?.valid, false);
  const handles = new OscParameterStore(() => now); publishPoint(handles, point(), 'Sensa/Handle/v1/a/Self');
  assert.equal(observeTracking(handles.snapshotEntries(), null, now)[0]?.valid, false);
  handles.set('Sensa/Handle/v1/a/Self/Handle_IsGrabbed', true, source('one'));
  assert.equal(observeTracking(handles.snapshotEntries(), null, now)[0]?.valid, true);
  assert.equal(observeTracking(handles.snapshotEntries(), 'other', now).length, 0);
});

test('fixed SPS reconstructs avatar-root coordinates and requires a changing activity counter', () => {
  let now = 100; const store = new OscParameterStore(() => now), expected = point(.12, .8, -.23);
  publishFixed(store, expected); const first = observeTracking(store.snapshotEntries(), null, now)[0];
  assert.ok(first?.valid, first?.reason); assert.ok(pointLength(subtractPoint(first.position, expected)) < .00001); assert.equal(first.coordinateFrame, 'AvatarRootLocal');
  now = 1500; publishFixed(store, expected); assert.equal(observeTracking(store.snapshotEntries(), null, now)[0]?.valid, false);
  publishFixed(store, expected, 2 / 32); assert.equal(observeTracking(store.snapshotEntries(), null, now)[0]?.valid, true);
  publishFixed(store, expected, 0); assert.equal(observeTracking(store.snapshotEntries(), null, now)[0]?.valid, false);
  assert.equal(fitFixedAnchors([.5, .5, .5]).valid, false);
});

test('shader frames require canonical identity, ordered fields, independent axes and fresh frame changes', () => {
  let now = 100; const store = new OscParameterStore(() => now); publishShader(store);
  const row = observeTracking(store.snapshotEntries(), null, now)[0]; assert.ok(row?.valid); assert.equal(getMetric(row, 'AvatarScale'), 1); assert.equal(row.coordinateFrame, 'AvatarRootLocal');
  now = 601; publishShader(store); assert.equal(observeTracking(store.snapshotEntries(), null, now)[0]?.valid, false);
  publishShader(store, '1', { Frame: 2 }); assert.equal(observeTracking(store.snapshotEntries(), null, now)[0]?.valid, true);
  for (const id of ['0', '01', '65536', '-1', 'x']) { const bad = new OscParameterStore(() => 1); publishShader(bad, id); assert.equal(observeTracking(bad.snapshotEntries(), null, 1)[0]?.valid, false); }
  for (const values of [{ ForwardX: 1, ForwardZ: 0 }, { AvatarScale: 0 }, { AvatarScale: 9 }, { Frame: .1 }, { Valid: 0 }, { Y: 3.01 }]) {
    const bad = new OscParameterStore(() => 1); publishShader(bad, '1', values); assert.equal(observeTracking(bad.snapshotEntries(), null, 1)[0]?.valid, false);
  }
  const mixed = new OscParameterStore(() => 1); publishShader(mixed, '1', {}, true); assert.equal(observeTracking(mixed.snapshotEntries(), null, 1)[0]?.valid, false);
  const beforeArrival = observeTracking(store.snapshotEntries(), null, 0)[0]; assert.equal(beforeArrival?.valid, false);
});

test('Contact keeps metre velocity distinct from proximity speed and rejects invalid sender/activity/bounds', () => {
  let now = 100; const store = new OscParameterStore(() => now); publishContact(store);
  const row = observeTracking(store.snapshotEntries(), null, now)[0]; assert.ok(row?.valid); assert.equal(row.coordinateFrame, 'AvatarRootMeters');
  assert.equal(getMetric(row, 'VelocityY'), -2); assert.equal(getMetric(row, 'ProximitySpeed'), -.4); near(getMetric(row, 'Speed') ?? NaN, Math.sqrt(14));
  now = 1101; publishContact(store); assert.equal(observeTracking(store.snapshotEntries(), null, now)[0]?.valid, false);
  publishContact(store, { Sample: 2 / 32 }); assert.equal(observeTracking(store.snapshotEntries(), null, now)[0]?.valid, true);
  for (const values of [{ Proximity_SenderType: 0 }, { Proximity: 0 }, { Radius: 0 }, { Radius: 3.01 }, { Radius: .1 }, { Sample: .01 }, { Proximity_SenderVelocityMagnitude: -1 }]) {
    const bad = new OscParameterStore(() => 1); publishContact(bad, values); assert.equal(observeTracking(bad.snapshotEntries(), null, 1)[0]?.valid, false);
  }
});

test('pose reconstruction retains depth, tilt, roll and separate aperture engagement', () => {
  for (const offset of [0, .01, .03]) {
    const store = new OscParameterStore(() => 100); publishPose(store, point(offset, 0, -.1), point(offset, 0, .1), point(offset + .03, 0, -.1));
    const row = observePoses(store.snapshotEntries(), null, 100, 1000)[0]; assert.ok(row?.valid); assert.ok(row.engaged); near(row.depth, .5); near(row.intersection.x, offset);
    assert.ok(poseMatches(row, 'Sensa/Pose/**')); near(getPoseMetric(row, 'OffsetX'), offset);
  }
  const axis = point(.5, 0, Math.sqrt(.75)), right = point(Math.sqrt(.75), 0, -.5);
  const rotated = addPoint(scalePoint(right, Math.cos(Math.PI / 6)), scalePoint(crossPoint(axis, right), Math.sin(Math.PI / 6)));
  const store = new OscParameterStore(() => 100), root = scalePoint(axis, -.1);
  publishPose(store, root, scalePoint(axis, .1), addPoint(root, scalePoint(rotated, .03)));
  const tilted = observePoses(store.snapshotEntries(), null, 100)[0]; assert.ok(tilted?.engaged); near(tilted.yaw, 30, .01); near(tilted.roll, 30, .01);
  assert.equal(observePoses(store.snapshotEntries(), null, 1200, 1000)[0]?.valid, false);
  const off = new OscParameterStore(() => 1); publishPose(off, point(.1, 0, -.1), point(.1, 0, .1), point(.13, 0, -.1));
  const missingAperture = observePoses(off.snapshotEntries(), null, 1)[0]; assert.ok(missingAperture?.valid); assert.equal(missingAperture.engaged, false); assert.equal(missingAperture.depth, 0);
  const parallel = new OscParameterStore(() => 1); publishPose(parallel, point(-.1, 0, .1), point(.1, 0, .1), point(-.1, .03, .1));
  assert.equal(observePoses(parallel.snapshotEntries(), null, 1)[0]?.valid, false);
});

test('tracking isolates sources and caps each producer family with deterministic ordinal order', () => {
  const store = new OscParameterStore(() => 10);
  for (let i = 70; i >= 0; i--) publishFixed(store, point(0, 1, 0), 1 / 32, source(String(i).padStart(3, '0')));
  const rows = observeTracking(store.snapshotEntries(), null, 10);
  // The parameter store's independent 32-source budget applies before tracking's 64-producer budget.
  assert.equal(rows.length, 32); assert.equal(new Set(rows.map(row => row.sourceKey)).size, 32);
  assert.deepEqual(rows.map(row => row.sourceKey), [...rows.map(row => row.sourceKey)].sort());
  const same = new OscParameterStore(() => 10);
  for (let i = 70; i >= 0; i--) {
    const prefix = `Sensa/Point/v1/${String(i).padStart(3, '0')}/Self`;
    publishPoint(same, point(), prefix);
  }
  assert.equal(observeTracking(same.snapshotEntries(), null, 10).length, 64);
});
