import { randomUUID } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { createServer as createHttpServer } from 'node:http';
import { isIP, createServer as createTcpServer } from 'node:net';
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import type { Server as TcpServer } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import { isWebInput, normalizeInputPath, validateProtocolInputs } from '../../core/protocols/input-types.ts';
import type { ExternalControlSink, ProtocolInputConfig } from '../../core/protocols/input-types.ts';
import { ExternalControlStore } from '../../core/protocols/external-control.ts';
import { OscParameterStore } from '../../core/protocols/osc.ts';
import { ButtplugInputSession } from '../../core/protocols/buttplug-input.ts';
import { TCodeInputSession, TCodeLineFramer, maximumTCodeLineBytes } from '../../core/protocols/tcode-input.ts';
import { parseStrictJson } from '../../core/protocols/strict-json.ts';
import { HttpInputSession } from './http-session.ts';
import type { HttpInputOptions } from './http-session.ts';
import { VendorInputSession } from './vendor-session.ts';
import { InputHttpError, readJsonBody, requestIdentity } from './http-utils.ts';
import { WebSocketMessageEpochs } from './websocket-epoch.ts';

export interface InputCoordinatorOptions extends HttpInputOptions {
  external: ExternalControlSink;
  osc: OscParameterStore;
  log?: (message: string) => void;
  resolvePortConflicts?: boolean;
  sharedServer?: { server: HttpServer; host: string; port: number };
  onPortChanged?: (inputIds: string[], actualPort: number) => void;
  serialFactory?: (config: ProtocolInputConfig) => Promise<Duplex>;
}
export interface InputListenerSnapshot { id: string; name: string; type: string; enabled: boolean; running: boolean; host: string; port: number; path: string; error: string }
interface WebGroup { host: string; port: number; inputs: ProtocolInputConfig[]; server: HttpServer; owned: boolean }
interface Session { dispose(): void; resetCommands?(): void; remainingIdleTime?: number; heartbeat?(): void }
interface ActiveConnection { session: Session; framer?: TCodeLineFramer; stream?: Duplex; websocket?: WebSocket; pendingAt: number | null; pendingTimeoutMs?: number; checkIdle?: boolean }
const utf8 = new TextDecoder('utf-8', { fatal: true });
function bytes(raw: RawData): Buffer { return Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw; }
function canonicalHost(host: string): string {
  if (!isIP(host)) throw new Error('Protocol input host must be a local bind IP address.');
  return host.includes(':') ? new URL(`http://[${host}]/`).hostname.slice(1, -1) : host;
}
function pathsMatch(prefix: string, path: string): boolean { return prefix === '/' || prefix === path || path.startsWith(`${prefix}/`); }
function overlapping(a: string, b: string): boolean { return a === b || a === '::' || b === '::' || isIP(a) === isIP(b) && (a === '0.0.0.0' || b === '0.0.0.0'); }
function code(error: unknown): string | undefined { return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined; }
function sendWebSocket(socket: WebSocket, payload: string | Buffer, binary = false): boolean {
  const size = typeof payload === 'string' ? Buffer.byteLength(payload) : payload.byteLength;
  if (size > 1048576 || socket.bufferedAmount + size > 1048576) { socket.terminate(); return false; }
  const deadline = setTimeout(() => socket.terminate(), 3000); deadline.unref();
  socket.send(payload, { binary }, error => { clearTimeout(deadline); if (error) socket.terminate(); }); return true;
}
async function bindServer(server: HttpServer | TcpServer, host: string, port: number, fallback: boolean): Promise<number> {
  const listen = async (candidate: number): Promise<number> => await new Promise((resolve, reject) => {
    const fail = (error: Error): void => { server.off('listening', ready); reject(error); };
    const ready = (): void => { server.off('error', fail); const address = server.address(); if (!address || typeof address === 'string') reject(new Error('Listener did not bind a network address.')); else resolve(address.port); };
    server.once('error', fail); server.once('listening', ready); server.listen({ host, port: candidate });
  });
  try { return await listen(port); } catch (error) { if (!fallback || code(error) !== 'EADDRINUSE') throw error; return await listen(0); }
}
function closeServer(server: HttpServer | TcpServer): Promise<void> {
  return new Promise(resolve => { if (!server.listening) { resolve(); return; } const deadline = setTimeout(resolve, 1500); deadline.unref(); server.close(() => { clearTimeout(deadline); resolve(); }); if ('closeAllConnections' in server) server.closeAllConnections(); });
}
/** Shared listener dispatcher and transport lifecycle. Only registered protocol paths are handled. */
export class InputCoordinator {
  readonly options: InputCoordinatorOptions;
  #configs: ProtocolInputConfig[] = []; #groups: WebGroup[] = []; #closers: (() => Promise<void>)[] = [];
  #http = new Map<string, HttpInputSession>(); #vendor = new Map<string, VendorInputSession>();
  #connections = new Set<ActiveConnection>(); #snapshot = new Map<string, InputListenerSnapshot>();
  #wss = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
  #timer: ReturnType<typeof setInterval>; #disposed = false; #reload: Promise<void> = Promise.resolve();
  #inputEpoch = 0;
  #clear = (): void => this.resetCommands();
  constructor(options: InputCoordinatorOptions) {
    this.options = options;
    this.#timer = setInterval(() => this.#tick(), 20); this.#timer.unref();
    if (options.external instanceof ExternalControlStore) options.external.onCommandsCleared.add(this.#clear);
  }
  reload(inputs: readonly ProtocolInputConfig[]): Promise<void> {
    const next = validateProtocolInputs(inputs).map(input => ({ ...input, host: canonicalHost(input.host) }));
    const enabled = next.filter(input => input.enabled && !['IntifaceDevice', 'TCodeSerial'].includes(input.type));
    for (let i = 0; i < enabled.length; i++) for (let j = i + 1; j < enabled.length; j++) {
      const a = enabled[i], b = enabled[j]; if (!a || !b || !a.port || a.port !== b.port || (a.type === 'TCodeUdp') !== (b.type === 'TCodeUdp') || !overlapping(a.host, b.host)) continue;
      if (!isWebInput(a.type) || !isWebInput(b.type) || a.host !== b.host || a.path === b.path) throw new Error('Overlapping protocol listeners require separate ports or distinct web paths on the same bind address.');
    }
    const operation = this.#reload.catch(() => undefined).then(async () => {
      if (this.#disposed) throw new Error('The input coordinator is disposed.');
      const previous = this.#configs; await this.#stop();
      try { await this.#start(next); this.#configs = next; }
      catch (error) { await this.#stop(); try { await this.#start(previous); this.#configs = previous; } catch (restore) { this.options.log?.(`Protocol input restore failed: ${restore instanceof Error ? restore.message : 'unknown error'}`); } throw error; }
    });
    this.#reload = operation; return operation;
  }
  async #start(configs: ProtocolInputConfig[]): Promise<void> {
    for (const config of configs.filter(input => input.enabled)) {
      this.#snapshot.set(config.id, { id: config.id, name: config.name, type: config.type, enabled: true, running: false, host: config.host, port: config.port, path: config.path, error: '' });
      if (isWebInput(config.type)) {
        if (config.type === 'AutoblowHttp' || config.type === 'VacuGlideHttp') this.#vendor.set(config.id, new VendorInputSession(config, this.options.external, this.options));
        else if (!['Buttplug', 'TCodeWebSocket'].includes(config.type)) this.#http.set(config.id, new HttpInputSession(config, this.options.external, this.options));
        let group = this.#groups.find(candidate => candidate.host === config.host && candidate.port === config.port);
        if (!group) {
          const shared = this.options.sharedServer, same = shared && canonicalHost(shared.host) === config.host && shared.port === config.port;
          if (same && config.path === '/') throw new Error('Inputs sharing the management listener require a separate path mount.');
          if (same && (config.path === '/api' || config.path.startsWith('/api/'))) throw new Error('The /api namespace is reserved on the management listener.');
          const server = same ? shared.server : createHttpServer({ maxHeaderSize: 16384, headersTimeout: 10000, requestTimeout: 15000, connectionsCheckingInterval: 1000 }, (req, res) => { void this.#dispatchHttp(req, res, server); });
          group = { host: config.host, port: config.port, inputs: [], server, owned: !same }; this.#groups.push(group);
          if (!same) server.on('upgrade', (req, socket, head) => { if (!this.#upgrade(req, socket, head, server)) socket.destroy(); });
        }
        group.inputs.push(config);
      } else if (config.type === 'TCodeTcp') await this.#tcp(config);
      else if (config.type === 'TCodeUdp') await this.#udp(config);
      else if (config.type === 'IntifaceDevice') await this.#device(config);
      else await this.#serial(config);
    }
    for (const group of this.#groups) {
      group.inputs.sort((a, b) => b.path.length - a.path.length);
      const actualPort = group.owned ? await bindServer(group.server, group.host, group.port, this.options.resolvePortConflicts ?? false) : group.port;
      this.#closers.push(async () => { if (group.owned) await closeServer(group.server); });
      for (const input of group.inputs) { const snapshot = this.#snapshot.get(input.id); if (snapshot) { snapshot.port = actualPort; snapshot.running = true; } }
      if (actualPort !== group.port) this.options.onPortChanged?.(group.inputs.map(input => input.id), actualPort);
    }
  }
  #select(path: string, server?: HttpServer): { config: ProtocolInputConfig; relative: string } | undefined {
    for (const group of this.#groups) {
      if (server && group.server !== server || !server && group.owned) continue;
      const config = group.inputs.find(input => pathsMatch(input.path, path));
      if (config) return { config, relative: config.path === '/' ? path : path.slice(config.path.length) || '/' };
    }
    return undefined;
  }
  async #dispatchHttp(req: IncomingMessage, res: ServerResponse, server?: HttpServer): Promise<boolean> {
    let url: URL; try { url = new URL(req.url ?? '/', 'http://sensa.local'); } catch { res.writeHead(400); res.end(); return true; }
    const selected = this.#select(url.pathname, server); if (!selected) { if (server) { res.writeHead(404); res.end(); } return false; }
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sensa-Session, X-Device-Token');
    if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
    let status = 200, body: unknown;
    try {
      const config = selected.config;
      if (config.type === 'Buttplug' || config.type === 'TCodeWebSocket' || config.type === 'JsonWebSocket') throw new InputHttpError(426, 'Use a WebSocket connection.');
      const identity = requestIdentity(req, this.#vendor.has(config.id) ? config.identifier : undefined);
      const vendor = this.#vendor.get(config.id), session = this.#http.get(config.id);
      const reply = vendor ? await vendor.handle(req, selected.relative, identity)
        : session ? await session.process(selected.relative, req.method ?? 'GET', ['PUT', 'POST'].includes(req.method ?? '') ? await readJsonBody(req) : {}, identity, url.searchParams)
          : { status: 404, body: { error: 'Input is unavailable.' } };
      status = reply.status; body = reply.body;
    } catch (error) {
      status = error instanceof InputHttpError ? error.status : error instanceof SyntaxError || error instanceof TypeError ? 400 : 400;
      if (status === 413 || status === 408) res.setHeader('Connection', 'close');
      const message = error instanceof Error ? error.message : 'Invalid input command.';
      body = selected.config.type === 'LovenseHttp' ? { code: 400, type: 'Error', message } : { error: { code: 400, message, connected: !this.#disposed } };
    }
    if (!res.destroyed && !res.writableEnded) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
    return true;
  }
  handleHttp(req: IncomingMessage, res: ServerResponse): Promise<boolean> { return this.#dispatchHttp(req, res); }
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean { return this.#upgrade(req, socket, head); }
  #upgrade(req: IncomingMessage, socket: Duplex, head: Buffer, server?: HttpServer): boolean {
    let path: string; try { path = new URL(req.url ?? '/', 'http://sensa.local').pathname; } catch { return false; }
    const selected = this.#select(path, server);
    if (!selected || selected.relative !== '/' || !['Buttplug', 'JsonWebSocket', 'TCodeWebSocket'].includes(selected.config.type)) return false;
    if (this.#connections.size >= 32) { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return true; }
    const epochs = new WebSocketMessageEpochs(() => this.#inputEpoch);
    socket.prependListener('data', (chunk: Buffer) => { if (!epochs.push(chunk)) socket.destroy(); });
    this.#wss.handleUpgrade(req, socket, head, websocket => this.#websocket(selected.config, websocket, epochs)); return true;
  }
  #websocket(config: ProtocolInputConfig, websocket: WebSocket, epochs: WebSocketMessageEpochs): void {
    const identity = `websocket:${randomUUID()}`, tcode = config.type === 'TCodeWebSocket' ? new TCodeInputSession(config, this.options.external, identity, this.options.now) : null;
    const buttplug = config.type === 'Buttplug' ? new ButtplugInputSession(config, this.options.external, this.options.now, identity) : null;
    const json = this.#http.get(config.id); const framer = tcode ? new TCodeLineFramer() : undefined; let lastActivity = (this.options.now ?? Date.now)();
    if (tcode && !tcode.tryAcquire().ok) { websocket.close(1008, 'Input already controlled.'); return; }
    const now = this.options.now ?? Date.now;
    const session: Session = tcode ?? buttplug ?? { dispose: () => json?.releaseIdentity(identity), resetCommands: () => json?.resetCommands(), get remainingIdleTime() { return config.timeoutMs - (now() - lastActivity); } };
    const active: ActiveConnection = { session, websocket, pendingAt: null, ...(framer ? { framer } : {}) }; this.#connections.add(active);
    websocket.on('message', (raw, binary) => {
      try {
        if (epochs.take() !== this.#inputEpoch) throw new Error('A pending protocol frame belongs to a cleared input generation.');
        if (binary) throw new Error('Expected text protocol messages.'); const payload = bytes(raw); const text = utf8.decode(payload);
        lastActivity = (this.options.now ?? Date.now)(); let response = '';
        if (tcode && framer) {
          if (payload.length > maximumTCodeLineBytes) throw new Error('TCode WebSocket message exceeds the input limit.');
          for (const line of framer.push(payload)) { const reply = tcode.processLine(line); if (reply.startsWith('ERR ')) throw new Error(reply.trim()); response += reply; }
          active.pendingAt = framer.pendingBytes ? active.pendingAt ?? lastActivity : null;
        } else if (buttplug) response = buttplug.process(text);
        else if (json) { try { response = JSON.stringify(json.processJson('/', 'POST', parseStrictJson(text), identity).body); } catch (error) { response = JSON.stringify({ error: { code: 400, message: error instanceof Error ? error.message : 'Malformed JSON command.' } }); } }
        if (response && websocket.readyState === WebSocket.OPEN && !sendWebSocket(websocket, response)) session.dispose();
        if (buttplug?.disposed) websocket.close(1000);
      } catch { session.dispose(); websocket.close(1007, 'Invalid protocol payload.'); }
    });
    websocket.on('error', () => websocket.terminate()); websocket.once('close', () => { session.dispose(); this.#connections.delete(active); });
  }
  #attachTCode(config: ProtocolInputConfig, stream: Duplex, identity: string): ActiveConnection | null {
    const session = new TCodeInputSession(config, this.options.external, identity, this.options.now), framer = new TCodeLineFramer();
    if (!session.tryAcquire().ok) { stream.destroy(); return null; }
    const active: ActiveConnection = { session, framer, stream, pendingAt: null }; this.#connections.add(active);
    stream.on('data', (data: Buffer) => {
      try { for (const line of framer.push(data)) {
          if (stream.destroyed) break;
          const reply = session.processLine(line);
          if (reply) {
            if (stream.writableLength + Buffer.byteLength(reply) > 65536) { session.dispose(); stream.destroy(); break; }
            const deadline = setTimeout(() => { session.dispose(); stream.destroy(); }, 1000); deadline.unref();
            stream.write(reply, error => { clearTimeout(deadline); if (error) { session.dispose(); stream.destroy(); } });
          }
          if (reply.startsWith('ERR ')) { stream.end(); session.dispose(); break; }
        }
        active.pendingAt = framer.pendingBytes ? active.pendingAt ?? (this.options.now ?? Date.now)() : null;
      } catch { session.dispose(); stream.destroy(); }
    });
    stream.once('error', () => { session.dispose(); stream.destroy(); }); stream.once('close', () => { session.dispose(); this.#connections.delete(active); }); return active;
  }
  async #tcp(config: ProtocolInputConfig): Promise<void> {
    const server = createTcpServer(socket => { if (this.#connections.size >= 32) socket.destroy(); else this.#attachTCode(config, socket, `tcp:${randomUUID()}`); });
    const port = await bindServer(server, config.host, config.port, this.options.resolvePortConflicts ?? false);
    server.on('error', error => this.options.log?.(`Protocol TCP error: ${error.message}`)); this.#closers.push(async () => await closeServer(server)); this.#mark(config, port);
  }
  async #udp(config: ProtocolInputConfig): Promise<void> {
    const socket = createSocket(config.host.includes(':') ? 'udp6' : 'udp4'); let owner = '', session: TCodeInputSession | null = null, active: ActiveConnection | null = null;
    const bind = async (port: number): Promise<number> => await new Promise((resolve, reject) => {
      const fail = (error: Error): void => { socket.off('listening', ready); reject(error); };
      const ready = (): void => { socket.off('error', fail); resolve(socket.address().port); }; socket.once('error', fail); socket.once('listening', ready); socket.bind({ address: config.host, port });
    });
    let port: number; try { port = await bind(config.port); } catch (error) { if (!this.options.resolvePortConflicts || code(error) !== 'EADDRINUSE') { socket.close(); throw error; } port = await bind(0); }
    const clear = (): void => { session?.dispose(); if (active) this.#connections.delete(active); active = null; session = null; owner = ''; };
    socket.on('message', (data, peer) => {
      const key = `${peer.address}:${peer.port}`; if (session && session.remainingIdleTime <= 0) clear(); if (owner && owner !== key) return;
      if (!session) { session = new TCodeInputSession(config, this.options.external, `udp:${key}`, this.options.now); if (!session.tryAcquire().ok) { clear(); return; } owner = key; active = { session, pendingAt: null }; this.#connections.add(active); }
      if (!data.length || data.length > maximumTCodeLineBytes || data[data.length - 1] !== 10 && data[data.length - 1] !== 13) { clear(); return; }
      try { const framer = new TCodeLineFramer(); for (const line of framer.push(data)) { const reply = session.processLine(line); if (reply) socket.send(reply, peer.port, peer.address); if (reply.startsWith('ERR ')) { clear(); break; } } }
      catch { clear(); }
    });
    socket.on('error', error => this.options.log?.(`Protocol UDP error: ${error.message}`));
    this.#closers.push(async () => { clear(); await new Promise<void>(resolve => socket.close(() => resolve())); }); this.#mark(config, port);
  }
  async #serial(config: ProtocolInputConfig): Promise<void> {
    const factory = this.options.serialFactory ?? (await import('./serial-input.ts')).openSerialInput;
    const stream = await factory(config); this.#attachTCode(config, stream, `serial:${randomUUID()}`);
    const snapshot = this.#snapshot.get(config.id); stream.once('close', () => { if (snapshot) snapshot.running = false; });
    this.#closers.push(async () => { stream.destroy(); }); this.#mark(config, config.port);
  }
  async #device(config: ProtocolInputConfig): Promise<void> {
    const address = new URL(config.address); if (!['ws:', 'wss:'].includes(address.protocol) || address.username || address.password || address.hash) throw new Error('Configure an Intiface device endpoint without embedded credentials.');
    const session = new TCodeInputSession(config, this.options.external, `intiface-device:${randomUUID()}`, this.options.now), acquired = session.tryAcquire();
    if (!acquired.ok) throw new Error(acquired.error);
    const socket = new WebSocket(address, { handshakeTimeout: 10000, maxPayload: maximumTCodeLineBytes, perMessageDeflate: false });
    const epochs = new WebSocketMessageEpochs(() => this.#inputEpoch, maximumTCodeLineBytes);
    socket.on('upgrade', response => response.socket.prependListener('data', (chunk: Buffer) => { if (!epochs.push(chunk)) socket.terminate(); }));
    const framer = new TCodeLineFramer(), active: ActiveConnection = { session, framer, websocket: socket, pendingAt: null, pendingTimeoutMs: config.timeoutMs, checkIdle: false }; this.#connections.add(active); let lastPong = Date.now();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    socket.on('pong', () => { lastPong = Date.now(); session.heartbeat(); });
    // Attach before awaiting open: upgrade head may already contain a complete hardware frame.
    socket.on('message', (raw, binary) => {
      try { if (epochs.take() !== this.#inputEpoch) throw new Error('A pending protocol frame belongs to a cleared input generation.');
        if (!binary) throw new Error('The Intiface device channel requires binary hardware frames.'); const data = bytes(raw);
        for (const line of framer.push(data)) { const response = session.processLine(line); if (response && !sendWebSocket(socket, Buffer.from(response, 'ascii'), true)) { session.dispose(); break; } }
        active.pendingAt = framer.pendingBytes ? active.pendingAt ?? (this.options.now ?? Date.now)() : null;
      } catch { session.stop(); if (socket.readyState === WebSocket.OPEN) sendWebSocket(socket, Buffer.from('ERR invalid TCode frame\n'), true); }
    });
    const snapshot = this.#snapshot.get(config.id);
    socket.on('error', () => socket.terminate()); socket.once('close', () => { if (heartbeat) clearInterval(heartbeat); heartbeat = undefined; session.dispose(); this.#connections.delete(active); if (snapshot) snapshot.running = false; });
    this.#closers.push(async () => { if (heartbeat) clearInterval(heartbeat); session.dispose(); socket.terminate(); });
    socket.once('open', () => socket.send(JSON.stringify({ identifier: config.identifier || config.name, address: config.id, version: 0 })));
    try { await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); }); }
    catch (error) { session.dispose(); socket.terminate(); throw error; }
    if (socket.readyState !== WebSocket.OPEN) { session.dispose(); socket.terminate(); throw new Error('The Intiface device connection closed during startup.'); }
    heartbeat = setInterval(() => { if (socket.readyState !== WebSocket.OPEN || Date.now() - lastPong >= config.timeoutMs) { socket.terminate(); return; } session.heartbeat(); socket.ping(); }, Math.max(50, Math.min(1000, config.timeoutMs / 3))); heartbeat.unref();
    this.#mark(config, config.port);
  }

  #mark(config: ProtocolInputConfig, port: number): void { const snapshot = this.#snapshot.get(config.id); if (snapshot) { snapshot.port = port; snapshot.running = true; } if (port !== config.port) this.options.onPortChanged?.([config.id], port); }
  #tick(): void {
    for (const input of [...this.#http.values(), ...this.#vendor.values()]) { try { input.tick(); } catch (error) { input.resetCommands(); this.options.log?.(`Protocol task stopped: ${error instanceof Error ? error.message : 'unknown error'}`); } }
    for (const connection of this.#connections) {
      const budget = connection.checkIdle === false ? undefined : connection.session instanceof ButtplugInputSession ? connection.session.remainingActivityTime : connection.session.remainingIdleTime;
      const pendingExpired = connection.pendingAt !== null && connection.pendingTimeoutMs !== undefined
        && (this.options.now ?? Date.now)() - connection.pendingAt >= connection.pendingTimeoutMs;
      if (budget !== undefined && budget <= 0 || pendingExpired) { connection.session.dispose(); connection.stream?.destroy(); connection.websocket?.terminate(); this.#connections.delete(connection); }
    }
    if (this.options.external instanceof ExternalControlStore) this.options.external.expire();
  }
  resetCommands(): void { this.#inputEpoch++; for (const input of [...this.#http.values(), ...this.#vendor.values()]) input.resetCommands(); for (const connection of this.#connections) { connection.framer?.reset(); connection.pendingAt = null; connection.session.resetCommands?.(); } }
  snapshot(): InputListenerSnapshot[] { return [...this.#snapshot.values()].map(value => ({ ...value })); }
  async #stop(): Promise<void> {
    for (const input of [...this.#http.values(), ...this.#vendor.values()]) input.dispose(); this.#http.clear(); this.#vendor.clear();
    for (const connection of this.#connections) { connection.session.dispose(); connection.stream?.destroy(); connection.websocket?.terminate(); } this.#connections.clear();
    for (const close of this.#closers.splice(0)) await close();
    for (const group of this.#groups) if (group.owned && group.server.listening) await closeServer(group.server);
    this.#groups = []; this.#snapshot.clear();
  }
  async dispose(): Promise<void> { if (this.#disposed) return; this.#disposed = true; clearInterval(this.#timer); await this.#reload.catch(() => undefined); await this.#stop(); this.#wss.close(); if (this.options.external instanceof ExternalControlStore) this.options.external.onCommandsCleared.delete(this.#clear); }
}
export async function createInputCoordinator(inputs: readonly ProtocolInputConfig[], options: InputCoordinatorOptions): Promise<InputCoordinator> {
  const coordinator = new InputCoordinator(options); try { await coordinator.reload(inputs); return coordinator; } catch (error) { await coordinator.dispose(); throw error; }
}
export { normalizeInputPath };
