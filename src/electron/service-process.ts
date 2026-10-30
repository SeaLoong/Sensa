import { spawn, type ChildProcess } from 'node:child_process';
import { serviceReady, childEnvironment, type ServiceReady } from './policy.ts';

export interface DesktopService { ready: ServiceReady; child: ChildProcess; close(): Promise<void>; unexpectedExit: Promise<void> }
export interface ServiceCommand { executable: string; args: readonly string[]; cwd: string }
export async function startDesktopService(command: ServiceCommand, environment: NodeJS.ProcessEnv = process.env,
  startupTimeoutMs = 30000, shutdownTimeoutMs = 5000): Promise<DesktopService> {
  const child = spawn(command.executable, [...command.args], { cwd: command.cwd, env: childEnvironment(environment),
    windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  let closing = false, owned = false, stopped = false;
  const exit = new Promise<void>(resolve => { child.once('exit', () => { stopped = true; resolve(); }); });
  let unexpected: () => void = () => {};
  const unexpectedExit = new Promise<void>(resolve => { unexpected = resolve; });
  // ChildProcess may emit errors after readiness (including an IPC failure).
  // Keep one lifetime listener, independently of startup's temporary listeners.
  child.on('error', () => { if (owned && !closing) { unexpected(); child.kill(); } });
  void exit.then(() => { if (owned && !closing) unexpected(); });
  const ready = await new Promise<ServiceReady>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error('The local service did not become ready in time.')), startupTimeoutMs);
    const finish = (error?: Error, value?: ServiceReady): void => {
      if (settled) return; settled = true; clearTimeout(timer);
      child.removeListener('message', message); child.removeListener('error', failed); child.removeListener('exit', failed);
      if (error) {
        child.kill();
        const force = setTimeout(() => child.kill('SIGKILL'), 1000); force.unref();
        child.once('exit', () => clearTimeout(force)); reject(error);
      } else if (value) resolve(value);
    };
    const message = (value: unknown): void => {
      const parsed = serviceReady(value);
      if (parsed) { owned = !parsed.reused; finish(undefined, parsed); }
      else if (value && typeof value === 'object' && 'type' in value && value.type === 'sensa:error') finish(new Error('The local service could not start.'));
    };
    const failed = (): void => finish(new Error('The local service exited before becoming ready.'));
    child.on('message', message); child.once('error', failed); child.once('exit', failed);
  });
  return { ready, child, unexpectedExit, async close() {
    if (closing) { await exit; return; } closing = true;
    if (!owned || stopped) return;
    if (child.connected) {
      try { child.send({ type: 'sensa:shutdown' }, () => { /* Exit/timeout is authoritative. */ }); }
      catch { /* A concurrent disconnect is covered by the bounded exit wait. */ }
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), shutdownTimeoutMs);
    try { await exit; } finally { clearTimeout(timer); }
  } };
}
