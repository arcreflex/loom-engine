import type { Logger } from '../log.ts';
import { KNOWN_MODELS } from './known-models.ts';
import type { IProvider, ProviderRequest, ProviderResponse } from './types.ts';
import OpenAI from 'openai';

/**
 * Implements IProvider for OpenAI's API.
 */
export class OpenAIProvider implements IProvider {
  private apiKey: string | undefined;
  private baseURL?: string;
  private logger: Logger;

  /**
   * Creates a new OpenAI provider.
   *
   * @param apiKey - The OpenAI API key. If not provided, will try to use process.env.OPENAI_API_KEY
   * @param baseURL - Optional custom API base URL
   */
  constructor(logger: Logger, apiKey?: string, baseURL?: string) {
    // Use provided API key or fall back to environment variable
    this.apiKey = apiKey || process.env.OPENAI_API_KEY;
    this.baseURL = baseURL;
    this.logger = logger;
  }

  /**
   * Generates a completion from OpenAI.
   * @param request - The request parameters
   * @returns A Promise resolving to the provider's response
   */
  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key is required. Provide it explicitly or set OPENAI_API_KEY environment variable.'
      );
    }

    try {
      const openai = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL
      });

      // Prepare messages, including system message if provided
      const messages: OpenAI.ChatCompletionMessageParam[] = [];

      // Add system message if provided
      if (request.systemMessage) {
        messages.push({
          role: 'system',
          content: request.systemMessage
        });
      }

      // Add conversation history
      for (const msg of request.messages) {
        if (msg.role === 'tool') {
          // Tool messages require tool_call_id and content
          if (!msg.tool_call_id || msg.content == null) {
            continue; // Skip tool messages without tool_call_id or content
          }
          messages.push({
            role: 'tool',
            content: msg.content,
            tool_call_id: msg.tool_call_id
          });
        } else if (msg.role === 'assistant') {
          // Assistant messages can have tool_calls and/or content
          const assistantMessage: OpenAI.ChatCompletionAssistantMessageParam = {
            role: 'assistant'
          };

          // Add content if it exists
          if (msg.content != null) {
            assistantMessage.content = msg.content;
          }

          // Add tool_calls if they exist
          if (msg.tool_calls) {
            assistantMessage.tool_calls = msg.tool_calls.map(tc => ({
              id: tc.id,
              type: tc.type,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments
              }
            }));
          }

          // Skip if neither content nor tool_calls exist
          if (msg.content == null && !msg.tool_calls) {
            continue;
          }

          messages.push(assistantMessage);
        } else {
          // User messages require content
          if (msg.content == null) {
            continue;
          }
          messages.push({
            role: 'user',
            content: msg.content
          });
        }
      }

      // Extract specific parameters for OpenAI, with defaults
      const {
        temperature = 1.0,
        max_tokens = 1024,
        top_p,
        frequency_penalty,
        presence_penalty,
        stop
      } = request.parameters;

      if (top_p !== undefined && typeof top_p !== 'number') {
        throw new Error('top_p must be a number');
      }
      if (
        frequency_penalty !== undefined &&
        typeof frequency_penalty !== 'number'
      ) {
        throw new Error('frequency_penalty must be a number');
      }
      if (
        presence_penalty !== undefined &&
        typeof presence_penalty !== 'number'
      ) {
        throw new Error('presence_penalty must be a number');
      }
      if (stop !== undefined && !Array.isArray(stop)) {
        throw new Error('stop must be an array');
      }

      const modelMaxTokens =
        KNOWN_MODELS[`openai/${request.model}`]?.capabilities
          .max_output_tokens ?? Infinity;
      const adjusted_max_tokens = Math.min(max_tokens, modelMaxTokens);

      // Create completion with OpenAI API
      const req = {
        model: request.model,
        messages: messages,
        temperature,
        max_completion_tokens: adjusted_max_tokens,
        top_p,
        frequency_penalty,
        presence_penalty,
        stop,
        stream: false
      } as const;

      this.logger.log('OpenAI request:\n' + JSON.stringify(req, null, 2));
      const response = await openai.chat.completions.create(req);
      this.logger.log('OpenAI response:\n' + JSON.stringify(response, null, 2));

      const content = response.choices.length
        ? response.choices[0].message.content
        : undefined;

      // Map response to our expected format
      return {
        message: {
          role: 'assistant',
          content: content || ''
        },
        usage: {
          input_tokens: response.usage?.prompt_tokens,
          output_tokens: response.usage?.completion_tokens,
          raw: response.usage
        },
        finish_reason: response.choices[0].finish_reason || null,
        rawResponse: response
      };
    } catch (error) {
      // Handle API errors
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error occurred when calling OpenAI API';

      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI provider error: ${errorMessage}`);
    }
  }
}
