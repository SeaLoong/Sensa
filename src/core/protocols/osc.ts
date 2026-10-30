/** OSC values, packet framing and per-source catalog; no host APIs. */
export type OscValue = number | boolean;
export type OscValueType = 'Float' | 'Int' | 'Bool';
export interface OscSource { key: string; label: string; persistentId: string | null; address: string; port: number }
export interface OscEntry { value: OscValue; valueType: OscValueType; timestampMs: number; source: OscSource; sequence: number; changedAtMs: number; sourceSequence: number }
export interface OscSnapshotEntry { path: string; entry: OscEntry }
export interface OscSourceSnapshot extends OscSource { parameterCount: number; lastSeenTimestampMs: number }
export const unknownOscSource: Readonly<OscSource> = { key: 'unknown', label: '未知来源', persistentId: null, address: '', port: 0 };
export function oscNumber(value: OscValue): number { return typeof value === 'boolean' ? value ? 1 : 0 : value; }
export function matchesOscPath(pattern: string, path: string): boolean {
  if (!pattern || !path) return false;
  if (pattern.includes(';') || pattern.includes('\n')) return pattern.split(/[;\n]/).map(value => value.trim()).filter(Boolean).slice(0, 32).some(value => matchesOscPath(value, path));
  if (!pattern.includes('*')) return pattern === path;
  const parts = pattern.split('/'), paths = path.split('/');
  if (parts.length > 64 || paths.length > 64) return false;
  let row = Array<boolean>(paths.length + 1).fill(false); row[0] = true;
  for (const segment of parts) {
    const next = Array<boolean>(paths.length + 1).fill(false);
    if (segment === '**') next[0] = row[0] ?? false;
    for (let j = 1; j <= paths.length; j++) next[j] = segment === '**' ? !!row[j] || !!next[j - 1]
      : !!row[j - 1] && (segment === '*' || segment === paths[j - 1]);
    row = next;
  }
  return row[paths.length] ?? false;
}
export class OscParameterStore {
  static readonly maxPaths = 4096;
  static readonly maxSources = 32;
  #entries = new Map<string, Map<string, OscEntry>>();
  #sources = new Map<string, OscSourceSnapshot>();
  #sourceSequences = new Map<string, number>();
  #entryCount = 0;
  #lastPrune = 0;
  #sequence = 0;
  #revision = 0;
  readonly now: () => number;
  preferredSourceKey: string | null = null;
  readonly onSet = new Set<(path: string, value: OscValue, source: OscSource) => void>();
  readonly onAvatarChanged = new Set<() => void>();
  constructor(now: () => number = Date.now) { this.now = now; }
  get revision(): number { return this.#revision; }
  get sourceCount(): number { return this.#sources.size; }
  get allPaths(): string[] { return [...this.#entries.keys()]; }
  set(path: string, value: OscValue, rawSource: OscSource = unknownOscSource, valueType?: OscValueType): boolean {
    if (!path.trim() || path.length > 512 || !Number.isFinite(oscNumber(value))) return false;
    path = path.trim(); const timestampMs = this.now();
    const source: OscSource = { key: rawSource.key.trim() || 'unknown', label: rawSource.label.trim() || rawSource.key.trim() || 'unknown',
      persistentId: rawSource.persistentId?.trim() || null, address: rawSource.address.trim(),
      port: Number.isInteger(rawSource.port) && rawSource.port > 0 && rawSource.port <= 65535 ? rawSource.port : 0 };
    if (timestampMs - this.#lastPrune > 10000) {
      this.#lastPrune = timestampMs;
      for (const previous of this.#sources.values()) if (timestampMs - previous.lastSeenTimestampMs > 300000) this.#removeSource(previous.key);
    }
    const existing = this.#entries.get(path)?.get(source.key);
    if ((!existing && this.#entryCount >= OscParameterStore.maxPaths)
      || (!this.#sources.has(source.key) && this.#sources.size >= OscParameterStore.maxSources)) return false;
    let bucket = this.#entries.get(path); if (!bucket) { bucket = new Map(); this.#entries.set(path, bucket); }
    const inferred = valueType ?? (typeof value === 'boolean' ? 'Bool' : Number.isInteger(value) ? 'Int' : 'Float');
    const sequence = (this.#sourceSequences.get(source.key) ?? 0) + 1; this.#sourceSequences.set(source.key, sequence);
    bucket.set(source.key, { value, valueType: inferred, source, timestampMs, sequence: ++this.#sequence,
      sourceSequence: sequence, changedAtMs: existing && existing.value === value && existing.valueType === inferred ? existing.changedAtMs : timestampMs });
    const oldSource = this.#sources.get(source.key);
    this.#sources.set(source.key, { ...source, parameterCount: (oldSource?.parameterCount ?? 0) + (existing ? 0 : 1), lastSeenTimestampMs: timestampMs });
    if (!existing) this.#entryCount++;
    this.#revision++;
    for (const callback of this.onSet) callback(path, value, source);
    return true;
  }
  tryGetLatest(pattern: string, sourceKey: string | null = this.preferredSourceKey): OscSnapshotEntry | undefined {
    let latest: OscSnapshotEntry | undefined;
    for (const row of this.matchingEntries(pattern, sourceKey)) if (!latest || row.entry.timestampMs > latest.entry.timestampMs) latest = row;
    return latest;
  }
  matchingEntries(pattern: string, sourceKey: string | null = null): OscSnapshotEntry[] {
    const result: OscSnapshotEntry[] = [];
    if (!pattern.trim()) return result;
    const buckets = !/[;\n*]/.test(pattern) ? [[pattern, this.#entries.get(pattern)] as const] : this.#entries;
    for (const [path, bucket] of buckets) {
      if (!bucket || !matchesOscPath(pattern, path)) continue;
      for (const entry of bucket.values()) if (!sourceKey?.trim() || entry.source.key === sourceKey.trim()) result.push({ path, entry });
    }
    return result;
  }
  snapshotEntries(prefix?: string, sourceKey?: string | null): OscSnapshotEntry[] {
    const result: OscSnapshotEntry[] = [];
    for (const [path, bucket] of this.#entries) {
      if (prefix !== undefined && !path.startsWith(prefix)) continue;
      for (const entry of bucket.values()) if (!sourceKey || entry.source.key === sourceKey) result.push({ path, entry });
    }
    return result;
  }
  snapshotSources(): OscSourceSnapshot[] { return [...this.#sources.values()].sort((a, b) => b.lastSeenTimestampMs - a.lastSeenTimestampMs); }
  clearSource(key: string): void { this.#removeSource(key); this.#revision++; }
  #removeSource(key: string): void {
    for (const [path, bucket] of this.#entries) { if (bucket.delete(key)) this.#entryCount--; if (!bucket.size) this.#entries.delete(path); }
    this.#sources.delete(key); this.#sourceSequences.delete(key);
  }
  clear(): void { this.#entries.clear(); this.#sources.clear(); this.#sourceSequences.clear(); this.#entryCount = 0; this.#revision++; }
  changeAvatar(sourceKey?: string): void { if (sourceKey?.trim()) this.clearSource(sourceKey); else this.clear(); for (const callback of this.onAvatarChanged) callback(); }
}
export interface OscPacketResult { handled: boolean; values: { path: string; value: OscValue; valueType: OscValueType }[]; avatarChanged: boolean; unhandled: Uint8Array[] }
function oscString(data: Uint8Array, cursor: { value: number }): string | null {
  const end = data.indexOf(0, cursor.value); if (end < 0) return null;
  const bytes = data.subarray(cursor.value, end); if (bytes.some(value => value > 127)) return null;
  const padded = (end + 4) & ~3; if (padded > data.length) return null;
  cursor.value = padded; return String.fromCharCode(...bytes);
}
/** Avatar packets retain mixed bundle ordering/timetags for transparent forwarding. */
export function parseOscPacket(input: Uint8Array, depth = 0): OscPacketResult {
  const result: OscPacketResult = { handled: false, values: [], avatarChanged: false, unhandled: [] };
  const unhandled = (): OscPacketResult => ({ ...result, unhandled: [input] });
  if (depth > 16 || input.length < 8) return unhandled();
  const cursor = { value: 0 }, address = oscString(input, cursor);
  if (!address) return unhandled();
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (address === '#bundle') {
    if (input.length < 16) return unhandled(); cursor.value += 8;
    const nestedRaw: Uint8Array[] = [];
    while (cursor.value + 4 <= input.length) {
      const size = view.getInt32(cursor.value); cursor.value += 4;
      if (size <= 0 || size > input.length - cursor.value) break;
      const child = parseOscPacket(input.slice(cursor.value, cursor.value + size), depth + 1); cursor.value += size;
      result.handled ||= child.handled; result.avatarChanged ||= child.avatarChanged; result.values.push(...child.values); nestedRaw.push(...child.unhandled);
    }
    if (nestedRaw.length) result.unhandled = result.handled ? [encodeOscBundle(nestedRaw, input.slice(8, 16))] : [input];
    return result;
  }
  const tags = oscString(input, cursor);
  if (!tags?.startsWith(',') || tags.length < 2) return unhandled();
  if (address === '/avatar/change') return { ...result, handled: true, avatarChanged: true };
  if (!address.startsWith('/avatar/parameters/') || !address.slice(19).trim()) return unhandled();
  let value: OscValue, valueType: OscValueType;
  switch (tags[1]) {
    case 'f': if (cursor.value + 4 > input.length) return unhandled(); value = view.getFloat32(cursor.value); valueType = 'Float'; break;
    case 'i': if (cursor.value + 4 > input.length) return unhandled(); value = view.getInt32(cursor.value); valueType = 'Int'; break;
    case 'T': value = true; valueType = 'Bool'; break;
    case 'F': value = false; valueType = 'Bool'; break;
    default: return unhandled();
  }
  if (!Number.isFinite(oscNumber(value))) return unhandled();
  return { ...result, handled: true, values: [{ path: address.slice(19), value, valueType }] };
}
function encodedString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value); const result = new Uint8Array((bytes.length + 4) & ~3); result.set(bytes); return result;
}
export function encodeOscMessage(path: string, value: OscValue, type: OscValueType = typeof value === 'boolean' ? 'Bool' : 'Float'): Uint8Array {
  if (!path.startsWith('/') || path.includes('\0') || !Number.isFinite(oscNumber(value))) throw new Error('Invalid OSC message.');
  const address = encodedString(path), tags = encodedString(type === 'Bool' ? value ? ',T' : ',F' : type === 'Int' ? ',i' : ',f');
  const result = new Uint8Array(address.length + tags.length + (type === 'Bool' ? 0 : 4)); result.set(address); result.set(tags, address.length);
  if (type !== 'Bool') { const view = new DataView(result.buffer); if (type === 'Int') view.setInt32(address.length + tags.length, oscNumber(value)); else view.setFloat32(address.length + tags.length, oscNumber(value)); }
  return result;
}
export function encodeOscBundle(packets: readonly Uint8Array[], timeTag = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1])): Uint8Array {
  if (timeTag.length !== 8) throw new Error('An OSC timetag is eight bytes.');
  const result = new Uint8Array(16 + packets.reduce((sum, packet) => sum + 4 + packet.length, 0)); result.set(encodedString('#bundle')); result.set(timeTag, 8);
  const view = new DataView(result.buffer); let at = 16;
  for (const packet of packets) { view.setInt32(at, packet.length); at += 4; result.set(packet, at); at += packet.length; }
  return result;
}
