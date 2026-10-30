import './startup-locale.ts';
import { mountWorkbench } from '../web/bootstrap.tsx';
import { createBrowserWorkbench } from './browser-runtime.ts';
import { getLocale, subscribeLocale } from '../web/i18n.js';
import { saveWebSensaLocale } from './locale.ts';
import '../web/styles.css';

const element = document.getElementById('app-root');
if (!element) throw new Error('Missing WebSensa workbench root element.');
const host = createBrowserWorkbench();
subscribeLocale(() => { saveWebSensaLocale(getLocale(), window); });
mountWorkbench({ element, client: host.client, platform: host.platform, initialSnapshot: host.initialSnapshot() });
