import { isIP } from 'node:net';
import { SerializedAdapter } from './adapters.ts';
import { endpoint } from './transports.ts';
import { delay } from '../../core/outputs/lifecycle.ts';
import { durationFor, roundAway } from '../../core/outputs/codecs.ts';
import { optionalRecord, record } from '../../core/outputs/types.ts';
import type { OutputDependencies, OutputDeviceConfig, RuntimeMotionFrame, SignalOutputValue, VendorScriptState } from '../../core/outputs/types.ts';
import type { MotionAxis } from '../../core/runtime/model.ts';

function localHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.local') || host === '[::1]' || host === '::1') return true;
  if (!isIP(host)) return false;
  return host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || /^172\.(1[6-9]|2[0-9]|3[01])\./u.test(host) || /^(fc|fd|fe80:)/iu.test(host);
}
function vendorEndpoint(text: string): URL {
  const url = endpoint(text.endsWith('/') ? text : text + '/', ['http:', 'https:']);
  if (url.search || url.protocol === 'http:' && !localHost(url.hostname)) throw new TypeError('Remote device APIs require HTTPS.');
  return url;
}
function unwrap(value: Record<string, unknown>): Record<string, unknown> { return optionalRecord(value['result']) ?? value; }
function propertyDepth(value: unknown, depth = 0): void { if (depth > 32) throw new Error('Device API JSON is too deeply nested.'); if (value && typeof value === 'object') for (const child of Object.values(value)) propertyDepth(child, depth + 1); }
async function withSignal<T>(operation: Promise<T>, signal: AbortSignal, late?: (value: T) => void): Promise<T> {
  let abandoned = signal.aborted;
  void operation.then(value => { if (abandoned) late?.(value); }, () => {});
  if (signal.aborted) throw new Error('Device API operation was cancelled.');
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => { abort = () => { abandoned = true; reject(new Error('Device API operation was cancelled.')); }; signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([operation, cancelled]); } finally { signal.removeEventListener('abort', abort); }
}

export class VendorAdapter extends SerializedAdapter {
  #endpoint: URL;
  #mode = -1;
  #lastPosition = 0;
  #lastAt: number | null = null;
  #prepared = false;
  #playing = false;
  #loop = false;
  #position = 0;
  #serverOffset = 0;
  #handyV2Loop = false;
  #operationEpoch: number | null = null;
  #operationPreparation: AbortSignal | null = null;
  #preparations = new Set<AbortController>();
  #cancelledPreparation = false;
  readonly config: OutputDeviceConfig;
  readonly dependencies: OutputDependencies;
  constructor(config: OutputDeviceConfig, dependencies: OutputDependencies = {}) {
    super(); this.config = config; this.dependencies = dependencies;
    const options = config.device;
    if (!['Handy', 'Autoblow', 'VacuGlide', 'Lovense'].includes(config.type)) throw new TypeError('Unsupported vendor API.');
    if (![2, 3].includes(options.apiVersion) || !Number.isInteger(options.speed) || options.speed < 0 || options.speed > 100 || options.requestTimeoutMs < 100 || options.requestTimeoutMs > 15000 || options.scriptTimeoutMs < 100 || options.scriptTimeoutMs > 180000 || options.minIntervalMs < 25 || options.minIntervalMs > 10000) throw new RangeError('Invalid device API options.');
    if (!['Vibrate', 'Rotate', 'Pump', 'Thrusting', 'Fingering', 'Suction'].includes(options.function)) throw new TypeError('Unsupported Lovense function.');
    for (const credential of [options.connectionKey, options.apiKey, options.authToken]) if (credential.length > 4096 || /[^\x21-\x7e]/u.test(credential)) throw new TypeError('Device credentials require visible ASCII without spaces.');
    this.#endpoint = vendorEndpoint(options.endpoint || (config.type === 'Handy' ? options.apiVersion === 3 ? 'https://www.handyfeeling.com/api/handy-rest/v3/' : 'https://www.handyfeeling.com/api/handy/v2/' : config.type === 'Lovense' ? 'https://127-0-0-1.lovense.club:30010/' : 'https://latency.autoblowapi.com/'));
  }
  get prefix(): string { return this.config.type === 'Autoblow' ? 'autoblow/' : this.config.type === 'VacuGlide' ? 'vacuglide/' : ''; }
  now(): number { return this.dependencies.now?.() ?? Date.now(); }
  protected async connectCore(): Promise<void> {
    const { type, device: options } = this.config;
    if (type === 'Lovense') {
      if (!options.deviceId) throw new Error('Choose a specific Lovense toy before connecting.');
      const reply = await this.request('POST', 'command', { command: 'GetToys' });
      let toys = optionalRecord(reply['data'])?.['toys'];
      if (typeof toys === 'string') { try { toys = JSON.parse(toys) as unknown; } catch { toys = null; } }
      const status = optionalRecord(optionalRecord(toys)?.[options.deviceId])?.['status'];
      if (status !== '1' && status !== 1) throw new Error('The selected Lovense toy is not connected.');
    } else {
      if (!options.connectionKey) throw new Error('Configure a device connection key.');
      if (type === 'Handy' && options.apiVersion === 3 && !options.apiKey && !options.authToken) throw new Error('Handy API v3 requires an application key or client token.');
      const status = unwrap(await this.request('GET', this.prefix + 'connected'));
      if (status['connected'] !== true) throw new Error('The device is not connected to its API.');
      if (type !== 'Handy' && typeof status['cluster'] === 'string') this.#endpoint = this.cluster(status['cluster']);
      const info = unwrap(await this.request('GET', this.prefix + 'info'));
      if (type === 'Handy' && options.apiVersion === 2 && typeof info['fwVersion'] === 'string') {
        const match = /^(\d+)\.(\d+)/u.exec(info['fwVersion']);
        if (match && Number(match[1]) !== 3) throw new Error('This Handy firmware requires API v3.');
        this.#handyV2Loop = !!match && Number(match[1]) === 3 && Number(match[2]) >= 2;
      }
      if (type === 'VacuGlide' && typeof info['deviceType'] === 'string' && info['deviceType'] !== 'vacuglide') throw new Error('The selected device is not a VacuGlide.');
      if (type !== 'Handy') await this.request('GET', this.prefix + 'state');
    }
    this.#mode = -1; this.#lastAt = null; this.#prepared = this.#playing = this.#loop = false; this.#position = 0;
  }
  cluster(text: string): URL {
    const cluster = vendorEndpoint(text.includes('://') ? text : 'https://' + text);
    const same = cluster.origin === this.#endpoint.origin;
    const official = this.#endpoint.protocol === 'https:' && /(^|\.)autoblowapi\.com$/iu.test(this.#endpoint.hostname) && cluster.protocol === 'https:' && /(^|\.)autoblowapi\.com$/iu.test(cluster.hostname);
    const trusted = cluster.protocol === 'https:' && cluster.hostname.toLowerCase() === this.config.device.trustedClusterHost.toLowerCase();
    if (!same && !official && !trusted) throw new Error('The device API selected a different cluster; configure its exact trusted hostname.');
    return cluster;
  }
  async request(method: string, route: string, body?: unknown, timeoutMs = this.config.device.requestTimeoutMs): Promise<Record<string, unknown>> {
    this.checkOperation();
    const headers: Record<string, string> = { accept: 'application/json' }, options = this.config.device;
    if (this.config.type === 'Handy') {
      headers['X-Connection-Key'] = options.connectionKey;
      if (options.apiVersion === 3) { if (options.apiKey) headers['X-Api-Key'] = options.apiKey; if (options.authToken) headers['authorization'] = 'Bearer ' + options.authToken; }
    } else if (this.config.type !== 'Lovense') headers['x-device-token'] = options.connectionKey;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(this.#operationPreparation ? [this.#operationPreparation] : [])]);
    let response: Response;
    try { response = await withSignal((this.dependencies.fetch ?? fetch)(new URL(route, this.#endpoint), { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal }), signal, late => { void late.body?.cancel().catch(() => {}); }); }
    catch { throw new Error('Device API request failed or timed out.'); }
    try { this.checkOperation(true); } catch (error) { await response.body?.cancel(); throw error; }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Device API rejected the request (HTTP ${response.status}).`); }
    const length = Number(response.headers.get('content-length')); if (Number.isFinite(length) && length > 1048576) { await response.body?.cancel(); throw new Error('Device API response exceeds 1 MiB.'); }
    const reader = response.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    try {
      if (reader) while (true) { const part = await withSignal(reader.read(), signal); if (part.done) break; size += part.value.length; if (size > 1048576) throw new Error('Device API response exceeds 1 MiB.'); chunks.push(part.value); }
    } catch { await reader?.cancel(); throw new Error('Device API returned an invalid or oversized response.'); }
    finally { reader?.releaseLock(); }
    this.checkOperation(true);
    if (!size) return {};
    const buffer = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    let result: Record<string, unknown>;
    try { const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)); propertyDepth(raw); result = record(raw); }
    catch { throw new Error('Device API returned invalid JSON.'); }
    if (result['error'] !== undefined && result['error'] !== null && result['error'] !== false) throw new Error('Device API reported a device error.');
    if (this.config.type === 'Lovense' && result['code'] !== 200) throw new Error('Lovense API rejected the command.');
    if (typeof result['result'] === 'number' && result['result'] < 0) throw new Error('Device API reported a failed operation.');
    return result;
  }
  async mode(value: number): Promise<void> { if (this.#mode === value) return; await this.request('PUT', this.config.device.apiVersion === 3 ? 'mode2' : 'mode', { mode: value }); this.#mode = value; }
  protected async motionCore(frame: RuntimeMotionFrame): Promise<void> { await this.runGeneration(() => this.moveCore(frame)); }
  private checkOperation(afterResponse = false): void { if (afterResponse && !this.#operationPreparation) return; if (this.#operationPreparation?.aborted || this.#operationEpoch !== null && this.#operationEpoch !== this.lane.epoch) throw new Error('Device command was cancelled by a stop.'); }
  async runGeneration(operation: () => Promise<void>, preparation?: AbortSignal): Promise<void> { const previous = this.#operationEpoch, previousPreparation = this.#operationPreparation; this.#operationEpoch = this.lane.epoch; this.#operationPreparation = preparation ?? null; try { this.checkOperation(); await operation(); } finally { this.#operationEpoch = previous; this.#operationPreparation = previousPreparation; } }
  private cancelPreparation(): void { if (!this.#preparations.size) return; this.#cancelledPreparation = true; this.#prepared = this.#playing = this.#loop = false; this.#position = 0; for (const controller of this.#preparations) controller.abort(); this.dependencies.changed?.(); }
  override stop(): Promise<void> { this.cancelPreparation(); return super.stop(); }
  override close(): Promise<void> { this.cancelPreparation(); return super.close(); }
  private async moveCore(frame: RuntimeMotionFrame): Promise<void> {
    const options = this.config.device, axis = options.axis as MotionAxis;
    if (frame.activeAxes && !frame.activeAxes.includes(axis) || this.#playing) return;
    const position = frame.values[axis]; if (!Number.isFinite(position) || position < 0 || position > 1) throw new TypeError('Device position must be within 0–1.');
    const duration = durationFor(frame); if (duration > 600000) throw new RangeError('Device duration exceeds ten minutes.');
    if (this.#lastAt !== null) await delay(Math.max(0, options.minIntervalMs - (this.now() - this.#lastAt)));
    if (this.config.type === 'Handy') {
      await this.mode(2);
      await this.request('PUT', 'hdsp/xpt', options.apiVersion === 3 ? { xp: Math.round(position * 1000000) / 10000, t: duration, stop_on_target: true, immediate_rsp: true } : { position: Math.round(position * 1000000) / 10000, duration, stopOnTarget: true, immediateResponse: true });
    } else if (this.config.type === 'Autoblow') { this.#mode = 2; await this.request('PUT', 'autoblow/goto', { position: Math.round(position * 1000000) / 10000, speed: options.speed }); }
    else if (this.config.type === 'VacuGlide') { this.#mode = 2; await this.request('PUT', 'vacuglide/target-speed', { targetSpeed: Math.round(position * 1000000) / 10000 }); }
    else await this.request('POST', 'command', { command: 'Function', action: `${options.function}:${roundAway(position * (options.function === 'Pump' ? 3 : 20))}`, timeSec: 0, toy: options.deviceId, apiVer: 1, stopPrevious: 1 });
    const maximum = this.config.type === 'Lovense' ? options.function === 'Pump' ? 3 : 20 : 100;
    const value = this.config.type === 'Lovense' ? roundAway(position * maximum) : Math.round(position * 1000000) / 10000;
    this.dependencies.telemetry?.recordTarget(axis, this.config.type === 'VacuGlide' ? 'Speed' : this.config.type === 'Lovense' ? options.function : 'Position', value, maximum);
    this.#lastPosition = position; this.#lastAt = this.now();
  }
  protected async signalCore(_value: SignalOutputValue): Promise<void> { throw new Error('Vendor devices require an axis frame.'); }
  scriptState(): VendorScriptState { return { supported: this.config.type !== 'Lovense', loopSupported: this.config.type === 'Handy' ? this.config.device.apiVersion === 3 || this.#handyV2Loop : this.config.type !== 'Lovense', prepared: this.#prepared, playing: this.#playing, loop: this.#loop, positionMs: this.#position }; }
  async vendorScript(action: string, raw?: unknown): Promise<void> {
    if (action === 'stop') { await this.stop(); return; }
    const options = optionalRecord(raw) ?? {};
    const preparation = action === 'prepare' ? new AbortController() : null; if (preparation) this.#preparations.add(preparation);
    try { await this.lane.enqueue(() => this.runGeneration(async () => {
      this.requireReady(); if (this.config.type === 'Lovense') throw new Error('Lovense does not expose synchronized script playback.');
      if ((action === 'play' || action === 'seek') && this.dependencies.canSend && !this.dependencies.canSend()) throw new Error('Input is no longer active.');
      if (action === 'prepare') {
        const source = typeof options['url'] === 'string' ? options['url'] : this.config.device.scriptUrl;
        const url = endpoint(source, ['http:', 'https:']); if (url.href.length > 8192) throw new Error('Script URL exceeds its limit.');
        if (this.config.type === 'Handy' && (this.config.device.scriptFormat === 'Funscript' || url.pathname.toLowerCase().endsWith('.funscript'))) throw new Error('Handy synchronized playback requires a CSV URL.');
        if (this.config.type !== 'Handy' && url.protocol !== 'https:') throw new Error('Cloud script downloads require an HTTPS URL.');
        if (this.#playing) await this.stopScript(); this.#prepared = false; this.#loop = false;
        if (this.config.type === 'Handy') {
          await this.mode(1); await this.request('PUT', 'hssp/setup', { url: url.href }, this.config.device.scriptTimeoutMs);
          if (this.config.device.offsetMs) await this.request('PUT', 'hstp/offset', { offset: this.config.device.offsetMs });
          await this.synchronizeTime();
        } else {
          const format = this.config.device.scriptFormat === 'Funscript' || url.pathname.toLowerCase().endsWith('.funscript') ? 'funscript' : 'csv';
          await this.request('PUT', this.prefix + `sync-script/upload-${format}-url`, { url: url.href }, this.config.device.scriptTimeoutMs);
          if (this.config.device.offsetMs) await this.request('PUT', this.prefix + 'sync-script/offset', { offsetTimeMs: this.config.device.offsetMs });
        }
        this.checkOperation(); this.#position = 0; this.#prepared = true;
      } else if (action === 'loop') {
        if (!this.#prepared || this.#playing || !this.scriptState().loopSupported || typeof options['loop'] !== 'boolean') throw new Error('Choose looping while a prepared script is paused.');
        if (this.config.type === 'Handy' && this.config.device.apiVersion === 2) await this.mode(1);
        await this.applyLoop(options['loop']); this.#loop = options['loop'];
      } else if (action === 'play' || action === 'seek') {
        const position = typeof options['positionMs'] === 'number' ? options['positionMs'] : action === 'play' ? 0 : this.#position;
        if (!Number.isInteger(position) || position < 0 || position > (this.config.type === 'Handy' ? 86400000 : 16777214)) throw new RangeError('Script position exceeds the API range.');
        if (!this.#prepared) throw new Error('Prepare a script before playback.');
        if (action === 'play' || this.#playing) await this.play(position); else this.#position = position;
      } else throw new Error('Unknown vendor script action.');
    }, preparation?.signal)); } finally { if (preparation) this.#preparations.delete(preparation); }
    this.dependencies.changed?.();
  }
  async applyLoop(value: boolean): Promise<void> { if (this.config.type === 'Handy') { if (this.config.device.apiVersion === 2) await this.request('PUT', 'hssp/loop', { activated: value }); } else await this.request('PUT', this.prefix + 'sync-script/loop', { loop: value }); }
  async play(position: number): Promise<void> {
    if (this.config.type === 'Handy') { await this.mode(1); if (this.scriptState().loopSupported) await this.applyLoop(this.#loop); const time = this.now() + this.#serverOffset; await this.request('PUT', 'hssp/play', this.config.device.apiVersion === 3 ? { start_time: position, server_time: time, loop: this.#loop } : { startTime: position, estimatedServerTime: time }); }
    else { await this.applyLoop(this.#loop); await this.request('PUT', this.prefix + 'sync-script/start', { startTimeMs: position }); }
    this.#position = position; this.#playing = true; this.#mode = 1;
  }
  async synchronizeTime(): Promise<void> {
    let best = Infinity;
    for (let count = 0; count < 3; count++) { const before = this.now(), response = unwrap(await this.request('GET', 'servertime')), after = this.now(); const server = response[this.config.device.apiVersion === 3 ? 'server_time' : 'serverTime']; if (typeof server !== 'number' || !Number.isSafeInteger(server) || server < 0) throw new Error('Handy returned an invalid server time.'); const trip = Math.max(0, after - before); if (trip < best) { best = trip; this.#serverOffset = server - before - trip / 2; } }
  }
  async stopScript(): Promise<void> { if (this.config.type === 'Handy') { if (this.#mode === 1) await this.request('PUT', 'hssp/stop'); } else await this.request('PUT', this.prefix + 'sync-script/stop', {}); this.#playing = false; }
  protected async stopCore(): Promise<void> {
    if (this.config.type === 'VacuGlide') { await this.request('PUT', 'vacuglide/target-speed/stop'); this.#playing = false; }
    else {
      if (this.#prepared || this.#cancelledPreparation) await this.stopScript();
      if (this.config.type === 'Handy' && this.#mode === 2) await this.request('PUT', 'hdsp/xpvp', this.config.device.apiVersion === 3 ? { xp: this.#lastPosition * 100, vp: 0, stop_on_target: true, immediate_rsp: true } : { position: this.#lastPosition * 100, velocity: 0, stopOnTarget: true, immediateResponse: true });
      else if (this.config.type === 'Autoblow' && this.#mode === 2) await this.request('PUT', 'autoblow/oscillate', { speed: 0, minY: 0, maxY: 100 });
      else if (this.config.type === 'Lovense') await this.request('POST', 'command', { command: 'Function', action: 'Stop', timeSec: 0, toy: this.config.device.deviceId, apiVer: 1 });
    }
    this.#lastAt = null; this.#cancelledPreparation = false;
  }
  protected async closeCore(): Promise<void> { this.#prepared = this.#playing = this.#loop = this.#cancelledPreparation = false; this.#mode = -1; }
}
