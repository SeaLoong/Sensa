import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  guideInputPrepared, loadOnboarding, onboardingReducer, onboardingScenes,
  onboardingStorageKey, sanitizeOnboarding, saveOnboarding,
} from '../../src/web/onboarding.js';

const emptyGuide = { status: 'new', goal: null, step: 'goal' };
const memoryStorage = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('onboarding preferences isolate local and remote clients and workbench paths without pairing tokens', () => {
  const storage = memoryStorage();
  const remote = { status: 'dismissed', goal: 'osc', step: 'device' };
  const local = { status: 'complete', goal: 'script', step: 'ready' };
  const other = { status: 'active', goal: 'manual', step: 'input' };
  assert.equal(saveOnboarding(remote, 'remote', '/', storage), true);
  assert.equal(saveOnboarding(local, 'local', '/', storage), true);
  assert.equal(saveOnboarding(other, 'local', '/websensa/', storage), true);
  assert.equal(storage.values.size, 3);
  assert.deepEqual(loadOnboarding('remote', '/', storage), remote);
  assert.deepEqual(loadOnboarding('local', '/', storage), local);
  assert.deepEqual(loadOnboarding('local', '/websensa/', storage), other);
  assert.deepEqual(loadOnboarding('remote', '/other/', storage), emptyGuide);
  assert.equal(onboardingStorageKey('local', '/websensa/?session=private#setup'), onboardingStorageKey('local', '/websensa/'));
  assert.doesNotMatch(onboardingStorageKey('remote', '/?token=private#setup'), /private|token|setup/);
  assert.equal(onboardingStorageKey('unknown'), onboardingStorageKey('remote', '/'));
});

test('denied, missing and corrupt storage leave a valid in-memory guide', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadOnboarding('local', '/', denied), emptyGuide);
  assert.equal(saveOnboarding({ status: 'active', goal: 'manual', step: 'device' }, 'local', '/', denied), false);
  for (const value of [null, '', '{', 'null', '[]', '42', '"old preference"', '{"status":"running","goal":"unknown","step":"enable"}']) {
    assert.deepEqual(loadOnboarding('remote', '/', { getItem: () => value }), emptyGuide, String(value));
  }
  const state = onboardingReducer(emptyGuide, { type: 'start' });
  assert.deepEqual(state, { status: 'active', goal: null, step: 'goal' });
  assert.equal(saveOnboarding(state, 'remote', '/', denied), false);
  assert.deepEqual(state, { status: 'active', goal: null, step: 'goal' });
});

test('stored onboarding state excludes runtime permission, configuration and draft fields', () => {
  const raw = Object.freeze({ status: 'active', goal: 'osc', step: 'input', inputActive: true,
    mode: 'osc', outputs: [{ enabled: true }], config: { password: 'private' }, draft: { L0: 900 }, isEmergency: false });
  const expected = { status: 'active', goal: 'osc', step: 'input' };
  const storage = memoryStorage();
  assert.deepEqual(sanitizeOnboarding(raw), expected);
  assert.equal(saveOnboarding(raw, 'remote', '/', storage), true);
  assert.deepEqual(JSON.parse([...storage.values.values()][0]), expected);
  assert.deepEqual(loadOnboarding('remote', '/', storage), expected);
  assert.equal(raw.inputActive, true);
  assert.deepEqual(raw.draft, { L0: 900 });
  for (const invalid of [undefined, null, false, {}, { status: 'run', goal: 'combined', step: 'enable' }]) {
    assert.deepEqual(sanitizeOnboarding(invalid), emptyGuide);
  }
});

test('guide start, dismissal, resume and completion preserve progress without granting runtime permission', () => {
  const original = Object.freeze({ ...emptyGuide });
  let state = onboardingReducer(original, { type: 'start' });
  state = onboardingReducer(state, { type: 'goal', goal: 'script' });
  state = onboardingReducer(state, { type: 'step', step: 'device' });
  assert.deepEqual(state, { status: 'active', goal: 'script', step: 'device' });
  const dismissed = onboardingReducer(state, { type: 'dismiss' });
  assert.deepEqual(dismissed, { status: 'dismissed', goal: 'script', step: 'device' });
  assert.deepEqual(onboardingReducer(dismissed, { type: 'start' }), state);
  const ready = onboardingReducer(state, { type: 'step', step: 'ready' });
  const completed = onboardingReducer(ready, { type: 'complete' });
  assert.deepEqual(completed, { status: 'complete', goal: 'script', step: 'ready' });
  assert.deepEqual(onboardingReducer(completed, { type: 'start' }), { status: 'active', goal: 'script', step: 'goal' });
  assert.deepEqual(onboardingReducer(state, { type: 'goal', goal: 'combined' }), state);
  assert.deepEqual(onboardingReducer(state, { type: 'step', step: 'enable' }), state);
  assert.deepEqual(onboardingReducer(state, { type: 'runtime-enable', inputActive: true }), state);
  assert.deepEqual(onboardingReducer(state, { type: 'goal', goal: 'manual' }), { status: 'active', goal: 'manual', step: 'goal' });
  assert.deepEqual(onboardingReducer(state, { type: 'goal', goal: 'script' }), state);
  assert.deepEqual(original, emptyGuide);
  assert.deepEqual(Object.keys(completed).sort(), ['goal', 'status', 'step']);
});

test('scene entrypoints follow host capabilities and hide native OSC and website listeners in WebSensa', () => {
  const desktop = onboardingScenes();
  assert.deepEqual(desktop.map(scene => scene.id), ['osc', 'script', 'manual', 'protocol']);
  assert.deepEqual(desktop.map(scene => scene.destination), ['osc', 'script', 'manual', 'protocol-settings']);
  const browser = { inputModes: ['manual', 'script', 'protocol', 'combined'], supportsListeners: false };
  assert.deepEqual(onboardingScenes(browser).map(scene => scene.id), ['script', 'manual']);
  assert.deepEqual(onboardingScenes({ ...browser, inputModes: ['manual'] }).map(scene => scene.id), ['manual']);
  assert.deepEqual(onboardingScenes({ inputModes: [], supportsListeners: true }), []);
  assert.deepEqual(onboardingScenes({ inputModes: ['protocol'], supportsListeners: true }).map(scene => scene.id), ['protocol']);
  assert.deepEqual(onboardingScenes({ supportsListeners: false }).map(scene => scene.id), ['script', 'manual']);
});

test('manual and script preparation requires the applied input mode while staying separate from activation and playback', () => {
  assert.equal(guideInputPrepared('manual', { mode: 'manual', inputActive: false }), true);
  assert.equal(guideInputPrepared('manual', { mode: 'script', inputActive: true }), false);
  assert.equal(guideInputPrepared('script', { mode: 'manual', scriptLoaded: true }), false);
  assert.equal(guideInputPrepared('script', { mode: 'script', scriptLoaded: false }), false);
  assert.equal(guideInputPrepared('script', { mode: 'script', scriptLoaded: true, playing: false, inputActive: false }), true);
  assert.equal(guideInputPrepared('script', { mode: 'combined', scriptLoaded: true }), false);
  assert.equal(guideInputPrepared(null), false);
  assert.equal(guideInputPrepared('combined', { mode: 'combined' }), false);
});

test('OSC preparation needs a listener and saved mappings in the applied OSC mode', () => {
  const prepared = Object.freeze({ mode: 'osc', listening: true, mappingCount: 1, inputActive: false });
  assert.equal(guideInputPrepared('osc', prepared), true);
  for (const patch of [{ mode: 'manual' }, { mode: 'combined' }, { listening: false }, { mappingCount: 0 }, { mappingCount: -1 }]) {
    assert.equal(guideInputPrepared('osc', { ...prepared, ...patch }), false, JSON.stringify(patch));
  }
  assert.equal(guideInputPrepared('osc', { mode: 'osc', listening: true, mappingCount: 0, draftMappingCount: 3 }), false);
  assert.equal(prepared.inputActive, false);
});

test('protocol preparation requires one enabled listening connected source rather than independent partial sources', () => {
  const ready = Object.freeze({ id: 'website', enabled: true, listening: true, connected: true });
  assert.equal(guideInputPrepared('protocol', { mode: 'protocol', protocolInputs: [ready], inputActive: false }), true);
  assert.equal(guideInputPrepared('protocol', { mode: 'manual', protocolInputs: [ready] }), false);
  assert.equal(guideInputPrepared('protocol', { mode: 'protocol', protocolInputs: [] }), false);
  for (const flag of ['enabled', 'listening', 'connected']) {
    assert.equal(guideInputPrepared('protocol', { mode: 'protocol', protocolInputs: [{ ...ready, [flag]: false }] }), false, flag);
  }
  const partial = [
    { id: 'listener', enabled: true, listening: true, connected: false },
    { id: 'disabled-client', enabled: false, listening: true, connected: true },
    { id: 'stopped-client', enabled: true, listening: false, connected: true },
  ];
  assert.equal(guideInputPrepared('protocol', { mode: 'protocol', protocolInputs: partial }), false);
  assert.deepEqual(ready, { id: 'website', enabled: true, listening: true, connected: true });
});
