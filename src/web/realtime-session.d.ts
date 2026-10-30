import type { RuntimeSession, RuntimeObservers } from './runtime-client.ts';

export interface BrowserSessionOptions { url: string; workerUrl?: string; }
export interface SnapshotLoaderObservers {
  initialLoaded?: boolean;
  onLoad?(snapshot: { config: unknown; overview: unknown; logs: unknown; serialPorts: unknown }): void;
  onLoading?(loading: boolean): void;
  onError?(error: Error): void;
}
export function createBrowserRealtimeSession(options: BrowserSessionOptions): RuntimeSession;
export function attachPageLifecycle(session: RuntimeSession, page: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  observers?: RuntimeObservers): () => void;
export function createInitialSnapshotLoader(session: RuntimeSession, observers?: SnapshotLoaderObservers): {
  connection(status: string): Promise<void>;
  dispose(): void;
};
