import type { Logger } from '../log.ts';
import { KNOWN_MODELS } from './known-models.ts';
import type { IProvider, ProviderRequest, ProviderResponse } from './types.ts';
import { toolCallsToToolUseBlocks } from './provider-utils.ts';
import {
  extractTextContent,
  extractToolUseBlocks,
  assertValidMessage
} from '../content-blocks.ts';
import type {
  ContentBlock,
  AssistantMessage,
  NonEmptyArray
} from '../types.ts';
import {
  EmptyProviderResponseError,
  MalformedToolMessageError,
  MissingMessageContentError
} from './errors.ts';
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

      // Messages are in canonical blocks format per ProviderRequest contract
      const v2Messages = request.messages;

      // Convert messages to OpenAI format
      for (let i = 0; i < v2Messages.length; i++) {
        const msg = v2Messages[i];
        // Defensive validation at boundary
        assertValidMessage(msg);
        if (msg.role === 'tool') {
          // Tool messages have text content and tool_call_id
          const textContent = extractTextContent(msg.content);
          if (!msg.tool_call_id) {
            throw new MalformedToolMessageError(
              'Tool message is missing required tool_call_id',
              { index: i }
            );
          }
          if (textContent == null) {
            throw new MalformedToolMessageError(
              'Tool message has no text content',
              { index: i, tool_call_id: msg.tool_call_id }
            );
          }
          messages.push({
            role: 'tool',
            content: textContent,
            tool_call_id: msg.tool_call_id
          });
        } else if (msg.role === 'assistant') {
          // Assistant messages can have text and/or tool-use blocks
          const assistantMessage: OpenAI.ChatCompletionAssistantMessageParam = {
            role: 'assistant'
          };

          // Extract text content
          const textContent = extractTextContent(msg.content);
          if (textContent != null) {
            assistantMessage.content = textContent;
          }

          // Extract and convert tool-use blocks to OpenAI tool_calls
          const toolUseBlocks = extractToolUseBlocks(msg.content);
          if (toolUseBlocks.length > 0) {
            assistantMessage.tool_calls = toolUseBlocks.map(tb => ({
              id: tb.id,
              type: 'function' as const,
              function: {
                name: tb.name,
                arguments: JSON.stringify(tb.parameters)
              }
            }));
          }

          // Throw if neither content nor tool_calls exist - this should not happen
          if (textContent == null && toolUseBlocks.length === 0) {
            throw new Error(
              `Assistant message has neither text content nor tool-use blocks. This indicates a malformed message.`
            );
          }

          messages.push(assistantMessage);
        } else {
          // User messages have text content
          const textContent = extractTextContent(msg.content);
          if (textContent == null) {
            throw new MissingMessageContentError('User', i);
          }
          messages.push({
            role: 'user',
            content: textContent
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

      // Get tool parameters from request
      const { tools, tool_choice } = request;

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
        tools,
        tool_choice: tool_choice,
        stream: false
      } as const;

      this.logger.log('OpenAI request:\n' + JSON.stringify(req, null, 2));
      const response = await openai.chat.completions.create(req);
      this.logger.log('OpenAI response:\n' + JSON.stringify(response, null, 2));

      const choice = response.choices[0];
      const responseMessage = choice.message;

      // Convert OpenAI response to block message format.
      // ORDERING LIMITATION: OpenAI's API returns text content and tool_calls as separate fields,
      // not as an interleaved array. We append text first, then tool-use blocks.
      // This means we cannot preserve the exact interleaving if the model intended
      // text/tool/text ordering. This is a known limitation of the OpenAI API structure.
      // See specs/providers-and-models.md for details.
      const contentBlocks: ContentBlock[] = [];

      // Add text content if present
      if (
        responseMessage.content !== null &&
        responseMessage.content.trim().length > 0
      ) {
        contentBlocks.push({ type: 'text', text: responseMessage.content });
      }

      // Add tool-use blocks if present
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        const toolUseBlocks = toolCallsToToolUseBlocks(
          responseMessage.tool_calls
        );
        contentBlocks.push(...toolUseBlocks);
      }

      // Ensure we have at least one block
      if (contentBlocks.length === 0) {
        throw new EmptyProviderResponseError('OpenAI');
      }

      const v2Message: AssistantMessage = {
        role: 'assistant',
        content: contentBlocks as NonEmptyArray<ContentBlock>
      };

      // Map response to our expected format
      return {
        message: v2Message,
        usage: {
          input_tokens: response.usage?.prompt_tokens,
          output_tokens: response.usage?.completion_tokens,
          raw: response.usage
        },
        finish_reason: choice.finish_reason || null,
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
