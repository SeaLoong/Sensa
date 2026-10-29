/** Feature inventory for adapters. Detection never requests permission or opens a connection. */
export type OutputKind = 'intiface' | 'tcode-ws' | 'json-ws' | 'http' | 'serial' | 'bluetooth' | 'midi';
export type CapabilityReason = 'available' | 'missing-websocket' | 'missing-fetch' | 'requires-secure-context'
  | 'missing-serial' | 'missing-bluetooth' | 'missing-midi' | 'missing-window-messaging'
  | 'missing-input-adapter' | 'missing-host-adapter' | 'host-unavailable';
export type CapabilitySource = 'api' | 'injected' | 'unavailable';

export interface OutputCapability {
  readonly available: boolean;
  readonly reason: string;
  readonly reasonZh: string;
  readonly reasonCode: CapabilityReason;
  readonly source: CapabilitySource;
  readonly alternatives: readonly OutputKind[];
}

/** A host advertises a route only together with its actual registered factory. */
export interface RegisteredCapability {
  readonly create?: unknown;
  readonly available?: boolean;
  readonly reason?: string;
  readonly reasonZh?: string;
}
export interface CapabilityInventory {
  readonly outputs?: Readonly<Record<string, RegisteredCapability>>;
  readonly inputs?: Readonly<Record<string, RegisteredCapability>>;
}
export interface CapabilityReport {
  readonly secureContext: boolean | null;
  readonly outputs: Readonly<Record<OutputKind, OutputCapability>> & Readonly<Record<string, OutputCapability | undefined>>;
  readonly inputs: Readonly<Record<'explorer' | 'midi', OutputCapability>> & Readonly<Record<string, OutputCapability | undefined>>;
}

const reasons: Readonly<Record<CapabilityReason, readonly [string, string]>> = {
  available: ['', ''],
  'missing-websocket': ['WebSocket is unavailable.', '当前环境未提供 WebSocket。'],
  'missing-fetch': ['HTTP requests are unavailable.', '当前环境未提供 HTTP 请求。'],
  'requires-secure-context': ['Use HTTPS or a localhost page.', '使用 HTTPS 或本机页面。'],
  'missing-serial': ['Web Serial is unavailable.', '当前环境未提供 Web Serial。'],
  'missing-bluetooth': ['Web Bluetooth is unavailable.', '当前环境未提供 Web Bluetooth。'],
  'missing-midi': ['Web MIDI is unavailable.', '当前环境未提供 Web MIDI。'],
  'missing-window-messaging': ['Open the browser page to pair the explorer.', '打开浏览器页面连接参数图解。'],
  'missing-input-adapter': ['No MIDI input adapter is registered.', '尚未注册 MIDI 输入适配器。'],
  'missing-host-adapter': ['No host adapter is registered.', '尚未注册主机适配器。'],
  'host-unavailable': ['This host connection is unavailable.', '此主机连接当前不可用。'],
};
const networkRoutes: readonly OutputKind[] = ['intiface', 'tcode-ws', 'json-ws', 'http'];

function property(target: unknown, key: PropertyKey): unknown {
  if ((typeof target !== 'object' || target === null) && typeof target !== 'function') return undefined;
  try { return Reflect.get(target, key); } catch { return undefined; }
}
function callable(target: unknown, key: PropertyKey): boolean {
  return typeof property(target, key) === 'function';
}
function capability(code: CapabilityReason, source: CapabilitySource = 'unavailable'): OutputCapability {
  const [reason, reasonZh] = reasons[code];
  return { available: code === 'available', reason, reasonZh, reasonCode: code, source, alternatives: [] };
}
function feature(available: boolean, code: CapabilityReason): OutputCapability {
  return available ? capability('available', 'api') : capability(code);
}
function deviceFeature(secure: boolean | null, available: boolean, code: CapabilityReason): OutputCapability {
  if (secure !== true) return capability('requires-secure-context');
  return feature(available, code);
}
function injectedRoutes(target: Record<string, OutputCapability | undefined>, inventory: unknown): void {
  let keys: string[];
  try { keys = inventory && typeof inventory === 'object' ? Object.keys(inventory) : []; } catch { return; }
  for (const key of keys) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key)) continue;
    const registration = property(inventory, key);
    const enabled = property(registration, 'available');
    const factory = property(registration, 'create');
    // A boolean-only inventory must not turn an unimplemented native route on.
    if (typeof factory !== 'function') {
      if (!target[key]?.available) target[key] = capability('missing-host-adapter');
      continue;
    }
    const available = enabled === undefined || enabled === true;
    const state = capability(available ? 'available' : 'host-unavailable', 'injected');
    const reason = property(registration, 'reason'), reasonZh = property(registration, 'reasonZh');
    target[key] = { ...state,
      reason: !available && typeof reason === 'string' ? reason.slice(0, 160) : state.reason,
      reasonZh: !available && typeof reasonZh === 'string' ? reasonZh.slice(0, 160) : state.reasonZh,
    };
  }
}

/**
 * Use callable API features, never browser/OS names or navigator presence.
 * Node's real WebSocket/fetch adapters remain available; browser-only device
 * APIs additionally require an explicitly secure context. Injected factories
 * describe host-provided adapters, such as a future narrow Electron bridge.
 */
export function detectCapabilities(environment: unknown = globalThis, injected?: CapabilityInventory): CapabilityReport {
  const secureValue = property(environment, 'isSecureContext');
  const secureContext = typeof secureValue === 'boolean' ? secureValue : null;
  const navigator = property(environment, 'navigator');
  const socket = callable(environment, 'WebSocket');
  const outputs: Record<OutputKind, OutputCapability> & Record<string, OutputCapability | undefined> = {
    intiface: feature(socket, 'missing-websocket'),
    'tcode-ws': feature(socket, 'missing-websocket'),
    'json-ws': feature(socket, 'missing-websocket'),
    http: feature(callable(environment, 'fetch'), 'missing-fetch'),
    serial: deviceFeature(secureContext, callable(property(navigator, 'serial'), 'requestPort'), 'missing-serial'),
    bluetooth: deviceFeature(secureContext, callable(property(navigator, 'bluetooth'), 'requestDevice'), 'missing-bluetooth'),
    midi: deviceFeature(secureContext, callable(navigator, 'requestMIDIAccess'), 'missing-midi'),
  };
  const window = property(environment, 'window');
  const location = property(window, 'location');
  const origin = property(location, 'origin');
  const messages = callable(window, 'addEventListener') && callable(window, 'removeEventListener') && callable(window, 'postMessage')
    && typeof origin === 'string' && /^https?:\/\//.test(origin);
  const inputs: Record<'explorer' | 'midi', OutputCapability> & Record<string, OutputCapability | undefined> = {
    explorer: feature(messages, 'missing-window-messaging'),
    midi: capability('missing-input-adapter'),
  };
  injectedRoutes(outputs, property(injected, 'outputs'));
  injectedRoutes(inputs, property(injected, 'inputs'));
  for (const [key, state] of Object.entries(outputs)) {
    if (!state) continue;
    outputs[key] = { ...state, alternatives: networkRoutes.filter(route => route !== key && outputs[route].available) };
  }
  return { secureContext, outputs, inputs };
}
