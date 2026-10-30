import { Duplex } from 'node:stream';
import type { ProtocolInputConfig } from '../../core/protocols/input-types.ts';
import { loadOptionalPackage } from '../native-packages.ts';
interface SerialStream extends Duplex { open(callback: (error: Error | null) => void): void }
interface SerialConstructor { new(options: { path: string; baudRate: number; autoOpen: false }): SerialStream }
function constructor(value: unknown): SerialConstructor {
  if (typeof value !== 'object' || value === null || !('SerialPort' in value) || typeof value.SerialPort !== 'function') throw new Error('The serialport package did not provide its SerialPort constructor.');
  return value.SerialPort as SerialConstructor;
}
export async function openSerialInput(config: ProtocolInputConfig): Promise<Duplex> {
  const SerialPort = constructor(await loadOptionalPackage('serialport'));
  const port = new SerialPort({ path: config.comPort, baudRate: config.baudRate, autoOpen: false });
  try { await new Promise<void>((resolve, reject) => port.open(error => error ? reject(error) : resolve())); return port; }
  catch (error) { port.destroy(); throw error; }
}
