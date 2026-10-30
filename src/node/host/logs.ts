export type RuntimeLogLevel = 'Debug' | 'Info' | 'Warning' | 'Error';
export interface RuntimeLogEntry { timestamp: string; level: RuntimeLogLevel; category: string; message: string; }
const sensitiveKey = /^(?:connectionKey|api[-_]?key|auth[-_]?token|access[-_]?token|password|secret|authorization|cookie|set-cookie|pairingKey)$/i;
/** Redact both structured credentials and opaque values echoed by upstreams. */
export class LogRedactor {
  private readonly secrets = new Set<string>();
  registerSecret(value: string | undefined): void {
    if (!value) return;
    this.secrets.add(value); this.secrets.add(encodeURIComponent(value));
    this.secrets.add(JSON.stringify(value).slice(1, -1));
  }
  registerConfiguration(value: unknown): void {
    const seen = new Set<object>();
    const visit = (item: unknown): void => {
      if (!item || typeof item !== 'object' || seen.has(item)) return;
      seen.add(item);
      for (const [key, child] of Object.entries(item)) {
        if (sensitiveKey.test(key) && typeof child === 'string') this.registerSecret(child);
        else visit(child);
      }
    };
    visit(value);
  }
  redact(value: string): string {
    let text = value.replace(/\b(?:https?|wss?):\/\/[^\s<>"']+/gi, raw => {
      try {
        const url = new URL(raw), origin = `${url.protocol}//${url.host}`;
        return url.pathname === '/' && !url.search && !url.hash ? origin : `${origin}/[redacted]`;
      } catch { return '[redacted URL]'; }
    });
    text = text.replace(/\b((?:authorization|cookie|set-cookie)\s*:)\s*[^\r\n]*/gi, '$1 [redacted]');
    text = text.replace(/(["']?(?:connectionKey|api[-_]?key|auth[-_]?token|access[-_]?token|password|secret|authorization|cookie|set-cookie|pairingKey|token)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}&\]]+)/gi, '$1[redacted]');
    for (const secret of [...this.secrets].sort((a, b) => b.length - a.length)) text = text.split(secret).join('[redacted]');
    return text.length > 8192 ? text.slice(0, 8192) + ' [truncated]' : text;
  }
}
export class RuntimeLogBuffer {
  private entries: RuntimeLogEntry[] = [];
  private readonly now: () => number;
  readonly redactor: LogRedactor;
  constructor(now: () => number = Date.now, redactor = new LogRedactor()) { this.now = now; this.redactor = redactor; }
  add(message: string, level: RuntimeLogLevel = 'Info'): RuntimeLogEntry {
    message = this.redactor.redact(message);
    const entry = { timestamp: new Date(this.now()).toISOString(), level, category: /^\[([^\]]+)\]/.exec(message)?.[1]?.trim() || 'General', message };
    this.entries.push(entry); if (this.entries.length > 2_000) this.entries.shift(); return entry;
  }
  snapshot(take = 200): RuntimeLogEntry[] { return this.entries.slice(-Math.max(1, Math.min(2_000, take))); }
}
