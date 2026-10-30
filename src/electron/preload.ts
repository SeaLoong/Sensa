import { contextBridge } from 'electron';

// The renderer controls the same authenticated HTTP service as an ordinary
// browser. No filesystem, process, shell or arbitrary IPC API is exposed.
contextBridge.exposeInMainWorld('sensaDesktop', Object.freeze({ host: 'electron', embedded: true }));
