import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNativePackages } from '../../src/node/host/native-probe.ts';
test('native verification only loads modules and inspects methods without constructing or enumerating devices', async () => {
  const requested: string[] = [];
  class Serial { constructor() { throw new Error('Must not construct serial.'); } static list(): never { throw new Error('Must not enumerate serial.'); } }
  class Output { constructor() { throw new Error('Must not construct MIDI.'); } getPortCount(): never { throw new Error('No enumeration.'); } getPortName(): never { throw new Error('No enumeration.'); } openPort(): never { throw new Error('No open.'); } closePort(): void {} sendMessage(): void {} }
  const result = await checkNativePackages(async name => { requested.push(name); return name === 'serialport' ? { SerialPort: Serial } : { Output }; });
  assert.deepEqual(requested, ['serialport', '@julusian/midi']); assert.equal(result.serialport.available, true); assert.equal(result.midi.available, true); assert.equal(result.platform, process.platform);
});
test('missing optional native bindings are a failed probe rather than a false availability claim', async () => {
  await assert.rejects(checkNativePackages(async () => ({})), /serial API/);
  class Serial { constructor() { throw new Error('Must not construct serial.'); } static list(): void {} }
  await assert.rejects(checkNativePackages(async name => name === 'serialport' ? { SerialPort: Serial } : {}), /MIDI API/);
});
