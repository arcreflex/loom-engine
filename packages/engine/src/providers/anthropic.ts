import type { Logger } from '../log.ts';
import { KNOWN_MODELS } from './known-models.ts';
import type { IProvider, ProviderRequest, ProviderResponse } from './types.ts';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Implements IProvider for Anthropic's Claude API.
 * Requires the Anthropic SDK: npm install @anthropic-ai/sdk
 */
export class AnthropicProvider implements IProvider {
  private apiKey: string | undefined;
  private baseURL?: string;
  private logger: Logger;

  /**
   * Creates a new Anthropic provider.
   *
   * @param apiKey - The Anthropic API key. If not provided, will try to use process.env.ANTHROPIC_API_KEY
   * @param baseURL - Optional custom API base URL
   */
  constructor(logger: Logger, apiKey?: string, baseURL?: string) {
    // Use provided API key or fall back to environment variable
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseURL = baseURL;
    this.logger = logger;
  }

  /**
   * Generates a completion from Anthropic's Claude API.
   *
   * @param request - The request parameters
   * @returns A Promise resolving to the provider's response
   */
  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key is required. Provide it explicitly or set ANTHROPIC_API_KEY environment variable.'
      );
    }

    try {
      const anthropic = new Anthropic({
        apiKey: this.apiKey,
        baseURL: this.baseURL
      });

      // Map parameters to Anthropic's expected format
      const anthropicMessages: Anthropic.MessageParam[] = [];
      for (let i = 0; i < request.messages.length; i++) {
        const msg = request.messages[i];
        let content = msg.content;
        if (i === request.messages.length - 1) {
          // last message isn't allowed to end with whitespace
          content = content.replace(/[\s\n]+$/, '');
        }
        anthropicMessages.push({
          role: msg.role,
          content
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

      if (top_p !== undefined && typeof top_p !== 'number') {
        throw new Error('top_p must be a number');
      }
      if (top_k !== undefined && typeof top_k !== 'number') {
        throw new Error('top_k must be a number');
      }

      if (stop_sequences !== undefined && !Array.isArray(stop_sequences)) {
        throw new Error('stop must be an array');
      }

      const modelMaxTokens =
        KNOWN_MODELS[`anthropic/${request.model}`]?.capabilities
          .max_output_tokens ?? Infinity;
      const adjusted_max_tokens = Math.min(max_tokens, modelMaxTokens);

      // Create message with Anthropic API
      const req = {
        model: request.model,
        messages: anthropicMessages,
        temperature,
        max_tokens: adjusted_max_tokens,
        top_p,
        top_k,
        stop_sequences,
        stream: false,
        system: request.systemMessage
      } as const;

      this.logger.log('Anthropic request:\n' + JSON.stringify(req, null, 2));

      const response = await anthropic.messages.create(req);

      this.logger.log(
        'Anthropic response:\n' + JSON.stringify(response, null, 2)
      );

      const content = response.content.map(c => c.text).join('');

      // Map response to our expected format
      return {
        message: {
          role: 'assistant',
          content: content
        },
        usage: {
          input_tokens: response.usage?.input_tokens,
          output_tokens: response.usage?.output_tokens,
          raw: response.usage
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
