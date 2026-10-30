import React from 'react';
import { createRoot } from 'react-dom/client';
import Workbench from './app.js';
import { createBrowserRealtimeSession } from './realtime-session.js';
import { createRemoteRuntimeClient } from './runtime-client.ts';
import type { RuntimeClient } from './runtime-client.ts';
import type { WorkbenchInitialSnapshot, WorkbenchPlatform } from './workbench-props.ts';

export interface MountWorkbenchOptions {
  element: HTMLElement;
  client: RuntimeClient;
  platform?: WorkbenchPlatform;
  initialSnapshot?: WorkbenchInitialSnapshot;
}
export function createServiceClient(location: Pick<Location, 'href'> = globalThis.location): RuntimeClient {
  const url = new URL('/api/ws', location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return createRemoteRuntimeClient(createBrowserRealtimeSession({ url: url.href }));
}
export function mountWorkbench({ element, client, platform, initialSnapshot }: MountWorkbenchOptions): { dispose(): Promise<void> } {
  const root = createRoot(element);
  root.render(<Workbench client={client} {...(platform ? { platform } : {})} {...(initialSnapshot ? { initialSnapshot } : {})} />);
  let disposed = false;
  return { async dispose() {
    if (disposed) return;
    disposed = true; root.unmount(); await client.dispose();
  } };
}
