import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

process.env.REDIS_URL = '';
const lines = [];
let server, base;
test.before(async () => {
  server = createApp({ log: { write: (l) => lines.push(JSON.parse(l)), enabled: () => true } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test('every response carries the security headers and no X-Powered-By', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.ok(res.headers.get('strict-transport-security'));
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('a request id is generated, returned, and reused when the caller sends a safe one', async () => {
  const a = await fetch(`${base}/health`);
  assert.match(a.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  const b = await fetch(`${base}/health`, { headers: { 'x-request-id': 'trace-12345678' } });
  assert.equal(b.headers.get('x-request-id'), 'trace-12345678');
  const c = await fetch(`${base}/health`, { headers: { 'x-request-id': 'bad id\twith spaces' } });
  assert.notEqual(c.headers.get('x-request-id'), 'bad id\twith spaces');
});

test('one log line per request, with no token, body or query values', async () => {
  lines.length = 0;
  const login = await fetch(`${base}/auth/demo-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'creator' }) });
  const { token } = await login.json();
  await fetch(`${base}/me?secret=hunter2`, { headers: { authorization: `Bearer ${token}` } });
  await fetch(`${base}/public/report/public-share-secret?query=private`);
  await fetch(`${base}/PUBLIC/REPORT/public-share-secret/?query=private`);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(lines.length, 4);
  const me = lines[1];
  assert.deepEqual(Object.keys(me).sort(), ['id', 'method', 'ms', 'path', 'status', 't', 'user']);
  assert.equal(me.method, 'GET'); assert.equal(me.path, '/me'); assert.equal(me.status, 200); assert.equal(me.user, 'u_maya');
  assert.equal(lines[2].path, '/public/report/[redacted]');
  assert.equal(lines[3].path, '/public/report/[redacted]');
  const text = JSON.stringify(lines);
  assert.ok(!text.includes(token) && !text.includes('hunter2') && !text.includes('creator"}') && !text.includes('public-share-secret') && !text.includes('private'));
});
