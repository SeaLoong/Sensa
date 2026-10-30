import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadOptionalPackage } from '../native-packages.ts';
import { resolveBridgeScript } from './bridge.ts';
import { optionalRecord } from '../../core/outputs/types.ts';
import type { AppConfig, OutputDependencies } from '../../core/outputs/types.ts';

export interface NodeOutputCapability { type: string; available: boolean; reason: string; source: 'native' | 'network' | 'bridge' | 'injected' }
async function bridgeDiagnostics(executable: string, args: readonly string[]): Promise<unknown> {
  const { stdout } = await promisify(execFile)(executable, [...args], { timeout: 3000, maxBuffer: 65536, windowsHide: true, encoding: 'utf8' });
  return JSON.parse(stdout) as unknown;
}
/** Load APIs and run only the bridge's no-hardware diagnostics; never enumerate ports or radios. */
export async function detectNodeCapabilities(config: AppConfig, dependencies: OutputDependencies = {}): Promise<{ outputs: NodeOutputCapability[]; hardwareProbed: false }> {
  const outputs: NodeOutputCapability[] = ['TCodeUdp', 'TCodeTcp', 'TCodeWebSocket', 'Intiface', 'OscParameter', 'Dglab', 'Recording', 'HttpJson', 'WebSocketJson', 'SensaHttp', 'SensaWebSocket', 'Mqtt', 'Handy', 'Autoblow', 'VacuGlide', 'Lovense'].map(type => ({ type, available: true, reason: '', source: 'network' }));
  const probe = async (name: 'serialport' | '@julusian/midi', type: string, exportName: string, injected: unknown): Promise<void> => {
    try {
      if (injected) { const factory = optionalRecord(injected); if (typeof factory?.['list'] !== 'function' || typeof factory['open'] !== 'function') throw new Error('Invalid injected native factory.'); outputs.push({ type, available: true, reason: '', source: 'injected' }); return; }
      const module = optionalRecord(await loadOptionalPackage(name)), fallback = optionalRecord(module?.['default']);
      if (typeof (module?.[exportName] ?? fallback?.[exportName]) !== 'function') throw new Error('The native binding did not export its required API.');
      outputs.push({ type, available: true, reason: '', source: 'native' });
    } catch { outputs.push({ type, available: false, reason: `The optional ${name} binding is unavailable for this installation.`, source: 'native' }); }
  };
  await Promise.all([probe('serialport', 'TCodeSerial', 'SerialPort', dependencies.serialFactory), probe('@julusian/midi', 'Midi', 'Output', dependencies.midiFactory)]);
  let bridgeAvailable = false, bridgeReason = '';
  try {
    if (config.outputs.some(output => output.bridge && ('python' in output.bridge || 'scriptPath' in output.bridge))) throw new Error('Bridge runtime paths must be configured by the host.');
    const script = await resolveBridgeScript(dependencies), python = dependencies.bridgePython || (process.platform === 'win32' ? 'python' : 'python3');
    const result = optionalRecord(await (dependencies.bridgeDiagnostics ?? bridgeDiagnostics)(python, ['-u', script, '--check']));
    const packages = optionalRecord(result?.['dependencies']);
    bridgeAvailable = result?.['hardwareProbed'] === false && packages?.['bleak'] === true;
    if (!bridgeAvailable) bridgeReason = 'Install Python and the protocol bridge BLE-output dependencies.';
  } catch { bridgeReason = 'Configure Python and an installed protocol bridge script.'; }
  outputs.push({ type: 'BleBridge', available: bridgeAvailable, reason: bridgeReason, source: 'bridge' }, { type: 'Bluetooth', available: bridgeAvailable, reason: bridgeReason, source: 'bridge' });
  return { outputs, hardwareProbed: false };
}
