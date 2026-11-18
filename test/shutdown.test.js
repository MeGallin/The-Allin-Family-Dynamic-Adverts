import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

for (const { inbound, retained } of [{ inbound: true, retained: true }, { inbound: false, retained: true }, { inbound: false, retained: false }]) test(`shared shutdown deadline handles inbound=${inbound}, retained outbound=${retained}`, async () => {
  // IPC triggers the very same handler used by SIGTERM/SIGINT on Windows too;
  // Windows kill(SIGTERM) itself terminates children without JS signal delivery.
  const source = `
    import { createServer, request } from 'node:http';
    import { createShutdownHandler } from './src/server/http-server.js';
    const server = createServer(() => {});
    if (${retained}) setInterval(() => {}, 60000); // synthetic outbound-work handle
    const ready = () => {
      process.once('message', createShutdownHandler(server, 100));
      process.send('ready');
    };
    server.listen(0, '127.0.0.1', () => {
      if (!${inbound}) { ready(); return; }
      const client = request({ host: '127.0.0.1', port: server.address().port });
      client.on('error', () => {}); client.end();
    });
    server.once('request', ready);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  let errors = ''; child.stderr.on('data', (data) => { errors += data; });
  const watchdog = setTimeout(() => child.kill(), 5000);
  try {
    assert.deepEqual(await once(child, 'message'), ['ready', undefined]);
    const exited = once(child, 'exit'); const started = Date.now(); child.send('stop');
    const [code] = await exited;
    assert.equal(code, retained ? 1 : 0);
    if (retained) assert.match(errors, /did not shut down cleanly/);
    else assert.equal(errors, '');
    assert.ok(Date.now() - started < 3000, 'Retained handles must not keep the process alive');
  } finally { clearTimeout(watchdog); if (child.exitCode === null) child.kill(); }
});
