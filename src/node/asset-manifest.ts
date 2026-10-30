import { createHash } from 'node:crypto';

export interface EmbeddedFile {
  readonly path: string;
  readonly asset: string;
  readonly bytes: number;
  readonly sha256: string;
}
export interface AssetReader {
  readonly isSea: () => boolean;
  readonly getAsset: (name: string) => ArrayBuffer;
}
export const maximumEmbeddedFileBytes = 64 * 1024 * 1024;
export const maximumEmbeddedTotalBytes = 512 * 1024 * 1024;

export function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid embedded manifest object.');
  return value as Record<string, unknown>;
}

/** A single canonical spelling works on all supported filesystem platforms. */
export function safeAssetPath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 1024 || /[\\<>:"|?*]/.test(value)
    || Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    throw new Error('Invalid embedded asset path.');
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
    throw new Error('Noncanonical embedded asset path.');
  return value;
}

export function readManifest(reader: AssetReader, key: string): Record<string, unknown> {
  const raw = reader.getAsset(key);
  if (raw.byteLength > 8 * 1024 * 1024) throw new Error('Embedded manifest exceeds its limit.');
  return objectValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) as unknown);
}

export function manifestFiles(manifest: Record<string, unknown>, prefix: string): readonly EmbeddedFile[] {
  if (manifest['schema'] !== 1 || !Array.isArray(manifest['files']) || manifest['files'].length > 20000)
    throw new Error('Unsupported embedded asset manifest.');
  const paths = new Set<string>(); let total = 0;
  const files = manifest['files'].map((value: unknown): EmbeddedFile => {
    const row = objectValue(value), path = safeAssetPath(row['path']);
    const asset = row['asset'], bytes = row['bytes'], digest = row['sha256'];
    if (paths.has(path.toLowerCase()) || asset !== prefix + path || typeof bytes !== 'number'
      || !Number.isSafeInteger(bytes) || bytes < 0 || bytes > maximumEmbeddedFileBytes
      || typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest))
      throw new Error('Duplicate or invalid embedded file record.');
    paths.add(path.toLowerCase()); total += bytes;
    if (total > maximumEmbeddedTotalBytes) throw new Error('Embedded assets exceed their aggregate limit.');
    return { path, asset, bytes, sha256: digest };
  });
  return files;
}

export function verifiedAsset(reader: AssetReader, file: EmbeddedFile): Uint8Array {
  const bytes = new Uint8Array(reader.getAsset(file.asset));
  if (bytes.byteLength !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256)
    throw new Error('Embedded asset size or SHA-256 differs from its manifest.');
  return bytes;
}
