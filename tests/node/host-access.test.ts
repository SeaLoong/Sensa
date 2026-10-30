import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { LocalAccessPolicy, constantTimeCredential, isLoopback, type AccessResponse } from '../../src/node/host/access.ts';
function request(path = '/api/config', remoteAddress = '127.0.0.1', headers: Record<string, string> = {}): IncomingMessage {
  const socket = new Socket(); Object.defineProperties(socket, { remoteAddress: { value: remoteAddress }, localPort: { value: 7789 } });
  const value = new IncomingMessage(socket); value.url = path; value.method = 'GET'; value.headers = { host: '127.0.0.1:7789', ...headers }; return value;
}
class Response implements AccessResponse {
  status = 200; ended = false; headers: Record<string, string> = {};
  writeHead(status: number, headers: Record<string, string> = {}): void { this.status = status; Object.assign(this.headers, headers); }
  setHeader(key: string, value: string): void { this.headers[key] = value; }
  end(): void { this.ended = true; }
}
test('loopback bootstrap issues an instance-port HttpOnly strict session; API requires it', () => {
  const policy = new LocalAccessPolicy(''), bootstrap = new Response();
  assert.equal(policy.authorize(request('/api/session'), bootstrap, '/api/session'), false);
  assert.equal(bootstrap.status, 204); assert.match(bootstrap.headers['Set-Cookie']!, /^SensaSession_7789=/);
  assert.match(bootstrap.headers['Set-Cookie']!, /HttpOnly; SameSite=Strict/);
  const rejected = new Response(); assert.equal(policy.authorize(request(), rejected, '/api/config'), false); assert.equal(rejected.status, 401);
  const authenticated = new Response(); assert.equal(policy.authorize(request('/api/config', '127.0.0.1', { cookie: bootstrap.headers['Set-Cookie']!.split(';')[0]! }), authenticated, '/api/config'), true);
  assert.equal(authenticated.headers['X-Content-Type-Options'], 'nosniff');
});
test('session cookies cannot authenticate another port or another runtime', () => {
  const first = new LocalAccessPolicy(''), second = new LocalAccessPolicy(''), bootstrap = new Response(); first.authorize(request('/api/session'), bootstrap, '/api/session');
  const cookie = bootstrap.headers['Set-Cookie']!.split(';')[0]!;
  assert.equal(second.authorize(request('/api/config', '127.0.0.1', { cookie }), new Response(), '/api/config'), false);
  const differentPort = request('/api/config', '127.0.0.1', { cookie: cookie.replace('7789', '7790') });
  assert.equal(first.authorize(differentPort, new Response(), '/api/config'), false);
});
test('management rejects DNS rebinding, cross-origin and cross-site requests before authentication', () => {
  const policy = new LocalAccessPolicy('');
  for (const headers of [{ host: 'evil.example:7789' }, { origin: 'http://evil.example:7789' }, { origin: 'http://127.0.0.1:7790' }, { 'sec-fetch-site': 'cross-site' }, { host: 'user@127.0.0.1:7789' }]) {
    const response = new Response(); assert.equal(policy.authorize(request('/', '127.0.0.1', headers), response, '/'), false); assert.equal(response.status, 403);
  }
});
test('LAN management requires the configured explicit credential, including bootstrap', () => {
  const token = randomBytes(24).toString('hex'), policy = new LocalAccessPolicy(token);
  const missing = new Response(); assert.equal(policy.authorize(request('/api/session', '192.0.2.10'), missing, '/api/session'), false); assert.equal(missing.status, 401);
  for (const authorization of [`Bearer ${token}`, `Basic ${Buffer.from(`user:${token}`).toString('base64')}`]) {
    const response = new Response(); assert.equal(policy.authorize(request('/', '192.0.2.10', { authorization }), response, '/'), true);
  }
  const invalid = new Response(); assert.equal(policy.authorize(request('/', '192.0.2.10', { authorization: `Basic ${Buffer.from(`user:${token}`).toString('base64')}!!!!` }), invalid, '/'), false); assert.equal(invalid.status, 401);
});
test('loopback classification handles mapped IPv4 without accepting suffix host names', () => {
  for (const value of ['127.0.0.1', '127.20.0.2', '::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1', '::ffff:7f00:1']) assert.equal(isLoopback(value), true);
  for (const value of ['127.0.0.1.evil', '192.0.2.1', '::ffff:192.0.2.1', '::ffff:c000:201', undefined]) assert.equal(isLoopback(value), false);
  assert.equal(constantTimeCredential('one', 'one'), true); assert.equal(constantTimeCredential(undefined, 'one'), false); assert.equal(constantTimeCredential('two', 'one'), false);
});
