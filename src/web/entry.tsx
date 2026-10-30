import { createServiceClient, mountWorkbench } from './bootstrap.tsx';

const element = document.getElementById('app-root');
if (!element) throw new Error('Missing Sensa workbench root element.');
mountWorkbench({ element, client: createServiceClient() });
