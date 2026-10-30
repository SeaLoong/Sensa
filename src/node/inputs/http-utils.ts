import { createHash, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { maximumProtocolScriptBytes, parseProtocolScript } from '../../core/protocols/script-input.ts';
import type { ProtocolScriptTrajectory } from '../../core/protocols/script-input.ts';
import { jsonObject, parseStrictJson } from '../../core/protocols/strict-json.ts';

export class InputHttpError extends Error { readonly status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
export function requestIdentity(req: IncomingMessage, expectedToken?: string): string {
  const session = req.headers['x-sensa-session'], token = req.headers['x-device-token'];
  if (Array.isArray(session) || Array.isArray(token) || (session?.length ?? 0) > 128 || (token?.length ?? 0) > 512
    || [...((session ?? '') + (token ?? ''))].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159)) throw new InputHttpError(400, 'Invalid session identifier.');
  if (expectedToken) {
    const expected = Buffer.from(expectedToken), actual = Buffer.from(token ?? '');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new InputHttpError(401, 'The local device token is invalid.');
  }
  return `${req.socket.remoteAddress ?? 'unknown'}\n${session ?? ''}\n${expectedToken ? token ?? '' : ''}`;
}
export async function readBoundedBody(req: IncomingMessage, maximum = 65536): Promise<Uint8Array> {
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > maximum) throw new InputHttpError(413, 'Request body exceeds its size limit.');
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0; let done = false;
    const finish = (error?: Error): void => {
      if (done) return; done = true; clearTimeout(timeout); req.off('data', data); req.off('end', end); req.off('error', fail); req.off('aborted', aborted);
      if (error) reject(error); else resolve(Buffer.concat(chunks));
    };
    const data = (chunk: Buffer): void => { size += chunk.length; if (size > maximum) { req.pause(); finish(new InputHttpError(413, 'Request body exceeds its size limit.')); } else chunks.push(chunk); };
    const end = (): void => finish(); const fail = (error: Error): void => finish(error); const aborted = (): void => finish(new InputHttpError(408, 'Request body was interrupted.'));
    const timeout = setTimeout(() => { req.pause(); finish(new InputHttpError(408, 'Request body timed out.')); }, 3000); timeout.unref();
    req.on('data', data); req.once('end', end); req.once('error', fail); req.once('aborted', aborted);
    if (req.readableEnded) finish();
  });
}
export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const type = req.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
  if (type && type !== 'application/json') throw new InputHttpError(415, 'Use application/json for commands.');
  const bytes = await readBoundedBody(req);
  try { return jsonObject(parseStrictJson(bytes.length ? new TextDecoder('utf-8', { fatal: true }).decode(bytes) : '{}')); }
  catch (error) { throw new InputHttpError(400, error instanceof Error ? error.message : 'Malformed JSON.'); }
}
export async function readScriptFile(req: IncomingMessage): Promise<Uint8Array> {
  const type = req.headers['content-type'] ?? '', match = /^multipart\/form-data\s*;\s*boundary=(?:"([^"\r\n]{1,72})"|([^;\s]{1,72}))\s*$/i.exec(type), boundary = match?.[1] ?? match?.[2];
  if (!boundary) throw new InputHttpError(415, 'Use multipart/form-data with one file part.');
  const bytes = Buffer.from(await readBoundedBody(req, maximumProtocolScriptBytes + 65536));
  const first = Buffer.from(`--${boundary}\r\n`), end = Buffer.from(`\r\n--${boundary}--`);
  if (!bytes.subarray(0, first.length).equals(first)) throw new InputHttpError(400, 'Invalid multipart boundary.');
  const headerEnd = bytes.indexOf('\r\n\r\n', first.length), fileEnd = bytes.indexOf(end, headerEnd + 4);
  if (headerEnd < 0 || headerEnd - first.length > 16384 || fileEnd < 0
    || !/^(?:\r\n)?$/.test(bytes.subarray(fileEnd + end.length).toString('ascii'))) throw new InputHttpError(400, 'Upload exactly one file part.');
  const headers = bytes.subarray(first.length, headerEnd).toString('utf8');
  if (!/^content-disposition:\s*form-data;[^\r\n]*\bname="file"(?:;|\s*$)/im.test(headers)) throw new InputHttpError(400, 'One file part named file is required.');
  const file = bytes.subarray(headerEnd + 4, fileEnd);
  if (file.length > maximumProtocolScriptBytes || file.indexOf(Buffer.from(`\r\n--${boundary}\r\n`)) >= 0) throw new InputHttpError(400, 'Upload exactly one bounded file part.');
  return file;
}
export function publicScriptAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const a = address.split('.').map(Number), first = a[0] ?? 0, second = a[1] ?? 0;
    return first > 0 && first < 224 && ![10, 127].includes(first) && !(first === 100 && second >= 64 && second <= 127)
      && !(first === 169 && second === 254) && !(first === 172 && second >= 16 && second <= 31)
      && !(first === 192 && [0, 168].includes(second)) && !(first === 198 && [18, 19].includes(second))
      && !(first === 198 && second === 51 && a[2] === 100) && !(first === 203 && second === 0 && a[2] === 113);
  }
  if (isIP(address) === 6) {
    const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase();
    if (normalized.startsWith('::ffff:')) {
      const suffix = normalized.slice(7); if (isIP(suffix) === 4) return publicScriptAddress(suffix);
      const words = suffix.split(':'); if (words.length !== 2) return false;
      const high = Number.parseInt(words[0] ?? '', 16), low = Number.parseInt(words[1] ?? '', 16);
      return publicScriptAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return /^[23][0-9a-f]{3}:/.test(normalized) && !normalized.startsWith('2001:db8:');
  }
  return false;
}
export interface ScriptDownloadOptions { signal?: AbortSignal; sha256?: string; resolve?: (host: string) => Promise<{ address: string; family: number }[]> }
export async function downloadProtocolScript(rawUrl: string, csv: boolean, options: ScriptDownloadOptions = {}): Promise<ProtocolScriptTrajectory> {
  const url = new URL(rawUrl), host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.username || url.password || url.hash || !['http:', 'https:'].includes(url.protocol)) throw new InputHttpError(400, 'Use an absolute script URL without credentials or fragments.');
  const loopback = isIP(host) === 4 && host.startsWith('127.') || host === '::1';
  if (!loopback && (url.protocol !== 'https:' || !isIP(host) && (!host.includes('.') || host.endsWith('.') || /\.(?:localhost|local|internal|test|invalid)$/i.test(host)))) throw new InputHttpError(400, 'Script hosts must be public HTTPS or literal loopback HTTP(S).');
  if (!loopback && (process.env['HTTPS_PROXY'] || process.env['https_proxy'] || process.env['HTTP_PROXY'] || process.env['http_proxy'])) throw new InputHttpError(400, 'URL imports through a proxy cannot verify the final address; upload the script file instead.');
  options.signal?.throwIfAborted();
  const deadline = Date.now() + 10000;
  const resolveAddresses = options.resolve ? options.resolve(host) : isIP(host) ? Promise.resolve([{ address: host, family: isIP(host) }]) : lookup(host, { all: true, verbatim: true });
  const addresses = await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
    const timer = setTimeout(() => finish(new InputHttpError(408, 'The script DNS request timed out.')), Math.max(1, deadline - Date.now())); timer.unref();
    const aborted = (): void => finish(new InputHttpError(408, 'The script request was cancelled.'));
    let settled = false;
    const finish = (error: unknown, result?: { address: string; family: number }[]): void => {
      if (settled) return; settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', aborted);
      if (error) reject(error); else resolve(result ?? []);
    };
    options.signal?.addEventListener('abort', aborted, { once: true }); if (options.signal?.aborted) aborted();
    resolveAddresses.then(result => finish(null, result), error => finish(error));
  });
  if (!addresses.length || addresses.length > 64 || addresses.some(row => isIP(row.address) !== row.family || (loopback ? !(row.address.startsWith('127.') || row.address === '::1') : !publicScriptAddress(row.address)))) throw new InputHttpError(400, 'The script connection resolved to a nonpublic address.');
  let bytes: Buffer | undefined, lastFailure: unknown;
  for (const pinned of addresses) {
    options.signal?.throwIfAborted(); if (Date.now() >= deadline) throw new InputHttpError(408, 'The script request timed out.');
    try {
      bytes = await new Promise<Buffer>((resolve, reject) => {
        // Dial the already-vetted literal IP while keeping the original Host and TLS identity.
        const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, { agent: false, hostname: pinned.address, family: pinned.family,
          ...(url.protocol === 'https:' && !isIP(host) ? { servername: host } : {}), headers: { Host: url.host, Accept: 'application/json,text/csv,text/plain' },
          ...(options.signal ? { signal: options.signal } : {}) }, response => {
          if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) { response.resume(); reject(new InputHttpError(400, 'Script redirects and unsuccessful responses are not supported.')); return; }
          if (Number(response.headers['content-length']) > maximumProtocolScriptBytes) { response.destroy(); reject(new InputHttpError(413, 'Script exceeds 1 MiB.')); return; }
          const chunks: Buffer[] = []; let size = 0;
          response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > maximumProtocolScriptBytes) response.destroy(new InputHttpError(413, 'Script exceeds 1 MiB.')); else chunks.push(chunk); });
          response.once('end', () => resolve(Buffer.concat(chunks))); response.once('error', reject);
        });
        const timer = setTimeout(() => request.destroy(new InputHttpError(408, 'The script request timed out.')), Math.max(1, deadline - Date.now())); timer.unref();
        request.once('close', () => clearTimeout(timer)); request.once('error', reject); request.end();
      });
      break;
    } catch (error) { if (error instanceof InputHttpError || options.signal?.aborted) throw error; lastFailure = error; }
  }
  if (!bytes) throw lastFailure instanceof Error ? lastFailure : new InputHttpError(502, 'The script server could not be reached.');
  if (options.sha256 && (!/^[a-f\d]{64}$/i.test(options.sha256) || createHash('sha256').update(bytes).digest('hex') !== options.sha256.toLowerCase())) throw new InputHttpError(400, 'Script SHA-256 does not match.');
  return parseProtocolScript(bytes, csv);
}
