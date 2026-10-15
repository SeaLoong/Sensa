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
export function pointSamples(z, grabbed = true) {
  const prefix = 'Sensa/Handle/v1/LabHandle/Self';
  return [0, 3, 5, 6].map((a, i) => [`${prefix}/Root/A${i}`, 1 - (Math.hypot(.02 - (a & 1 ? .06 : -.06), -(a & 2 ? .06 : -.06), z - (a & 4 ? .06 : -.06)) - .001) / .35])
    .concat([[prefix + '/Handle_IsGrabbed', grabbed ? 1 : 0], [prefix + '/Handle_Stretch', .2]]);
}

export async function startMocks() {
  const wire = { udp: [], tcp: [], serial: [], intiface: [], hub: [] };
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
  const bp = new WebSocketServer({ host: '127.0.0.1', port: ports.intiface }); await once(bp, 'listening');
  bp.on('connection', ws => ws.on('message', data => {
    for (const message of JSON.parse(data.toString())) {
      const [name, body] = Object.entries(message)[0]; wire.intiface.push(message);
      let response;
      if (name === 'RequestServerInfo') response = { ServerInfo: { Id: body.Id, ServerName: 'Sensa CI mock', ProtocolVersionMajor: body.ProtocolVersionMajor, ProtocolVersionMinor: body.ProtocolVersionMinor, MaxPingTime: 0 } };
      else if (name === 'RequestDeviceList') response = { DeviceList: { Id: body.Id, Devices: { '0': device } } };
      else if (['StartScanning', 'StopScanning', 'StopAllDevices', 'StopDeviceCmd', 'OutputCmd', 'Ping'].includes(name)) response = { Ok: { Id: body.Id } };
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
  return { wire, serialPort,
    send: async entries => { for (const [path, value] of entries) await new Promise((resolve, reject) => source.send(oscPacket(path, value), ports.osc, '127.0.0.1', e => e ? reject(e) : resolve())); },
    breakTcp: () => { for (const client of clients) client.destroy(); },
    close: async () => { serial.kill(); lines.close(); for (const socket of [udp, hub, source]) socket.close(); for (const c of clients) c.destroy(); for (const c of bp.clients) c.terminate(); await Promise.all([new Promise(r => tcp.close(r)), new Promise(r => bp.close(r)), new Promise(r => query.close(r))]); },
  };
}
