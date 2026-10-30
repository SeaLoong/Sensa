import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { ApplicationFacade, record } from '../../core/runtime/application.ts';
import { parseStrictJson } from '../../core/protocols/strict-json.ts';
import { LocalAccessPolicy, type AccessResponse } from './access.ts';
import { BrowserPagePresence } from './presence.ts';
import { RecordingStore } from './storage.ts';
import { RealtimeWriter } from './realtime.ts';
import { buildWebUiUrls } from './launch.ts';

const MAX_BODY = 4 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });
export class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
export interface ManagementServerOptions {
  application: ApplicationFacade;
  presence: BrowserPagePresence;
  recordings: RecordingStore;
  resource(name: string): Uint8Array | undefined;
  instanceInfo(): Record<string, unknown>;
  access?: LocalAccessPolicy;
  protocolHttp?(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
  protocolUpgrade?(request: IncomingMessage, socket: Duplex, head: Buffer): boolean;
  log?(message: string): void;
}
export function readRequestBody(request: IncomingMessage, maximum = MAX_BODY): Promise<Buffer> {
  const length = request.headers['content-length'];
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) return Promise.reject(new HttpError(413, 'Request exceeds 4 MiB.'));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let count = 0;
    const cleanup = (): void => { request.off('data', data); request.off('end', end); request.off('error', error); request.off('aborted', aborted); };
    const error = (failure: Error): void => { cleanup(); reject(failure); };
    const aborted = (): void => error(new HttpError(400, 'Request body was interrupted.'));
    const data = (chunk: Buffer): void => {
      count += chunk.length;
      if (count > maximum) { request.pause(); cleanup(); reject(new HttpError(413, 'Request exceeds 4 MiB.')); return; }
      chunks.push(chunk);
    };
    const end = (): void => { cleanup(); resolve(Buffer.concat(chunks, count)); };
    request.on('data', data); request.once('end', end); request.once('error', error); request.once('aborted', aborted);
  });
}
/** Minimal bounded multipart framing for the one supported funscript upload. */
export function parseScriptMultipart(body: Buffer, contentType: string): Record<string, unknown> {
  const boundary = /(?:^|;)\s*boundary=(?:"([^"\r\n]+)"|([^;\s]+))/i.exec(contentType);
  const separator = boundary?.[1] ?? boundary?.[2];
  if (!separator || separator.length > 70 || /[^\x21-\x7e]/.test(separator)) throw new HttpError(400, 'Invalid multipart boundary.');
  const marker = Buffer.from(`--${separator}`), endMarker = Buffer.from(`\r\n--${separator}`);
  if (!body.subarray(0, marker.length).equals(marker)) throw new HttpError(400, 'Invalid multipart framing.');
  let at = marker.length; const fields = new Map<string, string>(); let fileName: string | undefined, content: string | undefined, parts = 0, terminated = false;
  while (at < body.length) {
    if (body.subarray(at, at + 2).toString() === '--') {
      const trailer = body.subarray(at + 2).toString('ascii');
      if (trailer !== '' && trailer !== '\r\n') throw new HttpError(400, 'Invalid multipart trailer.');
      terminated = true; break;
    }
    if (++parts > 8 || body.subarray(at, at + 2).toString() !== '\r\n') throw new HttpError(400, 'Invalid multipart framing.');
    at += 2; const headersEnd = body.indexOf('\r\n\r\n', at);
    if (headersEnd < 0 || headersEnd - at > 8192) throw new HttpError(400, 'Invalid multipart headers.');
    const headers = body.subarray(at, headersEnd).toString('utf8'), disposition = /^content-disposition:\s*form-data;([^\r\n]*)$/im.exec(headers);
    if (!disposition) throw new HttpError(400, 'Missing multipart disposition.');
    const name = /(?:^|;)\s*name="([^"\r\n]*)"/.exec(disposition[1]!)?.[1];
    const uploadedName = /(?:^|;)\s*filename="([^"\r\n]*)"/.exec(disposition[1]!)?.[1];
    const start = headersEnd + 4, next = body.indexOf(endMarker, start);
    if (!name || next < 0) throw new HttpError(400, 'Incomplete multipart body.');
    const value = utf8.decode(body.subarray(start, next));
    if (name === 'file' && uploadedName !== undefined) {
      if (fileName !== undefined) throw new HttpError(400, 'Only one script file is supported.');
      fileName = uploadedName.split(/[\\/]/).at(-1); content = value;
    } else { if (fields.has(name)) throw new HttpError(400, 'Duplicate multipart field.'); fields.set(name, value); }
    at = next + 2 + marker.length;
  }
  if (!terminated) throw new HttpError(400, 'Incomplete multipart body.');
  if (!fileName || !content) throw new HttpError(400, 'Select a script file first. / 请先选择脚本文件。');
  const speed = fields.has('speed') ? Number(fields.get('speed')) : 1;
  if (!Number.isFinite(speed)) throw new HttpError(400, 'Invalid script speed.');
  return { fileName, content, loop: fields.get('loop') === 'true', speed, ...(fields.has('axis') ? { axis: fields.get('axis') } : {}) };
}
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
function json(response: ServerResponse, status: number, data: unknown, head = false): void {
  const body = Buffer.from(JSON.stringify(data)); response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' }); response.end(head ? undefined : body);
}
function requestPath(request: IncomingMessage): URL {
  const value = request.url ?? '/';
  if (!value.startsWith('/') || value.startsWith('//') || [...value].some(character => character.charCodeAt(0) <= 32)) throw new HttpError(400, 'Invalid request target.');
  return new URL(value, 'http://sensa.local');
}
function byteData(data: RawData): Buffer { return Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? Buffer.from(data) : data; }

export class ManagementServer {
  readonly server: Server;
  private readonly options: ManagementServerOptions;
  private readonly access: LocalAccessPolicy;
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY, perMessageDeflate: false });
  private readonly clients = new Map<WebSocket, RealtimeWriter>();
  private dirty = true;
  private cached: string | null = null;
  private readonly stateTimer: ReturnType<typeof setInterval>;
  private readonly pingTimer: ReturnType<typeof setInterval>;
  private closed = false;
  constructor(options: ManagementServerOptions) {
    this.options = options; this.access = options.access ?? new LocalAccessPolicy();
    this.server = createServer((request, response) => { void this.handle(request, response); });
    this.server.maxHeadersCount = 100; this.server.headersTimeout = 10_000; this.server.requestTimeout = 15_000; this.server.keepAliveTimeout = 5_000;
    this.server.on('upgrade', (request, socket, head) => this.upgrade(request, socket, head));
    this.stateTimer = setInterval(() => {
      if (!this.dirty || this.closed) return; this.dirty = false; this.cached = null;
      for (const writer of this.clients.values()) writer.state(() => this.stateEnvelope());
    }, 100); this.stateTimer.unref();
    this.pingTimer = setInterval(() => { for (const socket of this.clients.keys()) if (socket.readyState === WebSocket.OPEN) socket.ping(); }, 10_000); this.pingTimer.unref();
  }
  get connectionCount(): number { return this.clients.size; }
  notify(): void { this.dirty = true; }
  private stateEnvelope(): string { return this.cached ??= JSON.stringify(this.options.application.envelope()); }
  async listen(host: string, port: number, resolveConflict = true): Promise<{ url: string; port: number }> {
    const addresses = buildWebUiUrls(host, port);
    const bind = (candidate: number): Promise<number> => new Promise((resolve, reject) => {
      const fail = (error: Error): void => { this.server.off('listening', ready); reject(error); };
      const ready = (): void => { this.server.off('error', fail); const address = this.server.address(); if (!address || typeof address === 'string') reject(new Error('Management listener has no network address.')); else resolve(address.port); };
      this.server.once('error', fail); this.server.once('listening', ready); this.server.listen({ host: addresses.listenHost, port: candidate });
    });
    let actual: number;
    try { actual = await bind(port); }
    catch (error) { if (!resolveConflict || !(error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') || port === 0) throw error; actual = await bind(0); }
    this.server.on('error', error => this.options.log?.(`[WebUI] ${error.message}`));
    return { url: buildWebUiUrls(host, actual).browserUrl, port: actual };
  }
  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (this.closed) { response.writeHead(503); response.end(); return; }
      const url = requestPath(request), path = decodeURIComponent(url.pathname);
      if (!path.startsWith('/api/') && path !== '/api' && await this.options.protocolHttp?.(request, response)) return;
      if (!this.access.authorize(request, response, path)) return;
      if (request.method === 'GET' && path === '/api/instance') { json(response, 200, this.options.instanceInfo()); return; }
      if (request.method === 'POST' && path === '/api/ui/presence') {
        const data = record(parseStrictJson(utf8.decode(await readRequestBody(request)), 64));
        response.writeHead(this.options.presence.update(data['id'], data['open'], data['revision'] ?? 0) ? 204 : 400); response.end(); return;
      }
      const download = /^\/api\/output\/recordings\/([^/]+)\/download$/.exec(path);
      if ((request.method === 'GET' || request.method === 'HEAD') && download) { await this.download(request, response, download[1]!); return; }
      if (path === '/api/ws') { response.writeHead(400); response.end(); return; }
      if (path === '/api' || path.startsWith('/api/')) {
        const payload = ['GET', 'HEAD'].includes(request.method ?? '') ? Buffer.alloc(0) : await readRequestBody(request);
        const contentType = request.headers['content-type'] ?? '';
        const value = !payload.length ? undefined : request.method === 'POST' && path === '/api/input/script/load' && /^multipart\/form-data(?:;|$)/i.test(contentType)
          ? parseScriptMultipart(payload, contentType) : parseStrictJson(utf8.decode(payload), 64);
        const result = await this.options.application.execute(request.method ?? 'GET', path, value);
        json(response, result.statusCode, result.data, request.method === 'HEAD'); return;
      }
      if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405); response.end(); return; }
      if (path === '/websensa') { response.writeHead(301, { Location: `/websensa/${url.search}` }); response.end(); return; }
      const name = path === '/' ? 'index.html' : path === '/websensa/' ? 'websensa/index.html' : path.slice(1);
      const data = this.options.resource(name);
      if (!data) { response.writeHead(404); response.end(); return; }
      const extension = /\.[^./]+$/.exec(name)?.[0] ?? '';
      response.setHeader('Content-Type', mime[extension] ?? 'application/octet-stream'); response.setHeader('Content-Length', data.length);
      if (extension === '.html' || /(?:app\.bundle\.(?:css|js)|realtime-worker\.bundle\.js|styles\.css)$/.test(name)) {
        response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); response.setHeader('Pragma', 'no-cache'); response.setHeader('Expires', '0');
      }
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      const status = error instanceof HttpError ? error.status : error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 404 : 400;
      if (status === 413) response.setHeader('Connection', 'close');
      json(response, status, { ok: false, error: error instanceof Error ? error.message : 'Request failed.' });
      if (status === 413) response.once('finish', () => request.destroy());
    }
  }
  private async download(request: IncomingMessage, response: ServerResponse, name: string): Promise<void> {
    const bytes = await this.options.recordings.read(name); let start = 0, end = bytes.length - 1, status = 200;
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || !bytes.length || !match[1] && !match[2]) { response.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); response.end(); return; }
      if (match[1]) { start = Number(match[1]); end = match[2] ? Math.min(end, Number(match[2])) : end; }
      else start = Math.max(0, bytes.length - Number(match[2]));
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= bytes.length || end < start) { response.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); response.end(); return; }
      status = 206; response.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
    }
    response.setHeader('Accept-Ranges', 'bytes'); response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    response.setHeader('Content-Length', bytes.length ? end - start + 1 : 0); response.writeHead(status);
    response.end(request.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
  }
  private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    let path: string;
    try { path = decodeURIComponent(requestPath(request).pathname); } catch { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return; }
    if (path !== '/api/ws') {
      if (!this.options.protocolUpgrade?.(request, socket, head)) socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return;
    }
    let status = 200; const headers: Record<string, string> = {};
    const response: AccessResponse = { writeHead: (value, values) => { status = value; Object.assign(headers, values); }, setHeader: (key, value) => { headers[key] = value; },
      end: () => { socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n${Object.entries(headers).map(([key, value]) => `${key}: ${value}\r\n`).join('')}\r\n`); } };
    if (!this.access.authorize(request, response, path)) return;
    if (this.closed || this.clients.size >= 16) { socket.end(`HTTP/1.1 ${this.closed ? 503 : 429} Unavailable\r\nConnection: close\r\n\r\n`); return; }
    this.wss.handleUpgrade(request, socket, head, peer => this.accept(peer));
  }
  private accept(peer: WebSocket): void {
    const writer = new RealtimeWriter(peer); this.clients.set(peer, writer); this.notify(); writer.state(() => this.stateEnvelope());
    let pending = Promise.resolve(), commands = 0, queuedBytes = 0;
    peer.on('message', (data, binary) => {
      if (binary) { peer.close(1003, 'Use JSON text commands.'); return; }
      const payload = byteData(data);
      if (++commands > 128 || (queuedBytes += payload.length) > 8 * 1024 * 1024) { peer.close(1013, 'Command queue is full.'); return; }
      pending = pending.then(async () => {
        if (writer.isStopped || this.closed) return;
        let id = '';
        try {
          const command = record(parseStrictJson(utf8.decode(payload), 64));
          if (command['id'] !== undefined) { if (typeof command['id'] !== 'string' || command['id'].length > 100) throw new Error('Invalid command identifier.'); id = command['id']; }
          if (typeof command['method'] !== 'string' || typeof command['path'] !== 'string') throw new Error('Command method and path are required.');
          const result = await this.options.application.execute(command['method'], command['path'], command['body']);
          if (!writer.isStopped) await writer.reply(JSON.stringify({ id, ok: result.success, data: result.data }));
        } catch (error) {
          if (!writer.isStopped) await writer.reply(JSON.stringify({ id, ok: false, data: { error: error instanceof Error ? error.message : 'Command failed.' } }));
        }
      }).catch(() => peer.terminate()).finally(() => { commands--; queuedBytes -= payload.length; });
    });
    peer.on('error', () => peer.terminate()); peer.once('close', () => { writer.stop(); this.clients.delete(peer); this.notify(); });
  }
  async close(): Promise<void> {
    if (this.closed) return; this.closed = true; clearInterval(this.stateTimer); clearInterval(this.pingTimer);
    for (const [socket, writer] of this.clients) { writer.stop(); socket.close(1001, 'Service shutting down'); }
    await new Promise(resolve => setTimeout(resolve, this.clients.size ? 200 : 0));
    for (const socket of this.clients.keys()) socket.terminate(); this.clients.clear();
    this.wss.close();
    this.server.closeAllConnections();
    await new Promise<void>(resolve => { if (!this.server.listening) { resolve(); return; } this.server.close(() => resolve()); });
  }
}
