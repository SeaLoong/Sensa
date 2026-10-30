import { spawn } from 'node:child_process';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { isSea } from 'node:sea';
import { ApplicationFacade, type ApplicationServices } from '../../core/runtime/application.ts';
import { normalizeConfiguration, createDefaultConfiguration, configurationForPersistence } from '../../core/runtime/configuration.ts';
import type { AppConfig } from '../../core/runtime/model.ts';
import { RuntimeEngine } from '../../core/runtime/runtime.ts';
import { OscParameterStore } from '../../core/protocols/osc.ts';
import { ExternalControlStore } from '../../core/protocols/external-control.ts';
import { InputCoordinator } from '../inputs/coordinator.ts';
import { OscServices } from '../inputs/osc-services.ts';
import { OutputCoordinator, detectNodeCapabilities, type OutputDependencies } from '../outputs/index.ts';
import { readResource } from '../resources.ts';
import { DesktopInstanceCoordinator } from './instance.ts';
import { parseLaunchOptions, instanceKey } from './launch.ts';
import { RuntimeLogBuffer, type RuntimeLogLevel } from './logs.ts';
import { BrowserPagePresence } from './presence.ts';
import { AtomicConfigurationStore, RecordingStore } from './storage.ts';
import { ManagementServer } from './server.ts';

export interface StartSensaOptions {
  args?: readonly string[];
  configPath?: string;
  host?: string;
  port?: number;
  openBrowser?: boolean;
  launchBrowser?: (url: string) => Promise<void> | void;
  resourceReader?: (name: string) => Uint8Array | undefined;
  recordingDirectory?: string;
  outputDependencies?: OutputDependencies;
  coordinateInstances?: boolean;
  privateDirectory?: string;
  now?: () => number;
  log?: (message: string, level: RuntimeLogLevel) => void;
}
export interface SensaHostHandle {
  readonly url: string;
  readonly port: number;
  readonly configPath: string;
  readonly reused: boolean;
  readonly closed: Promise<void>;
  readonly application?: ApplicationFacade;
  close(): Promise<void>;
}
export function launchSystemBrowser(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return Promise.reject(new Error('Invalid WebUI URL.'));
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const browserArguments = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', parsed.href] : [parsed.href];
  return new Promise((resolve, reject) => {
    const child = spawn(command, browserArguments, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
  });
}
export function defaultConfigurationPath(): string {
  return resolvePath(process.env['SENSA_CONFIG_PATH'] ?? join(isSea() ? dirname(process.execPath) : process.cwd(), 'config.json'));
}

export interface OscSourceSelectionPorts {
  runtime: Pick<RuntimeEngine, 'getConfig' | 'blockInputActivation' | 'setOscSource'>;
  oscStore: OscParameterStore;
  osc: Pick<OscServices, 'selectSource'> | undefined;
  save(): Promise<void>;
}
/** The host serializes this transaction; failed persistence restores selection intent without rearming input. */
export async function updateOscSourceSelection(key: string | null, ports: OscSourceSelectionPorts): Promise<{
  ok: true; sourceKey: string | null; persisted: boolean; selectedSourceKey: string; preferredSourcePersistentId: string;
}> {
  key = key?.trim() || null;
  const { runtime, oscStore, osc, save } = ports, config = runtime.getConfig();
  const current = oscStore.preferredSourceKey, previousPersistentId = config.osc.preferredSourcePersistentId;
  const persistentId = key === 'unavailable:' + previousPersistentId ? previousPersistentId
    : oscStore.snapshotSources().find(source => source.key === key)?.persistentId ?? '';
  if (current !== key || previousPersistentId !== persistentId) {
    const release = runtime.blockInputActivation();
    try {
      config.osc.preferredSourcePersistentId = persistentId;
      runtime.setOscSource(key); osc?.selectSource(key, persistentId);
      await save();
    } catch (error) {
      config.osc.preferredSourcePersistentId = previousPersistentId;
      runtime.setOscSource(current); osc?.selectSource(current, previousPersistentId);
      throw error;
    } finally { release(); }
  }
  return { ok: true, sourceKey: key, persisted: !!config.osc.preferredSourcePersistentId,
    selectedSourceKey: key ?? '', preferredSourcePersistentId: config.osc.preferredSourcePersistentId };
}

/** One authoritative local engine, reused by headless Node and Electron shells. */
export async function startSensa(options: StartSensaOptions = {}): Promise<SensaHostHandle> {
  const launch = parseLaunchOptions(options.args ?? [], options.configPath ?? defaultConfigurationPath());
  const openBrowser = options.openBrowser ?? launch.openBrowser;
  const now = options.now ?? Date.now, logs = new RuntimeLogBuffer(now), presence = new BrowserPagePresence(now);
  let management: ManagementServer | undefined, input: InputCoordinator | undefined, osc: OscServices | undefined;
  let runtime: RuntimeEngine | undefined, outputs: OutputCoordinator | undefined, timer: ReturnType<typeof setInterval> | undefined;
  let owner: DesktopInstanceCoordinator | null = null, url = '', actualPort = 0, compromised: Error | undefined;
  let configurationTail: Promise<unknown> = Promise.resolve();
  let closeOperation: Promise<void> | undefined, finishClosed: () => void = () => {};
  const closed = new Promise<void>(resolve => { finishClosed = resolve; });
  const notify = (): void => management?.notify();
  const log = (message: string, level: RuntimeLogLevel = 'Info'): void => {
    const entry = logs.add(message, level); options.log?.(entry.message, level); notify();
  };
  logs.redactor.registerSecret(process.env['SENSA_ACCESS_TOKEN']);
  const store = new AtomicConfigurationStore<AppConfig>(launch.configPath, value => { logs.redactor.registerConfiguration(value); return normalizeConfiguration(value); }, () => !compromised);
  const recordings = new RecordingStore(resolvePath(options.recordingDirectory ?? process.env['SENSA_RECORDINGS_PATH'] ?? join(dirname(launch.configPath), 'recordings')));
  const outputDependencies: OutputDependencies = {
    baseDirectory: dirname(isSea() ? process.execPath : resolvePath(process.argv[1] ?? process.execPath)),
    ...(process.env['SENSA_BRIDGE_PYTHON'] ? { bridgePython: process.env['SENSA_BRIDGE_PYTHON'] } : {}),
    ...(process.env['SENSA_BRIDGE_SCRIPT'] ? { bridgeScriptPath: process.env['SENSA_BRIDGE_SCRIPT'] } : {}),
    ...options.outputDependencies,
  };
  let config: AppConfig;
  try { config = await store.load(createDefaultConfiguration); }
  catch (error) { throw new Error(logs.redactor.redact(error instanceof Error ? error.message : 'Configuration could not be loaded.'), { cause: error }); }
  // Transient activity is intentionally not persisted across a new process.
  config = normalizeConfiguration(config, true);
  logs.redactor.registerConfiguration(config);
  config.webUi.host = options.host ?? launch.host ?? config.webUi.host;
  config.webUi.port = options.port ?? launch.port ?? config.webUi.port;
  const openIfNeeded = async (): Promise<void> => {
    if (!openBrowser || !presence.tryBeginLaunch()) return;
    try { await (options.launchBrowser ?? launchSystemBrowser)(url); }
    catch (error) { log(`[WebUI] Failed to open browser: ${error instanceof Error ? error.message : 'unknown error'}`, 'Error'); }
  };
  const close = (): Promise<void> => {
    if (closeOperation) return closeOperation;
    closeOperation = (async () => {
      if (timer) clearInterval(timer);
      const release = runtime?.blockInputActivation();
      runtime?.emergencyStop();
      const failures: unknown[] = [];
      const cleanup = async (operation: () => Promise<unknown> | unknown): Promise<void> => {
        try { await operation(); } catch (error) { failures.push(error); log(`[Shutdown] ${error instanceof Error ? error.message : 'Cleanup failed.'}`, 'Error'); }
      };
      try {
        // A rejected command has already been reported and rolled back; wait for
        // its settlement without converting that historical result into a new
        // shutdown failure.
        await configurationTail.catch(() => undefined);
        await cleanup(async () => await outputs?.emergencyStop());
        await cleanup(async () => await input?.dispose());
        await cleanup(async () => await osc?.dispose());
        await cleanup(async () => await outputs?.disconnectAll());
        await cleanup(async () => await management?.close());
        await cleanup(() => runtime?.dispose());
        if (!compromised) await cleanup(() => store.save(configurationForPersistence(runtime?.getConfig() ?? config)));
      } finally {
        release?.(); await cleanup(async () => await owner?.close()); finishClosed();
      }
      if (failures.length) throw new AggregateError(failures, 'Sensa shutdown completed with errors.');
    })();
    return closeOperation;
  };
  if (options.coordinateInstances !== false) {
    owner = await DesktopInstanceCoordinator.acquire(launch.configPath, {
      ...(options.privateDirectory ? { privateDirectory: options.privateDirectory } : {}),
      onCompromised: error => { compromised = error; log(`[Instance] Configuration ownership was lost: ${error.message}`, 'Error'); void close().catch(() => {}); },
    });
    if (!owner) {
      const reply = await DesktopInstanceCoordinator.notifyOwner(launch.configPath, openBrowser, options.privateDirectory ? { privateDirectory: options.privateDirectory } : {});
      if (!reply) throw new Error('This configuration is in use; its instance is still starting or stopping.');
      const parsed = new URL(reply.url); finishClosed(); log('[Sensa] Using the running instance for this configuration.');
      return { url: reply.url, port: Number(parsed.port || 80), configPath: launch.configPath, reused: true, closed, close: async () => {} };
    }
  }
  try {
    const oscStore = new OscParameterStore(now);
    const external = new ExternalControlStore(config.protocolInputs, now, { onChanged: notify });
    runtime = new RuntimeEngine(config, { now, oscStore, externalControls: external,
      sendFrame: frame => outputs!.sendFrame(frame), stopOutputs: () => outputs!.emergencyStop(),
      stopUnboundOutputs: () => outputs!.stopUnbound(),
      readFeedback: path => { const separator = path.indexOf('/'); return outputs!.readFeedback(path.slice(0, separator), separator >= 0 ? path.slice(separator + 1) : ''); },
      readReplay: path => { const separator = path.indexOf('/'); return outputs!.readReplay(path.slice(0, separator), separator >= 0 ? path.slice(separator + 1) : ''); }, onChanged: notify });
    config = runtime.getConfig();
    outputs = new OutputCoordinator(config, { ...outputDependencies, now, log, changed: notify, recordingDirectory: recordings.directory,
      canSend: () => { const snapshot = runtime?.getSnapshot(); return !!snapshot?.inputActive && !snapshot.isEmergency; } });
    const capabilities = await detectNodeCapabilities(config, outputDependencies);
    let oscSignature = '';
    const mutate = <T>(operation: () => Promise<T> | T): Promise<T> => {
      const current = configurationTail.catch(() => undefined).then(async () => {
        if (closeOperation) throw new Error('The service is shutting down.');
        return operation();
      });
      configurationTail = current; return current;
    };
    const wantsOsc = (): boolean => ['osc', 'combined'].includes(String(runtime!.getSnapshot().inputMode).toLowerCase());
    const syncOsc = async (): Promise<void> => {
      if (!osc) return;
      const signature = JSON.stringify([config.osc, wantsOsc()]);
      if (signature === oscSignature) return;
      await osc.reconfigure(config.osc, wantsOsc()); oscSignature = JSON.stringify([config.osc, wantsOsc()]);
    };
    const applyConfiguration = (value: unknown): Promise<AppConfig> => {
      // Validate before stopping devices, then serialize the whole async transaction.
      const candidate = normalizeConfiguration(value);
      logs.redactor.registerConfiguration(candidate);
      const operation = mutate(async () => {
        const previous = structuredClone(runtime!.getConfig()), release = runtime!.blockInputActivation();
        try {
          await outputs!.emergencyStop();
          config = candidate;
          runtime!.applyConfiguration(config); config = runtime!.getConfig();
          await input!.reload(config.protocolInputs);
          await outputs!.reconfigure(config); await syncOsc();
          await store.save(configurationForPersistence(runtime!.getConfig()));
          log('[Config] WebUI 配置已更新。 / Updated from WebUI.'); return runtime!.getConfig();
        } catch (error) {
          runtime!.applyConfiguration(previous); config = runtime!.getConfig();
          try { if (!compromised) { await input!.reload(previous.protocolInputs); await outputs!.reconfigure(config); await outputs!.connectEnabled(); await syncOsc(); } }
          catch (restore) { log(`[Config] Restore failed: ${restore instanceof Error ? restore.message : 'unknown error'}`, 'Error'); }
          throw error;
        } finally { release(); }
      });
      return operation;
    };
    const services: ApplicationServices = {
      outputs, applyConfiguration, capabilities: () => capabilities, oscSnapshot: () => osc?.snapshot() ?? {}, protocolSnapshot: () => {
        const status = new Map(external.snapshot().map(row => [row['id'], row]));
        return (input?.snapshot() ?? []).map(row => ({ ...row, ...(status.get(row.id) ?? {}) }));
      }, connectionCount: () => management?.connectionCount ?? 0,
      inputChange: mutate,
      selectOscSource: key => mutate(() => updateOscSourceSelection(key, { runtime: runtime!, oscStore, osc,
        save: async () => await store.save(configurationForPersistence(runtime!.getConfig())),
      })), refreshOscQuery: async () => ({ ok: true, query: config.osc.oscQueryEnabled ? await osc!.refreshQuery() : osc!.snapshot()['query'] }), syncOsc,
      listSerialPorts: async () => {
        try { return await outputs!.listSerialPorts(); }
        catch (error) { log(`[Meta] Serial discovery unavailable: ${error instanceof Error ? error.message : 'Unknown error.'}`, 'Warning'); return []; }
      }, listMidiPorts: async () => {
        try { return await outputs!.listMidiPorts(); }
        catch (error) { log(`[Meta] MIDI discovery unavailable: ${error instanceof Error ? error.message : 'Unknown error.'}`, 'Warning'); return []; }
      }, listRecordings: () => recordings.list(),
      readRecording: async name => new TextDecoder('utf-8', { fatal: true }).decode(await recordings.read(name)),
      logs: () => logs.snapshot(), notify, log, now,
    };
    const application = new ApplicationFacade(runtime, services);
    management = new ManagementServer({ application, presence, recordings, resource: options.resourceReader ?? readResource,
      instanceInfo: () => ({ processId: process.pid, configPath: launch.configPath, webUiUrl: url, webUiPort: actualPort,
        oscReceiverPort: config.osc.receiverPort, openPages: presence.count }),
      protocolHttp: (request, response) => input?.handleHttp(request, response) ?? Promise.resolve(false),
      protocolUpgrade: (request, socket, head) => input?.handleUpgrade(request, socket, head) ?? false, log });
    const address = await management.listen(config.webUi.host, config.webUi.port);
    url = address.url; actualPort = address.port; config.webUi.port = actualPort;
    if (owner) await owner.start(async requested => { if (requested) await openIfNeeded(); return url; });
    osc = new OscServices(config.osc, oscStore, { now, log, onChanged: notify, resolvePortConflicts: true,
      instanceId: instanceKey(launch.configPath).slice(0, 12),
      onReceiverPortChanged: port => { config.osc.receiverPort = port; notify(); },
      onQueryPortChanged: port => { config.osc.oscQueryReceiver.httpPort = port; notify(); } });
    await syncOsc();
    input = new InputCoordinator({ external, osc: oscStore, now, log, resolvePortConflicts: true,
      sharedServer: { server: management.server, host: config.webUi.host === 'localhost' ? '127.0.0.1' : config.webUi.host, port: actualPort },
      onPortChanged: (ids, port) => { for (const item of config.protocolInputs) if (ids.includes(item.id)) item.port = port; notify(); } });
    await input.reload(config.protocolInputs);
    // Actual bound ports update the same configuration object used by the core.
    await outputs.connectEnabled();
    if (compromised) throw compromised;
    let ticking = false;
    timer = setInterval(() => {
      if (ticking || closeOperation) return; ticking = true;
      void (async () => {
        try {
          external.expire(); await runtime!.tick();
          if (runtime!.getSnapshot().canRouteSignals) await outputs!.updateBindings(now(), source => runtime!.resolveSignalInput(source, now()));
          notify();
        } catch (error) { log(`[Runtime] ${error instanceof Error ? error.message : 'Tick failed.'}`, 'Error'); }
        finally { ticking = false; }
      })();
    }, 10); timer.unref();
    await store.save(configurationForPersistence(runtime.getConfig()));
    log(`[WebUI] Available at ${url}`); notify(); await openIfNeeded();
    return { url, port: actualPort, configPath: launch.configPath, reused: false, application, closed, close };
  } catch (error) { await close().catch(() => {}); throw new Error(logs.redactor.redact(error instanceof Error ? error.message : 'Service startup failed.'), { cause: error }); }
}
