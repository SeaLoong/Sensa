import { randomBytes, timingSafeEqual } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { lstat, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { createServer, createConnection, type Server, type Socket } from 'node:net';
import lockfile from 'proper-lockfile';
import { instanceKey } from './launch.ts';

interface OwnerMetadata { token: string; endpoint: string; processId: number; }
export interface InstanceReply { ok: true; url: string; }
export interface InstanceOptions {
  privateDirectory?: string;
  onCompromised(error: Error): void;
}
function defaultIpcDirectory(): string {
  if (process.platform === 'win32') return join(homedir(), '.sensa', 'ipc');
  const name = `sensa-ipc-${process.getuid?.() ?? 'user'}`, candidate = join(tmpdir(), name);
  // Unix-domain socket names have a small byte limit, even when the selected
  // home/configuration path supports long or Unicode user names.
  return Buffer.byteLength(candidate) <= 40 ? candidate : join('/tmp', name);
}
async function privateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Instance IPC directory is not a regular directory.');
  if (process.platform !== 'win32' && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())) throw new Error('Instance IPC directory must be private to the current user.');
}
function isMetadata(value: unknown): value is OwnerMetadata {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row['token'] === 'string' && /^[0-9a-f]{64}$/.test(row['token'])
    && typeof row['endpoint'] === 'string' && Number.isSafeInteger(row['processId']);
}
/** Cross-platform lease lock plus authenticated same-user local IPC. */
export class DesktopInstanceCoordinator {
  private server: Server | undefined;
  private readonly clients = new Set<Socket>();
  private closed = false;
  private readonly release: () => Promise<void>;
  private readonly metadataPath: string;
  private readonly endpoint: string;
  private readonly token: string;
  private readonly stillOwned: () => boolean;
  private constructor(release: () => Promise<void>, metadataPath: string, endpoint: string, token: string, stillOwned: () => boolean) {
    this.release = release; this.metadataPath = metadataPath; this.endpoint = endpoint; this.token = token; this.stillOwned = stillOwned;
  }
  static async acquire(configPath: string, options: InstanceOptions): Promise<DesktopInstanceCoordinator | null> {
    await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
    let lost = false;
    let release: () => Promise<void>;
    try {
      release = await lockfile.lock(configPath, { realpath: false, lockfilePath: `${configPath}.node.lock`,
        stale: 30_000, update: 10_000, retries: 0, onCompromised: error => { lost = true; options.onCompromised(error); } });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ELOCKED') return null;
      throw error;
    }
    try {
      const directory = options.privateDirectory ?? defaultIpcDirectory();
      await privateDirectory(directory);
      const key = instanceKey(configPath), token = randomBytes(32).toString('hex');
      // A unique socket belongs to this lease, so a compromised old owner's
      // close can never unlink the replacement owner's listening endpoint.
      const socketName = `sensa-${key.slice(0, 32)}-${token.slice(0, 16)}`;
      const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\${socketName}` : join(directory, `${socketName}.sock`);
      const metadataPath = join(directory, `${key}.json`);
      // Only the exclusive lease owner can replace stale IPC resources.
      if (process.platform !== 'win32') await unlink(endpoint).catch(error => { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; });
      return new DesktopInstanceCoordinator(release, metadataPath, endpoint, token, () => !lost);
    } catch (error) { await release(); throw error; }
  }
  async start(notify: (open: boolean) => Promise<string> | string): Promise<void> {
    if (this.server) throw new Error('Instance coordination has already started.');
    this.server = createServer(socket => {
      this.clients.add(socket); socket.setTimeout(3_000, () => socket.destroy());
      let text = '', handled = false;
      socket.on('error', () => {});
      socket.on('close', () => this.clients.delete(socket));
      socket.on('data', bytes => {
        if (handled) return;
        text += bytes.toString('utf8');
        if (Buffer.byteLength(text) > 512) { socket.destroy(); return; }
        const line = text.indexOf('\n'); if (line < 0) return;
        handled = true;
        void (async () => {
          let row: unknown;
          try { row = JSON.parse(text.slice(0, line)); } catch { socket.destroy(); return; }
          if (!row || typeof row !== 'object') { socket.destroy(); return; }
          const command = row as Record<string, unknown>, token = command['token'];
          if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token) || typeof command['open'] !== 'boolean'
            || !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(this.token, 'hex'))) { socket.destroy(); return; }
          try { socket.end(JSON.stringify({ ok: true, url: await notify(command['open']) }) + '\n'); }
          catch { socket.destroy(); }
        })();
      });
    });
    const server = this.server;
    await new Promise<void>((resolve, reject) => {
      const error = (failure: Error): void => reject(failure);
      server.once('error', error); server.listen(this.endpoint, () => { server.off('error', error); resolve(); });
    });
    server.on('error', () => { /* A bound IPC server remains owned until coordinated shutdown. */ });
    const temporary = `${this.metadataPath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify({ token: this.token, endpoint: this.endpoint, processId: process.pid })); }
    finally { await handle.close(); }
    const { rename } = await import('node:fs/promises');
    await rename(temporary, this.metadataPath);
  }
  static async notifyOwner(configPath: string, openBrowser: boolean, options: { privateDirectory?: string; timeoutMs?: number } = {}): Promise<InstanceReply | null> {
    const directory = options.privateDirectory ?? defaultIpcDirectory();
    await privateDirectory(directory);
    const metadataPath = join(directory, `${instanceKey(configPath)}.json`), deadline = Date.now() + (options.timeoutMs ?? 12_000);
    do {
      try {
        const info = await lstat(metadataPath);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 1_024 || process.platform !== 'win32' && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())) throw new Error('Invalid instance IPC metadata.');
        const metadata: unknown = JSON.parse(await readFile(metadataPath, 'utf8'));
        if (!isMetadata(metadata)) throw new Error('Invalid instance IPC metadata.');
        const socketName = `sensa-${instanceKey(configPath).slice(0, 32)}-${metadata.token.slice(0, 16)}`;
        const expected = process.platform === 'win32' ? `\\\\.\\pipe\\${socketName}` : join(directory, `${socketName}.sock`);
        if (metadata.endpoint !== expected) throw new Error('Unexpected instance IPC endpoint.');
        const reply = await new Promise<InstanceReply | null>(resolve => {
          const socket = createConnection(metadata.endpoint); let text = '', settled = false;
          const finish = (value: InstanceReply | null): void => { if (!settled) { settled = true; socket.destroy(); resolve(value); } };
          socket.setTimeout(Math.min(1_000, Math.max(1, deadline - Date.now())), () => finish(null));
          socket.on('error', () => finish(null)); socket.on('close', () => finish(null));
          socket.on('connect', () => socket.write(JSON.stringify({ token: metadata.token, open: openBrowser }) + '\n'));
          socket.on('data', data => {
            text += data.toString('utf8'); if (Buffer.byteLength(text) > 1_024) { finish(null); return; }
            if (!text.includes('\n')) return;
            try { const value: unknown = JSON.parse(text.split('\n')[0]!); const row = value as Record<string, unknown>; finish(row['ok'] === true && typeof row['url'] === 'string' ? { ok: true, url: row['url'] } : null); }
            catch { finish(null); }
          });
        });
        if (reply) return reply;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    return null;
  }
  async close(): Promise<void> {
    if (this.closed) return; this.closed = true;
    for (const client of this.clients) client.destroy();
    if (this.server) await new Promise<void>(resolve => this.server!.close(() => resolve()));
    if (this.stillOwned()) {
      await unlink(this.metadataPath).catch(() => {});
      await this.release();
    }
  }
}
