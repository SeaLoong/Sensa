import dgram from 'node:dgram';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';

export const ports = { web: 19086, osc: 19091, source: 19093, udp: 19999, tcp: 19998, intiface: 12345, query: 18090, hub: 19092 };
const oscString = text => { const b = Buffer.from(text + '\0'); return Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4)]); };
export function oscPacket(path, value) {
  const bytes = Buffer.alloc(4); bytes.writeFloatBE(value);
  return Buffer.concat([oscString('/avatar/parameters/' + path), oscString(',f'), bytes]);
}
export function oscBundle(entries) {
  const packets = entries.flatMap(([path, value]) => {
    const packet = oscPacket(path, value), length = Buffer.alloc(4);
    length.writeUInt32BE(packet.length);
    return [length, packet];
  });
  return Buffer.concat([oscString('#bundle'), Buffer.from('0000000000000001', 'hex'), ...packets]);
}
export function pointSamples(z, grabbed = true) {
  const prefix = 'Sensa/Handle/v1/LabHandle/Self';
  return [0, 3, 5, 6].map((a, i) => [`${prefix}/Root/A${i}`, 1 - (Math.hypot(.02 - (a & 1 ? .35 : -.35), -(a & 2 ? .35 : -.35), z - (a & 4 ? .35 : -.35)) - .001) / 2])
    .concat([[prefix + '/Handle_IsGrabbed', grabbed ? 1 : 0], [prefix + '/Handle_Stretch', .2]]);
}
// Independent protocol fixtures, not captured Unity/GPU measurements. / 独立协议夹具，并非 Unity/GPU 实测。
export function fixedRootSamples(z, sample, valid = true) {
  const prefix = 'Sensa/SPS/CIFixedRoot';
  const anchors = [[-.35, .65, -.35], [.35, .65, .35], [.35, 1.35, -.35], [-.35, 1.35, .35]];
  return anchors.map(([x, y, az], index) => [prefix + '/P' + index,
    1 - (Math.hypot(.02 - x, 1 - y, z - az) - .001) / 2])
    .concat([[prefix + '/Sample', valid ? sample : 0]]);
}
export function shaderRootSamples(z, frame, valid = true) {
  const prefix = 'Sensa/Shader/42';
  // Valid commits the native packet last. Invalid capture sends no stale coordinates. / Valid 最后提交；失效不补发旧坐标。
  return (valid ? [['Frame', frame], ['X', .02], ['Y', 1], ['Z', z], ['Valid', 1]] : [['Valid', 0]])
    .map(([name, value]) => [prefix + '/' + name, value]);
}
export function poseSamples() {
  return [['Root', [.02, 0, -.1]], ['Tip', [.02, 0, .1]], ['Side', [.05, 0, -.1]]].flatMap(([marker, position]) =>
    Array.from({ length: 8 }, (_, a) => [`Sensa/Pose/v1/Demo/Others/${marker}/A${a}`,
      1 - (Math.hypot(position[0] - (a & 1 ? .35 : -.35), position[1] - (a & 2 ? .35 : -.35), position[2] - (a & 4 ? .35 : -.35)) - .001) / 2]));
}

export async function startMocks() {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Transport peers are CI-only / 模拟传输端仅允许在 CI 启动');
  const wire = { udp: [], tcp: [], serial: [], intiface: [], hub: [] };
  const intifaceState = { stopped: true, stopCount: 0, profile: 'combined' };
  const udp = dgram.createSocket('udp4'), hub = dgram.createSocket('udp4'), source = dgram.createSocket('udp4');
  udp.on('message', b => wire.udp.push(b.toString().trim()));
  hub.on('message', b => wire.hub.push(b.toString('hex')));
  for (const [socket, port] of [[udp, ports.udp], [hub, ports.hub], [source, ports.source]]) { socket.bind(port, '127.0.0.1'); await once(socket, 'listening'); }
  const clients = new Set();
  const tcp = net.createServer(socket => {
    clients.add(socket); socket.on('close', () => clients.delete(socket));
    let pending = '';
    socket.on('data', b => { pending += b; const lines = pending.split('\n'); pending = lines.pop(); wire.tcp.push(...lines.map(s => s.trim())); });
  });
  tcp.listen(ports.tcp, '127.0.0.1'); await once(tcp, 'listening');
  const serial = spawn('python3', ['-u', 'tests/e2e/serial-device.py'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = createInterface({ input: serial.stdout });
  const serialPort = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('PTY mock startup timed out')), 5000);
    serial.once('error', reject);
    lines.on('line', text => { const message = JSON.parse(text); if (message.port) { clearTimeout(timer); resolve(message.port); } else wire.serial.push(message.line); });
  });
  if (!serialPort.startsWith('/dev/pts/')) throw new Error('Only CI pseudo terminals are allowed');
  const device = { DeviceName: 'CI linear + vibration', DeviceIndex: 0, DeviceMessageTimingGap: 0,
    DeviceFeatures: {
      '0': { FeatureIndex: 0, FeatureDescription: 'Linear', Output: { HwPositionWithDuration: { Value: [0, 1000], Duration: [0, 60000] } } },
      '1': { FeatureIndex: 1, FeatureDescription: 'Vibration', Output: { Vibrate: { Value: [0, 1000] } } },
    } };
  const vibrationDevice = { DeviceName: 'CI vibration only', DeviceIndex: 0, DeviceMessageTimingGap: 0,
    DeviceFeatures: { '0': { FeatureIndex: 0, FeatureDescription: 'Vibration', Output: { Vibrate: { Value: [0, 1000] } } } } };
  let advertisedDevice = device;
  const bp = new WebSocketServer({ host: '127.0.0.1', port: ports.intiface }); await once(bp, 'listening');
  bp.on('connection', ws => ws.on('message', data => {
    for (const message of JSON.parse(data.toString())) {
      const [name, body] = Object.entries(message)[0]; wire.intiface.push(message);
      let response;
      if (name === 'RequestServerInfo') response = { ServerInfo: { Id: body.Id, ServerName: 'Sensa CI mock', ProtocolVersionMajor: body.ProtocolVersionMajor, ProtocolVersionMinor: body.ProtocolVersionMinor, MaxPingTime: 0 } };
      else if (name === 'RequestDeviceList') response = { DeviceList: { Id: body.Id, Devices: { '0': advertisedDevice } } };
      // v4 StopCmd with no device/feature scope stops every output. Reject the
      // legacy names so a regression cannot pass a v4 handshake unnoticed.
      else if (name === 'StopCmd' && body.DeviceIndex === undefined && body.FeatureIndex === undefined && body.Outputs !== false) {
        intifaceState.stopped = true; intifaceState.stopCount++;
        response = { Ok: { Id: body.Id } };
      }
      else if (name === 'OutputCmd') { intifaceState.stopped = false; response = { Ok: { Id: body.Id } }; }
      else if (['StartScanning', 'StopScanning', 'Ping'].includes(name)) response = { Ok: { Id: body.Id } };
      else response = { Error: { Id: body.Id, ErrorCode: 3, ErrorMessage: `Unsupported mock message: ${name}` } };
      ws.send(JSON.stringify([response]));
      if (name === 'StartScanning') ws.send(JSON.stringify([{ ScanningFinished: { Id: 0 } }]));
    }
  }));
  const query = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url.includes('HOST_INFO') ? { NAME: 'Sensa CI query', OSC_IP: '127.0.0.1', OSC_PORT: ports.source, OSC_TRANSPORT: 'UDP', EXTENSIONS: {} } :
      { FULL_PATH: '/', CONTENTS: { avatar: { FULL_PATH: '/avatar', CONTENTS: { parameters: { FULL_PATH: '/avatar/parameters', CONTENTS: { QueryDepth: { FULL_PATH: '/avatar/parameters/QueryDepth', TYPE: 'f', ACCESS: 1, VALUE: [.65] } } } } } } }));
  }); query.listen(ports.query, '127.0.0.1'); await once(query, 'listening');
  return { wire, serialPort, intifaceState,
    reset: ({ intifaceProfile = 'combined' } = {}) => {
      if (!['combined', 'vibration-only'].includes(intifaceProfile)) throw new Error('Unknown mock device profile / 未知模拟设备类型');
      advertisedDevice = intifaceProfile === 'vibration-only' ? vibrationDevice : device;
      intifaceState.profile = intifaceProfile;
      for (const client of clients) client.destroy();
      for (const client of bp.clients) client.terminate();
      for (const messages of Object.values(wire)) messages.length = 0;
      intifaceState.stopped = true; intifaceState.stopCount = 0;
    },
    send: async entries => { for (const [path, value] of entries) await new Promise((resolve, reject) => source.send(oscPacket(path, value), ports.osc, '127.0.0.1', e => e ? reject(e) : resolve())); },
    sendBundle: async entries => new Promise((resolve, reject) => source.send(oscBundle(entries), ports.osc, '127.0.0.1', e => e ? reject(e) : resolve())),
    breakTcp: () => { for (const client of clients) client.destroy(); },
    close: async () => { serial.kill(); lines.close(); for (const socket of [udp, hub, source]) socket.close(); for (const c of clients) c.destroy(); for (const c of bp.clients) c.terminate(); await Promise.all([new Promise(r => tcp.close(r)), new Promise(r => bp.close(r)), new Promise(r => query.close(r))]); },
  };
}
