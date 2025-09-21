import type { Logger } from '../log.ts';
import { KNOWN_MODELS } from './known-models.ts';
import type { IProvider, ProviderRequest, ProviderResponse } from './types.ts';
import { extractTextContent, assertValidMessage } from '../content-blocks.ts';
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
import Anthropic from '@anthropic-ai/sdk';
import {
  createAbortError,
  isAbortError,
  throwIfAborted
} from './provider-utils.ts';

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
  async generate(
    request: ProviderRequest,
    signal?: AbortSignal
  ): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key is required. Provide it explicitly or set ANTHROPIC_API_KEY environment variable.'
      );
    }

    throwIfAborted(signal);

    try {
      const anthropic = new Anthropic({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
        timeout: 10 * 60 * 1000 // see https://github.com/anthropics/anthropic-sdk-typescript?tab=readme-ov-file#long-requests
      });

      // Messages are in canonical blocks format per ProviderRequest contract
      const v2Messages = request.messages;

      // Convert messages to Anthropic format
      const anthropicMessages: Anthropic.MessageParam[] = [];
      for (let i = 0; i < v2Messages.length; i++) {
        const msg = v2Messages[i];
        // Defensive validation at boundary
        assertValidMessage(msg);

        if (msg.role === 'tool') {
          // For tool messages, create a user message with tool result content
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
          anthropicMessages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: msg.tool_call_id,
                content: textContent
              }
            ]
          });
          continue;
        }

        if (msg.role === 'assistant') {
          // Handle assistant messages with ContentBlocks
          const content: Anthropic.MessageParam['content'] = [];

          // Process each content block
          const blocks = msg.content;
          for (let j = 0; j < blocks.length; j++) {
            const block = blocks[j];
            if (block.type === 'text') {
              let text = block.text;
              // Only trim trailing whitespace from the last text block of the last message
              const isLastMessage = i === v2Messages.length - 1;
              const isLastTextBlock =
                j === blocks.length - 1 ||
                blocks.slice(j + 1).every(b => b.type !== 'text');
              if (isLastMessage && isLastTextBlock) {
                text = text.replace(/[\s\n]+$/, '');
              }
              content.push({ type: 'text', text });
            } else if (block.type === 'tool-use') {
              content.push({
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: block.parameters
              });
            }
          }

          if (content.length > 0) {
            anthropicMessages.push({
              role: 'assistant',
              content
            });
          }
        } else if (msg.role === 'user') {
          // User messages have text content
          const textContent = extractTextContent(msg.content);
          if (textContent == null) {
            throw new MissingMessageContentError('User', i);
          }

          let content = textContent;
          if (i === v2Messages.length - 1) {
            // last message isn't allowed to end with whitespace
            content = content.replace(/[\s\n]+$/, '');
          }

          anthropicMessages.push({
            role: 'user',
            content
          });
        }
      }

      // Extract specific parameters for Anthropic, with defaults
      const {
        temperature = 1.0,
        max_tokens = 1024,
        top_p,
        top_k,
        stop_sequences
      } = request.parameters;

      // Get tool parameters from request
      const { tools, tool_choice } = request;

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
      const req: Anthropic.MessageCreateParamsNonStreaming = {
        model: request.model,
        messages: anthropicMessages,
        temperature,
        max_tokens: adjusted_max_tokens,
        top_p,
        top_k,
        stop_sequences,
        tools: tools?.map(tool => ({
          type: 'custom',
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters
        })),
        tool_choice:
          tool_choice === 'auto'
            ? ({ type: 'auto' } as Anthropic.ToolChoice)
            : tool_choice === 'none'
              ? ({ type: 'none' } as Anthropic.ToolChoice)
              : tool_choice
                ? ({
                    type: 'tool',
                    name: tool_choice.function.name
                  } as Anthropic.ToolChoice)
                : undefined,
        stream: false,
        system: request.systemMessage
      };

      this.logger.log('Anthropic request:\n' + JSON.stringify(req, null, 2));

      const response = await anthropic.messages.create(req, { signal });

      this.logger.log(
        'Anthropic response:\n' + JSON.stringify(response, null, 2)
      );

      // Convert Anthropic response to block message format preserving order
      const contentBlocks: ContentBlock[] = [];

      // Process response content blocks in order
      for (const block of response.content) {
        if (block.type === 'text') {
          contentBlocks.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          contentBlocks.push({
            type: 'tool-use',
            id: block.id,
            name: block.name,
            parameters: block.input as Record<string, unknown>
          });
        }
      }

      // Ensure we have at least one block
      if (contentBlocks.length === 0) {
        throw new EmptyProviderResponseError('Anthropic');
      }

      // Return assistant message with content blocks in original order
      const v2Message: AssistantMessage = {
        role: 'assistant',
        content: contentBlocks as NonEmptyArray<ContentBlock>
      };

      // Map response to our expected format
      return {
        message: v2Message,
        usage: {
          input_tokens: response.usage?.input_tokens,
          output_tokens: response.usage?.output_tokens,
          raw: response.usage
        },
        finish_reason: response.stop_reason || null,
        rawResponse: response
      };
    } catch (error) {
      if (signal?.aborted) {
        throw createAbortError(signal.reason);
      }
      if (isAbortError(error)) {
        throw error;
      }
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
