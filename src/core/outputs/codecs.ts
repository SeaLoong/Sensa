import type { RuntimeMotionFrame, OutputDeviceConfig } from './types.ts';
import type { TCodeMotionProfile, TCodeAxisConfig } from '../runtime/model.ts';
import { motionAxes } from '../runtime/model.ts';
import { roundHalfToEven } from '../runtime/recording.ts';
import { encodeOscMessage } from '../protocols/osc.ts';
import { clamp, finite, identifier, hasControl } from './types.ts';
import type { SignalOutputValue } from './types.ts';

export const MOTION_AXES = motionAxes;
export type OutputMotionAxis = typeof MOTION_AXES[number];
export function roundAway(value: number): number { return value < 0 ? -Math.round(-value) : Math.round(value); }
export function typedValue(sample: SignalOutputValue): number | boolean {
  if (sample.type !== undefined && !['Float', 'Int', 'Bool'].includes(sample.type)) throw new TypeError('Unsupported output value type.');
  const value = finite(sample.value);
  if (sample.type === 'Bool') return value >= .5;
  if (sample.type === 'Int') {
    const rounded = roundAway(value);
    if (rounded < -2147483648 || rounded > 2147483647) throw new RangeError('Integer output exceeds int32.');
    return rounded;
  }
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded)) throw new RangeError('Float output exceeds float32.');
  return rounded;
}
export function encodeJson(sample: SignalOutputValue): Uint8Array {
  if (!sample.address.trim() || sample.address.length > 512 || hasControl(sample.address)) throw new TypeError('Invalid signal address.');
  return new TextEncoder().encode(JSON.stringify({ address: sample.address, value: typedValue(sample), type: sample.type ?? 'Float',
    signalId: sample.signalId ?? '', unit: sample.unit ?? '', timestampMs: sample.timestampMs ?? 0, coordinateFrame: sample.coordinateFrame ?? null }));
}
export function concatBytes(...values: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0));
  let offset = 0; for (const value of values) { result.set(value, offset); offset += value.length; } return result;
}
export function encodeOsc(sample: SignalOutputValue): Uint8Array {
  const address = sample.address.trim();
  if (address.length < 2 || !address.startsWith('/') || address.length > 512 || /[\s*?[\]{},#]/u.test(address) || hasControl(address)) throw new TypeError('OSC requires a concrete parameter path.');
  return encodeOscMessage(address, typedValue(sample), sample.type ?? 'Float');
}
export function encodeMidi(sample: SignalOutputValue): Uint8Array {
  const match = /^CC\/([0-9]+)\/([0-9]+)$/iu.exec(sample.address);
  if (!match) throw new TypeError('MIDI address must be CC/channel/controller, channels 1–16.');
  const channel = Number(match[1]), controller = Number(match[2]);
  if (channel < 1 || channel > 16 || controller > 127) throw new RangeError('MIDI controller must be 0–127.');
  if (sample.type !== undefined && !['Float', 'Int'].includes(sample.type)) throw new TypeError('MIDI CC requires a numeric value.');
  if (sample.value < 0 || sample.value > 127) throw new RangeError('MIDI CC value must be 0–127.');
  const amount = roundAway(finite(sample.value));
  if (!Number.isInteger(amount) || amount < 0 || amount > 127) throw new RangeError('MIDI CC value must be 0–127.');
  return Uint8Array.of(0xb0 | (channel - 1), controller, amount);
}
function mqttString(text: string): Uint8Array {
  if (text.includes('\0')) throw new TypeError('MQTT text cannot contain NUL.');
  const value = new TextEncoder().encode(text); if (value.length > 65535) throw new RangeError('MQTT text too long.');
  return concatBytes(Uint8Array.of(value.length >> 8, value.length & 255), value);
}
function mqttPacket(header: number, body: Uint8Array): Uint8Array {
  const length: number[] = []; let remaining = body.length;
  do { const digit = remaining % 128; remaining = Math.floor(remaining / 128); length.push(digit | (remaining ? 128 : 0)); } while (remaining);
  return concatBytes(Uint8Array.of(header, ...length), body);
}
export function encodeMqttConnect(clientId: string, keepAlive = 30, username?: string, password?: string): Uint8Array {
  if (!clientId || clientId.length > 128 || !Number.isInteger(keepAlive) || keepAlive < 10 || keepAlive > 300 || (password !== undefined && username === undefined)) throw new TypeError('Invalid MQTT connection settings.');
  const flags = 2 | (username === undefined ? 0 : 0x80) | (password === undefined ? 0 : 0x40);
  return mqttPacket(0x10, concatBytes(mqttString('MQTT'), Uint8Array.of(4, flags, keepAlive >> 8, keepAlive & 255), mqttString(clientId),
    username === undefined ? new Uint8Array() : mqttString(username), password === undefined ? new Uint8Array() : mqttString(password)));
}
export function encodeMqttPublish(topic: string, payload: Uint8Array): Uint8Array {
  if (!topic.trim() || topic.length > 512 || /[#+]/u.test(topic) || hasControl(topic) || payload.length > 65536) throw new TypeError('Invalid MQTT topic or payload size.');
  return mqttPacket(0x30, concatBytes(mqttString(topic), payload));
}
export function durationFor(frame: RuntimeMotionFrame): number {
  const value = frame.requestedCommandMode === 'None' ? 0 : frame.requestedCommandMode === 'Interval' ? frame.requestedMotionValue ?? frame.deltaMs : frame.deltaMs;
  if (!Number.isFinite(value) || value < 0 || value > 4294967295) throw new RangeError('Motion duration must be unsigned milliseconds.');
  return roundAway(value);
}
function defaultAxis(): TCodeAxisConfig { return { min: 0, max: 999, remapMin: 0, remapMax: 999, maxSpeed: 999,
  invert: false, mode: 'Normal', commandMode: 'Interval', rampType: 'None', lockValue: .5 }; }
export class TCodeEncoder {
  #last: Partial<Record<OutputMotionAxis, number>> = {};
  #lastSource: RuntimeMotionFrame | null = null;
  #velocity: Partial<Record<OutputMotionAxis, number>> = {};
  reset(): void { this.#last = {}; this.#lastSource = null; this.#velocity = {}; }
  encode(frame: RuntimeMotionFrame, profile?: TCodeMotionProfile, output?: OutputDeviceConfig, force = false): string {
    const terms: string[] = [];
    for (const axis of MOTION_AXES) {
      if (frame.activeAxes && !frame.activeAxes.includes(axis)) continue;
      const config = profile?.[axis.toLowerCase() as Lowercase<OutputMotionAxis>] ?? defaultAxis();
      if (config.mode === 'Ignored') continue;
      let value = Math.fround(config.mode === 'Locked' ? config.lockValue : frame.values[axis]);
      value = clamp(config.invert ? Math.fround(1 - value) : value);
      const min = clamp(config.min, 0, 999), max = clamp(config.max, min, 999);
      const remapMin = clamp(config.remapMin, 0, 999), remapMax = clamp(config.remapMax, remapMin, 999);
      value = clamp(Math.fround(Math.fround(remapMin + Math.fround(value * (remapMax - remapMin))) / 1000), Math.fround(min / 1000), Math.fround(max / 1000));
      const previous = this.#last[axis] ?? (axis.startsWith('V') ? 0 : .5);
      const mode = frame.requestedCommandMode ?? (output?.slopeMode === 'Speed' ? 'Speed' : output?.slopeMode === 'Interval' ? 'Interval' : output?.slopeMode === 'NoSlope' ? 'None' : config.commandMode);
      const instructionsChanged = this.#lastSource?.requestedCommandMode !== frame.requestedCommandMode || this.#lastSource?.requestedMotionValue !== frame.requestedMotionValue;
      if (!force && !frame.activeAxes && Math.abs(Math.fround(value - previous)) < Math.fround(.0001) && !instructionsChanged && this.#lastSource) continue;
      const delta = Math.max(1, roundHalfToEven(finite(frame.deltaMs)));
      const speedLimit = clamp(config.maxSpeed, 1, 999);
      const explicitSpeed = (frame.requestedCommandMode === undefined || frame.requestedCommandMode === 'Speed') && frame.requestedMotionValue !== undefined && frame.requestedMotionValue > 0 ? clamp(frame.requestedMotionValue, 1, speedLimit) : null;
      let term = '';
      if (mode === 'Interval') {
        const interval = frame.requestedCommandMode === 'Interval' ? Math.max(1, frame.requestedMotionValue !== undefined && frame.requestedMotionValue > 0 ? frame.requestedMotionValue : delta)
          : Math.max(1, Math.ceil(Math.abs(Math.fround(value - previous)) * 999 * 100 / (explicitSpeed ?? speedLimit)));
        term = `I${interval}`;
      } else if (mode === 'Speed') {
        const speedPrevious = this.#velocity[axis];
        const speed = explicitSpeed ?? (speedPrevious === undefined ? 0 : Math.min(speedLimit, Math.ceil(Math.abs(Math.fround(value - speedPrevious)) * 999 * 100 / Math.max(1, frame.deltaMs))));
        if (explicitSpeed === null) this.#velocity[axis] = value;
        term = `S${speed * (output?.speedUnitBase === 'PerSecond' ? 10 : 1)}`;
      }
      const ramp = config.rampType === 'Linear' ? '=' : config.rampType === 'EaseIn' ? '<' : config.rampType === 'EaseOut' ? '>' : config.rampType === 'EaseInOut' ? '<>' : '';
      terms.push(axis + String(clamp(roundHalfToEven(Math.fround(value * 1000)), 0, 999)).padStart(3, '0') + term + (term ? ramp : ''));
      this.#last[axis] = value;
    }
    this.#lastSource = structuredClone(frame);
    return terms.length ? terms.join(' ') + '\n' : '';
  }
}
export interface DglabTarget { clientId: string; slotId: string; channel: number }
function targetBody(target: DglabTarget): { s: string; c: number } {
  identifier(target.clientId); identifier(target.slotId); if (target.channel !== 0 && target.channel !== 1) throw new RangeError('Invalid DG-LAB channel.');
  return { s: target.slotId, c: target.channel };
}
export function dglabOperation(target: DglabTarget, value: number, durationMs: number): Record<string, unknown> {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(durationMs) || durationMs < 1 || durationMs > 10000) throw new RangeError('Invalid DG-LAB intensity or duration.');
  return { ...targetBody(target), t: 4, v: value, d: durationMs, im: true, p: 1 };
}
export function dglabPulse(target: DglabTarget, frames: readonly string[], durationMs: number, version = 3): Record<string, unknown> {
  dglabOperation(target, 0, durationMs);
  if (![2, 3].includes(version) || !frames.length || frames.length > 256 || frames.some(frame => !new RegExp(`^[0-9a-fA-F]{${version === 2 ? 6 : 16}}$`, 'u').test(frame))) throw new TypeError('Invalid DG-LAB pulse frames.');
  return { ...targetBody(target), t: 0, v: frames.map(frame => frame.toUpperCase()), d: durationMs, im: true, p: 1, ver: version };
}
export function dglabReset(target: DglabTarget): Record<string, unknown> { return { ...targetBody(target), t: 7, v: 0, im: true, p: 2 }; }
export function dglabClear(target: DglabTarget): Record<string, unknown> { return targetBody(target); }
