import React, { useEffect, useState } from 'react';
import Workbench from '../web/app.js';
import { createBrowserWorkbench } from './browser-runtime.ts';
import type { BrowserWorkbenchHost } from './browser-runtime.ts';

export interface WebSensaProps { host?: BrowserWorkbenchHost; }
/** Browser and executable editions render the same workbench with different ports. */
export default function WebSensa({ host: supplied }: WebSensaProps) {
  const [host] = useState(() => supplied ?? createBrowserWorkbench());
  useEffect(() => () => { if (!supplied) void host.client.dispose(); }, [host, supplied]);
  return <Workbench client={host.client} platform={host.platform} initialSnapshot={host.initialSnapshot()} />;
}
