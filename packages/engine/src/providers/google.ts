import type { Logger } from '../log.ts';
import type { IProvider, ProviderRequest, ProviderResponse } from './types.ts';
import { extractTextContent, assertValidMessage } from '../content-blocks.ts';
import type {
  ToolUseBlock,
  AssistantMessage,
  NonEmptyArray,
  ContentBlock
} from '../types.ts';
import {
  EmptyProviderResponseError,
  MalformedToolMessageError,
  MissingMessageContentError,
  GoogleDuplicateFunctionError
} from './errors.ts';
import { GoogleGenAI, type Content } from '@google/genai';
import { randomUUID } from 'node:crypto';

/**
 * Implements IProvider for Google's Gemini API.
 * Requires the GoogleGenerativeAI SDK: npm install @google/genai
 */
export class GoogleProvider implements IProvider {
  private apiKey: string | undefined;
  private logger: Logger;

  private ai: GoogleGenAI;

  /**
   * Creates a new Google provider.
   *
   * @param apiKey - The Google API key. If not provided, will try to use process.env.GOOGLE_API_KEY
   */
  constructor(logger: Logger, apiKey?: string) {
    // Use provided API key or fall back to environment variable
    this.apiKey = apiKey || process.env.GOOGLE_API_KEY;
    this.logger = logger;
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  /**
   * Generates a completion from Google's Gemini API.
   *
   * @param request - The request parameters
   * @returns A Promise resolving to the provider's response
   */
  async generate(
    request: ProviderRequest,
    signal?: AbortSignal
  ): Promise<ProviderResponse> {
    // Map to track tool-use ID to function name for tool results
    const toolIdToName = new Map<string, string>();
    // Track function names to detect collisions
    const functionNameCounts = new Map<string, number>();

    if (!this.apiKey) {
      throw new Error(
        'Google API key is required. Provide it explicitly or set GOOGLE_API_KEY environment variable.'
      );
    }

    try {
      if (signal?.aborted) {
        const reason =
          signal.reason instanceof Error
            ? signal.reason
            : new Error('Google request aborted');
        throw reason;
      }

      // Prepare messages, including system message if provided
      const messages: Content[] = [];

      // Messages are in canonical blocks format per ProviderRequest contract
      const v2Messages = request.messages;

      // Convert messages to Google format
      for (let i = 0; i < v2Messages.length; i++) {
        const msg = v2Messages[i];
        // Defensive validation at boundary
        assertValidMessage(msg);
        if (msg.role === 'tool') {
          // For tool messages, create a model message with function response
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
          if (textContent != null && msg.tool_call_id) {
            // Look up the original function name from the tool call ID
            const functionName = toolIdToName.get(msg.tool_call_id);
            if (!functionName) {
              throw new MalformedToolMessageError(
                `No function name found for tool_call_id. Ensure the assistant's tool-use block with this ID appeared earlier in the conversation.`,
                { tool_call_id: msg.tool_call_id }
              );
            }

            // Google Gemini API expects functionResponse.response to be an object.
            // Since our tools return strings, we wrap the string result in an object
            // with a 'result' key. This is a standard mapping that preserves the
            // tool's string output while conforming to Google's API requirements.
            //
            // IMPORTANT: Function responses are sent with role 'user' in Google's model,
            // as they represent the user-side providing results back to the model.
            const responsePayload = { result: textContent };

            messages.push({
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name: functionName,
                    response: responsePayload
                  }
                }
              ]
            });
          }
          continue;
        }

        if (msg.role === 'assistant') {
          // Handle assistant messages with ContentBlocks
          const parts: Content['parts'] = [];

          // Reset function name counts for this message
          functionNameCounts.clear();

          // Process each content block
          for (const block of msg.content) {
            if (block.type === 'text') {
              parts.push({ text: block.text });
            } else if (block.type === 'tool-use') {
              // Track the mapping from tool ID to function name
              toolIdToName.set(block.id, block.name);

              // Detect function name collisions - Google's API doesn't preserve tool call IDs
              // so we can't disambiguate multiple calls to the same function
              const count = functionNameCounts.get(block.name) || 0;
              functionNameCounts.set(block.name, count + 1);
              if (count > 0) {
                throw new GoogleDuplicateFunctionError(block.name);
              }

              parts.push({
                functionCall: {
                  name: block.name,
                  args: block.parameters
                }
              });
            }
          }

          if (parts.length > 0) {
            messages.push({
              role: 'model',
              parts
            });
          }
        } else if (msg.role === 'user') {
          // User messages have text content
          const textContent = extractTextContent(msg.content);
          if (textContent == null) {
            throw new MissingMessageContentError('User', i);
          }

          messages.push({
            role: 'user',
            parts: [{ text: textContent }]
          });
        }
      }

      // Extract specific parameters for Gemini
      const {
        temperature = 1.0,
        max_tokens = 1024,
        top_p,
        top_k
      } = request.parameters;

      // Get tool parameters from request
      const { tools, tool_choice } = request;

      if (top_p !== undefined && typeof top_p !== 'number') {
        throw new Error('top_p must be a number');
      }
      if (top_k !== undefined && typeof top_k !== 'number') {
        throw new Error('top_k must be a number');
      }

      const req = {
        model: request.model,
        contents: messages,
        config: {
          temperature,
          maxOutputTokens: max_tokens,
          topP: top_p,
          topK: top_k,
          systemInstruction: request.systemMessage
        },
        // Google uses 'tools' and 'toolConfig' for tool configuration
        tools: tools?.map(tool => ({
          functionDeclarations: [tool.function]
        })),
        toolConfig: tool_choice
          ? {
              functionCallingConfig: {
                mode:
                  tool_choice === 'auto'
                    ? 'AUTO'
                    : tool_choice === 'none'
                      ? 'NONE'
                      : 'ANY' // For specific tool selection
              }
            }
          : undefined
      };
      this.logger.log('Google request:\n' + JSON.stringify(req, null, 2));
      const response = await this.ai.models.generateContent(req);
      this.logger.log('Google response:\n' + JSON.stringify(response, null, 2));

      // Convert Google response to block message format.
      // ORDERING LIMITATION: Google's SDK returns text and functionCalls as separate fields,
      // not as an interleaved array. We append text first, then tool-use blocks.
      // This means we cannot preserve the exact interleaving if the model intended
      // text/tool/text ordering. This is a known limitation of the Google SDK structure.
      // See specs/providers-and-models.md for details.
      const toolUseBlocks: ToolUseBlock[] | undefined =
        response.functionCalls?.map(fc => ({
          type: 'tool-use' as const,
          // Generate deterministic ID if not provided using crypto.randomUUID
          id: fc.id || `google-tool-${randomUUID()}`,
          name: fc.name || '',
          parameters: fc.args as Record<string, unknown>
        }));

      // Build content blocks with available ordering information
      const contentBlocks: ContentBlock[] = [];

      // Add text content if present
      if (response.text && response.text.trim().length > 0) {
        contentBlocks.push({ type: 'text', text: response.text });
      }

      // Add tool-use blocks if present
      if (toolUseBlocks && toolUseBlocks.length > 0) {
        contentBlocks.push(...toolUseBlocks);
      }

      // Ensure we have at least one block
      if (contentBlocks.length === 0) {
        throw new EmptyProviderResponseError('Google');
      }

      const v2Message: AssistantMessage = {
        role: 'assistant',
        content: contentBlocks as NonEmptyArray<ContentBlock>
      };

      return {
        message: v2Message,
        usage: {
          input_tokens: response.usageMetadata?.promptTokenCount,
          output_tokens: response.usageMetadata?.candidatesTokenCount,
          raw: response.usageMetadata
        },
        rawResponse: response
      };
    } catch (error) {
      if (signal?.aborted) {
        const reason =
          signal.reason instanceof Error
            ? signal.reason
            : new Error('Google request aborted');
        throw reason;
      }
      // Handle API errors
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error occurred when calling Google API';

      console.error('Google API error:', error);
      throw new Error(`Google provider error: ${errorMessage}`);
    }
  }
}
