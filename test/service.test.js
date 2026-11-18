import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import test from 'node:test';
import { readConfig } from '../src/config/server-config.js';
import { createServiceServer, closeServer } from '../src/server/http-server.js';

test('configuration defaults, valid addresses and invalid inputs', () => {
  assert.deepEqual(readConfig({}), { port: 8000, host: '0.0.0.0' });
  assert.deepEqual(readConfig({ PORT: '8000', HOST: '127.0.0.2' }), { port: 8000, host: '127.0.0.2' });
  assert.equal(readConfig({ PORT: '65535', HOST: '::1' }).port, 65535);
  for (const PORT of ['', '0', '-1', '65536', '1.2', '8000junk', ' 8000', '1e3']) {
    assert.throws(() => readConfig({ PORT }), /PORT/);
  }
  for (const HOST of ['', 'localhost', 'not-an-address', '127.0.0.1:8000']) {
    assert.throws(() => readConfig({ HOST }), /HOST/);
  }
});

test('invalid configuration exits unsuccessfully without disclosing input or stack', () => {
  const result = spawnSync(process.execPath, ['src/index.js'], {
    encoding: 'utf8', env: { ...process.env, PORT: 'private-invalid-value' }, timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Configuration error: PORT/);
  assert.doesNotMatch(result.stderr, /private-invalid-value| at /);
});

test('HTTP landing, health, HEAD, methods, bodies, errors and clean closure', async (t) => {
  const server = createServiceServer();
  t.after(() => { server.closeAllConnections(); server.close(); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const conflict = spawnSync(process.execPath, ['src/index.js'], {
    encoding: 'utf8', env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) }, timeout: 5000,
  });
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /unable to run the HTTP listener/);
  assert.doesNotMatch(conflict.stderr, / at /);
  const call = (path, method = 'GET', body) => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method,
      headers: body ? { 'Content-Length': Buffer.byteLength(body) } : {},
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    req.end(body);
  });

  const landing = await call('/');
  assert.equal(landing.status, 200);
  assert.match(landing.headers['content-type'], /text\/html/);
  assert.match(landing.text, /<h1>The Allin Family Dynamic Adverts<\/h1>/);
  assert.match(landing.text, /service is online/);
  assert.doesNotMatch(landing.text, /<style|style=/);
  const health = await call('/health?probe=1');
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.text), { status: 'ok' });
  assert.equal(health.headers['cache-control'], 'no-store');
  assert.equal(health.headers['x-content-type-options'], 'nosniff');
  assert.equal(health.headers['x-powered-by'], undefined);
  for (const path of ['/', '/health', '/missing']) {
    const get = await call(path);
    const head = await call(path, 'HEAD');
    assert.equal(head.status, get.status);
    assert.equal(head.headers['content-length'], get.headers['content-length']);
    assert.equal(head.text, '');
  }
  assert.equal((await call('/missing')).status, 404);
  const method = await call('/health', 'POST');
  assert.equal(method.status, 405);
  assert.equal(method.headers.allow, 'GET, HEAD');
  const upload = await call('/health', 'POST', 'private payload');
  assert.equal(upload.status, 413);
  assert.equal(upload.headers.connection, 'close');
  assert.doesNotMatch(upload.text, /private payload/);
  assert.equal(server.headersTimeout, 10000);
  assert.equal(server.requestTimeout, 15000);
  assert.equal(server.timeout, 360000);
  await closeServer(server);
  assert.equal(server.listening, false);
});
