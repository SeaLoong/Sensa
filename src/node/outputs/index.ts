import path from 'node:path';
import { OutputCoordinator as SharedOutputCoordinator } from '../../core/outputs/coordinator.ts';
import type { AdapterContext } from '../../core/outputs/coordinator.ts';
import type { AppConfig, OutputDeviceConfig } from '../../core/runtime/model.ts';
import { resolveAxisProfile } from '../../core/runtime/configuration.ts';
import type { OutputAdapter, OutputDependencies, SerialPortInfo } from '../../core/outputs/types.ts';
import { TCodeAdapter, TCodeWebSocketAdapter, SignalAdapter, RecordingAdapter, listRecordings, readRecording } from './adapters.ts';
import { IntifaceAdapter, IntifacePool } from './intiface.ts';
import { DglabAdapter } from './dglab.ts';
import { VendorAdapter } from './vendor.ts';
import { BleBridgeAdapter } from './bridge.ts';
import { SensaMotionAdapter } from './sensa.ts';
import { nodeSerialFactory, nodeMidiFactory } from './transports.ts';
import { SharedMidiFactory } from './midi-pool.ts';

export * from '../../core/outputs/types.ts';
export { listRecordings, readRecording } from './adapters.ts';
export { nodeSerialFactory, nodeMidiFactory, nodeSocketFactory } from './transports.ts';
export { detectNodeCapabilities } from './capabilities.ts';

export function createOutputAdapter(config: OutputDeviceConfig, dependencies: OutputDependencies = {}, context?: AdapterContext, pool = new IntifacePool(dependencies)): OutputAdapter {
  const profile = (): ReturnType<typeof resolveAxisProfile>['motion'] => {
    const app = context?.configuration(); if (!app) throw new Error('A TCode output requires its axis profile configuration.');
    const current = app.outputs.find(output => output.id === config.id) ?? config;
    return resolveAxisProfile(app, current.motionProfileId).motion;
  };
  const options = { ...dependencies, ...(context ? { canSend: context.canSend } : {}), ...(context?.telemetry ? { telemetry: context.telemetry } : {}) };
  switch (config.type) {
    case 'TCodeSerial': case 'TCodeUdp': case 'TCodeTcp': return new TCodeAdapter(config, context ? profile : undefined, options);
    case 'TCodeWebSocket': return new TCodeWebSocketAdapter(config, context ? profile : undefined, options);
    case 'Intiface': return new IntifaceAdapter(config, options, pool);
    case 'Dglab': return new DglabAdapter(config, options);
    case 'Handy': case 'Autoblow': case 'VacuGlide': case 'Lovense': return new VendorAdapter(config, options);
    case 'BleBridge': case 'Bluetooth': return new BleBridgeAdapter(config, options);
    case 'SensaHttp': case 'SensaWebSocket': return new SensaMotionAdapter(config, options);
    case 'Recording': return new RecordingAdapter(config, options.recordingDirectory ?? process.env['SENSA_RECORDINGS_PATH'] ?? path.join(options.baseDirectory ?? process.cwd(), 'recordings'), options.now);
    case 'OscParameter': case 'HttpJson': case 'WebSocketJson': case 'Mqtt': case 'Midi': return new SignalAdapter(config, options);
    default: throw new Error(`Output type ${String(config.type)} is not supported by this Node host.`);
  }
}

export class OutputCoordinator extends SharedOutputCoordinator {
  readonly dependencies: OutputDependencies;
  readonly recordingDirectory: string;
  constructor(config: AppConfig, dependencies: OutputDependencies = {}) {
    const pool = new IntifacePool(dependencies);
    const midiFactory = new SharedMidiFactory(dependencies.midiFactory ?? nodeMidiFactory);
    const recordingDirectory = dependencies.recordingDirectory ?? process.env['SENSA_RECORDINGS_PATH'] ?? path.join(dependencies.baseDirectory ?? process.cwd(), 'recordings');
    super(config, { createAdapter: (output, context) => createOutputAdapter(output, { ...dependencies, recordingDirectory, midiFactory }, context, pool),
      ...(dependencies.now ? { now: dependencies.now } : {}), ...(dependencies.canSend ? { canSend: dependencies.canSend } : {}),
      ...(dependencies.log ? { log: dependencies.log } : {}), ...(dependencies.changed ? { changed: dependencies.changed } : {}), readRecording: name => readRecording(recordingDirectory, name) });
    this.dependencies = dependencies; this.recordingDirectory = recordingDirectory;
  }
  async listSerialPorts(): Promise<(SerialPortInfo & { portName: string; description: string })[]> { return listSerialPorts(this.dependencies); }
  async listMidiPorts(): Promise<{ id: string; name: string }[]> { return listMidiPorts(this.dependencies); }
  async listRecordings(): Promise<Awaited<ReturnType<typeof listRecordings>>> { return listRecordings(this.recordingDirectory); }
  async readRecording(name: string): Promise<string> { return readRecording(this.recordingDirectory, name); }
}
export { OutputCoordinator as NodeOutputRegistry };
export async function listSerialPorts(dependencies: OutputDependencies = {}): Promise<(SerialPortInfo & { portName: string; description: string })[]> {
  return (await (dependencies.serialFactory ?? nodeSerialFactory).list()).map(port => ({ ...port, portName: port.path, description: port.manufacturer || port.path }));
}
export async function listMidiPorts(dependencies: OutputDependencies = {}): Promise<{ id: string; name: string }[]> {
  return (await (dependencies.midiFactory ?? nodeMidiFactory).list()).map((name, index) => ({ id: String(index), name }));
}
