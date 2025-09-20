import type { Message, ProviderName } from '../types.ts';
import type { JSONSchema7 } from 'json-schema';

/**
 * Tool definition formatted for provider APIs.
 */
export interface ToolDefinitionForProvider {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema7 & { type: 'object'; [k: string]: unknown };
  };
}

/**
 * Request to a language model provider.
 */
export interface ProviderRequest {
  systemMessage: string | undefined;
  /** The full context history of messages in canonical blocks format. */
  messages: Message[];

  model: string;

  parameters: {
    max_tokens: number;
    temperature: number;
    [key: string]: unknown; // Allow any other parameters
  };

  /** Optional tools available for the model to call. */
  tools?: ToolDefinitionForProvider[];

  /** Optional tool choice directive for the model. */
  tool_choice?:
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } };
}

/**
 * Response from a language model provider.
 */
export interface ProviderResponse {
  /** The generated message in canonical blocks format. */
  message: Message;

  /** Usage information from the provider. */
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    raw?: unknown;
  };

  /** The reason the generation stopped. */
  finish_reason?: string | null;

  /** The raw response from the provider for debugging/extensions. */
  rawResponse?: unknown;
}

/**
 * Interface for a language model provider.
 */
export interface IProvider {
  /**
   * Generates a completion from the provider.
   * @param request - The request parameters
   * @param signal - Optional abort signal allowing the caller to cancel the request
   * @returns A Promise resolving to the provider's response
   */
  generate(
    _request: ProviderRequest,
    signal?: AbortSignal
  ): Promise<ProviderResponse>;
}

export interface ProviderModelSpec {
  /** The type of language model provider. */
  provider: ProviderName;
  /** The model name, e.g., 'gpt-4', 'claude-3-opus-20240229'. */
  model: string;

  docs_url?: string;

  capabilities: {
    max_input_tokens: number;
    max_output_tokens: number;
    /** If set, limits total tokens (input + output) */
    max_total_tokens?: number;
  };

  cost: {
    input: number;
    output: number;
    cached_input?: number;
  };
}
