import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { getAsset, isSea } from 'node:sea';
import { manifestFiles, readManifest, safeAssetPath, verifiedAsset } from './asset-manifest.ts';
import type { AssetReader, EmbeddedFile } from './asset-manifest.ts';

export interface ResourceReaderOptions {
  readonly directory?: string;
  readonly assets?: AssetReader;
}

/** The desktop host serves the same selected resources in a folder or a SEA. */
export function createResourceReader(options: ResourceReaderOptions = {}): (name: string) => Uint8Array | undefined {
  const assets = options.assets ?? { isSea, getAsset };
  const directory = resolve(options.directory ?? join(dirname(process.argv[1] ?? process.execPath), 'web'));
  let embedded: Map<string, EmbeddedFile> | undefined;
  return name => {
    try { safeAssetPath(name); } catch { return undefined; }
    if (assets.isSea()) {
      embedded ??= new Map(manifestFiles(readManifest(assets, 'web-manifest.json'), 'web/').map(file => [file.path, file]));
      const file = embedded.get(name);
      return file ? verifiedAsset(assets, file) : undefined;
    }
    const destination = resolve(directory, name), offset = relative(directory, destination);
    if (!offset || offset.startsWith('..' + sep) || offset === '..' || offset.startsWith(sep)) return undefined;
    try {
      const root = realpathSync(directory);
      for (let current = destination; current !== directory; current = dirname(current)) {
        const info = lstatSync(current);
        if (info.isSymbolicLink() || (current === destination ? !info.isFile() : !info.isDirectory())) return undefined;
      }
      const target = realpathSync(destination), inside = relative(root, target);
      if (inside === '..' || inside.startsWith('..' + sep) || inside.startsWith(sep)) return undefined;
      return readFileSync(target);
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return undefined;
      throw error;
    }
  };
}

let defaultReader = createResourceReader();
/** Electron supplies its app path; the CLI defaults to the bundle's sibling web folder. */
export function configureResourceRoot(directory: string): void { defaultReader = createResourceReader({ directory }); }
export function readResource(name: string): Uint8Array | undefined { return defaultReader(name); }
