import type { ExternalControlCommand, ExternalControlSink, ProtocolFeatureConfig, ProtocolInputConfig } from './input-types.ts';
import { jsonObject, parseStrictJson } from './strict-json.ts';
type Fields = Record<string, unknown>;
type Reply = Record<string, unknown>;
class ProtocolError extends Error { readonly code: number; constructor(message: string, code = 3) { super(message); this.code = code; } }
const message = (type: string, body: unknown): Reply => ({ [type]: body });
const ok = (id: number): Reply => message('Ok', { Id: id });
const errorReply = (id: number, description: string, code = 3): Reply => message('Error', { Id: id, ErrorCode: code, ErrorMessage: description });
function fieldObject(value: unknown): Fields { try { return jsonObject(value); } catch { throw new ProtocolError('Message fields must be an object.'); } }
function number(body: Fields, key: string, min: number, max: number, integer = false): number {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) throw new ProtocolError(`${key} must be a ${integer ? 'integer' : 'number'} within range.`);
  return value;
}
const unsigned = (body: Fields, key: string, max = 0xffffffff): number => number(body, key, 0, max, true);
const unit = (body: Fields, key: string): number => number(body, key, 0, 1);
function text(body: Fields, key: string): string { const value = body[key]; if (typeof value !== 'string') throw new ProtocolError(`${key} must be a string.`); return value; }
function boolean(body: Fields, key: string): boolean { const value = body[key]; if (typeof value !== 'boolean') throw new ProtocolError(`${key} must be a boolean.`); return value; }
function array(body: Fields, key: string): unknown[] { const value = body[key]; if (!Array.isArray(value) || value.length < 1 || value.length > 16) throw new ProtocolError(`${key} must be a nonempty actuator array within the limit.`); return value as unknown[]; }
let nextSession = 0;
/** Host-independent virtual device supporting negotiated Buttplug wire v2/v3/v4. */
export class ButtplugInputSession {
  static readonly maximumMessageBytes = 65536;
  #version = 0; #acquired = false; #disposed = false; #announced = false; #lastActivity: number; #lastPing: number;
  readonly config: ProtocolInputConfig; readonly sink: ExternalControlSink; readonly now: () => number; readonly sessionId: string;
  constructor(config: ProtocolInputConfig, sink: ExternalControlSink, now: () => number = Date.now, sessionId = `buttplug-${++nextSession}`) {
    this.config = config; this.sink = sink; this.now = now; this.sessionId = sessionId; this.#lastActivity = this.#lastPing = now();
    if (config.features.length < 1 || config.features.length > 16 || new Set(config.features.map(feature => feature.channel)).size !== config.features.length) throw new Error('A virtual device requires 1–16 unique features.');
  }
  get disposed(): boolean { return this.#disposed; }
  get version(): number { return this.#version; }
  get remainingActivityTime(): number {
    const now = this.now(); return Math.max(0, this.config.timeoutMs - Math.max(now - this.#lastActivity, this.#version ? now - this.#lastPing : 0));
  }
  process(raw: string): string {
    if (this.#disposed) return JSON.stringify([errorReply(0, 'Session closed.', 1)]);
    if (this.remainingActivityTime <= 0) { this.dispose(); return JSON.stringify([errorReply(0, 'Session heartbeat timed out.', 2)]); }
    if (new TextEncoder().encode(raw).byteLength > ButtplugInputSession.maximumMessageBytes) return JSON.stringify([errorReply(0, 'Message exceeds the size limit.')]);
    const replies: Reply[] = [];
    try {
      const parsed = parseStrictJson(raw);
      if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 128) throw new ProtocolError('Expected a nonempty message array within the batch limit.');
      for (const value of parsed as unknown[]) {
        let id = 0;
        try {
          const envelope = fieldObject(value), names = Object.keys(envelope), type = names[0];
          if (names.length !== 1 || !type) throw new ProtocolError('Each message must contain exactly one message type.');
          const body = fieldObject(envelope[type]); id = unsigned(body, 'Id'); if (!id) throw new ProtocolError('Client message IDs must be nonzero.');
          this.#handle(type, body, id, replies);
        } catch (error) { replies.push(errorReply(id, error instanceof Error ? error.message : 'Malformed message.', error instanceof ProtocolError ? error.code : 3)); }
        if (this.#disposed) break;
      }
    } catch (error) { replies.push(errorReply(0, error instanceof Error ? error.message : 'Malformed JSON message.', error instanceof ProtocolError ? error.code : 3)); }
    return JSON.stringify(replies);
  }
  #handle(type: string, body: Fields, id: number, replies: Reply[]): void {
    if (type === 'RequestServerInfo') {
      if (this.#version) throw new ProtocolError('Handshake already completed.', 1);
      const client = text(body, 'ClientName'); if (!client.length || client.length > 256) throw new ProtocolError('Invalid client name.', 1);
      let version: number;
      if ('MessageVersion' in body) {
        if ('ProtocolVersionMajor' in body || 'ProtocolVersionMinor' in body) throw new ProtocolError('Ambiguous protocol version.', 1);
        version = unsigned(body, 'MessageVersion', 3);
        if (version !== 2 && version !== 3) throw new ProtocolError('This endpoint supports protocol versions 2, 3 and 4.', 1);
      } else {
        version = unsigned(body, 'ProtocolVersionMajor', 4); unsigned(body, 'ProtocolVersionMinor');
        if (version !== 4) throw new ProtocolError('This endpoint supports protocol versions 2, 3 and 4.', 1);
      }
      const acquired = this.sink.tryAcquire(this.config.id, this.sessionId); if (!acquired.ok) throw new ProtocolError(acquired.error, 4);
      this.#acquired = true; this.#version = version; this.#touch(true);
      replies.push(message('ServerInfo', version < 4 ? { Id: id, ServerName: 'Sensa', MessageVersion: version, MaxPingTime: this.config.timeoutMs }
        : { Id: id, ServerName: 'Sensa', ProtocolVersionMajor: 4, ProtocolVersionMinor: 0, MaxPingTime: this.config.timeoutMs })); return;
    }
    if (!this.#version) throw new ProtocolError('RequestServerInfo must complete before other messages.', 1);
    if (type === 'Ping') { this.#touch(true); replies.push(ok(id)); return; }
    if (type === 'RequestDeviceList') { this.#touch(); replies.push(this.#deviceList(id)); this.#announced = true; return; }
    if (type === 'StartScanning') {
      this.#touch(); replies.push(ok(id));
      if (!this.#announced) { replies.push(this.#version < 4 ? message('DeviceAdded', this.#legacyDevice(0)) : this.#deviceList(0)); this.#announced = true; }
      replies.push(message('ScanningFinished', { Id: 0 })); return;
    }
    if (type === 'StopScanning') { this.#touch(); replies.push(ok(id)); return; }
    let commands: ExternalControlCommand[] | undefined;
    if (type === 'LinearCmd' && this.#version < 4) { this.#device(body); commands = this.#parseIndexed(body, 'Vectors', 'Position', 'Position', true); }
    else if (type === 'ScalarCmd' && this.#version === 3) { this.#device(body); commands = this.#parseIndexed(body, 'Scalars', 'Scalar', 'Scalar'); }
    else if (type === 'VibrateCmd' && this.#version === 2) { this.#device(body); commands = this.#parseIndexed(body, 'Speeds', 'Scalar', 'Speed'); }
    else if (type === 'RotateCmd' && this.#version < 4) { this.#device(body); commands = this.#parseIndexed(body, 'Rotations', 'Rotation', 'Speed'); }
    else if (type === 'OutputCmd' && this.#version === 4) { this.#device(body); commands = [this.#parseV4(body)]; }
    else if ((type === 'StopDeviceCmd' || type === 'StopAllDevices') && this.#version < 4) {
      if (type === 'StopDeviceCmd') this.#device(body); this.sink.stop(this.config.id, this.sessionId); this.#touch(); replies.push(ok(id)); return;
    } else if (type === 'StopCmd' && this.#version === 4) {
      if ('DeviceIndex' in body) this.#device(body); if ('FeatureIndex' in body) unsigned(body, 'FeatureIndex');
      if ('Inputs' in body) boolean(body, 'Inputs');
      const outputs = !('Outputs' in body) || boolean(body, 'Outputs');
      const channel = 'DeviceIndex' in body && 'FeatureIndex' in body ? this.#feature(unsigned(body, 'FeatureIndex')).channel : undefined;
      if (outputs) this.sink.stop(this.config.id, this.sessionId, channel); this.#touch(); replies.push(ok(id)); return;
    } else if (type === 'Disconnect' && this.#version === 4) { replies.push(ok(id)); this.dispose(); return; }
    else throw new ProtocolError('Message or feature is not supported by this negotiated protocol.');
    const result = this.sink.publish(this.config.id, this.sessionId, commands);
    if (!result.ok) throw new ProtocolError(result.error, 4); this.#touch(); replies.push(ok(id));
  }
  #parseIndexed(body: Fields, field: string, actuator: string, valueName: string, duration = false): ExternalControlCommand[] {
    const indices = new Set<number>(), features = this.#features(actuator);
    return array(body, field).map(raw => {
      const value = fieldObject(raw), index = unsigned(value, 'Index');
      if (indices.has(index)) throw new ProtocolError('Repeated actuator index.'); indices.add(index);
      const feature = features[index]; if (!feature) throw new ProtocolError('Unknown actuator index.', 4);
      if (field === 'Scalars' && text(value, 'ActuatorType') !== feature.scalarType) throw new ProtocolError('Unexpected scalar actuator type.', 4);
      return { channel: feature.channel, value: unit(value, valueName), durationMs: duration ? unsigned(value, 'Duration', 600000) : 0,
        clockwise: actuator === 'Rotation' ? boolean(value, 'Clockwise') : true };
    });
  }
  #parseV4(body: Fields): ExternalControlCommand {
    const feature = this.#feature(unsigned(body, 'FeatureIndex')), command = fieldObject(body['Command']), types = Object.keys(command), type = types[0];
    if (types.length !== 1 || !type) throw new ProtocolError('Exactly one output command is required.');
    const value = fieldObject(command[type]), amount = number(value, 'Value', -2147483648, 2147483647, true);
    if (feature.actuator === 'Rotation' && type === 'Rotate' && Math.abs(amount) <= 1000) return { channel: feature.channel, value: Math.abs(amount) / 1000, clockwise: amount >= 0 };
    if (amount < 0 || amount > 1000) throw new ProtocolError('Output type or value does not match the advertised feature.', 4);
    if (feature.actuator === 'Position' && (type === 'Position' || type === 'HwPositionWithDuration')) {
      return { channel: feature.channel, value: amount / 1000, durationMs: type === 'HwPositionWithDuration' ? unsigned(value, 'Duration', 600000) : 0 };
    }
    if (feature.actuator === 'Scalar' && type === feature.scalarType) return { channel: feature.channel, value: amount / 1000 };
    throw new ProtocolError('Output type or value does not match the advertised feature.', 4);
  }
  #features(actuator: string): ProtocolFeatureConfig[] {
    return this.config.features.filter(feature => feature.actuator === actuator && (actuator !== 'Scalar'
      || (this.#version === 2 ? feature.scalarType === 'Vibrate' : ['Vibrate', 'Oscillate', 'Constrict'].includes(feature.scalarType))));
  }
  #feature(index: number): ProtocolFeatureConfig { const value = this.config.features[index]; if (!value) throw new ProtocolError('Unknown feature index.', 4); return value; }
  #device(body: Fields): void { if (unsigned(body, 'DeviceIndex') !== 0) throw new ProtocolError('Unknown device index.', 4); }
  #legacyDevice(eventId?: number): Fields {
    const messages: Fields = { StopDeviceCmd: {} };
    for (const [actuator, type, protocolType] of [['Position', 'LinearCmd', 'Linear'], ['Scalar', this.#version === 2 ? 'VibrateCmd' : 'ScalarCmd', 'Vibrate'], ['Rotation', 'RotateCmd', 'Rotate']]) {
      if (!actuator || !type) continue;
      const features = this.#features(actuator); if (!features.length) continue;
      messages[type] = this.#version === 2 ? { FeatureCount: features.length, StepCount: features.map(() => 1000) }
        : features.map(feature => ({ StepCount: 1000, FeatureDescriptor: feature.name, ActuatorType: feature.actuator === 'Scalar' ? feature.scalarType : protocolType }));
    }
    const result: Fields = { DeviceName: this.config.name || 'Sensa Virtual Device', DeviceIndex: 0, DeviceMessages: messages };
    if (this.#version === 3) result['DeviceMessageTimingGap'] = 0; if (eventId !== undefined) result['Id'] = eventId; return result;
  }
  #deviceList(id: number): Reply {
    if (this.#version < 4) return message('DeviceList', { Id: id, Devices: [this.#legacyDevice()] });
    const features: Fields = {};
    this.config.features.forEach((feature, index) => {
      const output: Fields = {};
      if (feature.actuator === 'Position') { output['Position'] = { Value: [0, 1000] }; output['HwPositionWithDuration'] = { Value: [0, 1000], Duration: [0, 600000] }; }
      else output[feature.actuator === 'Rotation' ? 'Rotate' : feature.scalarType] = { Value: feature.actuator === 'Rotation' ? [-1000, 1000] : [0, 1000] };
      features[index.toString()] = { FeatureIndex: index, FeatureDescription: feature.name, Output: output };
    });
    return message('DeviceList', { Id: id, Devices: { '0': { DeviceName: this.config.name || 'Sensa Virtual Device', DeviceIndex: 0, DeviceMessageTimingGap: 0, DeviceFeatures: features } } });
  }
  #touch(ping = false): void { this.#lastActivity = this.now(); if (ping) this.#lastPing = this.#lastActivity; this.sink.heartbeat(this.config.id, this.sessionId); }
  dispose(): void { if (this.#disposed) return; this.#disposed = true; if (this.#acquired) { this.sink.stop(this.config.id, this.sessionId); this.sink.release(this.config.id, this.sessionId); this.#acquired = false; } }
}
