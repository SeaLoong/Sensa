/** One workbench protocol for the Node service, Electron and an in-page runtime. */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue; }
export type RuntimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export type RuntimeMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export interface RuntimeRequestOptions {
  method?: RuntimeMethod;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
}
export interface RuntimeObservers {
  onStatus?(status: RuntimeStatus): void;
  onSnapshot?(snapshot: JsonObject | null, logs?: JsonValue[]): void;
}
export interface RuntimeSession {
  start(observers?: RuntimeObservers): void;
  stop(): void;
  request(path: string, options?: RuntimeRequestOptions): Promise<unknown>;
}
export interface RuntimeClient extends RuntimeSession {
  readonly kind: 'remote' | 'local';
  request(path: string, options?: RuntimeRequestOptions): Promise<JsonValue>;
  fetch(path: string, options?: RequestInit): Promise<Response>;
  dispose(): Promise<void>;
}
export interface RuntimeFacadeResponse {
  statusCode: number; data: unknown; success: boolean;
  body?: BodyInit | null;
  headers?: Readonly<Record<string, string>>;
}
export interface RuntimeFacade {
  execute(method: string, path: string, body?: unknown): PromiseLike<RuntimeFacadeResponse>;
}
export interface LocalRuntimeOptions {
  facade: RuntimeFacade;
  snapshot(): unknown;
  logs?(): unknown;
  /** A tab/connection disappearing closes input independently of rendering. */
  deactivate(): void | PromiseLike<void>;
  close?(): void | PromiseLike<void>;
  tick?(): void | PromiseLike<void>;
  subscribe?(changed: () => void): () => void;
  timers?: Pick<typeof globalThis, 'setInterval' | 'clearInterval'>;
  intervalMs?: number;
}
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_NODES = 100_000;

function aborted(signal: AbortSignal | null | undefined): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('Request aborted.', 'AbortError');
}
export function runtimePath(path: string): string {
  if (typeof path !== 'string' || !path.startsWith('/api/') || path.length > 2048
      || [...path].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === '\\' || character === '#') || path.startsWith('//'))
    throw new TypeError('Expected a workbench API path.');
  const parsed = new URL(path, 'http://sensa.invalid');
  if (parsed.origin !== 'http://sensa.invalid' || parsed.pathname !== path.split('?')[0]
      || /(?:^|\/)\.{1,2}(?:\/|$)/u.test(decodeURIComponent(parsed.pathname)))
    throw new TypeError('Expected a canonical workbench API path.');
  return path;
}
export function runtimeMethod(method: string | undefined): RuntimeMethod {
  const value = method ?? 'GET';
  if (value !== 'GET' && value !== 'POST' && value !== 'PUT' && value !== 'DELETE' && value !== 'PATCH')
    throw new TypeError('Unsupported workbench API method.');
  return value;
}
/** Keep local results identical to their JSON wire representation and owned by the caller. */
export function runtimeJson(value: unknown): JsonValue {
  const text = JSON.stringify(value ?? null);
  if (text === undefined || new TextEncoder().encode(text).byteLength > MAX_BYTES)
    throw new TypeError('Workbench data exceeds the JSON message limit.');
  const result: unknown = JSON.parse(text);
  let nodes = 0;
  const visit = (entry: unknown, depth: number): void => {
    if (++nodes > MAX_NODES || depth > 64) throw new TypeError('Workbench data is too deeply nested.');
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return;
    if (typeof entry === 'number' && Number.isFinite(entry)) return;
    if (Array.isArray(entry)) { for (const item of entry) visit(item, depth + 1); return; }
    if (typeof entry === 'object') { for (const item of Object.values(entry)) visit(item, depth + 1); return; }
    throw new TypeError('Expected JSON workbench data.');
  };
  visit(result, 0);
  return result as JsonValue;
}
export function runtimeObject(value: unknown): JsonObject | null {
  const data = runtimeJson(value);
  if (data === null) return null;
  if (typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Expected a workbench state object.');
  return data;
}
function requestBody(body: unknown): JsonValue | undefined {
  if (body === undefined) return undefined;
  return runtimeJson(typeof body === 'string' ? JSON.parse(body) : body);
}
function logs(value: unknown): JsonValue[] {
  const data = runtimeJson(value ?? []);
  if (!Array.isArray(data)) throw new TypeError('Expected workbench log entries.');
  return data;
}
function failure(data: JsonValue, status: number): Error {
  return new Error(data && typeof data === 'object' && !Array.isArray(data) && typeof data['error'] === 'string'
    ? data['error'] : `Workbench request failed (${status}).`);
}
function fetchOptions(options: RequestInit = {}): RuntimeRequestOptions {
  const result: RuntimeRequestOptions = { method: runtimeMethod(options.method) };
  if (options.body !== undefined && options.body !== null) {
    if (typeof options.body !== 'string') throw new TypeError('Workbench requests use a JSON string body.');
    result.body = options.body;
  }
  if (options.signal) result.signal = options.signal;
  return result;
}

/** Wrap the existing cross-tab session; permission prompts and engine ownership stay in hosts. */
export function createRemoteRuntimeClient(session: RuntimeSession,
  fetchRequest: typeof fetch = globalThis.fetch): RuntimeClient {
  let closed = false;
  return {
    kind: 'remote',
    start(observers = {}) {
      if (closed) throw new Error('Workbench client is disposed.');
      session.start({ onStatus: value => observers.onStatus?.(value),
        onSnapshot: (snapshot, entries) => {
          try { observers.onSnapshot?.(runtimeObject(snapshot), logs(entries)); }
          catch { observers.onStatus?.('error'); }
        } });
    },
    stop() { session.stop(); },
    async request(path, options = {}) {
      if (closed) throw new Error('Workbench client is disposed.');
      runtimePath(path); runtimeMethod(options.method); aborted(options.signal);
      const normalized = { ...options, ...(options.body === undefined ? {} : { body: requestBody(options.body) }) };
      const result = await session.request(path, normalized);
      aborted(options.signal);
      return runtimeJson(result);
    },
    async fetch(path, options = {}) {
      if (closed) throw new Error('Workbench client is disposed.');
      runtimePath(path); runtimeMethod(options.method); aborted(options.signal);
      return fetchRequest(path, { ...options, credentials: 'same-origin', redirect: 'error' });
    },
    async dispose() { if (!closed) { closed = true; session.stop(); } },
  };
}

/** An in-page connection to the same application facade used by the Node service. */
export function createLocalRuntimeClient(options: LocalRuntimeOptions): RuntimeClient {
  const timers = options.timers ?? globalThis;
  const intervalMs = options.intervalMs ?? 50;
  if (!Number.isFinite(intervalMs) || intervalMs < 10 || intervalMs > 1000) throw new RangeError('Invalid runtime interval.');
  let running = false, disposed = false, generation = 0, ticking = false;
  let observer: RuntimeObservers = {}, timer: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let shutdown: Promise<void> = Promise.resolve();
  const inFlight = new Set<PromiseLike<RuntimeFacadeResponse>>();
  const emit = () => {
    if (running) observer.onSnapshot?.(runtimeObject(options.snapshot()), logs(options.logs?.()));
  };
  const tick = async () => {
    if (!running || ticking) return;
    const current = generation; ticking = true;
    try {
      await shutdown;
      if (!running || generation !== current) return;
      await options.tick?.(); if (running && generation === current) emit();
    }
    catch { if (running && generation === current) observer.onStatus?.('error'); }
    finally { ticking = false; }
  };
  const stop = () => {
    if (!running) return;
    running = false; generation++;
    if (timer !== undefined) timers.clearInterval(timer);
    timer = undefined; unsubscribe?.(); unsubscribe = undefined;
    const pending = [...inFlight];
    const previous = shutdown;
    let immediate: Promise<void>;
    try { immediate = Promise.resolve(options.deactivate()); }
    catch (error) { immediate = Promise.reject(error); }
    // Old asynchronous commands finish before a restored page can issue fresh
    // commands. Input is closed now and again after their final mutations.
    shutdown = Promise.allSettled([previous, immediate, ...pending]).then(async () => { await options.deactivate(); });
    void shutdown.catch(() => {});
    observer.onStatus?.('disconnected');
  };
  const execute = async (path: string, request: RuntimeRequestOptions): Promise<RuntimeFacadeResponse> => {
    if (disposed || !running) throw new Error('Workbench connection is closed.');
    runtimePath(path); const method = runtimeMethod(request.method); aborted(request.signal);
    const current = generation;
    await shutdown;
    if (!running || current !== generation) throw new Error('Workbench connection is closed.');
    aborted(request.signal);
    const pending = options.facade.execute(method, path, requestBody(request.body));
    inFlight.add(pending);
    let response: RuntimeFacadeResponse;
    try { response = await pending; }
    finally { inFlight.delete(pending); }
    if (!running || current !== generation) {
      await options.deactivate();
      throw new Error('Workbench connection is closed.');
    }
    aborted(request.signal);
    emit();
    return response;
  };
  return {
    kind: 'local',
    start(next = {}) {
      if (disposed) throw new Error('Workbench client is disposed.');
      observer = next;
      if (running) { observer.onStatus?.('connected'); return; }
      running = true; generation++;
      unsubscribe = options.subscribe?.(emit);
      timer = timers.setInterval(() => { void tick(); }, intervalMs);
      observer.onStatus?.('connected'); emit();
    },
    stop,
    async request(path, request = {}) {
      const response = await execute(path, request), data = runtimeJson(response.data);
      if (!response.success || response.statusCode >= 400) throw failure(data, response.statusCode);
      return data;
    },
    async fetch(path, request = {}) {
      const result = await execute(path, fetchOptions(request));
      return new Response(result.body === undefined ? JSON.stringify(runtimeJson(result.data)) : result.body, {
        status: result.statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', ...result.headers },
      });
    },
    async dispose() {
      if (disposed) return;
      stop(); disposed = true;
      await shutdown; await options.close?.();
    },
  };
}
