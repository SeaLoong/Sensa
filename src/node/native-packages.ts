import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire, isBuiltin, registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { getAsset, isSea } from 'node:sea';
import { fileURLToPath } from 'node:url';
import { manifestFiles, readManifest, verifiedAsset } from './asset-manifest.ts';
import type { AssetReader, EmbeddedFile } from './asset-manifest.ts';

export type NativePackageName = 'serialport' | '@julusian/midi';
export interface NativePackageLoaderOptions {
  readonly assets?: AssetReader;
  readonly temporaryDirectory?: string;
  readonly require?: (name: string, root?: string) => unknown;
  readonly registerCleanup?: boolean;
}
export interface ExtractedNativePackages {
  readonly directory: string;
  readonly files: readonly EmbeddedFile[];
  readonly dispose: () => void;
}
const names: readonly NativePackageName[] = ['serialport', '@julusian/midi'];
function defaultModuleAnchor(): string {
  const entry = process.argv[1];
  if (entry && isAbsolute(entry)) {
    try { return lstatSync(entry).isDirectory() ? join(entry, 'package.json') : entry; } catch { /* A host can provide its app path explicitly. */ }
  }
  return join(process.cwd(), 'package.json');
}
let ordinaryRequire = createRequire(defaultModuleAnchor());
let sharedExtraction: Promise<ExtractedNativePackages> | undefined;

/** Electron supplies app.getAppPath(); bare Node follows the actual CLI entry. */
export function configureNativePackageRoot(directory: string): void { ordinaryRequire = createRequire(join(resolve(directory), 'package.json')); }

function contained(root: string, file: string): boolean {
  const offset = relative(root, file);
  return offset !== '..' && !offset.startsWith('..' + sep) && !offset.startsWith(sep);
}

/** No shared cache: each process owns a new private directory and all its files. */
export function extractNativePackages(options: NativePackageLoaderOptions = {}): ExtractedNativePackages {
  const assets = options.assets ?? { isSea, getAsset }, manifest = readManifest(assets, 'native-manifest.json');
  if (manifest['platform'] !== process.platform || manifest['arch'] !== process.arch
    || manifest['modules'] !== process.versions.modules || manifest['nodeVersion'] !== process.versions.node)
    throw new Error('Embedded native dependencies do not match this runtime.');
  if (!Array.isArray(manifest['packages']) || manifest['packages'].length !== names.length
    || !names.every(name => (manifest['packages'] as unknown[]).includes(name)))
    throw new Error('The embedded native package inventory is incomplete.');
  const files = manifestFiles(manifest, 'native/');
  if (!files.length || files.some(file => !file.path.startsWith('node_modules/'))
    || !names.every(name => files.some(file => file.path === `node_modules/${name}/package.json`)))
    throw new Error('Embedded native packages must contain both supported roots.');
  // Verify the complete inventory before creating any output path.
  const content = files.map(file => verifiedAsset(assets, file));
  const parent = realpathSync(options.temporaryDirectory ?? tmpdir());
  if (!lstatSync(parent).isDirectory()) throw new Error('Native package temporary parent is not a directory.');
  const directory = mkdtempSync(join(parent, 'sensa-native-'));
  const cleanup = (): void => { try { if (!lstatSync(directory).isSymbolicLink()) rmSync(directory, { recursive: true, force: true }); } catch { /* A loaded Windows DLL may remain locked until process teardown. */ } };
  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index], bytes = content[index];
      if (!file || !bytes) throw new Error('Embedded native file inventory changed.');
      const destination = resolve(directory, file.path);
      if (!contained(directory, destination)) throw new Error('Native package path escapes its private directory.');
      const parts = file.path.split('/'); parts.pop(); let current = directory;
      for (const part of parts) {
        current = join(current, part);
        try { mkdirSync(current, { mode: 0o700 }); } catch (error) {
          if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
        }
        const info = lstatSync(current);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Native package directory is not ordinary.');
      }
      const pending = destination + '.sensa-partial';
      const descriptor = openSync(pending, 'wx', 0o600);
      try { writeFileSync(descriptor, bytes); fsyncSync(descriptor); } finally { closeSync(descriptor); }
      renameSync(pending, destination);
      const actual = readFileSync(destination);
      if (!lstatSync(destination).isFile() || lstatSync(destination).isSymbolicLink()
        || createHash('sha256').update(actual).digest('hex') !== file.sha256)
        throw new Error('Extracted native dependency integrity check failed.');
    }
    // Native packages may perform lazy requires. Confine their resolution for
    // their entire lifetime; do not let an absent optional import fall through
    // to another user's /tmp/node_modules or application-adjacent files.
    const inventory = new Set(files.map(file => resolve(directory, file.path)));
    const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      const parentUrl = context.parentURL;
      if (!parentUrl?.startsWith('file:') || !contained(directory, fileURLToPath(parentUrl)) || isBuiltin(specifier)) return result;
      if (!result.url.startsWith('file:') || !inventory.has(fileURLToPath(result.url))) {
        const error = new Error('Native dependency resolved outside its verified embedded inventory.');
        Object.assign(error, { code: 'MODULE_NOT_FOUND' }); throw error;
      }
      return result;
    } });
    const dispose = (): void => { hooks.deregister(); cleanup(); };
    if (options.registerCleanup !== false) process.once('exit', dispose);
    return { directory, files, dispose };
  } catch (error) { cleanup(); throw error; }
}

export async function loadOptionalPackage(name: NativePackageName, options?: NativePackageLoaderOptions): Promise<unknown> {
  if (!names.includes(name)) throw new Error('Unsupported native package.');
  const assets = options?.assets ?? { isSea, getAsset };
  if (!assets.isSea()) return options?.require ? options.require(name) : ordinaryRequire(name) as unknown;
  const extraction = options
    ? extractNativePackages(options)
    : await (sharedExtraction ??= Promise.resolve().then(() => extractNativePackages()).catch((error: unknown) => { sharedExtraction = undefined; throw error; }));
  try {
    return options?.require ? options.require(name, extraction.directory)
      : createRequire(join(extraction.directory, 'entry.cjs'))(name) as unknown;
  } catch (error) {
    if (options) extraction.dispose();
    throw new Error(`Native package ${name} could not be loaded: ${error instanceof Error ? error.message : 'unknown loader error'}`, { cause: error });
  }
}
