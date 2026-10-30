/** Narrow desktop-shell policy, independently testable without starting Electron. */
export const rendererPolicy = Object.freeze({ nodeIntegration: false, contextIsolation: true, sandbox: true,
  webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, navigateOnDragDrop: false });
export const desktopCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https: ws: wss:; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'";
export function httpUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || value.length > 8192
    || [...value].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return undefined;
  try { const url = new URL(value); return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password ? url : undefined; }
  catch { return undefined; }
}
export function sameServiceOrigin(value: unknown, serviceUrl: string): boolean {
  const url = httpUrl(value), base = httpUrl(serviceUrl);
  return !!url && !!base && url.origin === base.origin;
}
export interface ServiceReady { type: 'sensa:ready'; url: string; port: number; configPath: string; reused: boolean }
export function serviceReady(value: unknown): ServiceReady | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>, url = httpUrl(row.url);
  if (row.type !== 'sensa:ready' || !url || url.protocol !== 'http:' || url.pathname !== '/' || url.search || url.hash
    || !Number.isInteger(row.port) || Number(row.port) < 1 || Number(row.port) > 65535
    || Number(url.port || 80) !== row.port || typeof row.configPath !== 'string' || !row.configPath
    || typeof row.reused !== 'boolean') return undefined;
  return { type: 'sensa:ready', url: url.href, port: Number(row.port), configPath: row.configPath, reused: row.reused };
}
/** Electron consumes its own switches; none are forwarded to the service. */
export function desktopArguments(args: readonly string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (/^--(?:remote-debugging-port|inspect|inspect-brk)=\d+$/.test(arg)) continue;
    if (arg === '--remote-debugging-address=127.0.0.1') continue;
    if (arg.startsWith('--remote-debugging-') || arg.startsWith('--inspect')) throw new Error('Unsupported desktop debugging switch.');
    result.push(arg);
  }
  return result;
}
export function childEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result = { ...environment };
  delete result.NODE_OPTIONS; delete result.NODE_PATH; delete result.ELECTRON_RUN_AS_NODE;
  return result;
}
