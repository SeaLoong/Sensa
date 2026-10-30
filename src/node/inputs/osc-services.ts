import Bonjour from 'bonjour-service';
import type { Browser as BonjourBrowser, Service as BonjourService } from 'bonjour-service';
import { createSocket } from 'node:dgram';
import type { Socket as DatagramSocket } from 'node:dgram';
import { lookup } from 'node:dns/promises';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { isIP } from 'node:net';
import { WebSocket } from 'ws';
import type { RawData } from 'ws';
import { OscParameterStore, encodeOscMessage, parseOscPacket } from '../../core/protocols/osc.ts';
import type { OscSource, OscValue, OscValueType } from '../../core/protocols/osc.ts';
import { jsonObject, parseStrictJson } from '../../core/protocols/strict-json.ts';

export interface OscServicesConfig {
  enabled: boolean; receiverHost: string; receiverPort: number; inputTimeoutMs: number;
  oscQueryEnabled: boolean; oscQueryUrl: string; preferredSourcePersistentId: string;
  oscQueryPolling: { enabled: boolean; rateHz: number };
  oscQueryReceiver: { enabled: boolean; serviceName: string; httpPort: number; advertiseAvatar: boolean; advertiseTracking: boolean };
  ogbControl: { enabled: boolean; host: string; port: number };
  hub: { enabled: boolean; mode: string | number; fixedRateHz: number; forwardAvatarChange: boolean;
    targets: { id: string; name: string; enabled: boolean; host: string; port: number }[] };
}
export interface OscServicesOptions {
  now?: () => number; log?: (message: string) => void; onChanged?: () => void;
  onReceiverPortChanged?: (port: number) => void; onQueryPortChanged?: (port: number) => void;
  resolvePortConflicts?: boolean; instanceId?: string;
  bonjourFactory?: () => Bonjour;
  fetch?: typeof globalThis.fetch;
  resolveHubHost?: (host: string) => Promise<string>;
  sendHubPacket?: (packet: Uint8Array, port: number, address: string, done: (error: Error | null) => void) => void;
}
interface HubTargetState {
  host: string; port: number; enabled: boolean; address: string | null; resolvedEndpoint: string;
  sentPackets: number; lastSentAtUtc: string | null; lastError: string; lastErrorAtUtc: string | null;
}
interface QueryNode { path: string; fullPath: string; type: string; description: string; access: number | null; currentValue: string; parsedValue: OscValue | null; min: number | null; max: number | null; allowedValues: string[] }
interface QuerySnapshot {
  url: string; name: string; oscIp: string; oscPort: number | null; oscTransport: string; wsIp: string; wsPort: number | null;
  webSocketUrl: string; supportsListen: boolean; refreshedAtUtc: string | null; error: string; nodes: QueryNode[];
}
interface Preview { category: string; path: string; type: string; value: string; timestampMs: number; sourceKey: string; sourceLabel: string; sourcePersistentId: string | null; sourceAddress: string; sourcePort: number }
const emptyQuery = (): QuerySnapshot => ({ url: '', name: '', oscIp: '', oscPort: null, oscTransport: 'UDP', wsIp: '', wsPort: null,
  webSocketUrl: '', supportsListen: false, refreshedAtUtc: null, error: '', nodes: [] });
function dataBytes(raw: RawData): Buffer { return Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw; }
function ipHost(value: string): string { const host = value.toLowerCase() === 'localhost' ? '127.0.0.1' : value; if (!isIP(host)) throw new Error('OSC listeners require a local bind IP address.'); return host.includes(':') ? new URL(`http://[${host}]/`).hostname.slice(1, -1) : host; }
function validPort(value: number): boolean { return Number.isInteger(value) && value >= 0 && value <= 65535; }
function safeObject(value: unknown): Record<string, unknown> | null { try { return jsonObject(value); } catch { return null; } }
function stringField(value: Record<string, unknown>, key: string, max = 4096): string { const text = value[key]; return typeof text === 'string' && text.length <= max ? text : ''; }
function portField(value: Record<string, unknown>, key: string): number | null { const number = value[key]; return typeof number === 'number' && validPort(number) && number > 0 ? number : null; }
export function normalizeOscQueryUrl(raw: string): string {
  if (!raw.trim()) return '';
  try { const url = new URL(raw.includes('://') ? raw.trim() : `http://${raw.trim()}`); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return ''; url.hash = ''; url.search = ''; url.pathname = url.pathname === '/' ? '/' : `${url.pathname.replace(/\/+$/, '')}/`; return url.href; }
  catch { return ''; }
}
export function parseOscQueryNodes(raw: unknown): QueryNode[] {
  const nodes: QueryNode[] = [];
  const append = (candidate: unknown, depth: number): void => {
    if (depth > 64 || nodes.length >= 4096) return; const value = safeObject(candidate); if (!value) return;
    const fullPath = stringField(value, 'FULL_PATH', 512), type = stringField(value, 'TYPE', 32);
    if (fullPath.startsWith('/avatar/parameters/') && fullPath.length > 19) {
      const values = value['VALUE'], atom = Array.isArray(values) ? (values as unknown[])[0] : values;
      let parsedValue: OscValue | null = null;
      if (type.length === 1 && 'VALUE' in value) {
        if (['T', 'F'].includes(type) && typeof atom === 'boolean') parsedValue = atom;
        else if (['T', 'F', 'i', 'h'].includes(type) && typeof atom === 'number' && Number.isInteger(atom) && atom >= -2147483648 && atom <= 2147483647) parsedValue = type === 'T' || type === 'F' ? atom !== 0 : atom;
        else if (['f', 'd'].includes(type) && typeof atom === 'number' && Number.isFinite(Math.fround(atom))) parsedValue = Math.fround(atom);
      }
      const ranges = value['RANGE'], range = Array.isArray(ranges) ? safeObject((ranges as unknown[])[0]) : null;
      const allowed = range?.['VALS'];
      nodes.push({ path: fullPath.slice(19), fullPath, type, description: stringField(value, 'DESCRIPTION'),
        access: typeof value['ACCESS'] === 'number' ? value['ACCESS'] : null,
        currentValue: atom === undefined ? '' : typeof atom === 'string' ? atom : JSON.stringify(atom), parsedValue,
        min: typeof range?.['MIN'] === 'number' && Number.isFinite(range['MIN']) ? range['MIN'] : null,
        max: typeof range?.['MAX'] === 'number' && Number.isFinite(range['MAX']) ? range['MAX'] : null,
        allowedValues: Array.isArray(allowed) ? (allowed as unknown[]).slice(0, 1024).map(item => typeof item === 'string' ? item : JSON.stringify(item)) : [] });
    }
    const children = safeObject(value['CONTENTS']); if (children) for (const child of Object.values(children)) append(child, depth + 1);
  };
  append(raw, 0); return nodes;
}
async function listenHttp(server: HttpServer, port: number, fallback: boolean): Promise<number> {
  const bind = async (candidate: number): Promise<number> => await new Promise((resolve, reject) => {
    const fail = (error: Error): void => { server.off('listening', ready); reject(error); };
    const ready = (): void => { server.off('error', fail); const address = server.address(); if (!address || typeof address === 'string') reject(new Error('OSCQuery HTTP listener did not bind.')); else resolve(address.port); };
    server.once('error', fail); server.once('listening', ready); server.listen(candidate, '0.0.0.0');
  });
  try { return await bind(port); } catch (error) { if (!fallback || !(error instanceof Error) || !('code' in error) || error.code !== 'EADDRINUSE') throw error; return await bind(0); }
}
function closeHttp(server: HttpServer): Promise<void> { return new Promise(resolve => { if (!server.listening) { resolve(); return; } server.closeAllConnections(); server.close(() => resolve()); }); }
/** One authoritative OSC receiver/query/catalog/hub lifecycle for the desktop host. */
export class OscServices {
  readonly store: OscParameterStore; readonly options: OscServicesOptions; readonly now: () => number;
  #config: OscServicesConfig; #active = true; #receiver: DatagramSocket | null = null; #http: HttpServer | null = null;
  #bonjour: Bonjour | null = null; #browser: BonjourBrowser | null = null; #discovered = new Map<string, Record<string, unknown>>();
  #query = emptyQuery(); #querySocket: WebSocket | null = null; #querySubscriptions = new Set<string>(); #queryEpoch = 0; #refresh: Promise<QuerySnapshot> | null = null; #abort: AbortController | null = null;
  #receiverError: string | null = null; #queryReceiverStarted: number | null = null; #queryPort = 0; #receiverPort = 0;
  #lastReceiver: number | null = null; #lastAvatar: number | null = null; #lastRaw: number | null = null; #lastSource: OscSource | null = null; #eventCount = 0;
  #previews: Preview[] = []; #pollTimer: ReturnType<typeof setTimeout> | null = null; #hubTimer: ReturnType<typeof setInterval> | null = null; #ogbTimer: ReturnType<typeof setInterval> | null = null;
  #senders = new Map<string, DatagramSocket>(); #forwarded = 0; #dropped = 0; #lastForwarded: string | null = null; #lastDropped: string | null = null; #lastDropReason = ''; #pending = new Map<string, { packet: Uint8Array; source: OscSource }>(); #pendingAvatar: OscSource | null = null;
  #hubTargets = new Map<string, HubTargetState>(); #hubLookups = new Map<string, Promise<string>>();
  #ogbTarget: { host: string; port: number } | null = null; #ogbError = ''; #ogbSentAt: string | null = null; #ogbSentValue: boolean | null = null;
  #polling = { running: false, startedAtUtc: null as string | null, lastPolledAtUtc: null as string | null, lastAppliedValueCount: 0, error: '' };
  #disposed = false; #stopping = false; #generation = 0; #set = (path: string, value: OscValue, source: OscSource): void => this.#onValue(path, value, source);
  constructor(config: OscServicesConfig, store: OscParameterStore, options: OscServicesOptions = {}) { this.#config = structuredClone(config); this.store = store; this.options = options; this.now = options.now ?? Date.now; this.#restorePersistentSource(); store.onSet.add(this.#set); }
  async reconfigure(config: OscServicesConfig, active = this.#active): Promise<void> {
    const host = ipHost(config.receiverHost); if (!validPort(config.receiverPort) || !validPort(config.oscQueryReceiver.httpPort)) throw new Error('Invalid OSC listener port.');
    const previousPersistentId = this.#config.preferredSourcePersistentId;
    await this.#stop(); this.#config = structuredClone({ ...config, receiverHost: host }); this.#restorePersistentSource(previousPersistentId); this.#active = active; this.#stopping = false; this.#generation++;
    try {
      if (config.enabled && active) await this.#startReceiver();
      await this.#prepareHubTargets();
      if (config.oscQueryEnabled && active) { this.#startDiscovery(); void this.refreshQuery(); if (config.oscQueryPolling.enabled) this.#schedulePoll(0); }
      if (config.oscQueryReceiver.enabled && config.enabled && active) await this.#startQueryReceiver();
      if (config.hub.enabled && active && (config.hub.mode === 'FixedRate' || config.hub.mode === 1)) { this.#hubTimer = setInterval(() => this.#flushHub(), 1000 / Math.max(1, Math.min(60, config.hub.fixedRateHz))); this.#hubTimer.unref(); }
      if (config.ogbControl.enabled && config.enabled && active) this.#startOgb();
      this.options.onChanged?.();
    } catch (error) { this.#receiverError = error instanceof Error ? error.message : 'OSC listener failed.'; await this.#stop(); throw error; }
  }
  async #startReceiver(): Promise<void> {
    const config = this.#config, socket = createSocket(config.receiverHost.includes(':') ? 'udp6' : 'udp4'); this.#receiver = socket;
    const bind = async (port: number): Promise<number> => await new Promise((resolve, reject) => {
      const fail = (error: Error): void => { socket.off('listening', ready); reject(error); };
      const ready = (): void => { socket.off('error', fail); resolve(socket.address().port); }; socket.once('error', fail); socket.once('listening', ready); socket.bind(port, config.receiverHost);
    });
    let port: number; try { port = await bind(config.receiverPort); } catch (error) { if (!this.options.resolvePortConflicts || !(error instanceof Error) || !('code' in error) || error.code !== 'EADDRINUSE') throw error; port = await bind(0); }
    this.#receiverPort = port; this.#receiverError = null;
    if (port !== config.receiverPort) { this.#config.receiverPort = port; this.options.onReceiverPortChanged?.(port); }
    const generation = this.#generation;
    socket.on('message', (data, peer) => {
      if (generation !== this.#generation || this.#stopping || this.#disposed) return;
      const label = `${peer.address}:${peer.port}`, source: OscSource = { key: label, label, persistentId: null, address: peer.address, port: peer.port };
      this.#packet(data, source);
    });
    socket.on('error', error => { this.#receiverError = error.message; this.options.log?.(`OSC receiver: ${error.message}`); this.options.onChanged?.(); });
  }
  #packet(data: Uint8Array, source: OscSource): void {
    const parsed = parseOscPacket(data), now = this.now(); this.#lastReceiver = now; this.#lastSource = source; this.#eventCount++;
    if (parsed.avatarChanged) { this.#avatarChanged(source); this.store.changeAvatar(source.key); }
    for (const entry of parsed.values) { this.#lastAvatar = now; this.store.set(entry.path, entry.value, source, entry.valueType); }
    for (const raw of parsed.unhandled) { this.#lastRaw = now; this.#previewRaw(raw, source); this.#forward(raw, source); }
    this.options.onChanged?.();
  }
  #previewRaw(packet: Uint8Array, source: OscSource): void {
    for (const row of previewPacket(packet, 0)) this.#previews.unshift({ ...row, timestampMs: this.now(), sourceKey: source.key, sourceLabel: source.label,
      sourcePersistentId: source.persistentId, sourceAddress: source.address, sourcePort: source.port });
    this.#previews.length = Math.min(64, this.#previews.length);
  }
  #onValue(path: string, value: OscValue, source: OscSource): void {
    if (this.#config.preferredSourcePersistentId && source.persistentId?.toLowerCase() === this.#config.preferredSourcePersistentId.toLowerCase()) { this.store.preferredSourceKey = source.key; }
    const row = this.store.tryGetLatest(path, source.key); this.#forward(encodeOscMessage(`/avatar/parameters/${path}`, value, row?.entry.valueType), source, path);
    this.options.onChanged?.();
  }
  #hubSourceAllowed(source: OscSource): boolean {
    const sources = this.store.snapshotSources(); const key = this.store.preferredSourceKey ?? (sources.length === 1 ? sources[0]?.key : null);
    return !!key && key === source.key;
  }
  #forward(packet: Uint8Array, source: OscSource, path?: string): void {
    const config = this.#config; if (!config.hub.enabled || !this.#active || this.#stopping || this.#disposed) return;
    if (!this.#hubSourceAllowed(source)) { this.#dropped++; this.#lastDropReason = 'Choose one OSC source before forwarding.'; this.#lastDropped = new Date(this.now()).toISOString(); return; }
    if (path !== undefined && (config.hub.mode === 'FixedRate' || config.hub.mode === 1)) {
      if (this.#pending.size >= 4096 && !this.#pending.has(path)) { this.#dropped++; return; }
      this.#pending.set(path, { packet, source }); return;
    }
    this.#sendForward(packet);
  }
  #sender(host: string): DatagramSocket { const family = host.includes(':') ? 'udp6' : 'udp4'; let socket = this.#senders.get(family); if (!socket) { socket = createSocket(family); socket.on('error', error => this.options.log?.(`OSC output: ${error.message}`)); this.#senders.set(family, socket); } return socket; }
  async #resolveHubHost(host: string): Promise<string> {
    if (host.toLowerCase() === 'localhost') return '127.0.0.1';
    const literal = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    if (isIP(literal)) return ipHost(literal);
    if (!host || host.length > 253 || /[\s\0/\\#@?]/u.test(host)) throw new Error('Invalid OSC hub hostname.');
    let pending = this.#hubLookups.get(host);
    if (!pending) {
      // Keep the actual lookups bounded even when an OS resolver outlives the
      // configuration deadline. Never resolve a hostname for every OSC packet.
      if (this.#hubLookups.size >= 64) throw new Error('Too many pending OSC hub DNS lookups.');
      pending = this.options.resolveHubHost ? this.options.resolveHubHost(host) : lookup(host, { all: true }).then(addresses => {
        const selected = addresses.find(address => address.family === 4) ?? addresses[0];
        if (!selected) throw new Error('OSC hub hostname has no IP address.'); return selected.address;
      });
      this.#hubLookups.set(host, pending);
      const current = pending;
      void pending.then(() => { if (this.#hubLookups.get(host) === current) this.#hubLookups.delete(host); },
        () => { if (this.#hubLookups.get(host) === current) this.#hubLookups.delete(host); });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const address = await Promise.race([pending, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('OSC hub DNS lookup timed out.')), 3000); })]);
      if (!isIP(address)) throw new Error('OSC hub DNS lookup returned an invalid IP address.'); return ipHost(address);
    } finally { if (timer) clearTimeout(timer); }
  }
  async #prepareHubTargets(): Promise<void> {
    const previous = this.#hubTargets, targets = new Map<string, HubTargetState>(), generation = this.#generation;
    this.#hubTargets = targets;
    await Promise.all(this.#config.hub.targets.map(async target => {
      const prior = previous.get(target.id), host = target.host.trim();
      const matches = prior?.host === host && prior.port === target.port && prior.enabled === target.enabled;
      let state: HubTargetState = { host, port: target.port, enabled: target.enabled, address: null, resolvedEndpoint: '', sentPackets: 0, lastSentAtUtc: null, lastError: '', lastErrorAtUtc: null };
      targets.set(target.id, state);
      if (!target.enabled || !this.#config.hub.enabled || !this.#active) return;
      try {
        if (!validPort(target.port) || target.port === 0) throw new Error('Invalid OSC hub target port.');
        const address = await this.#resolveHubHost(host);
        if (generation !== this.#generation || this.#stopping || this.#disposed) return;
        if (this.#receiver && target.port === this.#receiverPort && (address === this.#config.receiverHost || ['127.0.0.1', '::1'].includes(address))) throw new Error('OSC hub target would loop to this receiver.');
        if (matches && prior?.address === address) { state = { ...prior }; targets.set(target.id, state); }
        state.address = address; state.resolvedEndpoint = `${address.includes(':') ? `[${address}]` : address}:${target.port}`;
      } catch (error) {
        if (generation !== this.#generation || this.#stopping || this.#disposed) return;
        state.lastError = error instanceof Error ? error.message : 'Invalid OSC hub target.'; state.lastErrorAtUtc = new Date(this.now()).toISOString();
      }
    }));
  }
  #sendForward(packet: Uint8Array): void {
    for (const target of this.#config.hub.targets.filter(candidate => candidate.enabled)) {
      const state = this.#hubTargets.get(target.id), generation = this.#generation;
      if (!state) continue;
      let settled = false;
      const sent = (error: Error | null): void => {
        if (settled || generation !== this.#generation || this.#stopping || this.#disposed || this.#hubTargets.get(target.id) !== state) return;
        settled = true; const timestamp = new Date(this.now()).toISOString();
        if (error) { state.lastError = error.message; state.lastErrorAtUtc = timestamp; this.#dropped++; this.#lastDropReason = error.message; this.#lastDropped = timestamp; }
        else { state.sentPackets++; state.lastSentAtUtc = timestamp; state.lastError = ''; state.lastErrorAtUtc = null; this.#forwarded++; this.#lastForwarded = timestamp; }
        this.options.onChanged?.();
      };
      try {
        if (!state.address) throw new Error(state.lastError || 'OSC hub target is not resolved.');
        if (this.options.sendHubPacket) this.options.sendHubPacket(packet, target.port, state.address, sent);
        else this.#sender(state.address).send(packet, target.port, state.address, error => sent(error));
      } catch (error) { sent(error instanceof Error ? error : new Error('Invalid hub target.')); }
    }
  }
  #avatarChanged(source: OscSource): void {
    if (!this.#config.hub.enabled || !this.#active || this.#stopping || this.#disposed || !this.#hubSourceAllowed(source)) return;
    // Select before clearing the source catalog, and discard the previous
    // avatar's queued values even when its change notification is disabled.
    this.#pending.clear(); this.#pendingAvatar = null;
    if (!this.#config.hub.forwardAvatarChange) return;
    if (this.#config.hub.mode === 'FixedRate' || this.#config.hub.mode === 1) this.#pendingAvatar = source;
    else this.#sendForward(encodeAvatarChange());
  }
  #flushHub(): void {
    const avatar = this.#pendingAvatar; this.#pendingAvatar = null;
    if (avatar && (this.#hubSourceAllowed(avatar) || !this.store.preferredSourceKey && this.store.sourceCount === 0)) this.#sendForward(encodeAvatarChange());
    const packets = [...this.#pending.values()]; this.#pending.clear();
    for (const row of packets) if (this.#hubSourceAllowed(row.source)) this.#sendForward(row.packet);
  }
  #startOgb(): void {
    const host = ipHost(this.#config.ogbControl.host), port = this.#config.ogbControl.port;
    if (!validPort(port) || !port || host === '0.0.0.0' || host === '::' || host === '255.255.255.255' || /^ff/i.test(host) || isIP(host) === 4 && Number(host.split('.')[0]) >= 224) throw new Error('OGB control requires a unicast IP address and valid UDP port.');
    this.#ogbTarget = { host, port }; this.#sendOgb(true); this.#ogbTimer = setInterval(() => this.#sendOgb(true), 5000); this.#ogbTimer.unref();
  }
  #sendOgb(enabled: boolean): void {
    const target = this.#ogbTarget; if (!target) return;
    this.#sender(target.host).send(encodeOscMessage('/avatar/parameters/OGB_ENABLED', enabled, 'Bool'), target.port, target.host, error => {
      this.#ogbError = error?.message ?? ''; if (!error) { this.#ogbSentAt = new Date(this.now()).toISOString(); this.#ogbSentValue = enabled; } this.options.onChanged?.();
    });
  }
  #discovery(): Bonjour {
    if (!this.#bonjour) this.#bonjour = this.options.bonjourFactory?.() ?? new Bonjour({}, (error: unknown) => this.options.log?.(`OSCQuery discovery: ${error instanceof Error ? error.message : 'mDNS error'}`));
    return this.#bonjour;
  }
  #startDiscovery(): void {
    this.#browser = this.#discovery().find({ type: 'oscjson', protocol: 'tcp' }, service => {
      const host = service.addresses?.find(address => isIP(address) === 4) ?? service.addresses?.[0] ?? service.host;
      const url = `http://${host.includes(':') ? `[${host}]` : host}:${service.port}/`;
      this.#discovered.set(service.fqdn, { name: service.name, host, port: service.port, url, fqdn: service.fqdn }); this.options.onChanged?.();
    });
    this.#browser.on('down', (service: BonjourService) => { this.#discovered.delete(service.fqdn); this.options.onChanged?.(); });
  }
  async #startQueryReceiver(): Promise<void> {
    const receiver = this.#config.oscQueryReceiver, server = createServer({ maxHeaderSize: 16384, headersTimeout: 10000, requestTimeout: 15000, connectionsCheckingInterval: 1000 }, (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
      const url = new URL(req.url ?? '/', 'http://sensa.local'); let payload: unknown;
      if ([...url.searchParams.keys()].some(key => key.toUpperCase() === 'HOST_INFO')) payload = { NAME: receiver.serviceName || 'Sensa', OSC_PORT: this.#receiverPort, OSC_TRANSPORT: 'UDP', SENSA_INSTANCE: this.options.instanceId ?? '', EXTENSIONS: { ACCESS: true, DESCRIPTION: true } };
      else {
        const tree = receiverTree(receiver.advertiseAvatar, receiver.advertiseTracking), node = findQueryNode(tree, url.pathname);
        if (!node) { res.writeHead(404); res.end(); return; }
        const attributes = [...url.searchParams.keys()]; payload = attributes.length ? Object.fromEntries(attributes.filter(key => key in node).map(key => [key, node[key]])) : node;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(req.method === 'HEAD' ? undefined : JSON.stringify(payload));
    });
    this.#http = server; this.#queryPort = await listenHttp(server, receiver.httpPort, this.options.resolvePortConflicts ?? false); this.#queryReceiverStarted = this.now();
    server.on('error', error => this.options.log?.(`OSCQuery receiver: ${error.message}`));
    if (this.#queryPort !== receiver.httpPort) { receiver.httpPort = this.#queryPort; this.options.onQueryPortChanged?.(this.#queryPort); }
    const discovery = this.#discovery(), suffix = this.options.instanceId || this.#queryPort.toString();
    discovery.publish({ name: `${receiver.serviceName || 'Sensa'} ${suffix}`, type: 'oscjson', protocol: 'tcp', port: this.#queryPort, disableIPv6: true });
    discovery.publish({ name: `${receiver.serviceName || 'Sensa'} ${suffix}`, type: 'osc', protocol: 'udp', port: this.#receiverPort, disableIPv6: true });
  }
  async #readQuery(url: string, signal: AbortSignal): Promise<unknown> {
    const response = await (this.options.fetch ?? globalThis.fetch)(url, { signal, redirect: 'error', headers: { Accept: 'application/json' } });
    if (!response.ok || Number(response.headers.get('content-length')) > 2 * 1024 * 1024) throw new Error('OSCQuery response was rejected or oversized.');
    if (!response.body) throw new Error('OSCQuery response has no body.');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const row = await reader.read(); if (row.done) break; size += row.value.byteLength; if (size > 2 * 1024 * 1024) throw new Error('OSCQuery response exceeds 2 MiB.'); chunks.push(row.value); } }
    finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    return parseStrictJson(new TextDecoder('utf8', { fatal: true }).decode(bytes), 64);
  }
  refreshQuery(): Promise<QuerySnapshot> {
    if (this.#refresh) return this.#refresh;
    const work = this.#refreshCore(); this.#refresh = work; void work.finally(() => { if (this.#refresh === work) this.#refresh = null; }); return work;
  }
  async #refreshCore(): Promise<QuerySnapshot> {
    const url = normalizeOscQueryUrl(this.#config.oscQueryUrl); if (!this.#config.oscQueryEnabled || !url || this.#disposed || !this.#active) return this.#query;
    const generation = this.#generation, controller = new AbortController(); this.#abort?.abort(); this.#abort = controller; const timer = setTimeout(() => controller.abort(), 10000); timer.unref();
    try {
      const root = await this.#readQuery(url, controller.signal), hostUrl = new URL(url); hostUrl.search = 'HOST_INFO';
      const info = jsonObject(await this.#readQuery(hostUrl.href, controller.signal)), extensions = safeObject(info['EXTENSIONS']);
      if (generation !== this.#generation || this.#disposed) return this.#query;
      const wsUrl = new URL(url); wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = stringField(info, 'WS_IP', 512); if (wsHost) wsUrl.hostname = wsHost.includes(':') && !wsHost.startsWith('[') ? `[${wsHost}]` : wsHost;
      const wsPort = portField(info, 'WS_PORT'); if (wsPort) wsUrl.port = wsPort.toString();
      this.#query = { url, name: stringField(info, 'NAME', 256), oscIp: stringField(info, 'OSC_IP', 512), oscPort: portField(info, 'OSC_PORT'), oscTransport: stringField(info, 'OSC_TRANSPORT', 32) || 'UDP',
        wsIp: wsHost, wsPort, webSocketUrl: wsUrl.href, supportsListen: extensions?.['LISTEN'] === true || extensions?.['LISTEN'] === 1,
        refreshedAtUtc: new Date(this.now()).toISOString(), error: '', nodes: parseOscQueryNodes(root) };
      const source = this.#querySource(); let applied = 0;
      for (const node of this.#query.nodes) if (node.parsedValue !== null) { this.store.set(node.path, node.parsedValue, source, node.type[0] === 'i' ? 'Int' : typeof node.parsedValue === 'boolean' ? 'Bool' : 'Float'); applied++; }
      this.#polling.lastAppliedValueCount = applied; this.#polling.lastPolledAtUtc = new Date(this.now()).toISOString(); this.#polling.error = '';
      this.#syncQuerySocket(); this.options.onChanged?.(); return this.#query;
    } catch (error) {
      if (generation !== this.#generation || this.#disposed) return this.#query;
      const message = error instanceof Error ? error.message : 'OSCQuery refresh failed.'; this.#query = { ...emptyQuery(), url, error: message, refreshedAtUtc: new Date(this.now()).toISOString() }; this.#polling.error = message; this.options.onChanged?.(); return this.#query;
    } finally { clearTimeout(timer); if (this.#abort === controller) this.#abort = null; }
  }
  #querySource(listen = false): OscSource {
    const query = this.#query, url = new URL(listen ? query.webSocketUrl : query.url), address = !listen && query.oscIp || url.hostname.replace(/^\[|\]$/g, ''),
      port = !listen && query.oscPort ? query.oscPort : Number(url.port || (url.protocol === 'https:' || url.protocol === 'wss:' ? 443 : 80));
    return { key: `oscquery:${query.url.toLowerCase()}`, label: query.name || `OSCQuery ${address}:${port}`, persistentId: query.name ? `oscquery:name:${query.name}` : `oscquery:url:${query.url}`, address, port };
  }
  #syncQuerySocket(): void {
    const query = this.#query;
    if (!query.supportsListen) { this.#querySocket?.terminate(); this.#querySocket = null; this.#querySubscriptions.clear(); return; }
    if (this.#querySocket && this.#querySocket.url === query.webSocketUrl
      && (this.#querySocket.readyState === WebSocket.OPEN || this.#querySocket.readyState === WebSocket.CONNECTING)) { this.#syncSubscriptions(); return; }
    this.#querySocket?.terminate(); this.#querySubscriptions.clear(); const epoch = ++this.#queryEpoch;
    const socket = new WebSocket(query.webSocketUrl, { handshakeTimeout: 10000, maxPayload: 2 * 1024 * 1024, perMessageDeflate: false }); this.#querySocket = socket;
    socket.on('open', () => { if (epoch !== this.#queryEpoch || this.#disposed) { socket.terminate(); return; } this.#syncSubscriptions(); this.options.onChanged?.(); });
    socket.on('message', (raw, binary) => {
      if (epoch !== this.#queryEpoch || this.#disposed) return;
      try { if (binary) this.#packet(dataBytes(raw), this.#querySource(true)); else {
        const message = jsonObject(parseStrictJson(new TextDecoder('utf8', { fatal: true }).decode(dataBytes(raw))));
        if (['PATH_CHANGED', 'PATH_RENAMED', 'PATH_REMOVED', 'PATH_ADDED'].includes(String(message['COMMAND']).toUpperCase())) void this.refreshQuery();
      } } catch { socket.close(1007, 'Invalid OSCQuery payload.'); }
    });
    socket.on('error', error => { if (epoch === this.#queryEpoch) { this.#query.error = error.message; this.options.onChanged?.(); } });
    socket.once('close', () => { if (this.#querySocket !== socket) return; this.#querySocket = null; this.#querySubscriptions.clear(); this.options.onChanged?.(); if (!this.#disposed && this.#active) this.#schedulePoll(500); });
  }
  #syncSubscriptions(): void {
    const socket = this.#querySocket; if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const wanted = new Set(this.#query.nodes.map(node => node.fullPath));
    for (const path of this.#querySubscriptions) if (!wanted.has(path)) socket.send(JSON.stringify({ COMMAND: 'IGNORE', DATA: path }));
    for (const path of wanted) if (!this.#querySubscriptions.has(path)) socket.send(JSON.stringify({ COMMAND: 'LISTEN', DATA: path }));
    this.#querySubscriptions = wanted;
  }
  #schedulePoll(delay: number): void {
    if (this.#pollTimer) clearTimeout(this.#pollTimer);
    this.#polling.running = true; this.#polling.startedAtUtc ??= new Date(this.now()).toISOString();
    this.#pollTimer = setTimeout(() => { this.#pollTimer = null; if (this.#disposed || !this.#active) return;
      void this.refreshQuery().finally(() => { if (this.#config.oscQueryPolling.enabled || this.#query.supportsListen && !this.#querySocket) this.#schedulePoll(1000 / Math.max(1, Math.min(30, this.#config.oscQueryPolling.rateHz))); else this.#polling.running = false; });
    }, delay); this.#pollTimer.unref();
  }
  #persistentSourceKey(persistentId: string): string {
    const sources = this.store.snapshotSources(), matches = (source: OscSource): boolean => source.persistentId?.toLowerCase() === persistentId.toLowerCase();
    return sources.find(source => source.key === this.store.preferredSourceKey && matches(source))?.key
      ?? sources.find(matches)?.key ?? 'unavailable:' + persistentId;
  }
  #restorePersistentSource(previousPersistentId = ''): void {
    const persistentId = this.#config.preferredSourcePersistentId;
    if (persistentId) this.store.preferredSourceKey = this.#persistentSourceKey(persistentId);
    else if (previousPersistentId) this.store.preferredSourceKey = null;
  }
  selectSource(key: string | null, persistentId?: string): void {
    key = key?.trim() || null;
    const previousPersistentId = this.#config.preferredSourcePersistentId;
    const selectedPersistentId = key === 'unavailable:' + previousPersistentId ? previousPersistentId
      : this.store.snapshotSources().find(source => source.key === key)?.persistentId ?? '';
    this.#config.preferredSourcePersistentId = (persistentId ?? selectedPersistentId).trim();
    this.store.preferredSourceKey = key ?? (this.#config.preferredSourcePersistentId ? this.#persistentSourceKey(this.#config.preferredSourcePersistentId) : null);
    this.#pending.clear(); this.#pendingAvatar = null; this.options.onChanged?.();
  }
  snapshot(): Record<string, unknown> {
    const config = this.#config, sources = this.store.snapshotSources(), effective = this.store.preferredSourceKey ?? (sources.length === 1 ? sources[0]?.key ?? null : null), selected = sources.find(source => source.key === effective);
    const hubActive = config.hub.enabled && this.#active && !this.#stopping && !this.#disposed;
    const blocked = config.hub.enabled && sources.length > 1 && !effective;
    const preview = this.store.snapshotEntries().sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(row => ({ path: row.path, type: row.entry.valueType.toLowerCase(), value: formatOscPreviewValue(row.entry.value, row.entry.valueType),
      numericValue: typeof row.entry.value === 'boolean' ? row.entry.value ? 1 : 0 : row.entry.value, classification: classifyOscPath(row.path),
      timestampMs: row.entry.timestampMs, changedAtMs: row.entry.changedAtMs, sourceKey: row.entry.source.key, sourceLabel: row.entry.source.label,
      sourcePersistentId: row.entry.source.persistentId, sourceAddress: row.entry.source.address, sourcePort: row.entry.source.port }));
    const source = this.#lastSource;
    return { enabled: config.enabled, receiverHost: config.receiverHost, receiverPort: this.#receiverPort || config.receiverPort, listening: this.#receiver !== null,
      listenerError: this.#receiverError, preview, sources: sources.map(knownSource => ({ ...knownSource, canPersistSelection: !!knownSource.persistentId })), selectedSourceKey: this.store.preferredSourceKey ?? '', preferredSourcePersistentId: config.preferredSourcePersistentId,
      query: { enabled: config.oscQueryEnabled, ...this.#query, listenConnected: this.#querySocket?.readyState === WebSocket.OPEN, listeningPathCount: this.#querySubscriptions.size,
        streamSourceLabel: this.#query.name, streamSourcePersistentId: this.#query.url ? this.#querySource().persistentId : null,
        polling: { enabled: config.oscQueryPolling.enabled, ...this.#polling, rateHz: Math.max(1, Math.min(30, config.oscQueryPolling.rateHz)) }, discovered: [...this.#discovered.values()] },
      queryReceiver: { enabled: config.oscQueryReceiver.enabled, running: this.#http !== null, serviceName: config.oscQueryReceiver.serviceName, httpPort: this.#queryPort || config.oscQueryReceiver.httpPort,
        httpUrl: this.#http ? `http://127.0.0.1:${this.#queryPort}/` : '', oscPort: this.#receiverPort || config.receiverPort,
        startedAtUtc: this.#queryReceiverStarted === null ? null : new Date(this.#queryReceiverStarted).toISOString(), advertisedPaths: [...(config.oscQueryReceiver.advertiseAvatar ? ['/avatar'] : []), ...(config.oscQueryReceiver.advertiseTracking ? ['/tracking/vrsystem'] : [])],
        receivedSinceStarted: this.#queryReceiverStarted !== null && this.#lastReceiver !== null && this.#lastReceiver >= this.#queryReceiverStarted,
        lastReceivedAtUtc: iso(this.#lastReceiver), lastAvatarParameterAtUtc: iso(this.#lastAvatar), lastRawPacketAtUtc: iso(this.#lastRaw), lastSourceKey: source?.key ?? '', lastSourceLabel: source?.label ?? '', lastSourcePersistentId: source?.persistentId ?? null,
        lastSourceAddress: source?.address ?? '', lastSourcePort: source?.port ?? 0, receivedEventCount: this.#eventCount, error: '' },
      trackingPreview: this.#previews.filter(value => value.category === 'tracking'), rawPreview: [...this.#previews],
      hub: { enabled: config.hub.enabled, mode: config.hub.mode, fixedRateHz: config.hub.fixedRateHz, forwardAvatarChange: config.hub.forwardAvatarChange,
        targetCount: config.hub.targets.length, activeTargetCount: hubActive ? config.hub.targets.filter(target => target.enabled && this.#hubTargets.get(target.id)?.address).length : 0, pendingPacketCount: this.#pending.size, pendingAvatarChange: this.#pendingAvatar !== null,
        forwardedPacketCount: this.#forwarded, droppedPacketCount: this.#dropped, lastForwardedAtUtc: this.#lastForwarded, lastDroppedAtUtc: this.#lastDropped, lastDropReason: this.#lastDropReason,
        blockedBySourceSelection: blocked, effectiveSourceKey: selected?.key ?? '', effectiveSourceLabel: selected?.label ?? '', effectiveSourceParameterCount: selected?.parameterCount ?? 0,
        canForward: hubActive && config.hub.targets.some(target => target.enabled && this.#hubTargets.get(target.id)?.address) && !blocked,
        targets: config.hub.targets.map(target => { const state = this.#hubTargets.get(target.id); return { ...target,
          active: target.enabled && hubActive && !!state?.address,
          resolvedEndpoint: state?.resolvedEndpoint ?? '', sentPackets: state?.sentPackets ?? 0, lastSentAtUtc: state?.lastSentAtUtc ?? null,
          lastError: state?.lastError ?? '', lastErrorAtUtc: state?.lastErrorAtUtc ?? null }; }) },
      ogbControl: { active: this.#ogbTarget !== null, host: this.#ogbTarget?.host ?? '', port: this.#ogbTarget?.port ?? 0, lastError: this.#ogbError, lastSentAtUtc: this.#ogbSentAt, lastSentValue: this.#ogbSentValue } };
  }
  async #stop(): Promise<void> {
    this.#stopping = true;
    this.#generation++; this.#abort?.abort(); this.#abort = null; this.#refresh = null; this.#queryEpoch++;
    if (this.#pollTimer) clearTimeout(this.#pollTimer); if (this.#hubTimer) clearInterval(this.#hubTimer); if (this.#ogbTimer) clearInterval(this.#ogbTimer);
    this.#pollTimer = this.#hubTimer = this.#ogbTimer = null; this.#polling.running = false;
    this.#sendOgb(false); this.#ogbTarget = null; this.#pending.clear(); this.#pendingAvatar = null;
    this.#querySocket?.terminate(); this.#querySocket = null; this.#querySubscriptions.clear();
    if (this.#receiver) { const receiver = this.#receiver; this.#receiver = null; try { await new Promise<void>(resolve => receiver.close(() => resolve())); } catch { /* Failed binds may already be closed. */ } }
    if (this.#http) { const server = this.#http; this.#http = null; await closeHttp(server); }
    this.#browser?.stop(); this.#browser = null; this.#discovered.clear();
    if (this.#bonjour) { const service = this.#bonjour; this.#bonjour = null; await new Promise<void>(resolve => service.unpublishAll(() => { service.destroy(() => resolve()); })); }
    for (const socket of this.#senders.values()) { try { socket.close(); } catch { /* A failed send may not have bound the sender. */ } } this.#senders.clear();
  }
  async dispose(): Promise<void> { if (this.#disposed) return; this.#disposed = true; await this.#stop(); this.store.onSet.delete(this.#set); }
}
export async function createOscServices(config: OscServicesConfig, store: OscParameterStore, options: OscServicesOptions = {}): Promise<OscServices> {
  const services = new OscServices(config, store, options); try { await services.reconfigure(config); return services; } catch (error) { await services.dispose(); throw error; }
}
function iso(value: number | null): string | null { return value === null ? null : new Date(value).toISOString(); }
function formatOscPreviewValue(value: OscValue, type: OscValueType): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (type === 'Int') return value.toString();
  const text = value.toFixed(3).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1'); return text === '-0' ? '0' : text;
}
function receiverTree(avatar: boolean, tracking: boolean): Record<string, unknown> {
  const contents: Record<string, unknown> = {};
  if (avatar) contents['avatar'] = { FULL_PATH: '/avatar', DESCRIPTION: 'Receive VRChat avatar OSC data', ACCESS: 0, CONTENTS: {
    change: { FULL_PATH: '/avatar/change', DESCRIPTION: 'Receive avatar change notifications', TYPE: 's', ACCESS: 2 },
    parameters: { FULL_PATH: '/avatar/parameters', DESCRIPTION: 'Receive avatar parameter messages', ACCESS: 0 } } };
  if (tracking) contents['tracking'] = { FULL_PATH: '/tracking', DESCRIPTION: 'Receive VRChat tracking OSC data', ACCESS: 0, CONTENTS: { vrsystem: { FULL_PATH: '/tracking/vrsystem', DESCRIPTION: 'Receive head and wrist tracking messages for passthrough', ACCESS: 0 } } };
  return { FULL_PATH: '/', DESCRIPTION: 'Sensa OSC receiver root', ACCESS: 0, CONTENTS: contents };
}
function findQueryNode(root: Record<string, unknown>, path: string): Record<string, unknown> | null {
  let node = root; for (const segment of path.split('/').filter(Boolean)) { const child = safeObject(safeObject(node['CONTENTS'])?.[segment]); if (!child) return null; node = child; } return node;
}
function encodeAvatarChange(): Uint8Array { const path = new TextEncoder().encode('/avatar/change'), result = new Uint8Array(24); result.set(path); result.set(new TextEncoder().encode(',s'), 16); return result; }
function previewPacket(packet: Uint8Array, depth: number): { category: string; path: string; type: string; value: string }[] {
  if (depth > 16 || packet.length < 4) return []; const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength); let at = 0;
  const text = (): string | null => { const end = packet.indexOf(0, at); if (end < 0) return null; const string = new TextDecoder().decode(packet.subarray(at, end)); at = (end + 4) & ~3; return at <= packet.length ? string : null; };
  const path = text(); if (!path) return [];
  if (path === '#bundle') { at += 8; const result: { category: string; path: string; type: string; value: string }[] = []; while (at + 4 <= packet.length && result.length < 64) { const size = view.getInt32(at); at += 4; if (size <= 0 || at + size > packet.length) break; result.push(...previewPacket(packet.subarray(at, at + size), depth + 1)); at += size; } return result.slice(0, 64); }
  const type = text(); if (!type?.startsWith(',')) return []; const values: string[] = [];
  for (const tag of type.slice(1)) { if ((tag === 'f' || tag === 'i') && at + 4 <= packet.length) { values.push((tag === 'f' ? view.getFloat32(at) : view.getInt32(at)).toString()); at += 4; } else if (tag === 'T' || tag === 'F') values.push(tag === 'T' ? 'true' : 'false'); else if (tag === 's') values.push(text() ?? ''); else values.push(`[${tag}]`); }
  return [{ category: path.startsWith('/tracking/') ? 'tracking' : 'raw', path, type: type.slice(1), value: values.join(', ') }];
}
const knownParameters = ['PenOthers', 'PenSelf', 'PenOthersNewRoot', 'PenOthersNewTip', 'PenSelfNewRoot', 'PenSelfNewTip', 'TouchOthers', 'TouchSelf', 'FrotOthers', 'AngleRight_Raw', 'AngleLeft_Raw', 'AngleUp_Raw', 'AngleDown_Raw'];
export function classifyOscPath(path: string): { isFaceTracking: boolean; relevance: number; hint: string } {
  const normalized = path.replace(/^\/+/, '').replace(/^avatar\/parameters\//, ''), segments = normalized.split('/'), leaf = segments[segments.length - 1] ?? '';
  if (/^(?:FT|v2)\//i.test(normalized)) return { isFaceTracking: true, relevance: 0, hint: '面部追踪参数' };
  if (normalized.startsWith('Sensa/Contact/')) return { isFaceTracking: false, relevance: 100, hint: 'SDK Contact 根点与相对速度；需完整采样与 Self 目标 / SDK Contact root and relative velocity require complete samples and a Self target' };
  if (/_SenderLocalPosition|_SenderVelocity|_SenderType$|_ProximitySpeed$|_CollisionTag_/.test(leaf)) return { isFaceTracking: false, relevance: 60, hint: 'SDK Contact 高级报告；不是插入深度 / SDK Contact advanced report; not insertion depth' };
  if (normalized.startsWith('VFH/Zone/Touch/') || segments.some(segment => /^(?:OGB|Sensa)$/i.test(segment))) return { isFaceTracking: false, relevance: 100, hint: '已知触觉参数路径' };
  if (knownParameters.some(name => name.toLowerCase() === leaf.toLowerCase())) return { isFaceTracking: false, relevance: 90, hint: '名称匹配已知触觉参数，请确认来源与含义' };
  if (segments.some(segment => /^(?:SPS|TPS)$/i.test(segment)) || /penetr|depth|frot|socket|touchzone/i.test(normalized)) return { isFaceTracking: false, relevance: 60, hint: '可能是目标参数（关键词匹配），请确认后再映射' };
  if (leaf.length >= 7 && knownParameters.some(name => editDistance(leaf.toLowerCase(), name.toLowerCase()) <= 2)) return { isFaceTracking: false, relevance: 40, hint: '可能是目标参数（名称相近），请确认后再映射' };
  return { isFaceTracking: false, relevance: 10, hint: '' };
}
function editDistance(a: string, b: string): number { if (Math.abs(a.length - b.length) > 2) return 3; let row = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min((next[j - 1] ?? 0) + 1, (row[j] ?? 0) + 1, (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)); row = next; } return row[b.length] ?? 0; }
