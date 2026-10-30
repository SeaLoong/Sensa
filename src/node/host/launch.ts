import { randomUUID, createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

export interface DesktopLaunchOptions { configPath: string; openBrowser: boolean; host?: string; port?: number; }
export function parseLaunchOptions(args: readonly string[], defaultPath: string, newName: () => string = () => `session-${randomUUID().replaceAll('-', '')}`): DesktopLaunchOptions {
  let config: string | undefined, instance: string | undefined, host: string | undefined, port: number | undefined;
  let openBrowser = true;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    const equal = argument.indexOf('='); const key = equal < 0 ? argument : argument.slice(0, equal);
    const value = (): string => {
      const result = equal < 0 ? args[++index] : argument.slice(equal + 1);
      if (!result || result.startsWith('--')) throw new Error(`${key} requires a value.`);
      return result;
    };
    if (key === '--new-instance') { if (instance !== undefined || equal >= 0) throw new Error('Choose --instance or --new-instance once.'); instance = newName(); }
    else if (key === '--instance') { if (instance !== undefined) throw new Error('Choose --instance or --new-instance once.'); instance = value(); }
    else if (key === '--config') { if (config !== undefined) throw new Error('Choose --config once.'); config = value(); }
    else if (key === '--open-browser') { const text = value(); if (text !== 'true' && text !== 'false') throw new Error('--open-browser requires true or false.'); openBrowser = text === 'true'; }
    else if (key === '--host') host = value();
    else if (key === '--port') { port = Number(value()); if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port requires 0–65535.'); }
    else throw new Error(`Unknown launch option: ${argument}`);
  }
  let configPath = resolve(config ?? defaultPath);
  if (instance !== undefined) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(instance)) throw new Error("Instance names use 1–64 letters, digits, '-' or '_'.");
    configPath = join(dirname(configPath), 'instances', instance, 'config.json');
  }
  return { configPath, openBrowser, ...(host === undefined ? {} : { host }), ...(port === undefined ? {} : { port }) };
}
export function instanceKey(configPath: string): string {
  const canonical = process.platform === 'win32' ? resolve(configPath).toUpperCase() : resolve(configPath);
  return createHash('sha256').update(canonical).digest('hex');
}
export function buildWebUiUrls(host: string, port: number): { listenHost: string; browserUrl: string } {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid WebUI port.');
  host = host.trim();
  if (host === 'localhost') host = '127.0.0.1';
  if (!host || /[\s/@?#]/.test(host)) throw new Error('Choose a host name or IP address without a URL, port or path.');
  const listenHost = host === '*' || host === '+' ? '0.0.0.0' : host.replace(/^\[|\]$/g, '');
  const browserHost = listenHost === '0.0.0.0' ? '127.0.0.1' : listenHost === '::' ? '::1' : listenHost;
  const literal = browserHost.includes(':') ? `[${browserHost}]` : browserHost;
  return { listenHost, browserUrl: new URL(`http://${literal}:${port}`).origin };
}
