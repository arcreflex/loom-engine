import type { ProviderName } from './types.ts';

/**
 * Parses a model string in the format "provider/model"
 */
export function parseModelString(modelString: string): {
  provider: ProviderName;
  model: string;
} {
  const parts = modelString.split('/');
  if (parts.length < 2) {
    throw new Error(
      'Invalid model format. Expected "provider/model" (e.g., "anthropic/claude-3-opus-20240229").'
    );
  }

  const modelId = parts.slice(1).join('/');

  switch (parts[0]) {
    case 'openai':
    case 'anthropic':
    case 'google':
    case 'openrouter':
      return {
        provider: parts[0],
        model: modelId
      };
    default:
      throw new Error(
        `Unsupported provider "${parts[0]}". Supported providers: openai, anthropic, google.`
      );
  }
}
