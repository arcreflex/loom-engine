import type { Logger } from '../log.ts';
import type { IProvider, ProviderRequest, ProviderResponse } from './types.ts';
import { GoogleGenAI, type Content } from '@google/genai';

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
  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Google API key is required. Provide it explicitly or set GOOGLE_API_KEY environment variable.'
      );
    }

    try {
      // Prepare messages, including system message if provided
      const messages: Content[] = [];

      // Add conversation history
      for (const msg of request.messages) {
        if (msg.role === 'tool') {
          // For tool messages, create a model message with function response
          if (msg.content != null && msg.tool_call_id) {
            messages.push({
              role: 'model',
              parts: [
                {
                  functionResponse: {
                    name: msg.tool_call_id, // Use tool_call_id as function name reference
                    response: JSON.parse(msg.content)
                  }
                }
              ]
            });
          }
          continue;
        }

        if (msg.role === 'assistant') {
          // Handle assistant messages with tool calls
          const parts: Content['parts'] = [];

          if (msg.content != null) {
            parts.push({ text: msg.content });
          }

          if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              parts.push({
                functionCall: {
                  name: tc.function.name,
                  args: JSON.parse(tc.function.arguments)
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
          // Skip messages with null content
          if (msg.content == null) {
            continue;
          }

          messages.push({
            role: 'user',
            parts: [{ text: msg.content }]
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

      // Extract text and function calls from response
      const textContent = response.text;
      const functionCalls = response.functionCalls?.map(fc => ({
        id: fc.id || '',
        type: 'function' as const,
        function: {
          name: fc.name || '', // Ensure name is not undefined
          arguments: JSON.stringify(fc.args)
        }
      }));

      return {
        message: {
          role: 'assistant',
          content: textContent || null,
          tool_calls: functionCalls?.length ? functionCalls : undefined
        },
        usage: {
          input_tokens: response.usageMetadata?.promptTokenCount,
          output_tokens: response.usageMetadata?.candidatesTokenCount,
          raw: response.usageMetadata
        },
        rawResponse: response
      };
    } catch (error) {
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
