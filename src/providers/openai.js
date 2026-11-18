import { readBounded } from '../storage/php-bridge.js';
import { validateModel } from './models.js';

export class ProviderFailure extends Error {
  constructor(outcome, usage = null, reason = 'provider_failure') { super('The provider did not produce an accepted result.'); this.outcome = outcome; this.usage = usage; this.reason = reason; }
}

export function createOpenAIProvider({ apiKey = process.env.OPENAI_API_KEY, transport = fetch } = {}) {
  return async ({ spec, schema, instructions, input, timeoutSeconds }) => {
    validateModel(spec);
    if (!apiKey) throw new ProviderFailure('not_configured', null, 'provider_not_configured');
    const body = JSON.stringify({ model: spec.model, store: false, service_tier: 'default', reasoning: { effort: spec.effort },
      max_output_tokens: spec.maxOutputTokens, instructions, input: JSON.stringify(input),
      text: { format: { type: 'json_schema', name: 'advert_result', strict: true, schema } } });
    // Count UTF-8 bytes conservatively, including schema/instructions. Reserve an
    // additional 4K tokens for provider framing. Never infer spend from characters.
    if (Buffer.byteLength(body) + 4096 > 24000) throw new ProviderFailure('rejected', null, 'provider_prompt_limit');
    let response; let data;
    try {
      response = await transport('https://api.openai.com/v1/responses', { method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body,
        signal: AbortSignal.timeout(timeoutSeconds * 1000) });
      data = JSON.parse(await readBounded(response, 131072));
    } catch { throw new ProviderFailure('unknown', null, 'provider_transport_or_json'); }
    const usage = Number.isInteger(data.usage?.input_tokens) && Number.isInteger(data.usage?.output_tokens)
      ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens } : null;
    if (!response.ok) throw new ProviderFailure(response.status === 429 ? 'rejected' : 'unknown', usage, response.status === 429 ? 'provider_rate_limit' : 'provider_http_error');
    if (!usage || usage.inputTokens < 0 || usage.outputTokens < 0 || usage.inputTokens > 24000 || usage.outputTokens > spec.maxOutputTokens) throw new ProviderFailure('unknown', usage, 'provider_usage_invalid');
    if (data.model !== spec.model) throw new ProviderFailure('unknown', usage, 'provider_model_mismatch');
    if (data.status !== 'completed') throw new ProviderFailure('rejected', usage, 'provider_incomplete');
    const chunks = (data.output ?? []).flatMap((item) => item.type === 'message' ? item.content ?? [] : []).filter((part) => part.type === 'output_text');
    if (chunks.length !== 1) throw new ProviderFailure('rejected', usage, 'provider_text_shape');
    try { return { value: JSON.parse(chunks[0].text), usage }; } catch { throw new ProviderFailure('rejected', usage, 'provider_output_json'); }
  };
}
