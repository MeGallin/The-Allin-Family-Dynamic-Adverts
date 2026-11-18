import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createEngine } from '../src/generation/engine.js';
import { createOpenAIProvider, ProviderFailure } from '../src/providers/openai.js';
import { validateModel } from '../src/providers/models.js';
import { advertSchema, validateAdvert } from '../src/validation/advert.js';
import { signature, signedHeaders, verifier } from '../src/security/signatures.js';
import { createServiceServer, closeServer } from '../src/server/http-server.js';

const secret = 'synthetic-test-signing-secret-not-a-real-key';
const feature = { id: 'shopping', ctaId: 'shopping', title: 'Shopping List', exclusions: [], facts: [
  { id: 'fact-1', text: 'Keep family essentials in one shared shopping list.' },
  { id: 'fact-2', text: 'Add, check and edit items for the family.' },
] };
const config = { brand: { name: 'The Allin Family', tone: 'Calm British English', exclusions: ['No private records'] },
  formats: ['headline', 'checklist', 'process', 'comparison'], limits: { headline: 80, message: 240, item: 180, maxItems: 4 },
  generation: { provider: 'openai', model: 'gpt-6-luna', effort: 'low', maxOutputTokens: 512, timeoutSeconds: 5 },
  review: { enabled: false, model: 'gpt-6.1-sol', effort: 'low', maxOutputTokens: 256 } };
const payload = { featureId: 'shopping', ctaId: 'shopping', format: 'checklist', headline: 'Remember the little essentials',
  message: 'Keep a shared list handy when everyday supplies come to mind.', scenario: 'Imagine noticing the last tea bag before a family shopping trip.',
  items: ['Add what the family needs to the shared list.', 'Check an item when it has been picked up.'], factIds: ['fact-1', 'fact-2'] };
const job = () => ({ jobId: 'a'.repeat(32), grantId: 'b'.repeat(32), fence: 1, configRevision: 1, feature, config: structuredClone(config), previous: null });

function durableBridge() {
  const grants = new Map(); let review = 0;
  return { grants, bridge: async ({ action, grantId, usage }) => {
    if (action === 'review-grant') return { grantId: 'review-' + ++review };
    const state = grants.get(grantId) ?? {};
    if (action === 'begin') { if (state.begun) throw new Error('Replay'); state.begun = true; }
    if (action === 'settle') { state.settled = true; state.usage = usage; }
    grants.set(grantId, state); return { allowed: true };
  } };
}

test('creative structured output stays within approved references, formats and plain-copy bounds', () => {
  assert.equal(validateAdvert(payload, feature, config), payload);
  assert.equal(advertSchema(feature, config).properties.headline.enum, undefined);
  for (const change of [{ headline: '<script>alert()</script>' }, { message: 'Visit https://evil.invalid' }, { ctaId: 'arbitrary' },
    { scenario: 'Save £99 today.' }, { factIds: ['missing'] }, { items: [] }, { extra: true }]) {
    assert.throws(() => validateAdvert({ ...payload, ...change }, feature, config));
  }
  assert.throws(() => validateAdvert(payload, feature, config, payload), /similar/);
  for (const format of ['headline', 'process', 'comparison']) {
    assert.doesNotThrow(() => validateAdvert({ ...payload, format, items: format === 'headline' ? [] : payload.items }, feature, config));
  }
  validateModel({ model: 'gpt-6-luna', effort: 'none', maxOutputTokens: 128 });
  assert.throws(() => validateModel({ model: 'gpt-6.1-sol', effort: 'none', maxOutputTokens: 128 }));
  assert.throws(() => validateModel({ model: 'invented', effort: 'low', maxOutputTokens: 128 }));
});

test('engine uses durable one-use grants across engine restarts, settles usage and never sends previous copy', async () => {
  const storage = durableBridge(); let calls = 0;
  const provider = async (input) => { calls++; assert.equal(input.input.previous, undefined); return { value: payload, usage: { inputTokens: 200, outputTokens: 120 } }; };
  const first = createEngine({ provider, bridge: storage.bridge });
  assert.equal((await first(job())).status, 'ready');
  const restarted = createEngine({ provider, bridge: storage.bridge });
  assert.equal((await restarted(job())).status, 'unknown');
  assert.equal(calls, 1);
  assert.deepEqual(storage.grants.get('b'.repeat(32)).usage, { inputTokens: 200, outputTokens: 120 });
});

test('optional review has its own grant; rejection never publishes; unknown provider errors settle unknown', async () => {
  const input = job(); input.config.review.enabled = true;
  const storage = durableBridge(); let count = 0;
  const engine = createEngine({ bridge: storage.bridge, provider: async () => ({ value: ++count === 1 ? payload : { approved: false, reason: 'unsupported_claim' }, usage: { inputTokens: 100, outputTokens: 50 } }) });
  assert.equal((await engine(input)).status, 'rejected'); assert.equal(count, 2); assert.equal(storage.grants.size, 2);
  const failedStorage = durableBridge();
  const failed = createEngine({ bridge: failedStorage.bridge, provider: async () => { throw new ProviderFailure('unknown'); } });
  assert.equal((await failed(job())).status, 'unknown');
  assert.equal(failedStorage.grants.get('b'.repeat(32)).usage, null);
});

test('rejected creative output logs only a fixed diagnostic code, never copy or provider details', async () => {
  const storage = durableBridge(); const messages = []; const previous = console.warn;
  console.warn = (...values) => messages.push(values.join(' '));
  try {
    const engine = createEngine({ bridge: storage.bridge, provider: async () => ({ value: { ...payload, message: 'PRIVATE_DIAGNOSTIC_CANARY https://invalid.example' }, usage: { inputTokens: 100, outputTokens: 100 } }) });
    assert.equal((await engine(job())).status, 'rejected');
    assert.deepEqual(messages, ['Advertising failure: advert_schema']);
    assert.equal(messages.join(' ').includes('CANARY'), false);
  } finally { console.warn = previous; }
});

test('real OpenAI adapter uses strict Responses parameters through mocked transport only', async () => {
  let captured;
  const provider = createOpenAIProvider({ apiKey: 'synthetic-never-real', transport: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); captured = JSON.parse(options.body);
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    return new Response(JSON.stringify({ status: 'completed', model: config.generation.model, usage: { input_tokens: 80, output_tokens: 100 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(payload) }] }] }));
  } });
  const result = await provider({ spec: config.generation, schema: advertSchema(feature, config), instructions: 'Public metadata only', input: { feature }, timeoutSeconds: 5 });
  assert.deepEqual(result.value, payload); assert.equal(captured.store, false); assert.equal(captured.service_tier, 'default');
  assert.equal(captured.max_output_tokens, 512); assert.deepEqual(captured.reasoning, { effort: 'low' });
  assert.equal(captured.text.format.strict, true); assert.equal(captured.tools, undefined);
  const limited = createOpenAIProvider({ apiKey: 'synthetic', transport: async () => { throw new Error('Must not call'); } });
  await assert.rejects(limited({ spec: config.generation, schema: {}, instructions: 'x'.repeat(25000), input: {}, timeoutSeconds: 5 }), (e) => e.outcome === 'rejected');
  const ambiguous = createOpenAIProvider({ apiKey: 'synthetic', transport: async () => new Response('{}') });
  await assert.rejects(ambiguous({ spec: config.generation, schema: {}, instructions: 'safe', input: {}, timeoutSeconds: 5 }), (e) => e.outcome === 'unknown');
  const mismatch = createOpenAIProvider({ apiKey: 'synthetic', transport: async () => new Response(JSON.stringify({ status: 'completed', model: 'unapproved-model', usage: { input_tokens: 1, output_tokens: 1 }, output: [] })) });
  await assert.rejects(mismatch({ spec: config.generation, schema: {}, instructions: 'safe', input: {}, timeoutSeconds: 5 }), (e) => e.outcome === 'unknown');
});

test('future-skew nonce remains rejected through the complete signed validity interval', () => {
  let now = 1800000000000; const verify = verifier(secret, () => now);
  const time = String(Math.floor(now / 1000) + 120); const nonce = 'c'.repeat(32); const raw = '{}';
  const headers = { 'x-ad-time': time, 'x-ad-nonce': nonce, 'x-ad-signature': signature(secret, time, nonce, 'POST', '/v1/generate', raw) };
  assert.equal(verify(headers, 'POST', '/v1/generate', raw), true);
  now += 121000; assert.equal(verify(headers, 'POST', '/v1/generate', raw), false);
  now += 120000; assert.equal(verify(headers, 'POST', '/v1/generate', raw), false);
});

test('HTTP machine routes require exact HMAC, refuse CORS/preflight, allow bounded awaited response and reject replay', async (t) => {
  let calls = 0;
  const server = createServiceServer({ secret, providerConfigured: true, engine: async () => { calls++; await new Promise((done) => setTimeout(done, 80)); return { status: 'rejected' }; } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => closeServer(server));
  const base = `http://127.0.0.1:${server.address().port}`; const raw = JSON.stringify(job());
  const headers = signedHeaders(secret, '/v1/generate', raw);
  const denied = await fetch(base + '/v1/generate', { method: 'POST', headers: { ...headers, Origin: 'https://evil.invalid' }, body: raw });
  assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null); assert.equal(calls, 0);
  const options = await fetch(base + '/v1/generate', { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5173', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(options.status, 403); assert.equal(calls, 0);
  const wrong = await fetch(base + '/v1/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw }); assert.equal(wrong.status, 401);
  const response = await fetch(base + '/v1/generate', { method: 'POST', headers, body: raw });
  assert.equal(response.status, 200); assert.equal(calls, 1); assert.deepEqual(await response.json(), { status: 'rejected' });
  assert.equal((await fetch(base + '/v1/generate', { method: 'POST', headers, body: raw })).status, 401); assert.equal(calls, 1);
  const get = await fetch(base + '/v1/generate'); assert.equal(get.status, 405); assert.equal(get.headers.get('allow'), 'POST');
});
