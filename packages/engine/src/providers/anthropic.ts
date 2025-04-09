import type { IProvider, ProviderRequest, ProviderResponse } from './types.ts';
import Anthropic from '@anthropic-ai/sdk';
/**
 * Implements IProvider for Anthropic's Claude API.
 * Requires the Anthropic SDK: npm install @anthropic-ai/sdk
 */
export class AnthropicProvider implements IProvider {
  private apiKey: string;
  private baseURL?: string;

  /**
   * Creates a new Anthropic provider.
   *
   * @param apiKey - The Anthropic API key. If not provided, will try to use process.env.ANTHROPIC_API_KEY
   * @param baseURL - Optional custom API base URL
   */
  constructor(apiKey?: string, baseURL?: string) {
    // Use provided API key or fall back to environment variable
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';

    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key is required. Provide it explicitly or set ANTHROPIC_API_KEY environment variable.'
      );
    }

    this.baseURL = baseURL;
  }

  /**
   * Generates a completion from Anthropic's Claude API.
   *
   * @param request - The request parameters
   * @returns A Promise resolving to the provider's response
   */
  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    try {
      const anthropic = new Anthropic({
        apiKey: this.apiKey,
        baseURL: this.baseURL
      });

      // Map parameters to Anthropic's expected format
      let systemMessage: string | undefined;
      const anthropicMessages: Anthropic.MessageParam[] = [];
      for (const msg of request.messages) {
        if (msg.role === 'system') {
          systemMessage = msg.content;
          continue;
        }
        anthropicMessages.push({
          role: msg.role,
          content: msg.content
        });
      }

      // Extract specific parameters for Anthropic, with defaults
      const {
        temperature = 1.0,
        max_tokens = 1024,
        top_p,
        top_k,
        stop_sequences
      } = request.parameters;

      // Create message with Anthropic API
      const response = await anthropic.messages.create({
        model: request.model,
        messages: anthropicMessages,
        temperature,
        max_tokens,
        top_p,
        top_k,
        stop_sequences,
        stream: false
      });

      // Map response to our expected format
      return {
        message: {
          role: 'assistant',
          content: response.content[0].text
        },
        usage: {
          input_tokens: response.usage?.input_tokens,
          output_tokens: response.usage?.output_tokens
        },
        finish_reason: response.stop_reason || null,
        rawResponse: response
      };
    } catch (error) {
      // Handle API errors
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error occurred when calling Anthropic API';

      console.error('Anthropic API error:', error);
      throw new Error(`Anthropic provider error: ${errorMessage}`);
    }
  }
}
