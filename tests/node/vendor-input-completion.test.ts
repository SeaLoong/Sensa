import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test, { type TestContext } from 'node:test';
import { ExternalControlStore } from '../../src/core/protocols/external-control.ts';
import { defaultProtocolInput } from '../../src/core/protocols/input-types.ts';
import type { ExternalControlBatch, ProtocolInputConfig } from '../../src/core/protocols/input-types.ts';
import { InputHttpError } from '../../src/node/inputs/http-utils.ts';
import { VendorInputSession } from '../../src/node/inputs/vendor-session.ts';

async function fixture(t: TestContext, changes: Partial<ProtocolInputConfig> = {}) {
  let now = 10000;
  const config: ProtocolInputConfig = { ...defaultProtocolInput('vendor'), type: 'AutoblowHttp', enabled: true,
    routeToMotion: false, timeoutMs: 10000, ...changes };
  const batches: ExternalControlBatch[] = [];
  const store = new ExternalControlStore([config], () => now, { onBatch: batch => { batches.push(batch); } });
  const session = new VendorInputSession(config, store, { now: () => now });
  const prefix = config.type === 'VacuGlideHttp' ? '/vacuglide' : '/autoblow';
  const server = http.createServer((request, response) => {
    void session.handle(request, new URL(request.url ?? '/', 'http://fixture').pathname, 'isolated-script-source')
      .then(reply => { response.writeHead(reply.status, { 'content-type': 'application/json' }); response.end(JSON.stringify(reply.body)); },
        error => { response.writeHead(error instanceof InputHttpError ? error.status : 500, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Fixture failed.' })); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => {
    session.dispose(); store.dispose(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const base = `http://127.0.0.1:${address.port}${prefix}`;
  const command = (path: string, body: object = {}) => fetch(base + path, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const upload = async (script = '0,20\n1000,80\n') => {
    const boundary = 'sensa-controlled-clock';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="motion.csv"\r\nContent-Type: text/csv\r\n\r\n${script}\r\n--${boundary}--\r\n`;
    const response = await fetch(base + '/sync-script/upload-csv', { method: 'PUT',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body });
    assert.equal(response.status, 200); await response.arrayBuffer();
  };
  const start = async () => {
    const response = await command('/sync-script/start', { startTimeMs: 0 });
    assert.equal(response.status, 200); await response.arrayBuffer();
  };
  return { config, store, session, batches, command, upload, start, advance: (delta: number) => { now += delta; } };
}

test('natural vendor script completion stops commands while preserving its accepted final position for calibrated goto', async t => {
  const rig = await fixture(t); await rig.upload(); await rig.start();
  assert.equal(rig.store.read('vendor/L0').value, .2);
  rig.advance(1000); rig.session.tick();
  assert.equal(rig.session.state()['operationalMode'], 'SYNC_SCRIPT_PAUSED');
  assert.equal(rig.session.state()['syncScriptCurrentTime'], 1000);
  assert.equal(rig.store.read('vendor/L0').valid, false, 'a completed script must no longer drive output');
  assert.equal(rig.session.state()['position'], 80, 'accepted terminal position remains usable as a calibrated origin');
  const response = await rig.command('/goto', { position: 30, speed: 50 });
  assert.equal(response.status, 200); await response.arrayBuffer();
  assert.deepEqual(rig.batches.at(-1)?.commands, [{ channel: 'L0', value: .3, durationMs: 1000, clockwise: true }]);
  const stopped = await rig.command('/sync-script/stop');
  assert.equal(stopped.status, 200); await stopped.arrayBuffer();
  assert.equal(rig.session.state()['position'], null, 'explicit stop still discards the retained position');
  assert.equal(rig.store.read('vendor/L0').valid, false);
  const afterStop = await rig.command('/goto', { position: 50, speed: 50 });
  assert.equal(afterStop.status, 422); await afterStop.arrayBuffer();
});

for (const reason of ['explicit stop', 'global clear', 'expired lease', 'maximum task duration', 'rejected final publish'] as const) {
  test(`vendor position is forgotten after ${reason} rather than being inferred from the script endpoint`, async t => {
    const rig = await fixture(t, reason === 'maximum task duration' ? { maxScriptDurationMs: 1000 } : {});
    await rig.upload('0,20\n2000,80\n'); await rig.start();
    if (reason === 'explicit stop') {
      const response = await rig.command('/sync-script/stop'); assert.equal(response.status, 200); await response.arrayBuffer();
    } else if (reason === 'global clear') rig.store.clearCommands();
    else if (reason === 'expired lease') { rig.advance(10000); rig.session.tick(); }
    else if (reason === 'maximum task duration') { rig.advance(1000); rig.session.tick(); }
    else {
      const lease = rig.store.getStatus('vendor')?.session; assert.ok(lease);
      rig.store.release('vendor', lease); rig.advance(2000); rig.session.tick();
    }
    assert.equal(rig.session.state()['position'], null);
    assert.equal(rig.store.read('vendor/L0').valid, false);
    const response = await rig.command('/goto', { position: 50, speed: 50 });
    assert.equal(response.status, 422); await response.arrayBuffer();
  });
}

test('a scalar-only VacuGlide script completion does not invent a physical position', async t => {
  const rig = await fixture(t, { type: 'VacuGlideHttp', features: [
    { channel: 'V0', name: 'Motor', actuator: 'Scalar', scalarType: 'Vibrate', targetAxis: 'V0' },
  ] });
  await rig.upload(); await rig.start(); assert.ok(rig.store.read('vendor/V0').valid);
  rig.advance(1000); rig.session.tick();
  assert.equal(rig.session.state()['operationalMode'], 'SYNC_SCRIPT_PAUSED');
  assert.equal(rig.session.state()['position'], null); assert.equal(rig.store.read('vendor/V0').valid, false);
});
