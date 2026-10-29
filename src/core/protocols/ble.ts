import type { Axis } from '../types.ts';

/** Hardware command formats; no browser, Node or device access. */
export type BluetoothProfileId = 'loob' | 'thrust-sync' | 'svakom-v1' | 'lovense-single' | 'youou-vx001';
export type GattPair = readonly [service: string, characteristic: string];
export interface BluetoothProfile {
  readonly id: BluetoothProfileId;
  readonly name: string;
  readonly axis: Axis;
  readonly maximum: number;
  readonly minimum?: number;
  readonly size?: number;
  readonly pairs: readonly GattPair[];
  readonly prefixes?: readonly string[];
  readonly names?: readonly string[];
}
export interface BleCodec {
  readonly profile: BluetoothProfile;
  encode(value: number, durationMs?: number): Uint8Array<ArrayBuffer>;
  stop(): Uint8Array<ArrayBuffer> | null;
}
const BASE = '-0000-1000-8000-00805f9b34fb';
const lovensePairs: readonly GattPair[] = [
  [`0000fff0${BASE}`, `0000fff2${BASE}`],
  ['6e400001-b5a3-f393-e0a9-e50e24dcca9e', '6e400002-b5a3-f393-e0a9-e50e24dcca9e'],
  ...([['5030', '0024'], ['5730', '0023'], ['5a30', '0024'], ['5030', '0023'],
    ['5330', '0023'], ['5a30', '0023'], ['4c30', '0023'], ['5830', '0023'], ['5230', '0023']] as const)
    .map(([prefix, variant]): GattPair => [`${prefix}0001-${variant}-4bd4-bbd5-a6920e4c5653`, `${prefix}0002-${variant}-4bd4-bbd5-a6920e4c5653`]),
];

const profiles: BluetoothProfile[] = [
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
]
export const BLUETOOTH_PROFILES: readonly BluetoothProfile[] = Object.freeze(profiles.map(profile => Object.freeze({ ...profile, pairs: Object.freeze(profile.pairs.map(pair => Object.freeze(pair))) })));
export function isBluetoothProfileId(value: unknown): value is BluetoothProfileId { return profiles.some(profile => profile.id === value); }

export function bluetoothProfile(id: string): BluetoothProfile {
  const profile = BLUETOOTH_PROFILES.find(item => item.id === id);
  if (!profile) throw new Error('Unknown Bluetooth device profile');
  return profile;
}

export function bleTarget(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
    throw new Error('Device value must be a number within 0..1');
  return value;
}

// Match Python's ties-to-even round in the desktop bridge as well as the wire
// formats. One codec instance owns one device's packet sequence.
function nearest(value: number): number {
  const lower = Math.floor(value);
  const fraction = value - lower;
  return fraction === .5 ? lower + (lower % 2) : Math.round(value);
}

export function createBleCodec(id: string): BleCodec {
  const profile = bluetoothProfile(id);
  let packetId = 0;
  const encode = (value: number, durationMs = 0): Uint8Array<ArrayBuffer> => {
    bleTarget(value);
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
      for (const byte of data.subarray(0, 8)) data[8] = (data[8] ?? 0) ^ byte;
      return data;
    }
    if (id === 'loob') return Uint8Array.of(speed >> 8, speed & 255, durationMs >> 8, durationMs & 255);
    return Uint8Array.of(speed, durationMs >> 8, durationMs & 255);
  };
  return { profile, encode, stop: () => profile.axis === 'V0' ? encode(0, 0) : null };
}

