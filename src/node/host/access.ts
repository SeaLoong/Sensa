import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

export interface AccessResponse {
  writeHead(status: number, headers?: Record<string, string>): unknown;
  setHeader(name: string, value: string): unknown;
  end(): unknown;
}

export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  if (isIP(address) === 4) return address.startsWith('127.');
  if (isIP(address) !== 6) return false;
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  if (canonical === '::1') return true;
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/i.exec(canonical);
  return !!mapped && (Number.parseInt(mapped[1]!, 16) >>> 8) === 127;
}
export function constantTimeCredential(value: string | undefined, expected: string): boolean {
  const digest = (text: string) => createHash('sha256').update(text).digest();
  return value !== undefined && timingSafeEqual(digest(value), digest(expected));
}
function authority(value: string | undefined, scheme: string): URL | null {
  if (!value || /[\s,\\]/.test(value)) return null;
  try {
    const parsed = new URL(`${scheme}//${value}`);
    return parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash ? null : parsed;
  } catch { return null; }
}
function cookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index >= 0 && part.slice(0, index).trim() === name) {
      try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}
/** Management API authentication; protocol listeners have their own public contracts. */
export class LocalAccessPolicy {
  private readonly session = randomBytes(32).toString('hex').toUpperCase();
  private readonly remoteToken: string | undefined;
  constructor(remoteToken: string | undefined = process.env['SENSA_ACCESS_TOKEN']) { this.remoteToken = remoteToken; }
  private remoteCredential(request: IncomingMessage): boolean {
    if (!this.remoteToken) return false;
    const header = request.headers.authorization ?? '';
    if (header.startsWith('Bearer ')) return constantTimeCredential(header.slice(7), this.remoteToken);
    if (!header.startsWith('Basic ')) return false;
    const encoded = header.slice(6);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return false;
    const text = Buffer.from(encoded, 'base64').toString('utf8');
    const separator = text.indexOf(':');
    return separator >= 0 && constantTimeCredential(text.slice(separator + 1), this.remoteToken);
  }
  authorize(request: IncomingMessage, response: AccessResponse, path: string): boolean {
    const secure = 'encrypted' in request.socket && request.socket.encrypted === true;
    const scheme = secure ? 'https:' : 'http:';
    const host = authority(request.headers.host, scheme);
    const local = isLoopback(request.socket.remoteAddress);
    const hostname = host?.hostname.replace(/^\[|\]$/g, '');
    if (!host || (local && hostname !== 'localhost' && !isLoopback(hostname))) {
      response.writeHead(403); response.end(); return false;
    }
    const origin = request.headers.origin;
    if (origin) {
      let parsed: URL;
      try { parsed = new URL(origin); } catch { response.writeHead(403); response.end(); return false; }
      if (parsed.origin !== host.origin || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        response.writeHead(403); response.end(); return false;
      }
    }
    if (request.headers['sec-fetch-site'] === 'cross-site') { response.writeHead(403); response.end(); return false; }
    const name = `SensaSession_${request.socket.localPort ?? host.port ?? (secure ? 443 : 80)}`;
    const authorized = constantTimeCredential(cookie(request.headers.cookie, name), this.session) || this.remoteCredential(request);
    if (!local && !authorized) {
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Sensa (password: SENSA_ACCESS_TOKEN)"' }); response.end(); return false;
    }
    if (path === '/api/session' && request.method === 'GET') {
      response.writeHead(204, { 'Set-Cookie': `${name}=${this.session}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`, 'Cache-Control': 'no-store' });
      response.end(); return false;
    }
    if ((path === '/api' || path.startsWith('/api/')) && !authorized) { response.writeHead(401); response.end(); return false; }
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY'); response.setHeader('Referrer-Policy', 'no-referrer');
    return true;
  }
}
