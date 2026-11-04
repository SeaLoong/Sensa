import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SpsDepthEstimator } from '../../src/core/runtime/motion.ts';
import { RuntimeEngine } from '../../src/core/runtime/runtime.ts';
import { normalizeConfiguration } from '../../src/core/runtime/configuration.ts';
import { ogbDepthAddress } from '../../src/core/runtime/resolver.ts';
import { OscParameterStore, type OscSource } from '../../src/core/protocols/osc.ts';
import type { RuntimeMotionFrame } from '../../src/core/runtime/model.ts';

interface Contract {
  schema: number;
  producer: { repository: string; channel: string; commit: string; sources: { path: string; url: string; sha256: string }[] };
  scope: { legacyChannels: string[]; nativeCollisionTagsAreNotOscParameters: boolean; privateOnlyChannelsHaveNoLegacySenderGuarantee: boolean;
    notHipsOnlyDoesNotMatchOthers: boolean; receiverPartyCompatibility: { party: string; receiverTagSuffix: string; requiredSenderChannel: string }[] };
  socket: { prefix: string; receiverRadiusMeters: number; rootSenderRadiusMeters: number; rootTag: string; lengthTag: string; parties: string[]; rootSuffix: string; tipSuffix: string };
  traces: { name: string; party: string; senderChannels: string[]; receiverTagSuffix: string; plugLengthMeters: number; learningDistanceMeters: number; insideDistanceMeters: number; expectedFraction: number }[];
}
const contract = JSON.parse(await readFile(new URL('./fixtures/sps-beta-ogb-contract.json', import.meta.url), 'utf8')) as Contract;
const source: OscSource = { key: 'avatar-a', label: 'Avatar A', persistentId: null, address: '127.0.0.1', port: 9000 };
const otherSource: OscSource = { ...source, key: 'avatar-b', label: 'Avatar B', port: 9001 };
const parent = contract.socket.prefix + '/Body/Main';
const pathFor = (party: string, suffix = '', instance = parent): string => instance + '/Pen' + party + suffix;
const pattern = pathFor('Others');
const closeTo = (actual: number | undefined, expected: number): void => {
  assert.equal(typeof actual, 'number');
  assert.ok(Math.abs(actual! - expected) < 1e-9, `${actual} != ${expected}`);
};
// Independent producer geometry: a spherical Sender crossing a spherical
// Proximity Receiver. NewTip is the historical root-centred length sphere.
function proximity(distance: number, senderRadius: number): number {
  return Math.max(0, Math.min(1, 1 - Math.max(0, distance - senderRadius) / contract.socket.receiverRadiusMeters));
}
function readings(distance: number, length: number): readonly [number, number] {
  return [proximity(distance, contract.socket.rootSenderRadiusMeters), proximity(distance, length)];
}
function rig(oscPath = pattern, sourceMode = 'OgbDepth') {
  let now = 1000;
  const store = new OscParameterStore(() => now), frames: RuntimeMotionFrame[] = [], stops: string[] = [];
  const config = normalizeConfiguration({ osc: { inputTimeoutMs: 100 }, signals: [{ oscPath, sourceMode, role: 'Depth' }] });
  const runtime = new RuntimeEngine(config, { now: () => now, oscStore: store,
    sendFrame: frame => { frames.push(frame); }, stopOutputs: () => { stops.push('stop'); } });
  runtime.setInputMode('Osc');
  return { store, runtime, frames, stops,
    setTime: (value: number): void => { now = value; },
    set: (path: string, value: number, producer = source): void => { store.set(path, value, producer); },
    advance: async (ms = 31): Promise<void> => { now += ms; runtime.tick(); await runtime.flush(); },
    last: (): number | undefined => frames.at(-1)?.values.L0,
  };
}

test('SPS3 beta fixture identifies the audited legacy OGB contract and channel limitation', () => {
  assert.equal(contract.schema, 1);
  assert.equal(contract.producer.repository, 'VRCFury/VRCFury');
  assert.equal(contract.producer.channel, 'beta');
  assert.equal(contract.producer.commit, '59fa4fa0277c0f3eb7c73811d9b24bf73e2133f4');
  for (const evidence of contract.producer.sources) {
    assert.equal(evidence.url, `https://github.com/${contract.producer.repository}/blob/${contract.producer.commit}/${evidence.path}`);
    assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
  }
  assert.deepEqual(contract.scope.legacyChannels, ['_public', '_nothips']);
  assert.equal(contract.scope.nativeCollisionTagsAreNotOscParameters, true);
  assert.equal(contract.scope.privateOnlyChannelsHaveNoLegacySenderGuarantee, true);
  assert.equal(contract.scope.notHipsOnlyDoesNotMatchOthers, true);
  assert.deepEqual(contract.scope.receiverPartyCompatibility.filter(rule => rule.party === 'Others'),
    [{ party: 'Others', receiverTagSuffix: '', requiredSenderChannel: '_public' }]);
  for (const trace of contract.traces) {
    const rule = contract.scope.receiverPartyCompatibility.find(candidate => candidate.party === trace.party
      && candidate.receiverTagSuffix === trace.receiverTagSuffix);
    assert.ok(rule, trace.name);
    assert.ok(trace.senderChannels.includes(rule.requiredSenderChannel), trace.name);
  }
});

for (const trace of contract.traces) test('SPS3 beta compatible OGB geometry keeps the shared depth estimator: ' + trace.name, async () => {
  const r = rig(pathFor(trace.party));
  const pair = (distance: number): void => {
    const [root, tip] = readings(distance, trace.plugLengthMeters);
    r.set(pathFor(trace.party, contract.socket.rootSuffix), root);
    r.set(pathFor(trace.party, contract.socket.tipSuffix), tip);
  };
  try {
    pair(trace.learningDistanceMeters); await r.advance();
    assert.equal(r.frames.length, 0, 'Receiving samples never enables input');
    r.runtime.setInputActive(true); await r.runtime.flush(); closeTo(r.last(), 0);
    pair(trace.insideDistanceMeters); await r.advance();
    closeTo(r.last(), trace.expectedFraction * .999);
  } finally { r.runtime.dispose(); }
});

test('SPS root/tip addresses retain complete instance and party identity', () => {
  for (const party of contract.socket.parties) for (const suffix of ['', 'NewRoot', 'NewTip']) {
    const address = ogbDepthAddress(pathFor(party, suffix));
    assert.ok(address); assert.equal(address.party, party); assert.equal(address.parent, parent);
    assert.equal(address.root, pathFor(party, 'NewRoot')); assert.equal(address.tip, pathFor(party, 'NewTip'));
  }
  assert.ok(ogbDepthAddress(pathFor('Others', 'Close')));
  assert.equal(ogbDepthAddress(pathFor('Self', 'Close')), null);
  for (const invalid of ['OGB/Orf/Body//PenOthersNewRoot', 'OGB/Pen/Body/PenOthersNewRoot',
    'Custom/Orf/Body/PenOthersNewRoot', 'OGB/Orf/Body/Version/3', 'SPS/Plug/_public', 'SPS/Socket/_public'])
    assert.equal(ogbDepthAddress(invalid), null, invalid);
});

test('an unchanged tip sequence cannot repeatedly change the learned plug length', () => {
  const estimator = new SpsDepthEstimator();
  closeTo(estimator.process(.77, .96, 1), 0);
  closeTo(estimator.process(.67, .96, 1), 0);
  closeTo(estimator.process(.89, 1, 2), .4);
  estimator.reset();
  estimator.process(.77, .96, 1); estimator.process(.67, .96, 2);
  closeTo(estimator.process(.86, 1, 3), .5);
});

for (const [root, tip] of [[NaN, .9], [.9, Infinity], [.01, .9], [1.1, 1], [.9, .8]])
  test(`invalid new SPS measurement clears learned length (${root}, ${tip})`, () => {
    const estimator = new SpsDepthEstimator(); estimator.process(.77, .96, 1);
    closeTo(estimator.process(root!, tip!, 2), 0);
    closeTo(estimator.process(.89, 1, 3), 0);
  });

test('modern OGB data wins over a larger legacy value and both-zero data resets learning', async () => {
  const r = rig();
  try {
    r.set(pattern, .9); r.set(pattern + 'Close', 1);
    r.set(pattern + 'NewRoot', .77); r.set(pattern + 'NewTip', .96);
    r.runtime.setInputActive(true); await r.runtime.flush(); closeTo(r.last(), 0);
    r.set(pattern + 'NewRoot', .89); r.set(pattern + 'NewTip', 1); await r.advance(); closeTo(r.last(), .4 * .999);
    r.set(pattern + 'NewRoot', 0); r.set(pattern + 'NewTip', 0); await r.advance(); closeTo(r.last(), .9 * .999);
    r.set(pattern + 'NewRoot', .89); r.set(pattern + 'NewTip', 1); await r.advance(); closeTo(r.last(), 0);
  } finally { r.runtime.dispose(); }
});

test('an incomplete positive modern pair does not use an incompatible legacy estimate', async () => {
  const r = rig();
  try {
    r.set(pattern, .9); r.set(pattern + 'Close', 1); r.set(pattern + 'NewRoot', .89);
    r.runtime.setInputActive(true); await r.runtime.flush(); closeTo(r.last(), 0);
  } finally { r.runtime.dispose(); }
});

for (const separation of ['source', 'instance', 'party'] as const)
  test('SPS root and tip cannot cross ' + separation + ' boundaries', async () => {
    const all = 'OGB/Orf/**/PenOthers;OGB/Orf/**/PenSelf', r = rig(all);
    try {
      r.set(pattern + 'NewRoot', .77);
      if (separation === 'source') r.set(pattern + 'NewTip', .96, otherSource);
      else if (separation === 'instance') r.set(pathFor('Others', 'NewTip', 'OGB/Orf/Body/Other'), .96);
      else r.set(pathFor('Self', 'NewTip'), .96);
      r.runtime.setInputActive(true); await r.runtime.flush(); closeTo(r.last(), 0);
      r.set(pattern + 'NewTip', .96); await r.advance();
      r.set(pattern + 'NewRoot', .89); r.set(pattern + 'NewTip', 1); await r.advance(); closeTo(r.last(), .4 * .999);
    } finally { r.runtime.dispose(); }
  });

test('fresh suppressed legacy and other-source updates cannot keep an expired modern pair active', async () => {
  const r = rig();
  try {
    r.runtime.setOscSource(source.key);
    r.set(pattern + 'NewRoot', .77); r.set(pattern + 'NewTip', .96);
    r.runtime.setInputActive(true); await r.runtime.flush();
    r.set(pattern + 'NewRoot', .89); r.set(pattern + 'NewTip', 1); await r.advance(); closeTo(r.last(), .4 * .999);
    r.setTime(1600);
    r.set(pattern, 1); r.set(pattern + 'Close', 1);
    r.set(pattern + 'NewRoot', .9, otherSource); r.set(pattern + 'NewTip', 1, otherSource);
    assert.equal(r.store.tryGetLatest(pattern, source.key)?.entry.timestampMs, 1600);
    await r.advance(0);
    assert.equal(r.runtime.getSnapshot()['isEmergency'], true);
    assert.equal(r.runtime.getSnapshot()['inputActive'], false); assert.ok(r.stops.length > 0);
  } finally { r.runtime.dispose(); }
});

test('reactivating SPS input requires new unsaturated learning samples', async () => {
  const r = rig();
  try {
    r.set(pattern + 'NewRoot', .77); r.set(pattern + 'NewTip', .96);
    r.runtime.setInputActive(true); await r.runtime.flush();
    r.set(pattern + 'NewRoot', .89); r.set(pattern + 'NewTip', 1); await r.advance(); closeTo(r.last(), .4 * .999);
    r.runtime.setInputActive(false); await r.runtime.flush();
    r.runtime.setInputActive(true); await r.runtime.flush(); closeTo(r.last(), 0);
    r.set(pattern + 'NewRoot', .77); r.set(pattern + 'NewTip', .96); await r.advance();
    r.set(pattern + 'NewRoot', .89); r.set(pattern + 'NewTip', 1); await r.advance(); closeTo(r.last(), .4 * .999);
  } finally { r.runtime.dispose(); }
});

test('changing the selected OSC source disarms and does not share learned length', async () => {
  const r = rig();
  try {
    r.runtime.setOscSource(source.key);
    r.set(pattern + 'NewRoot', .77); r.set(pattern + 'NewTip', .96);
    r.runtime.setInputActive(true); await r.runtime.flush();
    r.set(pattern + 'NewRoot', .89); r.set(pattern + 'NewTip', 1); await r.advance(); closeTo(r.last(), .4 * .999);
    r.runtime.setOscSource(otherSource.key); assert.equal(r.runtime.getSnapshot()['inputActive'], false);
    r.set(pattern + 'NewRoot', .89, otherSource); r.set(pattern + 'NewTip', 1, otherSource);
    r.runtime.setInputActive(true); await r.runtime.flush(); closeTo(r.last(), 0);
  } finally { r.runtime.dispose(); }
});

test('applying configuration disarms SPS and clears the previously learned length', async () => {
  const r = rig();
  try {
    r.set(pattern + 'NewRoot', .77); r.set(pattern + 'NewTip', .96);
    r.runtime.setInputActive(true); await r.runtime.flush();
    r.set(pattern + 'NewRoot', .89); r.set(pattern + 'NewTip', 1); await r.advance(); closeTo(r.last(), .4 * .999);
    const count = r.frames.length;
    r.runtime.applyConfiguration(r.runtime.getConfig()); await r.runtime.flush();
    assert.equal(r.runtime.getSnapshot()['inputActive'], false); assert.equal(r.frames.length, count);
    r.runtime.setInputActive(true); await r.runtime.flush(); closeTo(r.last(), 0);
  } finally { r.runtime.dispose(); }
});

test('an Avatar change clears SPS learning and requires explicit emergency recovery and activation', async () => {
  const r = rig();
  try {
    r.set(pattern + 'NewRoot', .77); r.set(pattern + 'NewTip', .96);
    r.runtime.setInputActive(true); await r.runtime.flush();
    r.set(pattern + 'NewRoot', .89); r.set(pattern + 'NewTip', 1); await r.advance(); closeTo(r.last(), .4 * .999);
    r.store.changeAvatar(source.key); await r.runtime.flush();
    assert.equal(r.runtime.getSnapshot()['isEmergency'], true); assert.equal(r.runtime.getSnapshot()['inputActive'], false);
    const count = r.frames.length;
    r.set(pattern + 'NewRoot', .89); r.set(pattern + 'NewTip', 1); await r.advance();
    assert.equal(r.frames.length, count);
    r.runtime.clearEmergency(); await r.runtime.flush(); assert.equal(r.frames.length, count);
    r.runtime.setInputActive(true); await r.runtime.flush(); closeTo(r.last(), 0);
  } finally { r.runtime.dispose(); }
});

test('legacy SPS1 Close gates and explicit raw mappings retain their own meaning', async () => {
  const r = rig(), direct = rig('Custom/MeasuredValue', 'Direct');
  try {
    r.set(pattern, .6); r.set(pattern + 'Close', 0);
    r.runtime.setInputActive(true); await r.runtime.flush(); closeTo(r.last(), 0);
    r.set(pattern + 'Close', 1); await r.advance(); closeTo(r.last(), .6 * .999);
    direct.set('Custom/MeasuredValue', .35); direct.runtime.setInputActive(true); await direct.runtime.flush();
    closeTo(direct.last(), .35 * .999);
  } finally { r.runtime.dispose(); direct.runtime.dispose(); }
});
