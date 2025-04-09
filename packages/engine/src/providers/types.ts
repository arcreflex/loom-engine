import type { Message } from '../types.ts';

/**
 * Request to a language model provider.
 */
export interface ProviderRequest {
  /** The full context history of messages. */
  messages: Message[];

  model: string;

  parameters: {
    max_tokens: number;
    temperature: number;
    [key: string]: any; // Allow any other parameters
  };

  /** Whether to stream the response. */
  stream?: boolean;
}

/**
 * Response from a language model provider.
 */
export interface ProviderResponse {
  /** The generated message. */
  message: Message;

  /** Usage information from the provider. */
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };

  /** The reason the generation stopped. */
  finish_reason?: string | null;

  /** The raw response from the provider for debugging/extensions. */
  rawResponse?: any;
}

/**
 * Interface for a language model provider.
 */
export interface IProvider {
  /**
   * Generates a completion from the provider.
   * @param request - The request parameters
   * @returns A Promise resolving to the provider's response
   */
  generate(request: ProviderRequest): Promise<ProviderResponse>;
}
