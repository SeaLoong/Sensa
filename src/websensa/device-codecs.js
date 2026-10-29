// Browser BLE output profiles, based on the pinned upstream sources linked in
// tools/protocol-bridge/README.md. Values represent commanded targets.
const BASE = '-0000-1000-8000-00805f9b34fb';
const activeDevices = new Map();
class BluetoothOperationTimeout extends Error {
  constructor() { super('Bluetooth operation timed out'); this.name = 'BluetoothOperationTimeout'; }
}
const lovensePairs = [
  [`0000fff0${BASE}`, `0000fff2${BASE}`],
  ['6e400001-b5a3-f393-e0a9-e50e24dcca9e', '6e400002-b5a3-f393-e0a9-e50e24dcca9e'],
  ...[['5030', '0024'], ['5730', '0023'], ['5a30', '0024'], ['5030', '0023'],
    ['5330', '0023'], ['5a30', '0023'], ['4c30', '0023'], ['5830', '0023'], ['5230', '0023']]
    .map(([prefix, variant]) => [`${prefix}0001-${variant}-4bd4-bbd5-a6920e4c5653`, `${prefix}0002-${variant}-4bd4-bbd5-a6920e4c5653`]),
];

export const BLUETOOTH_PROFILES = Object.freeze([
  { id: 'loob', name: 'LOOB', axis: 'L0', maximum: 1000, minimum: 1, size: 4,
    pairs: [['b75c49d2-04a3-4071-a0b5-35853eb08307', 'ba5c49d2-04a3-4071-a0b5-35853eb08307']], prefixes: ['LOOB'] },
  { id: 'thrust-sync', name: 'Erojoy Thrust Sync', axis: 'L0', maximum: 180, minimum: 0, size: 3,
    pairs: [[`0000ffe0${BASE}`, `0000ffe1${BASE}`]] },
  { id: 'svakom-v1', name: 'Svakom V1 (Emma / Phoenix Neo / Ella)', axis: 'V0', maximum: 19, size: 6,
    pairs: [[`0000ffe0${BASE}`, `0000ffe1${BASE}`]], names: ['Emma NEO', 'Phoenix NEO', 'Ella'] },
  { id: 'lovense-single', name: 'Lovense single vibrator', axis: 'V0', maximum: 20,
    pairs: lovensePairs, prefixes: ['LVS-', 'LOVE-'] },
  { id: 'youou-vx001', name: 'Youou VX001', axis: 'V0', maximum: 247, size: 17,
    pairs: [[`0000fff0${BASE}`, `0000fff6${BASE}`]], prefixes: ['VX001_'] },
].map(profile => Object.freeze({ ...profile, pairs: Object.freeze(profile.pairs.map(pair => Object.freeze(pair))) })));

function profileFor(id) {
  const profile = BLUETOOTH_PROFILES.find(item => item.id === id);
  if (!profile) throw new Error('Unknown Bluetooth device profile');
  return profile;
}

function target(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
    throw new Error('Device value must be a number within 0..1');
  return value;
}

// Match Python's ties-to-even round in the desktop bridge as well as the wire
// formats. One codec instance owns one device's packet sequence.
function nearest(value) {
  const lower = Math.floor(value);
  const fraction = value - lower;
  return fraction === .5 ? lower + (lower % 2) : Math.round(value);
}

export function createBleCodec(id) {
  const profile = profileFor(id);
  let packetId = 0;
  const encode = (value, durationMs = 0) => {
    target(value);
    if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 65535)
      throw new Error('Device duration must be an integer within 0..65535 ms');
    if (profile.axis === 'V0' && durationMs !== 0)
      throw new Error('Vibration uses intensity, without position arrival duration');
    const speed = Math.max(profile.minimum ?? 0, Math.min(profile.maximum, nearest(value * profile.maximum)));
    if (id === 'lovense-single') return new TextEncoder().encode(`Vibrate:${speed};`);
    if (id === 'svakom-v1') return Uint8Array.of(0x55, 4, 3, 0, speed ? 1 : 0, speed);
    if (id === 'youou-vx001') {
      const data = Uint8Array.of(0xaa, 0x55, packetId, 2, 3, 1, speed, speed ? 1 : 0, 0, 0xff, 0, 0, 0, 0, 0, 0, 0);
      packetId = (packetId + 1) & 255;
      for (let index = 0; index < 8; index++) data[8] ^= data[index];
      return data;
    }
    if (id === 'loob') return Uint8Array.of(speed >> 8, speed & 255, durationMs >> 8, durationMs & 255);
    return Uint8Array.of(speed, durationMs >> 8, durationMs & 255);
  };
  return { profile, encode, stop: () => profile.axis === 'V0' ? encode(0, 0) : null };
}

export function bluetoothRequestOptions(id) {
  const profile = profileFor(id);
  const filters = profile.prefixes ? profile.prefixes.map(namePrefix => ({ namePrefix }))
    : profile.names ? profile.names.map(name => ({ name }))
      : profile.pairs.map(([service]) => ({ services: [service] }));
  return { filters, optionalServices: profile.pairs.map(([service]) => service) };
}

export async function createBluetoothTransport(id, options = {}) {
  const codec = createBleCodec(id);
  const { profile } = codec;
  const bluetooth = options.bluetooth ?? globalThis.navigator?.bluetooth;
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!bluetooth?.requestDevice) throw new Error('Web Bluetooth is unavailable in this browser');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error('Invalid Bluetooth timeout');
  // requestDevice stays in the caller's user gesture; the chooser has no timer.
  const device = await bluetooth.requestDevice(bluetoothRequestOptions(id));
  if (!device?.gatt) throw new Error('The selected device has no Bluetooth GATT service');
  const deviceKey = device.id || device;
  if (activeDevices.has(deviceKey)) throw new Error('This Bluetooth device is already connected to another output');
  const owner = Symbol('Bluetooth connection owner');
  activeDevices.set(deviceKey, owner);
  const ownsDevice = () => activeDevices.get(deviceKey) === owner;
  const release = () => { if (ownsDevice()) activeDevices.delete(deviceKey); };
  let connected = false;
  let closing = false;
  let closed = false;
  let generation = 0;
  let moved = false;
  let tail = Promise.resolve();
  let characteristic;
  const disconnectListeners = new Set();
  const deadline = async (operation, late = undefined) => {
    let timer;
    let expired = false;
    const task = Promise.resolve(operation);
    task.then(value => { if (expired) late?.(value); }, () => {});
    try {
      return await Promise.race([task, new Promise((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(new BluetoothOperationTimeout()); }, timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  };
  const disconnect = () => {
    try { if (ownsDevice()) device.gatt.disconnect(); } finally { connected = false; release(); }
  };
  const onDisconnect = () => {
    connected = false;
    closed = true;
    generation++;
    release();
    device.removeEventListener?.('gattserverdisconnected', onDisconnect);
    for (const listener of [options.onDisconnect, ...disconnectListeners]) {
      if (typeof listener === 'function') {
        try { listener(); } catch { /* Observers cannot interrupt transport cleanup. */ }
      }
    }
    disconnectListeners.clear();
  };
  device.addEventListener?.('gattserverdisconnected', onDisconnect);
  try {
    const server = await deadline(device.gatt.connect(), () => {
      // A native connection can settle after its timeout. Do not disconnect a
      // newer owner's connection if the same device was explicitly selected again.
      if (!activeDevices.has(deviceKey) || ownsDevice()) device.gatt.disconnect();
    });
    const services = await deadline(server.getPrimaryServices());
    let discoveryError;
    for (const [serviceId, characteristicId] of profile.pairs) {
      const service = services.find(item => item.uuid.toLowerCase() === serviceId);
      if (!service) continue;
      try {
        characteristic = await deadline(service.getCharacteristic(characteristicId));
        break;
      } catch (error) { discoveryError = error; }
    }
    if (!characteristic) throw discoveryError ?? new Error('The device does not expose this profile');
    if (!characteristic.properties?.writeWithoutResponse && !characteristic.properties?.write)
      throw new Error('The device characteristic does not accept writes');
    if (closed || !ownsDevice() || !device.gatt.connected) throw new Error('Bluetooth device disconnected during discovery');
    connected = true;
  } catch (error) {
    device.removeEventListener?.('gattserverdisconnected', onDisconnect);
    disconnect();
    throw error;
  }
  const enqueue = operation => {
    const promise = tail.then(operation);
    tail = promise.catch(() => {});
    return promise;
  };
  const write = async (bytes, cleanupZero = false) => {
    if (!connected || !device.gatt.connected) throw new Error('Bluetooth device disconnected');
    try {
      // Every supported profile's packet fits the default 20-byte ATT payload.
      // Do not split a command into unrecognizable arbitrary fragments.
      const operation = characteristic.properties.writeWithoutResponse
        ? characteristic.writeValueWithoutResponse(bytes) : characteristic.writeValueWithResponse(bytes);
      await deadline(operation);
    } catch (error) {
      // A completed native error does not prove the command never reached the
      // device. Try one verified zero after it settles. A timed-out native write
      // is still pending, so disconnect without starting a concurrent GATT write.
      if (cleanupZero && profile.axis === 'V0' && !(error instanceof BluetoothOperationTimeout)
        && connected && device.gatt.connected) {
        const packet = codec.stop();
        try {
          const stopped = characteristic.properties.writeWithoutResponse
            ? characteristic.writeValueWithoutResponse(packet) : characteristic.writeValueWithResponse(packet);
          await deadline(stopped);
        } catch { /* Disconnect also runs if zero cannot be delivered. */ }
        moved = false;
      }
      disconnect();
      throw error;
    }
  };
  const zero = async () => {
    if (moved && connected && device.gatt.connected) {
      const packet = codec.stop();
      if (packet) await write(packet);
      else disconnect(); // These position protocols have no verified stop opcode.
      moved = false;
    }
  };
  return {
    name: device.name || profile.name,
    profile,
    get connected() { return connected && !closed && device.gatt.connected; },
    subscribeDisconnect(listener) {
      if (typeof listener !== 'function') throw new Error('A disconnect listener must be a function');
      disconnectListeners.add(listener);
      return () => disconnectListeners.delete(listener);
    },
    send(frame) {
      if (closing || closed) return Promise.reject(new Error('Bluetooth output is closed'));
      const value = frame?.values?.[profile.axis];
      if (value === undefined) return Promise.resolve();
      const durationMs = profile.axis === 'V0' ? 0 : frame.durationMs ?? 0;
      // Validate synchronously before enqueueing, but sequence numbers are assigned
      // only when the command is actually delivered, after stop invalidation.
      target(value);
      if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 60000)
        return Promise.reject(new Error('Position duration must be within 0..60000 ms'));
      const current = generation;
      return enqueue(async () => {
        if (current !== generation || closed) return;
        moved = true;
        await write(codec.encode(value, durationMs), true);
      });
    },
    stop() {
      if (closed || closing) return tail;
      generation++;
      return enqueue(zero);
    },
    close() {
      if (closing || closed) return tail;
      closing = true;
      generation++;
      return enqueue(async () => {
        try { await zero(); }
        finally {
          closed = true;
          device.removeEventListener?.('gattserverdisconnected', onDisconnect);
          disconnectListeners.clear();
          disconnect();
        }
      });
    },
  };
}
