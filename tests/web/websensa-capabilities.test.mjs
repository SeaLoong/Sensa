import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCapabilities } from '../../src/websensa/capabilities.ts';

const forbidden = () => { throw new Error('Detection must not request permission or open a connection'); };
const network = () => ({ WebSocket: forbidden, fetch: forbidden });
const devices = () => ({ serial: { requestPort: forbidden }, bluetooth: { requestDevice: forbidden }, requestMIDIAccess: forbidden });

test('an empty environment offers no invented connection or browser capabilities', () => {
  const report = detectCapabilities({});
  assert.equal(report.secureContext, null);
  assert.equal(Object.values(report.outputs).some(item => item.available), false);
  assert.equal(Object.values(report.inputs).some(item => item.available), false);
  assert.equal(report.outputs.udp, undefined);
  for (const state of Object.values(report.outputs)) {
    assert.equal(typeof state.reason, 'string'); assert.equal(typeof state.reasonZh, 'string');
    assert.deepEqual(state.alternatives, []);
  }
});

test('navigator presence is not a device API or a reason to disable real Node-compatible network adapters', () => {
  const report = detectCapabilities({ ...network(), navigator: { userAgent: 'Node.js', serial: {}, bluetooth: {} } });
  for (const type of ['intiface', 'tcode-ws', 'json-ws', 'http']) assert.equal(report.outputs[type].available, true, type);
  for (const type of ['serial', 'bluetooth', 'midi']) assert.equal(report.outputs[type].available, false, type);
  assert.equal(report.inputs.explorer.available, false);
  assert.equal(report.inputs.midi.available, false);
  assert.deepEqual(report.outputs.serial.alternatives, ['intiface', 'tcode-ws', 'json-ws', 'http']);
});

test('device routes require their callable methods and an explicitly secure context without invoking permission requests', () => {
  const report = detectCapabilities({ ...network(), isSecureContext: true, navigator: devices() });
  assert.equal(report.secureContext, true);
  for (const type of ['serial', 'bluetooth', 'midi']) {
    assert.equal(report.outputs[type].available, true, type);
    assert.equal(report.outputs[type].source, 'api');
    assert.equal(report.outputs[type].reason, '');
  }
  assert.equal(report.inputs.midi.available, false, 'The product has not registered a MIDI input adapter.');
});

test('ordinary HTTP and unknown contexts retain actual network fallbacks while browser device methods stay unavailable', () => {
  for (const secureContext of [false, undefined, 'true']) {
    const report = detectCapabilities({ fetch: forbidden, isSecureContext: secureContext, navigator: devices() });
    assert.equal(report.outputs.http.available, true);
    for (const type of ['serial', 'bluetooth', 'midi']) {
      assert.equal(report.outputs[type].available, false);
      assert.equal(report.outputs[type].reasonCode, 'requires-secure-context');
      assert.deepEqual(report.outputs[type].alternatives, ['http']);
    }
  }
});

test('callable feature checks reject stub objects and missing methods even on secure pages', () => {
  const report = detectCapabilities({ isSecureContext: true, WebSocket: {}, fetch: 'fetch',
    navigator: { serial: { requestPort: true }, bluetooth: {}, requestMIDIAccess: {} } });
  assert.equal(report.outputs.intiface.reasonCode, 'missing-websocket');
  assert.equal(report.outputs.http.reasonCode, 'missing-fetch');
  assert.equal(report.outputs.serial.reasonCode, 'missing-serial');
  assert.equal(report.outputs.bluetooth.reasonCode, 'missing-bluetooth');
  assert.equal(report.outputs.midi.reasonCode, 'missing-midi');
});

test('feature detection never reads browser storage, UA, permissions state or triggers a connection', () => {
  const environment = { ...network(), isSecureContext: true, navigator: devices() };
  for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(environment, name, { get: forbidden });
  for (const name of ['permissions', 'userAgent', 'platform']) Object.defineProperty(environment.navigator, name, { get: forbidden });
  assert.doesNotThrow(() => detectCapabilities(environment));
  const report = detectCapabilities(environment);
  assert.equal(report.outputs.serial.available, true);
});

test('throwing feature getters are unavailable independently and cannot take working routes down', () => {
  const environment = { fetch: forbidden, isSecureContext: true };
  Object.defineProperty(environment, 'WebSocket', { get: forbidden });
  Object.defineProperty(environment, 'navigator', { get: forbidden });
  const report = detectCapabilities(environment);
  assert.equal(report.outputs.http.available, true);
  assert.equal(report.outputs.serial.available, false);
  assert.equal(report.outputs.intiface.available, false);
  assert.deepEqual(report.outputs.intiface.alternatives, ['http']);
});

test('a browser explorer connection requires actual window message methods and an HTTP origin', () => {
  const window = { addEventListener: forbidden, removeEventListener: forbidden, postMessage: forbidden,
    location: { origin: 'https://example.test' } };
  assert.equal(detectCapabilities({ window }).inputs.explorer.available, true);
  assert.equal(detectCapabilities({ window: { ...window, postMessage: undefined } }).inputs.explorer.available, false);
  assert.equal(detectCapabilities({ window: { ...window, location: { origin: 'null' } } }).inputs.explorer.available, false);
  assert.equal(detectCapabilities({ navigator: {} }).inputs.explorer.available, false);
});

test('future narrow host adapters become available only when a callable factory is actually registered', () => {
  let requests = 0;
  const create = () => { requests++; throw new Error('Not during detection'); };
  const report = detectCapabilities({ fetch: forbidden, isSecureContext: false }, {
    outputs: { udp: { create }, serial: { create }, imaginary: { available: true },
      bluetooth: { create, available: false, reason: 'Adapter disconnected.', reasonZh: '适配器已断开。' } },
    inputs: { midi: { create } },
  });
  assert.equal(requests, 0);
  assert.equal(report.outputs.udp.available, true);
  assert.equal(report.outputs.udp.source, 'injected');
  assert.equal(report.outputs.serial.available, true, 'A native host adapter is separate from the secure browser API.');
  assert.equal(report.outputs.imaginary.available, false);
  assert.equal(report.outputs.imaginary.reasonCode, 'missing-host-adapter');
  assert.equal(report.outputs.bluetooth.available, false);
  assert.equal(report.outputs.bluetooth.reason, 'Adapter disconnected.');
  assert.equal(report.outputs.bluetooth.reasonZh, '适配器已断开。');
  assert.equal(report.inputs.midi.available, true);
});

test('host inventory cannot downgrade real adapters merely by claiming an unavailable implementation exists', () => {
  const report = detectCapabilities(network(), { outputs: { http: { available: true }, 'json-ws': { create: {} } } });
  assert.equal(report.outputs.http.available, true);
  assert.equal(report.outputs.http.source, 'api');
  assert.equal(report.outputs['json-ws'].available, true);
  const inventory = Object.create(null);
  inventory.__proto__ = { create: forbidden };
  assert.equal(detectCapabilities({}, { outputs: inventory }).outputs.__proto__.available, undefined);
});

test('host inventory getters and proxies cannot break automatic built-in discovery', () => {
  const inventory = { outputs: new Proxy({}, { ownKeys: forbidden }) };
  assert.equal(detectCapabilities(network(), inventory).outputs.http.available, true);
});

test('current real Node globals expose callable network adapters without pretending to be a browser', () => {
  const report = detectCapabilities(globalThis);
  assert.equal(report.outputs.http.available, typeof globalThis.fetch === 'function');
  assert.equal(report.outputs.intiface.available, typeof globalThis.WebSocket === 'function');
  if (!globalThis.window) assert.equal(report.inputs.explorer.available, false);
});
