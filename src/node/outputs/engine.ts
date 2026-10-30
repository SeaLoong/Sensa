import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { deadline } from '../../core/outputs/lifecycle.ts';
import type { BridgeProcess, OutputDependencies } from '../../core/outputs/types.ts';

/** An explicitly enabled, locally installed Intiface engine; never downloaded. */
export async function startInstalledEngine(address: string, dependencies: OutputDependencies): Promise<BridgeProcess | null> {
  const url = new URL(address);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('A managed Intiface engine requires a loopback endpoint.');
  const executable = process.platform === 'win32' ? 'intiface-engine.exe' : 'intiface-engine';
  const roots = [dependencies.baseDirectory, path.dirname(process.argv[1] ?? process.execPath), process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'Sensa') : undefined].filter((value): value is string => !!value);
  let filename: string | null = null;
  for (const root of roots) { const candidate = path.join(root, executable); try { await access(candidate); filename = candidate; break; } catch { /* Next installed location. */ } }
  if (!filename) { dependencies.log?.('[Intiface] Installed engine was not found; using the configured endpoint.'); return null; }
  const args = ['--websocket-port', url.port || '12345', '--use-bluetooth-le', '--use-hid', '--crash-reporting', 'false'];
  if (dependencies.engineProcessFactory) return dependencies.engineProcessFactory(filename, args);
  const child = spawn(filename, args, { shell: false, windowsHide: true, stdio: 'ignore' });
  const exited = new Promise<number | null>(resolve => { child.once('exit', resolve); child.once('error', () => resolve(null)); });
  return { exited, async stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    try { await deadline(exited, 1000, 'Intiface engine shutdown'); }
    catch { child.kill('SIGKILL'); await deadline(exited, 2000, 'Intiface engine termination'); }
  } };
}
