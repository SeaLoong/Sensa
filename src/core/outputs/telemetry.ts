export interface OutputTarget { key: string; label: string; value: number; maximum: number }
export interface OutputTelemetrySnapshot { state: 'idle' | 'sent' | 'stopped' | 'error'; lastSentAtUtc: string | null; targets: OutputTarget[] }
/** Commands accepted by the local transport/API, never requested motion or sensor feedback. */
export class OutputTelemetry {
  readonly now: () => number;
  #targets = new Map<string, OutputTarget>();
  #state: OutputTelemetrySnapshot['state'] = 'idle';
  #lastSent: string | null = null;
  #version = 0;
  constructor(now: () => number = Date.now) { this.now = now; }
  get version(): number { return this.#version; }
  snapshot(): OutputTelemetrySnapshot { return { state: this.#state, lastSentAtUtc: this.#lastSent, targets: [...this.#targets.values()].sort((a, b) => a.key.localeCompare(b.key)).map(target => ({ ...target })) }; }
  recordTargets(targets: readonly OutputTarget[]): void {
    let changed = false;
    for (const target of targets) if (Number.isFinite(target.value) && Number.isFinite(target.maximum) && target.maximum > 0) {
      if (!this.#targets.has(target.key) && this.#targets.size >= 4096) { const oldest = this.#targets.keys().next().value; if (oldest !== undefined) this.#targets.delete(oldest); }
      this.#targets.set(target.key, { ...target }); changed = true;
    }
    if (changed) { this.#version++; this.#state = 'sent'; this.#lastSent = new Date(this.now()).toISOString(); }
  }
  recordTarget(key: string, label: string, value: number, maximum = 100): void { this.recordTargets([{ key, label, value, maximum }]); }
  recordTCode(line: string): void {
    const targets: OutputTarget[] = [];
    for (const token of line.trim().split(/\s+/u)) { const match = /^([LRVA][0-2])(\d{3,4})(?:[IS]\d+(?:=|<>|<|>)?)?$/u.exec(token); if (match?.[1] && match[2] && Number(match[2]) <= 999) targets.push({ key: match[1], label: match[1], value: Number(match[2]), maximum: 999 }); }
    this.recordTargets(targets);
  }
  setState(state: OutputTelemetrySnapshot['state'], clear = false): void { this.#state = state; if (clear) { this.#targets.clear(); this.#lastSent = null; } }
  removePrefix(prefix: string): void { this.retainTargets(new Set([...this.#targets.keys()].filter(key => !key.startsWith(prefix)))); }
  retainTargets(keys: ReadonlySet<string>): void { let removed = false; for (const key of this.#targets.keys()) if (!keys.has(key)) { this.#targets.delete(key); removed = true; } if (removed && !this.#targets.size) { if (this.#state !== 'error') this.#state = 'idle'; this.#lastSent = null; } }
}
