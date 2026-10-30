/** Tracks pages independently of realtime sockets and retained shared workers. */
export class BrowserPagePresence {
  private readonly pages = new Map<string, { seenAt: number; revision: number; open: boolean }>();
  private lastLaunch = Number.NEGATIVE_INFINITY;
  private readonly now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }
  private expire(): void {
    const oldest = this.now() - 20_000;
    for (const [id, page] of this.pages) if (page.seenAt <= oldest) this.pages.delete(id);
  }
  get count(): number { this.expire(); return [...this.pages.values()].filter(page => page.open).length; }
  update(id: unknown, open: unknown, revision: unknown = 0): boolean {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || typeof open !== 'boolean'
      || typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) return false;
    this.expire();
    const current = this.pages.get(id);
    if (current && revision < current.revision) return true;
    if (!current && this.pages.size >= 128) return false;
    // Closed revisions survive one lease so a delayed open cannot resurrect a tab.
    this.pages.set(id, { seenAt: this.now(), revision, open });
    return true;
  }
  tryBeginLaunch(): boolean {
    this.expire();
    if (this.count || this.now() - this.lastLaunch < 3_000) return false;
    this.lastLaunch = this.now(); return true;
  }
}
