import { startSensa, type SensaHostHandle } from './host/start.ts';
import { checkNativePackages } from './host/native-probe.ts';

async function main(): Promise<void> {
  const cliArguments = process.argv.slice(2);
  if (cliArguments.includes('--check-native')) {
    try {
      if (cliArguments[0] !== '--check-native' || cliArguments.length !== 1 && (cliArguments.length !== 3 || cliArguments[1] !== '--native-report' || !cliArguments[2])) throw new Error('Use --check-native [--native-report PATH].');
      const result = await checkNativePackages(), text = JSON.stringify(result, null, 2) + '\n';
      if (cliArguments[2]) { const { writeFile } = await import('node:fs/promises'); await writeFile(cliArguments[2], text, { mode: 0o600 }); }
      console.log(text.trimEnd());
    } catch { console.error('Native package verification failed.'); process.exitCode = 1; }
    return;
  }
  let host: SensaHostHandle | undefined, stopping = false, shutdown: Promise<void> | undefined;
  const ipc = typeof process.send === 'function';
  const send = (message: unknown): Promise<void> => new Promise(resolve => {
    if (!ipc || !process.connected || !process.send) { resolve(); return; }
    try { process.send(message, () => resolve()); } catch { resolve(); }
  });
  const stop = (): void => {
    stopping = true;
    if (!host || shutdown) return;
    shutdown = (async () => {
      try { await host!.close(); }
      catch (error) { console.error(error instanceof Error ? error.message : 'Shutdown failed.'); process.exitCode = 1; }
      await send({ type: 'sensa:stopped' });
      if (ipc && process.connected) process.disconnect();
    })();
  };
  const parentMessage = (message: unknown): void => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return;
    const row = message as Record<string, unknown>;
    if (Object.keys(row).length === 1 && row['type'] === 'sensa:shutdown') stop();
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  if (ipc) { process.on('message', parentMessage); process.once('disconnect', stop); }
  try {
    host = await startSensa({ args: cliArguments, log: (message, level) => {
      if (level === 'Error' || level === 'Warning') console.error(message); else console.log(message);
    } });
    if (stopping) stop();
    else await send({ type: 'sensa:ready', url: host.url, port: host.port, configPath: host.configPath, reused: host.reused });
    if (host.reused) { if (ipc && process.connected) process.disconnect(); }
    else await host.closed;
    await shutdown;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Startup failed.';
    console.error(`[Sensa] ${message}`); process.exitCode = 1;
    await send({ type: 'sensa:error', error: message });
    if (ipc && process.connected) process.disconnect();
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
    if (ipc) { process.off('message', parentMessage); process.off('disconnect', stop); }
  }
}
void main();
