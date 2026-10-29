import { AXES, normalized, tcodeFrame } from '../core/index.js';
import { BLUETOOTH_PROFILES, createBluetoothTransport } from './device-codecs.js';

const socketPool = new Map();
const intifacePool = new Map();
const midiOwners = new Map();
const serialOwners = new Map();
const httpOwners = new Set();
const MAX_BUFFER = 1048576;
export function endpointUrl(value, protocols) {
  const url = new URL(value);
  if (!protocols.includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Choose a valid endpoint URL.');
  return url.href;
}
function withDeadline(operation, timeoutMs, onTimeout, onLate) {
  let timer, expired = false;
  const task = Promise.resolve(operation);
  task.then(value => { if (expired) onLate?.(value); }, () => {}).catch(() => {});
  return Promise.race([task, new Promise((_, reject) => {
    timer = setTimeout(() => { expired = true; try { onTimeout?.(); } catch { /* Preserve deadline failure. */ } reject(new Error('Device write timed out.')); }, timeoutMs);
  })]).finally(() => clearTimeout(timer));
}
export function signalPacket(frame) {
  return { type: 'signal', ...frame, commands: Object.entries(frame.values).map(([channel, value]) => ({ channel, value: normalized(value), durationMs: frame.durationMs || 0 })) };
}
function jsonSocketPeer(socket, timeoutMs) {
  const pending = [];
  const failed = error => { for (const item of pending.splice(0)) { clearTimeout(item.timer); item.reject(error); } };
  const message = event => {
    const item = pending.shift();
    if (!item) return;
    clearTimeout(item.timer);
    try {
      if (typeof event.data !== 'string' || event.data.length > 65536) throw new Error('Invalid JSON acknowledgement.');
      const reply = JSON.parse(event.data);
      if (reply?.ok !== true) throw new Error(String(reply?.error?.message || reply?.error || 'The endpoint rejected this command.'));
      item.resolve();
    } catch (error) { item.reject(error); failed(error); socket.close(); }
  };
  const closed = () => failed(new Error('JSON WebSocket disconnected.'));
  socket.addEventListener('message', message); socket.addEventListener('close', closed);
  return {
    request(body) {
      return new Promise((resolve, reject) => {
        const item = { resolve, reject, timer: setTimeout(() => { const error = new Error('JSON acknowledgement timed out.'); failed(error); socket.close(); }, timeoutMs) };
        pending.push(item);
        try { sendSocket(socket, JSON.stringify(body)); } catch (error) { pending.splice(pending.indexOf(item), 1); clearTimeout(item.timer); reject(error); }
      });
    },
    interrupt() { if (pending.length && socket.readyState === 1) { void this.request({ command: 'stop', type: 'stop' }).catch(() => {}); } },
    close() { socket.removeEventListener('message', message); socket.removeEventListener('close', closed); failed(new Error('JSON output closed.')); },
  };
}
function socketReady(socket, timeoutMs = 5000) {
  if (socket.readyState === 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer;
    const done = error => {
      clearTimeout(timer);
      socket.removeEventListener('open', opened); socket.removeEventListener('close', closed); socket.removeEventListener('error', failed);
      if (error) { socket.close(); reject(error); } else resolve();
    };
    const opened = () => done(), closed = () => done(new Error('WebSocket closed before connecting.'));
    const failed = () => done(new Error('Unable to connect to the WebSocket endpoint.'));
    socket.addEventListener('open', opened); socket.addEventListener('close', closed); socket.addEventListener('error', failed);
    timer = setTimeout(() => done(new Error('WebSocket connection timed out.')), timeoutMs);
  });
}
function sendSocket(socket, value) {
  if (socket.readyState !== 1) throw new Error('WebSocket disconnected.');
  if (socket.bufferedAmount > MAX_BUFFER) throw new Error('The endpoint is not reading commands.');
  socket.send(value);
}
async function pooledSocket(url, { WebSocket: Socket = globalThis.WebSocket, pool = socketPool, timeoutMs = 5000, protocol = 'raw', exclusive = false } = {}) {
  const endpoint = endpointUrl(url, ['ws:', 'wss:']), key = protocol + ':' + endpoint;
  let entry = pool.get(key);
  if (!entry || entry.socket.readyState > 1) {
    const socket = new Socket(endpoint);
    entry = { socket, refs: 0, ready: socketReady(socket, timeoutMs) };
    pool.set(key, entry);
    socket.addEventListener('close', () => { if (pool.get(key) === entry) pool.delete(key); });
  }
  if (exclusive && entry.refs > 0) throw new Error('This endpoint already has an output. Use a different endpoint path for another target.');
  entry.refs++;
  try { await entry.ready; }
  catch (error) { entry.refs--; if (pool.get(key) === entry) pool.delete(key); throw error; }
  let released = false;
  return { socket: entry.socket, release() {
    if (released) return; released = true;
    if (--entry.refs === 0) { if (pool.get(key) === entry) pool.delete(key); entry.socket.close(); }
  } };
}

class IntifacePeer {
  constructor(socket, { timeoutMs = 5000 } = {}) {
    this.socket = socket; this.timeoutMs = timeoutMs; this.id = 0; this.requests = new Map(); this.devices = new Map(); this.owners = new Set(); this.featureListeners = new Set();
    this.message = event => {
      try {
        if (typeof event.data !== 'string' || event.data.length > MAX_BUFFER) throw new Error('Invalid Buttplug message.');
        const batch = JSON.parse(event.data);
        if (!Array.isArray(batch) || batch.length > 1024) throw new Error('Invalid Buttplug batch.');
        for (const message of batch) {
          const entries = Object.entries(message);
          if (entries.length !== 1) throw new Error('Invalid Buttplug command.');
          const [type, body] = entries[0];
          if (type === 'DeviceAdded') this.devices.set(body.DeviceIndex, body);
          if (type === 'DeviceRemoved') this.devices.delete(body.DeviceIndex);
          if (type === 'DeviceList') {
            if (!Array.isArray(body.Devices)) throw new Error('The server did not negotiate Buttplug v3.');
            this.devices = new Map(body.Devices.map(device => [device.DeviceIndex, device]));
          }
          if (['DeviceAdded', 'DeviceRemoved', 'DeviceList'].includes(type)) this.notifyFeatures();
          const request = this.requests.get(body.Id);
          if (request) {
            this.requests.delete(body.Id); clearTimeout(request.timer);
            if (type === 'Error') request.reject(new Error(String(body.ErrorMessage || 'Buttplug rejected the command.')));
            else request.resolve({ type, body });
          }
        }
      } catch (error) { this.fail(error); this.socket.close(); }
    };
    this.closed = () => this.fail(new Error('Buttplug disconnected.'));
    socket.addEventListener('message', this.message); socket.addEventListener('close', this.closed);
  }
  request(type, body = {}, signal) {
    const id = ++this.id;
    if (signal?.aborted) return Promise.reject(Object.assign(new Error('Command interrupted.'), { name: 'AbortError' }));
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); this.requests.delete(id); };
      const aborted = () => { cleanup(); reject(Object.assign(new Error('Command interrupted.'), { name: 'AbortError' })); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Buttplug response timed out.')); }, this.timeoutMs);
      this.requests.set(id, { resolve: value => { cleanup(); resolve(value); }, reject: error => { cleanup(); reject(error); }, timer });
      signal?.addEventListener('abort', aborted, { once: true });
      try { sendSocket(this.socket, JSON.stringify([{ [type]: { Id: id, ...body } }])); }
      catch (error) { cleanup(); reject(error); }
    });
  }
  async initialize() {
    const info = await this.request('RequestServerInfo', { ClientName: 'WebSensa', MessageVersion: 3 });
    if (info.type !== 'ServerInfo' || info.body.MessageVersion !== 3) throw new Error('This endpoint needs Buttplug v3 support.');
    const maxPing = info.body.MaxPingTime;
    if (Number.isFinite(maxPing) && maxPing > 0) {
      this.ping = setInterval(() => { void this.request('Ping').catch(error => { this.fail(error); this.socket.close(); }); }, Math.max(20, Math.floor(maxPing / 2)));
    }
    const devices = await this.request('RequestDeviceList');
    if (devices.type !== 'DeviceList') throw new Error('The endpoint did not return a device list.');
  }
  async refresh() {
    await this.request('StartScanning');
    const result = await this.request('RequestDeviceList');
    if (result.type !== 'DeviceList') throw new Error('The endpoint did not return a device list.');
    return this.features();
  }
  notifyFeatures() { for (const listener of this.featureListeners) { try { listener(this.features()); } catch { /* Observers do not own the connection. */ } } }
  subscribeFeatures(listener) { this.featureListeners.add(listener); listener(this.features()); return () => this.featureListeners.delete(listener); }
  features() {
    const results = [];
    for (const device of this.devices.values()) {
      if (!Number.isSafeInteger(device.DeviceIndex) || device.DeviceIndex < 0) continue;
      for (const [command, axis] of [['LinearCmd', 'L0'], ['ScalarCmd', 'V0'], ['RotateCmd', 'R0']]) {
        const features = device.DeviceMessages?.[command];
        if (!Array.isArray(features)) continue;
        for (let index = 0; index < features.length; index++) {
          const descriptor = features[index];
          results.push({ id: `${device.DeviceIndex}:${command}:${index}`, deviceIndex: device.DeviceIndex, command, index, axis: command === 'LinearCmd' ? 'L' + Math.min(index, 2) : command === 'RotateCmd' ? 'R' + Math.min(index, 2) : axis,
            actuator: descriptor.ActuatorType, name: `${device.DeviceName} · ${descriptor.FeatureDescriptor || descriptor.ActuatorType || command} ${index}` });
        }
      }
    }
    return results;
  }
  fail(error) { clearInterval(this.ping); for (const request of this.requests.values()) { clearTimeout(request.timer); request.reject(error); } this.requests.clear(); }
  close() { this.fail(new Error('Buttplug connection closed.')); this.socket.removeEventListener('message', this.message); this.socket.removeEventListener('close', this.closed); this.socket.close(); }
}
async function acquireIntiface(url, { WebSocket: Socket = globalThis.WebSocket, pool = intifacePool, timeoutMs = 5000 } = {}) {
  const key = endpointUrl(url, ['ws:', 'wss:']);
  let entry = pool.get(key);
  if (!entry || entry.peer?.socket.readyState > 1) {
    const socket = new Socket(key);
    const peer = new IntifacePeer(socket, { timeoutMs });
    entry = { peer, refs: 0, ready: socketReady(socket, timeoutMs).then(() => peer.initialize()) };
    pool.set(key, entry);
    socket.addEventListener('close', () => { if (pool.get(key) === entry) pool.delete(key); });
  }
  entry.refs++;
  try { await entry.ready; }
  catch (error) { if (--entry.refs === 0) entry.peer.close(); if (pool.get(key) === entry) pool.delete(key); throw error; }
  let released = false;
  return { peer: entry.peer, release() { if (released) return; released = true; if (--entry.refs === 0) { if (pool.get(key) === entry) pool.delete(key); entry.peer.close(); } } };
}
export async function discoverIntiface(url, dependencies) {
  const lease = await acquireIntiface(url, dependencies);
  try {
    const features = await lease.peer.refresh(), subscriptions = new Set(); let closed = false;
    return { features, subscribeFeatures(listener) { const unsubscribe = lease.peer.subscribeFeatures(listener); subscriptions.add(unsubscribe); return () => { unsubscribe(); subscriptions.delete(unsubscribe); }; },
      close() { if (closed) return; closed = true; for (const unsubscribe of subscriptions) unsubscribe(); subscriptions.clear(); void lease.peer.request('StopScanning').catch(() => {}); lease.release(); } };
  }
  catch (error) { lease.release(); throw error; }
}
export async function createIntifaceTransport(config, dependencies) {
  const lease = await acquireIntiface(config.url, dependencies);
  const features = lease.peer.features();
  const feature = config.featureId ? features.find(item => item.id === config.featureId) : features[0];
  if (!feature) { lease.release(); throw new Error('Scan and choose an available device feature.'); }
  const axis = config.axis || feature.axis;
  if (!AXES.includes(axis)) { lease.release(); throw new Error('Choose a source axis.'); }
  if (lease.peer.owners.has(feature.deviceIndex)) { lease.release(); throw new Error('This Intiface device already has an output. Use its existing feature mappings.'); }
  lease.peer.owners.add(feature.deviceIndex);
  const mappings = config.mapDevice ? features.filter(item => item.deviceIndex === feature.deviceIndex
    && (item.command === 'ScalarCmd' || item.index < 3)).map(item => ({ ...item, sourceAxis: item.axis }))
    : [{ ...feature, sourceAxis: axis }];
  let closed = false, sending;
  return { interrupt() { sending?.abort(); }, name: config.mapDevice ? feature.name.split(' · ')[0] : feature.name, feature, mappings, socket: lease.peer.socket,
    async send(frame) {
      if (closed) throw new Error('The output is disconnected.');
      const abort = new AbortController(); sending = abort;
      const commands = new Map();
      for (const mapping of mappings) {
        if (frame.values[mapping.sourceAxis] === undefined) continue;
        const value = normalized(frame.values[mapping.sourceAxis]);
        let body = commands.get(mapping.command);
        if (!body) { body = { DeviceIndex: feature.deviceIndex }; commands.set(mapping.command, body); }
        if (mapping.command === 'LinearCmd') (body.Vectors ||= []).push({ Index: mapping.index, Position: value, Duration: frame.durationMs || 0 });
        else if (mapping.command === 'ScalarCmd') (body.Scalars ||= []).push({ Index: mapping.index, Scalar: value, ActuatorType: mapping.actuator });
        else (body.Rotations ||= []).push({ Index: mapping.index, Speed: value, Clockwise: config.clockwise !== false });
      }
      try { for (const [command, body] of commands) {
        const result = await lease.peer.request(command, body, abort.signal);
        if (result.type !== 'Ok') throw new Error('Buttplug did not acknowledge the command.');
      } } finally { if (sending === abort) sending = undefined; }
    },
    async stop() { if (!closed && lease.peer.socket.readyState === 1) await lease.peer.request('StopDeviceCmd', { DeviceIndex: feature.deviceIndex }); },
    async close() { if (!closed) { closed = true; lease.peer.owners.delete(feature.deviceIndex); lease.release(); } },
  };
}

export async function createOutputTransport(config, dependencies = {}) {
  const nav = dependencies.navigator || globalThis.navigator || {};
  if (config.type === 'intiface') return createIntifaceTransport(config, dependencies);
  if (config.type === 'bluetooth') {
    const profile = BLUETOOTH_PROFILES.find(item => item.id === config.profile);
    if (!profile) throw new Error('Choose a Bluetooth profile.');
    const transport = await createBluetoothTransport(config.profile, { bluetooth: nav.bluetooth });
    return { ...transport, send: frame => frame.values[config.axis || profile.axis] === undefined ? Promise.resolve()
      : transport.send({ ...frame, values: { [profile.axis]: frame.values[config.axis || profile.axis] } }) };
  }
  if (config.type === 'serial') {
    if (!nav.serial) throw new Error('Web Serial is available in supported Chromium browsers.');
    const baudRate = Number(config.baudRate ?? 115200);
    if (!Number.isInteger(baudRate) || baudRate < 300 || baudRate > 3000000) throw new Error('Choose a valid serial baud rate.');
    const port = await nav.serial.requestPort();
    if (serialOwners.has(port)) throw new Error('This serial port already has an output.');
    const owner = Symbol('serial owner'); serialOwners.set(port, owner);
    const owns = () => serialOwners.get(port) === owner;
    const release = () => { if (owns()) serialOwners.delete(port); };
    let writer, nativeOpen, opening = true, abandoned = false;
    const timeoutMs = dependencies.timeoutMs ?? 5000;
    const abandon = () => { try { Promise.resolve(writer?.abort?.(new Error('Device write timed out.'))).catch(() => {}); } catch { /* A closed writer may already have failed. */ } };
    try {
      nativeOpen = Promise.resolve(port.open({ baudRate }));
      nativeOpen.then(() => { opening = false; }, () => { opening = false; if (abandoned) release(); });
      await withDeadline(nativeOpen, timeoutMs, undefined, () => {
        if (owns()) void withDeadline(Promise.resolve().then(() => port.close()), timeoutMs).catch(() => {}).finally(release);
      });
      writer = port.writable.getWriter();
    } catch (error) {
      if (!nativeOpen) opening = false;
      if (opening) abandoned = true;
      if (!opening) { try { if (owns()) await withDeadline(port.close(), timeoutMs); } catch { /* Port may not have opened. */ } finally { release(); } }
      throw error;
    }
    let closed = false;
    const write = bytes => withDeadline(writer.write(new TextEncoder().encode(bytes)), timeoutMs, abandon);
    return { name: 'TCode serial', async send(frame) { if (closed) throw new Error('Serial disconnected.'); await write(tcodeFrame(frame.values, frame.durationMs)); },
      async stop() { if (!closed) await write('DSTOP\n'); },
      async close() { if (!closed) { closed = true; try { writer.releaseLock(); } catch { abandon(); } try { await withDeadline(port.close(), timeoutMs, abandon); } finally { release(); } } } };
  }
  if (config.type === 'midi') {
    if (!nav.requestMIDIAccess) throw new Error('This browser does not provide Web MIDI.');
    const access = await nav.requestMIDIAccess({ sysex: false });
    const available = [...access.outputs.values()];
    const output = config.deviceId ? access.outputs.get(config.deviceId) : available.length === 1 ? available[0] : null;
    if (!output) throw new Error(available.length ? 'Choose a MIDI output.' : 'No MIDI output is available.');
    const channel = Number(config.channel ?? 1), cc = Number(config.cc ?? 1), axis = config.axis || 'L0';
    if (!Number.isInteger(channel) || channel < 1 || channel > 16 || !Number.isInteger(cc) || cc < 0 || cc > 127) throw new Error('Choose MIDI channel 1–16 and CC 0–127.');
    const owners = midiOwners.get(output.id) || new Set(), key = channel + ':' + cc;
    if (owners.has(key)) throw new Error('This MIDI channel and CC already have an output.');
    owners.add(key); midiOwners.set(output.id, owners);
    try { await output.open(); } catch (error) { owners.delete(key); if (!owners.size) midiOwners.delete(output.id); throw error; }
    let closed = false;
    return { name: output.name || 'MIDI CC', async send(frame) { if (closed) throw new Error('MIDI disconnected.'); if (frame.values[axis] !== undefined) output.send([0xb0 + channel - 1, cc, Math.round(normalized(frame.values[axis]) * 127)]); },
      async stop() { if (!closed) { output.send([0xb0 + channel - 1, cc, 0]); } },
      async close() { if (!closed) { closed = true; owners.delete(key); if (!owners.size) { midiOwners.delete(output.id); await output.close(); } } } };
  }
  if (config.type === 'http') {
    const url = endpointUrl(config.url, ['http:', 'https:']);
    if (httpOwners.has(url)) throw new Error('This HTTP endpoint already has an output.');
    httpOwners.add(url);
    let closed = false, sending;
    const session = 'websensa-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    const send = async (body, isFrame = false) => {
      if (closed) throw new Error('HTTP output disconnected.');
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 5000);
      if (isFrame) sending = abort;
      try { const response = await (dependencies.fetch || globalThis.fetch)(url, { method: 'POST', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/json', 'X-Sensa-Session': session }, body: JSON.stringify(body), signal: abort.signal });
        if (!response.ok) throw new Error('HTTP output returned status ' + response.status);
        await response.body?.cancel(); }
      finally { clearTimeout(timer); if (sending === abort) sending = undefined; }
    };
    // A fetch abort is not a server-side cancellation; let the lane await the
    // acknowledgement/deadline before its final stop instead of overtaking it.
    return { name: 'JSON HTTP', send: frame => send(signalPacket(frame), true), stop: () => closed ? Promise.resolve() : send({ command: 'stop', type: 'stop' }),
      async close() { if (!closed) { closed = true; sending?.abort(); httpOwners.delete(url); } } };
  }
  if (!['tcode-ws', 'json-ws'].includes(config.type)) throw new Error('Choose an output type.');
  const lease = await pooledSocket(config.url, { ...dependencies, protocol: config.type, exclusive: true });
  const peer = config.type === 'json-ws' ? jsonSocketPeer(lease.socket, dependencies.timeoutMs ?? 5000) : null;
  let closed = false;
  return { name: config.type === 'tcode-ws' ? 'TCode WebSocket' : 'JSON WebSocket', socket: lease.socket,
    interrupt() { peer?.interrupt(); },
    async send(frame) { if (closed) throw new Error('The output is disconnected.');
      if (peer) await peer.request(signalPacket(frame)); else sendSocket(lease.socket, tcodeFrame(frame.values, frame.durationMs)); },
    async stop() { if (!closed && lease.socket.readyState === 1) { if (peer) await peer.request({ command: 'stop', type: 'stop' }); else sendSocket(lease.socket, 'DSTOP\n'); } },
    async close() { if (!closed) { closed = true; peer?.close(); lease.release(); } },
  };
}

export async function discoverMidi({ navigator: nav = globalThis.navigator } = {}) {
  if (!nav?.requestMIDIAccess) throw new Error('This browser does not provide Web MIDI.');
  const access = await nav.requestMIDIAccess({ sysex: false });
  return [...access.outputs.values()].map(output => ({ id: output.id, name: output.name || output.id }));
}
