import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createOpenAIImageProvider, validateImageSettings } from '../src/providers/openai-images.js';
import { advertSchema, validateAdvert } from '../src/validation/advert.js';

const php = process.env.PHP_BINARY ?? (process.platform === 'win32' ? 'C:/xampp/php/php.exe' : 'php');
const jpeg = execFileSync(php, ['-d', 'extension=gd', '-r', '$i=imagecreatetruecolor(1024,1024); ob_start(); imagejpeg($i,null,75); $b=ob_get_clean(); echo base64_encode($b);'], { encoding: 'utf8', windowsHide: true });
const settings = { enabled: true, model: 'gpt-image-2.6-flare', quality: 'medium', complexity: 'medium', size: '1024x1024', timeoutSeconds: 120,
  promptStyle: 'Vivid editorial campaign composition, no interface or text', maxPromptCharacters: 1200, reservationMicros: 2000000, layouts: ['poster', 'split', 'image-led'], maxHeadlineWords: 5 };
const feature = { id: 'focus', ctaId: 'focus', title: 'Focus Timer', exclusions: ['No invented alarm promises'], facts: [{ id: 'fact-1', text: 'Choose a private focus period.' }, { id: 'fact-2', text: 'Select a short or long break.' }] };
const payload = { featureId: 'focus', ctaId: 'focus', format: 'headline', headline: 'A little room to think', message: 'Choose a private focus period.', scenario: '', items: [], factIds: ['fact-1'],
  imageBrief: 'An original still life of a single orange balancing on a stone in warm sidelight, suggesting a quiet focus period.', composition: 'poster' };
const usage = { input_tokens: 100, output_tokens: 40, total_tokens: 140, input_tokens_details: { text_tokens: 100, image_tokens: 0 } };

test('Images adapter sends only verified bounded parameters and dynamic creative brief using mocked transport', async () => {
  let request;
  const provider = createOpenAIImageProvider({ apiKey: 'synthetic-image-test', transport: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/images/generations'); request = JSON.parse(options.body);
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    return new Response(JSON.stringify({ data: [{ b64_json: jpeg }], usage })); // No required response model field.
  } });
  const result = await provider({ settings, feature, payload, brand: { name: 'Fixture', exclusions: [] } });
  assert.equal(result.encoded, jpeg); assert.equal(result.usage.imageOutputTokens, 40);
  assert.equal(request.model, settings.model); assert.equal(request.n, 1); assert.equal(request.quality, 'medium');
  assert.equal(request.complexity, 'medium'); assert.equal(request.size, '1024x1024'); assert.equal(request.output_format, 'jpeg'); assert.equal(request.background, 'opaque');
  for (const key of ['reasoning', 'response_format', 'output_compression', 'max_output_tokens', 'input_fidelity', 'store']) assert.equal(request[key], undefined);
  assert.ok(request.prompt.includes(payload.imageBrief)); assert.ok(request.prompt.includes(feature.exclusions[0]));
  assert.ok(request.prompt.includes('247x231')); assert.ok(request.prompt.includes('upper45percent'));
  assert.equal(request.prompt.includes('Shopping'), false);
});

test('Images adapter rejects unsupported settings, invalid raster, metadata and malformed usage without logging bytes', async () => {
  assert.throws(() => validateImageSettings({ ...settings, model: 'arbitrary-model' }));
  assert.throws(() => validateImageSettings({ ...settings, timeoutSeconds: 121 }));
  for (const data of [
    { data: [{ b64_json: Buffer.from('<svg>bad</svg>').toString('base64') }], usage },
    { data: [{ url: 'https://evil.invalid' }], usage },
    { data: [{ b64_json: jpeg }], usage: { ...usage, total_tokens: 1 } },
    { data: [{ b64_json: jpeg }], usage, model: 'wrong-model' },
  ]) {
    const provider = createOpenAIImageProvider({ apiKey: 'synthetic', transport: async () => new Response(JSON.stringify(data)) });
    await assert.rejects(provider({ settings, feature, payload, brand: {} }));
  }
});

test('optional visual brief is part of strict creative output only when images are enabled', () => {
  const config = { image: settings, formats: ['headline'], limits: { headline: 56, message: 140, item: 140, maxItems: 2 } };
  assert.ok(advertSchema(feature, config).required.includes('imageBrief'));
  assert.equal(validateAdvert(payload, feature, config), payload);
  assert.throws(() => validateAdvert({ ...payload, imageBrief: 'https://bad.invalid' }, feature, config));
  assert.equal(advertSchema(feature, { ...config, image: { ...settings, enabled: false } }).properties.imageBrief, undefined);
});

test('campaign layout and hook are constrained together without accepting generated markup', () => {
  const config = { image: settings, formats: ['headline'], limits: { headline: 56, message: 140, item: 140, maxItems: 2 } };
  assert.deepEqual(advertSchema(feature, config).properties.composition.enum, settings.layouts);
  for (const composition of settings.layouts) assert.doesNotThrow(() => validateAdvert({ ...payload, composition }, feature, config));
  for (const composition of [undefined, 'custom-layout', '<style>bad</style>']) assert.throws(() => validateAdvert({ ...payload, composition }, feature, config));
  assert.throws(() => validateAdvert({ ...payload, headline: 'A little more room to think today' }, feature, config));
  assert.doesNotThrow(() => validateAdvert({ ...payload, headline: "Don't rush. Make head-space." }, feature, config));
  assert.throws(() => validateAdvert({ ...payload, composition: 'split' }, feature, { ...config, image: { ...settings, layouts: ['poster'] } }));
  assert.throws(() => validateImageSettings({ ...settings, layouts: ['poster', 'poster'] }));
  assert.throws(() => validateImageSettings({ ...settings, maxHeadlineWords: 9 }));
  assert.doesNotThrow(() => validateAdvert({ ...payload, headline: 'Focus, restored.' }, feature, { ...config, image: { ...settings, maxHeadlineWords: 2 } }));
});
