import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createEngine } from '../src/generation/engine.js';
import { createOpenAIProvider } from '../src/providers/openai.js';
import { createOpenAIImageProvider } from '../src/providers/openai-images.js';
import { createPhpBridge } from '../src/storage/php-bridge.js';

const php = process.env.PHP_BINARY ?? (process.platform === 'win32' ? 'C:/xampp/php/php.exe' : 'php');
const api = resolve('../api');
const secret = 'synthetic-integration-signing-secret-never-real';
const fixture = (directory, body) => JSON.parse(execFileSync(php, ['tests/support/advertising-worker.php', directory], { cwd: api, input: JSON.stringify(body), encoding: 'utf8', windowsHide: true }));
const parallelFixture = (directory, body) => new Promise((done, reject) => {
  const child = spawn(php, ['tests/support/advertising-worker.php', directory], { cwd: api, windowsHide: true });
  let output = ''; let error = ''; child.stdout.on('data', (data) => { output += data; }); child.stderr.on('data', (data) => { error += data; });
  child.on('error', reject); child.on('exit', (code) => { if (code) reject(new Error(error)); else { try { done(JSON.parse(output)); } catch (e) { reject(e); } } });
  child.stdin.end(JSON.stringify(body));
});

test('PHP durable concurrent claims + real signed bridge + mocked Responses complete A/B/C with no paid calls', async (t) => {
  // This generated directory is outside every public route; no real.env is read.
  const directory = resolve(tmpdir(), 'allin-advert-integration-' + randomBytes(12).toString('hex'));
  const now = Math.floor(Date.now() / 1000);
  fixture(directory, { action: 'init', now, images: true });
  const jpeg = execFileSync(php, ['-d', 'extension=gd', '-r', '$i=imagecreatetruecolor(1024,1024); ob_start(); imagejpeg($i,null,75); $b=ob_get_clean(); echo base64_encode($b);'], { encoding: 'utf8', windowsHide: true });
  const port = await new Promise((done) => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => done(port)); }); });
  const server = spawn(php, ['-S', `127.0.0.1:${port}`, 'bin/advertising-bridge-router.php'], { cwd: api, env: { ...process.env, APP_ENV: 'test', ADVERTISING_DIRECTORY: directory, ADVERTISING_SIGNING_SECRET: secret }, stdio: 'ignore', windowsHide: true });
  t.after(async () => {
    if (server.exitCode === null) { const exit = once(server, 'exit'); server.kill(); await exit; }
    const files = await readdir(directory);
    for (const file of files) {
      if (file === 'assets') {
        for (const image of await readdir(resolve(directory, 'assets'))) { assert.match(image, /^[a-f0-9]{48}\.jpg$/); await rm(resolve(directory, 'assets', image)); }
        await rmdir(resolve(directory, 'assets'));
      } else { assert.match(file, /^(state\.json|state\.lock)$/); await rm(resolve(directory, file)); }
    }
    await rmdir(directory);
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 30; i++) { try { if ((await fetch(base + '/.env')).status === 404) break; } catch {} await delay(30); }
  const claims = await Promise.all([parallelFixture(directory, { action: 'claim', now }), parallelFixture(directory, { action: 'claim', now })]);
  assert.equal(claims.filter(Boolean).length, 1, 'Stable lock produces one job across PHP processes');
  const bridge = createPhpBridge({ url: 'http://127.0.0.1:8001/advertising/machine', environment: 'test', secret,
    transport: (url, options) => fetch(base + new URL(url).pathname, options) });
  let providerCalls = 0; let imageCalls = 0;
  const imageProvider = createOpenAIImageProvider({ apiKey: 'synthetic-not-real', transport: async () => {
    imageCalls++;
    return new Response(JSON.stringify({ data: [{ b64_json: jpeg }], usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110, input_tokens_details: { text_tokens: 100, image_tokens: 0 } } }));
  } });
  const provider = createOpenAIProvider({ apiKey: 'synthetic-not-real', transport: async (url, options) => {
    providerCalls++; const body = JSON.parse(options.body); const { feature, layouts } = JSON.parse(body.input);
    const advert = { featureId: feature.id, ctaId: feature.ctaId, format: 'headline', headline: 'Everyday life, a little easier', message: feature.facts[0].text,
      scenario: 'Imagine getting ready for a quiet day together.', items: [], factIds: [feature.facts[0].id], imageBrief: 'Distinctive editorial scene of everyday objects arranged in warm side lighting with generous breathing room.', composition: layouts[0] };
    return new Response(JSON.stringify({ status: 'completed', model: body.model, usage: { input_tokens: 100, output_tokens: 100 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(advert) }] }] }));
  } });
  let engine = createEngine({ provider, bridge, imageProvider }); const first = claims.find(Boolean);
  const resultA = await engine(first); assert.equal(resultA.status, 'ready');
  fixture(directory, { action: 'finish', job: first, result: resultA, now });
  fixture(directory, { action: 'admin', command: 'approve', now }); fixture(directory, { action: 'admin', command: 'publish', now });
  const a = fixture(directory, { action: 'snapshot' }).current;
  engine = createEngine({ provider, bridge, imageProvider }); // Node restart loses all process state.
  assert.equal((await engine(first)).status, 'unknown'); assert.equal(providerCalls, 1, 'Durable grant prevents billed replay after restart');
  const second = fixture(directory, { action: 'claim', now: now + 1 });
  const resultB = await engine(second); assert.equal(resultB.status, 'ready');
  fixture(directory, { action: 'finish', job: second, result: resultB, now: now + 1 });
  assert.equal(fixture(directory, { action: 'snapshot' }).current.id, a.id);
  fixture(directory, { action: 'admin', command: 'approve', now: now + 1 });
  fixture(directory, { action: 'admin', command: 'publish', now: now + 60 });
  const b = fixture(directory, { action: 'snapshot' }); assert.notEqual(b.current.id, a.id); assert.equal(b.candidate, null);
  assert.notEqual(b.current.image.id, a.image.id);
  await assert.rejects(import('node:fs/promises').then((fs) => fs.access(resolve(directory, 'assets', a.image.id + '.jpg'))));
  const third = fixture(directory, { action: 'claim', now: now + 61 });
  const resultC = await engine(third); assert.equal(resultC.status, 'ready');
  fixture(directory, { action: 'finish', job: third, result: resultC, now: now + 61 });
  const end = fixture(directory, { action: 'snapshot' }); assert.equal(end.current.id, b.current.id); assert.ok(end.candidate);
  assert.equal(providerCalls, 3); assert.equal(imageCalls, 3); assert.equal(Object.values(end.usage)[0].images, 3);
  assert.equal(end.audit.some((entry) => 'payload' in entry), false);
  const denied = await fetch(base + '/advertising/machine', { method: 'POST', headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(denied.status, 404);
  assert.equal((await fetch(base + '/src/advertising/store.php')).status, 404);
});
