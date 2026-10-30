/** In-page host: the desktop application facade, engine and routing with browser ports. */
import { ApplicationFacade } from '../core/runtime/application.ts';
import { RuntimeEngine } from '../core/runtime/runtime.ts';
import { configurationForPersistence, createDefaultConfiguration, normalizeConfiguration } from '../core/runtime/configuration.ts';
import type { AppConfig } from '../core/runtime/model.ts';
import { motionAxes, neutralValues } from '../core/runtime/model.ts';
import { OutputCoordinator } from '../core/outputs/coordinator.ts';
import { defaultProtocolInput } from '../core/protocols/input-types.ts';
import { createLocalRuntimeClient, runtimeObject } from '../web/runtime-client.ts';
import type { RuntimeClient, RuntimeFacadeResponse } from '../web/runtime-client.ts';
import type { WorkbenchInitialSnapshot, WorkbenchPlatform } from '../web/workbench-props.ts';
import { BrowserDevices, BrowserRecordingStore, createBrowserOutputFactory } from './browser-outputs.ts';
import type { BrowserNavigatorPorts } from './browser-outputs.ts';
import type { TransportDependencies } from './transports.ts';
import { createExplorerInput } from './explorer-input.ts';
import type { ExplorerInput, ExplorerMessageEvent } from './explorer-input.ts';

const STORAGE_KEY = 'sensa.web.configuration.v1';
const EXPLORER_ID = 'browser-explorer';
export interface BrowserStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export interface BrowserHostPage {
  readonly opener: unknown;
  readonly location: Pick<Location, 'origin' | 'search'>;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}
export interface BrowserRuntimeOptions {
  config?: unknown;
  storage?: BrowserStorage | null;
  page?: BrowserHostPage | null;
  environment?: unknown;
  dependencies?: TransportDependencies & { navigator?: BrowserNavigatorPorts };
  now?: () => number;
  timers?: Pick<typeof globalThis, 'setInterval' | 'clearInterval'>;
}
export interface BrowserWorkbenchHost {
  client: RuntimeClient;
  platform: WorkbenchPlatform;
  runtime: RuntimeEngine;
  outputs: OutputCoordinator;
  devices: BrowserDevices;
  recordings: BrowserRecordingStore;
  facade: ApplicationFacade;
  initialSnapshot(): WorkbenchInitialSnapshot;
  handleExplorer(event: ExplorerMessageEvent): boolean;
}
function browserStorage(): BrowserStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function initialConfiguration(value: unknown, storage: BrowserStorage | null): AppConfig {
  if (value !== undefined) return normalizeConfiguration(value);
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (saved) return normalizeConfiguration(JSON.parse(saved) as unknown, true);
  } catch { /* A failed saved profile leaves an inactive default workbench. */ }
  return createDefaultConfiguration();
}
function pathParts(path: string): [string, string] {
  const index = path.indexOf('/');
  return index < 0 ? [path, 'connected'] : [path.slice(0, index), path.slice(index + 1)];
}
export function createBrowserWorkbench(options: BrowserRuntimeOptions = {}): BrowserWorkbenchHost {
  const now = options.now ?? Date.now, storage = options.storage === undefined ? browserStorage() : options.storage;
  const page: BrowserHostPage | null = options.page === undefined ? typeof window === 'undefined' ? null : window : options.page;
  const devices = new BrowserDevices(options.dependencies), recordings = new BrowserRecordingStore();
  const entries: { timestamp: string; level: string; message: string }[] = [];
  const log = (message: string, level = 'Info') => { entries.push({ timestamp: new Date(now()).toISOString(), level, message }); if (entries.length > 500) entries.shift(); };
  const configuration = initialConfiguration(options.config, storage);
  let outputs: OutputCoordinator | undefined;
  const runtime = new RuntimeEngine(configuration, { now,
    sendFrame: frame => outputs?.sendFrame(frame), stopOutputs: () => outputs?.emergencyStop(),
    readFeedback: path => { const [id, key] = pathParts(path); return outputs?.readFeedback(id, key) ?? { value: null, valid: false, reason: 'Waiting for output feedback.', timestampMs: 0, sourceKey: null, coordinateFrame: null, originKey: null }; },
    readReplay: path => { const [id, key] = pathParts(path); return outputs?.readReplay(id, key) ?? { value: null, valid: false, reason: 'Waiting for recording replay.', timestampMs: 0, sourceKey: null, coordinateFrame: null, originKey: null }; },
    onError: error => log(error instanceof Error ? error.message : String(error), 'Error'),
  });
  runtime.setManual({ values: neutralValues(), deltaMs: 0, activeAxes: ['L0'] });
  outputs = new OutputCoordinator(runtime.getConfig(), {
    createAdapter: createBrowserOutputFactory(devices, recordings, now), now, log,
    canSend: () => runtime.getSnapshot()['canRouteSignals'] === true,
    readRecording: name => Promise.resolve(recordings.read(name)),
  });
  const coordinator = outputs;
  let mutationTail: Promise<unknown> = Promise.resolve();
  const mutate = <T,>(operation: () => Promise<T> | T): Promise<T> => {
    const current = mutationTail.catch(() => undefined).then(operation);
    mutationTail = current; return current;
  };
  const session = page ? new URLSearchParams(page.location.search).get('session') ?? '' : '';
  let explorer: ExplorerInput | null = null, explorerReady = false, paired = false;
  const registerExplorer = () => {
    if (!explorer) return;
    const input = defaultProtocolInput(EXPLORER_ID);
    input.name = 'Parameter explorer'; input.type = 'JsonWebSocket'; input.enabled = true; input.port = 0;
    input.path = '/browser-explorer'; input.timeoutMs = 1000;
    input.features = motionAxes.map(axis => ({ channel: axis, name: axis, actuator: axis.startsWith('V') ? 'Scalar' : 'Position', scalarType: 'Vibrate', targetAxis: axis }));
    runtime.externalControls.configure([...runtime.getConfig().protocolInputs.filter(candidate => candidate.id !== EXPLORER_ID), input]);
  };
  explorer = page ? createExplorerInput({ opener: page.opener, origin: page.location.origin, session, now,
    receive: values => {
      if (!paired) return;
      if (runtime.externalControls.getStatus(EXPLORER_ID)?.session !== session) {
        const acquired = runtime.externalControls.tryAcquire(EXPLORER_ID, session);
        if (!acquired.ok) { log(acquired.error, 'Warning'); return; }
      }
      explorerReady = true;
      const result = runtime.externalControls.publish(EXPLORER_ID, session,
        Object.entries(values).flatMap(([channel, value]) => typeof value === 'number' ? [{ channel, value }] : []));
      if (!result.ok) log(result.error, 'Warning');
    },
    stop: () => { runtime.setInputActive(false); runtime.externalControls.stop(EXPLORER_ID, session); runtime.externalControls.release(EXPLORER_ID, session); explorerReady = false; },
  }) : null;
  registerExplorer();
  const sourceStopped = (inputId: string) => { if (inputId === EXPLORER_ID) { runtime.setInputActive(false); explorerReady = false; } };
  runtime.externalControls.onStop.add(sourceStopped);
  const facade = new ApplicationFacade(runtime, {
    outputs: coordinator,
    inputChange: mutate,
    applyConfiguration(value) {
      const candidate = normalizeConfiguration(value), release = runtime.blockInputActivation();
      return mutate(async () => { try {
        await runtime.flush();
        const saved = configurationForPersistence(candidate);
        storage?.setItem(STORAGE_KEY, JSON.stringify(saved));
        await coordinator.reconfigure(candidate);
        runtime.applyConfiguration(candidate);
        paired = false; explorer?.disconnect(); registerExplorer();
        return runtime.getConfig();
      } finally { release(); } });
    },
    selectOscSource(sourceKey) { runtime.setOscSource(sourceKey); return { ok: true, sourceKey }; },
    async refreshOscQuery() { throw new Error('No OSCQuery network adapter is registered in this browser host.'); },
    syncOsc() {},
    listSerialPorts: () => devices.listSerialPorts(), listMidiPorts: () => devices.listMidiPorts(),
    listRecordings: () => recordings.list(), readRecording: name => Promise.resolve(recordings.read(name)),
    logs: () => entries, notify() {}, log, now,
    protocolSnapshot: () => runtime.externalControls.snapshot().map(row => ({ ...row, listening: row['id'] === EXPLORER_ID && explorerReady,
      values: Object.fromEntries(motionAxes.flatMap(axis => { const value = runtime.externalControls.read(String(row['id']) + '/' + axis, now()); return value.valid && value.value !== null ? [[axis, value.value]] : []; })),
    })),
    connectionCount: () => 1,
  });
  const receive = (event: MessageEvent<unknown>) => { explorer?.handle(event); };
  if (explorer) page?.addEventListener('message', receive);
  const client = createLocalRuntimeClient({ facade: { async execute(method, path, body): Promise<RuntimeFacadeResponse> {
    const download = /^\/api\/output\/recordings\/([^/]+)\/download$/.exec(path);
    if (method === 'GET' && download?.[1]) {
      try {
        const name = decodeURIComponent(download[1]);
        return { statusCode: 200, success: true, data: null, body: recordings.read(name), headers: {
          'Content-Type': name.endsWith('.csv') ? 'text/csv; charset=utf-8' : name.endsWith('.jsonl') ? 'application/x-ndjson' : 'application/json',
        } };
      } catch (error) { return { statusCode: 404, success: false, data: { error: error instanceof Error ? error.message : 'Recording is unavailable.' } }; }
    }
    return facade.execute(method, path, body);
  } }, snapshot: () => facade.overview(), logs: () => entries,
  deactivate() { runtime.setInputActive(false); paired = false; explorer?.disconnect(); },
  async close() { page?.removeEventListener('message', receive); paired = false; explorer?.disconnect(); runtime.externalControls.onStop.delete(sourceStopped); runtime.dispose(); await coordinator.close(); },
  tick() { runtime.tick(); const timestamp = now(); coordinator.updateBindings(timestamp, input => runtime.resolveSignalInput(input, timestamp)); },
  ...(options.timers ? { timers: options.timers } : {}),
  });
  const platform: WorkbenchPlatform = { name: 'WebSensa', outputTypes: devices.outputTypes(options.environment),
    inputModes: explorer ? ['manual', 'script', 'protocol', 'combined'] : ['manual', 'script', 'combined'],
    supportsListeners: false, manualAxes: ['L0'], continuousManual: true,
    ...(devices.navigator.serial?.requestPort ? { selectSerialPort: () => devices.selectSerialPort() } : {}),
    ...(explorer ? { async connectExplorer() {
      runtime.setInputMode('Protocol');
      registerExplorer();
      const acquired = runtime.externalControls.tryAcquire(EXPLORER_ID, session);
      if (!acquired.ok) throw new Error(acquired.error);
      paired = true; explorer?.connect(); explorerReady = true;
    } } : {}),
  };
  return { client, platform, runtime, outputs: coordinator, devices, recordings, facade,
    initialSnapshot() {
      const overview = runtimeObject(facade.overview());
      if (!overview) throw new Error('Browser workbench state is unavailable.');
      return { config: structuredClone(runtime.getConfig()), overview, logs: [], serialPorts: [] };
    },
    handleExplorer: event => explorer?.handle(event) ?? false };
}
