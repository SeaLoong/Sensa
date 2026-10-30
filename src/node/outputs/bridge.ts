import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { SerializedAdapter } from './adapters.ts';
import { TcpTransport } from './transports.ts';
import { deadline } from '../../core/outputs/lifecycle.ts';
import { clamp, hasControl } from '../../core/outputs/types.ts';
import { durationFor, roundAway } from '../../core/outputs/codecs.ts';
import type { BridgeProcess, OutputDependencies, OutputDeviceConfig, RuntimeMotionFrame, SignalOutputValue } from '../../core/outputs/types.ts';
import type { MotionAxis } from '../../core/runtime/model.ts';

export function spawnBridgeProcess(executable: string, args: readonly string[]): BridgeProcess {
  const child = spawn(executable, [...args], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let readyResolve: (() => void) | null = null, readyReject: ((error: Error) => void) | null = null;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  // The child has already bound this exact address before it announces readiness.
  const listen = args[args.indexOf('--listen') + 1]; let stdout = '';
  child.stdout.on('data', (bytes: Buffer) => {
    stdout += bytes.toString('utf8'); if (stdout.length > 65536) stdout = stdout.slice(-65536);
    if (listen && stdout.split(/\r?\n/u).some(line => line.startsWith(`BLE output ready at ${listen};`))) { readyResolve?.(); readyResolve = readyReject = null; }
  });
  child.stderr.on('data', () => { /* Errors are represented without forwarding native output or credentials. */ });
  const exited = new Promise<number | null>(resolve => {
    child.once('error', () => { readyReject?.(new Error('The Python BLE bridge could not be started.')); readyResolve = readyReject = null; resolve(null); });
    child.once('exit', code => { readyReject?.(new Error('The Python BLE bridge stopped before becoming ready.')); readyResolve = readyReject = null; resolve(code); });
  });
  return { ready, exited, async stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    try { await deadline(exited, 2000, 'BLE bridge shutdown'); }
    catch { child.kill('SIGKILL'); await deadline(exited, 2000, 'BLE bridge termination'); }
  } };
}
async function unusedLoopbackPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()); });
  const address = server.address(); if (!address || typeof address === 'string') { server.close(); throw new Error('Could not allocate a loopback bridge port.'); }
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); return address.port;
}
export async function resolveBridgeScript(dependencies: OutputDependencies): Promise<string> {
  const filename = dependencies.bridgeScriptPath ? path.resolve(dependencies.bridgeScriptPath)
    : path.join(dependencies.baseDirectory ?? path.dirname(process.argv[1] ?? process.execPath), 'tools', 'protocol-bridge', 'bridge.py');
  await access(filename); return filename;
}

export class BleBridgeAdapter extends SerializedAdapter {
  readonly config: OutputDeviceConfig;
  readonly dependencies: OutputDependencies;
  #process: BridgeProcess | null = null;
  #transport: TcpTransport | null = null;
  #keepalive: ReturnType<typeof setInterval> | null = null;
  #last: string | null = null;
  #keeping = false;
  #childAlive = false;
  constructor(config: OutputDeviceConfig, dependencies: OutputDependencies = {}) { super(); this.config = config; this.dependencies = dependencies; }
  override get connected(): boolean { return this.ready && this.#transport?.connected === true && this.#process !== null && this.#childAlive; }
  protected async connectCore(): Promise<void> {
    const options = this.config.bridge;
    if (options && ('python' in options || 'scriptPath' in options)) throw new Error('Bridge runtime paths are trusted host settings, not device configuration.');
    if (typeof options?.device !== 'string' || !options.device || options.device.length > 4096 || hasControl(options.device) || !['loob', 'thrust-sync', 'svakom-v1', 'lovense-single', 'youou-vx001'].includes(options.protocol)) throw new Error('Choose an explicit BLE device and supported bridge profile.');
    const port = options.listenPort ?? await unusedLoopbackPort(), python = this.dependencies.bridgePython || (process.platform === 'win32' ? 'python' : 'python3');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a valid BLE bridge listener port.');
    const script = await resolveBridgeScript(this.dependencies), args = ['-u', script, 'ble-output', '--protocol', options.protocol, '--device', options.device, '--listen', `tcp://127.0.0.1:${port}`, '--timeout', '2', '--idle', '120'];
    const child = (this.dependencies.bridgeProcessFactory ?? spawnBridgeProcess)(python, args); this.#process = child; this.#childAlive = true;
    void child.exited.then(() => { if (this.#process === child) { this.#childAlive = false; this.ready = false; this.#last = null; if (this.#keepalive) clearInterval(this.#keepalive); this.#keepalive = null; void this.#transport?.close(); this.dependencies.changed?.(); } });
    try {
      if (child.ready) await deadline(child.ready, 15000, 'BLE bridge device connection', () => { void child.stop(); });
      this.#transport = new TcpTransport('127.0.0.1', port); await this.#transport.connect(); if (!this.#childAlive) throw new Error('The BLE bridge stopped before the connection was adopted.');
      this.#keepalive = setInterval(() => {
        if (this.#keeping || !this.#last || !this.connected || this.dependencies.canSend && !this.dependencies.canSend()) return;
        this.#keeping = true;
        void this.lane.enqueue(async () => { if (this.#last && this.connected && (!this.dependencies.canSend || this.dependencies.canSend())) await this.#transport?.send(new TextEncoder().encode(this.#last)); }).catch(() => { this.ready = false; }).finally(() => { this.#keeping = false; });
      }, 1000); this.#keepalive.unref?.();
    } catch (error) { await child.stop(); this.#process = null; await this.#transport?.close(); this.#transport = null; throw error; }
  }
  protected async motionCore(frame: RuntimeMotionFrame): Promise<void> {
    const profile = this.config.bridge?.protocol, scalar = profile === 'svakom-v1' || profile === 'lovense-single' || profile === 'youou-vx001';
    const axis = (this.config.device.axis || (scalar ? 'V0' : 'L0')) as MotionAxis;
    if (frame.activeAxes && !frame.activeAxes.includes(axis)) return;
    const magnitude = String(Math.min(999, roundAway(clamp(frame.values[axis]) * 1000))).padStart(3, '0');
    const duration = durationFor(frame); if (!scalar && duration > 65535) throw new RangeError('BLE arrival duration exceeds 65535 ms.');
    const line = scalar ? `V0${magnitude}\n` : `L0${magnitude}I${duration}\n`;
    await this.#transport?.send(new TextEncoder().encode(line)); this.dependencies.telemetry?.recordTCode(line); this.#last = line;
  }
  protected async signalCore(_value: SignalOutputValue): Promise<void> { throw new Error('BLE output requires an axis frame.'); }
  protected async stopCore(): Promise<void> {
    this.#last = null; if (this.#keepalive) clearInterval(this.#keepalive); this.#keepalive = null;
    const child = this.#process;
    try { if (this.#transport?.connected) await this.#transport.send(new TextEncoder().encode('DSTOP\n')); if (child) await deadline(child.exited, 6000, 'BLE device stop'); }
    finally { await this.#transport?.close(); this.#transport = null; this.ready = false; this.#process = null; await child?.stop(); }
  }
  protected async closeCore(): Promise<void> { const child = this.#process; this.#process = null; this.#last = null; if (this.#keepalive) clearInterval(this.#keepalive); this.#keepalive = null; await this.#transport?.close(); this.#transport = null; await child?.stop(); }
}
