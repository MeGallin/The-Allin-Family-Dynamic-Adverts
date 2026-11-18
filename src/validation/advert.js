import { validateModel } from '../providers/models.js';
import { validateImageSettings } from '../providers/openai-images.js';

const featureIds = new Set(['jobs', 'shopping', 'polls', 'dinner', 'where', 'nonograms', 'sudoku', 'focus', 'word', 'calendar', 'memories', 'notes', 'appearance', 'week', 'tfl']);
const formats = new Set(['headline', 'checklist', 'process', 'comparison']);
function plain(text, max) {
  return typeof text === 'string' && text.trim().length > 0 && [...text].length <= max
    && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]|https?:\/\/|www\./iu.test(text);
}

export function validateJob(job) {
  if (!job || !/^[a-f0-9]{32}$/.test(job.jobId ?? '') || !/^[a-f0-9]{32}$/.test(job.grantId ?? '')
      || !Number.isInteger(job.fence) || job.fence < 1 || !Number.isInteger(job.configRevision) || job.configRevision < 1) throw new Error('Invalid job identity.');
  const { feature, config } = job;
  if (!featureIds.has(feature?.id) || feature.ctaId !== feature.id || !plain(feature.title, 100)
      || !Array.isArray(feature.facts) || feature.facts.length < 2 || feature.facts.length > 8
      || !feature.facts.every((fact) => /^fact-[1-8]$/.test(fact.id) && plain(fact.text, 240))
      || new Set(feature.facts.map((f) => f.id)).size !== feature.facts.length) throw new Error('Invalid approved facts.');
  if (!config || !Array.isArray(config.formats) || !config.formats.length || config.formats.length > 4 || !config.formats.every((format) => formats.has(format))) throw new Error('Invalid formats.');
  for (const [key, min, max] of [['headline', 20, 100], ['message', 40, 400], ['item', 40, 240], ['maxItems', 2, 4]]) {
    if (!Number.isInteger(config.limits?.[key]) || config.limits[key] < min || config.limits[key] > max) throw new Error('Invalid copy limits.');
  }
  if (!plain(config.brand?.name, 80) || !plain(config.brand?.tone, 160) || !Array.isArray(config.brand?.exclusions)
      || config.brand.exclusions.length > 12 || !config.brand.exclusions.every((v) => plain(v, 160))
      || !Array.isArray(feature.exclusions) || feature.exclusions.length > 8 || !feature.exclusions.every((v) => plain(v, 160))) throw new Error('Invalid brand instructions.');
  validateModel(config.generation);
  validateModel(config.review, 1024);
  if (config.image) validateImageSettings(config.image);
  if (config.generation.provider !== 'openai' || !Number.isInteger(config.generation.timeoutSeconds)
      || config.generation.timeoutSeconds < 5 || config.generation.timeoutSeconds > 45 || typeof config.review.enabled !== 'boolean') throw new Error('Invalid provider settings.');
  return job;
}

export function advertSchema(feature, config) {
  const image = config.image?.enabled;
  return { type: 'object', additionalProperties: false, required: ['featureId', 'ctaId', 'format', 'headline', 'message', 'scenario', 'items', 'factIds', ...(image ? ['imageBrief', 'composition'] : [])],
    properties: { featureId: { type: 'string', enum: [feature.id] }, ctaId: { type: 'string', enum: [feature.ctaId] },
      format: { type: 'string', enum: config.formats }, headline: { type: 'string', maxLength: config.limits.headline },
      message: { type: 'string', maxLength: config.limits.message }, scenario: { type: 'string', maxLength: 240 },
      items: { type: 'array', maxItems: config.limits.maxItems, items: { type: 'string', maxLength: config.limits.item } },
      factIds: { type: 'array', minItems: 1, maxItems: config.limits.maxItems, items: { type: 'string', enum: feature.facts.map((f) => f.id) } },
      ...(image ? { imageBrief: { type: 'string', minLength: 40, maxLength: config.image.maxPromptCharacters }, composition: { type: 'string', enum: config.image.layouts } } : {}) } };
}

export function validateAdvert(payload, feature, config, previous = null) {
  const keys = ['featureId', 'ctaId', 'format', 'headline', 'message', 'scenario', 'items', 'factIds', ...(config.image?.enabled ? ['imageBrief', 'composition'] : [])];
  if (!payload || Object.keys(payload).length !== keys.length || !keys.every((key) => Object.hasOwn(payload, key))
      || payload.featureId !== feature.id || payload.ctaId !== feature.ctaId
      || !config.formats.includes(payload.format) || !plain(payload.headline, config.limits.headline)
      || !plain(payload.message, config.limits.message) || !Array.isArray(payload.factIds) || payload.factIds.length < 1
      || payload.factIds.length > config.limits.maxItems || new Set(payload.factIds).size !== payload.factIds.length) throw new Error('Advert schema validation failed.');
  const facts = new Map(feature.facts.map((fact) => [fact.id, fact.text]));
  if (payload.factIds.some((id) => !facts.has(id))) throw new Error('Advert facts validation failed.');
  if (config.image?.enabled && (!plain(payload.imageBrief, config.image.maxPromptCharacters) || payload.imageBrief.length < 40)) throw new Error('Invalid image brief.');
  if (config.image?.enabled) {
    const words = payload.headline.match(/[\p{L}\p{N}]+(?:['’\-\u2010-\u2015][\p{L}\p{N}]+)*/gu) ?? [];
    if (!config.image.layouts.includes(payload.composition) || words.length < 2 || words.length > config.image.maxHeadlineWords) throw new Error('Invalid campaign composition or headline.');
  }
  if (typeof payload.scenario !== 'string' || [...payload.scenario].length > 240 || (payload.scenario !== '' && !plain(payload.scenario, 240)) || (payload.format !== 'headline' && !payload.scenario.trim())) throw new Error('Invalid illustrative scenario.');
  if (!Array.isArray(payload.items) || payload.items.length > config.limits.maxItems || (payload.format === 'headline' && payload.items.length !== 0)
      || payload.items.some((item) => !plain(item, config.limits.item))
      || (payload.format !== 'headline' && payload.items.length < 2) || (payload.format === 'comparison' && payload.items.length !== 2)) throw new Error('Advert format validation failed.');
  const approved = feature.facts.map((fact) => fact.text).join(' ') + ' ' + feature.title;
  const copy = [payload.headline, payload.message, payload.scenario, ...payload.items].join(' ');
  const knownNumbers = new Set(approved.match(/\d+(?:[.,]\d+)*/gu) ?? []);
  if ((copy.match(/\d+(?:[.,]\d+)*/gu) ?? []).some((n) => !knownNumbers.has(n)) || (/[$£€]/u.test(copy) && !/[$£€]/u.test(approved))) throw new Error('Unapproved number or price.');
  if (previous?.featureId === payload.featureId && previous.format === payload.format) {
    const before = new Set((previous.headline + ' ' + previous.message + ' ' + previous.scenario + ' ' + previous.items.join(' ')).toLowerCase().match(/[\p{L}\p{N}]+/gu));
    const after = new Set((payload.headline + ' ' + payload.message + ' ' + payload.scenario + ' ' + payload.items.join(' ')).toLowerCase().match(/[\p{L}\p{N}]+/gu));
    const overlap = [...after].filter((word) => before.has(word)).length;
    if (overlap / new Set([...before, ...after]).size > 0.9) throw new Error('Advert is too similar to the current advert.');
  }
  return payload;
}

export const reviewSchema = { type: 'object', additionalProperties: false, required: ['approved', 'reason'], properties: {
  approved: { type: 'boolean' }, reason: { type: 'string', enum: ['approved', 'unsupported_claim', 'excluded_copy', 'unsuitable_format'] },
} };
