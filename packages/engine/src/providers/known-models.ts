import type { ProviderName } from '../types.ts';
import type { ProviderModelSpec } from './types.ts';

export const KNOWN_MODELS: {
  [key: `${ProviderName}/${string}`]: ProviderModelSpec | undefined;
} = {
  'google/gemini-2.5-pro-preview-05-06': {
    provider: 'google',
    model: 'gemini-2.5-pro-preview-05-06',
    docs_url:
      'https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-pro',
    capabilities: { max_input_tokens: 1048576, max_output_tokens: 65536 },
    cost: { input: 1.25, output: 10 }
  },
  'google/gemini-2.5-pro-preview-03-25': {
    provider: 'google',
    model: 'gemini-2.5-pro-preview-03-25',
    docs_url:
      'https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-pro',
    capabilities: { max_input_tokens: 1048576, max_output_tokens: 65536 },
    cost: { input: 1.25, output: 10 }
  },
  'google/gemini-2.0-flash': {
    provider: 'google',
    model: 'gemini-2.0-flash',
    docs_url:
      'https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-0-flash',
    capabilities: { max_input_tokens: 1048576, max_output_tokens: 8192 },
    cost: { input: 0.1, output: 0.4 }
  },
  'google/gemini-2.0-flash-thinking-exp-01-21': {
    provider: 'google',
    model: 'gemini-2.0-flash-thinking-exp-01-21',
    // this is a guess
    capabilities: { max_input_tokens: 1048576, max_output_tokens: 65536 },
    cost: { input: 0, output: 0 }
  },
  'anthropic/claude-3-7-sonnet-20250219': {
    provider: 'anthropic',
    model: 'claude-3-7-sonnet-20250219',
    capabilities: { max_input_tokens: 200000, max_output_tokens: 64000 },
    cost: { input: 3, output: 15 }
  },
  'anthropic/claude-sonnet-4-20250514': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    capabilities: { max_input_tokens: 200000, max_output_tokens: 64000 },
    cost: { input: 3, output: 15 }
  },
  'anthropic/claude-3-5-sonnet-20241022': {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    capabilities: { max_input_tokens: 200000, max_output_tokens: 8192 },
    cost: { input: 3, output: 15 }
  },
  'anthropic/claude-3-5-sonnet-20240620': {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20240620',
    capabilities: { max_input_tokens: 200000, max_output_tokens: 8192 },
    cost: { input: 3, output: 15 }
  },
  'anthropic/claude-3-5-haiku-20241022': {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    capabilities: { max_input_tokens: 200000, max_output_tokens: 8192 },
    cost: { input: 0.8, output: 4 }
  },
  'anthropic/claude-3-opus-20240229': {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    capabilities: { max_input_tokens: 200000, max_output_tokens: 4096 },
    cost: { input: 15, output: 75 }
  },
  'anthropic/claude-opus-4-20250514': {
    provider: 'anthropic',
    model: 'claude-opus-4-20250514',
    capabilities: { max_input_tokens: 200000, max_output_tokens: 32000 },
    cost: { input: 15, output: 75 }
  },
  'openai/o3-2025-04-16': {
    provider: 'openai',
    model: 'o3-2025-04-16',
    capabilities: { max_input_tokens: 200000, max_output_tokens: 100000 },
    cost: { input: 10, output: 40, cached_input: 2.5 }
  },

  'openai/o4-mini-2025-04-16': {
    provider: 'openai',
    model: 'o4-mini-2025-04-16',
    capabilities: { max_input_tokens: 200000, max_output_tokens: 100000 },
    cost: { input: 1.1, output: 4.4, cached_input: 0.275 }
  },

  'openai/gpt-4.1-2025-04-14': {
    provider: 'openai',
    model: 'gpt-4.1-2025-04-14',
    capabilities: { max_input_tokens: 1047576, max_output_tokens: 32768 },
    cost: { input: 2, output: 8, cached_input: 0.5 }
  },

  'openai/gpt-4o-2024-08-06': {
    provider: 'openai',
    model: 'gpt-4o-2024-08-06',
    capabilities: { max_input_tokens: 128000, max_output_tokens: 16384 },
    cost: { input: 2.5, output: 10, cached_input: 1.25 }
  },

  'openai/o3-mini-2025-01-31': {
    provider: 'openai',
    model: 'o3-mini-2025-01-31',
    capabilities: { max_input_tokens: 200000, max_output_tokens: 100000 },
    cost: { input: 1.1, output: 4.4, cached_input: 0.55 }
  },

  'openai/o1-2024-12-17': {
    provider: 'openai',
    model: 'o1-2024-12-17',
    capabilities: { max_input_tokens: 200000, max_output_tokens: 100000 },
    cost: { input: 15, output: 60, cached_input: 7.5 }
  }
};
