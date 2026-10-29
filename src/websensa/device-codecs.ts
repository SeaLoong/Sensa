import type { NamedOutputTransport, SignalFrame } from '../core/index.ts';
import { bleTarget, bluetoothProfile, createBleCodec } from '../core/protocols/ble.ts';
import type { BluetoothProfile } from '../core/protocols/ble.ts';
export { BLUETOOTH_PROFILES, createBleCodec, isBluetoothProfileId } from '../core/protocols/ble.ts';
export type { BluetoothProfile, BluetoothProfileId, BleCodec } from '../core/protocols/ble.ts';

export interface BluetoothFilter {
  namePrefix?: string;
  name?: string;
  services?: string[];
}
export interface BluetoothChooserOptions { filters: BluetoothFilter[]; optionalServices: string[] }
export interface GattCharacteristic {
  readonly properties: { readonly writeWithoutResponse?: boolean; readonly write?: boolean };
  writeValueWithoutResponse(value: Uint8Array<ArrayBuffer>): PromiseLike<void>;
  writeValueWithResponse(value: Uint8Array<ArrayBuffer>): PromiseLike<void>;
}
export interface GattService {
  readonly uuid: string;
  getCharacteristic(id: string): PromiseLike<GattCharacteristic>;
}
export interface GattServer {
  getPrimaryServices(): PromiseLike<readonly GattService[]>;
}
export interface DeviceGatt {
  readonly connected: boolean;
  connect(): PromiseLike<GattServer>;
  disconnect(): void;
}
export interface BluetoothDevice extends Pick<EventTarget, 'addEventListener' | 'removeEventListener'> {
  readonly id?: string | undefined;
  readonly name?: string | undefined;
  readonly gatt?: DeviceGatt | undefined;
}
export interface BluetoothAccess {
  requestDevice(options: BluetoothChooserOptions): PromiseLike<BluetoothDevice>;
}
export interface BluetoothTransportOptions {
  bluetooth?: BluetoothAccess;
  timeoutMs?: number;
  onDisconnect?: () => void;
}
export interface BluetoothTransport extends NamedOutputTransport {
  readonly profile: BluetoothProfile;
  readonly connected: boolean;
  subscribeDisconnect(listener: () => void): () => void;
  send(frame: SignalFrame): Promise<void>;
  stop(): Promise<void>;
  close(): Promise<void>;
}
const activeDevices = new Map<string | BluetoothDevice, symbol>();
class BluetoothOperationTimeout extends Error {
  constructor() { super('Bluetooth operation timed out'); this.name = 'BluetoothOperationTimeout'; }
}

export function bluetoothRequestOptions(id: string): BluetoothChooserOptions {
  const profile = bluetoothProfile(id);
  const filters = profile.prefixes ? profile.prefixes.map(namePrefix => ({ namePrefix }))
    : profile.names ? profile.names.map(name => ({ name }))
      : profile.pairs.map(([service]) => ({ services: [service] }));
  return { filters, optionalServices: profile.pairs.map(([service]) => service) };
}

export async function createBluetoothTransport(id: string, options: BluetoothTransportOptions = {}): Promise<BluetoothTransport> {
  const codec = createBleCodec(id);
  const { profile } = codec;
  const bluetooth = options.bluetooth ?? globalThis.navigator?.bluetooth;
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!bluetooth?.requestDevice) throw new Error('Web Bluetooth is unavailable in this browser');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error('Invalid Bluetooth timeout');
  // requestDevice stays in the caller's user gesture; the chooser has no timer.
  const device = await bluetooth.requestDevice(bluetoothRequestOptions(id));
  if (!device?.gatt) throw new Error('The selected device has no Bluetooth GATT service');
  const gatt = device.gatt;
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
  let characteristic: GattCharacteristic | undefined;
  const disconnectListeners = new Set<() => void>();
  const deadline = async <T>(operation: PromiseLike<T> | T, late?: (value: T) => void): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    const task = Promise.resolve(operation);
    task.then(value => { if (expired) late?.(value); }, () => {});
    try {
      return await Promise.race([task, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(new BluetoothOperationTimeout()); }, timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  };
  const disconnect = () => {
    try { if (ownsDevice()) gatt.disconnect(); } finally { connected = false; release(); }
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
    const server = await deadline(gatt.connect(), () => {
      // A native connection can settle after its timeout. Do not disconnect a
      // newer owner's connection if the same device was explicitly selected again.
      if (!activeDevices.has(deviceKey) || ownsDevice()) gatt.disconnect();
    });
    const services = await deadline(server.getPrimaryServices());
    let discoveryError: unknown;
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
    if (closed || !ownsDevice() || !gatt.connected) throw new Error('Bluetooth device disconnected during discovery');
    connected = true;
  } catch (error) {
    device.removeEventListener?.('gattserverdisconnected', onDisconnect);
    disconnect();
    throw error;
  }
  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const promise = tail.then(operation);
    tail = promise.catch(() => {});
    return promise;
  };
  const write = async (bytes: Uint8Array<ArrayBuffer>, cleanupZero = false): Promise<void> => {
    const target = characteristic;
    if (!target) throw new Error('Bluetooth characteristic is unavailable');
    if (!connected || !gatt.connected) throw new Error('Bluetooth device disconnected');
    try {
      // Every supported profile's packet fits the default 20-byte ATT payload.
      // Do not split a command into unrecognizable arbitrary fragments.
      const operation = target.properties.writeWithoutResponse
        ? target.writeValueWithoutResponse(bytes) : target.writeValueWithResponse(bytes);
      await deadline(operation);
    } catch (error) {
      // A completed native error does not prove the command never reached the
      // device. Try one verified zero after it settles. A timed-out native write
      // is still pending, so disconnect without starting a concurrent GATT write.
      if (cleanupZero && profile.axis === 'V0' && !(error instanceof BluetoothOperationTimeout)
        && connected && gatt.connected) {
        const packet = codec.stop();
        try {
          if (!packet) throw new Error('No scalar stop packet', { cause: error });
          const stopped = target.properties.writeWithoutResponse
            ? target.writeValueWithoutResponse(packet) : target.writeValueWithResponse(packet);
          await deadline(stopped);
        } catch { /* Disconnect also runs if zero cannot be delivered. */ }
        moved = false;
      }
      disconnect();
      throw error;
    }
  };
  const zero = async () => {
    if (moved && connected && gatt.connected) {
      const packet = codec.stop();
      if (packet) await write(packet);
      else disconnect(); // These position protocols have no verified stop opcode.
      moved = false;
    }
  };
  return {
    name: device.name || profile.name,
    profile,
    get connected() { return connected && !closed && gatt.connected; },
    subscribeDisconnect(listener) {
      if (typeof listener !== 'function') throw new Error('A disconnect listener must be a function');
      disconnectListeners.add(listener);
      return () => disconnectListeners.delete(listener);
    },
    send(frame: SignalFrame): Promise<void> {
      if (closing || closed) return Promise.reject(new Error('Bluetooth output is closed'));
      const value = frame?.values?.[profile.axis];
      if (value === undefined) return Promise.resolve();
      const durationMs = profile.axis === 'V0' ? 0 : frame.durationMs ?? 0;
      // Validate synchronously before enqueueing, but sequence numbers are assigned
      // only when the command is actually delivered, after stop invalidation.
      bleTarget(value);
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
