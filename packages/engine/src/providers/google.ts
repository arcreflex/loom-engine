import type { Logger } from '../log.ts';
import type { IProvider, ProviderRequest, ProviderResponse } from './types.ts';
import { extractTextContent } from './provider-utils.ts';
import type {
  AssistantMessage,
  Message,
  NonEmptyArray,
  ContentBlock
} from '../types.ts';
import {
  EmptyProviderResponseError,
  MalformedToolMessageError,
  MissingMessageContentError,
  GoogleDuplicateFunctionError
} from './errors.ts';
import type { Content } from '@google/genai';
import { randomUUID } from 'node:crypto';
import {
  createAbortError,
  isAbortError,
  toError,
  throwIfAborted
} from '../errors.ts';

function findToolFunctionName(
  messages: Message[],
  startIndex: number,
  toolCallId: string
): string | undefined {
  for (let i = startIndex - 1; i >= 0; i--) {
    const candidate = messages[i];
    if (candidate.role !== 'assistant') {
      continue;
    }
    for (const block of candidate.content) {
      if (block.type === 'tool-use' && block.id === toolCallId) {
        return block.name;
      }
    }
  }
  return undefined;
}

/**
 * Implements IProvider for Google's Gemini API.
 * Requires the GoogleGenerativeAI SDK: npm install @google/genai
 */
export class GoogleProvider implements IProvider {
  private apiKey: string | undefined;
  private logger: Logger;

  /**
   * Creates a new Google provider.
   *
   * @param apiKey - The Google API key. If not provided, will try to use process.env.GOOGLE_API_KEY
   */
  constructor(logger: Logger, apiKey?: string) {
    // Use provided API key or fall back to environment variable
    this.apiKey = apiKey || process.env.GOOGLE_API_KEY;
    this.logger = logger;
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
    if (!this.apiKey) {
      throw new Error(
        'Google API key is required. Provide it explicitly or set GOOGLE_API_KEY environment variable.'
      );
    }

    try {
      throwIfAborted(signal);
      // Prepare messages, including system message if provided
      const messages: Content[] = [];

      // Messages are V2 per ProviderRequest contract
      const v2Messages = request.messages;

      // Convert V2 messages to Google format
      for (let i = 0; i < v2Messages.length; i++) {
        const msg = v2Messages[i];
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
            const functionName = findToolFunctionName(
              request.messages,
              i,
              msg.tool_call_id
            );
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
          const seenFunctionNames = new Set<string>();

          // Process each content block
          for (const block of msg.content) {
            if (block.type === 'text') {
              parts.push({ text: block.text });
            } else if (block.type === 'tool-use') {
              if (seenFunctionNames.has(block.name)) {
                throw new GoogleDuplicateFunctionError(block.name);
              }
              seenFunctionNames.add(block.name);

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

      const requestBody: Record<string, unknown> = {
        contents: messages,
        generationConfig: {
          temperature,
          maxOutputTokens: max_tokens,
          topP: top_p,
          topK: top_k
        },
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
                      : 'ANY'
              }
            }
          : undefined
      };

      if (request.systemMessage) {
        const systemInstruction: Content = {
          role: 'user',
          parts: [{ text: request.systemMessage }]
        };
        requestBody.systemInstruction = systemInstruction;
      }

      const url = new URL(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          request.model
        )}:generateContent`
      );

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.apiKey) {
        headers['x-goog-api-key'] = this.apiKey;
      }

      this.logger.log(
        'Google request:\n' +
          JSON.stringify({ url: url.toString(), body: requestBody }, null, 2)
      );

      const response = await globalThis.fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal
      });

      if (!response.ok) {
        let message = `Google provider error: HTTP ${response.status}`;
        try {
          const errorPayload = (await response.json()) as {
            error?: { message?: string };
          };
          if (errorPayload?.error?.message) {
            message = `Google provider error: ${errorPayload.error.message}`;
          }
        } catch {
          // Ignore JSON parse errors and fall back to generic message.
        }
        throw new Error(message);
      }

      const json = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<Record<string, unknown>>; role?: string };
          finishReason?: string | null;
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };

      this.logger.log('Google response:\n' + JSON.stringify(json, null, 2));

      // Convert Google response to V2 message format.
      // ORDERING LIMITATION: Google's SDK returns text and functionCalls as separate fields,
      // not as an interleaved array. We append text first, then tool-use blocks.
      // This means we cannot preserve the exact interleaving if the model intended
      // text/tool/text ordering. This is a known limitation of the Google SDK structure.
      // See specs/providers-and-models.md for details.
      throwIfAborted(signal);

      const firstCandidate = json.candidates?.[0];
      const parts = Array.isArray(firstCandidate?.content?.parts)
        ? (firstCandidate?.content?.parts as Array<Record<string, unknown>>)
        : [];

      const contentBlocks: ContentBlock[] = [];

      for (const part of parts) {
        const text = typeof part.text === 'string' ? part.text : undefined;
        if (text && text.trim().length > 0) {
          contentBlocks.push({ type: 'text', text });
          continue;
        }

        const functionCall = part.functionCall as
          | { id?: string; name?: string; args?: Record<string, unknown> }
          | undefined;
        if (functionCall) {
          contentBlocks.push({
            type: 'tool-use',
            id: functionCall.id || `google-tool-${randomUUID()}`,
            name: functionCall.name ?? '',
            parameters: (functionCall.args ?? {}) as Record<string, unknown>
          });
        }
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
          input_tokens: json.usageMetadata?.promptTokenCount,
          output_tokens: json.usageMetadata?.candidatesTokenCount,
          raw: json.usageMetadata
        },
        finish_reason: firstCandidate?.finishReason ?? null,
        rawResponse: json
      };
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        throw createAbortError(signal?.reason ?? error);
      }

      const err = toError(error);
      console.error('Google API error:', err);
      throw new Error(`Google provider error: ${err.message}`);
    }
  }
}
