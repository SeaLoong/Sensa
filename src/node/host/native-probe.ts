import { loadOptionalPackage, type NativePackageName } from '../native-packages.ts';
export interface NativeProbeResult {
  platform: string; arch: string; nodeVersion: string; modules: string | undefined;
  serialport: { available: true }; midi: { available: true };
}
/** Load bindings and inspect their API without constructing or enumerating devices. */
export async function checkNativePackages(load: (name: NativePackageName) => Promise<unknown> = loadOptionalPackage): Promise<NativeProbeResult> {
  const serial: unknown = await load('serialport'), midi: unknown = await load('@julusian/midi');
  const object = (value: unknown): Record<string, unknown> | undefined => value !== null && (typeof value === 'object' || typeof value === 'function') ? value as Record<string, unknown> : undefined;
  const serialConstructor = object(serial)?.['SerialPort'];
  if (typeof serialConstructor !== 'function' || typeof object(serialConstructor)?.['list'] !== 'function') throw new Error('The native serial API is unavailable.');
  const midiConstructor = object(midi)?.['Output'], prototype = object(object(midiConstructor)?.['prototype']);
  if (typeof midiConstructor !== 'function' || !['getPortCount', 'getPortName', 'openPort', 'closePort', 'sendMessage'].every(name => typeof prototype?.[name] === 'function')) throw new Error('The native MIDI API is unavailable.');
  return { platform: process.platform, arch: process.arch, nodeVersion: process.versions.node, modules: process.versions.modules,
    serialport: { available: true }, midi: { available: true } };
}
