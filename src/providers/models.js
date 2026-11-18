export const models = Object.freeze({
  'gpt-6-luna': { efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] },
  'gpt-6.1-sol': { efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  'gpt-6.1-terra': { efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] },
  'gpt-6-astra': { efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
});

export function validateModel(spec, maxTokens = 2048) {
  if (!models[spec?.model]?.efforts.includes(spec?.effort)
      || !Number.isInteger(spec.maxOutputTokens) || spec.maxOutputTokens < 128 || spec.maxOutputTokens > maxTokens) {
    throw new Error('Unsupported model settings.');
  }
}
