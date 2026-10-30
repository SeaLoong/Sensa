/** Serial operations with an epoch barrier. In-flight writes finish before stop. */
export class OutputLane {
  #tail: Promise<void> = Promise.resolve();
  #epoch = 0;
  #closed = false;
  #pending = 0;
  #closing: Promise<void> | null = null;
  enqueue(operation: () => Promise<void>, motion = true): Promise<void> {
    if (this.#closed) return Promise.reject(new Error('Output is closed.'));
    if (this.#pending >= 64) return Promise.reject(new Error('Output operation queue is full.'));
    const epoch = this.#epoch;
    this.#pending++;
    const result = this.#tail.then(async () => {
      if (motion && (this.#closed || epoch !== this.#epoch)) return;
      await operation();
    });
    this.#tail = result.catch(() => {}).finally(() => { this.#pending--; });
    return result;
  }
  barrier(operation: () => Promise<void>): Promise<void> {
    this.#epoch++;
    return this.enqueue(operation, false);
  }
  close(operation: () => Promise<void>): Promise<void> {
    if (this.#closing) return this.#closing;
    this.#epoch++; this.#closed = true;
    this.#closing = this.#tail.then(operation);
    return this.#closing;
  }
  get epoch(): number { return this.#epoch; }
  get closed(): boolean { return this.#closed; }
}

export async function deadline<T>(operation: Promise<T>, timeoutMs: number, label: string, expire?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expire?.(); reject(new Error(`${label} timed out.`)); }, timeoutMs);
  });
  try { return await Promise.race([operation, timeout]); }
  finally { if (timer) clearTimeout(timer); }
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, Math.max(0, milliseconds)); });
}
