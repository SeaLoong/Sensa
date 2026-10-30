import { app, BrowserWindow, dialog, session, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseLaunchOptions, instanceKey } from '../node/host/launch.ts';
import { desktopArguments, desktopCsp, httpUrl, rendererPolicy, sameServiceOrigin } from './policy.ts';
import { startDesktopService, type DesktopService } from './service-process.ts';

app.enableSandbox();
let window: BrowserWindow | undefined, service: DesktopService | undefined, stopping = false;
const options = parseLaunchOptions(desktopArguments(process.argv.slice(app.isPackaged ? 1 : 2)),
  process.env.SENSA_CONFIG_PATH ?? join(app.getPath('appData'), 'Sensa', 'config.json'));
const profile = join(app.getPath('appData'), 'Sensa', 'desktop', instanceKey(options.configPath));
mkdirSync(profile, { recursive: true, mode: 0o700 });
app.setPath('userData', profile);
const ownsWindow = app.requestSingleInstanceLock({ profile: instanceKey(options.configPath) });
if (!ownsWindow) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (!service || stopping) return;
    event.preventDefault(); stopping = true;
    void service.close().finally(() => app.quit());
  });
  void app.whenReady().then(async () => {
    const serviceArgs = ['--config', options.configPath, '--open-browser', 'false'];
    if (options.host !== undefined) serviceArgs.push('--host', options.host);
    if (options.port !== undefined) serviceArgs.push('--port', String(options.port));
    const cliDirectory = app.isPackaged ? join(process.resourcesPath, 'cli') : resolve(app.getAppPath(), '..', 'node');
    const command = app.isPackaged
      ? { executable: join(cliDirectory, process.platform === 'win32' ? 'Sensa.exe' : 'Sensa'), args: serviceArgs, cwd: cliDirectory }
      : { executable: process.env.SENSA_NODE_BINARY ?? 'node', args: [join(cliDirectory, 'sensa.cjs'), ...serviceArgs], cwd: cliDirectory };
    service = await startDesktopService(command);
    const origin = service.ready.url;
    const external = (url: string): void => { if (httpUrl(url)) void shell.openExternal(url).catch(() => undefined); };
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(permission === 'clipboard-sanitized-write' && sameServiceOrigin(details.requestingUrl, origin) && sameServiceOrigin(contents.getURL(), origin));
    });
    session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin) =>
      permission === 'clipboard-sanitized-write' && !!contents && sameServiceOrigin(requestingOrigin, origin) && sameServiceOrigin(contents.getURL(), origin));
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback(sameServiceOrigin(details.url, origin)
        ? { responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [desktopCsp] } }
        : details.responseHeaders ? { responseHeaders: details.responseHeaders } : {});
    });
    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-attach-webview', event => event.preventDefault());
      contents.on('will-navigate', (event, url) => { if (!sameServiceOrigin(url, origin)) { event.preventDefault(); external(url); } });
      contents.setWindowOpenHandler(details => sameServiceOrigin(details.url, origin)
        ? { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { ...rendererPolicy } } }
        : (external(details.url), { action: 'deny' }));
    });
    window = new BrowserWindow({ width: 1280, height: 900, minWidth: 390, minHeight: 600, show: false,
      title: 'Sensa', webPreferences: { ...rendererPolicy, preload: join(app.getAppPath(), 'preload.cjs') } });
    window.setMenuBarVisibility(false);
    window.once('ready-to-show', () => window?.show());
    window.webContents.once('render-process-gone', () => app.quit());
    await window.loadURL(service.ready.url);
    void service.unexpectedExit.then(() => { dialog.showErrorBox('Sensa', 'The local service stopped. Restart Sensa to reconnect.'); app.quit(); });
  }).catch(async () => {
    dialog.showErrorBox('Sensa', 'Sensa could not start its local service. Check the selected configuration and instance.');
    await service?.close(); stopping = true; app.quit();
  });
}
