import { constants } from 'node:fs';
import { mkdir, open, readFile, rename, unlink, lstat, realpath } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';

/** Atomic writes leave the previous configuration intact on validation or I/O errors. */
export class AtomicConfigurationStore<T> {
  private tail: Promise<void> = Promise.resolve();
  readonly path: string;
  private readonly normalize: (value: unknown) => T;
  private readonly canWrite: () => boolean;
  constructor(path: string, normalize: (value: unknown) => T, canWrite: () => boolean = () => true) { this.path = path; this.normalize = normalize; this.canWrite = canWrite; }
  async load(defaults: () => T): Promise<T> {
    let text: string;
    try { text = await readFile(this.path, 'utf8'); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return defaults(); throw error; }
    let parsed: unknown;
    try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch { throw new Error('Configuration JSON is invalid.'); }
    return this.normalize(parsed);
  }
  async save(value: T): Promise<void> {
    // Validate before acquiring the mutation queue or creating any file.
    const data = JSON.stringify(this.normalize(value), null, 2) + '\n';
    const operation = this.tail.then(async () => {
      if (!this.canWrite()) throw new Error('Configuration ownership was lost.');
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temporary = `${this.path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
      let handle;
      try {
        handle = await open(temporary, 'wx', 0o600);
        await handle.writeFile(data, 'utf8'); await handle.sync(); await handle.close(); handle = undefined;
        if (!this.canWrite()) throw new Error('Configuration ownership was lost.');
        await rename(temporary, this.path);
      } finally {
        await handle?.close().catch(() => {});
        await unlink(temporary).catch(error => { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; });
      }
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}

export interface RecordingFile { fileName: string; size: number; modifiedAt: string; }
/** File names from API requests never select directories or symbolic links. */
export class RecordingStore {
  readonly directory: string;
  constructor(directory: string) { this.directory = directory; }
  resolveFile(name: string): string {
    if (!name || name.length > 255 || name !== basename(name) || name === '.' || name === '..'
      || /[\\/<>:"|?*]/.test(name) || [...name].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || isAbsolute(name)
      || !['.funscript', '.jsonl', '.csv'].includes(extname(name))
      || /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:[ .]|$)/i.test(name)) throw new Error('Invalid recording file name.');
    const full = resolve(this.directory, name);
    if (relative(resolve(this.directory), full).startsWith('..')) throw new Error('Invalid recording path.');
    return full;
  }
  async read(name: string, maximum = 64 * 1024 * 1024): Promise<Uint8Array> {
    if (!Number.isSafeInteger(maximum) || maximum < 0 || maximum > 64 * 1024 * 1024) throw new Error('Invalid recording size limit.');
    const full = this.resolveFile(name);
    const handle = await open(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > maximum) throw new Error('Recording is not a regular file or exceeds the size limit.');
      // O_NOFOLLOW is unavailable on Windows; validate the resolved handle path's
      // directory boundary as well, before reading its contents.
      const [actual, root] = await Promise.all([realpath(full), realpath(this.directory)]);
      if (dirname(actual) !== root) throw new Error('Recording is outside its directory.');
      const pathname = await lstat(full);
      if (!pathname.isFile() || pathname.isSymbolicLink() || pathname.dev !== info.dev || pathname.ino !== info.ino) throw new Error('Recording changed while it was being opened.');
      // A local recorder can extend the same inode after stat(). Bound every
      // read as well, allowing one sentinel byte to detect that growth.
      const chunks: Buffer[] = []; let length = 0;
      while (true) {
        const chunk = Buffer.allocUnsafe(Math.min(65536, maximum + 1 - length));
        const read = await handle.read(chunk, 0, chunk.length, null);
        if (!read.bytesRead) break;
        length += read.bytesRead;
        if (length > maximum) throw new Error('Recording exceeds the size limit.');
        chunks.push(chunk.subarray(0, read.bytesRead));
      }
      return Buffer.concat(chunks, length);
    } finally { await handle.close(); }
  }
  async write(name: string, content: string): Promise<string> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = this.resolveFile(name);
    const handle = await open(path, 'wx', 0o600);
    try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    return name;
  }
  async list(): Promise<RecordingFile[]> {
    const { readdir } = await import('node:fs/promises');
    let entries;
    try { entries = await readdir(this.directory, { withFileTypes: true }); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []; throw error; }
    const files: RecordingFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !['.funscript', '.jsonl', '.csv'].includes(extname(entry.name))) continue;
      const info = await lstat(this.resolveFile(entry.name));
      if (!info.isFile() || info.isSymbolicLink()) continue;
      files.push({ fileName: entry.name, size: info.size, modifiedAt: info.mtime.toISOString() });
    }
    return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 200);
  }
}
