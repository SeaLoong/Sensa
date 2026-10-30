/** Bounded ordered writer; command replies take priority over coalesced state. */
export interface RealtimeSocket {
  readonly readyState: number;
  send(data: string, callback: (error?: Error) => void): void;
  terminate(): void;
}
interface Reply { data: string; resolve(): void; reject(error: Error): void; }
export class RealtimeWriter {
  private replies: Reply[] = [];
  private pendingState: (() => string) | null = null;
  private sending = false;
  private stopped = false;
  private activeReject: ((error: Error) => void) | undefined;
  private readonly socket: RealtimeSocket;
  private readonly timeoutMs: number;
  constructor(socket: RealtimeSocket, timeoutMs = 3_000) { this.socket = socket; this.timeoutMs = timeoutMs; }
  get isStopped(): boolean { return this.stopped; }
  reply(data: string): Promise<void> {
    if (this.stopped) return Promise.reject(new Error('Realtime connection closed.'));
    if (this.replies.length >= 128) { this.stop(); return Promise.reject(new Error('Realtime response queue is full.')); }
    return new Promise((resolve, reject) => { this.replies.push({ data, resolve, reject }); this.flush(); });
  }
  state(snapshot: () => string): void {
    if (this.stopped) return;
    this.pendingState = snapshot; this.flush();
  }
  stop(reason = new Error('Realtime connection closed.')): void {
    if (this.stopped) return;
    this.stopped = true; this.pendingState = null;
    this.activeReject?.(reason);
    for (const reply of this.replies.splice(0)) reply.reject(reason);
  }
  private flush(): void {
    if (this.sending || this.stopped || (!this.replies.length && !this.pendingState)) return;
    this.sending = true;
    const reply = this.replies.shift();
    const snapshot = reply ? null : this.pendingState;
    if (!reply) this.pendingState = null;
    let data: string;
    try { data = reply ? reply.data : snapshot!(); }
    catch (error) { this.sending = false; this.stop(error instanceof Error ? error : new Error('Snapshot failed.')); this.socket.terminate(); return; }
    void this.send(data).then(() => reply?.resolve(), error => {
      const reason = error instanceof Error ? error : new Error('Realtime send failed.');
      reply?.reject(reason); this.stop(reason); this.socket.terminate();
    }).finally(() => { this.sending = false; this.flush(); });
  }
  private send(data: string): Promise<void> {
    if (this.socket.readyState !== 1) return Promise.reject(new Error('Realtime socket is not open.'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (error?: Error): void => {
        if (settled) return; settled = true; clearTimeout(timer); this.activeReject = undefined;
        if (error) reject(error); else resolve();
      };
      const timer = setTimeout(() => done(new Error('Realtime send timed out.')), this.timeoutMs);
      this.activeReject = error => done(error);
      try { this.socket.send(data, done); } catch (error) { done(error instanceof Error ? error : new Error('Realtime send failed.')); }
    });
  }
}
